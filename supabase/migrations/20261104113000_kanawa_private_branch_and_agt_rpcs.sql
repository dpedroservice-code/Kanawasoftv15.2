-- Move privileged branch/AGT implementations into the non-exposed private schema.
-- Public RPCs remain SECURITY INVOKER wrappers and preserve their existing role checks.

CREATE OR REPLACE FUNCTION private.ks_link_company_branch_internal(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_parent_company_id,ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador da empresa-mãe pode solicitar a associação.' USING ERRCODE='42501';
  END IF;
  IF p_parent_company_id IS NULL OR p_branch_company_id IS NULL OR p_parent_company_id=p_branch_company_id THEN
    RAISE EXCEPTION 'Empresa-mãe e filial devem ser diferentes.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ks_companies c WHERE c.id=p_branch_company_id) THEN
    RAISE EXCEPTION 'A empresa filial indicada não existe.' USING ERRCODE='P0002';
  END IF;
  IF EXISTS(SELECT 1 FROM public.ks_company_branches b WHERE b.branch_company_id=p_parent_company_id AND b.status='active') THEN
    RAISE EXCEPTION 'Uma filial não pode ser empresa-mãe de outra filial.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM public.ks_company_branches b WHERE b.branch_company_id=p_branch_company_id AND b.status IN ('pending','active')) THEN
    RAISE EXCEPTION 'Esta empresa já está associada ou tem um pedido pendente.' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.ks_company_branches b WHERE b.parent_company_id=p_branch_company_id AND b.status='active') THEN
    RAISE EXCEPTION 'A empresa indicada já possui filiais e não pode ser associada como filial.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.ks_company_branches(parent_company_id,branch_company_id,status,created_by)
  VALUES(p_parent_company_id,p_branch_company_id,'pending',auth.uid())
  ON CONFLICT(branch_company_id) DO UPDATE SET status='pending',parent_company_id=EXCLUDED.parent_company_id,created_by=auth.uid();
  RETURN jsonb_build_object('ok',true,'status','pending','message','Pedido enviado. A empresa filial deve aceitar a associação.');
END;
$$;
REVOKE ALL ON FUNCTION private.ks_link_company_branch_internal(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ks_link_company_branch_internal(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.ks_link_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.ks_link_company_branch_internal(p_parent_company_id,p_branch_company_id);
$$;
REVOKE ALL ON FUNCTION public.ks_link_company_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ks_link_company_branch(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.ks_accept_company_branch_internal(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ks_company_memberships m WHERE m.company_id=p_branch_company_id AND m.user_id=(SELECT auth.uid())
      AND m.status='active' AND m.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'Apenas o proprietário ou administrador da empresa filial pode aceitar o pedido.' USING ERRCODE='42501'; END IF;
  UPDATE public.ks_company_branches SET status='active'
    WHERE parent_company_id=p_parent_company_id AND branch_company_id=p_branch_company_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido de associação pendente não encontrado.' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('ok',true,'status','active','message','Associação de filial confirmada.');
END;
$$;
REVOKE ALL ON FUNCTION private.ks_accept_company_branch_internal(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ks_accept_company_branch_internal(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.ks_accept_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.ks_accept_company_branch_internal(p_parent_company_id,p_branch_company_id);
$$;
REVOKE ALL ON FUNCTION public.ks_accept_company_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ks_accept_company_branch(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.ks_unlink_company_branch_internal(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.ks_has_company_role(p_parent_company_id,ARRAY['owner','admin']::text[])
    OR EXISTS (SELECT 1 FROM public.ks_company_memberships m WHERE m.company_id=p_branch_company_id
      AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.role IN ('owner','admin'))
  ) THEN RAISE EXCEPTION 'Apenas o proprietário ou administrador de uma das empresas associadas pode remover a ligação.' USING ERRCODE='42501'; END IF;
  UPDATE public.ks_company_branches SET status='inactive'
    WHERE parent_company_id=p_parent_company_id AND branch_company_id=p_branch_company_id AND status IN ('pending','active');
  IF NOT FOUND THEN RAISE EXCEPTION 'Associação de filial não encontrada.' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('ok',true,'status','inactive','message','Acesso cruzado removido.');
END;
$$;
REVOKE ALL ON FUNCTION private.ks_unlink_company_branch_internal(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ks_unlink_company_branch_internal(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.ks_unlink_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.ks_unlink_company_branch_internal(p_parent_company_id,p_branch_company_id);
$$;
REVOKE ALL ON FUNCTION public.ks_unlink_company_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ks_unlink_company_branch(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.ks_save_agt_config_internal(
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
REVOKE ALL ON FUNCTION private.ks_save_agt_config_internal(uuid,text,text,text,text,text,integer,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ks_save_agt_config_internal(uuid,text,text,text,text,text,integer,text,text,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.ks_save_agt_config(
  p_company_id uuid, p_environment text, p_tax_registration_number text, p_product_id text,
  p_product_version text, p_software_validation_number text, p_signature_version integer,
  p_establishment_number text, p_username text, p_password text,
  p_software_private_key_pem text, p_taxpayer_private_key_pem text
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.ks_save_agt_config_internal(p_company_id,p_environment,p_tax_registration_number,p_product_id,
    p_product_version,p_software_validation_number,p_signature_version,p_establishment_number,p_username,p_password,
    p_software_private_key_pem,p_taxpayer_private_key_pem);
$$;
REVOKE ALL ON FUNCTION public.ks_save_agt_config(uuid,text,text,text,text,text,integer,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ks_save_agt_config(uuid,text,text,text,text,text,integer,text,text,text,text,text) TO authenticated;
