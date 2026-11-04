import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Finance = require('../app/finance-engine.js');

test('classifies overdue, pending, paid and cancelled financial records', () => {
  assert.equal(Finance.status({status:'pendente',vencimento:'2026-11-03'},'2026-11-04'),'vencido');
  assert.equal(Finance.status({status:'pendente',vencimento:'2026-11-04'},'2026-11-04'),'pendente');
  assert.equal(Finance.status({status:'pago',vencimento:'2026-11-01'},'2026-11-04'),'pago');
  assert.equal(Finance.status({status:'cancelado',vencimento:'2026-11-01'},'2026-11-04'),'cancelado');
});

test('summarizes receivables, payables, overdue count and pending balance', () => {
  const summary = Finance.summarize(
    [{valor:100,status:'pendente',vencimento:'2026-11-03'},{valor:50,status:'pago'}],
    [{valor:30,status:'pendente',vencimento:'2026-11-04'},{valor:20,status:'pendente',vencimento:'2026-11-01'}],
    '2026-11-04'
  );
  assert.equal(summary.receberVencido,100);
  assert.equal(summary.receberPago,50);
  assert.equal(summary.pagarPendente,30);
  assert.equal(summary.pagarVencido,20);
  assert.equal(summary.contasVencidas,2);
  assert.equal(summary.saldoPendente,50);
});
