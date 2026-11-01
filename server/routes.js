'use strict';

/**
 * Legacy SQLite REST API retired.
 *
 * The web and desktop renderers use Supabase Auth + PostgreSQL directly through
 * app/cloud.js. The previous generic SQLite CRUD routes had no bearer-token
 * verification, tenant isolation, or server-side role enforcement. Exposing
 * them would allow unauthenticated reads/writes and cross-company data access.
 *
 * Keep only a local health endpoint. Do not re-enable generic CRUD routes until
 * they are rebuilt around verified Supabase JWTs, tenant scoping and RBAC.
 */
function registerRoutes(app) {
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '15.2',
      primaryStorage: 'supabase-postgresql',
      legacySqliteApi: 'disabled',
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api', (req, res, next) => {
    if (req.path === '/ping' || req.path === '/version' || req.path === '/health') return next();
    return res.status(410).json({
      error: 'Esta API SQLite antiga foi desativada por segurança. Utilize a API cloud autenticada do Kanawa Soft.'
    });
  });
}

module.exports = { registerRoutes };
