-- Kanawa Soft finalization: durable deletion/reset, private API keys and payment integrations.
CREATE TABLE IF NOT EXISTS public.ks_store_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  purpose text NOT NULL CHECK (length(trim(purpose)) BETWEEN 5 AND 500),
  key_prefix text NOT NULL,
  secret_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['catalog:read']::text[],
  allowed_origins text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ks_store_api_keys_company_idx ON public.ks_store_api_keys(company_id);
ALTER TABLE public.ks_store_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ks_store_api_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ks_store_api_keys TO service_role;

CREATE TABLE IF NOT EXISTS public.ks_company_payment_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  provider_code text NOT NULL,
  display_name text NOT NULL,
  purpose text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox','production','manual')),
  public_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_id uuid,
  status text NOT NULL DEFAULT 'saved_not_tested',
  last_tested_at timestamptz,
  last_test_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider_code)
);
ALTER TABLE public.ks_company_payment_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ks_company_payment_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ks_company_payment_integrations TO service_role;

CREATE OR REPLACE FUNCTION public.ks_delete_company_product(p_company_id uuid, p_external_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_company_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador pode eliminar produtos permanentemente.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_external_id),'') = '' THEN
    RAISE EXCEPTION 'Identificador do produto inválido.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.ks_stock_movements
   WHERE company_id = p_company_id AND product_external_id = p_external_id;
  DELETE FROM public.ks_sale_items
   WHERE company_id = p_company_id AND product_external_id = p_external_id;
  DELETE FROM public.ks_records
   WHERE company_id = p_company_id
     AND ((store_key = 'produtos' AND record_id = p_external_id)
       OR (store_key = 'ecommerceProdutos' AND
           (payload->>'produtoId' = p_external_id OR payload->>'produto_id' = p_external_id)));
  DELETE FROM public.ks_products
   WHERE company_id = p_company_id AND external_id = p_external_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted_products', v_deleted);
END;
$$;
REVOKE ALL ON FUNCTION public.ks_delete_company_product(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_delete_company_product(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ks_reset_company_business_data(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_records integer := 0;
  v_movements integer := 0;
  v_payments integer := 0;
  v_items integer := 0;
  v_sales integer := 0;
  v_products integer := 0;
  v_customers integer := 0;
  v_secret_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_company_id, ARRAY['owner']::text[]) THEN
    RAISE EXCEPTION 'A reposição total exige a sessão do proprietário da empresa.' USING ERRCODE = '42501';
  END IF;
  -- Reposição completa também revoga chaves de loja e elimina credenciais de integração.
  FOR v_secret_id IN
    SELECT secret_id FROM public.ks_company_payment_integrations WHERE company_id = p_company_id AND secret_id IS NOT NULL
    UNION
    SELECT secret_id FROM public.ks_fiscal_integrations WHERE company_id = p_company_id AND secret_id IS NOT NULL
  LOOP
    PERFORM vault.delete_secret(v_secret_id);
  END LOOP;
  DELETE FROM public.ks_store_api_keys WHERE company_id = p_company_id;
  DELETE FROM public.ks_company_payment_integrations WHERE company_id = p_company_id;
  DELETE FROM public.ks_fiscal_integrations WHERE company_id = p_company_id;
  DELETE FROM public.ks_records WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_records = ROW_COUNT;
  DELETE FROM public.ks_stock_movements WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_movements = ROW_COUNT;
  DELETE FROM public.ks_payments WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_payments = ROW_COUNT;
  DELETE FROM public.ks_sale_items WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_items = ROW_COUNT;
  DELETE FROM public.ks_sales WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_sales = ROW_COUNT;
  DELETE FROM public.ks_products WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_products = ROW_COUNT;
  DELETE FROM public.ks_customers WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_customers = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'records',v_records,'stock_movements',v_movements,
    'payments',v_payments,'sale_items',v_items,'sales',v_sales,'products',v_products,'customers',v_customers);
END;
$$;
REVOKE ALL ON FUNCTION public.ks_reset_company_business_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_reset_company_business_data(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ks_save_company_payment_internal(
  p_company_id uuid, p_provider_code text, p_display_name text, p_purpose text,
  p_enabled boolean, p_mode text, p_public_config jsonb, p_secret jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_secret_id uuid; v_existing uuid;
BEGIN
  IF p_mode NOT IN ('sandbox','production','manual') THEN RAISE EXCEPTION 'Modo de pagamento inválido.' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ks_companies WHERE id = p_company_id) THEN RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '22023'; END IF;
  SELECT secret_id INTO v_existing FROM public.ks_company_payment_integrations
    WHERE company_id = p_company_id AND provider_code = p_provider_code;
  IF p_secret IS NOT NULL AND p_secret <> '{}'::jsonb THEN
    IF v_existing IS NULL THEN
      SELECT vault.create_secret(p_secret::text,'kanawa-payment-'||p_company_id::text||'-'||p_provider_code,
        'Credenciais de pagamento Kanawa Soft',NULL::uuid) INTO v_secret_id;
    ELSE
      PERFORM vault.update_secret(v_existing,p_secret::text,'kanawa-payment-'||p_company_id::text||'-'||p_provider_code,
        'Credenciais de pagamento Kanawa Soft',NULL::uuid);
      v_secret_id := v_existing;
    END IF;
  ELSE
    v_secret_id := v_existing;
  END IF;
  INSERT INTO public.ks_company_payment_integrations(company_id,provider_code,display_name,purpose,enabled,mode,public_config,secret_id,status,updated_at)
  VALUES(p_company_id,p_provider_code,p_display_name,p_purpose,p_enabled,p_mode,coalesce(p_public_config,'{}'::jsonb),v_secret_id,
    CASE WHEN p_secret IS NOT NULL AND p_secret <> '{}'::jsonb THEN 'saved_not_tested' ELSE 'metadata_saved' END,now())
  ON CONFLICT(company_id,provider_code) DO UPDATE SET display_name=EXCLUDED.display_name,purpose=EXCLUDED.purpose,
    enabled=EXCLUDED.enabled,mode=EXCLUDED.mode,public_config=EXCLUDED.public_config,
    secret_id=coalesce(EXCLUDED.secret_id,public.ks_company_payment_integrations.secret_id),
    status=EXCLUDED.status,last_tested_at=NULL,last_test_message=NULL,updated_at=now();
  RETURN jsonb_build_object('ok',true,'status','saved_not_tested');
END;
$$;
REVOKE ALL ON FUNCTION public.ks_save_company_payment_internal(uuid,text,text,text,boolean,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ks_save_company_payment_internal(uuid,text,text,text,boolean,text,jsonb,jsonb) TO service_role;
