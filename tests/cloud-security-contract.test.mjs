import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('frontend separates local IndexedDB by cloud company', async () => {
  const app = await read('app/app.js');
  assert.match(app, /openTenant\(companyId\)/);
  assert.match(app, /kanawa_erp_v15_company_/);
  assert.match(app, /await DB\.openTenant\(company\.id\)/);
  assert.ok(app.indexOf("localStorage.setItem('kanawa_empresa', JSON.stringify(empresa))") < app.indexOf('await syncTenantRecords()'), 'company context must be stored before cloud hydration');
});

test('ERP records are synchronized through the RLS-protected company store', async () => {
  const app = await read('app/app.js');
  const migration = await read('supabase/migrations/20261101170000_multitenant_cloud_records.sql');
  assert.match(app, /from\('ks_records'\)\.upsert/);
  assert.match(app, /async function syncTenantRecords\(\)/);
  assert.match(app, /Sincronização legada SQLite desactivada no modo cloud/);
  assert.match(migration, /alter table public\.ks_records enable row level security/i);
  assert.match(migration, /private\.ks_is_company_member\(company_id\)/);
});

test('cloud sync excludes account and secret-bearing stores', async () => {
  const app = await read('app/app.js');
  assert.match(app, /'usuarios','config','integracoesAGT','integracoes_agt'/);
  assert.match(app, /password\|senha\|token\|secret/);
});

test('factory admin credentials are not created or left enabled', async () => {
  const db = await read('server/database.js');
  assert.doesNotMatch(db, /ensureAdminUser\(\)/);
  assert.match(db, /disableInsecureDefaultAdmin\(\)/);
  assert.match(db, /bcrypt\.compareSync\('admin123'/);
});

test('public API registration and fallback JWT secret are disabled', async () => {
  const routes = await read('server/routes.js');
  assert.match(routes, /const JWT_SECRET = process\.env\.JWT_SECRET \|\| null/);
  assert.match(routes, /Registo público desactivado/);
  assert.doesNotMatch(routes, /kanawa-erp-secret/);
});

test('cloud record writes and deletes enforce company membership roles', async () => {
  const migration = await read('supabase/migrations/20261101190000_company_role_policies.sql');
  assert.match(migration, /ks_has_company_role/);
  assert.match(migration, /array\['owner','admin','manager','operator','cashier','accountant'\]/);
  assert.match(migration, /for delete to authenticated[\s\S]*array\['owner','admin','manager'\]/);
});

test('frontend permissions map read-only and accounting members correctly', async () => {
  const app = await read('app/app.js');
  assert.match(app, /accountant: 'contabilista', viewer: 'viewer'/);
  assert.match(app, /viewer: \{ modulos: \[[^\]]+\], acoes: \['ver'\]/);
  assert.match(app, /contabilista: \{ modulos: \[[^\]]+'financeiro'[^\]]+\]/);
});

test('company images use private Supabase Storage with company-folder RLS', async () => {
  const app = await read('app/app.js');
  const migration = await read('supabase/migrations/20261101200000_company_media_storage.sql');
  assert.match(app, /CLOUD_MEDIA_BUCKET = 'ks-company-media'/);
  assert.match(app, /createSignedUrl\(path, 3600\)/);
  assert.match(migration, /public = false/);
  assert.match(migration, /private\.ks_is_company_member/);
  assert.match(migration, /private\.ks_has_company_role/);
});

test('cloud media keeps content-addressed references for offline copies', async () => {
  const app = await read('app/app.js');
  assert.match(app, /hashCloudBlob\(blob\)/);
  assert.match(app, /_cloudMediaRefs/);
  assert.match(app, /DB\.cloudSyncEnabled = false/);
});
