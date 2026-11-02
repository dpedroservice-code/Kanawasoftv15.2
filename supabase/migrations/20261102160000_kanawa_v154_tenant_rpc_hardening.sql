-- v15.4.2 — tenant resolution hardening for privileged technical RPCs.
-- Resolve the tenant from the target resource, never from an arbitrary first membership.
-- Fail closed when the referenced business object is not present in that tenant.

CREATE OR REPLACE FUNCTION public.ks_technical_reserve_stock(
  p_reference_type text,p_reference_id uuid,p_warehouse_id uuid,p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid; v_item jsonb; v_product_id uuid; v_qty numeric(18,3);
  v_available numeric(18,3); v_existing public.ks_technical_stock_reservations%ROWTYPE;
  v_reserved integer:=0; v_inserted boolean;
BEGIN
  SELECT w.company_id INTO v_company_id FROM public.ks_technical_warehouses w
  WHERE w.id=p_warehouse_id AND w.is_active;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para reservar stock técnico.' USING ERRCODE='42501';
  END IF;
  IF p_reference_type NOT IN ('quote','work_order','production')
     OR p_reference_id IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Tipo de referência ou dados de reserva inválidos.' USING ERRCODE='22023';
  END IF;
  IF p_reference_type='quote' AND NOT EXISTS(
    SELECT 1 FROM public.ks_technical_quotes q WHERE q.id=p_reference_id AND q.company_id=v_company_id AND q.status IN ('negotiation','approved')
  ) THEN RAISE EXCEPTION 'Orçamento inválido para reserva.' USING ERRCODE='23503'; END IF;
  IF p_reference_type='work_order' AND NOT EXISTS(
    SELECT 1 FROM public.ks_technical_work_orders w WHERE w.id=p_reference_id AND w.company_id=v_company_id AND w.status NOT IN ('cancelled','completed')
  ) THEN RAISE EXCEPTION 'Ordem de Serviço inválida para reserva.' USING ERRCODE='23503'; END IF;
  IF p_reference_type='production' AND NOT EXISTS(
    SELECT 1 FROM public.ks_technical_production_orders p WHERE p.id=p_reference_id AND p.company_id=v_company_id AND p.status NOT IN ('cancelled','completed')
  ) THEN RAISE EXCEPTION 'Ordem de produção inválida para reserva.' USING ERRCODE='23503'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_product_id := (v_item->>'product_id')::uuid;
      v_qty := (v_item->>'quantity')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Produto ou quantidade inválidos na reserva.' USING ERRCODE='22023';
    END;
    IF v_qty IS NULL OR v_qty<=0 OR NOT EXISTS(
      SELECT 1 FROM public.ks_technical_products p WHERE p.id=v_product_id AND p.company_id=v_company_id AND p.is_active
    ) THEN RAISE EXCEPTION 'Produto ou quantidade inválidos na reserva.' USING ERRCODE='23514'; END IF;

    SELECT * INTO v_existing FROM public.ks_technical_stock_reservations
    WHERE company_id=v_company_id AND reference_type=p_reference_type AND reference_id=p_reference_id
      AND warehouse_id=p_warehouse_id AND product_id=v_product_id FOR UPDATE;
    IF FOUND THEN
      IF v_existing.status='reserved' AND v_existing.quantity=v_qty THEN CONTINUE; END IF;
      IF v_existing.status NOT IN ('released','expired') THEN
        RAISE EXCEPTION 'Já existe uma reserva activa ou consumida com outra quantidade.' USING ERRCODE='23505';
      END IF;
    END IF;

    PERFORM 1 FROM public.ks_technical_stock_balances b
    WHERE b.company_id=v_company_id AND b.warehouse_id=p_warehouse_id AND b.product_id=v_product_id FOR UPDATE;
    SELECT physical_qty-reserved_qty INTO v_available FROM public.ks_technical_stock_balances
    WHERE company_id=v_company_id AND warehouse_id=p_warehouse_id AND product_id=v_product_id;
    IF v_available IS NULL OR v_available<v_qty THEN
      RAISE EXCEPTION 'Stock técnico insuficiente para o produto %.',v_product_id USING ERRCODE='23514';
    END IF;

    IF v_existing.id IS NOT NULL THEN
      UPDATE public.ks_technical_stock_reservations
      SET quantity=v_qty,status='reserved',created_by=(SELECT auth.uid()),created_at=now()
      WHERE id=v_existing.id;
      v_inserted:=true;
    ELSE
      INSERT INTO public.ks_technical_stock_reservations(
        company_id,reference_type,reference_id,warehouse_id,product_id,quantity,created_by
      ) VALUES(v_company_id,p_reference_type,p_reference_id,p_warehouse_id,v_product_id,v_qty,(SELECT auth.uid()))
      ON CONFLICT(company_id,reference_type,reference_id,warehouse_id,product_id) DO NOTHING;
      v_inserted:=FOUND;
    END IF;
    IF v_inserted THEN
      UPDATE public.ks_technical_stock_balances SET reserved_qty=reserved_qty+v_qty,updated_at=now()
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

CREATE OR REPLACE FUNCTION public.ks_technical_release_stock_reservation(
  p_reservation_id uuid,p_reason text DEFAULT 'Reserva libertada'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company_id uuid; v_res public.ks_technical_stock_reservations%ROWTYPE;
BEGIN
  SELECT r.company_id INTO v_company_id FROM public.ks_technical_stock_reservations r WHERE r.id=p_reservation_id;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para libertar reservas de stock.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_res FROM public.ks_technical_stock_reservations
  WHERE id=p_reservation_id AND company_id=v_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_res.status<>'reserved' THEN RETURN jsonb_build_object('ok',true,'duplicate',true,'status',v_res.status); END IF;
  PERFORM 1 FROM public.ks_technical_stock_balances
  WHERE company_id=v_company_id AND warehouse_id=v_res.warehouse_id AND product_id=v_res.product_id FOR UPDATE;
  UPDATE public.ks_technical_stock_balances SET reserved_qty=reserved_qty-v_res.quantity,updated_at=now()
  WHERE company_id=v_company_id AND warehouse_id=v_res.warehouse_id AND product_id=v_res.product_id
    AND reserved_qty>=v_res.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo reservado inconsistente; operação cancelada.' USING ERRCODE='23514'; END IF;
  UPDATE public.ks_technical_stock_reservations SET status='released' WHERE id=v_res.id;
  INSERT INTO public.ks_technical_stock_movements(
    company_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,reason,created_by
  ) VALUES(v_company_id,v_res.warehouse_id,v_res.product_id,'release',v_res.quantity,v_res.reference_type,v_res.reference_id,
    coalesce(nullif(trim(p_reason),''),'Reserva libertada'),(SELECT auth.uid()));
  RETURN jsonb_build_object('ok',true,'duplicate',false,'status','released');
END;
$function$;

CREATE OR REPLACE FUNCTION public.ks_technical_approve_quote(p_quote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company_id uuid; v_quote public.ks_technical_quotes%ROWTYPE;
BEGIN
  SELECT q.company_id INTO v_company_id FROM public.ks_technical_quotes q WHERE q.id=p_quote_id;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar este orçamento.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_quote FROM public.ks_technical_quotes WHERE id=p_quote_id AND company_id=v_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_quote.status<>'negotiation' THEN RAISE EXCEPTION 'Apenas orçamentos em negociação podem ser aprovados.' USING ERRCODE='23514'; END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until<current_date THEN RAISE EXCEPTION 'A validade da proposta expirou.' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.technical_quote_transition','approved',true);
  UPDATE public.ks_technical_quotes SET status='approved',approved_by=(SELECT auth.uid()),approved_at=now(),updated_at=now()
  WHERE id=v_quote.id AND company_id=v_company_id;
  INSERT INTO public.ks_technical_audit_events(company_id,entity_type,entity_id,action,before_data,after_data,actor_id)
  VALUES(v_company_id,'technical_quote',v_quote.id,'approved',to_jsonb(v_quote),
    jsonb_build_object('status','approved','approved_at',now()),(SELECT auth.uid()));
  RETURN jsonb_build_object('ok',true,'quote_id',v_quote.id,'status','approved');
END;
$function$;

CREATE OR REPLACE FUNCTION public.ks_technical_convert_quote_to_work_order(p_quote_id uuid,p_order_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_company_id uuid; v_quote public.ks_technical_quotes%ROWTYPE; v_order public.ks_technical_work_orders%ROWTYPE;
BEGIN
  SELECT q.company_id INTO v_company_id FROM public.ks_technical_quotes q WHERE q.id=p_quote_id;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para converter este orçamento em OS.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_quote FROM public.ks_technical_quotes WHERE id=p_quote_id AND company_id=v_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_quote.status NOT IN ('approved','converted') THEN RAISE EXCEPTION 'Apenas orçamentos aprovados podem gerar OS.' USING ERRCODE='23514'; END IF;
  IF p_order_number IS NULL OR length(trim(p_order_number))<3 THEN RAISE EXCEPTION 'Número de OS inválido.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.ks_technical_work_orders(company_id,quote_id,order_number,customer_name,title,scope_snapshot,created_by)
  VALUES(v_company_id,v_quote.id,trim(p_order_number),v_quote.customer_name,v_quote.title,
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
  SELECT w.company_id INTO v_company_id FROM public.ks_technical_warehouses w
  WHERE w.id=p_warehouse_id AND w.is_active;
  IF v_company_id IS NULL OR NOT private.ks_has_company_role(v_company_id,ARRAY['owner','admin','manager']::text[]) THEN
    RAISE EXCEPTION 'Sem permissão para ajustar stock técnico.' USING ERRCODE='42501';
  END IF;
  IF p_delta IS NULL OR p_delta=0 OR p_reason IS NULL OR length(trim(p_reason))<3 THEN
    RAISE EXCEPTION 'Quantidade e motivo do ajuste são obrigatórios.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ks_technical_products p WHERE p.id=p_product_id AND p.company_id=v_company_id AND p.is_active) THEN
    RAISE EXCEPTION 'Produto inválido.' USING ERRCODE='23503';
  END IF;
  INSERT INTO public.ks_technical_stock_balances(company_id,warehouse_id,product_id,physical_qty)
  VALUES(v_company_id,p_warehouse_id,p_product_id,0) ON CONFLICT(company_id,warehouse_id,product_id) DO NOTHING;
  SELECT * INTO v_balance FROM public.ks_technical_stock_balances
  WHERE company_id=v_company_id AND warehouse_id=p_warehouse_id AND product_id=p_product_id FOR UPDATE;
  v_new_qty:=v_balance.physical_qty+p_delta;
  IF v_new_qty<v_balance.reserved_qty THEN RAISE EXCEPTION 'O ajuste não pode ficar abaixo da quantidade reservada.' USING ERRCODE='23514'; END IF;
  UPDATE public.ks_technical_stock_balances SET physical_qty=v_new_qty,updated_at=now() WHERE id=v_balance.id;
  INSERT INTO public.ks_technical_stock_movements(company_id,warehouse_id,product_id,movement_type,quantity,reason,created_by)
  VALUES(v_company_id,p_warehouse_id,p_product_id,'adjustment',abs(p_delta),trim(p_reason),(SELECT auth.uid()));
  INSERT INTO public.ks_technical_audit_events(company_id,entity_type,entity_id,action,before_data,after_data,actor_id)
  VALUES(v_company_id,'technical_stock_balance',v_balance.id,'adjusted',
    jsonb_build_object('physical_qty',v_balance.physical_qty,'reserved_qty',v_balance.reserved_qty),
    jsonb_build_object('physical_qty',v_new_qty,'reason',trim(p_reason)),(SELECT auth.uid()));
  RETURN jsonb_build_object('ok',true,'physical_qty',v_new_qty,'reserved_qty',v_balance.reserved_qty,'available_qty',v_new_qty-v_balance.reserved_qty);
END;
$function$;

REVOKE ALL ON FUNCTION public.ks_technical_reserve_stock(text,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ks_technical_release_stock_reservation(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ks_technical_approve_quote(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ks_technical_convert_quote_to_work_order(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ks_technical_adjust_stock_balance(uuid,uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_technical_reserve_stock(text,uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ks_technical_release_stock_reservation(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ks_technical_approve_quote(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ks_technical_convert_quote_to_work_order(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ks_technical_adjust_stock_balance(uuid,uuid,numeric,text) TO authenticated;
