(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KanawaSales = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function roundMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Valor monetário inválido.');
    return number;
  }

  function scaledInteger(value, scale, label) {
    const text = String(value).trim();
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) throw new Error((label || 'Valor') + ' inválido.');
    const fraction = match[3] || '';
    if (fraction.length > scale) throw new Error((label || 'Valor') + ' deve ter no máximo ' + scale + ' casas decimais.');
    const factor = 10n ** BigInt(scale);
    const magnitude = BigInt(match[2]) * factor + BigInt((fraction + '0'.repeat(scale)).slice(0, scale) || '0');
    return match[1] === '-' ? -magnitude : magnitude;
  }

  function fromCents(value) {
    return Number(value) / 100;
  }

  function fromMilli(value) {
    return Number(value) / 1000;
  }

  function normalizeSale(item) {
    if (!item || item.status !== 'finalizada') throw new Error('Apenas vendas finalizadas podem ser sincronizadas.');
    const sourceItems = item.itens || item.carrinho || [];
    if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
      throw new Error('A venda precisa de pelo menos um artigo.');
    }

    const items = sourceItems.map(function (line) {
      const quantityMilli = scaledInteger(line.qty !== undefined ? line.qty : line.quantidade, 3, 'Quantidade');
      const unitPriceCents = scaledInteger(line.preco !== undefined ? line.preco : line.unit_price, 2, 'Preço unitário');
      const expectedLineCents = (quantityMilli * unitPriceCents + 500n) / 1000n;
      const lineTotalCents = line.subtotal !== undefined
        ? scaledInteger(line.subtotal, 2, 'Subtotal da linha')
        : expectedLineCents;
      const productId = String(line.id !== undefined ? line.id : (line.product_external_id || line.product_id || ''));
      if (!productId || quantityMilli <= 0n || unitPriceCents < 0n ||
          lineTotalCents < 0n || lineTotalCents !== expectedLineCents) {
        throw new Error('Artigo inválido: confirme o produto, a quantidade e o preço.');
      }
      return {
        product_external_id: productId,
        product_name: line.nome || line.product_name || 'Artigo',
        quantity: fromMilli(quantityMilli),
        unit_price: fromCents(unitPriceCents),
        line_total: fromCents(lineTotalCents),
        stock_tracked: true
      };
    });

    const subtotalFromItemsCents = items.reduce(function (sum, line) {
      return sum + scaledInteger(line.line_total, 2, 'Subtotal da linha');
    }, 0n);
    const subtotalCents = scaledInteger(item.subtotal, 2, 'Subtotal');
    const discountCents = scaledInteger(item.descontoValor !== undefined ? item.descontoValor : item.discount_value || 0, 2, 'Desconto');
    const taxCents = scaledInteger(item.iva !== undefined ? item.iva : item.tax_amount || 0, 2, 'Imposto');
    const totalCents = scaledInteger(item.total, 2, 'Total');
    const expectedTotalCents = subtotalCents - discountCents + taxCents;

    if (subtotalCents <= 0n || subtotalCents !== subtotalFromItemsCents ||
        discountCents < 0n || discountCents > subtotalCents || taxCents < 0n ||
        totalCents <= 0n || totalCents !== expectedTotalCents) {
      throw new Error('Valores da venda inválidos: confirme subtotal, desconto, imposto e total.');
    }

    const paymentMethod = item.pagamento || item.payment_method || 'não indicado';
    const isCredit = ['credito', 'crédito', 'credit'].includes(String(paymentMethod).toLowerCase());
    let receivedCents = scaledInteger(item.valorRecebido !== undefined ? item.valorRecebido : item.amount_received || 0, 2, 'Valor recebido');
    if (receivedCents < 0n) throw new Error('O valor recebido não pode ser negativo.');
    if (receivedCents === 0n && !isCredit) receivedCents = totalCents;
    if (!isCredit && receivedCents < totalCents) {
      throw new Error('Pagamento insuficiente: falta receber ' + fromCents(totalCents - receivedCents).toFixed(2) + '.');
    }
    const changeCents = receivedCents > totalCents ? receivedCents - totalCents : 0n;


    return {
      sale: {
        external_id: String(item.id),
        invoice_number: item.numeroFatura || item.invoice_number || ('FT-' + item.id),
        customer_name: item.clienteNome || item.customer_name || null,
        customer_tax_id: item.clienteNif || item.customer_tax_id || null,
        customer_phone: item.clienteTelefone || item.customer_phone || null,
        subtotal: fromCents(subtotalCents),
        discount_value: fromCents(discountCents),
        tax_amount: fromCents(taxCents),
        total: fromCents(totalCents),
        amount_received: fromCents(receivedCents),
        change_amount: fromCents(changeCents),
        payment_method: paymentMethod,
        tax_regime: item.regime || item.tax_regime || null,
        status: 'finalizada',
        notes: item.observacoes || item.notes || null,
        operator_name: item.operador || item.operator_name || null,
        sold_at: item.data || item.sold_at || new Date().toISOString()
      },
      items: items
    };
  }

  function validateCartStock(cart, products) {
    if (!Array.isArray(cart) || !Array.isArray(products)) throw new Error('Não foi possível validar o stock do carrinho.');
    const byId = new Map(products.map(function (product) { return [String(product.id), product]; }));
    return cart.map(function (line) {
      const product = byId.get(String(line.id));
      if (!product || product.ativo === false || product.is_active === false) throw new Error('Produto "' + (line.nome || line.id) + '" não existe, está inativo ou foi removido do catálogo.');
      const rawStock = product.estoque !== undefined ? product.estoque : product.stock_quantity;
      const stock = Number(rawStock);
      const quantity = Number(line.qty !== undefined ? line.qty : line.quantidade);
      if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Stock ou quantidade inválida para "' + (line.nome || product.nome || line.id) + '".');
      }
      if (quantity > stock) {
        throw new Error(stock === 0 ? 'Produto esgotado: ' + (line.nome || product.nome || line.id) + '. Stock disponível: 0.' : 'Quantidade indisponível para "' + (line.nome || product.nome || line.id) + '". Stock actual: ' + stock + '; quantidade pedida: ' + quantity + '.');
      }
      return { id: product.id, quantity: quantity, available: stock };
    });
  }

  return { roundMoney: roundMoney, normalizeSale: normalizeSale, validateCartStock: validateCartStock };
});
