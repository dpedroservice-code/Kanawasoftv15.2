-- KanawaSoft v15.4 — company-level payment method configuration.
-- This controls accepted checkout methods only; it does not activate a payment gateway.

CREATE TABLE IF NOT EXISTS public.ks_company_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.ks_companies(id) ON DELETE CASCADE,
  method_code text NOT NULL CHECK (method_code IN (
    'dinheiro','cartao','transferencia','multicaixa','misto','credito','referencia','multicaixa_express'
  )),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 60),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 300),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, method_code)
);

CREATE INDEX IF NOT EXISTS ks_company_payment_methods_company_idx
  ON public.ks_company_payment_methods(company_id, sort_order);

ALTER TABLE public.ks_company_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ks_company_payment_methods_read ON public.ks_company_payment_methods;
CREATE POLICY ks_company_payment_methods_read
ON public.ks_company_payment_methods FOR SELECT TO authenticated
USING (private.ks_has_company_role(
  company_id, ARRAY['owner','admin','manager','operator','cashier','accountant','viewer']::text[]
));

DROP POLICY IF EXISTS ks_company_payment_methods_write ON public.ks_company_payment_methods;
CREATE POLICY ks_company_payment_methods_write
ON public.ks_company_payment_methods FOR ALL TO authenticated
USING (private.ks_has_company_role(company_id, ARRAY['owner','admin']::text[]))
WITH CHECK (private.ks_has_company_role(company_id, ARRAY['owner','admin']::text[]));

CREATE OR REPLACE FUNCTION public.ks_list_company_payment_methods(p_company_id uuid)
RETURNS TABLE(method_code text, display_name text, enabled boolean, sort_order integer, instructions text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(
    p_company_id, ARRAY['owner','admin','manager','operator','cashier','accountant','viewer']::text[]
  ) THEN
    RAISE EXCEPTION 'Sem acesso aos métodos de pagamento desta empresa.' USING ERRCODE='42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ks_company_payment_methods m WHERE m.company_id=p_company_id) THEN
    RETURN QUERY
      SELECT m.method_code,m.display_name,m.enabled,m.sort_order,m.instructions
      FROM public.ks_company_payment_methods m
      WHERE m.company_id=p_company_id
      ORDER BY m.sort_order,m.display_name;
  ELSE
    RETURN QUERY SELECT d.method_code,d.display_name,d.enabled,d.sort_order,d.instructions
    FROM (VALUES
      ('dinheiro','Dinheiro',true,10,''),
      ('cartao','Cartão bancário',true,20,''),
      ('transferencia','Transferência bancária',true,30,''),
      ('multicaixa','Multicaixa (TPA)',true,40,''),
      ('misto','Pagamento misto',true,50,''),
      ('credito','Crédito / a prazo',true,60,''),
      ('referencia','Referência de pagamento',false,70,''),
      ('multicaixa_express','Multicaixa Express',false,80,'')
    ) AS d(method_code,display_name,enabled,sort_order,instructions);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ks_save_company_payment_methods(
  p_company_id uuid,
  p_methods jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_item jsonb;
  v_count integer := 0;
  v_seen text[] := ARRAY[]::text[];
  v_code text;
  v_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.ks_has_company_role(
    p_company_id, ARRAY['owner','admin']::text[]
  ) THEN
    RAISE EXCEPTION 'Apenas o proprietário ou administrador pode configurar métodos de pagamento.' USING ERRCODE='42501';
  END IF;
  IF p_methods IS NULL OR jsonb_typeof(p_methods)<>'array'
     OR jsonb_array_length(p_methods)<1 OR jsonb_array_length(p_methods)>8 THEN
    RAISE EXCEPTION 'Envie entre 1 e 8 métodos de pagamento.' USING ERRCODE='22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_methods) LOOP
    v_code := coalesce(v_item->>'method_code','');
    v_name := trim(coalesce(v_item->>'display_name',''));
    IF v_code NOT IN ('dinheiro','cartao','transferencia','multicaixa','misto','credito','referencia','multicaixa_express')
       OR length(v_name)<2 OR length(v_name)>60
       OR jsonb_typeof(v_item->'enabled') IS DISTINCT FROM 'boolean'
       OR length(coalesce(v_item->>'instructions',''))>300
       OR v_code=ANY(v_seen) THEN
      RAISE EXCEPTION 'Método inválido ou repetido na configuração.' USING ERRCODE='22023';
    END IF;
    v_seen := array_append(v_seen,v_code);
    v_count := v_count+1;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_methods) x
    WHERE coalesce((x->>'enabled')::boolean,false)
  ) THEN
    RAISE EXCEPTION 'Mantenha pelo menos um método de pagamento activo.' USING ERRCODE='23514';
  END IF;

  DELETE FROM public.ks_company_payment_methods WHERE company_id=p_company_id;
  INSERT INTO public.ks_company_payment_methods(
    company_id,method_code,display_name,enabled,sort_order,instructions,updated_by
  )
  SELECT p_company_id,x->>'method_code',trim(x->>'display_name'),
    (x->>'enabled')::boolean,coalesce((x->>'sort_order')::integer,100),
    coalesce(x->>'instructions',''),auth.uid()
  FROM jsonb_array_elements(p_methods) x;

  RETURN jsonb_build_object('ok',true,'saved',v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.ks_list_company_payment_methods(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ks_save_company_payment_methods(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ks_list_company_payment_methods(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ks_save_company_payment_methods(uuid,jsonb) TO authenticated;
