CREATE TABLE IF NOT EXISTS public.ks_company_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  branch_company_id uuid NOT NULL UNIQUE REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ks_company_branches_not_self CHECK (parent_company_id <> branch_company_id)
);
CREATE INDEX IF NOT EXISTS ks_company_branches_parent_idx ON public.ks_company_branches(parent_company_id, status);
ALTER TABLE public.ks_company_branches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ks_company_branches FROM anon;
GRANT SELECT ON TABLE public.ks_company_branches TO authenticated;
GRANT ALL ON TABLE public.ks_company_branches TO service_role;

CREATE OR REPLACE FUNCTION private.ks_has_company_role(p_company_id uuid, p_allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT (
    EXISTS (SELECT 1 FROM public.ks_company_memberships m
      WHERE m.company_id=p_company_id AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.role=ANY(p_allowed_roles))
    OR EXISTS (
      SELECT 1 FROM public.ks_company_branches b
      JOIN public.ks_company_memberships m ON (
        (b.parent_company_id=p_company_id AND m.company_id=b.branch_company_id)
        OR (b.branch_company_id=p_company_id AND m.company_id=b.parent_company_id)
      )
      WHERE b.status='active' AND m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.role=ANY(p_allowed_roles)
    )
  )
  AND EXISTS (SELECT 1 FROM public.ks_company_licenses l WHERE l.company_id=p_company_id
    AND ((l.status IN ('trial','active') AND (l.expires_at IS NULL OR l.expires_at>=now() OR (l.grace_until IS NOT NULL AND l.grace_until>=now())))
      OR (l.status='past_due' AND l.grace_until IS NOT NULL AND l.grace_until>=now())));
$function$;

CREATE OR REPLACE FUNCTION private.ks_has_company_permission(p_company_id uuid, p_module text, p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_role text; v_permissions jsonb; v_actions jsonb; v_pos_actions jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL OR p_module IS NULL OR p_action IS NULL THEN RETURN false; END IF;
  SELECT m.role,m.permissions INTO v_role,v_permissions FROM public.ks_company_memberships m
    WHERE m.company_id=p_company_id AND m.user_id=(SELECT auth.uid()) AND m.status='active';
  IF NOT FOUND THEN
    SELECT m.role,m.permissions INTO v_role,v_permissions
    FROM public.ks_company_branches b
    JOIN public.ks_company_memberships m ON (
      (b.parent_company_id=p_company_id AND m.company_id=b.branch_company_id)
      OR (b.branch_company_id=p_company_id AND m.company_id=b.parent_company_id)
    )
    WHERE b.status='active' AND m.user_id=(SELECT auth.uid()) AND m.status='active'
    ORDER BY CASE WHEN b.parent_company_id=p_company_id THEN 0 ELSE 1 END LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT private.ks_has_company_role(p_company_id,ARRAY['owner','admin','manager','operator','cashier','accountant','viewer']::text[]) THEN RETURN false; END IF;
  IF v_role IN ('owner','admin') THEN RETURN true; END IF;
  v_actions:=v_permissions->p_module;
  IF jsonb_typeof(v_actions)='array' AND v_actions ? p_action THEN RETURN true; END IF;
  IF p_action='ver' AND p_module IN ('produtos','clientes') THEN
    v_pos_actions:=v_permissions->'pdv';
    IF jsonb_typeof(v_pos_actions)='array' AND (v_pos_actions ? 'ver' OR v_pos_actions ? 'criar') THEN RETURN true; END IF;
  END IF;
  IF p_module='vendas' AND p_action='criar' THEN
    v_pos_actions:=v_permissions->'pdv';
    IF jsonb_typeof(v_pos_actions)='array' AND v_pos_actions ? 'criar' THEN RETURN true; END IF;
  END IF;
  RETURN false;
END;
$function$;

DROP POLICY IF EXISTS company_read_member ON public.ks_companies;
CREATE POLICY company_read_member ON public.ks_companies FOR SELECT TO authenticated USING (
  owner_user_id=(SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.ks_company_memberships m WHERE m.company_id=ks_companies.id AND m.user_id=(SELECT auth.uid()) AND m.status='active')
  OR EXISTS (
    SELECT 1 FROM public.ks_company_branches b
    JOIN public.ks_company_memberships m ON (
      (b.parent_company_id=ks_companies.id AND m.company_id=b.branch_company_id)
      OR (b.branch_company_id=ks_companies.id AND m.company_id=b.parent_company_id)
    )
    WHERE b.status='active' AND m.user_id=(SELECT auth.uid()) AND m.status='active'
  )
);

DROP POLICY IF EXISTS ks_company_branches_read_related ON public.ks_company_branches;
CREATE POLICY ks_company_branches_read_related ON public.ks_company_branches FOR SELECT TO authenticated USING (
  private.ks_has_company_role(parent_company_id,ARRAY['owner','admin']::text[])
  OR private.ks_has_company_role(branch_company_id,ARRAY['owner','admin']::text[])
);

CREATE OR REPLACE FUNCTION public.ks_link_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_parent_company_id,ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador da empresa-mãe pode associar filiais.' USING ERRCODE='42501';
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
  IF EXISTS(SELECT 1 FROM public.ks_company_branches b WHERE b.branch_company_id=p_branch_company_id AND b.status='active') THEN
    RAISE EXCEPTION 'Esta empresa já está associada a outra empresa-mãe.' USING ERRCODE='23505';
  END IF;
  IF EXISTS(SELECT 1 FROM public.ks_company_branches b WHERE b.parent_company_id=p_branch_company_id AND b.status='active') THEN
    RAISE EXCEPTION 'A empresa indicada já possui filiais e não pode ser associada como filial.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.ks_company_branches(parent_company_id,branch_company_id,status,created_by)
  VALUES(p_parent_company_id,p_branch_company_id,'active',auth.uid())
  ON CONFLICT(branch_company_id) DO UPDATE SET status='active',parent_company_id=EXCLUDED.parent_company_id;
  RETURN jsonb_build_object('ok',true,'parent_company_id',p_parent_company_id,'branch_company_id',p_branch_company_id,'status','active');
END;
$function$;
REVOKE ALL ON FUNCTION public.ks_link_company_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ks_link_company_branch(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ks_unlink_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(p_parent_company_id,ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador da empresa-mãe pode remover filiais.' USING ERRCODE='42501';
  END IF;
  UPDATE public.ks_company_branches SET status='inactive'
    WHERE parent_company_id=p_parent_company_id AND branch_company_id=p_branch_company_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Associação de filial não encontrada.' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('ok',true,'status','inactive');
END;
$function$;
REVOKE ALL ON FUNCTION public.ks_unlink_company_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ks_unlink_company_branch(uuid,uuid) TO authenticated;
