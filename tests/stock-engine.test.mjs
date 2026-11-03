import test from 'node:test';
import assert from 'node:assert/strict';
import Stock from '../app/stock-engine.js';

test('entrada aumenta o saldo e conserva o saldo anterior', () => {
  assert.deepEqual(Stock.applyMovement(8, 'entrada', 5), { before: 8, quantity: 5, after: 13, delta: 5 });
});
test('saída reduz o saldo sem permitir stock negativo', () => {
  assert.equal(Stock.applyMovement(8, 'saida', 3).after, 5);
  assert.throws(() => Stock.applyMovement(2, 'saida', 3), /Stock insuficiente/);
});
test('ajuste define o saldo contado e aceita zero', () => {
  assert.deepEqual(Stock.applyMovement(8, 'ajuste', 5), { before: 8, quantity: 5, after: 5, delta: -3 });
  assert.deepEqual(Stock.applyMovement(8, 'ajuste', 0), { before: 8, quantity: 0, after: 0, delta: -8 });
});
test('quantidade zero, negativa, infinita ou não numérica é rejeitada em entrada/saída', () => {
  for (const q of [0, -1, Infinity, NaN, 'x']) {
    assert.throws(() => Stock.applyMovement(5, 'entrada', q));
    assert.throws(() => Stock.applyMovement(5, 'saida', q));
  }
});
test('estado de stock respeita stock mínimo e esgotado', () => {
  assert.equal(Stock.classify(0, 3), 'esgotado');
  assert.equal(Stock.classify(3, 3), 'baixo');
  assert.equal(Stock.classify(4, 3), 'normal');
});
test('movimento guarda trilha de auditoria e referência', () => {
  const m = Stock.createMovement({ productId: 7, productName: 'Câmara IP', before: 10, type: 'saida', quantity: 2, reason: 'Venda', actor: 'Caixa', reference: 'FT-001' });
  assert.equal(m.saldoAnterior, 10);
  assert.equal(m.saldoFinal, 8);
  assert.equal(m.operador, 'Caixa');
  assert.equal(m.referencia, 'FT-001');
  assert.equal(m.auditavel, true);
});
