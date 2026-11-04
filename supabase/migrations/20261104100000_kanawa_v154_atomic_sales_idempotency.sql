-- KanawaSoft v15.4.3 — atomic POS mirror and strict idempotency.
-- This migration is committed to the feature branch only. Review and apply to a
-- dedicated test database before production. No production migration is run here.

ALTER TABLE public.ks_sales
  ADD COLUMN IF NOT EXISTS idempotency_hash text;

CREATE INDEX IF NOT EXISTS idx_ks_sales_company_idempotency
  ON public.ks_sales(company_id, idempotency_hash)
  WHERE idempotency_hash IS NOT NULL;

-- A POS cashier allowed to create a sale must also be able to write the
-- corresponding finalized POS record. This is scoped only to the vendas store.
DROP POLICY IF EXISTS ks_records_insert_by_module ON public.ks_records;
CREATE POLICY ks_records_insert_by_module ON public.ks_records
FOR INSERT TO authenticated
WITH CHECK (
  private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'criar')
  OR (store_key = 'vendas' AND private.ks_has_company_permission(company_id, 'pdv', 'criar'))
);

DROP POLICY IF EXISTS ks_records_update_by_module ON public.ks_records;
CREATE POLICY ks_records_update_by_module ON public.ks_records
FOR UPDATE TO authenticated
USING (
  private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'editar')
  OR (store_key = 'vendas'
    AND coalesce(payload->>'status','') <> 'finalizada'
    AND (
      private.ks_has_company_permission(company_id, 'vendas', 'criar')
      OR private.ks_has_company_permission(company_id, 'pdv', 'criar')
    ))
)
WITH CHECK (
  private.ks_has_company_permission(company_id, private.ks_module_for_store(store_key), 'editar')
  OR (store_key = 'vendas' AND (
    private.ks_has_company_permission(company_id, 'vendas', 'criar')
    OR private.ks_has_company_permission(company_id, 'pdv', 'criar')
  ))
);

CREATE OR REPLACE FUNCTION public.ks_finalize_sale(
  p_company_id uuid,
  p_sale jsonb,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_external_id text;
  v_invoice text;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_total numeric;
  v_received numeric;
  v_change numeric;
  v_method text;
  v_item jsonb;
  v_record jsonb;
  v_product_id text;
  v_product_name text;
  v_qty numeric;
  v_price numeric;
  v_line_total numeric;
  v_items_subtotal numeric := 0;
  v_line integer := 0;
  v_rows integer;
  v_stock_tracked boolean;
  v_currency text;
  v_fx numeric(24,10);
  v_usd numeric(18,2);
  v_is_credit boolean;
  v_role text;
  v_discount_max numeric(5,2) := 0;
  v_hash text;
  v_source_payload jsonb;
  v_existing public.ks_sales%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.ks_has_company_permission(p_company_id,'pdv','criar')
    OR private.ks_has_company_permission(p_company_id,'vendas','criar')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para finalizar vendas.' USING ERRCODE='42501';
  END IF;

  IF p_sale IS NULL OR jsonb_typeof(p_sale)<>'object' THEN
    RAISE EXCEPTION 'Dados da venda inválidos.' USING ERRCODE='22023';
  END IF;

  v_external_id := nullif(p_sale->>'external_id','');
  v_invoice := nullif(p_sale->>'invoice_number','');
  v_subtotal := coalesce(nullif(p_sale->>'subtotal','')::numeric,0);
  v_discount := coalesce(nullif(p_sale->>'discount_value','')::numeric,0);
  v_tax := coalesce(nullif(p_sale->>'tax_amount','')::numeric,0);
  v_total := coalesce(nullif(p_sale->>'total','')::numeric,0);
  v_received := coalesce(nullif(p_sale->>'amount_received','')::numeric,0);
  v_change := coalesce(nullif(p_sale->>'change_amount','')::numeric,0);
  v_method := coalesce(nullif(p_sale->>'payment_method',''),'não indicado');
  v_is_credit := lower(v_method) IN ('credito','crédito','credit');

  IF v_external_id IS NULL OR v_invoice IS NULL OR
     coalesce(p_sale->>'status','finalizada')<>'finalizada' THEN
    RAISE EXCEPTION 'Identificador, número de factura e estado finalizada são obrigatórios.' USING ERRCODE='22023';
  END IF;

  SELECT m.role INTO v_role
  FROM public.ks_company_memberships m
  WHERE m.company_id=p_company_id AND m.user_id=auth.uid() AND m.status='active';
  v_discount_max := CASE v_role
    WHEN 'owner' THEN 100 WHEN 'admin' THEN 100
    WHEN 'manager' THEN 30 WHEN 'operator' THEN 10 WHEN 'cashier' THEN 5
    ELSE 0
  END;

  -- Monetary inputs must already be expressed in cents. The server does not
  -- silently round submitted totals, discounts, taxes or received amounts.
  IF v_subtotal<=0 OR v_total<=0 OR v_discount<0 OR v_discount>v_subtotal OR v_tax<0 OR
     v_subtotal<>round(v_subtotal,2) OR v_discount<>round(v_discount,2) OR
     v_tax<>round(v_tax,2) OR v_total<>round(v_total,2) OR
     v_received<0 OR v_received<>round(v_received,2) OR
     v_discount>round(v_subtotal*v_discount_max/100,2) OR
     round(v_subtotal-v_discount+v_tax,2)<>v_total THEN
    RAISE EXCEPTION 'Valores da venda inválidos ou desconto acima do limite do perfil.' USING ERRCODE='23514';
  END IF;

  IF v_received=0 AND NOT v_is_credit THEN
    v_received:=v_total;
  END IF;
  IF NOT v_is_credit AND v_received<v_total THEN
    RAISE EXCEPTION 'Pagamento insuficiente.' USING ERRCODE='23514';
  END IF;
  v_change:=greatest(v_received-v_total,0);

  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'A venda precisa de pelo menos um artigo.' USING ERRCODE='22023';
  END IF;

  v_record:=p_sale->'record_payload';
  IF v_record IS NOT NULL AND (
    jsonb_typeof(v_record)<>'object'
    OR nullif(v_record->>'id','') IS DISTINCT FROM v_external_id
    OR coalesce(v_record->>'status','')<>'finalizada'
    OR coalesce(nullif(v_record->>'subtotal','')::numeric,-1)<>v_subtotal
    OR coalesce(nullif(v_record->>'total','')::numeric,-1)<>v_total
    OR coalesce(nullif(v_record->>'descontoValor','')::numeric,
                nullif(v_record->>'discount_value','')::numeric,-1)<>v_discount
    OR coalesce(nullif(v_record->>'iva','')::numeric,
                nullif(v_record->>'tax_amount','')::numeric,-1)<>v_tax
  ) THEN
    RAISE EXCEPTION 'O histórico da venda não corresponde aos valores validados.' USING ERRCODE='23514';
  END IF;

  v_hash:=md5((p_sale-'record_payload')::text || '|' || p_items::text);
  v_source_payload:=(p_sale-'record_payload') ||
    jsonb_build_object('amount_received',v_received,'change_amount',v_change);

  INSERT INTO public.ks_sales(
    company_id,external_id,invoice_number,customer_name,customer_tax_id,customer_phone,
    subtotal,discount_value,tax_amount,total,amount_received,change_amount,payment_method,
    tax_regime,status,notes,operator_name,sold_at,created_by,source_payload,idempotency_hash
  )
  VALUES (
    p_company_id,v_external_id,v_invoice,
    nullif(p_sale->>'customer_name',''),nullif(p_sale->>'customer_tax_id',''),
    nullif(p_sale->>'customer_phone',''),v_subtotal,v_discount,v_tax,v_total,
    v_received,v_change,v_method,nullif(p_sale->>'tax_regime',''),'finalizada',
    nullif(p_sale->>'notes',''),nullif(p_sale->>'operator_name',''),
    coalesce(nullif(p_sale->>'sold_at','')::timestamptz,now()),auth.uid(),
    v_source_payload,v_hash
  )
  ON CONFLICT(company_id,external_id) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;

  IF v_rows=0 THEN
    SELECT * INTO v_existing
    FROM public.ks_sales
    WHERE company_id=p_company_id AND external_id=v_external_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não foi possível recuperar a venda já registada.' USING ERRCODE='40001';
    END IF;
    IF (v_existing.idempotency_hash IS NOT NULL AND v_existing.idempotency_hash<>v_hash)
       OR (v_existing.idempotency_hash IS NULL AND (v_existing.source_payload-'record_payload') IS DISTINCT FROM v_source_payload) THEN
      RAISE EXCEPTION 'Este identificador de venda já foi utilizado com dados diferentes. A operação foi bloqueada.' USING ERRCODE='23505';
    END IF;

    -- Recover a missing legacy mirror without creating another financial or
    -- stock event. A finalized mirror is never overwritten on a retry.
    IF v_record IS NOT NULL THEN
      UPDATE public.ks_records
      SET payload=v_record,updated_at=now()
      WHERE company_id=p_company_id AND store_key='vendas' AND record_id=v_external_id
        AND coalesce(payload->>'status','')<>'finalizada';
      IF NOT FOUND THEN
        INSERT INTO public.ks_records(company_id,store_key,record_id,payload)
        VALUES(p_company_id,'vendas',v_external_id,v_record)
        ON CONFLICT(company_id,store_key,record_id) DO NOTHING;
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'duplicate',true,'external_id',v_external_id,
      'total',v_existing.total,'history_atomic',v_record IS NOT NULL
    );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_line:=v_line+1;
    v_product_id:=nullif(v_item->>'product_external_id','');
    v_product_name:=coalesce(nullif(trim(v_item->>'product_name'),''),'Artigo');
    v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,0);
    v_price:=coalesce(nullif(v_item->>'unit_price','')::numeric,0);
    v_line_total:=coalesce(nullif(v_item->>'line_total','')::numeric,round(v_qty*v_price,2));
    v_stock_tracked:=coalesce((v_item->>'stock_tracked')::boolean,true);

    IF v_product_id IS NULL OR v_qty<=0 OR v_qty<>round(v_qty,3) OR
       v_price<0 OR v_price<>round(v_price,2) OR
       v_line_total<0 OR v_line_total<>round(v_line_total,2) OR
       v_line_total<>round(v_qty*v_price,2) THEN
      RAISE EXCEPTION 'Linha de venda inválida: quantidade, preço ou subtotal não correspondem.' USING ERRCODE='23514';
    END IF;

    v_items_subtotal:=v_items_subtotal+v_line_total;
    IF v_stock_tracked THEN
      -- Conditional UPDATE inside the transaction serializes concurrent sales
      -- and rejects the second cashier when the remaining stock is insufficient.
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

  IF v_items_subtotal<>v_subtotal THEN
    RAISE EXCEPTION 'O subtotal não corresponde exatamente à soma dos artigos.' USING ERRCODE='23514';
  END IF;

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

  -- Persist the module record in the SAME PostgreSQL transaction as the sale,
  -- payments, stock decrement, movement ledger and usage event.
  IF v_record IS NOT NULL THEN
    UPDATE public.ks_records
    SET payload=v_record,updated_at=now()
    WHERE company_id=p_company_id AND store_key='vendas' AND record_id=v_external_id
      AND coalesce(payload->>'status','')<>'finalizada';
    IF NOT FOUND THEN
      INSERT INTO public.ks_records(company_id,store_key,record_id,payload)
      VALUES(p_company_id,'vendas',v_external_id,v_record)
      ON CONFLICT(company_id,store_key,record_id) DO NOTHING;
      GET DIAGNOSTICS v_rows=ROW_COUNT;
      IF v_rows=0 THEN
        RAISE EXCEPTION 'Já existe um registo finalizado com este identificador, mas não existe a venda correspondente.' USING ERRCODE='23505';
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'duplicate',false,'external_id',v_external_id,
    'total',v_total,'history_atomic',v_record IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ks_finalize_sale(uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_finalize_sale(uuid,jsonb,jsonb) TO authenticated;
