(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KanawaAttendance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function minutes(value) {
    const match = /^(?:([01]\\d|2[0-3])):([0-5]\\d)$/.exec(String(value || '').trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }
  function calculateHours(entry, exit) {
    let start = minutes(entry), end = minutes(exit);
    if (start === null || end === null) return null;
    if (end < start) end += 1440;
    return Math.round(((end - start) / 60) * 100) / 100;
  }
  function summarize(records) {
    const groups = new Map();
    (Array.isArray(records) ? records : []).forEach(function (record) {
      const name = String(record && record.funcionario || 'Não identificado').trim() || 'Não identificado';
      if (!groups.has(name)) groups.set(name,{funcionario:name,registos:0,fechados:0,emAberto:0,horas:0});
      const row = groups.get(name); row.registos += 1;
      const hours = calculateHours(record.entrada,record.saida);
      if (hours === null) row.emAberto += 1;
      else { row.fechados += 1; row.horas += hours; }
    });
    return Array.from(groups.values()).map(function(row) {
      row.horas = Math.round(row.horas * 100) / 100;
      return row;
    }).sort(function(a,b){return a.funcionario.localeCompare(b.funcionario);});
  }
  return Object.freeze({minutes,calculateHours,summarize});
});
