const { AsyncLocalStorage } = require('async_hooks');

const tenantContext = new AsyncLocalStorage();

function getContext() {
  return tenantContext.getStore() || null;
}

function runWithContext(user, fn) {
  return tenantContext.run({ user }, fn);
}

function getTenantId() {
  const ctx = getContext();
  const value = ctx && ctx.user ? ctx.user.empresa_id : null;
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function quoteIdentifier(value) {
  return String(value).replace(/[^a-zA-Z0-9_]/g, '');
}

function extractTable(sql) {
  const text = String(sql || '');
  let match = text.match(/\bFROM\s+([a-zA-Z0-9_]+)/i);
  if (match) return quoteIdentifier(match[1]);
  match = text.match(/\bUPDATE\s+([a-zA-Z0-9_]+)/i);
  if (match) return quoteIdentifier(match[1]);
  match = text.match(/\bINSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
  if (match) return quoteIdentifier(match[1]);
  match = text.match(/\bDELETE\s+FROM\s+([a-zA-Z0-9_]+)/i);
  return match ? quoteIdentifier(match[1]) : null;
}

function tableHasTenantColumn(db, table) {
  if (!table || !db || !db.db || typeof db.db.exec !== 'function') return false;
  try {
    const rows = db.db.exec(`PRAGMA table_info(${table})`);
    if (!rows || !rows[0] || !rows[0].values) return false;
    return rows[0].values.some(row => String(row[1]) === 'empresa_id');
  } catch (_) {
    return false;
  }
}

function hasTenantPredicate(sql) {
  return /\bempresa_id\s*(?:=|IN|IS)\b/i.test(String(sql || ''));
}

function injectTenantIntoSelect(sql, params, tenantId) {
  const text = String(sql);
  if (hasTenantPredicate(text)) return { sql: text, params };
  const match = text.match(/\bWHERE\b/i);
  if (match) {
    const pos = match.index + match[0].length;
    return {
      sql: `${text.slice(0, pos)} empresa_id = ? AND${text.slice(pos)}`,
      params: [tenantId, ...params]
    };
  }
  const order = text.search(/\bORDER\s+BY\b/i);
  const limit = text.search(/\bLIMIT\b/i);
  const offset = text.search(/\bOFFSET\b/i);
  const positions = [order, limit, offset].filter(v => v >= 0);
  const insertAt = positions.length ? Math.min(...positions) : text.length;
  return {
    sql: `${text.slice(0, insertAt)} WHERE empresa_id = ? ${text.slice(insertAt)}`,
    params: [tenantId, ...params]
  };
}

function injectTenantIntoMutation(sql, params, tenantId) {
  const text = String(sql);
  const upper = text.trim().toUpperCase();

  if (/^INSERT\s+INTO\s+/i.test(text)) {
    const columns = text.match(/^\s*INSERT\s+INTO\s+[^\s(]+\s*\(([^)]+)\)/i);
    if (!columns) return { sql: text, params };
    const names = columns[1].split(',').map(v => v.trim().replace(/["`]/g, '').toLowerCase());
    const existingIndex = names.indexOf('empresa_id');
    if (existingIndex >= 0) {
      const current = params[existingIndex];
      if (current !== undefined && current !== null && Number(current) !== tenantId) {
        const err = new Error('empresa_id não corresponde à empresa autenticada');
        err.statusCode = 403;
        throw err;
      }
      return { sql: text, params: params.map((v, i) => i === existingIndex ? tenantId : v) };
    }
    const valuesMatch = text.match(/\bVALUES\s*\(([^)]+)\)/i);
    if (!valuesMatch) return { sql: text, params };
    const newColumns = `${columns[1]}, empresa_id`;
    const newValues = `${valuesMatch[1]}, ?`;
    return {
      sql: text.slice(0, columns.index + columns[0].length - 1) + `, empresa_id)` + text.slice(columns.index + columns[0].length),
      params: [...params, tenantId]
    };
  }

  if (/^UPDATE\s+/i.test(text) || /^DELETE\s+FROM\s+/i.test(text)) {
    if (hasTenantPredicate(text)) return { sql: text, params };
    const where = text.search(/\bWHERE\b/i);
    if (where >= 0) {
      const pos = where + 5;
      return { sql: `${text.slice(0, pos)} empresa_id = ? AND${text.slice(pos)}`, params: [tenantId, ...params] };
    }
    return { sql: `${text} WHERE empresa_id = ?`, params: [...params, tenantId] };
  }

  return { sql: text, params };
}

function secureQuery(db, method, sql, params) {
  const tenantId = getTenantId();
  if (!tenantId) return { sql, params };

  const table = extractTable(sql);
  if (!table || !tableHasTenantColumn(db, table)) return { sql, params };

  const normalized = String(sql).trim().toUpperCase();
  if (normalized.startsWith('SELECT')) return injectTenantIntoSelect(sql, params, tenantId);
  if (normalized.startsWith('INSERT')) return injectTenantIntoMutation(sql, params, tenantId);
  if (normalized.startsWith('UPDATE') || normalized.startsWith('DELETE')) return injectTenantIntoMutation(sql, params, tenantId);
  return { sql, params };
}

function createTenantDB(db) {
  return new Proxy(db, {
    get(target, property, receiver) {
      const original = Reflect.get(target, property, receiver);
      if (!['get', 'all', 'run'].includes(property) || typeof original !== 'function') return original;
      return function securedDatabaseMethod(sql, params = []) {
        const secured = secureQuery(target, property, sql, Array.isArray(params) ? params : []);
        return original.call(target, secured.sql, secured.params);
      };
    }
  });
}

function tenantContextMiddleware(req, res, next) {
  if (!req.user) return next();
  if (!req.user.empresa_id) {
    return res.status(403).json({ error: 'Utilizador sem empresa associada' });
  }
  return runWithContext(req.user, next);
}

module.exports = {
  createTenantDB,
  tenantContextMiddleware,
  getContext,
  getTenantId
};
