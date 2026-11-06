-- KanawaSoft V15.4 — prevent direct REST finalization of sales mirrors.
-- Only ks_finalize_sale may persist a finalized sales mirror. The RPC is
-- SECURITY DEFINER with an empty search_path and performs its own tenant and
-- permission checks before writing the financial transaction.

DROP POLICY IF EXISTS ks_records_sales_mirror_no_direct_finalize_insert ON public.ks_records;
CREATE POLICY ks_records_sales_mirror_no_direct_finalize_insert
ON public.ks_records
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  NOT (
    store_key = 'vendas'
    AND coalesce(payload->>'status', '') = 'finalizada'
  )
);

DROP POLICY IF EXISTS ks_records_sales_mirror_no_direct_finalize_update ON public.ks_records;
CREATE POLICY ks_records_sales_mirror_no_direct_finalize_update
ON public.ks_records
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  NOT (
    store_key = 'vendas'
    AND coalesce(payload->>'status', '') = 'finalizada'
  )
)
WITH CHECK (
  NOT (
    store_key = 'vendas'
    AND coalesce(payload->>'status', '') = 'finalizada'
  )
);

-- This privileged function is the only authenticated path that may create
-- the finalized mirror. Its body already checks auth.uid(), tenant membership,
-- and pdv/vendas create permission. Empty search_path plus schema-qualified
-- references prevent object-shadowing attacks.
ALTER FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) SECURITY DEFINER;
ALTER FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) SET search_path TO '';

REVOKE ALL ON FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) IS
  'Privileged atomic POS finalization. Performs explicit auth/tenant/permission checks and writes sale, payment, stock ledger and finalized mirror in one transaction. Direct authenticated writes of finalized ks_records/vendas are denied by restrictive RLS policies.';
