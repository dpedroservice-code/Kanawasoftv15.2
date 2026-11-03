import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const Tax=require('../app/angola-tax.js');

test('calculates general and simplified VAT without changing the base',()=>{
  assert.deepEqual(Tax.calculate({base:100000,regime:'geral'}),{base:100000,regime:'geral',rate:14,vatAmount:14000,total:114000,exemptionReason:'',taxCode:'IVA_GERAL'});
  assert.equal(Tax.calculate({base:100000,regime:'simplificado'}).vatAmount,7000);
});

test('requires a legal reason before an exempt sale can be calculated',()=>{
  assert.throws(()=>Tax.calculate({base:1000,regime:'isento'}),/fundamento legal/);
  assert.equal(Tax.calculate({base:1000,regime:'isento',exemptionReason:'Artigo e motivo aplicável'}).total,1000);
});

test('prevents disabling VAT without a validated exemption regime',()=>{
  assert.throws(()=>Tax.calculate({base:1000,regime:'geral',applyVat:false}),/Não é permitido desativar/);
  assert.throws(()=>Tax.calculate({base:1000,regime:'isento',applyVat:false}),/fundamento legal/);
});

test('does not allow exemption reason to be silently attached to taxable regimes',()=>{
  assert.throws(()=>Tax.calculate({base:1000,regime:'geral',exemptionReason:'qualquer motivo'}),/só pode/);
});

test('keeps pro-forma documents distinct from fiscal documents',()=>{
  assert.equal(Tax.documentType('FP').fiscal,false);
  assert.equal(Tax.documentType('FT').fiscal,true);
  assert.throws(()=>Tax.documentType('RECIBO'),/não suportado/);
});

test('withholding is opt-in, service-only and requires legal basis',()=>{
  assert.equal(Tax.calculateWithholding({applicable:false}).amount,0);
  assert.throws(()=>Tax.calculateWithholding({applicable:true,category:'product',rate:6.5,base:10000,legalBasis:'Lei aplicável'}),/apenas/);
  assert.throws(()=>Tax.calculateWithholding({applicable:true,category:'service',rate:6.5,base:10000}),/fundamento legal/);
  assert.equal(Tax.calculateWithholding({applicable:true,category:'service',rate:6.5,base:10000,legalBasis:'Enquadramento legal verificado'}).amount,650);
});

test('rejects invalid bases and unknown tax regimes',()=>{
  assert.throws(()=>Tax.calculate({base:-1,regime:'geral'}),/inválido/);
  assert.throws(()=>Tax.calculate({base:100,regime:'especial inventado'}),/não reconhecido/);
});
