-- v15.4.1 — finance, HR, e-commerce, BOM and security hardening.
-- Apply after 20261102153000_kanawa_v154_technical_operations.sql.

CREATE TABLE IF NOT EXISTS public.ks_technical_quote_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.ks_technical_quotes(id) ON DELETE CASCADE,
  milestone text NOT NULL,
  percentage numeric(8,4) NOT NULL CHECK (percentage > 0 AND percentage <= 100),
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid','overdue','cancelled')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  base_currency text NOT NULL CHECK (base_currency IN ('USD','EUR')),
  quote_currency text NOT NULL DEFAULT 'AOA' CHECK (quote_currency='AOA'),
  rate numeric(18,8) NOT NULL CHECK (rate > 0),
  observed_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  is_approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_regime text NOT NULL DEFAULT 'not_configured',
  effective_from date NOT NULL DEFAULT current_date,
  effective_until date,
  tax_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_reference text,
  verified_by_accountant text,
  verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_customer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('product_order','service_booking','quote_request','repair_tracking')),
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  equipment_model text,
  description text,
  requested_slot timestamptz,
  attachment_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','quoted','scheduled','paid','in_progress','completed','cancelled')),
  quote_id uuid REFERENCES public.ks_technical_quotes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,request_number)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_boms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.ks_technical_products(id) ON DELETE CASCADE,
  version text NOT NULL DEFAULT '1',
  name text NOT NULL,
  output_quantity numeric(18,3) NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,product_id,version)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_bom_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  bom_id uuid NOT NULL REFERENCES public.ks_technical_boms(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.ks_technical_products(id),
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'UN',
  scrap_allowance_percent numeric(8,4) NOT NULL DEFAULT 0 CHECK (scrap_allowance_percent >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES public.ks_technical_work_orders(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  check_in timestamptz NOT NULL,
  check_out timestamptz,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  hours_worked numeric(10,2) GENERATED ALWAYS AS (
    CASE WHEN check_out IS NULL THEN 0
    ELSE greatest(0,extract(epoch FROM (check_out-check_in))/3600 - break_minutes::numeric/60) END
  ) STORED,
  work_description text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out IS NULL OR check_out >= check_in)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','paid','cancelled')),
  legal_parameters_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,period_month)
);

CREATE TABLE IF NOT EXISTS public.ks_technical_payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.ks_technical_payroll_runs(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_external_id text,
  gross_salary numeric(18,2) NOT NULL DEFAULT 0 CHECK (gross_salary >= 0),
  overtime_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (overtime_amount >= 0),
  allowances numeric(18,2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  employee_social_security numeric(18,2) NOT NULL DEFAULT 0 CHECK (employee_social_security >= 0),
  employer_social_security numeric(18,2) NOT NULL DEFAULT 0 CHECK (employer_social_security >= 0),
  work_income_tax numeric(18,2) NOT NULL DEFAULT 0 CHECK (work_income_tax >= 0),
  other_deductions numeric(18,2) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  net_salary numeric(18,2) NOT NULL DEFAULT 0 CHECK (net_salary >= 0),
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ks_technical_cash_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.ks_technical_work_orders(id) ON DELETE SET NULL,
  amount_issued numeric(18,2) NOT NULL CHECK (amount_issued > 0),
  amount_accounted numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount_accounted >= 0),
  currency_code text NOT NULL DEFAULT 'AOA',
  purpose text NOT NULL,
  receipt_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','submitted','reviewed','closed')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ks_technical_bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  bank_account_label text NOT NULL,
  statement_reference text,
  transaction_date date NOT NULL,
  description text,
  amount numeric(18,2) NOT NULL,
  currency_code text NOT NULL DEFAULT 'AOA',
  matched_reference text,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','reviewed','ignored')),
  source_file_path text,
  reconciled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ks_technical_installments_due ON public.ks_technical_quote_installments(company_id,status,due_date);
CREATE INDEX IF NOT EXISTS idx_ks_technical_timesheets_order ON public.ks_technical_timesheets(company_id,work_order_id,check_in);
CREATE INDEX IF NOT EXISTS idx_ks_technical_requests_status ON public.ks_technical_customer_requests(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ks_technical_payroll_period ON public.ks_technical_payroll_runs(company_id,period_month DESC);

-- RLS for additional tables.
DO $policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ks_technical_quote_installments','ks_technical_exchange_rates','ks_technical_tax_profiles',
    'ks_technical_customer_requests','ks_technical_boms','ks_technical_bom_lines',
    'ks_technical_timesheets','ks_technical_payroll_runs','ks_technical_payroll_lines',
    'ks_technical_cash_advances','ks_technical_bank_reconciliations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.ks_has_company_role(company_id, ARRAY[''owner'',''admin'',''manager'',''operator'',''cashier'',''accountant'',''viewer'']::text[]))',t||'_tenant_read',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (private.ks_has_company_role(company_id, ARRAY[''owner'',''admin'',''manager'']::text[])) WITH CHECK (private.ks_has_company_role(company_id, ARRAY[''owner'',''admin'',''manager'']::text[]))',t||'_manager_write',t);
  END LOOP;
END;
$policies$;

-- Payroll is highly sensitive: only owner/admin/manager/accountant can read it;
-- only owner/admin can write/approve it.
DROP POLICY IF EXISTS ks_technical_payroll_runs_tenant_read ON public.ks_technical_payroll_runs;
DROP POLICY IF EXISTS ks_technical_payroll_runs_manager_write ON public.ks_technical_payroll_runs;
DROP POLICY IF EXISTS ks_technical_payroll_lines_tenant_read ON public.ks_technical_payroll_lines;
DROP POLICY IF EXISTS ks_technical_payroll_lines_manager_write ON public.ks_technical_payroll_lines;
CREATE POLICY ks_technical_payroll_runs_finance_read ON public.ks_technical_payroll_runs
FOR SELECT TO authenticated USING (private.ks_has_company_role(company_id,ARRAY['owner','admin','manager','accountant']::text[]));
CREATE POLICY ks_technical_payroll_runs_admin_write ON public.ks_technical_payroll_runs
FOR ALL TO authenticated USING (private.ks_has_company_role(company_id,ARRAY['owner','admin']::text[]))
WITH CHECK (private.ks_has_company_role(company_id,ARRAY['owner','admin']::text[]));
CREATE POLICY ks_technical_payroll_lines_finance_read ON public.ks_technical_payroll_lines
FOR SELECT TO authenticated USING (private.ks_has_company_role(company_id,ARRAY['owner','admin','manager','accountant']::text[]));
CREATE POLICY ks_technical_payroll_lines_admin_write ON public.ks_technical_payroll_lines
FOR ALL TO authenticated USING (private.ks_has_company_role(company_id,ARRAY['owner','admin']::text[]))
WITH CHECK (private.ks_has_company_role(company_id,ARRAY['owner','admin']::text[]));

-- Sensitive ledgers are read-only to browser roles. Mutations go through audited RPCs
-- or trusted service-role webhook handlers, never arbitrary client table updates.
DO $secure$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ks_technical_stock_balances','ks_technical_stock_reservations',
    'ks_technical_stock_movements','ks_technical_work_orders',
    'ks_technical_payment_transactions','ks_technical_audit_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',t||'_manager_write',t);
  END LOOP;
END;
$secure$;

-- Protect quote state transitions even when a manager writes directly to the table.
CREATE OR REPLACE FUNCTION private.ks_guard_technical_quote_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='INSERT' AND NEW.status NOT IN ('draft','negotiation') THEN
    RAISE EXCEPTION 'Orçamentos devem ser criados em rascunho ou negociação.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','converted')
     AND current_setting('app.technical_quote_transition',true) IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'A alteração de estado exige a operação de aprovação/conversão do servidor.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ks_technical_quote_status_guard ON public.ks_technical_quotes;
CREATE TRIGGER ks_technical_quote_status_guard
BEFORE INSERT OR UPDATE OF status ON public.ks_technical_quotes
FOR EACH ROW EXECUTE FUNCTION private.ks_guard_technical_quote_status();

-- RPCs execute with owner privileges only after validating the active tenant and role.
ALTER FUNCTION public.ks_technical_reserve_stock(text,uuid,uuid,jsonb) SECURITY DEFINER;
ALTER FUNCTION public.ks_technical_convert_quote_to_work_order(uuid,text) SECURITY DEFINER;
ALTER FUNCTION public.ks_technical_approve_quote(uuid) SECURITY DEFINER;
ALTER FUNCTION public.ks_technical_release_stock_reservation(uuid,text) SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.ks_technical_approve_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company_id uuid; v_quote public.ks_technical_quotes%ROWTYPE;
BEGIN
  SELECT m.company_id INTO v_company_id FROM public.ks_company_memberships m
  WHERE m.user_id=(SELECT auth.uid()) AND m.status='active' ORDER BY m.created_at LIMIT 1;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar orçamentos técnicos.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_quote FROM public.ks_technical_quotes WHERE id=p_quote_id AND company_id=v_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_quote.status<>'negotiation' THEN RAISE EXCEPTION 'Apenas orçamentos em negociação podem ser aprovados.' USING ERRCODE='23514'; END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until<current_date THEN RAISE EXCEPTION 'A validade da proposta expirou.' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.technical_quote_transition','approved',true);
  UPDATE public.ks_technical_quotes SET status='approved',approved_by=(SELECT auth.uid()),approved_at=now(),updated_at=now()
  WHERE id=v_quote.id AND company_id=v_company_id;
  INSERT INTO public.ks_technical_audit_events(company_id,entity_type,entity_id,action,before_data,after_data,actor_id)
  VALUES(v_company_id,'technical_quote',v_quote.id,'approved',to_jsonb(v_quote),jsonb_build_object('status','approved','approved_at',now()),(SELECT auth.uid()));
  RETURN jsonb_build_object('ok',true,'quote_id',v_quote.id,'status','approved');
END;
$function$;

CREATE OR REPLACE FUNCTION public.ks_technical_convert_quote_to_work_order(p_quote_id uuid,p_order_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company_id uuid; v_quote public.ks_technical_quotes%ROWTYPE; v_order public.ks_technical_work_orders%ROWTYPE;
BEGIN
  SELECT m.company_id INTO v_company_id FROM public.ks_company_memberships m
  WHERE m.user_id=(SELECT auth.uid()) AND m.status='active' ORDER BY m.created_at LIMIT 1;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para converter orçamento em OS.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_quote FROM public.ks_technical_quotes WHERE id=p_quote_id AND company_id=v_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_quote.status NOT IN ('approved','converted') THEN RAISE EXCEPTION 'Apenas orçamentos aprovados podem gerar Ordem de Serviço.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.ks_technical_work_orders(company_id,quote_id,order_number,customer_name,title,scope_snapshot,created_by)
  VALUES(v_company_id,v_quote.id,p_order_number,v_quote.customer_name,v_quote.title,
    jsonb_build_object('scope_included',v_quote.scope_included,'scope_excluded',v_quote.scope_excluded,'technical_description',v_quote.technical_description),
    (SELECT auth.uid()))
  ON CONFLICT(company_id,quote_id) DO NOTHING RETURNING * INTO v_order;
  IF v_order.id IS NULL THEN
    SELECT * INTO v_order FROM public.ks_technical_work_orders WHERE company_id=v_company_id AND quote_id=v_quote.id;
    RETURN jsonb_build_object('ok',true,'duplicate',true,'work_order_id',v_order.id,'order_number',v_order.order_number);
  END IF;
  PERFORM set_config('app.technical_quote_transition','converted',true);
  UPDATE public.ks_technical_quotes SET status='converted',updated_at=now() WHERE id=v_quote.id AND company_id=v_company_id;
  INSERT INTO public.ks_technical_audit_events(company_id,entity_type,entity_id,action,after_data,actor_id)
  VALUES(v_company_id,'technical_quote',v_quote.id,'converted_to_work_order',to_jsonb(v_order),(SELECT auth.uid()));
  RETURN jsonb_build_object('ok',true,'duplicate',false,'work_order_id',v_order.id,'order_number',v_order.order_number);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ks_technical_adjust_stock_balance(
  p_warehouse_id uuid,p_product_id uuid,p_delta numeric,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company_id uuid; v_balance public.ks_technical_stock_balances%ROWTYPE; v_new_qty numeric(18,3);
BEGIN
  SELECT m.company_id INTO v_company_id FROM public.ks_company_memberships m
  WHERE m.user_id=(SELECT auth.uid()) AND m.status='active' ORDER BY m.created_at LIMIT 1;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para ajustar stock técnico.' USING ERRCODE='42501';
  END IF;
  IF p_delta=0 OR p_reason IS NULL OR length(trim(p_reason))<3 THEN
    RAISE EXCEPTION 'Quantidade e motivo do ajuste são obrigatórios.' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.ks_technical_warehouses WHERE id=p_warehouse_id AND company_id=v_company_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Armazém inválido.' USING ERRCODE='23503'; END IF;
  PERFORM 1 FROM public.ks_technical_products WHERE id=p_product_id AND company_id=v_company_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto inválido.' USING ERRCODE='23503'; END IF;
  INSERT INTO public.ks_technical_stock_balances(company_id,warehouse_id,product_id,physical_qty)
  VALUES(v_company_id,p_warehouse_id,p_product_id,0) ON CONFLICT(company_id,warehouse_id,product_id) DO NOTHING;
  SELECT * INTO v_balance FROM public.ks_technical_stock_balances
  WHERE company_id=v_company_id AND warehouse_id=p_warehouse_id AND product_id=p_product_id FOR UPDATE;
  v_new_qty:=v_balance.physical_qty+p_delta;
  IF v_new_qty<v_balance.reserved_qty THEN RAISE EXCEPTION 'O ajuste não pode ficar abaixo da quantidade reservada.' USING ERRCODE='23514'; END IF;
  UPDATE public.ks_technical_stock_balances SET physical_qty=v_new_qty,updated_at=now() WHERE id=v_balance.id;
  INSERT INTO public.ks_technical_stock_movements(company_id,warehouse_id,product_id,movement_type,quantity,reason,created_by)
  VALUES(v_company_id,p_warehouse_id,p_product_id,CASE WHEN p_delta>0 THEN 'receipt' ELSE 'adjustment' END,abs(p_delta),trim(p_reason),(SELECT auth.uid()));
  INSERT INTO public.ks_technical_audit_events(company_id,entity_type,entity_id,action,before_data,after_data,actor_id)
  VALUES(v_company_id,'technical_stock_balance',v_balance.id,'adjusted',
    jsonb_build_object('physical_qty',v_balance.physical_qty,'reserved_qty',v_balance.reserved_qty),
    jsonb_build_object('physical_qty',v_new_qty,'reason',trim(p_reason)),(SELECT auth.uid()));
  RETURN jsonb_build_object('ok',true,'physical_qty',v_new_qty,'reserved_qty',v_balance.reserved_qty,'available_qty',v_new_qty-v_balance.reserved_qty);
END;
$function$;

REVOKE ALL ON FUNCTION public.ks_technical_adjust_stock_balance(uuid,uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_technical_adjust_stock_balance(uuid,uuid,numeric,text) TO authenticated;
