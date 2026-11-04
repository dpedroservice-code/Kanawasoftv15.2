ALTER TABLE public.ks_company_branches DROP CONSTRAINT IF EXISTS ks_company_branches_status_check;
ALTER TABLE public.ks_company_branches ADD CONSTRAINT ks_company_branches_status_check CHECK (status IN ('pending','active','inactive'));
DROP POLICY IF EXISTS ks_company_branches_read_related ON public.ks_company_branches;
CREATE POLICY ks_company_branches_read_related ON public.ks_company_branches FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.ks_company_memberships m WHERE m.company_id=ks_company_branches.parent_company_id AND m.user_id=(SELECT auth.uid()) AND m.status='active')
  OR EXISTS (SELECT 1 FROM public.ks_company_memberships m WHERE m.company_id=ks_company_branches.branch_company_id AND m.user_id=(SELECT auth.uid()) AND m.status='active')
);
CREATE OR REPLACE FUNCTION public.ks_link_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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
END; $function$;

CREATE OR REPLACE FUNCTION public.ks_accept_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ks_company_memberships m WHERE m.company_id=p_branch_company_id AND m.user_id=(SELECT auth.uid())
      AND m.status='active' AND m.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'Apenas o proprietário ou administrador da empresa filial pode aceitar o pedido.' USING ERRCODE='42501'; END IF;
  UPDATE public.ks_company_branches SET status='active'
    WHERE parent_company_id=p_parent_company_id AND branch_company_id=p_branch_company_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido de associação pendente não encontrado.' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('ok',true,'status','active','message','Associação de filial confirmada.');
END; $function$;
REVOKE ALL ON FUNCTION public.ks_accept_company_branch(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ks_accept_company_branch(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ks_unlink_company_branch(p_parent_company_id uuid,p_branch_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
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
END; $function$;
