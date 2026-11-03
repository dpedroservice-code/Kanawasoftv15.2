import test from 'node:test';
import assert from 'node:assert/strict';
import PaymentMethods from '../app/payment-methods.js';

test('provides Angola-oriented default payment methods with gateways disabled', () => {
  const defaults = PaymentMethods.defaults;
  assert.ok(defaults.some(method => method.method_code === 'dinheiro' && method.enabled));
  assert.ok(defaults.some(method => method.method_code === 'multicaixa' && method.enabled));
  assert.ok(defaults.some(method => method.method_code === 'multicaixa_express' && !method.enabled));
});

test('normalizes valid payment method configuration', () => {
  const result = PaymentMethods.validate([
    { method_code:'dinheiro', display_name:'Dinheiro', enabled:true, instructions:'Receber no caixa' },
    { method_code:'multicaixa', display_name:'Multicaixa (TPA)', enabled:false }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].instructions, 'Receber no caixa');
});

test('rejects configurations with no enabled payment methods', () => {
  assert.throws(() => PaymentMethods.validate([
    { method_code:'dinheiro', display_name:'Dinheiro', enabled:false }
  ]), /pelo menos uma/);
});

test('rejects unknown and duplicate payment method codes', () => {
  assert.throws(() => PaymentMethods.validate([
    { method_code:'bitcoin', display_name:'Bitcoin', enabled:true }
  ]), /inválido/);
  assert.throws(() => PaymentMethods.validate([
    { method_code:'dinheiro', display_name:'Dinheiro', enabled:true },
    { method_code:'dinheiro', display_name:'Dinheiro', enabled:true }
  ]), /repetido/);
});
