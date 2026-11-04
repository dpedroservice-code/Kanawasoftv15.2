import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('release metadata is standardized on 1.1.0', () => {
  const pkg = JSON.parse(read('package.json'));
  const html = read('app/index.html');
  const app = read('app/app.js');
  assert.equal(pkg.version, '1.1.0');
  assert.match(html, /Kanawa Soft ERP v1\.1\.0/);
  assert.match(app, /APP_VERSION = '1\.1\.0'/);
  assert.doesNotMatch(html, /v15\.(?:2|3|4|12)/);
});

test('all primary modules load the grouped navigation layer', () => {
  const html = read('app/index.html');
  for (const file of ['performance-bridge.js', 'module-hub.js', 'gps-map.js', 'agt-config.js']) {
    assert.match(html, new RegExp(file.replace('.', '\\.') + '\\?v=1\\.1\\.0\\.1'));
  }
  assert.match(html, /sidebarToggle/);
  assert.match(read('app/module-hub.js'), /Recursos Humanos/);
  assert.match(read('app/module-hub.js'), /kanawa-module-grid/);
});

test('GPS map uses device permission and provides satellite and street layers', () => {
  const gps = read('app/gps-map.js');
  assert.match(gps, /navigator\.geolocation\.watchPosition/);
  assert.match(gps, /World_Imagery/);
  assert.match(gps, /OpenStreetMap/);
  assert.match(gps, /coordinates_valid: true/);
});

test('common data reads are local-first and sale finalization can defer the history mirror', () => {
  const bridge = read('app/performance-bridge.js');
  const cloud = read('app/cloud.js');
  assert.match(bridge, /DB\.getAll\(store\)/);
  assert.match(bridge, /deferMirror: true/);
  assert.match(cloud, /options && options\.deferMirror/);
  assert.match(cloud, /store === 'produtos' && !\(options && options\.skipStockSync\)/);
});

test('AGT private keys are stored in Vault and never persisted in browser storage', () => {
  const ui = read('app/agt-config.js');
  const sql = read('supabase/migrations/20261104080409_kanawa_agt_secure_secret_functions.sql');
  const edge = read('supabase/functions/ks-agt-test/index.ts');
  assert.match(sql, /vault\.create_secret/);
  assert.match(sql, /vault\.update_secret/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ks_get_agt_config_internal\(uuid\) TO service_role/);
  assert.doesNotMatch(ui, /localStorage\.setItem/);
  assert.match(edge, /listarSeries/);
  assert.doesNotMatch(edge, /console\.log\(secrets/);
});

test('branch relationships grant explicit cross-company access through RLS', () => {
  const sql = read('supabase/migrations/20261104081050_kanawa_company_branch_access.sql');
  const cloud = read('app/cloud.js');
  const ui = read('app/agt-config.js');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\\.ks_company_branches/);
  assert.match(sql, /private\\.ks_has_company_permission/);
  assert.match(sql, /private\\.ks_has_company_role/);
  assert.match(sql, /ks_link_company_branch/);
  assert.match(sql, /ks_unlink_company_branch/);
  assert.match(cloud, /async linkBranch/);
  assert.match(ui, /Associar filial/);
});

test('invoice template does not claim AGT software certification', () => {
  const app = read('app/app.js');
  assert.doesNotMatch(app, /Programa certificado Kanawa Soft ERP/);
  assert.match(app, /Referência interna da factura/);
  assert.match(app, /validação oficial AGT só é confirmada após resposta aceite/);
});
