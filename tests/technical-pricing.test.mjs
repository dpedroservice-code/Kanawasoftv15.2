import test from 'node:test';
import assert from 'node:assert/strict';
import pricing from '../app/technical-pricing.js';

test('calculates technical labour, indirect costs, BDI, IVA and withholding',()=>{
  const r=pricing.calculate({hours:10,hourlyCost:1000,hourlyPrice:2000,equipment:5000,consumables:1000,travel:500,perDiem:500,bdiPct:10,discount:0,ivaPct:14,retentionPct:6.5});
  assert.equal(r.laborRevenue,20000);
  assert.equal(r.laborCost,10000);
  assert.equal(r.direct,26000);
  assert.equal(r.indirect,1000);
  assert.equal(r.contingency,2700);
  assert.equal(r.taxBase,29700);
  assert.equal(r.iva,4158);
  assert.equal(r.retention,1930.5);
  assert.equal(r.total,31927.5);
});
test('caps discount at gross value and never returns a negative total',()=>{
  const r=pricing.calculate({hours:1,hourlyPrice:100,discount:9999,ivaPct:14,retentionPct:100});
  assert.equal(r.discount,100);
  assert.equal(r.taxBase,0);
  assert.equal(r.total,0);
});
test('invalid and negative inputs are treated as zero',()=>{
  const r=pricing.calculate({hours:-10,hourlyPrice:'invalid',equipment:-5,ivaPct:200,retentionPct:-1});
  assert.equal(r.total,0);
  assert.equal(r.ivaPct,100);
  assert.equal(r.retentionPct,0);
});
