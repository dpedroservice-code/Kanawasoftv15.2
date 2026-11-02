import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');

test('cada módulo recebe uma ação global para emitir o seu relatório', () => {
  assert.match(source, /c\.insertAdjacentHTML\('afterbegin', barraRelatorioModulo\(id\)\)/);
  assert.match(source, /function barraRelatorioModulo\(id\)/);
  assert.match(source, /Imprimir \/ Guardar PDF/);
});

test('o relatório do módulo imprime o conteúdo atualmente apresentado', () => {
  assert.match(source, /function imprimirRelatorioModulo\(\)/);
  assert.match(source, /const copia = content\.cloneNode\(true\)/);
  assert.match(source, /copia\.querySelectorAll\('\.module-report-toolbar,\.no-print,button,input,select,textarea,script'\)/);
  assert.match(source, /window\.print\(\)/);
  assert.match(source, /Relatório do módulo:/);
});

test('o relatório identifica a empresa e o módulo selecionado', () => {
  assert.match(source, /localStorage\.getItem\('kanawa_empresa'\)/);
  assert.match(source, /MENU \|\| \[\]/);
  assert.match(source, /currentModule/);
});
