(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KanawaPermissions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const allowed = new Set(['ver','criar','editar','excluir','exportar','importar','aprovar','cancelar','configurar']);
  const discounts = { gerente: 30, operador: 10, caixa: 5, contabilista: 0, visualizador: 0 };
  function fromMembership(role, permissions) {
    if (role === 'admin') return { modulos: '*', acoes: Array.from(allowed), verFinanceiro: true, excluir: true, configurar: true, descontoMax: 100 };
    const grants = {};
    // Cloud users receive only grants explicitly saved by the company administrator.
    if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
      Object.keys(permissions).forEach(function (name) {
        const value = permissions[name];
        if (!Array.isArray(value)) return;
        const actions = Array.from(new Set(value.filter(function (action) { return allowed.has(action); })));
        if (actions.length) grants[name] = actions;
      });
    }
    const actions = Array.from(new Set(Object.keys(grants).reduce(function (all, name) { return all.concat(grants[name]); }, [])));
    return {
      modulos: Object.keys(grants), permissions: grants, acoes: actions,
      verFinanceiro: (grants.financeiro || []).includes('ver'),
      excluir: actions.includes('excluir'), configurar: actions.includes('configurar'),
      descontoMax: discounts[role] || 0
    };
  }
  function canAccess(perms, moduleName) {
    if (!perms) return false;
    if (perms.modulos === '*') return true;
    if (perms.permissions) {
      if (moduleName === 'perfil') return true;
      const actions = perms.permissions[moduleName] || [];
      return actions.length > 0;
    }
    return Array.isArray(perms.modulos) && perms.modulos.includes(moduleName);
  }
  function canDo(perms, action, moduleName) {
    if (!perms) return false;
    if (perms.modulos === '*') return true;
    if (perms.permissions) return (perms.permissions[moduleName] || []).includes(action);
    // Legacy permission objects must grant BOTH the module and the action.
    // A global action list alone must never authorize another module.
    return Array.isArray(perms.modulos) && perms.modulos.includes(moduleName)
      && Array.isArray(perms.acoes) && perms.acoes.includes(action);
  }
  return { fromMembership, canAccess, canDo };
});
