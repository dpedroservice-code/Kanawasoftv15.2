import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');

test('certificações disponibiliza três modelos modernos personalizáveis', () => {
  assert.match(source, /Azul e dourado — clássico/);
  assert.match(source, /Verde — institucional/);
  assert.match(source, /Azul-marinho — minimalista/);
  assert.match(source, /function salvarConfigCertificados\(\)/);
  assert.match(source, /kanawa_certificado_config/);
});

test('o certificado pode ser pré-visualizado e impresso ou guardado em PDF', () => {
  assert.match(source, /function htmlModeloCertificado\(dados, cfg\)/);
  assert.match(source, /function prévisualizarModeloCertificado\(\)/);
  assert.match(source, /async function imprimirCertificado\(id\)/);
  assert.match(source, /window\.print\(\)/);
  assert.match(source, /@page\{size:A4 landscape/);
});

test('a emissão cria um código de certificado e permite validade sem prazo', () => {
  assert.match(source, /codigo: 'KS-'/);
  assert.match(source, /Validade em meses \(0 = sem validade\)/);
});
