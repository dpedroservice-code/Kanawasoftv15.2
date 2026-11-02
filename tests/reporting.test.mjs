import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');

test('relatórios incluem movimentos operacionais e financeiros', () => {
  for (const store of ['vendas', 'compras', 'movimentacoesEstoque', 'pagamentos', 'transacoesBancarias', 'contasReceber', 'contasPagar']) {
    assert.ok(source.includes("'" + store + "'"), 'store de relatório ausente: ' + store);
  }
  assert.match(source, /value="movimentos">Movimentos/);
});

test('relatórios incluem atividades, auditoria e eventos de segurança', () => {
  for (const store of ['auditoria', 'atividadesProjetos', 'historicoOS', 'logsSeguranca', 'notificacoes']) {
    assert.ok(source.includes("'" + store + "'"), 'store de atividade ausente: ' + store);
  }
  assert.match(source, /value="atividades">Atividades e auditoria/);
});

test('interface oferece filtros de período e impressão separada', () => {
  assert.match(source, /id="relatorioInicio"/);
  assert.match(source, /id="relatorioFim"/);
  assert.match(source, /imprimirRelatorio\(\s*\\?'movimentos\\?'\)/);
  assert.match(source, /imprimirRelatorio\(\s*\\?'atividades\\?'\)/);
  assert.match(source, /window\.print\(\)/);
});
