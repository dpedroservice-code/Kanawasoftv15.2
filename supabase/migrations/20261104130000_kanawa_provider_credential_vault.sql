-- KanawaSoft provider credential vault.
-- API credentials are encrypted by a server-side Edge Function and never readable by browser roles.

CREATE TABLE IF NOT EXISTS public.ks_company_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  provider_code text NOT NULL CHECK (provider_code IN (
    'bank_api','card_gateway','multicaixa_express','whatsapp_cloud','smtp_gmail',
    'agt','maps','carrier_macon','carrier_cfl','carrier_cfb','ncarga'
  )),
  secret_ciphertext text NOT NULL CHECK (length(secret_ciphertext) BETWEEN 24 AND 65536),
  secret_nonce text NOT NULL CHECK (length(secret_nonce) = 16),
  key_version smallint NOT NULL DEFAULT 1 CHECK (key_version > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'
      AND NOT (metadata ?| ARRAY['secret','token','api_key','password','authorization','private_key'])),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider_code)
);

CREATE INDEX IF NOT EXISTS ks_company_provider_credentials_company_idx
  ON public.ks_company_provider_credentials(company_id, provider_code);

ALTER TABLE public.ks_company_provider_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ks_company_provider_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ks_company_provider_credentials TO service_role;

CREATE OR REPLACE FUNCTION public.ks_list_company_provider_credentials(p_company_id uuid)
RETURNS TABLE(provider_code text, metadata jsonb, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(
    p_company_id, ARRAY['owner','admin']::text[]
  ) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador pode consultar integrações.' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    SELECT c.provider_code,c.metadata,c.updated_at
    FROM public.ks_company_provider_credentials c
    WHERE c.company_id=p_company_id
    ORDER BY c.provider_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.ks_list_company_provider_credentials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_list_company_provider_credentials(uuid) TO authenticated;
