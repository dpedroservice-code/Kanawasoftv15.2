import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleFinalizeSale } = require('../server/supabase-gateway.js');

const request = {
  authorization: 'Bearer test-user-token',
  body: {
    company_id: '123e4567-e89b-42d3-a456-426614174000',
    sale: { external_id: 'sale-1', status: 'finalizada' },
    items: [{ product_external_id: 'p-1', quantity: 1, unit_price: 100, line_total: 100 }]
  }
};

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, async json() { return body; } };
}

test('requires a bearer token before contacting Supabase', async () => {
  let called = false;
  const result = await handleFinalizeSale({ body: request.body }, async () => { called = true; });
  assert.equal(result.status, 401);
  assert.equal(called, false);
});

test('rejects malformed tenant and sale payloads', async () => {
  const result = await handleFinalizeSale({
    authorization: request.authorization,
    body: { ...request.body, company_id: 'not-a-uuid' }
  }, async () => { throw new Error('must not call Supabase'); });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'INVALID_SALE_REQUEST');
});

test('forwards the bearer JWT once to the transactional RPC for PostgREST verification', async () => {
  const calls = [];
  const result = await handleFinalizeSale(request, async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ ok: true, duplicate: false, history_atomic: true, total: 100 });
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.history_atomic, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/rest/v1/rpc/ks_finalize_sale'));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-user-token');
  const forwarded = JSON.parse(calls[0].options.body);
  assert.equal(forwarded.p_company_id, request.body.company_id);
  assert.equal(forwarded.p_sale.external_id, 'sale-1');
});

test('does not send unauthenticated requests to PostgREST', async () => {
  let calls = 0;
  const result = await handleFinalizeSale({ body: request.body }, async () => { calls++; });
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test('maps idempotency payload conflicts to HTTP 409', async () => {
  const result = await handleFinalizeSale(request, async () =>
    jsonResponse({ code: '23505', message: 'idempotency conflict' }, false, 409));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, '23505');
});
