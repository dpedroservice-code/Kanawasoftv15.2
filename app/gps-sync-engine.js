(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KanawaGpsSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function timestamp(record) {
    const value = record && (record.ultimaAtualizacao || record.timestamp || record.updated_at);
    const parsed = value ? Date.parse(value) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function merge(localRecords, remoteRecords, pendingIds) {
    const local = Array.isArray(localRecords) ? localRecords : [];
    const remote = Array.isArray(remoteRecords) ? remoteRecords : [];
    const pending = new Set((Array.isArray(pendingIds) ? pendingIds : []).map(String));
    const byId = new Map(local.filter(x => x && x.id !== undefined && x.id !== null).map(x => [String(x.id), x]));
    const changedRecords = [];

    remote.forEach(function (record) {
      if (!record || record.id === undefined || record.id === null) return;
      const id = String(record.id);
      if (pending.has(id)) return;
      const current = byId.get(id);
      if (current && timestamp(current) > timestamp(record)) return;
      if (current && timestamp(current) === timestamp(record) &&
          Number(current.lat) === Number(record.lat) && Number(current.lng) === Number(record.lng) &&
          current.status === record.status) return;
      byId.set(id, record);
      changedRecords.push(record);
    });

    return { records: Array.from(byId.values()), changedRecords: changedRecords, changedCount: changedRecords.length };
  }

  return { merge: merge };
});
