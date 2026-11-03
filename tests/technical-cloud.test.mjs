import test from 'node:test';
import assert from 'node:assert/strict';
import Pricing from '../app/technical-pricing.js';
import TechnicalCloud from '../app/technical-cloud.js';

test('builds a normalized technical quote with consistent line totals', () => {
  const row = {
    codigo: 'ORC-TEST-001',
    cliente: 'Cliente de teste',
    titulo: 'Instalação CCTV',
    validadeDias: 14,
    prazoDias: 3,
    horas: 4,
    equipamentos: 120000,
    consumiveis: 18000,
    deslocacao: 5000,
    diarias: 3000,
    status: 'Em negociação',
    escopo: 'Instalação e configuração',
    escopoExcluido: 'Obras civis',
    notaFiscal: 'Taxas sujeitas a validação',
    tranches: [
      { milestone: 'Adjudicação', percentage: 50, condition: 'Após aprovação' },
      { milestone: 'Conclusão', percentage: 50 }
    ]
  };
  const costs = Pricing.calculate({
    hours: row.horas, hourlyCost: 5000, hourlyPrice: 9000,
    equipment: row.equipamentos, consumables: row.consumiveis,
    travel: row.deslocacao, perDiem: row.diarias,
    bdiPct: 10, discount: 5000, ivaPct: 14, retentionPct: 0
  });
  const payload = TechnicalCloud.buildQuotePayload(row, costs);
  const linesTotal = payload.lines.reduce((sum, line) => sum + line.line_total, 0);

  assert.equal(payload.quote.external_id, row.codigo);
  assert.equal(payload.quote.status, 'negotiation');
  assert.equal(payload.quote.customer_name, row.cliente);
  assert.equal(payload.quote.subtotal, costs.gross);
  assert.equal(payload.quote.total, costs.total);
  assert.ok(Math.abs(linesTotal - costs.gross) <= 0.01);
  assert.equal(payload.installments.reduce((sum, item) => sum + item.percentage, 0), 100);
  assert.equal(payload.installments[0].milestone, 'Adjudicação — Após aprovação');
});

test('rejects technical quotes without customer, title or billable lines', () => {
  const costs = Pricing.calculate({ hours: 0, hourlyCost: 0, hourlyPrice: 0 });
  assert.throws(
    () => TechnicalCloud.buildQuotePayload({ codigo: 'ORC-X', cliente: '', titulo: 'Teste' }, costs),
    /Cliente, descrição/
  );
});

test('does not allow more than 100 percent in payment milestones at payload boundary', () => {
  const row = {
    codigo: 'ORC-TEST-002', cliente: 'Cliente', titulo: 'Serviço',
    horas: 1, validadeDias: 7, tranches: [
      { milestone: 'Entrada', percentage: 70 },
      { milestone: 'Entrega', percentage: 40 }
    ]
  };
  const costs = Pricing.calculate({ hours: 1, hourlyCost: 10, hourlyPrice: 20 });
  const payload = TechnicalCloud.buildQuotePayload(row, costs);
  assert.equal(payload.installments.reduce((sum, item) => sum + item.percentage, 0), 110);
});
