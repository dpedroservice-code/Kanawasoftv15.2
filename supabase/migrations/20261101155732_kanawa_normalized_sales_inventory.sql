-- Normalized core tables for products, customers, sales, sale lines, stock movements and payments.
create table if not exists public.ks_products (
 company_id uuid not null references public.ks_companies(id) on delete cascade,
 external_id text not null, sku text, name text not null, category text, unit text not null default 'UN',
 unit_price numeric(18,2) not null default 0 check(unit_price>=0),
 stock_quantity numeric(18,3) not null default 0 check(stock_quantity>=0),
 min_stock numeric(18,3) not null default 0 check(min_stock>=0),
 description text, image_path text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(company_id,external_id)
);
create table if not exists public.ks_customers (
 company_id uuid not null references public.ks_companies(id) on delete cascade,
 external_id text not null, name text not null, tax_id text, phone text, email text, address text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(company_id,external_id)
);
create table if not exists public.ks_sales (
 company_id uuid not null references public.ks_companies(id) on delete cascade,
 external_id text not null, invoice_number text not null, customer_name text, customer_tax_id text, customer_phone text,
 subtotal numeric(18,2) not null check(subtotal>=0), discount_value numeric(18,2) not null default 0 check(discount_value>=0),
 tax_amount numeric(18,2) not null default 0 check(tax_amount>=0), total numeric(18,2) not null check(total>=0),
 amount_received numeric(18,2) not null default 0 check(amount_received>=0), change_amount numeric(18,2) not null default 0 check(change_amount>=0),
 payment_method text, tax_regime text, status text not null default 'finalizada', notes text, operator_name text,
 sold_at timestamptz not null default now(), created_by uuid references auth.users(id), source_payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(company_id,external_id), unique(company_id,invoice_number)
);
create table if not exists public.ks_sale_items (
 company_id uuid not null, sale_external_id text not null, line_number integer not null check(line_number>0),
 product_external_id text, product_name text not null, unit_price numeric(18,2) not null check(unit_price>=0),
 quantity numeric(18,3) not null check(quantity>0), line_total numeric(18,2) not null check(line_total>=0),
 stock_tracked boolean not null default true, primary key(company_id,sale_external_id,line_number),
 foreign key(company_id,sale_external_id) references public.ks_sales(company_id,external_id) on delete cascade,
 foreign key(company_id,product_external_id) references public.ks_products(company_id,external_id)
);
create table if not exists public.ks_stock_movements (
 company_id uuid not null, external_id text not null, product_external_id text not null, sale_external_id text,
 movement_type text not null check(movement_type in ('sale','purchase','adjustment','return')),
 quantity numeric(18,3) not null check(quantity>0), reason text, occurred_at timestamptz not null default now(),
 created_by uuid references auth.users(id), primary key(company_id,external_id),
 foreign key(company_id,product_external_id) references public.ks_products(company_id,external_id),
 foreign key(company_id,sale_external_id) references public.ks_sales(company_id,external_id)
);
create table if not exists public.ks_payments (
 company_id uuid not null, external_id text not null, sale_external_id text not null,
 amount numeric(18,2) not null check(amount>0), method text not null,
 status text not null default 'received' check(status in ('received','pending','refunded')),
 reference text, paid_at timestamptz not null default now(), created_by uuid references auth.users(id),
 primary key(company_id,external_id),
 foreign key(company_id,sale_external_id) references public.ks_sales(company_id,external_id) on delete cascade
);
create index if not exists ks_products_company_sku_idx on public.ks_products(company_id,sku);
create index if not exists ks_customers_company_name_idx on public.ks_customers(company_id,name);
create index if not exists ks_sales_company_sold_at_idx on public.ks_sales(company_id,sold_at desc);
create index if not exists ks_sale_items_company_product_idx on public.ks_sale_items(company_id,product_external_id);
create index if not exists ks_stock_movements_company_product_idx on public.ks_stock_movements(company_id,product_external_id,occurred_at desc);
create index if not exists ks_payments_company_sale_idx on public.ks_payments(company_id,sale_external_id);

alter table public.ks_products enable row level security;
alter table public.ks_customers enable row level security;
alter table public.ks_sales enable row level security;
alter table public.ks_sale_items enable row level security;
alter table public.ks_stock_movements enable row level security;
alter table public.ks_payments enable row level security;

create policy ks_products_read on public.ks_products for select to authenticated using(private.ks_is_company_member(company_id));
create policy ks_customers_read on public.ks_customers for select to authenticated using(private.ks_is_company_member(company_id));
create policy ks_customers_write on public.ks_customers for all to authenticated
 using(private.ks_has_company_role(company_id,array['owner','admin','manager','operator','cashier','accountant']::text[]))
 with check(private.ks_has_company_role(company_id,array['owner','admin','manager','operator','cashier','accountant']::text[]));
create policy ks_sales_read on public.ks_sales for select to authenticated using(private.ks_is_company_member(company_id));
create policy ks_sale_items_read on public.ks_sale_items for select to authenticated using(private.ks_is_company_member(company_id));
create policy ks_stock_movements_read on public.ks_stock_movements for select to authenticated using(private.ks_is_company_member(company_id));
create policy ks_payments_read on public.ks_payments for select to authenticated using(private.ks_is_company_member(company_id));

revoke all on table public.ks_products,public.ks_customers,public.ks_sales,public.ks_sale_items,public.ks_stock_movements,public.ks_payments from anon,authenticated;
grant usage on schema public to authenticated;
grant select on table public.ks_products,public.ks_sales,public.ks_sale_items,public.ks_stock_movements,public.ks_payments to authenticated;
grant select,insert,update,delete on table public.ks_customers to authenticated;

create or replace function public.ks_sync_product(p_company_id uuid,p_product jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
 v_external_id text := nullif(p_product->>'external_id','');
 v_name text := coalesce(nullif(trim(p_product->>'name'),''),'Produto');
 v_price numeric(18,2) := greatest(0,coalesce((p_product->>'unit_price')::numeric,0));
 v_stock numeric(18,3) := greatest(0,coalesce((p_product->>'stock_quantity')::numeric,0));
 v_min_stock numeric(18,3) := greatest(0,coalesce((p_product->>'min_stock')::numeric,0));
begin
 if auth.uid() is null or not private.ks_has_company_role(p_company_id,array['owner','admin','manager','operator','cashier','accountant']::text[]) then
  raise exception 'Acesso negado para sincronizar produto.' using errcode='42501';
 end if;
 if v_external_id is null then raise exception 'Identificador externo do produto obrigatório.' using errcode='22023'; end if;
 insert into public.ks_products(company_id,external_id,sku,name,category,unit,unit_price,stock_quantity,min_stock,description,image_path,is_active)
 values(p_company_id,v_external_id,nullif(p_product->>'sku',''),v_name,nullif(p_product->>'category',''),coalesce(nullif(p_product->>'unit',''),'UN'),
  v_price,v_stock,v_min_stock,nullif(p_product->>'description',''),nullif(p_product->>'image_path',''),coalesce((p_product->>'is_active')::boolean,true))
 on conflict(company_id,external_id) do update set sku=excluded.sku,name=excluded.name,category=excluded.category,unit=excluded.unit,
  unit_price=excluded.unit_price,min_stock=excluded.min_stock,description=excluded.description,image_path=excluded.image_path,
  is_active=excluded.is_active,updated_at=now();
end;
$$;

create or replace function public.ks_finalize_sale(p_company_id uuid,p_sale jsonb,p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_external_id text := nullif(p_sale->>'external_id',''); v_invoice text := nullif(p_sale->>'invoice_number','');
 v_subtotal numeric(18,2) := coalesce((p_sale->>'subtotal')::numeric,0);
 v_discount numeric(18,2) := coalesce((p_sale->>'discount_value')::numeric,0);
 v_tax numeric(18,2) := coalesce((p_sale->>'tax_amount')::numeric,0);
 v_total numeric(18,2) := coalesce((p_sale->>'total')::numeric,0);
 v_received numeric(18,2) := coalesce((p_sale->>'amount_received')::numeric,0);
 v_change numeric(18,2) := coalesce((p_sale->>'change_amount')::numeric,0);
 v_method text := coalesce(nullif(p_sale->>'payment_method',''),'não indicado');
 v_item jsonb; v_product_id text; v_product_name text; v_qty numeric(18,3); v_price numeric(18,2);
 v_line_total numeric(18,2); v_line integer := 0; v_rows integer; v_stock_tracked boolean;
begin
 if auth.uid() is null or not private.ks_has_company_role(p_company_id,array['owner','admin','manager','operator','cashier']::text[]) then
  raise exception 'Acesso negado para finalizar venda.' using errcode='42501';
 end if;
 if p_sale is null or jsonb_typeof(p_sale)<>'object' then raise exception 'Dados da venda inválidos.' using errcode='22023'; end if;
 if v_external_id is null or v_invoice is null then raise exception 'Identificador e número da factura obrigatórios.' using errcode='22023'; end if;
 if v_total<=0 or v_subtotal<0 or v_discount<0 or v_tax<0 then raise exception 'Valores da venda inválidos.' using errcode='23514'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'A venda precisa de pelo menos um artigo.' using errcode='22023'; end if;
 if v_received<=0 and lower(v_method) not in ('credito','crédito','credit') then v_received:=v_total; end if;
 insert into public.ks_sales(company_id,external_id,invoice_number,customer_name,customer_tax_id,customer_phone,subtotal,discount_value,tax_amount,total,amount_received,change_amount,payment_method,tax_regime,status,notes,operator_name,sold_at,created_by,source_payload)
 values(p_company_id,v_external_id,v_invoice,nullif(p_sale->>'customer_name',''),nullif(p_sale->>'customer_tax_id',''),nullif(p_sale->>'customer_phone',''),v_subtotal,v_discount,v_tax,v_total,v_received,v_change,v_method,nullif(p_sale->>'tax_regime',''),coalesce(nullif(p_sale->>'status',''),'finalizada'),nullif(p_sale->>'notes',''),nullif(p_sale->>'operator_name',''),coalesce(nullif(p_sale->>'sold_at','')::timestamptz,now()),auth.uid(),p_sale)
 on conflict(company_id,external_id) do nothing;
 get diagnostics v_rows=row_count;
 if v_rows=0 then return jsonb_build_object('ok',true,'duplicate',true,'external_id',v_external_id); end if;
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
revoke all on function public.ks_sync_product(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ks_finalize_sale(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ks_sync_product(uuid,jsonb) to authenticated;
grant execute on function public.ks_finalize_sale(uuid,jsonb,jsonb) to authenticated;
