-- Enforce active subscription/trial on every tenant write and report plan usage.
create or replace function private.ks_has_company_role(p_company_id uuid,p_allowed_roles text[])
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ks_company_memberships m where m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.status='active' and m.role=any(p_allowed_roles))
 and exists(select 1 from public.ks_company_licenses l where l.company_id=p_company_id
  and (l.status in ('trial','active') or (l.grace_until is not null and l.grace_until>=now()))
  and (l.expires_at is null or l.expires_at>=now() or (l.grace_until is not null and l.grace_until>=now())));
$$;
revoke all on function private.ks_has_company_role(uuid,text[]) from public,anon;
grant execute on function private.ks_has_company_role(uuid,text[]) to authenticated;

drop policy if exists ks_subscriptions_admin_insert on public.ks_subscriptions;
create policy ks_subscriptions_admin_insert on public.ks_subscriptions for insert to authenticated with check(private.ks_is_platform_admin());
drop policy if exists ks_subscriptions_admin_update on public.ks_subscriptions;
create policy ks_subscriptions_admin_update on public.ks_subscriptions for update to authenticated using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());
grant insert on public.ks_subscriptions to authenticated;
grant update on public.ks_subscriptions to authenticated;

create or replace function public.ks_finalize_sale(p_company_id uuid,p_sale jsonb,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_external_id text:=nullif(p_sale->>'external_id','');v_invoice text:=nullif(p_sale->>'invoice_number','');
 v_subtotal numeric(18,2):=coalesce((p_sale->>'subtotal')::numeric,0);v_discount numeric(18,2):=coalesce((p_sale->>'discount_value')::numeric,0);
 v_tax numeric(18,2):=coalesce((p_sale->>'tax_amount')::numeric,0);v_total numeric(18,2):=coalesce((p_sale->>'total')::numeric,0);
 v_received numeric(18,2):=coalesce((p_sale->>'amount_received')::numeric,0);v_change numeric(18,2):=coalesce((p_sale->>'change_amount')::numeric,0);
 v_method text:=coalesce(nullif(p_sale->>'payment_method',''),'não indicado');v_item jsonb;v_product_id text;v_product_name text;
 v_qty numeric(18,3);v_price numeric(18,2);v_line_total numeric(18,2);v_line integer:=0;v_rows integer;v_stock_tracked boolean;
 v_currency text;v_fx numeric(24,10);v_usd numeric(18,2);
begin
 if auth.uid() is null or not private.ks_has_company_role(p_company_id,array['owner','admin','manager','operator','cashier']::text[]) then raise exception 'Acesso negado ou licença em modo de leitura.' using errcode='42501';end if;
 if p_sale is null or jsonb_typeof(p_sale)<>'object' or v_external_id is null or v_invoice is null then raise exception 'Dados e número da factura obrigatórios.' using errcode='22023';end if;
 if v_total<=0 or v_subtotal<0 or v_discount<0 or v_discount>v_subtotal or v_tax<0 or v_received<0 or v_change<0 then raise exception 'Valores inválidos.' using errcode='23514';end if;
 if coalesce(p_sale->>'status','finalizada')<>'finalizada' then raise exception 'Só vendas finalizadas podem ser lançadas.' using errcode='23514';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'A venda precisa de artigos.' using errcode='22023';end if;
 if v_received<=0 and lower(v_method) not in ('credito','crédito','credit') then v_received:=v_total;end if;
 insert into public.ks_sales(company_id,external_id,invoice_number,customer_name,customer_tax_id,customer_phone,subtotal,discount_value,tax_amount,total,amount_received,change_amount,payment_method,tax_regime,status,notes,operator_name,sold_at,created_by,source_payload)
 values(p_company_id,v_external_id,v_invoice,nullif(p_sale->>'customer_name',''),nullif(p_sale->>'customer_tax_id',''),nullif(p_sale->>'customer_phone',''),v_subtotal,v_discount,v_tax,v_total,v_received,v_change,v_method,nullif(p_sale->>'tax_regime',''),'finalizada',nullif(p_sale->>'notes',''),nullif(p_sale->>'operator_name',''),coalesce(nullif(p_sale->>'sold_at','')::timestamptz,now()),auth.uid(),p_sale)
 on conflict(company_id,external_id) do nothing;
 get diagnostics v_rows=row_count;if v_rows=0 then return jsonb_build_object('ok',true,'duplicate',true,'external_id',v_external_id);end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_line:=v_line+1;v_product_id:=nullif(v_item->>'product_external_id','');v_product_name:=coalesce(nullif(trim(v_item->>'product_name'),''),'Artigo');
  v_qty:=coalesce((v_item->>'quantity')::numeric,0);v_price:=coalesce((v_item->>'unit_price')::numeric,0);v_line_total:=coalesce((v_item->>'line_total')::numeric,round(v_qty*v_price,2));v_stock_tracked:=coalesce((v_item->>'stock_tracked')::boolean,true);
  if v_qty<=0 or v_price<0 or v_line_total<0 then raise exception 'Linha inválida.' using errcode='23514';end if;
  if v_stock_tracked then update public.ks_products set stock_quantity=stock_quantity-v_qty,updated_at=now() where company_id=p_company_id and external_id=v_product_id and is_active and stock_quantity>=v_qty;
   if not found then raise exception 'Stock insuficiente: %',v_product_id using errcode='23514';end if;end if;
  insert into public.ks_sale_items(company_id,sale_external_id,line_number,product_external_id,product_name,unit_price,quantity,line_total,stock_tracked) values(p_company_id,v_external_id,v_line,v_product_id,v_product_name,v_price,v_qty,v_line_total,v_stock_tracked);
  if v_stock_tracked then insert into public.ks_stock_movements(company_id,external_id,product_external_id,sale_external_id,movement_type,quantity,reason,created_by) values(p_company_id,v_external_id||':sale:'||v_line::text,v_product_id,v_external_id,'sale',v_qty,'Venda '||v_invoice,auth.uid());end if;
 end loop;
 if v_received>0 then insert into public.ks_payments(company_id,external_id,sale_external_id,amount,method,status,created_by) values(p_company_id,v_external_id||':payment:1',v_external_id,v_received,v_method,'received',auth.uid());end if;
 select currency_code into v_currency from public.ks_companies where id=p_company_id;
 if v_currency='USD' then v_usd:=v_total;else select rate into v_fx from public.ks_exchange_rates where company_id=p_company_id and base_currency=v_currency and quote_currency='USD' order by observed_at desc limit 1;if v_fx is not null then v_usd:=round(v_total*v_fx,2);end if;end if;
 insert into public.ks_usage_events(company_id,event_type,quantity,amount_usd,amount_local,currency_code,reference_id,created_by) values(p_company_id,'invoice_finalized',1,v_usd,v_total,v_currency,v_external_id,auth.uid());
 return jsonb_build_object('ok',true,'duplicate',false,'external_id',v_external_id,'total',v_total);
end; $$;
revoke all on function public.ks_finalize_sale(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.ks_finalize_sale(uuid,jsonb,jsonb) to authenticated;
grant insert(company_id,event_type,quantity,amount_usd,amount_local,currency_code,reference_id,created_by) on public.ks_usage_events to authenticated;

create or replace function public.ks_get_company_entitlements(p_company_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_sub record;v_plan record;v_license record;v_users integer;v_products integer;v_invoices integer;v_revenue numeric;v_storage numeric;
begin
 if auth.uid() is null or not private.ks_is_company_member(p_company_id) then raise exception 'Acesso negado.' using errcode='42501';end if;
 select plan_code,status,current_period_end,grace_until,trial_ends_at,billing_interval,license_id into v_sub from public.ks_subscriptions
 where company_id=p_company_id and status in ('trialing','active','past_due') order by created_at desc limit 1;
 select id,plan_code,status,expires_at,grace_until,max_users_override,max_invoices_override,max_installations_override into v_license
 from public.ks_company_licenses where company_id=p_company_id order by created_at desc limit 1;
 select * into v_plan from public.ks_saas_plans where code=coalesce(v_license.plan_code,v_sub.plan_code,'starter');
 v_users:=private.ks_count_active_members(p_company_id);
 select count(*) into v_products from public.ks_products where company_id=p_company_id and is_active;
 select count(*) into v_invoices from public.ks_usage_events where company_id=p_company_id and event_type='invoice_finalized' and occurred_at>=date_trunc('month',now());
 select coalesce(sum(amount_usd),0) into v_revenue from public.ks_usage_events where company_id=p_company_id and event_type='invoice_finalized' and occurred_at>=date_trunc('month',now());
 select coalesce(sum(quantity),0)/1048576 into v_storage from public.ks_usage_events where company_id=p_company_id and event_type='storage_bytes_added';
 return jsonb_build_object('plan',coalesce(v_plan.code,'starter'),'status',coalesce(v_license.status,v_sub.status,'unsubscribed'),
 'period_end',coalesce(v_license.expires_at,v_sub.current_period_end),'grace_until',coalesce(v_license.grace_until,v_sub.grace_until),
 'read_only',(coalesce(v_license.status,v_sub.status,'unsubscribed') not in ('trial','trialing','active') and coalesce(v_license.grace_until,v_sub.grace_until) is null)
 or (coalesce(v_license.expires_at,v_sub.current_period_end) is not null and coalesce(v_license.expires_at,v_sub.current_period_end)<now() and coalesce(v_license.grace_until,v_sub.grace_until,'epoch'::timestamptz)<now())
 or (coalesce(v_license.max_users_override,v_plan.max_users) is not null and v_users>coalesce(v_license.max_users_override,v_plan.max_users))
 or (v_plan.max_products is not null and v_products>v_plan.max_products)
 or (coalesce(v_license.max_invoices_override,v_plan.max_invoices_month) is not null and v_invoices>coalesce(v_license.max_invoices_override,v_plan.max_invoices_month))
 or (v_plan.max_monthly_revenue_usd is not null and v_revenue>v_plan.max_monthly_revenue_usd)
 or (v_plan.storage_mb is not null and v_storage>v_plan.storage_mb),
 'limits',jsonb_build_object('users',coalesce(v_license.max_users_override,v_plan.max_users),'products',v_plan.max_products,'invoices_month',coalesce(v_license.max_invoices_override,v_plan.max_invoices_month),'monthly_revenue_usd',v_plan.max_monthly_revenue_usd,'storage_mb',v_plan.storage_mb),
 'usage',jsonb_build_object('users',v_users,'products',v_products,'invoices_month',v_invoices,'monthly_revenue_usd',v_revenue,'storage_mb',v_storage));
end; $$;
revoke all on function public.ks_get_company_entitlements(uuid) from public,anon;
grant execute on function public.ks_get_company_entitlements(uuid) to authenticated;

create or replace function private.ks_enqueue_license_expiry_alerts()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer:=0;r record;
begin
 if not private.ks_is_platform_admin() then raise exception 'Acesso reservado ao administrador da plataforma.' using errcode='42501';end if;
 for r in select l.id,l.company_id,l.license_key,l.expires_at,c.legal_name from public.ks_company_licenses l join public.ks_companies c on c.id=l.company_id
  where l.status in ('trial','active','past_due') and l.expires_at is not null and l.expires_at<=now()+interval '7 days' and l.expires_at>now()-interval '1 day'
 loop
  insert into public.ks_platform_notifications(event_key,event_type,severity,title,message,company_id,payload)
  values('license-expiry:'||r.id::text||':'||r.expires_at::date::text,'license_expiring',case when r.expires_at<=now()+interval '1 day' then 'critical' else 'warning' end,
   'Licença próxima do vencimento',r.legal_name||' — licença '||r.license_key||' expira em '||to_char(r.expires_at,'DD/MM/YYYY HH24:MI'),
   r.company_id,jsonb_build_object('license_id',r.id,'license_key',r.license_key,'expires_at',r.expires_at)) on conflict(event_key) do nothing;
  if found then v_count:=v_count+1;end if;
 end loop;return v_count;
end; $$;
revoke all on function private.ks_enqueue_license_expiry_alerts() from public,anon,authenticated;
grant execute on function private.ks_enqueue_license_expiry_alerts() to authenticated;
create or replace function public.ks_refresh_license_alerts()
returns integer language plpgsql security invoker set search_path='' as $$
begin if not private.ks_is_platform_admin() then raise exception 'Acesso reservado.' using errcode='42501';end if;return private.ks_enqueue_license_expiry_alerts();end; $$;
revoke all on function public.ks_refresh_license_alerts() from public,anon;
grant execute on function public.ks_refresh_license_alerts() to authenticated;
