-- Restrict safe status/config RPCs to authenticated sessions.
REVOKE ALL ON FUNCTION public.ks_list_payment_provider_status() FROM anon;
REVOKE ALL ON FUNCTION public.ks_get_map_provider_config() FROM anon;
GRANT EXECUTE ON FUNCTION public.ks_list_payment_provider_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ks_get_map_provider_config() TO authenticated;

-- Cover the foreign keys flagged by Supabase Performance Advisor.
CREATE INDEX IF NOT EXISTS ks_company_licenses_created_by_idx ON public.ks_company_licenses(created_by);
CREATE INDEX IF NOT EXISTS ks_company_licenses_plan_code_idx ON public.ks_company_licenses(plan_code);
CREATE INDEX IF NOT EXISTS ks_demo_requests_assigned_to_idx ON public.ks_demo_requests(assigned_to);
CREATE INDEX IF NOT EXISTS ks_demo_requests_converted_company_id_idx ON public.ks_demo_requests(converted_company_id);
CREATE INDEX IF NOT EXISTS ks_demo_requests_preferred_plan_idx ON public.ks_demo_requests(preferred_plan);
CREATE INDEX IF NOT EXISTS ks_payments_created_by_idx ON public.ks_payments(created_by);
CREATE INDEX IF NOT EXISTS ks_platform_notifications_company_id_idx ON public.ks_platform_notifications(company_id);
CREATE INDEX IF NOT EXISTS ks_sales_created_by_idx ON public.ks_sales(created_by);
CREATE INDEX IF NOT EXISTS ks_stock_movements_company_sale_idx ON public.ks_stock_movements(company_id,sale_external_id);
CREATE INDEX IF NOT EXISTS ks_stock_movements_created_by_idx ON public.ks_stock_movements(created_by);
CREATE INDEX IF NOT EXISTS ks_subscriptions_license_id_idx ON public.ks_subscriptions(license_id);
CREATE INDEX IF NOT EXISTS ks_subscriptions_plan_code_idx ON public.ks_subscriptions(plan_code);
CREATE INDEX IF NOT EXISTS ks_team_invitations_accepted_by_idx ON public.ks_team_invitations(accepted_by);
CREATE INDEX IF NOT EXISTS ks_team_invitations_created_by_idx ON public.ks_team_invitations(created_by);
CREATE INDEX IF NOT EXISTS ks_usage_events_created_by_idx ON public.ks_usage_events(created_by);