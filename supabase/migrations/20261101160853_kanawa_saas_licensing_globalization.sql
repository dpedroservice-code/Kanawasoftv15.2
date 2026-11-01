-- Final SaaS licensing and globalization schema for Kanawa Soft.
-- Uses the existing ks_saas_plans and ks_subscriptions catalog; no parallel billing catalog.
create table if not exists public.ks_platform_admins(user_id uuid primary key references auth.users(id) on delete cascade,role text not null default 'owner' check(role in ('owner','support','billing')),created_at timestamptz not null default now());
create or replace function private.ks_is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.ks_platform_admins where user_id=(select auth.uid())); $$;
revoke all on function private.ks_is_platform_admin() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.ks_is_platform_admin() to authenticated;

create table if not exists public.ks_company_licenses(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.ks_companies(id) on delete cascade,
 plan_code text not null references public.ks_saas_plans(code),license_key text not null unique default ('KS-'||upper(encode(gen_random_bytes(8),'hex'))),
 status text not null default 'trial' check(status in ('trial','active','past_due','read_only','suspended','expired','cancelled')),
 starts_at timestamptz not null default now(),expires_at timestamptz,grace_until timestamptz,
 max_users_override integer check(max_users_override is null or max_users_override>0),
 max_invoices_override integer check(max_invoices_override is null or max_invoices_override>0),
 max_installations_override integer check(max_installations_override is null or max_installations_override>0),
 notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists ks_company_licenses_company_idx on public.ks_company_licenses(company_id,status);
create index if not exists ks_company_licenses_expiry_idx on public.ks_company_licenses(expires_at) where status in ('trial','active','past_due');

alter table public.ks_subscriptions add column if not exists license_id uuid references public.ks_company_licenses(id);
alter table public.ks_subscriptions add column if not exists payment_method text not null default 'manual_transfer';
alter table public.ks_subscriptions add column if not exists manual_payment_reference text;
alter table public.ks_subscriptions add column if not exists last_payment_at timestamptz;
alter table public.ks_usage_events add column if not exists amount_local numeric(18,2);
alter table public.ks_usage_events add column if not exists currency_code text;

create table if not exists public.ks_installations(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.ks_companies(id) on delete cascade,
 installation_key text not null,user_id uuid not null references auth.users(id) on delete cascade,
 device_name text,platform text,app_version text,install_status text not null default 'active' check(install_status in ('active','inactive','revoked')),
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),metadata jsonb not null default '{}'::jsonb,
 unique(company_id,installation_key)
);
create index if not exists ks_installations_company_seen_idx on public.ks_installations(company_id,last_seen_at desc);
create index if not exists ks_installations_user_idx on public.ks_installations(user_id);

create table if not exists public.ks_demo_requests(
 id uuid primary key default gen_random_uuid(),company_name text not null,contact_name text not null,email text not null,phone text,
 country_code text not null default 'AO',preferred_plan text references public.ks_saas_plans(code),
 requested_modules text[] not null default '{}',source text not null default 'kanawa_site',
 status text not null default 'new' check(status in ('new','contacted','scheduled','converted','closed')),
 requested_at timestamptz not null default now(),notes text,assigned_to uuid references auth.users(id),
 converted_company_id uuid references public.ks_companies(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.ks_license_usage_daily(
 company_id uuid not null references public.ks_companies(id) on delete cascade,usage_date date not null default current_date,
 invoice_count integer not null default 0 check(invoice_count>=0),gross_revenue numeric(18,2) not null default 0 check(gross_revenue>=0),
 active_users integer not null default 0 check(active_users>=0),active_installations integer not null default 0 check(active_installations>=0),
 storage_bytes bigint not null default 0 check(storage_bytes>=0),updated_at timestamptz not null default now(),primary key(company_id,usage_date)
);
create table if not exists public.ks_platform_notifications(
 id uuid primary key default gen_random_uuid(),event_key text not null unique,event_type text not null,
 severity text not null default 'info' check(severity in ('info','warning','critical')),
 title text not null,message text not null,company_id uuid references public.ks_companies(id) on delete set null,
 payload jsonb not null default '{}'::jsonb,read_at timestamptz,delivered_at timestamptz,
 delivery_channel text not null default 'institutional_outbox',created_at timestamptz not null default now()
);
create index if not exists ks_platform_notifications_created_idx on public.ks_platform_notifications(created_at desc);

create table if not exists public.ks_company_locales(
 company_id uuid primary key references public.ks_companies(id) on delete cascade,locale text not null default 'pt-AO',
 timezone text not null default 'Africa/Luanda',currency_code text not null default 'AOA',date_format text not null default 'dd/MM/yyyy',
 decimal_separator text not null default ',',thousands_separator text not null default '.',updated_at timestamptz not null default now()
);
create table if not exists public.ks_map_provider_settings(
 company_id uuid primary key references public.ks_companies(id) on delete cascade,provider text not null default 'osrm',
 routing_endpoint text not null default 'https://router.project-osrm.org',
 geocoding_endpoint text not null default 'https://photon.komoot.io/api',
 attribution text not null default '© OpenStreetMap contributors',is_demo_endpoint boolean not null default true,updated_at timestamptz not null default now()
);
create table if not exists public.ks_payment_provider_settings(
 provider_code text primary key,display_name text not null,enabled boolean not null default false,
 mode text not null default 'not_configured' check(mode in ('not_configured','sandbox','live','manual')),
 supported_countries text[] not null default '{}',checkout_url text,updated_at timestamptz not null default now()
);
insert into public.ks_payment_provider_settings(provider_code,display_name,mode,supported_countries) values
 ('manual_transfer','Transferência manual','manual',array['*']),('bank_transfer','Transferência bancária internacional','manual',array['*']),
 ('multicaixa_express','Multicaixa Express','not_configured',array['AO']),('unitel_money','Unitel Money','not_configured',array['AO']),
 ('paypal','PayPal','not_configured',array['*']),('stripe','Stripe','not_configured',array['*']),('paddle','Paddle','not_configured',array['*'])
on conflict(provider_code) do nothing;

create or replace function private.ks_is_company_or_platform_admin(p_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.ks_is_platform_admin() or private.ks_is_company_member(p_company_id);
$$;
revoke all on function private.ks_is_company_or_platform_admin(uuid) from public,anon;
grant execute on function private.ks_is_company_or_platform_admin(uuid) to authenticated;

create or replace function private.ks_bootstrap_company_license()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_license_id uuid; v_end timestamptz:=now()+interval '14 days';
begin
 insert into public.ks_company_licenses(company_id,plan_code,status,starts_at,expires_at,grace_until)
 values(new.id,'starter','trial',now(),v_end,v_end+interval '5 days') returning id into v_license_id;
 insert into public.ks_subscriptions(company_id,plan_code,billing_interval,status,currency,provider,current_period_start,current_period_end,grace_until,trial_ends_at,license_id,payment_method)
 values(new.id,'starter','monthly','trialing',coalesce(new.currency_code,'AOA'),'manual',now(),v_end,v_end+interval '5 days',v_end,v_license_id,'manual_transfer');
 insert into public.ks_company_locales(company_id,locale,timezone,currency_code)
 values(new.id,case when new.country_code='AO' then 'pt-AO' else 'en-US' end,case when new.country_code='AO' then 'Africa/Luanda' else 'UTC' end,new.currency_code)
 on conflict(company_id) do nothing;
 insert into public.ks_map_provider_settings(company_id) values(new.id) on conflict(company_id) do nothing;
 return new;
end; $$;
revoke all on function private.ks_bootstrap_company_license() from public,anon,authenticated;
drop trigger if exists ks_company_bootstrap_license on public.ks_companies;
create trigger ks_company_bootstrap_license after insert on public.ks_companies for each row execute function private.ks_bootstrap_company_license();

insert into public.ks_company_licenses(company_id,plan_code,status,starts_at,expires_at,grace_until)
select c.id,'starter','trial',now(),now()+interval '14 days',now()+interval '19 days'
from public.ks_companies c where not exists(select 1 from public.ks_company_licenses l where l.company_id=c.id);
insert into public.ks_subscriptions(company_id,plan_code,billing_interval,status,currency,provider,current_period_start,current_period_end,grace_until,trial_ends_at,license_id,payment_method)
select l.company_id,l.plan_code,'monthly','trialing',coalesce(c.currency_code,'AOA'),'manual',now(),l.expires_at,l.grace_until,l.expires_at,l.id,'manual_transfer'
from public.ks_company_licenses l join public.ks_companies c on c.id=l.company_id
where not exists(select 1 from public.ks_subscriptions s where s.company_id=l.company_id);
update public.ks_subscriptions s set license_id=l.id from public.ks_company_licenses l where l.company_id=s.company_id and s.license_id is null;
insert into public.ks_company_locales(company_id,locale,timezone,currency_code)
select id,case when country_code='AO' then 'pt-AO' else 'en-US' end,case when country_code='AO' then 'Africa/Luanda' else 'UTC' end,currency_code
from public.ks_companies on conflict(company_id) do nothing;
insert into public.ks_map_provider_settings(company_id) select id from public.ks_companies on conflict(company_id) do nothing;

-- Bootstrap the D.Pedro platform owner only for the explicitly designated mailbox.
insert into public.ks_platform_admins(user_id,role) select id,'owner' from auth.users where lower(email)='dpedroservice@gmail.com' on conflict(user_id) do nothing;
create or replace function private.ks_register_platform_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin if lower(new.email)='dpedroservice@gmail.com' then insert into public.ks_platform_admins(user_id,role) values(new.id,'owner') on conflict(user_id) do nothing; end if; return new; end; $$;
revoke all on function private.ks_register_platform_owner() from public,anon,authenticated;
drop trigger if exists ks_register_platform_owner on auth.users;
create trigger ks_register_platform_owner after insert on auth.users for each row execute function private.ks_register_platform_owner();

do $$ declare t text; begin foreach t in array array['ks_platform_admins','ks_company_licenses','ks_installations','ks_demo_requests','ks_license_usage_daily','ks_platform_notifications','ks_company_locales','ks_map_provider_settings','ks_payment_provider_settings'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

drop policy if exists ks_platform_admin_self_read on public.ks_platform_admins;
create policy ks_platform_admin_self_read on public.ks_platform_admins for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists ks_license_read_member on public.ks_company_licenses;
create policy ks_license_read_member on public.ks_company_licenses for select to authenticated using(private.ks_is_company_member(company_id) or private.ks_is_platform_admin());
drop policy if exists ks_license_admin_write on public.ks_company_licenses;
create policy ks_license_admin_write on public.ks_company_licenses for all to authenticated using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());
drop policy if exists ks_installations_read on public.ks_installations;
create policy ks_installations_read on public.ks_installations for select to authenticated using(private.ks_is_company_or_platform_admin(company_id));
drop policy if exists ks_installations_insert on public.ks_installations;
create policy ks_installations_insert on public.ks_installations for insert to authenticated with check(private.ks_is_company_member(company_id) and user_id=(select auth.uid()));
drop policy if exists ks_installations_update on public.ks_installations;
create policy ks_installations_update on public.ks_installations for update to authenticated using(user_id=(select auth.uid()) and private.ks_is_company_member(company_id)) with check(user_id=(select auth.uid()) and private.ks_is_company_member(company_id));
drop policy if exists ks_installations_admin_write on public.ks_installations;
create policy ks_installations_admin_write on public.ks_installations for all to authenticated using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());
drop policy if exists ks_demo_requests_admin_all on public.ks_demo_requests;
create policy ks_demo_requests_admin_all on public.ks_demo_requests for all to authenticated using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());
drop policy if exists ks_usage_daily_read on public.ks_license_usage_daily;
create policy ks_usage_daily_read on public.ks_license_usage_daily for select to authenticated using(private.ks_is_company_or_platform_admin(company_id));
drop policy if exists ks_usage_daily_admin_write on public.ks_license_usage_daily;
create policy ks_usage_daily_admin_write on public.ks_license_usage_daily for all to authenticated using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());
drop policy if exists ks_platform_notifications_admin_all on public.ks_platform_notifications;
create policy ks_platform_notifications_admin_all on public.ks_platform_notifications for all to authenticated using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());
drop policy if exists ks_locales_read on public.ks_company_locales;
create policy ks_locales_read on public.ks_company_locales for select to authenticated using(private.ks_is_company_member(company_id));
drop policy if exists ks_locales_write on public.ks_company_locales;
create policy ks_locales_write on public.ks_company_locales for all to authenticated using(private.ks_has_company_role(company_id,array['owner','admin','manager']::text[])) with check(private.ks_has_company_role(company_id,array['owner','admin','manager']::text[]));
drop policy if exists ks_map_settings_read on public.ks_map_provider_settings;
create policy ks_map_settings_read on public.ks_map_provider_settings for select to authenticated using(private.ks_is_company_member(company_id));
drop policy if exists ks_map_settings_write on public.ks_map_provider_settings;
create policy ks_map_settings_write on public.ks_map_provider_settings for all to authenticated using(private.ks_has_company_role(company_id,array['owner','admin','manager']::text[])) with check(private.ks_has_company_role(company_id,array['owner','admin','manager']::text[]));
drop policy if exists ks_payment_provider_admin_all on public.ks_payment_provider_settings;
create policy ks_payment_provider_admin_all on public.ks_payment_provider_settings for all to authenticated using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());

grant select on public.ks_platform_admins,public.ks_company_licenses,public.ks_installations,public.ks_license_usage_daily,public.ks_company_locales,public.ks_map_provider_settings to authenticated;
grant insert,update on public.ks_installations to authenticated;
grant insert,update,delete on public.ks_company_locales,public.ks_map_provider_settings to authenticated;
grant select,insert,update,delete on public.ks_demo_requests,public.ks_platform_notifications,public.ks_payment_provider_settings to authenticated;
grant insert,update,delete on public.ks_company_licenses to authenticated;
grant select on public.ks_payment_provider_settings to authenticated;
