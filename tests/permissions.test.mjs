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
test('empty cloud permissions fail closed for every non-profile module', () => {
  for (const role of ['manager','gerente','operador','caixa','contabilista','visualizador']) {
    const p = fromMembership(role, {});
    assert.equal(canAccess(p, 'pdv'), false, role + ' must not receive implicit PDV access');
    assert.equal(canAccess(p, 'financeiro'), false, role + ' must not receive implicit finance access');
    assert.equal(canDo(p, 'criar', 'pdv'), false);
    assert.equal(canAccess(p, 'perfil'), true);
  }
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
test('legacy permissions require both module and action grants', () => {
  const legacy = { modulos: ['produtos'], acoes: ['ver','criar','editar'] };
  assert.equal(canDo(legacy, 'editar', 'produtos'), true);
  assert.equal(canDo(legacy, 'editar', 'financeiro'), false);
  assert.equal(canDo(legacy, 'excluir', 'produtos'), false);
});
test('legacy permissions without module list fail closed', () => {
  assert.equal(canDo({ acoes: ['ver','criar'] }, 'criar', 'pdv'), false);
});
test('unknown actions are ignored', () => {
  const p = fromMembership('visualizador', { dashboard: ['ver','superuser'] });
  assert.equal(canAccess(p, 'dashboard'), true);
  assert.equal(canDo(p, 'superuser', 'dashboard'), false);
});

test('manager receives only modules explicitly granted by administrator', () => {
  const p = fromMembership('manager', { tecnica: ['ver','criar'], pdv: ['ver'] });
  assert.equal(canAccess(p, 'tecnica'), true);
  assert.equal(canAccess(p, 'pdv'), true);
  assert.equal(canAccess(p, 'financeiro'), false);
});
