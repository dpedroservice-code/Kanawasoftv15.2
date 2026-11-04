-- Keep the exposed RPC surface SECURITY INVOKER; privileged work stays in private schema.
CREATE OR REPLACE FUNCTION private.ks_delete_company_product_internal(p_company_id uuid, p_external_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_company_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador pode eliminar produtos permanentemente.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_external_id),'') = '' THEN
    RAISE EXCEPTION 'Identificador do produto inválido.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.ks_stock_movements WHERE company_id = p_company_id AND product_external_id = p_external_id;
  DELETE FROM public.ks_sale_items WHERE company_id = p_company_id AND product_external_id = p_external_id;
  DELETE FROM public.ks_records WHERE company_id = p_company_id
    AND ((store_key = 'produtos' AND record_id = p_external_id)
      OR (store_key = 'ecommerceProdutos' AND
        (record_id = p_external_id OR payload->>'produtoId' = p_external_id OR payload->>'produto_id' = p_external_id
          OR payload->>'productId' = p_external_id OR payload->>'product_id' = p_external_id)));
  DELETE FROM public.ks_products WHERE company_id = p_company_id AND external_id = p_external_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'deleted_products',v_deleted,'linked_ecommerce_records_removed',true);
END;
$$;
REVOKE ALL ON FUNCTION private.ks_delete_company_product_internal(uuid,text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.ks_delete_company_product_internal(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.ks_delete_company_product(p_company_id uuid, p_external_id text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.ks_delete_company_product_internal(p_company_id,p_external_id);
$$;
REVOKE ALL ON FUNCTION public.ks_delete_company_product(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_delete_company_product(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.ks_reset_company_business_data_internal(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_records integer := 0; v_movements integer := 0; v_payments integer := 0;
  v_items integer := 0; v_sales integer := 0; v_products integer := 0; v_customers integer := 0;
  v_secret_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_company_id, ARRAY['owner']::text[]) THEN
    RAISE EXCEPTION 'A reposição total exige a sessão do proprietário da empresa.' USING ERRCODE = '42501';
  END IF;
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
  DELETE FROM public.ks_records WHERE company_id = p_company_id; GET DIAGNOSTICS v_records = ROW_COUNT;
  DELETE FROM public.ks_stock_movements WHERE company_id = p_company_id; GET DIAGNOSTICS v_movements = ROW_COUNT;
  DELETE FROM public.ks_payments WHERE company_id = p_company_id; GET DIAGNOSTICS v_payments = ROW_COUNT;
  DELETE FROM public.ks_sale_items WHERE company_id = p_company_id; GET DIAGNOSTICS v_items = ROW_COUNT;
  DELETE FROM public.ks_sales WHERE company_id = p_company_id; GET DIAGNOSTICS v_sales = ROW_COUNT;
  DELETE FROM public.ks_products WHERE company_id = p_company_id; GET DIAGNOSTICS v_products = ROW_COUNT;
  DELETE FROM public.ks_customers WHERE company_id = p_company_id; GET DIAGNOSTICS v_customers = ROW_COUNT;
  RETURN jsonb_build_object('ok',true,'records',v_records,'stock_movements',v_movements,
    'payments',v_payments,'sale_items',v_items,'sales',v_sales,'products',v_products,'customers',v_customers,
    'api_keys_revoked',true,'payment_and_fiscal_secrets_deleted',true);
END;
$$;
REVOKE ALL ON FUNCTION private.ks_reset_company_business_data_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ks_reset_company_business_data_internal(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.ks_reset_company_business_data(p_company_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.ks_reset_company_business_data_internal(p_company_id);
$$;
REVOKE ALL ON FUNCTION public.ks_reset_company_business_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_reset_company_business_data(uuid) TO authenticated;
