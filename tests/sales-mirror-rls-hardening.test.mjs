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

test('public finalizer stays SECURITY INVOKER and the narrow helper is private SECURITY DEFINER', () => {
  assert.ok(migration.includes('ALTER FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) SECURITY INVOKER;'));
  assert.ok(migration.includes('CREATE OR REPLACE FUNCTION private.ks_upsert_finalized_sale_mirror('));
  assert.ok(migration.includes('ALTER FUNCTION private.ks_upsert_finalized_sale_mirror(uuid,text,jsonb) OWNER TO postgres;'));
  assert.ok(migration.includes('ALTER FUNCTION private.ks_upsert_finalized_sale_mirror(uuid,text,jsonb) SET search_path TO \'\';'));
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION private.ks_upsert_finalized_sale_mirror(uuid,text,jsonb) FROM PUBLIC, anon;'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION private.ks_upsert_finalized_sale_mirror(uuid,text,jsonb) TO authenticated;'));
  assert.ok(!migration.includes('ALTER FUNCTION public.ks_finalize_sale(uuid, jsonb, jsonb) SECURITY DEFINER;'));
});

test('private helper verifies identity, permission, persisted sale totals and persisted items', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION private.ks_upsert_finalized_sale_mirror(');
  const end = migration.indexOf('$function$;', start);
  assert.ok(start >= 0 && end > start);
  const helper = migration.slice(start, end);
  assert.ok(helper.includes('auth.uid() IS NULL'));
  assert.ok(helper.includes("private.ks_has_company_permission(p_company_id,'pdv','criar')"));
  assert.ok(helper.includes("private.ks_has_company_permission(p_company_id,'vendas','criar')"));
  assert.ok(helper.includes("public.ks_sales"));
  assert.ok(helper.includes("public.ks_sale_items"));
  assert.ok(helper.includes("IS DISTINCT FROM 'array'"));
  assert.ok(helper.includes("v_existing IS DISTINCT FROM p_record"));
});

test('the public transaction delegates both mirror-write paths to the private helper', () => {
  assert.equal((migration.match(/PERFORM private\.ks_upsert_finalized_sale_mirror\(/g) || []).length, 2);
  assert.ok(migration.includes('SECURITY INVOKER'));
});
