import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const attendance = require('../app/hr-attendance.js');

test('validates clock times and rejects malformed values', () => {
  assert.equal(attendance.minutes('08:30'), 510);
  assert.equal(attendance.minutes('25:90'), null);
  assert.equal(attendance.minutes('8:30'), null);
});

test('calculates normal and overnight shifts', () => {
  assert.equal(attendance.calculateHours('08:00','17:30'), 9.5);
  assert.equal(attendance.calculateHours('22:00','06:00'), 8);
  assert.equal(attendance.calculateHours('08:00',''), null);
});

test('summarizes employee attendance without losing open shifts', () => {
  const rows = attendance.summarize([
    { funcionario:'Ana', entrada:'08:00', saida:'17:00' },
    { funcionario:'Ana', entrada:'22:00', saida:'06:00' },
    { funcionario:'Bruno', entrada:'09:00', saida:'' }
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { funcionario:'Ana', registos:2, fechados:2, emAberto:0, horas:17 });
  assert.deepEqual(rows[1], { funcionario:'Bruno', registos:1, fechados:0, emAberto:1, horas:0 });
});
