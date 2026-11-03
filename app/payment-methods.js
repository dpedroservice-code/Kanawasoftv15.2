/* KanawaSoft payment methods — pure validation shared by UI and tests. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KanawaPaymentMethods = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULTS = [
    { method_code:'dinheiro', display_name:'Dinheiro', enabled:true, sort_order:10, instructions:'' },
    { method_code:'cartao', display_name:'Cartão bancário', enabled:true, sort_order:20, instructions:'' },
    { method_code:'transferencia', display_name:'Transferência bancária', enabled:true, sort_order:30, instructions:'' },
    { method_code:'multicaixa', display_name:'Multicaixa (TPA)', enabled:true, sort_order:40, instructions:'' },
    { method_code:'misto', display_name:'Pagamento misto', enabled:true, sort_order:50, instructions:'' },
    { method_code:'credito', display_name:'Crédito / a prazo', enabled:true, sort_order:60, instructions:'' },
    { method_code:'referencia', display_name:'Referência de pagamento', enabled:false, sort_order:70, instructions:'' },
    { method_code:'multicaixa_express', display_name:'Multicaixa Express', enabled:false, sort_order:80, instructions:'' }
  ];
  const ALLOWED = new Set(DEFAULTS.map(item => item.method_code));
  function validate(methods) {
    if (!Array.isArray(methods) || methods.length < 1 || methods.length > DEFAULTS.length) throw new Error('Envie entre 1 e 8 métodos de pagamento.');
    const seen = new Set();
    const result = methods.map((item, index) => {
      if (!item || !ALLOWED.has(item.method_code) || seen.has(item.method_code)) throw new Error('Método de pagamento inválido ou repetido.');
      seen.add(item.method_code);
      const fallback = DEFAULTS.find(entry => entry.method_code === item.method_code);
      const display_name = String(item.display_name || fallback.display_name).trim();
      const instructions = String(item.instructions || '').trim();
      if (display_name.length < 2 || display_name.length > 60 || instructions.length > 300 || typeof item.enabled !== 'boolean') throw new Error('Nome, estado ou instruções de pagamento inválidos.');
      return { method_code:item.method_code, display_name, enabled:item.enabled, sort_order:Number.isInteger(item.sort_order) ? Math.max(0,Math.min(1000,item.sort_order)) : (index+1)*10, instructions };
    });
    if (!result.some(item => item.enabled)) throw new Error('Mantenha pelo menos uma forma de pagamento activa.');
    return result;
  }
  return Object.freeze({ defaults:DEFAULTS.map(item=>Object.freeze(Object.assign({},item))), validate });
});
