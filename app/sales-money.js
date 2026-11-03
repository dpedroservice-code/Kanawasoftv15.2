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

  function normalizeSale(item) {
    if (!item || item.status !== 'finalizada') throw new Error('Apenas vendas finalizadas podem ser sincronizadas.');
    const sourceItems = item.itens || item.carrinho || [];
    if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
      throw new Error('A venda precisa de pelo menos um artigo.');
    }

    const items = sourceItems.map(function (line) {
      const quantity = Number(line.qty !== undefined ? line.qty : line.quantidade);
      const unitPrice = roundMoney(line.preco !== undefined ? line.preco : line.unit_price);
      const expectedLineTotal = roundMoney(quantity * unitPrice);
      const lineTotal = roundMoney(line.subtotal !== undefined ? line.subtotal : expectedLineTotal);
      const productId = String(line.id !== undefined ? line.id : (line.product_external_id || line.product_id || ''));
      if (!productId || !Number.isFinite(quantity) || quantity <= 0 || unitPrice < 0 || lineTotal < 0 ||
          lineTotal !== expectedLineTotal) {
        throw new Error('Artigo inválido: confirme o produto, a quantidade e o preço.');
      }
      return {
        product_external_id: productId,
        product_name: line.nome || line.product_name || 'Artigo',
        quantity: quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
        stock_tracked: true
      };
    });

    const subtotalFromItems = roundMoney(items.reduce(function (sum, line) { return sum + line.line_total; }, 0));
    const subtotal = roundMoney(item.subtotal);
    const discount = roundMoney(item.descontoValor !== undefined ? item.descontoValor : item.discount_value || 0);
    const tax = roundMoney(item.iva !== undefined ? item.iva : item.tax_amount || 0);
    const total = roundMoney(item.total);
    const expectedTotal = roundMoney(subtotal - discount + tax);

    if (subtotal <= 0 || subtotal !== subtotalFromItems ||
        discount < 0 || discount > subtotal || tax < 0 || total <= 0 ||
        total !== expectedTotal) {
      throw new Error('Valores da venda inválidos: confirme subtotal, desconto, imposto e total.');
    }

    const paymentMethod = item.pagamento || item.payment_method || 'não indicado';
    const isCredit = ['credito', 'crédito', 'credit'].includes(String(paymentMethod).toLowerCase());
    let received = roundMoney(item.valorRecebido !== undefined ? item.valorRecebido : item.amount_received || 0);
    if (received < 0) throw new Error('O valor recebido não pode ser negativo.');
    if (received === 0 && !isCredit) received = total;
    if (!isCredit && received < total) throw new Error('Pagamento insuficiente: falta receber ' + roundMoney(total - received).toFixed(2) + '.');
    const change = Math.max(0, received - total);

    return {
      sale: {
        external_id: String(item.id),
        invoice_number: item.numeroFatura || item.invoice_number || ('FT-' + item.id),
        customer_name: item.clienteNome || item.customer_name || null,
        customer_tax_id: item.clienteNif || item.customer_tax_id || null,
        customer_phone: item.clienteTelefone || item.customer_phone || null,
        subtotal: subtotal,
        discount_value: discount,
        tax_amount: tax,
        total: total,
        amount_received: received,
        change_amount: change,
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
