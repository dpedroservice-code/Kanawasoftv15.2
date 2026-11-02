-- Fix POS payment normalization and enforce cent-accurate sale totals.
-- Apply this migration to the Supabase project after validating it in a preview database.
CREATE OR REPLACE FUNCTION public.ks_finalize_sale(p_company_id uuid, p_sale jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_external_id text := nullif(p_sale->>'external_id','');
  v_invoice text := nullif(p_sale->>'invoice_number','');
  v_subtotal numeric(18,2) := coalesce((p_sale->>'subtotal')::numeric,0);
  v_discount numeric(18,2) := coalesce((p_sale->>'discount_value')::numeric,0);
  v_tax numeric(18,2) := coalesce((p_sale->>'tax_amount')::numeric,0);
  v_total numeric(18,2) := coalesce((p_sale->>'total')::numeric,0);
  v_received numeric(18,2) := coalesce((p_sale->>'amount_received')::numeric,0);
  v_change numeric(18,2) := coalesce((p_sale->>'change_amount')::numeric,0);
  v_method text := coalesce(nullif(p_sale->>'payment_method',''),'não indicado');
  v_item jsonb;
  v_product_id text;
  v_product_name text;
  v_qty numeric(18,3);
  v_price numeric(18,2);
  v_line_total numeric(18,2);
  v_items_subtotal numeric(18,2) := 0;
  v_line integer := 0;
  v_rows integer;
  v_stock_tracked boolean;
  v_currency text;
  v_fx numeric(24,10);
  v_usd numeric(18,2);
  v_is_credit boolean := lower(v_method) IN ('credito','crédito','credit');
  v_role text;
  v_discount_max numeric(5,2) := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.ks_has_company_permission(p_company_id,'pdv','criar')
    OR private.ks_has_company_permission(p_company_id,'vendas','criar')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para finalizar vendas.' USING ERRCODE='42501';
  END IF;
  SELECT m.role INTO v_role
  FROM public.ks_company_memberships m
  WHERE m.company_id=p_company_id AND m.user_id=auth.uid() AND m.status='active';
  v_discount_max := CASE v_role
    WHEN 'owner' THEN 100 WHEN 'admin' THEN 100
    WHEN 'manager' THEN 30 WHEN 'operator' THEN 10 WHEN 'cashier' THEN 5
    ELSE 0
  END;

  IF p_sale IS NULL OR jsonb_typeof(p_sale)<>'object' OR v_external_id IS NULL OR v_invoice IS NULL THEN
    RAISE EXCEPTION 'Dados e número da factura obrigatórios.' USING ERRCODE='22023';
  END IF;
  IF coalesce(p_sale->>'status','finalizada')<>'finalizada' THEN
    RAISE EXCEPTION 'Só vendas finalizadas podem ser lançadas.' USING ERRCODE='23514';
  END IF;
  IF v_received < 0 THEN
    RAISE EXCEPTION 'O valor recebido não pode ser negativo.' USING ERRCODE='23514';
  END IF;
  -- A blank received field means exact payment for non-credit methods.
  -- Compute change on the server instead of trusting a stale/negative UI value.
  IF v_received = 0 AND NOT v_is_credit THEN
    v_received := v_total;
  END IF;
  IF NOT v_is_credit AND v_received < v_total THEN
    RAISE EXCEPTION 'Pagamento insuficiente.' USING ERRCODE='23514';
  END IF;
  v_change := greatest(v_received - v_total, 0);

  IF v_total<=0 OR v_subtotal<=0 OR v_discount<0 OR v_discount>v_subtotal OR v_tax<0 OR
     v_discount>round(v_subtotal*v_discount_max/100,2) OR
     round(v_subtotal-v_discount+v_tax,2)<>v_total THEN
    RAISE EXCEPTION 'Valores da venda inválidos ou desconto acima do limite do perfil.' USING ERRCODE='23514';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'A venda precisa de pelo menos um artigo.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.ks_sales(
    company_id,external_id,invoice_number,customer_name,customer_tax_id,customer_phone,
    subtotal,discount_value,tax_amount,total,amount_received,change_amount,payment_method,
    tax_regime,status,notes,operator_name,sold_at,created_by,source_payload
  )
  VALUES (
    p_company_id,v_external_id,v_invoice,
    nullif(p_sale->>'customer_name',''),nullif(p_sale->>'customer_tax_id',''),
    nullif(p_sale->>'customer_phone',''),v_subtotal,v_discount,v_tax,v_total,
    v_received,v_change,v_method,nullif(p_sale->>'tax_regime',''),'finalizada',
    nullif(p_sale->>'notes',''),nullif(p_sale->>'operator_name',''),
    coalesce(nullif(p_sale->>'sold_at','')::timestamptz,now()),auth.uid(),
    p_sale || jsonb_build_object('amount_received',v_received,'change_amount',v_change)
  )
  ON CONFLICT(company_id,external_id) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows=0 THEN
    RETURN jsonb_build_object('ok',true,'duplicate',true,'external_id',v_external_id);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line:=v_line+1;
    v_product_id:=nullif(v_item->>'product_external_id','');
    v_product_name:=coalesce(nullif(trim(v_item->>'product_name'),''),'Artigo');
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    v_price:=coalesce((v_item->>'unit_price')::numeric,0);
    v_line_total:=coalesce((v_item->>'line_total')::numeric,round(v_qty*v_price,2));
    v_stock_tracked:=coalesce((v_item->>'stock_tracked')::boolean,true);
    IF v_product_id IS NULL OR v_qty<=0 OR v_price<0 OR v_line_total<0 OR
       abs(v_line_total-round(v_qty*v_price,2))>0.01 THEN
      RAISE EXCEPTION 'Linha de venda inválida.' USING ERRCODE='23514';
    END IF;
    v_items_subtotal:=v_items_subtotal+v_line_total;
    IF v_stock_tracked THEN
      PERFORM private.ks_decrement_stock_for_sale(p_company_id,v_product_id,v_qty);
    END IF;
    INSERT INTO public.ks_sale_items(
      company_id,sale_external_id,line_number,product_external_id,product_name,
      unit_price,quantity,line_total,stock_tracked
    )
    VALUES(p_company_id,v_external_id,v_line,v_product_id,v_product_name,v_price,v_qty,v_line_total,v_stock_tracked);

    IF v_stock_tracked THEN
      INSERT INTO public.ks_stock_movements(
        company_id,external_id,product_external_id,sale_external_id,movement_type,quantity,reason,created_by
      )
      VALUES(p_company_id,v_external_id||':sale:'||v_line::text,v_product_id,v_external_id,'sale',v_qty,'Venda '||v_invoice,auth.uid());
    END IF;
  END LOOP;

  IF abs(round(v_items_subtotal,2)-v_subtotal)>0.01 THEN
    RAISE EXCEPTION 'O subtotal não corresponde à soma dos artigos.' USING ERRCODE='23514';
  END IF;

  IF v_received>0 THEN
    INSERT INTO public.ks_payments(company_id,external_id,sale_external_id,amount,method,status,created_by)
    VALUES(p_company_id,v_external_id||':payment:1',v_external_id,v_received,v_method,'received',auth.uid());
  END IF;

  SELECT currency_code INTO v_currency FROM public.ks_companies WHERE id=p_company_id;
  IF v_currency='USD' THEN
    v_usd:=v_total;
  ELSE
    SELECT rate INTO v_fx FROM public.ks_exchange_rates
    WHERE company_id=p_company_id AND base_currency=v_currency AND quote_currency='USD'
    ORDER BY observed_at DESC LIMIT 1;
    IF v_fx IS NOT NULL THEN v_usd:=round(v_total*v_fx,2); END IF;
  END IF;

  INSERT INTO public.ks_usage_events(
    company_id,event_type,quantity,amount_usd,amount_local,currency_code,reference_id,created_by
  )
  VALUES(p_company_id,'invoice_finalized',1,v_usd,v_total,v_currency,v_external_id,auth.uid());

  RETURN jsonb_build_object('ok',true,'duplicate',false,'external_id',v_external_id,'total',v_total);
END;
$function$;
