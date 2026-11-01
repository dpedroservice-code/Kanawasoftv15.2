-- Kanawa Soft v15.2: secure authentication and independent multi-company onboarding
-- Additive migration: does not alter or delete legacy SQLite/ERP tables.
create schema if not exists private;
create table if not exists public.ks_profiles (user_id uuid primary key references auth.users(id) on delete cascade, full_name text not null, phone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.ks_companies (id uuid primary key default gen_random_uuid(), legal_name text not null, trade_name text, tax_id text, country_code text not null default 'AO', currency_code text not null default 'AOA', tax_regime text not null default 'not_configured', fiscal_status text not null default 'not_configured' check (fiscal_status in ('not_configured','in_preparation','sandbox','submitted','certified','rejected')), owner_user_id uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists ks_companies_tax_id_unique on public.ks_companies(country_code, tax_id) where tax_id is not null and length(trim(tax_id)) > 0;
create index if not exists ks_companies_owner_user_id_idx on public.ks_companies(owner_user_id);
create table if not exists public.ks_company_memberships (company_id uuid not null references public.ks_companies(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role text not null default 'owner' check (role in ('owner','admin','manager','operator','cashier','accountant','viewer')), status text not null default 'active' check (status in ('active','invited','suspended')), created_at timestamptz not null default now(), primary key (company_id, user_id));
create index if not exists ks_company_memberships_user_id_idx on public.ks_company_memberships(user_id);
alter table public.ks_profiles enable row level security;
alter table public.ks_companies enable row level security;
alter table public.ks_company_memberships enable row level security;
drop policy if exists profile_read_self on public.ks_profiles;
create policy profile_read_self on public.ks_profiles for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists profile_update_self on public.ks_profiles;
create policy profile_update_self on public.ks_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists membership_read_self on public.ks_company_memberships;
create policy membership_read_self on public.ks_company_memberships for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists company_read_member on public.ks_companies;
create policy company_read_member on public.ks_companies for select to authenticated using (owner_user_id = (select auth.uid()) or exists (select 1 from public.ks_company_memberships m where m.company_id = id and m.user_id = (select auth.uid()) and m.status = 'active'));
drop policy if exists company_update_owner on public.ks_companies;
create policy company_update_owner on public.ks_companies for update to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
grant usage on schema public to authenticated;
grant select, update on public.ks_profiles to authenticated;
grant select on public.ks_company_memberships to authenticated;
grant select, update on public.ks_companies to authenticated;
create or replace function private.ks_handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid; v_legal_name text; v_full_name text;
begin
  v_full_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  insert into public.ks_profiles(user_id, full_name, phone) values (new.id, v_full_name, nullif(new.raw_user_meta_data ->> 'phone', '')) on conflict (user_id) do nothing;
  v_legal_name := nullif(trim(new.raw_user_meta_data ->> 'company_legal_name'), '');
  if v_legal_name is not null then
    insert into public.ks_companies(legal_name, trade_name, tax_id, country_code, currency_code, tax_regime, owner_user_id) values (v_legal_name, nullif(trim(new.raw_user_meta_data ->> 'company_trade_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'company_tax_id'), ''), coalesce(nullif(new.raw_user_meta_data ->> 'country_code',''), 'AO'), coalesce(nullif(new.raw_user_meta_data ->> 'currency_code',''), 'AOA'), coalesce(nullif(new.raw_user_meta_data ->> 'tax_regime',''), 'not_configured'), new.id) returning id into v_company_id;
    insert into public.ks_company_memberships(company_id, user_id, role) values (v_company_id, new.id, 'owner') on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function private.ks_handle_new_user() from public, anon, authenticated;
drop trigger if exists ks_on_auth_user_created on auth.users;
create trigger ks_on_auth_user_created after insert on auth.users for each row execute function private.ks_handle_new_user();