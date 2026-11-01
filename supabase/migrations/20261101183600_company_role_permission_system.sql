-- Consolidated schema snapshot for Kanawa Soft company roles, employee invitations,
-- per-module permissions, RLS policies, and protected POS stock updates.
-- Production migrations were applied in stages; this file captures the resulting setup.

ALTER TABLE public.ks_company_memberships ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $block$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ks_company_memberships_permissions_object' AND conrelid='public.ks_company_memberships'::regclass) THEN
      ALTER TABLE public.ks_company_memberships ADD CONSTRAINT ks_company_memberships_permissions_object CHECK (jsonb_typeof(permissions)='object');
    END IF;
  END $block$;

CREATE TABLE IF NOT EXISTS public.ks_team_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
    email text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('manager','operator','cashier','accountant','viewer')),
    permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions)='object'),
    token_hash text NOT NULL UNIQUE,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    expires_at timestamptz NOT NULL DEFAULT (now()+interval '72 hours'),
    accepted_by uuid REFERENCES auth.users(id),
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );

CREATE INDEX IF NOT EXISTS ks_team_invitations_company_email_idx ON public.ks_team_invitations(company_id, lower(email), created_at DESC);

ALTER TABLE public.ks_team_invitations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.ks_decrement_stock_for_sale(p_company_id uuid, p_product_id text, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_quantity IS NULL OR p_quantity <= 0
     OR NOT (
       private.ks_has_company_permission(p_company_id,'pdv','criar')
       OR private.ks_has_company_permission(p_company_id,'vendas','criar')
     ) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar stock.' USING ERRCODE='42501';
  END IF;

  UPDATE public.ks_products
  SET stock_quantity = stock_quantity - p_quantity,
      updated_at = now()
  WHERE company_id = p_company_id
    AND external_id = p_product_id
    AND is_active = true
    AND stock_quantity >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock insuficiente ou produto não sincronizado: %', p_product_id USING ERRCODE='23514';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION private.ks_has_company_permission(p_company_id uuid, p_module text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_permissions jsonb;
  v_actions jsonb;
  v_pos_actions jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL OR p_module IS NULL OR p_action IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.role, m.permissions
    INTO v_role, v_permissions
  FROM public.ks_company_memberships m
  WHERE m.company_id = p_company_id
    AND m.user_id = (SELECT auth.uid())
    AND m.status = 'active';

  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT private.ks_has_company_role(
    p_company_id,
    ARRAY['owner','admin','manager','operator','cashier','accountant','viewer']::text[]
  ) THEN
    RETURN false;
  END IF;
  IF v_role IN ('owner','admin') THEN RETURN true; END IF;

  v_actions := v_permissions -> p_module;
  IF jsonb_typeof(v_actions) = 'array' AND v_actions ? p_action THEN
    RETURN true;
  END IF;

  -- POS operators must be able to read product/customer catalogues and save a sale,
  -- without gaining access to those management modules in the application menu.
  IF p_action = 'ver' AND p_module IN ('produtos','clientes') THEN
    v_pos_actions := v_permissions -> 'pdv';
    IF jsonb_typeof(v_pos_actions) = 'array'
       AND (v_pos_actions ? 'ver' OR v_pos_actions ? 'criar') THEN
      RETURN true;
    END IF;
  END IF;

  IF p_module = 'vendas' AND p_action = 'criar' THEN
    v_pos_actions := v_permissions -> 'pdv';
    IF jsonb_typeof(v_pos_actions) = 'array' AND v_pos_actions ? 'criar' THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$


CREATE OR REPLACE FUNCTION private.ks_module_for_store(p_store text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE p_store
    WHEN 'produtos' THEN 'produtos'
    WHEN 'categorias' THEN 'categorias'
    WHEN 'clientes' THEN 'clientes'
    WHEN 'fornecedores' THEN 'fornecedores'
    WHEN 'vendas' THEN 'vendas'
    WHEN 'compras' THEN 'compras'
    WHEN 'estoque' THEN 'estoque'
    WHEN 'movimentacoesEstoque' THEN 'estoque'
    WHEN 'contasReceber' THEN 'financeiro'
    WHEN 'contasPagar' THEN 'financeiro'
    WHEN 'pagamentos' THEN 'financeiro'
    WHEN 'faturas' THEN 'fiscal'
    WHEN 'documentosFiscais' THEN 'fiscal'
    WHEN 'orcamentos' THEN 'orcamentos'
    WHEN 'ecommerce' THEN 'ecommerce'
    WHEN 'ecommerceProdutos' THEN 'ecommerce-produtos'
    WHEN 'ecommercePedidos' THEN 'ecommerce-pedidos'
    WHEN 'ecommerceCarrinhos' THEN 'ecommerce-carrinho'
    WHEN 'promocoes' THEN 'vendas-promocoes'
    WHEN 'tabelasPrecos' THEN 'tabelas-precos'
    WHEN 'vendasConsignadas' THEN 'vendas-consignadas'
    WHEN 'producao' THEN 'producao'
    WHEN 'ordensProducao' THEN 'ordens-producao'
    WHEN 'mrp' THEN 'mrp'
    WHEN 'boms' THEN 'bom'
    WHEN 'custosProducao' THEN 'custos-producao'
    WHEN 'controleQualidade' THEN 'controle-qualidade'
    WHEN 'planosProducao' THEN 'planos-producao'
    WHEN 'ordensServico' THEN 'os'
    WHEN 'ordensManutencao' THEN 'os-manutencao'
    WHEN 'projetos' THEN 'projetos'
    WHEN 'tarefas' THEN 'tarefas'
    WHEN 'ativos' THEN 'ativos'
    WHEN 'frotas' THEN 'frota'
    WHEN 'documentos' THEN 'documentos'
    WHEN 'transportadoras' THEN 'transportadoras'
    WHEN 'contratos' THEN 'contratos'
    WHEN 'tickets' THEN 'tickets'
    WHEN 'notificacoes' THEN 'notificacoes'
    WHEN 'cursos' THEN 'elearning-cursos'
    WHEN 'leads' THEN 'crm'
    WHEN 'campanhas' THEN 'marketing-campanhas'
    WHEN 'servicos' THEN 'servicos'
    ELSE p_store
  END;
$function$


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
  VALUES (v_invite.company_id,new.id,v_invite.role,'active',v_invite.permissions)
  ON CONFLICT (company_id,user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'active',
        permissions = EXCLUDED.permissions;

  UPDATE public.ks_team_invitations
  SET accepted_by = new.id, accepted_at = now()
  WHERE id = v_invite.id;

  RETURN new;
END;
$function$


CREATE OR REPLACE FUNCTION private.ks_validate_team_permissions(p_permissions jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_entry record;
  v_action jsonb;
  v_allowed text[] := ARRAY['ver','criar','editar','excluir','exportar','importar','aprovar','cancelar','configurar'];
BEGIN
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'object' THEN
    RAISE EXCEPTION 'Formato de permissões inválido.' USING ERRCODE = '22023';
  END IF;
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_permissions) LOOP
    IF v_entry.key !~ '^[a-z0-9-]{1,80}$'
       OR v_entry.key = ANY(ARRAY['usuarios','auditoria','config','modulos','licencas','integracoes']) THEN
      RAISE EXCEPTION 'O módulo % é reservado ao administrador.', v_entry.key USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(v_entry.value) <> 'array' THEN
      RAISE EXCEPTION 'As permissões do módulo % devem ser uma lista.', v_entry.key USING ERRCODE = '22023';
    END IF;
    FOR v_action IN SELECT value FROM jsonb_array_elements(v_entry.value) LOOP
      IF jsonb_typeof(v_action) <> 'string'
         OR NOT ((v_action #>> '{}') = ANY(v_allowed)) THEN
        RAISE EXCEPTION 'Ação de permissão inválida no módulo %.', v_entry.key USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$function$


CREATE OR REPLACE FUNCTION public.ks_create_team_invitation(p_email text, p_full_name text, p_role text, p_permissions jsonb, p_expires_hours integer DEFAULT 72)
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

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email)=lower(trim(p_email))) THEN
    RAISE EXCEPTION 'Este email já possui uma conta Kanawa. Utilize o acesso de funcionário existente.' USING ERRCODE = '23505';
  END IF;

  IF p_role NOT IN ('manager','operator','cashier','accountant','viewer') THEN
    RAISE EXCEPTION 'O administrador não pode criar outra conta de administrador por convite.' USING ERRCODE = '42501';
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
$function$


CREATE OR REPLACE FUNCTION public.ks_finalize_sale(p_company_id uuid, p_sale jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_external_id text := nullif(p_sale->>'external_id','');
  v_invoice text := nullif(p_sale->>'invoice_number','');
  v_subtotal numeric(18,2) := coalesce((p_sale->>'subtotal')::numeric,0);
  v_discount numeric(18,2) := coalesce((p_sale->>'discount_value')::numeric,0);
  v_tax numeric(18,2) := coalesce((p_sale->>'tax_amount')::numeric,0);
  v_total numeric(18,2) := coalesce((p_sale->>'total')::numeric,0);
  v_received numeric(18,2) := coalesce((p_sale->>'amount_received')::numeric,0);
  v_change numeric(18,2) := coalesce((p_sale->>'change_amount')::numeric,0);
  v_method text := coalesce(nullif(p_sale->>'payment_method',''),'não indicado');
  v_item jsonb;
  v_product_id text;
  v_product_name text;
  v_qty numeric(18,3);
  v_price numeric(18,2);
  v_line_total numeric(18,2);
  v_line integer := 0;
  v_rows integer;
  v_stock_tracked boolean;
  v_currency text;
  v_fx numeric(24,10);
  v_usd numeric(18,2);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.ks_has_company_permission(p_company_id,'pdv','criar')
    OR private.ks_has_company_permission(p_company_id,'vendas','criar')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para finalizar vendas.' USING ERRCODE='42501';
  END IF;

  IF p_sale IS NULL OR jsonb_typeof(p_sale)<>'object' OR v_external_id IS NULL OR v_invoice IS NULL THEN
    RAISE EXCEPTION 'Dados e número da factura obrigatórios.' USING ERRCODE='22023';
  END IF;
  IF v_total<=0 OR v_subtotal<0 OR v_discount<0 OR v_discount>v_subtotal OR v_tax<0 OR v_received<0 OR v_change<0 THEN
    RAISE EXCEPTION 'Valores da venda inválidos.' USING ERRCODE='23514';
  END IF;
  IF coalesce(p_sale->>'status','finalizada')<>'finalizada' THEN
    RAISE EXCEPTION 'Só vendas finalizadas podem ser lançadas.' USING ERRCODE='23514';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'A venda precisa de pelo menos um artigo.' USING ERRCODE='22023';
  END IF;
  IF v_received<=0 AND lower(v_method) NOT IN ('credito','crédito','credit') THEN
    v_received:=v_total;
  END IF;

  INSERT INTO public.ks_sales(
    company_id,external_id,invoice_number,customer_name,customer_tax_id,customer_phone,
    subtotal,discount_value,tax_amount,total,amount_received,change_amount,payment_method,
    tax_regime,status,notes,operator_name,sold_at,created_by,source_payload
  )
  VALUES (
    p_company_id,v_external_id,v_invoice,
    nullif(p_sale->>'customer_name',''),nullif(p_sale->>'customer_tax_id',''),
    nullif(p_sale->>'customer_phone',''),v_subtotal,v_discount,v_tax,v_total,
    v_received,v_change,v_method,nullif(p_sale->>'tax_regime',''),'finalizada',
    nullif(p_sale->>'notes',''),nullif(p_sale->>'operator_name',''),
    coalesce(nullif(p_sale->>'sold_at','')::timestamptz,now()),auth.uid(),p_sale
  )
  ON CONFLICT(company_id,external_id) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows=0 THEN
    RETURN jsonb_build_object('ok',true,'duplicate',true,'external_id',v_external_id);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line:=v_line+1;
    v_product_id:=nullif(v_item->>'product_external_id','');
    v_product_name:=coalesce(nullif(trim(v_item->>'product_name'),''),'Artigo');
    v_qty:=coalesce((v_item->>'quantity')::numeric,0);
    v_price:=coalesce((v_item->>'unit_price')::numeric,0);
    v_line_total:=coalesce((v_item->>'line_total')::numeric,round(v_qty*v_price,2));
    v_stock_tracked:=coalesce((v_item->>'stock_tracked')::boolean,true);
    IF v_qty<=0 OR v_price<0 OR v_line_total<0 THEN
      RAISE EXCEPTION 'Linha de venda inválida.' USING ERRCODE='23514';
    END IF;
    IF v_stock_tracked THEN
      PERFORM private.ks_decrement_stock_for_sale(p_company_id,v_product_id,v_qty);
    END IF;
    INSERT INTO public.ks_sale_items(
      company_id,sale_external_id,line_number,product_external_id,product_name,
      unit_price,quantity,line_total,stock_tracked
    )
    VALUES(p_company_id,v_external_id,v_line,v_product_id,v_product_name,v_price,v_qty,v_line_total,v_stock_tracked);

    IF v_stock_tracked THEN
      INSERT INTO public.ks_stock_movements(
        company_id,external_id,product_external_id,sale_external_id,movement_type,quantity,reason,created_by
      )
      VALUES(p_company_id,v_external_id||':sale:'||v_line::text,v_product_id,v_external_id,'sale',v_qty,'Venda '||v_invoice,auth.uid());
    END IF;
  END LOOP;

  IF v_received>0 THEN
    INSERT INTO public.ks_payments(company_id,external_id,sale_external_id,amount,method,status,created_by)
    VALUES(p_company_id,v_external_id||':payment:1',v_external_id,v_received,v_method,'received',auth.uid());
  END IF;

  SELECT currency_code INTO v_currency FROM public.ks_companies WHERE id=p_company_id;
  IF v_currency='USD' THEN
    v_usd:=v_total;
  ELSE
    SELECT rate INTO v_fx FROM public.ks_exchange_rates
    WHERE company_id=p_company_id AND base_currency=v_currency AND quote_currency='USD'
    ORDER BY observed_at DESC LIMIT 1;
    IF v_fx IS NOT NULL THEN v_usd:=round(v_total*v_fx,2); END IF;
  END IF;

  INSERT INTO public.ks_usage_events(
    company_id,event_type,quantity,amount_usd,amount_local,currency_code,reference_id,created_by
  )
  VALUES(p_company_id,'invoice_finalized',1,v_usd,v_total,v_currency,v_external_id,auth.uid());

  RETURN jsonb_build_object('ok',true,'duplicate',false,'external_id',v_external_id,'total',v_total);
END;
$function$


CREATE OR REPLACE FUNCTION public.ks_update_team_member_access(p_user_id uuid, p_role text, p_permissions jsonb, p_status text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_updated public.ks_company_memberships%ROWTYPE;
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
    RAISE EXCEPTION 'Apenas o administrador pode alterar acessos.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Não pode alterar o próprio acesso por esta operação.' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('manager','operator','cashier','accountant','viewer')
     OR p_status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'Perfil ou estado inválido.' USING ERRCODE = '22023';
  END IF;
  PERFORM private.ks_validate_team_permissions(p_permissions);

  UPDATE public.ks_company_memberships
  SET role = p_role, permissions = p_permissions, status = p_status
  WHERE company_id = v_company_id
    AND user_id = p_user_id
    AND role NOT IN ('owner','admin')
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Funcionário não encontrado ou protegido.' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_updated.user_id,
    'role', v_updated.role,
    'status', v_updated.status,
    'permissions', v_updated.permissions
  );
END;
$function$


DROP TRIGGER IF EXISTS a_ks_redeem_team_invitation ON auth.users;
CREATE TRIGGER a_ks_redeem_team_invitation AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.ks_redeem_team_invitation();

DROP POLICY IF EXISTS ks_company_locales_admin_all ON public.ks_company_locales;
CREATE POLICY ks_company_locales_admin_all ON public.ks_company_locales AS PERMISSIVE FOR ALL TO authenticated USING (private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS ks_company_preferences_admin_all ON public.ks_company_preferences;
CREATE POLICY ks_company_preferences_admin_all ON public.ks_company_preferences AS PERMISSIVE FOR ALL TO authenticated USING (private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS ks_customers_delete_by_permission ON public.ks_customers;
CREATE POLICY ks_customers_delete_by_permission ON public.ks_customers AS PERMISSIVE FOR DELETE TO authenticated USING (private.ks_has_company_permission(company_id, 'clientes'::text, 'excluir'::text));

DROP POLICY IF EXISTS ks_customers_insert_by_permission ON public.ks_customers;
CREATE POLICY ks_customers_insert_by_permission ON public.ks_customers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.ks_has_company_permission(company_id, 'clientes'::text, 'criar'::text));

DROP POLICY IF EXISTS ks_customers_read_by_permission ON public.ks_customers;
CREATE POLICY ks_customers_read_by_permission ON public.ks_customers AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_permission(company_id, 'clientes'::text, 'ver'::text));

DROP POLICY IF EXISTS ks_customers_update_by_permission ON public.ks_customers;
CREATE POLICY ks_customers_update_by_permission ON public.ks_customers AS PERMISSIVE FOR UPDATE TO authenticated USING (private.ks_has_company_permission(company_id, 'clientes'::text, 'editar'::text)) WITH CHECK (private.ks_has_company_permission(company_id, 'clientes'::text, 'editar'::text));

DROP POLICY IF EXISTS ks_exchange_rates_read_by_permission ON public.ks_exchange_rates;
CREATE POLICY ks_exchange_rates_read_by_permission ON public.ks_exchange_rates AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_permission(company_id, 'financeiro'::text, 'ver'::text));

DROP POLICY IF EXISTS ks_exchange_rates_write_by_permission ON public.ks_exchange_rates;
CREATE POLICY ks_exchange_rates_write_by_permission ON public.ks_exchange_rates AS PERMISSIVE FOR ALL TO authenticated USING (private.ks_has_company_permission(company_id, 'financeiro'::text, 'editar'::text)) WITH CHECK (private.ks_has_company_permission(company_id, 'financeiro'::text, 'editar'::text));

DROP POLICY IF EXISTS ks_map_settings_admin_all ON public.ks_map_provider_settings;
CREATE POLICY ks_map_settings_admin_all ON public.ks_map_provider_settings AS PERMISSIVE FOR ALL TO authenticated USING (private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])) WITH CHECK (private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS ks_memberships_platform_admin_read ON public.ks_company_memberships;
CREATE POLICY ks_memberships_platform_admin_read ON public.ks_company_memberships AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_is_platform_admin());

DROP POLICY IF EXISTS ks_payments_insert_by_permission ON public.ks_payments;
CREATE POLICY ks_payments_insert_by_permission ON public.ks_payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((private.ks_has_company_permission(company_id, 'vendas'::text, 'criar'::text) OR private.ks_has_company_permission(company_id, 'pdv'::text, 'criar'::text)));

DROP POLICY IF EXISTS ks_payments_read_by_permission ON public.ks_payments;
CREATE POLICY ks_payments_read_by_permission ON public.ks_payments AS PERMISSIVE FOR SELECT TO authenticated USING ((private.ks_has_company_permission(company_id, 'vendas'::text, 'ver'::text) OR private.ks_has_company_permission(company_id, 'financeiro'::text, 'ver'::text)));

DROP POLICY IF EXISTS ks_products_delete_by_permission ON public.ks_products;
CREATE POLICY ks_products_delete_by_permission ON public.ks_products AS PERMISSIVE FOR DELETE TO authenticated USING (private.ks_has_company_permission(company_id, 'produtos'::text, 'excluir'::text));

DROP POLICY IF EXISTS ks_products_insert_by_permission ON public.ks_products;
CREATE POLICY ks_products_insert_by_permission ON public.ks_products AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.ks_has_company_permission(company_id, 'produtos'::text, 'criar'::text));

DROP POLICY IF EXISTS ks_products_read_by_permission ON public.ks_products;
CREATE POLICY ks_products_read_by_permission ON public.ks_products AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_permission(company_id, 'produtos'::text, 'ver'::text));

DROP POLICY IF EXISTS ks_products_update_by_permission ON public.ks_products;
CREATE POLICY ks_products_update_by_permission ON public.ks_products AS PERMISSIVE FOR UPDATE TO authenticated USING (private.ks_has_company_permission(company_id, 'produtos'::text, 'editar'::text)) WITH CHECK (private.ks_has_company_permission(company_id, 'produtos'::text, 'editar'::text));

DROP POLICY IF EXISTS ks_records_delete_by_module ON public.ks_records;
CREATE POLICY ks_records_delete_by_module ON public.ks_records AS PERMISSIVE FOR DELETE TO authenticated USING (private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'excluir'::text));

DROP POLICY IF EXISTS ks_records_insert_by_module ON public.ks_records;
CREATE POLICY ks_records_insert_by_module ON public.ks_records AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'criar'::text));

DROP POLICY IF EXISTS ks_records_select_by_module ON public.ks_records;
CREATE POLICY ks_records_select_by_module ON public.ks_records AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'ver'::text));

DROP POLICY IF EXISTS ks_records_update_by_module ON public.ks_records;
CREATE POLICY ks_records_update_by_module ON public.ks_records AS PERMISSIVE FOR UPDATE TO authenticated USING (private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'editar'::text)) WITH CHECK (private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'editar'::text));

DROP POLICY IF EXISTS ks_sale_items_insert_by_permission ON public.ks_sale_items;
CREATE POLICY ks_sale_items_insert_by_permission ON public.ks_sale_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((private.ks_has_company_permission(company_id, 'vendas'::text, 'criar'::text) OR private.ks_has_company_permission(company_id, 'pdv'::text, 'criar'::text)));

DROP POLICY IF EXISTS ks_sale_items_read_by_permission ON public.ks_sale_items;
CREATE POLICY ks_sale_items_read_by_permission ON public.ks_sale_items AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_permission(company_id, 'vendas'::text, 'ver'::text));

DROP POLICY IF EXISTS ks_sales_insert_by_permission ON public.ks_sales;
CREATE POLICY ks_sales_insert_by_permission ON public.ks_sales AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((private.ks_has_company_permission(company_id, 'vendas'::text, 'criar'::text) OR private.ks_has_company_permission(company_id, 'pdv'::text, 'criar'::text)));

DROP POLICY IF EXISTS ks_sales_read_by_permission ON public.ks_sales;
CREATE POLICY ks_sales_read_by_permission ON public.ks_sales AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_permission(company_id, 'vendas'::text, 'ver'::text));

DROP POLICY IF EXISTS ks_stock_movements_insert_by_permission ON public.ks_stock_movements;
CREATE POLICY ks_stock_movements_insert_by_permission ON public.ks_stock_movements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((private.ks_has_company_permission(company_id, 'estoque'::text, 'editar'::text) OR private.ks_has_company_permission(company_id, 'pdv'::text, 'criar'::text) OR private.ks_has_company_permission(company_id, 'vendas'::text, 'criar'::text)));

DROP POLICY IF EXISTS ks_stock_movements_read_by_permission ON public.ks_stock_movements;
CREATE POLICY ks_stock_movements_read_by_permission ON public.ks_stock_movements AS PERMISSIVE FOR SELECT TO authenticated USING ((private.ks_has_company_permission(company_id, 'estoque'::text, 'ver'::text) OR private.ks_has_company_permission(company_id, 'vendas'::text, 'ver'::text)));

DROP POLICY IF EXISTS ks_tax_rules_read_by_permission ON public.ks_tax_rules;
CREATE POLICY ks_tax_rules_read_by_permission ON public.ks_tax_rules AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_permission(company_id, 'fiscal'::text, 'ver'::text));

DROP POLICY IF EXISTS ks_tax_rules_write_by_permission ON public.ks_tax_rules;
CREATE POLICY ks_tax_rules_write_by_permission ON public.ks_tax_rules AS PERMISSIVE FOR ALL TO authenticated USING (private.ks_has_company_permission(company_id, 'fiscal'::text, 'editar'::text)) WITH CHECK (private.ks_has_company_permission(company_id, 'fiscal'::text, 'editar'::text));

DROP POLICY IF EXISTS ks_team_invitations_admin_insert ON public.ks_team_invitations;
CREATE POLICY ks_team_invitations_admin_insert ON public.ks_team_invitations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (role <> ALL (ARRAY['owner'::text, 'admin'::text])) AND private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]) AND private.ks_validate_team_permissions(permissions)));

DROP POLICY IF EXISTS ks_team_invitations_admin_select ON public.ks_team_invitations;
CREATE POLICY ks_team_invitations_admin_select ON public.ks_team_invitations AS PERMISSIVE FOR SELECT TO authenticated USING (private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS membership_read_company_admin ON public.ks_company_memberships;
CREATE POLICY membership_read_company_admin ON public.ks_company_memberships AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text])));

DROP POLICY IF EXISTS membership_read_self ON public.ks_company_memberships;
CREATE POLICY membership_read_self ON public.ks_company_memberships AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS membership_update_company_admin ON public.ks_company_memberships;
CREATE POLICY membership_update_company_admin ON public.ks_company_memberships AS PERMISSIVE FOR UPDATE TO authenticated USING (((role <> ALL (ARRAY['owner'::text, 'admin'::text])) AND private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]))) WITH CHECK (((role <> ALL (ARRAY['owner'::text, 'admin'::text])) AND private.ks_has_company_role(company_id, ARRAY['owner'::text, 'admin'::text]) AND private.ks_validate_team_permissions(permissions)));

REVOKE ALL ON public.ks_team_invitations FROM anon, authenticated;
GRANT SELECT, INSERT ON public.ks_team_invitations TO authenticated;
GRANT UPDATE ON public.ks_company_memberships TO authenticated;
REVOKE ALL ON FUNCTION public.ks_create_team_invitation(text,text,text,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_create_team_invitation(text,text,text,jsonb,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.ks_update_team_member_access(uuid,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_update_team_member_access(uuid,text,jsonb,text) TO authenticated;
REVOKE ALL ON FUNCTION public.ks_finalize_sale(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_finalize_sale(uuid,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private.ks_has_company_permission(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ks_has_company_permission(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION private.ks_module_for_store(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ks_module_for_store(text) TO authenticated;
REVOKE ALL ON FUNCTION private.ks_validate_team_permissions(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ks_validate_team_permissions(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION private.ks_decrement_stock_for_sale(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.ks_decrement_stock_for_sale(uuid,text,numeric) TO authenticated;