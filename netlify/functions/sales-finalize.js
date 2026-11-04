'use strict';

const { handleFinalizeSale } = require('../../server/supabase-gateway');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Método não permitido.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_error) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'JSON inválido.', code: 'INVALID_JSON' }) };
  }

  const result = await handleFinalizeSale({
    authorization: event.headers && (event.headers.authorization || event.headers.Authorization),
    body: body
  });

  return {
    statusCode: result.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(result.body)
  };
};
