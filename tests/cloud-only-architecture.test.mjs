import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('runtime has a single Supabase/PostgreSQL persistence path; SQLite is removed', () => {
  const pkg = JSON.parse(read('package.json'));
  const server = read('server/server.js');
  const routes = read('server/routes.js');

  assert.equal(Object.hasOwn(pkg.dependencies || {}, 'sql.js'), false);
  assert.equal(Object.hasOwn(pkg.dependencies || {}, 'bcryptjs'), false);
  assert.equal(fs.existsSync(path.join(root, 'server/database.js')), false);
  assert.doesNotMatch(server, /initDB|kanawa\.db|SQLite|sql\.js|dbInstance/);
  assert.match(server, /registerRoutes\(app\)/);
  assert.match(routes, /primaryStorage:\s*'supabase-postgresql'/);
});

test('Cloud bridge defines updateCompany exactly once with owner authorization', () => {
  const cloud = read('app/cloud.js');
  const definitions = cloud.match(/async updateCompany\s*\(/g) || [];
  assert.equal(definitions.length, 1);
  assert.match(cloud, /owner_user_id\s*!==\s*context\.user\.id/);
});

test('startup avoids serial Supabase context reads and blocks no login on background sync', () => {
  const cloud = read('app/cloud.js');
  const app = read('app/app.js');
  const html = read('app/index.html');
  assert.match(cloud, /Promise\.all\(\[\s*client\.from\('ks_companies'\)/);
  assert.match(app, /window\.setTimeout\(async function runDeferredStartup/);
  assert.doesNotMatch(app, /runDeferredStartup\(\)[\s\S]{0,700}pullFromServer\(\)/);
  assert.match(app, /Background automation only pushes pending changes/);
  assert.match(app, /await processSyncQueue\(\)/);
  assert.match(html, /<video[^>]+preload="metadata"/);
  assert.doesNotMatch(html, /<video[^>]+preload="auto"/);
  assert.match(html, /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase/);
});

test('team access changes use the server-validated permission RPC', () => {
  const cloud = read('app/cloud.js');
  assert.match(cloud, /async updateTeamMemberAccess\(details\)/);
  assert.match(cloud, /client\.rpc\('ks_update_team_member_access'/);
  assert.match(cloud, /p_permissions:\s*details\.permissions/);
});
