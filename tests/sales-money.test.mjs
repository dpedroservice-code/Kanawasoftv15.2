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

test('preserves the supplied monetary value without silently rounding', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.1 + 0.2);
  assert.equal(roundMoney(100.105), 100.105);
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

test('rejects negative received amounts instead of treating them as blank', () => {
  assert.throws(() => normalizeSale(sale({ valorRecebido: -1 })), /não pode ser negativo/);
});

test('blocks cart quantity above current product stock', () => {
  const { validateCartStock } = require('../app/sales-money.js');
  const products = [{ id: 7, nome: 'Produto', estoque: 4 }];
  assert.equal(validateCartStock([{ id: 7, qty: 4 }], products)[0].available, 4);
  assert.throws(() => validateCartStock([{ id: 7, qty: 5 }], products), /Stock actual: 4; quantidade pedida: 5/);
});

test('blocks missing products and invalid stock values', () => {
  const { validateCartStock } = require('../app/sales-money.js');
  assert.throws(() => validateCartStock([{ id: 8, qty: 1 }], [{ id: 7, estoque: 4 }]), /não existe, está inativo/);
  assert.throws(() => validateCartStock([{ id: 7, qty: 1 }], [{ id: 7, estoque: 'inválido' }]), /Stock ou quantidade inválida/);
});

test('supports normalized stock_quantity records from the cloud catalogue', () => {
  const { validateCartStock } = require('../app/sales-money.js');
  assert.equal(validateCartStock([{ id: 'SKU-1', qty: 2 }], [{ id: 'SKU-1', stock_quantity: 2 }])[0].quantity, 2);
});

test('rejects products marked inactive even when stock is positive', () => {
  const { validateCartStock } = require('../app/sales-money.js');
  assert.throws(() => validateCartStock([{ id: 7, qty: 1 }], [{ id: 7, nome: 'Produto', estoque: 4, ativo: false }]), /não existe, está inativo/);
});

test('uses integer minor units for fractional quantities without floating point drift', () => {
  const { normalizeSale } = require('../app/sales-money.js');
  const result = normalizeSale(sale({
    itens: [{ id: 7, nome: 'Produto', preco: 100.01, qty: 0.333, subtotal: 33.30 }],
    subtotal: 33.30,
    descontoValor: 0,
    iva: 0,
    total: 33.30,
    valorRecebido: 33.30
  }));
  assert.equal(result.items[0].line_total, 33.30);
  assert.equal(result.sale.total, 33.30);
  assert.equal(result.sale.change_amount, 0);
});

test('rejects monetary values with more than two decimal places instead of silently changing them', () => {
  assert.throws(() => normalizeSale(sale({ total: 216.825 })), /Total deve ter no máximo 2 casas decimais/);
});

test('rejects quantities with more than three decimal places', () => {
  assert.throws(() => normalizeSale(sale({
    itens: [{ id: 7, nome: 'Produto', preco: 100.10, qty: 2.0001, subtotal: 200.20 }]
  })), /Quantidade deve ter no máximo 3 casas decimais/);
});

test('rejects a line subtotal that differs by one cent', () => {
  assert.throws(() => normalizeSale(sale({
    itens: [{ id: 7, nome: 'Produto', preco: 100.10, qty: 2, subtotal: 200.19 }]
  })), /Artigo inválido/);
});
