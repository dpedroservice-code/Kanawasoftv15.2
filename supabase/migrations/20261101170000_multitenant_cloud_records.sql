-- Multi-tenant cloud record store for offline-first ERP modules.
-- RLS restricts every row to an active company membership.

create or replace function private.ks_is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ks_company_memberships m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

revoke all on function private.ks_is_company_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.ks_is_company_member(uuid) to authenticated;

create table if not exists public.ks_records (
  company_id uuid not null references public.ks_companies(id) on delete cascade,
  store_key text not null check (length(store_key) between 1 and 80),
  record_id text not null check (length(record_id) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, store_key, record_id)
);

create index if not exists ks_records_company_store_updated_idx
  on public.ks_records(company_id, store_key, updated_at desc);

alter table public.ks_records enable row level security;

drop policy if exists ks_records_select_member on public.ks_records;
create policy ks_records_select_member on public.ks_records
for select to authenticated using (private.ks_is_company_member(company_id));

drop policy if exists ks_records_insert_member on public.ks_records;
create policy ks_records_insert_member on public.ks_records
for insert to authenticated with check (private.ks_is_company_member(company_id));

drop policy if exists ks_records_update_member on public.ks_records;
create policy ks_records_update_member on public.ks_records
for update to authenticated
using (private.ks_is_company_member(company_id))
with check (private.ks_is_company_member(company_id));

drop policy if exists ks_records_delete_member on public.ks_records;
create policy ks_records_delete_member on public.ks_records
for delete to authenticated using (private.ks_is_company_member(company_id));

grant select, insert, update, delete on public.ks_records to authenticated;
