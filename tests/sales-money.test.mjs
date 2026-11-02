import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { roundMoney, normalizeSale } = require('../app/sales-money.js');

function sale(overrides = {}) {
  return {
    id: 101,
    status: 'finalizada',
    numeroFatura: 'FT-TEST-101',
    itens: [{ id: 7, nome: 'Produto', preco: 100.10, qty: 2, subtotal: 200.20 }],
    subtotal: 200.20,
    descontoValor: 10.01,
    iva: 26.63,
    total: 216.82,
    valorRecebido: 0,
    troco: -216.82,
    pagamento: 'dinheiro',
    ...overrides
  };
}

test('rounds monetary values to cents without binary floating residue', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(100.105), 100.11);
});

test('defaults an empty non-credit payment to exact total and zero change', () => {
  const result = normalizeSale(sale());
  assert.equal(result.sale.amount_received, 216.82);
  assert.equal(result.sale.change_amount, 0);
  assert.equal(result.sale.subtotal, 200.20);
});

test('calculates positive change from the received amount, ignoring stale negative UI change', () => {
  const result = normalizeSale(sale({ valorRecebido: 250 }));
  assert.equal(result.sale.amount_received, 250);
  assert.equal(result.sale.change_amount, 33.18);
});

test('rejects an explicit underpayment for non-credit methods', () => {
  assert.throws(() => normalizeSale(sale({ valorRecebido: 100 })), /Pagamento insuficiente/);
});

test('allows credit sales with no immediate payment and zero change', () => {
  const result = normalizeSale(sale({ pagamento: 'credito', valorRecebido: 0 }));
  assert.equal(result.sale.amount_received, 0);
  assert.equal(result.sale.change_amount, 0);
});

test('rejects totals that do not reconcile with subtotal, discount and tax', () => {
  assert.throws(() => normalizeSale(sale({ total: 220 })), /Valores da venda inválidos/);
});

test('rejects line totals that do not reconcile with quantity and unit price', () => {
  assert.throws(() => normalizeSale(sale({ itens: [{ id: 7, nome: 'Produto', preco: 100.10, qty: 2, subtotal: 199 }] })), /Artigo inválido/);
});
