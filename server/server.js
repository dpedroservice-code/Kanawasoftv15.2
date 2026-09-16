const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./database');
const { registerRoutes } = require('./routes');

/* ============================================================
   KANAWA SOFT ERP v15.2 — server.js
   Express · SQLite (sql.js) · CORS · Static · SPA fallback
   Helmet/rateLimit/morgan (opcionais) · Graceful shutdown
   Contrato: startServer({ dataDir, port }) → { port, server }
   ============================================================ */

/* ============ DEPENDÊNCIAS OPCIONAIS ============ */
let helmet = null;
try { helmet = require('helmet'); } catch (e) { console.warn('[Kanawa] helmet não instalado — headers de segurança desativados'); }

let rateLimit = null;
try { rateLimit = require('express-rate-limit'); } catch (e) { console.warn('[Kanawa] express-rate-limit não instalado — rate limit desativado'); }

let morgan = null;
try { morgan = require('morgan'); } catch (e) { /* usa fallback manual */ }

const APP_VERSION = '15.2';

let httpServer = null;
let dbInstance = null;

/* ============ CONFIGURAÇÃO SEGURA ============ */
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const JWT_SECRET = process.env.JWT_SECRET || '';
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

if (IS_PRODUCTION && !JWT_SECRET) {
  throw new Error('[Kanawa] JWT_SECRET é obrigatório em produção. Configure-o no ambiente do servidor.');
}

/* ============ GRACEFUL SHUTDOWN ============ */
function setupGracefulShutdown() {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[Kanawa] Recebido ' + signal + ' — encerrando servidor...');
    try {
      if (dbInstance && typeof dbInstance.saveNow === 'function') dbInstance.saveNow();
    } catch (e) { console.warn('[Kanawa] Erro ao gravar DB:', e.message); }

    if (httpServer && httpServer.close) {
      httpServer.close(() => {
        console.log('[Kanawa] Servidor HTTP encerrado');
        process.exit(0);
      });
      setTimeout(() => {
        console.warn('[Kanawa] Forçando saída após timeout');
        process.exit(0);
      }, 3000);
    } else {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('[Kanawa] uncaughtException:', err);
    try { if (dbInstance && typeof dbInstance.saveNow === 'function') dbInstance.saveNow(); } catch (e) { }
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Kanawa] unhandledRejection:', reason);
  });
}

/* ============ LOG FALLBACK (sem morgan) ============ */
function manualLogger(req, res, next) {
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    const status = res.statusCode;
    console.log(`  ${status} ${req.method} ${req.originalUrl} — ${ms}ms`);
  });
  next();
}

/* ============ CORS SEGURO ============ */
function corsOptions() {
  if (!CORS_ORIGINS.length) {
    return IS_PRODUCTION
      ? { origin: false }
      : { origin: true };
  }
  return {
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('Origem não autorizada pelo CORS'));
    },
    credentials: true
  };
}

/* ============ JWT MIDDLEWARE ============ */
function apiAuthMiddleware(req, res, next) {
  const publicPaths = new Set([
    '/health', '/ping', '/version',
    '/auth/login', '/auth/register'
  ]);
  if (publicPaths.has(req.path)) return next();

  const authHeader = String(req.headers.authorization || '');
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Autenticação obrigatória' });

  let jwt;
  try { jwt = require('jsonwebtoken'); } catch (e) {
    return res.status(503).json({ error: 'Serviço de autenticação indisponível' });
  }

  if (!JWT_SECRET) return res.status(503).json({ error: 'JWT não configurado no servidor' });

  try {
    const payload = jwt.verify(match[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/* ============================================================
   START SERVER
   Retorna: { port: number, server: http.Server }
   Compatível também com uso direto (retorno Promise<number> antigo)
   ============================================================ */
async function startServer(options = {}) {
  const port = options.port === undefined ? 3000 : options.port;
  const dataDir = options.dataDir || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  /* ====== BASE DE DADOS ====== */
  dbInstance = await initDB(path.join(dataDir, 'kanawa.db'));
  console.log('[Kanawa] Base de dados pronta em', path.join(dataDir, 'kanawa.db'));

  /* ====== EXPRESS ====== */
  const app = express();
  app.disable('x-powered-by');

  /* ====== SEGURANÇA (opcional) ====== */
  if (helmet) {
    app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));
    console.log('[Kanawa] Helmet ativo (headers de segurança)');
  }

  /* ====== CORS ====== */
  app.use(cors(corsOptions()));

  /* ====== RATE LIMIT (opcional) ====== */
  if (rateLimit) {
    const limiter = rateLimit({
      windowMs: 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) =>
        req.method === 'OPTIONS' ||
        req.path.startsWith('/imagens/') ||
        req.path.startsWith('/icones/') ||
        req.path.startsWith('/libs/')
    });
    app.use('/api/', limiter);
    console.log('[Kanawa] Rate limit ativo (500 req/min por IP em /api/*)');
  }

  /* ====== BODY PARSERS ====== */
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  /* ====== LOG ====== */
  if (morgan) {
    app.use(morgan('dev'));
  } else {
    app.use(manualLogger);
  }

  /* ====== NO-CACHE EM /api/* ====== */
  app.use('/api/', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

  /* ====== FICHEIROS ESTÁTICOS ====== */
  const appDir = path.join(__dirname, '..', 'app');
  if (fs.existsSync(appDir)) {
    app.use(express.static(appDir));
    if (fs.existsSync(path.join(appDir, 'imagens'))) app.use('/imagens', express.static(path.join(appDir, 'imagens')));
    if (fs.existsSync(path.join(appDir, 'icones'))) app.use('/icones', express.static(path.join(appDir, 'icones')));
    if (fs.existsSync(path.join(appDir, 'libs'))) app.use('/libs', express.static(path.join(appDir, 'libs')));
    console.log('[Kanawa] Ficheiros estáticos servidos de', appDir);
  } else {
    console.warn('[Kanawa] Pasta /app não encontrada — modo API-only');
  }

  /* ====== ENDPOINTS RÁPIDOS ====== */
  app.get('/api/ping', (req, res) => res.json({ pong: true, ts: Date.now() }));
  app.get('/api/version', (req, res) => res.json({
    name: 'Kanawa Soft ERP',
    version: APP_VERSION,
    environment: process.env.NODE_ENV || 'production',
    electron: !!process.versions.electron,
    node: process.version,
    uptime: process.uptime()
  }));

  /* ====== AUTENTICAÇÃO DA API ====== */
  app.use('/api', apiAuthMiddleware);

  /* ====== ROTAS CRUD ====== */
  registerRoutes(app, dbInstance);

  /* ====== FALLBACK SPA ====== */
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();

    const idx = path.join(appDir, 'index.html');
    if (fs.existsSync(idx)) return res.sendFile(idx);

    if (!fs.existsSync(appDir)) {
      return res.status(503).type('html').send(
        '<html><head><title>Kanawa Soft — API ativa</title></head>' +
        '<body style="font-family:system-ui;background:#1a3a5c;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
        '<div style="text-align:center;max-width:640px;padding:32px">' +
        '<h1 style="font-size:2rem;margin:0 0 12px">🚀 Kanawa Soft ERP — API ativa</h1>' +
        '<p style="opacity:.85">Pasta <code style="background:rgba(255,255,255,.15);padding:2px 6px;border-radius:4px">/app</code> não encontrada. Coloque o <code>index.html</code> e os ficheiros do renderer nessa pasta para servir a interface.</p>' +
        '<p style="margin-top:16px"><a href="/api/health" style="color:#60a5fa;text-decoration:none">/api/health</a> · <a href="/api/version" style="color:#60a5fa;text-decoration:none">/api/version</a></p>' +
        '</div></body></html>'
      );
    }
    next();
  });

  /* ====== ERROR HANDLER ====== */
  app.use((err, req, res, next) => {
    console.error('[Kanawa] Erro API:', err);
    const message = IS_PRODUCTION ? 'Erro interno do servidor' : err.message;
    res.status(500).json({ error: message });
  });

  /* ====== LISTEN ====== */
  return new Promise((resolve, reject) => {
    const host = options.host || process.env.HOST || '127.0.0.1';
    httpServer = app.listen(port, host, () => {
      const actualPort = httpServer.address().port;

      console.log('');
      console.log('  ██╗  ██╗ █████╗ ███╗   ██╗ █████╗ ██╗    ██╗ █████╗ ');
      console.log('  ██║ ██╔╝██╔══██╗████╗  ██║██╔══██╗██║    ██║██╔══██╗');
      console.log('  █████╔╝ ███████║██╔██╗ ██║███████║██║ █╗ ██║███████║');
      console.log('  ██╔═██╗ ██╔══██║██║╚██╗██║██╔══██║██║███╗██║██╔══██║');
      console.log('  ██║  ██╗██║  ██║██║ ╚████║██║  ██║╚███╔███╔╝██║  ██║');
      console.log('  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═╝');
      console.log('');
      console.log('[Kanawa] Servidor em http://' + host + ':' + actualPort);
      console.log('[Kanawa] Versão ' + APP_VERSION + ' — SQLite · 135 tabelas');
      console.log('');

      /* ✅ Contrato com main.js: devolve { port, server } */
      resolve({ port: actualPort, server: httpServer });
    });

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port !== 0) {
        console.warn('[Kanawa] Porta ' + port + ' em uso, tentando porta aleatória...');
        httpServer.listen(0, host);
        return;
      }
      reject(err);
    });
  });
}

/* ============ MODO CLI ============ */
if (require.main === module) {
  setupGracefulShutdown();
  startServer({ port: parseInt(process.env.PORT || '3000', 10) })
    .then(({ port }) => {
      console.log('[Kanawa] API em http://127.0.0.1:' + port + '/api/health');
    })
    .catch(err => {
      console.error('[Kanawa] Falha ao arrancar servidor:', err);
      process.exit(1);
    });
}

module.exports = { startServer, getDB: () => dbInstance };