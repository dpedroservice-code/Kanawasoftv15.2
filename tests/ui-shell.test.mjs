import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../app/permissions.js', import.meta.url), 'utf8');
const cloud = await readFile(new URL('../app/cloud.js', import.meta.url), 'utf8');

test('company setup requires company identity and validates optional email', () => {
  assert.match(html, /id="setupNome"[^>]*required/);
  assert.match(html, /id="setupNif"[^>]*required/);
  assert.match(html, /type="email"[^>]*id="setupEmail"/);
  assert.match(app, /fields\.some\(field => field\.value && !field\.checkValidity\(\)\)/);
});

test('administrator setup requires valid email and a minimum eight-character password', () => {
  assert.match(html, /id="setupAdminNome"[^>]*required/);
  assert.match(html, /id="setupAdminEmail"[^>]*required/);
  assert.match(html, /id="setupAdminSenha"[^>]*minlength="8" required/);
  assert.match(app, /Preencha o nome, email válido e uma senha com pelo menos 8 caracteres/);
});

test('cloud role navigation starts at the first explicitly granted module', () => {
  assert.match(app, /const firstAllowedModule = MENU\.find\(module => podeAcessar\(module\.id\)\)/);
  assert.match(app, /if \(!podeAcessar\(id\)\) \{ toast\('🔒 Sem permissão'/);
  assert.match(permissions, /Cloud users receive only grants explicitly saved by the company administrator/);
});

test('mobile setup forms remain usable and respect reduced-motion preferences', () => {
  assert.match(html, /@media\(max-width:600px\)\{\.form-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /:focus-visible/);
});

test('browser source contains no Supabase service-role credential', () => {
  assert.doesNotMatch(cloud, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(app, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('administrator can open a per-module permission editor for non-admin members', () => {
  assert.match(app, /async function editarPermissoesUsuario\(userId\)/);
  assert.match(app, /data-access-module=/);
  assert.match(app, /async function guardarPermissoesUsuario\(userId\)/);
  assert.match(app, /TEAM_RESERVED_MODULES/);
  assert.match(app, /updateTeamMemberAccess/);
});
