-- Platform owner needs tenant-wide visibility for the SaaS control centre.
drop policy if exists ks_companies_platform_admin_read on public.ks_companies;
create policy ks_companies_platform_admin_read on public.ks_companies for select to authenticated
 using(private.ks_is_platform_admin());
drop policy if exists ks_memberships_platform_admin_read on public.ks_company_memberships;
create policy ks_memberships_platform_admin_read on public.ks_company_memberships for select to authenticated
 using(private.ks_is_platform_admin());