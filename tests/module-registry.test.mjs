import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../app/index.html', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../app/permissions.js', import.meta.url), 'utf8');
const technical = await readFile(new URL('../app/technical-suite.js', import.meta.url), 'utf8');
const integrations = await readFile(new URL('../app/integration-center.js', import.meta.url), 'utf8');

test('core module menu has unique IDs', () => {
  const menuBlock = app.match(/const MENU = \[([\s\S]*?)\n\];/);
  assert.ok(menuBlock, 'MENU registry must exist');
  const ids = [...menuBlock[1].matchAll(/id:\s*'([^']+)'/g)].map(match => match[1]);
  assert.ok(ids.length > 0, 'MENU must not be empty');
  assert.equal(new Set(ids).size, ids.length, 'duplicate module IDs found in MENU');
});

test('every menu module has a route renderer', () => {
  const menuBlock = app.match(/const MENU = \[([\s\S]*?)\n\];/);
  const routeBlock = app.match(/const R = \{([\s\S]*?)\n  \};/);
  assert.ok(menuBlock && routeBlock, 'menu and route registries must exist');
  const ids = [...menuBlock[1].matchAll(/id:\s*'([^']+)'/g)].map(match => match[1]);
  const routes = new Set([
    ...[...routeBlock[1].matchAll(/(?:^|[,\n])\s*'([^']+)'\s*:/g)].map(match => match[1]),
    ...[...routeBlock[1].matchAll(/(?:^|[,\n])\s*([a-zA-Z_$][\w$]*)\s*:/g)].map(match => match[1])
  ]);
  assert.deepEqual(ids.filter(id => !routes.has(id)), [], 'menu modules without route renderers');
});

test('sidebar groups parent modules and submodules together', () => {
  assert.ok(app.includes('function moduleGroupLabel(module)'));
  assert.ok(app.includes('<details class="sidebar-group"'));
  assert.ok(app.includes('group.open = !!group.querySelector('));
});

test('all direct route renderers are declared', () => {
  const routeBlock = app.match(/const R = \{([\s\S]*?)\n  \};/);
  const refs = [...routeBlock[1].matchAll(/:\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*(?:,|\n|$)/g)].map(match => match[1]);
  const missing = [...new Set(refs)].filter(name => !new RegExp('(?:function|const|let|var)\\s+' + name + '\\b').test(app));
  assert.deepEqual(missing, [], 'route references without declarations');
});

test('Plano Técnica is loaded once and registered in the core menu', () => {
  assert.match(app, /id:\s*'tecnica'[^\n]*Plano Técnica/);
  assert.match(app, /tecnica:\s*\(\)\s*=>\s*\{[\s\S]*KanawaTechnical\.render\(\)/);
  assert.ok(html.includes('technical-suite.js'));
  assert.equal((html.match(/technical-suite\.js/g) || []).length, 1);
  assert.doesNotMatch(technical, /oldOpen|oldSidebar/, 'technical module must not patch core navigation');
});

test('integration diagnostics are registered in the core module system', () => {
  assert.ok(app.includes("id: 'integracoes', icon: 'fa-plug', label: 'Integrações e APIs'"));
  assert.ok(app.includes('integracoes: () => { if (!window.KanawaIntegrations)'));
  assert.ok(html.includes('integration-center.js'));
  assert.ok(integrations.includes("from('ks_company_memberships')"));
  assert.ok(integrations.includes("from('ks_records')"));
  assert.doesNotMatch(integrations, /type=["']password["']|service_role|secret_key/i);
});

test('manager module access is controlled by explicit grants', () => {
  assert.match(permissions, /Cloud users receive only grants explicitly saved by the company administrator/);
  assert.doesNotMatch(permissions, /role === 'manager'.*grants\.tecnica/);
});
 
test('menu groups display representative icons and accessible item labels', () => {
  assert.ok(app.includes('function moduleGroupIcon(label)'));
  assert.ok(app.includes('moduleGroupIcon(label)'));
  assert.ok(app.includes('aria-label="\' + module.label'));
  assert.ok(html.includes('.sidebar-group summary>i:first-child'));
  assert.ok(html.includes('.sidebar-item:focus-visible'));
});
