-- Secure team invitation activation and public provider configuration RPCs.
-- Apply only after review in a Supabase preview project.

-- Keep invited memberships pending until Auth confirms the invite email.
CREATE OR REPLACE FUNCTION private.ks_redeem_team_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_code text;
  v_invite public.ks_team_invitations%ROWTYPE;
BEGIN
  v_code := nullif(new.raw_user_meta_data ->> 'invitation_code','');
  IF v_code IS NULL THEN RETURN new; END IF;

  SELECT * INTO v_invite
  FROM public.ks_team_invitations i
  WHERE i.token_hash = encode(extensions.digest(convert_to(v_code,'UTF8'),'sha256'),'hex')
    AND lower(i.email) = lower(new.email)
    AND i.accepted_at IS NULL
    AND i.expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido, expirado ou associado a outro email.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ks_company_memberships(company_id,user_id,role,status,permissions)
  VALUES (v_invite.company_id,new.id,v_invite.role,'invited',v_invite.permissions)
  ON CONFLICT (company_id,user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'invited',
        permissions = EXCLUDED.permissions;

  UPDATE public.ks_team_invitations
  SET accepted_by = new.id, accepted_at = now()
  WHERE id = v_invite.id;

  RETURN new;
END;
$function$;

-- Map endpoints are readable by active members of their own company only.
DROP POLICY IF EXISTS ks_map_settings_admin_all ON public.ks_map_provider_settings;
DROP POLICY IF EXISTS ks_map_settings_admin_insert ON public.ks_map_provider_settings;
DROP POLICY IF EXISTS ks_map_settings_admin_update ON public.ks_map_provider_settings;
DROP POLICY IF EXISTS ks_map_settings_admin_delete ON public.ks_map_provider_settings;
DROP POLICY IF EXISTS ks_map_settings_member_read ON public.ks_map_provider_settings;

CREATE POLICY ks_map_settings_member_read
ON public.ks_map_provider_settings FOR SELECT TO authenticated
USING (private.ks_has_company_role(
  company_id,
  ARRAY['owner','admin','manager','operator','cashier','accountant','viewer']::text[]
));

CREATE POLICY ks_map_settings_admin_insert
ON public.ks_map_provider_settings FOR INSERT TO authenticated
WITH CHECK (private.ks_has_company_role(company_id, ARRAY['owner','admin']::text[]));

CREATE POLICY ks_map_settings_admin_update
ON public.ks_map_provider_settings FOR UPDATE TO authenticated
USING (private.ks_has_company_role(company_id, ARRAY['owner','admin']::text[]))
WITH CHECK (private.ks_has_company_role(company_id, ARRAY['owner','admin']::text[]));

CREATE POLICY ks_map_settings_admin_delete
ON public.ks_map_provider_settings FOR DELETE TO authenticated
USING (private.ks_has_company_role(company_id, ARRAY['owner','admin']::text[]));

CREATE OR REPLACE FUNCTION public.ks_get_map_provider_config()
RETURNS TABLE(provider text, routing_endpoint text, geocoding_endpoint text, is_demo_endpoint boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT m.provider, m.routing_endpoint, m.geocoding_endpoint, m.is_demo_endpoint
  FROM public.ks_map_provider_settings AS m
  JOIN public.ks_company_memberships AS membership ON membership.company_id = m.company_id
  WHERE membership.user_id = (SELECT auth.uid())
    AND membership.status = 'active'
  ORDER BY membership.created_at ASC, m.updated_at DESC
  LIMIT 1;
$function$;

-- Payment provider metadata is visible only to platform administrators.
DROP POLICY IF EXISTS ks_payment_provider_admin_all ON public.ks_payment_provider_settings;
DROP POLICY IF EXISTS ks_payment_provider_admin_select ON public.ks_payment_provider_settings;
DROP POLICY IF EXISTS ks_payment_provider_status_read ON public.ks_payment_provider_settings;
DROP POLICY IF EXISTS ks_payment_provider_admin_insert ON public.ks_payment_provider_settings;
DROP POLICY IF EXISTS ks_payment_provider_admin_update ON public.ks_payment_provider_settings;
DROP POLICY IF EXISTS ks_payment_provider_admin_delete ON public.ks_payment_provider_settings;

CREATE POLICY ks_payment_provider_status_read
ON public.ks_payment_provider_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY ks_payment_provider_admin_insert
ON public.ks_payment_provider_settings FOR INSERT TO authenticated
WITH CHECK (private.ks_is_platform_admin());

CREATE POLICY ks_payment_provider_admin_update
ON public.ks_payment_provider_settings FOR UPDATE TO authenticated
USING (private.ks_is_platform_admin())
WITH CHECK (private.ks_is_platform_admin());

CREATE POLICY ks_payment_provider_admin_delete
ON public.ks_payment_provider_settings FOR DELETE TO authenticated
USING (private.ks_is_platform_admin());

CREATE OR REPLACE FUNCTION public.ks_list_payment_provider_status()
RETURNS TABLE(
  provider_code text,
  display_name text,
  enabled boolean,
  mode text,
  supported_countries text[],
  checkout_url text,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT p.provider_code, p.display_name, p.enabled, p.mode,
         p.supported_countries, p.checkout_url, p.updated_at
  FROM public.ks_payment_provider_settings AS p
  ORDER BY p.display_name;
$function$;

-- Keep the invitation RPC caller-scoped. Auth user existence is checked by the
-- service-role Edge Function when it sends the email, not by querying auth.users
-- from an invoker function.
CREATE OR REPLACE FUNCTION public.ks_create_team_invitation(
  p_email text,
  p_full_name text,
  p_role text,
  p_permissions jsonb,
  p_expires_hours integer DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
BEGIN
  SELECT m.company_id INTO v_company_id
  FROM public.ks_company_memberships m
  WHERE m.user_id = (SELECT auth.uid())
    AND m.status = 'active'
    AND m.role IN ('owner','admin')
  ORDER BY m.created_at
  LIMIT 1;

  IF v_company_id IS NULL
     OR NOT private.ks_has_company_role(v_company_id, ARRAY['owner','admin']::text[]) THEN
    RAISE EXCEPTION 'Apenas o administrador da empresa pode convidar funcionários.' USING ERRCODE = '42501';
  END IF;

  IF p_email IS NULL OR position('@' in p_email) < 2
     OR p_full_name IS NULL OR length(trim(p_full_name)) < 2 THEN
    RAISE EXCEPTION 'Nome e email válidos são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  IF p_role NOT IN ('manager','operator','cashier','accountant','viewer') THEN
    RAISE EXCEPTION 'O administrador não pode criar outra conta de administrador por convite.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ks_team_invitations i
    WHERE lower(i.email) = lower(trim(p_email))
      AND i.company_id = v_company_id
      AND i.accepted_at IS NULL
      AND i.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'Já existe um convite pendente para este email.' USING ERRCODE = '23505';
  END IF;

  PERFORM private.ks_validate_team_permissions(p_permissions);
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := now() + make_interval(hours => greatest(1, least(coalesce(p_expires_hours,72),168)));

  INSERT INTO public.ks_team_invitations(company_id,email,full_name,role,permissions,token_hash,created_by,expires_at)
  VALUES (
    v_company_id, lower(trim(p_email)), trim(p_full_name), p_role, p_permissions,
    encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),
    (SELECT auth.uid()), v_expires
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'email', lower(trim(p_email)),
    'full_name', trim(p_full_name),
    'role', p_role,
    'invitation_code', v_token,
    'expires_at', v_expires
  );
END;
$function$;
