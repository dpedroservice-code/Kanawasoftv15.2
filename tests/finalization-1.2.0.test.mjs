import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('permanent delete removes catalogue data while preserving historical sale snapshots', () => {
  const migration = read('supabase/migrations/20261104101500_kanawa_finalization_api_and_data_controls.sql');
  const cloud = read('app/cloud.js');
  const app = read('app/app.js');
  assert.match(migration, /ks_delete_company_product/);
  const wrappers = read('supabase/migrations/20261104110000_kanawa_private_admin_rpc_wrappers.sql');
  assert.ok(wrappers.includes('FUNCTION public.ks_delete_company_product') && wrappers.includes('LANGUAGE sql SECURITY INVOKER'));
  assert.ok(wrappers.includes('FUNCTION private.ks_delete_company_product_internal') && wrappers.includes('LANGUAGE plpgsql SECURITY DEFINER'));
  assert.ok(wrappers.includes('FUNCTION public.ks_reset_company_business_data') && wrappers.includes('LANGUAGE sql SECURITY INVOKER'));
  assert.match(migration, /DELETE FROM public\.ks_stock_movements/);
  const history = read('supabase/migrations/20261104115000_kanawa_preserve_sale_history_on_product_delete.sql');
  assert.match(history, /UPDATE public\.ks_sale_items SET product_external_id = NULL/);
  assert.match(history, /sale_history_preserved/);
  assert.doesNotMatch(history, /DELETE FROM public\.ks_sale_items/);
  assert.match(migration, /DELETE FROM public\.ks_products/);
  assert.match(migration, /DELETE FROM public\.ks_records/);
  assert.match(cloud, /rpc\('ks_delete_company_product'/);
  assert.doesNotMatch(cloud, /update\(\{ is_active: false/);
  assert.match(app, /item\.entity === store/);
  assert.match(app, /queueSync\(store, 'delete', \{ id: id \}\)/);
});

test('company reset is server-side, owner-protected and preserves company/auth setup', () => {
  const migration = read('supabase/migrations/20261104101500_kanawa_finalization_api_and_data_controls.sql');
  const app = read('app/app.js');
  const cloud = read('app/cloud.js');
  assert.match(migration, /ks_reset_company_business_data/);
  assert.match(migration, /ARRAY\['owner'\]::text\[\]/);
  assert.match(migration, /DELETE FROM public\.ks_records/);
  assert.match(migration, /DELETE FROM public\.ks_sales/);
  assert.match(migration, /DELETE FROM public\.ks_products/);
  assert.match(cloud, /resetCompanyBusinessData/);
  assert.ok(cloud.includes("functions.invoke('ks-company-reset'"));
  const resetEdge = read('supabase/functions/ks-company-reset/index.ts');
  assert.match(resetEdge, /kanawa-private-documents/);
  assert.match(resetEdge, /listFilesRecursively/);
  assert.match(app, /await KanawaCloud\.resetCompanyBusinessData\(\)/);
  assert.match(app, /Reposição bloqueada: ligue a conta à base central/);
});

test('empty POS cart is blocked and scanner accepts repeated reference codes', () => {
  const app = read('app/app.js');
  assert.match(app, /pdvState\.carrinho\.length === 0/);
  assert.match(app, /Adicione pelo menos um produto antes de avançar/);
  assert.match(app, /\$\$\('\.pdv-screen'\)/);
  assert.match(app, /p\.codigoBarras,p\.codigo,p\.referencia,p\.codigoReferencia,p\.sku/);
  assert.match(app, /Pode ler o próximo código/);
  assert.match(app, /lastScannerAt/);
});

test('student, lessons, real grades, attendance and certificate requirements are implemented', () => {
  const app = read('app/app.js');
  const support = read('app/support-center.js');
  const hub = read('app/module-hub.js');
  for (const store of ['alunos','aulasFormacao','avaliacoesFormacao','presencasFormacao','modelosCertificado']) {
    assert.match(support, new RegExp(store));
  }
  assert.match(support, /Bilhete de Identidade \*/);
  assert.match(support, /Classe \/ Nível \*/);
  assert.match(support, /Registar aula real/);
  assert.match(support, /Lançar avaliação/);
  assert.match(support, /Registar presença/);
  assert.match(support, /grade\.average < 10/);
  assert.match(support, /attendanceRate < 75/);
  assert.ok(support.includes('return { total: relevantLessons.length, rate: present / relevantLessons.length * 100 };'));
  assert.match(support, /assinaturaProprietario/);
  assert.match(support, /assinaturaDiretor/);
  assert.match(hub, /elearning-alunos/);
  assert.match(hub, /elearning-modelos/);
  assert.match(app, /renderElearningAlunos/);
});

test('API keys are one-time secrets with read-only catalogue scope and revocation', () => {
  const migration = read('supabase/migrations/20261104101500_kanawa_finalization_api_and_data_controls.sql');
  const edge = read('supabase/functions/ks-store-api/index.ts');
  const support = read('app/support-center.js');
  assert.match(migration, /secret_hash text NOT NULL UNIQUE/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(read('supabase/migrations/20261104103000_kanawa_lock_api_tables_to_server.sql'), /USING \(false\)/);
  assert.match(edge, /catalog:read/);
  assert.match(edge, /sha256\(apiSecret\)/);
  assert.match(edge, /revoked_at/);
  assert.match(edge, /x-api-key/);
  assert.match(edge, /requireAdmin/);
  assert.match(edge, /warning: "Copie esta chave agora/);
  assert.match(support, /action: 'create-key'/);
  assert.match(support, /action: 'revoke-key'/);
  assert.match(support, /catalog\/products/);
  assert.doesNotMatch(support, /localStorage\.setItem\([^\n]*secret/i);
});

test('payment integration secrets are stored through Vault and never returned to the UI', () => {
  const migration = read('supabase/migrations/20261104101500_kanawa_finalization_api_and_data_controls.sql');
  const edge = read('supabase/functions/ks-store-api/index.ts');
  const support = read('app/support-center.js');
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /vault\.update_secret/);
  assert.match(migration, /ks_company_payment_integrations/);
  assert.match(edge, /ks_save_company_payment_internal/);
  assert.match(edge, /live_transaction_tested: false/);
  assert.match(support, /payApiKey/);
  assert.match(support, /payApiSecret/);
  assert.match(support, /ksSavePaymentIntegration/);
});

test('manual is reachable before login and contains core operating instructions', () => {
  const html = read('app/index.html');
  const manual = read('app/manual.html');
  assert.match(html, /href="manual\.html"/);
  assert.match(html, /Apoio ao Cliente/);
  for (const topic of ['Produtos e serviços','Ponto de venda','Scanner e códigos','Formação, cursos e alunos','Loja online e integração por API','Sincronização, cópias e eliminação']) {
    assert.ok(manual.toLowerCase().includes(topic.toLowerCase()), 'missing manual topic: ' + topic);
  }
  assert.match(manual, /window\.print\(\)/);
  assert.match(manual, /dpedroservice@gmail\.com/);
});

test('currency precision keeps cents and does not round to whole kwanzas', () => {
  const sales = read('app/sales-money.js');
  assert.match(sales, /Math\.round\(\(number \+ Number\.EPSILON\) \* 100\) \/ 100/);
  assert.match(sales, /toFixed\(2\)/);
});
