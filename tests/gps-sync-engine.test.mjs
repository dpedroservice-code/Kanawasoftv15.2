import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sync = require('../app/gps-sync-engine.js');

test('merge importa posições remotas de outros dispositivos', () => {
  const result = sync.merge([], [{ id: 2, lat: -8.8, lng: 13.2, ultimaAtualizacao: '2026-11-04T10:00:00Z' }], []);
  assert.equal(result.changedCount, 1);
  assert.equal(result.records[0].id, 2);
});

test('merge não substitui dados locais mais recentes', () => {
  const local = [{ id: 2, lat: -8.7, lng: 13.2, ultimaAtualizacao: '2026-11-04T10:01:00Z' }];
  const remote = [{ id: 2, lat: -8.8, lng: 13.2, ultimaAtualizacao: '2026-11-04T10:00:00Z' }];
  const result = sync.merge(local, remote, []);
  assert.equal(result.changedCount, 0);
  assert.equal(result.records[0].lat, -8.7);
});

test('merge preserva posições com envio offline pendente', () => {
  const local = [{ id: 2, lat: -8.7, lng: 13.2, ultimaAtualizacao: '2026-11-04T10:00:00Z' }];
  const remote = [{ id: 2, lat: -8.8, lng: 13.2, ultimaAtualizacao: '2026-11-04T10:01:00Z' }];
  const result = sync.merge(local, remote, [2]);
  assert.equal(result.changedCount, 0);
  assert.equal(result.records[0].lat, -8.7);
});

test('mantém IDs únicos por dispositivo mesmo com contadores locais iguais', () => {
  const remote = [
    { id: 'gps-device-a', lat: -8.8, lng: 13.2, ultimaAtualizacao: '2026-11-04T10:00:00Z' },
    { id: 'gps-device-b', lat: -8.9, lng: 13.3, ultimaAtualizacao: '2026-11-04T10:00:00Z' }
  ];
  const result = sync.merge([], remote, []);
  assert.equal(result.changedCount, 2);
  assert.equal(result.records.length, 2);
});
