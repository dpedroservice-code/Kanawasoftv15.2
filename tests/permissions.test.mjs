import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fromMembership, canAccess, canDo } = require('../app/permissions.js');

test('administrator has full access', () => {
  const p = fromMembership('admin', {});
  assert.equal(canAccess(p, 'usuarios'), true);
  assert.equal(canDo(p, 'excluir', 'produtos'), true);
});
test('empty cloud permissions fail closed', () => {
  const p = fromMembership('operador', {});
  assert.equal(canAccess(p, 'pdv'), false);
  assert.equal(canDo(p, 'criar', 'pdv'), false);
});
test('operator receives only explicit module grants', () => {
  const p = fromMembership('operador', { pdv: ['ver','criar'], produtos: ['ver'], vendas: ['ver','criar'] });
  assert.equal(canAccess(p, 'pdv'), true);
  assert.equal(canDo(p, 'criar', 'pdv'), true);
  assert.equal(canDo(p, 'editar', 'produtos'), false);
  assert.equal(canAccess(p, 'financeiro'), false);
});
test('permissions do not leak actions across modules', () => {
  const p = fromMembership('gerente', { produtos: ['ver','editar'], clientes: ['ver'] });
  assert.equal(canDo(p, 'editar', 'produtos'), true);
  assert.equal(canDo(p, 'editar', 'clientes'), false);
});
test('unknown actions are ignored', () => {
  const p = fromMembership('visualizador', { dashboard: ['ver','superuser'] });
  assert.equal(canAccess(p, 'dashboard'), true);
  assert.equal(canDo(p, 'superuser', 'dashboard'), false);
});
