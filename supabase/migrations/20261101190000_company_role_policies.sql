-- Enforce role-aware writes for tenant cloud records.
create or replace function private.ks_has_company_role(p_company_id uuid, p_allowed_roles text[])
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
      and m.role = any(p_allowed_roles)
  );
$$;

revoke all on function private.ks_has_company_role(uuid, text[]) from public, anon;
grant execute on function private.ks_has_company_role(uuid, text[]) to authenticated;

drop policy if exists ks_records_insert_member on public.ks_records;
create policy ks_records_insert_member on public.ks_records
for insert to authenticated
with check (private.ks_has_company_role(company_id, array['owner','admin','manager','operator','cashier','accountant']));

drop policy if exists ks_records_update_member on public.ks_records;
create policy ks_records_update_member on public.ks_records
for update to authenticated
using (private.ks_has_company_role(company_id, array['owner','admin','manager','operator','cashier','accountant']))
with check (private.ks_has_company_role(company_id, array['owner','admin','manager','operator','cashier','accountant']));

drop policy if exists ks_records_delete_member on public.ks_records;
create policy ks_records_delete_member on public.ks_records
for delete to authenticated
using (private.ks_has_company_role(company_id, array['owner','admin','manager']));
