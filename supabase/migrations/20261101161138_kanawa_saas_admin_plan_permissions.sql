-- Platform administrators manage the canonical plan catalogue and provider registry.
drop policy if exists ks_saas_plans_admin_write on public.ks_saas_plans;
create policy ks_saas_plans_admin_write on public.ks_saas_plans for all to authenticated
 using(private.ks_is_platform_admin()) with check(private.ks_is_platform_admin());
grant insert,update,delete on public.ks_saas_plans to authenticated;
grant select,insert,update,delete on public.ks_payment_provider_settings to authenticated;
grant select,update on public.ks_platform_notifications to authenticated;