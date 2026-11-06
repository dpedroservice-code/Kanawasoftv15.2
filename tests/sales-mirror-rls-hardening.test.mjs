import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261106120000_kanawa_v154_sales_mirror_rls_hardening.sql', import.meta.url),
  'utf8'
);

function policy(name) {
  const start = migration.indexOf('CREATE POLICY ' + name);
  assert.notEqual(start, -1, 'policy ' + name + ' must exist');
  const end = migration.indexOf(';', start);
  assert.notEqual(end, -1, 'policy ' + name + ' must terminate');
  return migration.slice(start, end + 1);
}

test('direct INSERT cannot create a finalized sales mirror', () => {
  const sql = policy('ks_records_sales_mirror_no_direct_finalize_insert');
  assert.ok(sql.includes('AS RESTRICTIVE'));
  assert.ok(sql.includes('FOR INSERT'));
  assert.ok(sql.includes('TO authenticated'));
  assert.ok(sql.includes("store_key = 'vendas'"));
  assert.ok(sql.includes("coalesce(payload->>'status', '') = 'finalizada'"));
});

test('direct UPDATE cannot modify a finalized mirror or promote a draft to finalized', () => {
  const sql = policy('ks_records_sales_mirror_no_direct_finalize_update');
  assert.ok(sql.includes('AS RESTRICTIVE'));
  assert.ok(sql.includes('FOR UPDATE'));
  assert.ok(sql.includes('USING ('));
  assert.ok(sql.includes('WITH CHECK ('));
  assert.equal((sql.match(/'finalizada'/g) || []).length, 2);
});

test('the atomic RPC is the privileged path and keeps an empty search_path', () => {
  assert.ok(migration.includes('ALTER FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) OWNER TO postgres;'));
  assert.ok(migration.includes('ALTER FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) SECURITY DEFINER;'));
  assert.ok(migration.includes("ALTER FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) SET search_path TO '';"));
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) FROM PUBLIC, anon;'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) TO authenticated;'));
});

test('the RPC retains explicit authentication and company permission checks', () => {
  const source = readFileSync(
    new URL('../supabase/migrations/20261104100000_kanawa_v154_atomic_sales_idempotency.sql', import.meta.url),
    'utf8'
  );
  assert.ok(source.includes('IF auth.uid() IS NULL OR NOT ('));
  assert.ok(source.includes("private.ks_has_company_permission(p_company_id,'pdv','criar')"));
  assert.ok(source.includes("private.ks_has_company_permission(p_company_id,'vendas','criar')"));
});
