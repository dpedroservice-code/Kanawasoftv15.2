import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleFinalizeSale } = require('../../server/supabase-gateway.js');

export default async function salesFinalize(request) {
  let body;
  try { body = await request.json(); }
  catch (_error) {
    return Response.json({ error: 'JSON inválido.', code: 'INVALID_JSON' }, { status: 400 });
  }

  const result = await handleFinalizeSale({
    authorization: request.headers.get('authorization'),
    body
  });

  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export const config = {
  path: '/api/sales/finalize',
  method: 'POST'
};
