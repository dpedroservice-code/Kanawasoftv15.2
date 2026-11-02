-- KanawaSoft v15.4 — normalized technical operations schema
-- Tenant-scoped tables and transactional stock/OS primitives.
-- This migration is committed to the feature branch only; apply to Supabase after review.

CREATE TABLE IF NOT EXISTS public.ks_technical_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  axis text NOT NULL CHECK (axis IN ('product','service','customer_contract','diagnostic','quote')),
  parent_id uuid REFERENCES public.ks_technical_categories(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, axis, code)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  external_id text,
  category_id uuid REFERENCES public.ks_technical_categories(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('spare_part','consumable','equipment','kit')),
  base_currency text NOT NULL DEFAULT 'AOA' CHECK (base_currency IN ('AOA','USD','EUR')),
  base_cost numeric(18,4) NOT NULL DEFAULT 0 CHECK (base_cost >= 0),
  fx_rate numeric(18,8) CHECK (fx_rate IS NULL OR fx_rate > 0),
  fx_observed_at timestamptz,
  cost_aoa numeric(18,2) CHECK (cost_aoa IS NULL OR cost_aoa >= 0),
  direct_price_aoa numeric(18,2) NOT NULL DEFAULT 0 CHECK (direct_price_aoa >= 0),
  technical_price_aoa numeric(18,2) NOT NULL DEFAULT 0 CHECK (technical_price_aoa >= 0),
  purchase_unit text NOT NULL DEFAULT 'UN',
  consumption_unit text NOT NULL DEFAULT 'UN',
  conversion_factor numeric(18,6) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  tracking_mode text NOT NULL DEFAULT 'none' CHECK (tracking_mode IN ('none','serial','lot')),
  warranty_months integer NOT NULL DEFAULT 0 CHECK (warranty_months >= 0),
  minimum_stock numeric(18,3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_id),
  UNIQUE(company_id, sku)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_product_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ks_technical_products(id) ON DELETE CASCADE,
  brand text NOT NULL,
  model text,
  serial_range text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ks_technical_products(id) ON DELETE CASCADE,
  supplier_id bigint,
  supplier_name text NOT NULL,
  supplier_sku text,
  currency_code text NOT NULL DEFAULT 'AOA' CHECK (currency_code IN ('AOA','USD','EUR')),
  unit_cost numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  lead_time_days integer NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
  is_preferred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  external_id text,
  category_id uuid REFERENCES public.ks_technical_categories(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  billing_unit text NOT NULL DEFAULT 'hour' CHECK (billing_unit IN ('hour','man_hour','fixed','travel_diagnostic')),
  normal_cost_hour numeric(18,2) NOT NULL DEFAULT 0 CHECK (normal_cost_hour >= 0),
  normal_price_hour numeric(18,2) NOT NULL DEFAULT 0 CHECK (normal_price_hour >= 0),
  overtime_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK (overtime_multiplier >= 0),
  night_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK (night_multiplier >= 0),
  weekend_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK (weekend_multiplier >= 0),
  standard_hours numeric(10,2) NOT NULL DEFAULT 0 CHECK (standard_hours >= 0),
  response_sla_hours numeric(10,2) CHECK (response_sla_hours IS NULL OR response_sla_hours >= 0),
  minimum_team_size integer NOT NULL DEFAULT 1 CHECK (minimum_team_size > 0),
  required_skill text,
  consumables jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_and_ppe jsonb NOT NULL DEFAULT '[]'::jsonb,
  procedure_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  quote_number text NOT NULL,
  customer_id uuid,
  customer_name text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','negotiation','approved','rejected','expired','cancelled','converted')),
  currency_code text NOT NULL DEFAULT 'AOA' CHECK (currency_code IN ('AOA','USD','EUR')),
  fx_rate numeric(18,8),
  fx_observed_at timestamptz,
  labor_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (labor_cost >= 0),
  labor_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (labor_price >= 0),
  equipment_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (equipment_cost >= 0),
  consumables_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (consumables_cost >= 0),
  travel_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (travel_cost >= 0),
  per_diem_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (per_diem_cost >= 0),
  overhead_percent numeric(8,4) NOT NULL DEFAULT 0 CHECK (overhead_percent >= 0),
  contingency_percent numeric(8,4) NOT NULL DEFAULT 0 CHECK (contingency_percent >= 0),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  withholding_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK (withholding_rate >= 0),
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  withholding_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (withholding_amount >= 0),
  total numeric(18,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  valid_until date,
  execution_days integer CHECK (execution_days IS NULL OR execution_days >= 0),
  scope_included text,
  scope_excluded text,
  technical_description text,
  payment_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  tax_notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, external_id),
  UNIQUE(company_id, quote_number)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.ks_technical_quotes(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  line_type text NOT NULL CHECK (line_type IN ('labor','equipment','consumable','travel','expense','service','product')),
  product_id uuid REFERENCES public.ks_technical_products(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.ks_technical_services(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(18,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'UN',
  unit_cost numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit_price numeric(18,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(quote_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  warehouse_type text NOT NULL DEFAULT 'central' CHECK (warehouse_type IN ('central','workshop','vehicle','field')),
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.ks_technical_warehouses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ks_technical_products(id) ON DELETE CASCADE,
  physical_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK (physical_qty >= 0),
  reserved_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  in_transit_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK (in_transit_qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, warehouse_id, product_id),
  CHECK (reserved_qty <= physical_qty)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  reference_type text NOT NULL CHECK (reference_type IN ('quote','work_order','ecommerce_order','production')),
  reference_id uuid NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES public.ks_technical_warehouses(id),
  product_id uuid NOT NULL REFERENCES public.ks_technical_products(id),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','consumed','released','expired')),
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, reference_type, reference_id, warehouse_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.ks_technical_warehouses(id),
  product_id uuid NOT NULL REFERENCES public.ks_technical_products(id),
  movement_type text NOT NULL CHECK (movement_type IN ('receipt','transfer_in','transfer_out','reserve','release','consume','return','scrap','adjustment')),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  reference_type text,
  reference_id uuid,
  serial_number text,
  lot_number text,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.ks_technical_quotes(id),
  order_number text NOT NULL,
  customer_name text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending_planning' CHECK (status IN ('pending_planning','scheduled','in_progress','quality_control','completed','cancelled','warranty')),
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  standard_hours numeric(10,2) NOT NULL DEFAULT 0,
  actual_hours numeric(10,2) NOT NULL DEFAULT 0,
  first_time_fix boolean,
  assigned_team jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, quote_id),
  UNIQUE(company_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES public.ks_technical_work_orders(id) ON DELETE SET NULL,
  evaluation_type text NOT NULL CHECK (evaluation_type IN ('diagnostic','customer_feedback','warranty_incident','technician_performance')),
  customer_name text,
  equipment_name text,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  diagnosis text,
  recommendation text,
  punctuality smallint CHECK (punctuality BETWEEN 1 AND 5),
  organization_rating smallint CHECK (organization_rating BETWEEN 1 AND 5),
  technical_knowledge smallint CHECK (technical_knowledge BETWEEN 1 AND 5),
  value_rating smallint CHECK (value_rating BETWEEN 1 AND 5),
  overall_rating smallint CHECK (overall_rating BETWEEN 1 AND 5),
  customer_comment text,
  signature_storage_path text,
  signed_at timestamptz,
  actual_hours numeric(10,2) CHECK (actual_hours IS NULL OR actual_hours >= 0),
  scrap_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK (scrap_quantity >= 0),
  scrap_reason text,
  first_time_fix boolean,
  management_alert boolean GENERATED ALWAYS AS (overall_rating IS NOT NULL AND overall_rating < 3) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  product_id uuid REFERENCES public.ks_technical_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','waiting_components','in_progress','quality_control','completed','cancelled')),
  bom_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  routing_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  material_cost numeric(18,2) NOT NULL DEFAULT 0,
  overhead_cost numeric(18,2) NOT NULL DEFAULT 0,
  scrap_cost numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_price_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  customer_segment text NOT NULL DEFAULT 'spot' CHECK (customer_segment IN ('contract','spot','reseller')),
  currency_code text NOT NULL DEFAULT 'AOA' CHECK (currency_code IN ('AOA','USD','EUR')),
  markup_by_category jsonb NOT NULL DEFAULT '{}'::jsonb,
  volume_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  zone_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  time_multipliers jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from date,
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  reference_type text NOT NULL CHECK (reference_type IN ('quote','invoice','ecommerce_order')),
  reference_id uuid NOT NULL,
  provider_code text NOT NULL,
  provider_reference text,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL DEFAULT 'AOA',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','paid','failed','expired','refunded','reconciled')),
  idempotency_key text NOT NULL,
  provider_payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider_code, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  tracking_code text NOT NULL,
  reference_type text NOT NULL CHECK (reference_type IN ('delivery','repair')),
  reference_id uuid,
  status text NOT NULL,
  description text,
  carrier_name text,
  public_token_hash text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  proof_storage_path text,
  signed_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ks_technical_staff_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_external_id text,
  skill_code text NOT NULL,
  skill_level text NOT NULL CHECK (skill_level IN ('junior','mid','senior','engineer','specialist')),
  certificate_name text,
  issuer text,
  valid_until date,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ks_technical_quotes_company_status ON public.ks_technical_quotes(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_technical_quote_lines_quote ON public.ks_technical_quote_lines(company_id,quote_id);
CREATE INDEX IF NOT EXISTS idx_ks_technical_stock_product ON public.ks_technical_stock_balances(company_id,product_id);
CREATE INDEX IF NOT EXISTS idx_ks_technical_reservations_reference ON public.ks_technical_stock_reservations(company_id,reference_type,reference_id,status);
CREATE INDEX IF NOT EXISTS idx_ks_technical_work_orders_status ON public.ks_technical_work_orders(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_technical_tracking_code ON public.ks_technical_tracking_events(company_id,tracking_code,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_technical_staff_expiry ON public.ks_technical_staff_skills(company_id,valid_until);

-- All technical records are private to active members of their own tenant.
DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ks_technical_categories','ks_technical_products','ks_technical_product_compatibility',
    'ks_technical_product_suppliers','ks_technical_services','ks_technical_quotes',
    'ks_technical_quote_lines','ks_technical_warehouses','ks_technical_stock_balances',
    'ks_technical_stock_reservations','ks_technical_stock_movements','ks_technical_work_orders',
    'ks_technical_evaluations','ks_technical_production_orders','ks_technical_price_tables',
    'ks_technical_payment_transactions','ks_technical_tracking_events','ks_technical_staff_skills',
    'ks_technical_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_tenant_read',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.ks_has_company_role(company_id, ARRAY[''owner'',''admin'',''manager'',''operator'',''cashier'',''accountant'',''viewer'']::text[]))',t||'_tenant_read',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_manager_write',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (private.ks_has_company_role(company_id, ARRAY[''owner'',''admin'',''manager'']::text[])) WITH CHECK (private.ks_has_company_role(company_id, ARRAY[''owner'',''admin'',''manager'']::text[]))',t||'_manager_write',t);
  END LOOP;
END;
$policies$;

-- A reservation is one atomic operation: lock balance rows, check available quantity,
-- create idempotent reservations and update reserved quantity in the same transaction.
CREATE OR REPLACE FUNCTION public.ks_technical_reserve_stock(
  p_reference_type text,
  p_reference_id uuid,
  p_warehouse_id uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric(18,3);
  v_available numeric(18,3);
  v_reserved integer := 0;
BEGIN
  SELECT m.company_id INTO v_company_id
  FROM public.ks_company_memberships m
  WHERE m.user_id=(SELECT auth.uid()) AND m.status='active'
  ORDER BY m.created_at LIMIT 1;

  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para reservar stock técnico.' USING ERRCODE='42501';
  END IF;
  IF p_reference_type NOT IN ('quote','work_order','ecommerce_order','production')
     OR p_reference_id IS NULL OR p_warehouse_id IS NULL
     OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Dados de reserva inválidos.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ks_technical_warehouses w WHERE w.id=p_warehouse_id AND w.company_id=v_company_id AND w.is_active) THEN
    RAISE EXCEPTION 'Armazém inválido.' USING ERRCODE='23503';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty<=0 THEN RAISE EXCEPTION 'Quantidade de reserva inválida.' USING ERRCODE='23514'; END IF;

    PERFORM 1 FROM public.ks_technical_stock_balances b
    WHERE b.company_id=v_company_id AND b.warehouse_id=p_warehouse_id AND b.product_id=v_product_id
    FOR UPDATE;
    SELECT physical_qty-reserved_qty INTO v_available
    FROM public.ks_technical_stock_balances
    WHERE company_id=v_company_id AND warehouse_id=p_warehouse_id AND product_id=v_product_id;

    IF v_available IS NULL OR v_available<v_qty THEN
      RAISE EXCEPTION 'Stock técnico insuficiente para o produto %.',v_product_id USING ERRCODE='23514';
    END IF;

    INSERT INTO public.ks_technical_stock_reservations(
      company_id,reference_type,reference_id,warehouse_id,product_id,quantity,created_by
    ) VALUES(v_company_id,p_reference_type,p_reference_id,p_warehouse_id,v_product_id,v_qty,(SELECT auth.uid()))
    ON CONFLICT(company_id,reference_type,reference_id,warehouse_id,product_id) DO NOTHING;

    IF FOUND THEN
      UPDATE public.ks_technical_stock_balances
      SET reserved_qty=reserved_qty+v_qty,updated_at=now()
      WHERE company_id=v_company_id AND warehouse_id=p_warehouse_id AND product_id=v_product_id;
      INSERT INTO public.ks_technical_stock_movements(
        company_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,reason,created_by
      ) VALUES(v_company_id,p_warehouse_id,v_product_id,'reserve',v_qty,p_reference_type,p_reference_id,'Reserva operacional',(SELECT auth.uid()));
      v_reserved:=v_reserved+1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'created_reservations',v_reserved,'reference_id',p_reference_id);
END;
$function$;

-- Conversion is idempotent and tenant-scoped; a unique quote_id prevents duplicate OS records.
CREATE OR REPLACE FUNCTION public.ks_technical_convert_quote_to_work_order(
  p_quote_id uuid,
  p_order_number text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_quote public.ks_technical_quotes%ROWTYPE;
  v_order public.ks_technical_work_orders%ROWTYPE;
BEGIN
  SELECT m.company_id INTO v_company_id
  FROM public.ks_company_memberships m
  WHERE m.user_id=(SELECT auth.uid()) AND m.status='active'
  ORDER BY m.created_at LIMIT 1;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para converter orçamento em OS.' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_quote FROM public.ks_technical_quotes
  WHERE id=p_quote_id AND company_id=v_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_quote.status NOT IN ('approved','converted') THEN
    RAISE EXCEPTION 'Apenas orçamentos aprovados podem gerar Ordem de Serviço.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.ks_technical_work_orders(
    company_id,quote_id,order_number,customer_name,title,standard_hours,scope_snapshot,created_by
  ) VALUES(
    v_company_id,v_quote.id,p_order_number,v_quote.customer_name,v_quote.title,
    coalesce((SELECT sum(quantity) FROM public.ks_technical_quote_lines WHERE company_id=v_company_id AND quote_id=v_quote.id AND line_type='labor'),0),
    jsonb_build_object('scope_included',v_quote.scope_included,'scope_excluded',v_quote.scope_excluded,'technical_description',v_quote.technical_description),
    (SELECT auth.uid())
  )
  ON CONFLICT(company_id,quote_id) DO NOTHING
  RETURNING * INTO v_order;

  IF v_order.id IS NULL THEN
    SELECT * INTO v_order FROM public.ks_technical_work_orders WHERE company_id=v_company_id AND quote_id=v_quote.id;
    RETURN jsonb_build_object('ok',true,'duplicate',true,'work_order_id',v_order.id,'order_number',v_order.order_number);
  END IF;

  UPDATE public.ks_technical_quotes SET status='converted',updated_at=now() WHERE id=v_quote.id AND company_id=v_company_id;
  INSERT INTO public.ks_technical_audit_events(company_id,entity_type,entity_id,action,after_data,actor_id)
  VALUES(v_company_id,'technical_quote',v_quote.id,'converted_to_work_order',to_jsonb(v_order),(SELECT auth.uid()));

  RETURN jsonb_build_object('ok',true,'duplicate',false,'work_order_id',v_order.id,'order_number',v_order.order_number);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ks_technical_reserve_stock(text,uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ks_technical_convert_quote_to_work_order(uuid,text) TO authenticated;
