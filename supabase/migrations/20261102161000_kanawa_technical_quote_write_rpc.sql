-- v15.4.3 — atomic creation of normalized technical quotes, lines and payment milestones.
-- This migration is feature-branch only. Review and validate on a Supabase development branch before production.

CREATE OR REPLACE FUNCTION public.ks_technical_create_quote(
  p_company_id uuid,
  p_quote jsonb,
  p_lines jsonb,
  p_installments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_quote_id uuid;
  v_external_id text;
  v_quote_number text;
  v_status text;
  v_subtotal numeric(18,2);
  v_discount numeric(18,2);
  v_tax numeric(18,2);
  v_withholding numeric(18,2);
  v_total numeric(18,2);
  v_lines_total numeric(18,2) := 0;
  v_installments_total numeric(10,4) := 0;
  v_line jsonb;
  v_installment jsonb;
  v_line_number integer := 0;
  v_quantity numeric(18,3);
  v_unit_cost numeric(18,4);
  v_unit_price numeric(18,4);
  v_line_total numeric(18,2);
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(
    p_company_id, ARRAY['owner','admin','manager']::text[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar orçamentos técnicos.' USING ERRCODE='42501';
  END IF;

  IF p_quote IS NULL OR jsonb_typeof(p_quote) <> 'object'
     OR p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0
     OR p_installments IS NULL OR jsonb_typeof(p_installments) <> 'array' THEN
    RAISE EXCEPTION 'Dados do orçamento, linhas e tranches inválidos.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_lines) > 250 OR jsonb_array_length(p_installments) > 24 THEN
    RAISE EXCEPTION 'O orçamento excede o limite de linhas ou tranches.' USING ERRCODE='22023';
  END IF;

  v_external_id := nullif(trim(p_quote->>'external_id'),'');
  v_quote_number := nullif(trim(p_quote->>'quote_number'),'');
  v_status := coalesce(nullif(p_quote->>'status',''),'draft');
  v_subtotal := coalesce(nullif(p_quote->>'subtotal','')::numeric,0);
  v_discount := coalesce(nullif(p_quote->>'discount_amount','')::numeric,0);
  v_tax := coalesce(nullif(p_quote->>'tax_amount','')::numeric,0);
  v_withholding := coalesce(nullif(p_quote->>'withholding_amount','')::numeric,0);
  v_total := coalesce(nullif(p_quote->>'total','')::numeric,0);

  IF v_external_id IS NULL OR length(v_external_id)>120
     OR v_quote_number IS NULL OR length(v_quote_number)>80
     OR nullif(trim(p_quote->>'customer_name'),'') IS NULL
     OR nullif(trim(p_quote->>'title'),'') IS NULL
     OR v_status NOT IN ('draft','negotiation') THEN
    RAISE EXCEPTION 'Referência, número, cliente, título ou estado do orçamento inválido.' USING ERRCODE='22023';
  END IF;
  IF v_subtotal<=0 OR v_discount<0 OR v_discount>v_subtotal
     OR v_tax<0 OR v_withholding<0 OR v_total<0
     OR round(v_subtotal-v_discount+v_tax-v_withholding,2)<>v_total THEN
    RAISE EXCEPTION 'Composição financeira do orçamento inválida.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.ks_technical_quotes(
    company_id,external_id,quote_number,customer_name,title,status,currency_code,
    fx_rate,fx_observed_at,labor_cost,labor_price,equipment_cost,consumables_cost,
    travel_cost,per_diem_cost,overhead_percent,contingency_percent,discount_amount,
    tax_rate,withholding_rate,subtotal,tax_amount,withholding_amount,total,valid_until,
    execution_days,scope_included,scope_excluded,technical_description,payment_terms,
    tax_notes,created_by
  ) VALUES (
    p_company_id,v_external_id,v_quote_number,trim(p_quote->>'customer_name'),
    trim(p_quote->>'title'),v_status,coalesce(nullif(p_quote->>'currency_code',''),'AOA'),
    nullif(p_quote->>'fx_rate','')::numeric,nullif(p_quote->>'fx_observed_at','')::timestamptz,
    coalesce(nullif(p_quote->>'labor_cost','')::numeric,0),
    coalesce(nullif(p_quote->>'labor_price','')::numeric,0),
    coalesce(nullif(p_quote->>'equipment_cost','')::numeric,0),
    coalesce(nullif(p_quote->>'consumables_cost','')::numeric,0),
    coalesce(nullif(p_quote->>'travel_cost','')::numeric,0),
    coalesce(nullif(p_quote->>'per_diem_cost','')::numeric,0),
    coalesce(nullif(p_quote->>'overhead_percent','')::numeric,0),
    coalesce(nullif(p_quote->>'contingency_percent','')::numeric,0),
    v_discount,coalesce(nullif(p_quote->>'tax_rate','')::numeric,0),
    coalesce(nullif(p_quote->>'withholding_rate','')::numeric,0),
    v_subtotal,v_tax,v_withholding,v_total,
    nullif(p_quote->>'valid_until','')::date,
    nullif(p_quote->>'execution_days','')::integer,
    nullif(p_quote->>'scope_included',''),nullif(p_quote->>'scope_excluded',''),
    nullif(p_quote->>'technical_description',''),p_installments,
    nullif(p_quote->>'tax_notes',''),(SELECT auth.uid())
  ) RETURNING id INTO v_quote_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_line_number := v_line_number + 1;
    v_quantity := coalesce(nullif(v_line->>'quantity','')::numeric,0);
    v_unit_cost := coalesce(nullif(v_line->>'unit_cost','')::numeric,0);
    v_unit_price := coalesce(nullif(v_line->>'unit_price','')::numeric,0);
    v_line_total := coalesce(nullif(v_line->>'line_total','')::numeric,0);
    IF v_quantity<=0 OR v_unit_cost<0 OR v_unit_price<0 OR v_line_total<0
       OR abs(v_line_total-round(v_quantity*v_unit_price,2))>0.01
       OR nullif(trim(v_line->>'description'),'') IS NULL
       OR coalesce(v_line->>'line_type','') NOT IN ('labor','equipment','consumable','travel','expense','service','product') THEN
      RAISE EXCEPTION 'Linha % do orçamento inválida.',v_line_number USING ERRCODE='23514';
    END IF;
    v_lines_total := v_lines_total + v_line_total;
    INSERT INTO public.ks_technical_quote_lines(
      company_id,quote_id,line_number,line_type,description,quantity,unit,
      unit_cost,unit_price,line_total,metadata
    ) VALUES (
      p_company_id,v_quote_id,v_line_number,v_line->>'line_type',
      trim(v_line->>'description'),v_quantity,
      coalesce(nullif(v_line->>'unit',''),'UN'),v_unit_cost,v_unit_price,
      v_line_total,coalesce(v_line->'metadata','{}'::jsonb)
    );
  END LOOP;

  IF abs(round(v_lines_total,2)-v_subtotal)>0.01 THEN
    RAISE EXCEPTION 'A soma das linhas não corresponde ao subtotal do orçamento.' USING ERRCODE='23514';
  END IF;

  FOR v_installment IN SELECT value FROM jsonb_array_elements(p_installments) LOOP
    v_installments_total := v_installments_total + coalesce(nullif(v_installment->>'percentage','')::numeric,0);
    IF nullif(trim(v_installment->>'milestone'),'') IS NULL
       OR coalesce(nullif(v_installment->>'percentage','')::numeric,0)<=0
       OR coalesce(nullif(v_installment->>'percentage','')::numeric,0)>100 THEN
      RAISE EXCEPTION 'Tranche de pagamento inválida.' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.ks_technical_quote_installments(
      company_id,quote_id,milestone,percentage,amount,due_date
    ) VALUES (
      p_company_id,v_quote_id,trim(v_installment->>'milestone'),
      (v_installment->>'percentage')::numeric,
      round(v_total*(v_installment->>'percentage')::numeric/100,2),
      nullif(v_installment->>'due_date','')::date
    );
  END LOOP;

  IF v_installments_total>100.0001 THEN
    RAISE EXCEPTION 'A soma das tranches não pode ultrapassar 100%%.' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.ks_technical_audit_events(
    company_id,entity_type,entity_id,action,after_data,actor_id
  ) VALUES (
    p_company_id,'technical_quote',v_quote_id,'created',
    jsonb_build_object('external_id',v_external_id,'quote_number',v_quote_number,
      'status',v_status,'subtotal',v_subtotal,'total',v_total),
    (SELECT auth.uid())
  );

  RETURN jsonb_build_object(
    'ok',true,'quote_id',v_quote_id,'external_id',v_external_id,
    'quote_number',v_quote_number,'status',v_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ks_technical_create_quote(uuid,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_technical_create_quote(uuid,jsonb,jsonb,jsonb) TO authenticated;
