-- Ensure hard deletion removes linked e-commerce mirror rows as well.
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
REVOKE ALL ON FUNCTION public.ks_delete_company_product(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_delete_company_product(uuid,text) TO authenticated;
