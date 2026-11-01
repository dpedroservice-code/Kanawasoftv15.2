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

test('company logo uses private storage and a database path reference', async () => {
  const app = await read('app/app.js');
  const migration = await read('supabase/migrations/20261101210000_company_logo_storage_path.sql');
  assert.match(app, /company\.logo_path/);
  assert.match(app, /logo_path: logoPath/);
  assert.match(migration, /add column if not exists logo_path text/i);
});

test('non-certified printouts do not claim AGT approval or digital signatures', async () => {
  const app = await read('app/app.js');
  assert.match(app, /DOCUMENTO COMERCIAL \/ RECIBO/);
  assert.match(app, /não possui certificação\/validação AGT/);
  assert.match(app, /não constituem assinatura digital JWS\/RS256/);
  assert.doesNotMatch(app, /Programa certificado Kanawa Soft|Código de Autenticação AGT|quiosqueagt\.minfin\.gov\.ao|gerarAssinatura\(|Assinatura: '\s*\+|Hash de assinatura/);
});

test('cloud hydration is explicitly scoped to the selected company', async () => {
  const app = await read('app/app.js');
  assert.match(app, /from\('ks_records'\)[\s\S]{0,180}\.eq\('company_id', companyId\)/);
});

test('cloud media references are persisted after successful upload', async () => {
  const app = await read('app/app.js');
  assert.match(app, /stable private Storage paths locally/);
  assert.match(app, /_cloudMediaRefs: prepared\.mediaRefs/);
});

test('reset-all does not reference undefined media variables', async () => {
  const app = await read('app/app.js');
  const start = app.indexOf('async function clearAllCloudRecords()');
  const end = app.indexOf('async function deleteCloudRecord', start);
  const fn = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(fn, /prepared|store, item/);
});

test('password recovery callback supports a real password update', async () => {
  const app = await read('app/app.js');
  assert.match(app, /event === 'PASSWORD_RECOVERY'/);
  assert.match(app, /auth\.updateUser\(\{ password \}\)/);
  assert.match(app, /guardarNovaSenhaRecuperacao/);
});

test('cloud profile cannot self-assign a company role or change email locally', async () => {
  const app = await read('app/app.js');
  assert.match(app, /id="perfilRole"'\s*\+ \(CLOUD_AUTH \? ' disabled/);
  assert.match(app, /Cloud roles are controlled by ks_company_memberships\/RLS/);
  assert.match(app, /email actual foi mantido/);
});

test('cloud password change reauthenticates the current password', async () => {
  const app = await read('app/app.js');
  assert.match(app, /auth\.signInWithPassword\(\{ email: user\.email, password: atual \}\)/);
  assert.match(app, /auth\.updateUser\(\{ password: nova \}\)/);
});

test('active user can switch only between their own active company memberships', async () => {
  const app = await read('app/app.js');
  const html = await read('app/index.html');
  assert.match(app, /async function restaurarSessaoCloud\(selectedCompanyId = null\)/);
  assert.match(app, /\.in\('id', memberships\.map\(m => m\.company_id\)\)/);
  assert.match(app, /async function switchCompany\(companyId\)/);
  assert.match(app, /memberships\.find\(m => m\.company_id === currentId\) \|\| memberships\[0\]/);
  assert.match(html, /id="companySwitcher"/);
});

test('company invitations use a server-side Edge Function with admin authorization', async () => {
  const app = await read('app/app.js');
  const fn = await read('supabase/functions/ks-invite-member/index.ts');
  assert.match(app, /functions\/v1\/ks-invite-member/);
  assert.ok(app.includes("'Authorization': 'Bearer ' + sessionData.session.access_token"));
  assert.match(fn, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(fn, /admin\.auth\.getUser\(token\)/);
  assert.match(fn, /inviteUserByEmail/);
  assert.match(fn, /\["owner", "admin"\]\.includes\(membership\.role\)/);
  assert.match(fn, /status: "invited"/);
});

test('invited users become active only after confirming their email', async () => {
  const migration = await read('supabase/migrations/20261101155214_kanawa_company_member_invites.sql');
  assert.match(migration, /after update of email_confirmed_at on auth\.users/i);
  assert.match(migration, /status = 'active'[\s\S]*status = 'invited'/i);
  assert.match(migration, /profile_read_company_admin/);
  assert.match(migration, /membership_read_company_admin/);
});
