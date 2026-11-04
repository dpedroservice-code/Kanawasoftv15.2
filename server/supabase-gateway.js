'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jiehrswweoyesbabrpjf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_l9HL3zMMJ5rN7vnXUZPa1g_9ZA1q7PO';

function response(status, body) {
  return { status, body };
}

async function handleFinalizeSale(input, fetchImpl) {
  const fetcher = fetchImpl || global.fetch;
  if (typeof fetcher !== 'function') return response(503, { error: 'Serviço de vendas indisponível.' });

  const authorization = String(input && input.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return response(401, { error: 'Sessão autenticada obrigatória.', code: 'AUTH_REQUIRED' });

  const body = input && input.body;
  if (!body || typeof body !== 'object' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.company_id || '')) ||
      !body.sale || typeof body.sale !== 'object' || !Array.isArray(body.items) || body.items.length === 0) {
    return response(400, { error: 'Dados da venda inválidos.', code: 'INVALID_SALE_REQUEST' });
  }

  const token = match[1];
  let authResponse;
  try {
    authResponse = await fetcher(SUPABASE_URL + '/auth/v1/user', {
      method: 'GET',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token }
    });
  } catch (_error) {
    return response(503, { error: 'Não foi possível validar a sessão no serviço de autenticação.', code: 'AUTH_UNAVAILABLE' });
  }
  if (!authResponse.ok) return response(401, { error: 'Sessão expirada ou inválida. Entre novamente.', code: 'INVALID_SESSION' });

  let user;
  try { user = await authResponse.json(); } catch (_error) { user = null; }
  if (!user || !user.id) return response(401, { error: 'Sessão inválida.', code: 'INVALID_SESSION' });

  let rpcResponse;
  try {
    rpcResponse = await fetcher(SUPABASE_URL + '/rest/v1/rpc/ks_finalize_sale', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        p_company_id: body.company_id,
        p_sale: body.sale,
        p_items: body.items
      })
    });
  } catch (_error) {
    return response(503, { error: 'Ligação ao PostgreSQL interrompida. A venda continua pendente de confirmação.', code: 'DATABASE_UNAVAILABLE' });
  }

  let result;
  try { result = await rpcResponse.json(); }
  catch (_error) { result = { error: 'Resposta inválida do serviço de dados.' }; }
  if (!rpcResponse.ok) {
    const code = result && result.code ? String(result.code) : 'SALE_REJECTED';
    const status = code === '42501' ? 403 : (code === '23505' ? 409 : (rpcResponse.status >= 500 ? 503 : 422));
    return response(status, {
      error: result && (result.message || result.error) ? (result.message || result.error) : 'A venda não foi confirmada.',
      code: code,
      details: result && result.details ? result.details : undefined
    });
  }
  return response(200, result);
}

module.exports = { handleFinalizeSale };
