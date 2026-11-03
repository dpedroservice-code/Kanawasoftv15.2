(function (root) {
  'use strict';
  function quantity(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error((label || 'Quantidade') + ' inválida.');
    return n;
  }
  function applyMovement(current, type, amount) {
    const before = quantity(current, 'Stock atual');
    const q = quantity(amount, 'Quantidade');
    let after;
    if (type === 'entrada') { if (q <= 0) throw new Error('A quantidade deve ser maior que zero.'); after = before + q; }
    else if (type === 'saida') {
      if (q <= 0) throw new Error('A quantidade deve ser maior que zero.');
      if (q > before) throw new Error('Stock insuficiente. Disponível: ' + before + '.');
      after = before - q;
    } else if (type === 'ajuste') after = q;
    else throw new Error('Tipo de movimento inválido.');
    return { before: before, quantity: q, after: after, delta: after - before };
  }
  function classify(stock, minimum) {
    const q = quantity(stock, 'Stock');
    const min = quantity(minimum == null ? 0 : minimum, 'Stock mínimo');
    return q <= 0 ? 'esgotado' : (q <= min ? 'baixo' : 'normal');
  }
  function createMovement(input) {
    if (!input || !input.productId) throw new Error('Produto obrigatório no movimento.');
    const result = applyMovement(input.before, input.type, input.quantity);
    return Object.assign({
      tipo: input.type,
      produtoId: input.productId,
      produtoNome: String(input.productName || ''),
      qtd: result.quantity,
      saldoAnterior: result.before,
      saldoFinal: result.after,
      delta: result.delta,
      descricao: String(input.reason || input.type),
      referencia: input.reference || null,
      armazemId: input.warehouseId || null,
      data: input.date || new Date().toISOString(),
      operador: String(input.actor || 'Utilizador'),
      origem: input.source || 'manual',
      auditavel: true
    });
  }
  const api = { applyMovement: applyMovement, classify: classify, createMovement: createMovement, quantity: quantity };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KanawaStock = api;
})(typeof window !== 'undefined' ? window : globalThis);
