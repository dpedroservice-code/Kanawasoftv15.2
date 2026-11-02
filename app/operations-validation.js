(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KanawaOperations = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ORDER_STATUSES = new Set(['pendente', 'confirmado', 'em preparação', 'enviado', 'entregue', 'cancelado']);
  function toNumber(value) { const normalized = String(value === undefined || value === null ? '' : value).trim().replace(',', '.'); return normalized ? Number(normalized) : NaN; }
  function normalizeCoordinates(latitude, longitude) {
    const lat = toNumber(latitude), lng = toNumber(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Coordenadas inválidas. Latitude deve estar entre -90 e 90 e longitude entre -180 e 180.');
    return { lat, lng, location_source: 'manual', location_verified: true };
  }
  function normalizeRouteDistance(value) {
    const raw = String(value === undefined || value === null ? '' : value).trim();
    if (!raw) return { distance_km: null, distancia: 'Não calculada', distance_source: 'not_calculated' };
    const cleaned = raw.replace(/km$/i, '').trim(); const km = toNumber(cleaned);
    if (!Number.isFinite(km)) throw new Error('Informe a distância em quilómetros, apenas como número (ex.: 12,5).');
    if (km <= 0 || km > 100000) throw new Error('A distância deve ser superior a zero e inferior a 100.000 km.');
    const rounded = Math.round(km * 100) / 100;
    return { distance_km: rounded, distancia: rounded + ' km (manual)', distance_source: 'manual' };
  }
  function normalizeOrderStatus(value) { const status = String(value || '').trim().toLowerCase(); if (!ORDER_STATUSES.has(status)) throw new Error('Estado inválido. Utilize: pendente, confirmado, em preparação, enviado, entregue ou cancelado.'); return status; }
  return { normalizeCoordinates, normalizeRouteDistance, normalizeOrderStatus };
});
