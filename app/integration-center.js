/* KanawaSoft v15.4 — Centro de Integrações
 * Executes real authenticated Supabase checks. It never stores provider secrets in the browser.
 */
(function () {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { results: [], running: false, checkedAt: null };
  const checks = [
    { id:'auth', label:'Sessão Supabase Auth', run: async cloud => {
      const result = await cloud.client.auth.getSession();
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error('Sessão não encontrada.');
      return 'Sessão autenticada';
    }},
    { id:'membership', label:'Empresa e permissões', run: async cloud => {
      const ctx = cloud.context;
      const result = await cloud.client.from('ks_company_memberships')
        .select('company_id,role,status').eq('company_id',ctx.company.id)
        .eq('user_id',ctx.user.id).eq('status','active').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Associação activa não encontrada.');
      return 'Empresa activa · ' + result.data.role;
    }},
    { id:'records', label:'API de registos e isolamento da empresa', run: async cloud => {
      const result = await cloud.client.from('ks_records')
        .select('record_id',{count:'exact',head:true}).eq('company_id',cloud.context.company.id);
      if (result.error) throw result.error;
      return (result.count || 0) + ' registos visíveis para esta empresa';
    }},
    { id:'products', label:'Tabela normalizada de produtos', run: async cloud => {
      const result = await cloud.client.from('ks_products').select('id',{count:'exact',head:true});
      if (result.error) throw result.error;
      return (result.count || 0) + ' produtos normalizados';
    }},
    { id:'technical', label:'Tabelas do Plano Técnica', run: async cloud => {
      const tables = ['ks_technical_products','ks_technical_quotes','ks_technical_stock_balances','ks_technical_work_orders'];
      const results = await Promise.all(tables.map(async name => {
        const response = await cloud.client.from(name).select('id',{count:'exact',head:true});
        if (response.error) throw new Error(name + ': ' + response.error.message);
        return name;
      }));
      return results.length + ' tabelas técnicas acessíveis';
    }}
  ];
  function status(result) {
    return '<span class="badge badge-' + (result.ok ? 'success' : 'danger') + '">' + (result.ok ? 'OK' : 'Falhou') + '</span>';
  }
  async function runChecks() {
    if (state.running) return;
    state.running = true;
    const cloud = window.KanawaCloud;
    const root = document.getElementById('ki-results');
    if (root) root.innerHTML = '<div class="card">A testar autenticação, permissões e APIs…</div>';
    if (!cloud || !cloud.ready || !cloud.client) {
      state.results = [{id:'cloud',label:'Ligação cloud',ok:false,message:'Inicie sessão numa empresa para executar os testes.'}];
    } else {
      state.results = await Promise.all(checks.map(async check => {
        try { return {id:check.id,label:check.label,ok:true,message:await check.run(cloud)}; }
        catch (error) { return {id:check.id,label:check.label,ok:false,message:error.message || 'Falha desconhecida'}; }
      }));
    }
    state.checkedAt = new Date().toISOString();
    state.running = false;
    renderResults();
  }
  function renderResults() {
    const root = document.getElementById('ki-results');
    if (!root) return;
    root.innerHTML = state.results.length ? '<div class="table-wrap"><table><thead><tr><th>Componente</th><th>Estado</th><th>Resultado</th></tr></thead><tbody>' +
      state.results.map(r => '<tr><td><strong>' + esc(r.label) + '</strong></td><td>' + status(r) + '</td><td>' + esc(r.message) + '</td></tr>').join('') +
      '</tbody></table></div><p style="color:var(--text-muted);font-size:.8rem;margin-top:10px">Último teste: ' + esc(new Date(state.checkedAt).toLocaleString('pt-AO')) + '</p>' :
      '<p style="color:var(--text-muted)">Ainda não foram executados testes.</p>';
  }
  async function render() {
    const cloud = window.KanawaCloud;
    const company = cloud && cloud.context && cloud.context.company;
    return '<div class="card"><div class="card-header"><h2 class="card-title"><i class="fas fa-plug"></i> Centro de Integrações e APIs</h2></div>' +
      '<p style="color:var(--text-muted);margin-bottom:14px">Diagnóstico real da ligação cloud, autenticação, permissões, armazenamento e tabelas normalizadas.</p>' +
      '<div class="metric-grid"><div class="metric-card"><div class="label">Base central</div><div class="value" style="font-size:1rem">Supabase PostgreSQL</div><div class="sub">' + (cloud && cloud.ready ? 'Sessão activa' : 'Sem sessão activa') + '</div></div>' +
      '<div class="metric-card"><div class="label">Empresa</div><div class="value" style="font-size:1rem">' + esc(company && (company.trade_name || company.legal_name) || '—') + '</div><div class="sub">Contexto isolado por empresa</div></div>' +
      '<div class="metric-card"><div class="label">APIs externas</div><div class="value" style="font-size:1rem">Não activadas</div><div class="sub">Dependem de fornecedor e credenciais seguras</div></div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Testes de integração</h3><button class="btn btn-primary" onclick="KanawaIntegrations.runChecks()" ' + (state.running ? 'disabled' : '') + '><i class="fas fa-vial"></i> Testar agora</button></div>' +
      '<div id="ki-results"></div></div>' +
      '<div class="card"><h3 class="card-title"><i class="fas fa-shield-alt"></i> Gestão segura de credenciais</h3>' +
      '<p>Chaves privadas, tokens, passwords de gateways e segredos de webhooks não devem ser inseridos nem guardados neste ecrã ou no navegador. Devem ser configurados no servidor/ambiente seguro e validados por endpoints autenticados.</p>' +
      '<p style="margin-top:8px;color:var(--text-muted)">Multicaixa/EMIS, SMS, WhatsApp, mapas, transportadoras e integração fiscal permanecem pendentes de fornecedor, credenciais, backend e testes reais.</p></div></div>';
  }
  window.KanawaIntegrations = { render, runChecks };
})();