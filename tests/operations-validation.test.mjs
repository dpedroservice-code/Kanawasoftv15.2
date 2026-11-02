import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { normalizeCoordinates, normalizeRouteDistance, normalizeOrderStatus } = require('../app/operations-validation.js');

test('accepts valid coordinates and marks them as manually recorded', () => {
  assert.deepEqual(normalizeCoordinates('-8,8391', '13,2894'), { lat: -8.8391, lng: 13.2894, location_source: 'manual', coordinates_valid: true });
});
test('rejects out-of-range or missing coordinates', () => {
  assert.throws(() => normalizeCoordinates('91', '13'), /Coordenadas inválidas/);
  assert.throws(() => normalizeCoordinates('', '13'), /Coordenadas inválidas/);
});
test('empty route distance remains explicitly uncalculated', () => {
  assert.deepEqual(normalizeRouteDistance(''), { distance_km: null, distancia: 'Não calculada', distance_source: 'not_calculated' });
});
test('manual route distance is numeric and marked manual', () => {
  assert.deepEqual(normalizeRouteDistance('12,5 km'), { distance_km: 12.5, distancia: '12.5 km (manual)', distance_source: 'manual' });
});
test('rejects invalid or zero route distances', () => {
  assert.throws(() => normalizeRouteDistance('0'), /superior a zero/);
  assert.throws(() => normalizeRouteDistance('aprox. 12'), /Informe a distância/);
});
test('accepts only supported internal order statuses', () => {
  assert.equal(normalizeOrderStatus(' Em Preparação '), 'em preparação');
  assert.equal(normalizeOrderStatus('entregue'), 'entregue');
  assert.throws(() => normalizeOrderStatus('pago'), /Estado inválido/);
});
