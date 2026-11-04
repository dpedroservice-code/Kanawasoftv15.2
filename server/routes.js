'use strict';

/**
 * Legacy SQLite REST API retired.
 * The web and desktop renderers use Supabase Auth + PostgreSQL through app/cloud.js.
 * The previous generic SQLite CRUD endpoints had no verified bearer token,
 * tenant isolation or server-side role checks. They must not be exposed.
 */
const { handleFinalizeSale } = require('./supabase-gateway');

function registerRoutes(app) {
  app.post('/api/sales/finalize', async (req, res) => {
    const result = await handleFinalizeSale({
      authorization: req.headers.authorization,
      body: req.body
    });
    res.status(result.status).json(result.body);
  });

  app.get('/api/health', (_req, res) => res.json({
    status: 'ok',
    version: '15.4.0',
    primaryStorage: 'supabase-postgresql',
    legacySqliteApi: 'disabled',
    timestamp: new Date().toISOString()
  }));
  app.use('/api', (req, res, next) => {
    if (req.path === '/ping' || req.path === '/version' || req.path === '/health') return next();
    return res.status(410).json({
      error: 'Esta API SQLite antiga foi desativada por segurança. Utilize a API cloud autenticada do Kanawa Soft.'
    });
  });
}
module.exports = { registerRoutes };
