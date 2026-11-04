CREATE OR REPLACE FUNCTION public.ks_save_agt_config(
  p_company_id uuid, p_environment text, p_tax_registration_number text, p_product_id text,
  p_product_version text, p_software_validation_number text, p_signature_version integer,
  p_establishment_number text, p_username text, p_password text,
  p_software_private_key_pem text, p_taxpayer_private_key_pem text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_secret_id uuid; v_credentials jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_company_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador pode configurar a integração AGT.' USING ERRCODE = '42501';
  END IF;
  IF p_environment NOT IN ('hml','prod') THEN RAISE EXCEPTION 'Ambiente AGT inválido.' USING ERRCODE = '22023'; END IF;
  IF coalesce(trim(p_tax_registration_number),'') = '' OR coalesce(trim(p_product_id),'') = '' OR
     coalesce(trim(p_product_version),'') = '' OR coalesce(trim(p_software_validation_number),'') = '' OR
     coalesce(trim(p_establishment_number),'') = '' OR coalesce(trim(p_username),'') = '' OR
     coalesce(p_password,'') = '' OR coalesce(p_software_private_key_pem,'') = '' OR
     coalesce(p_taxpayer_private_key_pem,'') = '' OR p_signature_version IS NULL OR p_signature_version < 1 THEN
    RAISE EXCEPTION 'Todos os campos obrigatórios da integração AGT devem ser preenchidos.' USING ERRCODE = '22023';
  END IF;
  IF p_software_private_key_pem NOT LIKE '-----BEGIN PRIVATE KEY-----%' OR
     p_taxpayer_private_key_pem NOT LIKE '-----BEGIN PRIVATE KEY-----%' THEN
    RAISE EXCEPTION 'As duas chaves devem estar em formato PEM PKCS#8.' USING ERRCODE = '22023';
  END IF;
  SELECT secret_id INTO v_secret_id FROM public.ks_fiscal_integrations WHERE company_id = p_company_id;
  v_credentials := jsonb_build_object('username',p_username,'password',p_password,
    'software_private_key_pem',p_software_private_key_pem,'taxpayer_private_key_pem',p_taxpayer_private_key_pem);
  IF v_secret_id IS NULL THEN
    SELECT vault.create_secret(v_credentials::text,'kanawa-agt-'||p_company_id::text,
      'Credenciais privadas da integração AGT da empresa '||p_company_id::text,NULL::uuid) INTO v_secret_id;
  ELSE
    PERFORM vault.update_secret(v_secret_id,v_credentials::text,'kanawa-agt-'||p_company_id::text,
      'Credenciais privadas da integração AGT da empresa '||p_company_id::text,NULL::uuid);
  END IF;
  INSERT INTO public.ks_fiscal_integrations(company_id,environment,tax_registration_number,product_id,product_version,
    software_validation_number,signature_version,establishment_number,secret_id,status,last_tested_at,last_test_message,updated_at)
  VALUES(p_company_id,p_environment,trim(p_tax_registration_number),trim(p_product_id),trim(p_product_version),
    trim(p_software_validation_number),p_signature_version,trim(p_establishment_number),v_secret_id,'saved_not_tested',NULL,NULL,now())
  ON CONFLICT(company_id) DO UPDATE SET environment=EXCLUDED.environment,
    tax_registration_number=EXCLUDED.tax_registration_number,product_id=EXCLUDED.product_id,
    product_version=EXCLUDED.product_version,software_validation_number=EXCLUDED.software_validation_number,
    signature_version=EXCLUDED.signature_version,establishment_number=EXCLUDED.establishment_number,
    secret_id=EXCLUDED.secret_id,status='saved_not_tested',last_tested_at=NULL,last_test_message=NULL,updated_at=now();
  RETURN jsonb_build_object('ok',true,'status','saved_not_tested');
END;
$$;
REVOKE ALL ON FUNCTION public.ks_save_agt_config(uuid,text,text,text,text,text,integer,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_save_agt_config(uuid,text,text,text,text,text,integer,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ks_get_agt_config_internal(p_company_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'metadata',jsonb_build_object('company_id',f.company_id,'environment',f.environment,
      'tax_registration_number',f.tax_registration_number,'product_id',f.product_id,'product_version',f.product_version,
      'software_validation_number',f.software_validation_number,'signature_version',f.signature_version,
      'establishment_number',f.establishment_number,'status',f.status),
    'credentials',d.decrypted_secret::jsonb)
  FROM public.ks_fiscal_integrations f
  JOIN vault.decrypted_secrets d ON d.id=f.secret_id
  WHERE f.company_id=p_company_id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ks_get_agt_config_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ks_get_agt_config_internal(uuid) TO service_role;
