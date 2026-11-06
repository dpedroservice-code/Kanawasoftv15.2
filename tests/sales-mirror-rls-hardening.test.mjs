import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261106120000_kanawa_v154_sales_mirror_rls_hardening.sql', import.meta.url),
  'utf8'
);

function policy(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = migration.match(new RegExp('CREATE POLICY ' + escaped + '[\\s\\S]*?;','i'));
  assert.ok(match, 'policy ' + name + ' must exist');
  return match[0];
}

test('direct INSERT cannot create a finalized sales mirror', () => {
  const sql = policy('ks_records_sales_mirror_no_direct_finalize_insert');
  assert.match(sql, /AS RESTRICTIVE/i);
  assert.match(sql, /FOR INSERT TO authenticated/i);
  assert.match(sql, /NOT\\s*\\([\\s\\S]*store_key\\s*=\\s*'vendas'[\\s\\S]*payload->>'status'[\\s\\S]*'finalizada'/i);
});

test('direct UPDATE cannot modify a finalized mirror or promote a draft to finalized', () => {
  const sql = policy('ks_records_sales_mirror_no_direct_finalize_update');
  assert.match(sql, /AS RESTRICTIVE/i);
  assert.match(sql, /FOR UPDATE TO authenticated/i);
  assert.match(sql, /USING\\s*\\([\\s\\S]*NOT\\s*\\([\\s\\S]*'finalizada'/i);
  assert.match(sql, /WITH CHECK\\s*\\([\\s\\S]*NOT\\s*\\([\\s\\S]*'finalizada'/i);
});

test('the atomic RPC is the privileged path and keeps an empty search_path', () => {
  assert.match(migration, /ALTER FUNCTION public\\.ks_finalize_sale\\(uuid, jsonb, jsonb\\) SECURITY DEFINER/i);
  assert.match(migration, /ALTER FUNCTION public\\.ks_finalize_sale\\(uuid, jsonb, jsonb\\) SET search_path TO ''/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\\.ks_finalize_sale\\(uuid, jsonb, jsonb\\) FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\\.ks_finalize_sale\\(uuid, jsonb, jsonb\\) TO authenticated/i);
});

test('the RPC retains explicit authentication and company permission checks', () => {
  const source = readFileSync(
    new URL('../supabase/migrations/20261104100000_kanawa_v154_atomic_sales_idempotency.sql', import.meta.url),
    'utf8'
  );
  assert.match(source, /IF auth\\.uid\\(\\) IS NULL OR NOT \\([\\s\\S]*ks_has_company_permission\\(p_company_id,'pdv','criar'\\)/i);
});
