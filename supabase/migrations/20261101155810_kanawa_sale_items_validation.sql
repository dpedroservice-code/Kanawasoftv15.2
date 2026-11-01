create or replace function public.ks_finalize_sale(p_company_id uuid, p_sale jsonb, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_external_id text := nullif(p_sale ->> 'external_id','');
  v_invoice text := nullif(p_sale ->> 'invoice_number','');
  v_subtotal numeric(18,2) := coalesce((p_sale ->> 'subtotal')::numeric,0);
  v_discount numeric(18,2) := coalesce((p_sale ->> 'discount_value')::numeric,0);
  v_tax numeric(18,2) := coalesce((p_sale ->> 'tax_amount')::numeric,0);
  v_total numeric(18,2) := coalesce((p_sale ->> 'total')::numeric,0);
  v_received numeric(18,2) := coalesce((p_sale ->> 'amount_received')::numeric,0);
  v_change numeric(18,2) := coalesce((p_sale ->> 'change_amount')::numeric,0);
  v_method text := coalesce(nullif(p_sale ->> 'payment_method',''),'não indicado');
  v_item jsonb; v_product_id text; v_product_name text; v_qty numeric(18,3); v_price numeric(18,2);
  v_line_total numeric(18,2); v_line integer := 0; v_rows integer; v_stock_tracked boolean;
begin
  if auth.uid() is null or not private.ks_has_company_role(p_company_id, array['owner','admin','manager','operator','cashier']::text[]) then
    raise exception 'Acesso negado para finalizar venda.' using errcode = '42501';
  end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then raise exception 'Dados da venda inválidos.' using errcode = '22023'; end if;
  if v_external_id is null or v_invoice is null then raise exception 'Identificador e número da factura obrigatórios.' using errcode = '22023'; end if;
  if v_total <= 0 or v_subtotal < 0 or v_discount < 0 or v_discount > v_subtotal or v_tax < 0 or v_received < 0 or v_change < 0 then
    raise exception 'Valores da venda inválidos.' using errcode = '23514';
  end if;
  if coalesce(p_sale ->> 'status','finalizada') <> 'finalizada' then raise exception 'Só vendas finalizadas podem ser lançadas.' using errcode = '23514'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A venda precisa de pelo menos um artigo.' using errcode = '22023';
  end if;
  if v_received <= 0 and lower(v_method) not in ('credito','crédito','credit') then v_received := v_total; end if;
  insert into public.ks_sales(company_id,external_id,invoice_number,customer_name,customer_tax_id,customer_phone,subtotal,discount_value,tax_amount,total,amount_received,change_amount,payment_method,tax_regime,status,notes,operator_name,sold_at,created_by,source_payload)
  values(p_company_id,v_external_id,v_invoice,nullif(p_sale->>'customer_name',''),nullif(p_sale->>'customer_tax_id',''),nullif(p_sale->>'customer_phone',''),v_subtotal,v_discount,v_tax,v_total,v_received,v_change,v_method,nullif(p_sale->>'tax_regime',''),'finalizada',nullif(p_sale->>'notes',''),nullif(p_sale->>'operator_name',''),coalesce(nullif(p_sale->>'sold_at','')::timestamptz,now()),auth.uid(),p_sale)
  on conflict(company_id,external_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('ok',true,'duplicate',true,'external_id',v_external_id); end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_line:=v_line+1; v_product_id:=nullif(v_item->>'product_external_id','');
    v_product_name:=coalesce(nullif(trim(v_item->>'product_name'),''),'Artigo');
    v_qty:=coalesce((v_item->>'quantity')::numeric,0); v_price:=coalesce((v_item->>'unit_price')::numeric,0);
    v_line_total:=coalesce((v_item->>'line_total')::numeric,round(v_qty*v_price,2));
    v_stock_tracked:=coalesce((v_item->>'stock_tracked')::boolean,true);
    if v_qty<=0 or v_price<0 or v_line_total<0 then raise exception 'Linha de venda inválida.' using errcode='23514'; end if;
    if v_stock_tracked then
      update public.ks_products set stock_quantity=stock_quantity-v_qty,updated_at=now()
      where company_id=p_company_id and external_id=v_product_id and is_active=true and stock_quantity>=v_qty;
      if not found then raise exception 'Stock insuficiente ou produto ainda não sincronizado: %',v_product_id using errcode='23514'; end if;
    end if;
    insert into public.ks_sale_items(company_id,sale_external_id,line_number,product_external_id,product_name,unit_price,quantity,line_total,stock_tracked)
    values(p_company_id,v_external_id,v_line,v_product_id,v_product_name,v_price,v_qty,v_line_total,v_stock_tracked);
    if v_stock_tracked then
      insert into public.ks_stock_movements(company_id,external_id,product_external_id,sale_external_id,movement_type,quantity,reason,created_by)
      values(p_company_id,v_external_id||':sale:'||v_line::text,v_product_id,v_external_id,'sale',v_qty,'Venda '||v_invoice,auth.uid());
    end if;
  end loop;
  if v_received>0 then
    insert into public.ks_payments(company_id,external_id,sale_external_id,amount,method,status,created_by)
    values(p_company_id,v_external_id||':payment:1',v_external_id,v_received,v_method,'received',auth.uid());
  end if;
  return jsonb_build_object('ok',true,'duplicate',false,'external_id',v_external_id,'total',v_total);
end;
$$;