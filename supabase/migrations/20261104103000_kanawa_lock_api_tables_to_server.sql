-- Explicitly deny direct client access; service_role Edge Functions bypass RLS.
DROP POLICY IF EXISTS ks_store_api_keys_deny_client ON public.ks_store_api_keys;
CREATE POLICY ks_store_api_keys_deny_client
  ON public.ks_store_api_keys
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ks_company_payment_integrations_deny_client ON public.ks_company_payment_integrations;
CREATE POLICY ks_company_payment_integrations_deny_client
  ON public.ks_company_payment_integrations
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
