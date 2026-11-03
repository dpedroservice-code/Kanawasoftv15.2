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
