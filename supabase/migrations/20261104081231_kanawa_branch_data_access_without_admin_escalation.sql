CREATE OR REPLACE FUNCTION private.ks_has_company_role(p_company_id uuid, p_allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ks_company_memberships m
    WHERE m.company_id=p_company_id AND m.user_id=(SELECT auth.uid())
      AND m.status='active' AND m.role=ANY(p_allowed_roles)
  )
  AND EXISTS (
    SELECT 1 FROM public.ks_company_licenses l
    WHERE l.company_id=p_company_id
      AND (
        (l.status IN ('trial','active') AND (l.expires_at IS NULL OR l.expires_at>=now() OR (l.grace_until IS NOT NULL AND l.grace_until>=now())))
        OR (l.status='past_due' AND l.grace_until IS NOT NULL AND l.grace_until>=now())
      )
  );
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
    FROM public.ks_company_branches b JOIN public.ks_company_memberships m ON (
      (b.parent_company_id=p_company_id AND m.company_id=b.branch_company_id)
      OR (b.branch_company_id=p_company_id AND m.company_id=b.parent_company_id)
    )
    WHERE b.status='active' AND m.user_id=(SELECT auth.uid()) AND m.status='active'
    ORDER BY CASE WHEN b.parent_company_id=p_company_id THEN 0 ELSE 1 END LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ks_company_licenses l WHERE l.company_id=p_company_id
    AND ((l.status IN ('trial','active') AND (l.expires_at IS NULL OR l.expires_at>=now() OR (l.grace_until IS NOT NULL AND l.grace_until>=now())))
      OR (l.status='past_due' AND l.grace_until IS NOT NULL AND l.grace_until>=now()))) THEN RETURN false; END IF;
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