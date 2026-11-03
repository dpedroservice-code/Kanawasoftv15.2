/* KanawaSoft v15.4 — Cloud operations for the technical quote lifecycle.
 * Canonical quote, quote-line, approval and work-order records live in PostgreSQL.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KanawaTechnicalCloud = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS_TO_UI = {
    draft: 'Rascunho', negotiation: 'Em negociação', approved: 'Aprovado',
    rejected: 'Rejeitado', expired: 'Expirado', cancelled: 'Cancelado', converted: 'Convertido'
  };

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  function round(value) { return Math.round((number(value) + Number.EPSILON) * 100) / 100; }

  function buildQuotePayload(row, costs) {
    if (!row || !costs) throw new Error('Dados do orçamento incompletos.');
    const lines = [];
    function add(type, description, quantity, unit, unitCost, unitPrice, total) {
      const q = number(quantity), price = number(unitPrice), cost = number(unitCost), amount = round(total);
      if (q <= 0 || amount <= 0) return;
      lines.push({
        line_type: type, description: String(description), quantity: q, unit: unit || 'UN',
        unit_cost: cost, unit_price: price, line_total: amount, metadata: {}
      });
    }
    add('labor', 'Mão de obra técnica', row.horas, 'hora', row.horas ? costs.laborCost / row.horas : 0, row.horas ? costs.laborRevenue / row.horas : 0, costs.laborRevenue);
    add('equipment', 'Equipamentos principais', 1, 'lote', row.equipamentos, row.equipamentos, costs.equipment);
    add('consumable', 'Materiais e consumíveis', 1, 'lote', row.consumiveis, row.consumiveis, costs.consumables);
    add('travel', 'Deslocação', 1, 'serviço', row.deslocacao, row.deslocacao, costs.travel);
    add('expense', 'Diárias e despesas de equipa', 1, 'lote', row.diarias, row.diarias, costs.perDiem);
    add('expense', 'BDI e contingência', 1, 'lote', 0, costs.contingency, costs.contingency);

    const terms = (row.tranches || []).map(term => ({
      milestone: term.condition ? term.milestone + ' — ' + term.condition : term.milestone,
      percentage: number(term.percentage),
      due_date: term.due_date || null
    }));
    const installmentTotal = terms.reduce((sum, term) => sum + term.percentage, 0);
    if (terms.some(term => !term.milestone || term.percentage <= 0 || term.percentage > 100) || installmentTotal > 100.0001) {
      throw new Error('As tranches devem ter percentagens positivas e a soma não pode ultrapassar 100%.');
    }
    const validDays = Math.max(1, Math.min(90, Math.floor(number(row.validadeDias) || 7)));
    const validUntil = new Date(Date.now() + validDays * 86400000).toISOString().slice(0, 10);
    const status = row.status === 'Em negociação' ? 'negotiation' : 'draft';
    const quote = {
      external_id: String(row.codigo),
      quote_number: String(row.codigo),
      customer_name: String(row.cliente || '').trim(),
      title: String(row.titulo || '').trim(),
      status: status,
      currency_code: 'AOA',
      labor_cost: round(costs.laborCost),
      labor_price: round(costs.laborRevenue),
      equipment_cost: round(costs.equipment),
      consumables_cost: round(costs.consumables),
      travel_cost: round(costs.travel),
      per_diem_cost: round(costs.perDiem),
      overhead_percent: number(costs.bdiPct),
      contingency_percent: number(costs.bdiPct),
      discount_amount: round(costs.discount),
      tax_rate: number(costs.ivaPct),
      withholding_rate: number(costs.retentionPct),
      subtotal: round(costs.gross),
      tax_amount: round(costs.iva),
      withholding_amount: round(costs.retention),
      total: round(costs.total),
      valid_until: validUntil,
      execution_days: Math.max(0, Math.floor(number(row.prazoDias))),
      scope_included: row.escopo || null,
      scope_excluded: row.escopoExcluido || null,
      technical_description: row.escopo || null,
      tax_notes: row.notaFiscal || null
    };
    if (!quote.customer_name || !quote.title || lines.length === 0) {
      throw new Error('Cliente, descrição e pelo menos uma linha com valor são obrigatórios.');
    }
    return { quote, lines, installments: terms };
  }

  function cloud() {
    const value = typeof window !== 'undefined' ? window.KanawaCloud : null;
    if (!value || !value.ready || !value.client || !value.context || !value.context.company) {
      throw new Error('Inicie sessão na empresa e confirme a ligação ao PostgreSQL antes de gravar operações técnicas.');
    }
    return value;
  }
  function throwIfError(result) {
    if (result && result.error) throw result.error;
    return result ? result.data : null;
  }
  function mapQuote(row) {
    const today = new Date(); today.setHours(0,0,0,0);
    const due = row.valid_until ? new Date(row.valid_until + 'T00:00:00') : null;
    const days = due ? Math.max(0, Math.ceil((due.getTime() - today.getTime()) / 86400000)) : 0;
    return {
      id: row.id, cloudId: row.id, codigo: row.quote_number || row.external_id,
      cliente: row.customer_name, titulo: row.title, total: number(row.total),
      validadeDias: days, prazoDias: number(row.execution_days),
      escopo: row.scope_included || '', escopoExcluido: row.scope_excluded || '',
      status: STATUS_TO_UI[row.status] || row.status, criadoEm: row.created_at,
      moeda: row.currency_code || 'AOA', subtotal: number(row.subtotal),
      desconto: number(row.discount_amount), ivaValor: number(row.tax_amount),
      retencaoValor: number(row.withholding_amount)
    };
  }

  return Object.freeze({
    buildQuotePayload,
    async createQuote(row, costs) {
      const current = cloud();
      const payload = buildQuotePayload(row, costs);
      return throwIfError(await current.client.rpc('ks_technical_create_quote', {
        p_company_id: current.context.company.id,
        p_quote: payload.quote,
        p_lines: payload.lines,
        p_installments: payload.installments
      }));
    },
    async listQuotes() {
      const current = cloud();
      const rows = throwIfError(await current.client.from('ks_technical_quotes')
        .select('*').eq('company_id', current.context.company.id)
        .order('created_at', { ascending: false }));
      return (rows || []).map(mapQuote);
    },
    async approveQuote(quoteId) {
      const current = cloud();
      if (!quoteId) throw new Error('Identificador do orçamento inválido.');
      return throwIfError(await current.client.rpc('ks_technical_approve_quote', { p_quote_id: quoteId }));
    },
    async convertQuote(quoteId, orderNumber) {
      const current = cloud();
      if (!quoteId) throw new Error('Identificador do orçamento inválido.');
      return throwIfError(await current.client.rpc('ks_technical_convert_quote_to_work_order', {
        p_quote_id: quoteId, p_order_number: orderNumber
      }));
    },
    async listWorkOrders() {
      const current = cloud();
      const rows = throwIfError(await current.client.from('ks_technical_work_orders')
        .select('*').eq('company_id', current.context.company.id)
        .order('created_at', { ascending: false }));
      return (rows || []).map(row => ({
        id: row.id, codigo: row.order_number, orcamentoId: row.quote_id,
        referenciaOrcamento: row.quote_id, cliente: row.customer_name,
        descricao: row.title, escopo: (row.scope_snapshot || {}).scope_included || '',
        status: row.status, criadoEm: row.created_at, origem: 'orcamento_tecnico'
      }));
    }
  });
});
