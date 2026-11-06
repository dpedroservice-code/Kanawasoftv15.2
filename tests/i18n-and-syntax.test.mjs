import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
test('ficheiros JavaScript da interface e módulos novos passam na análise sintática', () => {
  for (const file of ['app/app.js', 'app/i18n.js', 'app/route-engine.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotThrow(() => new vm.Script(source, { filename: file }), file + ' deve ter sintaxe válida');
  }
});
test('catálogo i18n disponibiliza os seis idiomas iniciais e direção RTL para árabe', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'i18n.js'), 'utf8');
  const state = { document: { documentElement: { lang: '', dir: '' } }, localStorage: { getItem: () => 'pt-AO', setItem: () => {} }, window: { dispatchEvent: () => {} }, CustomEvent: function (name, options) { this.name = name; this.detail = options.detail; } };
  vm.runInNewContext(source, state);
  assert.equal(JSON.stringify(Object.keys(state.window.KanawaI18n.dictionaries).sort()), JSON.stringify(['ar','en','es','fr','ln','pt-AO'].sort()));
  state.window.KanawaI18n.setLanguage('ar');
  assert.equal(state.document.documentElement.dir, 'rtl');
  assert.equal(state.document.documentElement.lang, 'ar');
});
