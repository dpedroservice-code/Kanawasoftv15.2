CREATE TABLE IF NOT EXISTS public.ks_fiscal_integrations (
  company_id uuid PRIMARY KEY REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('hml','prod')),
  tax_registration_number text NOT NULL,
  product_id text NOT NULL,
  product_version text NOT NULL,
  software_validation_number text NOT NULL,
  signature_version integer NOT NULL DEFAULT 1 CHECK (signature_version > 0),
  establishment_number text NOT NULL,
  secret_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'saved_not_tested',
  last_tested_at timestamptz,
  last_test_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ks_fiscal_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ks_fiscal_integrations_read_admin ON public.ks_fiscal_integrations;
CREATE POLICY ks_fiscal_integrations_read_admin ON public.ks_fiscal_integrations
  FOR SELECT TO authenticated
  USING (private.ks_has_company_role(company_id, ARRAY['owner','admin']::text[]));
REVOKE ALL ON TABLE public.ks_fiscal_integrations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.ks_fiscal_integrations FROM authenticated;
GRANT SELECT ON TABLE public.ks_fiscal_integrations TO authenticated;
GRANT ALL ON TABLE public.ks_fiscal_integrations TO service_role;
