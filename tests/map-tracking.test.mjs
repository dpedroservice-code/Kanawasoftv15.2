import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const maps = require('../app/map-tracking.js');

test('valida coordenadas dentro dos limites geográficos', () => {
  assert.deepEqual(maps.validateCoordinates('-8.8383', '13.2344'), { lat: -8.8383, lng: 13.2344 });
});

test('aceita vírgula decimal nas coordenadas introduzidas', () => {
  assert.deepEqual(maps.validateCoordinates('-8,8383', '13,2344'), { lat: -8.8383, lng: 13.2344 });
});

test('rejeita latitude e longitude fora dos limites', () => {
  assert.throws(() => maps.validateCoordinates(91, 13), /Coordenadas inválidas/);
  assert.throws(() => maps.validateCoordinates(-8, 181), /Coordenadas inválidas/);
  assert.throws(() => maps.validateCoordinates('abc', 13), /Coordenadas inválidas/);
});

test('calcula distância geodésica positiva entre dois pontos', () => {
  const distance = maps.haversineKm({ lat: -8.8383, lng: 13.2344 }, { lat: -8.8483, lng: 13.2344 });
  assert.ok(distance > 1 && distance < 1.2);
});

test('distância de um ponto para ele próprio é zero', () => {
  assert.equal(maps.haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
});
