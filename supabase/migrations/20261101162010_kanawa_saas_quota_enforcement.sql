-- Enforce quotas at database level so browser-side checks cannot be bypassed.
alter table public.ks_saas_plans add column if not exists max_installations integer;
update public.ks_saas_plans set max_installations=case code when 'starter' then 2 when 'professional' then 10 else null end where max_installations is null;
create or replace function private.ks_enforce_seat_quota()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_limit integer;v_count integer;v_license record;
begin
 if new.status<>'active' then return new;end if;
 if tg_op='UPDATE' and old.status='active' and old.user_id=new.user_id and old.company_id=new.company_id then return new;end if;
 select l.max_users_override,p.max_users into v_license from public.ks_company_licenses l join public.ks_saas_plans p on p.code=l.plan_code where l.company_id=new.company_id order by l.created_at desc limit 1;
 v_limit:=coalesce(v_license.max_users_override,v_license.max_users);if v_limit is null then return new;end if;
 select count(*) into v_count from public.ks_company_memberships m where m.company_id=new.company_id and m.status='active' and m.user_id<>new.user_id;
 if v_count>=v_limit then raise exception 'O plano atingiu o limite de % utilizadores activos.',v_limit using errcode='23514';end if;return new;
end; $$;
revoke all on function private.ks_enforce_seat_quota() from public,anon,authenticated;
drop trigger if exists ks_enforce_seat_quota on public.ks_company_memberships;
create trigger ks_enforce_seat_quota before insert or update of status,user_id,company_id on public.ks_company_memberships for each row execute function private.ks_enforce_seat_quota();

create or replace function private.ks_enforce_product_quota()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_limit integer;v_count integer;
begin
 if exists(select 1 from public.ks_products p where p.company_id=new.company_id and p.external_id=new.external_id) then return new;end if;
 select p.max_products into v_limit from public.ks_company_licenses l join public.ks_saas_plans p on p.code=l.plan_code where l.company_id=new.company_id order by l.created_at desc limit 1;
 if v_limit is null then return new;end if;
 select count(*) into v_count from public.ks_products p where p.company_id=new.company_id and p.is_active;
 if v_count>=v_limit then raise exception 'O plano atingiu o limite de % produtos.',v_limit using errcode='23514';end if;return new;
end; $$;
revoke all on function private.ks_enforce_product_quota() from public,anon,authenticated;
drop trigger if exists ks_enforce_product_quota on public.ks_products;
create trigger ks_enforce_product_quota before insert on public.ks_products for each row execute function private.ks_enforce_product_quota();

create or replace function private.ks_enforce_installation_quota()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_limit integer;v_count integer;v_license record;
begin
 if exists(select 1 from public.ks_installations i where i.company_id=new.company_id and i.installation_key=new.installation_key) then return new;end if;
 select l.max_installations_override,p.max_installations into v_license from public.ks_company_licenses l join public.ks_saas_plans p on p.code=l.plan_code where l.company_id=new.company_id order by l.created_at desc limit 1;
 v_limit:=coalesce(v_license.max_installations_override,v_license.max_installations);if v_limit is null then return new;end if;
 select count(*) into v_count from public.ks_installations i where i.company_id=new.company_id and i.install_status='active';
 if v_count>=v_limit then raise exception 'O plano atingiu o limite de % instalações activas.',v_limit using errcode='23514';end if;return new;
end; $$;
revoke all on function private.ks_enforce_installation_quota() from public,anon,authenticated;
drop trigger if exists ks_enforce_installation_quota on public.ks_installations;
create trigger ks_enforce_installation_quota before insert on public.ks_installations for each row execute function private.ks_enforce_installation_quota();

create or replace function private.ks_enforce_invoice_quota()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_max_invoices integer;v_max_revenue numeric;v_count integer;v_revenue numeric;v_currency text;v_fx numeric;v_usd numeric;
begin
 if exists(select 1 from public.ks_sales s where s.company_id=new.company_id and s.external_id=new.external_id) then return new;end if;
 select coalesce(l.max_invoices_override,p.max_invoices_month),p.max_monthly_revenue_usd into v_max_invoices,v_max_revenue
 from public.ks_company_licenses l join public.ks_saas_plans p on p.code=l.plan_code where l.company_id=new.company_id order by l.created_at desc limit 1;
 select count(*) into v_count from public.ks_usage_events e where e.company_id=new.company_id and e.event_type='invoice_finalized' and e.occurred_at>=date_trunc('month',now());
 if v_max_invoices is not null and v_count>=v_max_invoices then raise exception 'O plano atingiu o limite de % facturas por mês.',v_max_invoices using errcode='23514';end if;
 if v_max_revenue is not null then
  select currency_code into v_currency from public.ks_companies where id=new.company_id;
  if v_currency='USD' then v_usd:=new.total;
  else select rate into v_fx from public.ks_exchange_rates where company_id=new.company_id and base_currency=v_currency and quote_currency='USD' order by observed_at desc limit 1;if v_fx is not null then v_usd:=round(new.total*v_fx,2);end if;end if;
  if v_usd is not null then select coalesce(sum(amount_usd),0) into v_revenue from public.ks_usage_events where company_id=new.company_id and event_type='invoice_finalized' and occurred_at>=date_trunc('month',now());
   if v_revenue+v_usd>v_max_revenue then raise exception 'O volume mensal de facturação excede o limite do plano. Actualize a licença.' using errcode='23514';end if;end if;
 end if;return new;
end; $$;
revoke all on function private.ks_enforce_invoice_quota() from public,anon,authenticated;
drop trigger if exists ks_enforce_invoice_quota on public.ks_sales;
create trigger ks_enforce_invoice_quota before insert on public.ks_sales for each row execute function private.ks_enforce_invoice_quota();