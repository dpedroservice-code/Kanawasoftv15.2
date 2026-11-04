import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261104100000_kanawa_v154_atomic_sales_idempotency.sql', import.meta.url), 'utf8');

test('sale finalization stores an idempotency fingerprint and rejects changed retries', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS idempotency_hash/);
  assert.match(sql, /md5\(\(p_sale-'record_payload'\)::text \|\| '\|' \|\| p_items::text\)/);
  assert.match(sql, /idempotency_hash<>v_hash/);
  assert.match(sql, /Este identificador de venda já foi utilizado com dados diferentes/);
});

test('sale, payment, stock ledger and module mirror are written by the same RPC', () => {
  assert.match(sql, /private\.ks_decrement_stock_for_sale\(p_company_id,v_product_id,v_qty\)/);
  assert.match(sql, /INSERT INTO public\.ks_sale_items/);
  assert.match(sql, /INSERT INTO public\.ks_stock_movements/);
  assert.match(sql, /INSERT INTO public\.ks_payments/);
  assert.match(sql, /INSERT INTO public\.ks_records\(company_id,store_key,record_id,payload\)/);
  assert.match(sql, /history_atomic/);
});

test('sale totals and line precision are exact; no cent tolerance remains', () => {
  assert.match(sql, /v_subtotal<>round\(v_subtotal,2\)/);
  assert.match(sql, /v_qty<>round\(v_qty,3\)/);
  assert.match(sql, /v_price<>round\(v_price,2\)/);
  assert.match(sql, /v_line_total<>round\(v_qty\*v_price,2\)/);
  assert.match(sql, /v_items_subtotal<>v_subtotal/);
  assert.doesNotMatch(sql, /abs\([^\n]*>\s*0\.01/);
});

test('POS create permission is allowed to atomically write its own sales mirror', () => {
  assert.match(sql, /store_key = 'vendas' AND private\.ks_has_company_permission\(company_id, 'pdv', 'criar'\)/);
});
