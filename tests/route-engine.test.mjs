import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'route-engine.js'), 'utf8');
function loadEngine() {
  const sandbox = { window: {}, setTimeout, Promise, Math, Number, String, encodeURIComponent };
  vm.runInNewContext(source, sandbox, { filename: 'route-engine.js' });
  return sandbox.window.KanawaRouteEngine;
}
test('Haversine calcula uma distância positiva e finita', () => {
  const engine = loadEngine();
  const km = engine.haversine({ lat: -8.8383, lng: 13.2344 }, { lat: -8.9172, lng: 13.1847 });
  assert.ok(Number.isFinite(km) && km > 0);
});
test('estimativa pedonal usa distância ajustada e velocidade média definida', async () => {
  const engine = loadEngine();
  const route = await engine.calculate({ origin: '-8.8383, 13.2344', destination: '-8.9172, 13.1847', mode: 'walking' });
  assert.ok(route.distance_km > 0);
  assert.equal(route.average_speed_kmh, 4.5);
  assert.ok(route.duration_minutes > 0);
  assert.match(route.duration_label, /min/);
  assert.equal(route.source, 'Estimativa geográfica ajustada; não é uma rota viária navegável');
});
test('rejeita coordenadas fora dos limites geográficos', async () => {
  const engine = loadEngine();
  await assert.rejects(() => engine.calculate({ origin: '95, 13', destination: '-8.9, 13.1', mode: 'walking' }), /Coordenadas geográficas inválidas/);
});
