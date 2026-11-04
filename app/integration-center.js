/* KanawaSoft v15.4 — Centro de Integrações.
 * Provider secrets are submitted once to a server Edge Function and encrypted at rest.
 * The browser only receives provider status and safe metadata, never stored secrets.
 */
(function () {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { results:[], running:false, checkedAt:null, credentials:[], credentialsError:null };
  const providerLabels = {
    bank_api:'API bancária', card_gateway:'Gateway de cartões', multicaixa_express:'Multicaixa Express',
    whatsapp_cloud:'WhatsApp Cloud API', smtp_gmail:'Gmail / SMTP', agt:'AGT / faturação',
    maps:'Mapas e rotas', carrier_macon:'Macon', carrier_cfl:'Caminho de Ferro de Luanda',
    carrier_cfb:'Caminho de Ferro de Benguela', ncarga:'NCARGA CONNECT'
  };
  const checks = [
    { id:'auth', label:'Sessão Supabase Auth', run:async cloud => {
      const result = await cloud.client.auth.getSession();
      if (result.error) throw result.error;
      if (!result.data.session) throw new Error('Sessão não encontrada.');
      return 'Sessão autenticada';
    }},
    { id:'membership', label:'Empresa e permissões', run:async cloud => {
      const ctx = cloud.context;
      const result = await cloud.client.from('ks_company_memberships').select('company_id,role,status')
        .eq('company_id',ctx.company.id).eq('user_id',ctx.user.id).eq('status','active').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Associação activa não encontrada.');
      return 'Empresa activa · ' + result.data.role;
    }},
    { id:'records', label:'API de registos e isolamento da empresa', run:async cloud => {
      const result = await cloud.client.from('ks_records').select('record_id',{count:'exact',head:true})
        .eq('company_id',cloud.context.company.id);
      if (result.error) throw result.error;
      return (result.count || 0) + ' registos visíveis para esta empresa';
    }},
    { id:'products', label:'Tabela normalizada de produtos', run:async cloud => {
      const result = await cloud.client.from('ks_products').select('id',{count:'exact',head:true});
      if (result.error) throw result.error;
      return (result.count || 0) + ' produtos normalizados';
    }},
    { id:'technical', label:'Tabelas do Plano Técnica', run:async cloud => {
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
    root.innerHTML = state.results.length
      ? '<div class="table-wrap"><table><thead><tr><th>Componente</th><th>Estado</th><th>Resultado</th></tr></thead><tbody>' +
        state.results.map(r => '<tr><td><strong>' + esc(r.label) + '</strong></td><td>' + status(r) + '</td><td>' + esc(r.message) + '</td></tr>').join('') +
        '</tbody></table></div><p style="color:var(--text-muted);font-size:.8rem;margin-top:10px">Último teste: ' + esc(new Date(state.checkedAt).toLocaleString('pt-AO')) + '</p>'
      : '<p style="color:var(--text-muted)">Ainda não foram executados testes.</p>';
  }
  async function loadCredentials(cloud) {
    state.credentialsError = null;
    try {
      state.credentials = await cloud.listCompanyProviderCredentials();
    } catch (error) {
      state.credentials = [];
      state.credentialsError = error.message || 'O cofre ainda não está disponível neste ambiente.';
    }
  }
  function renderCredentialVault(canManage) {
    const rows = state.credentials.map(item => {
      const metadata = item.metadata || {};
      const remove = canManage
        ? '<button class="btn btn-sm btn-danger" onclick="KanawaIntegrations.deleteCredential(&#39;' + esc(item.provider_code) + '&#39;)"><i class="fas fa-trash"></i></button>'
        : '';
      return '<tr><td><strong>' + esc(providerLabels[item.provider_code] || item.provider_code) + '</strong></td>' +
        '<td>' + esc(metadata.environment || '—') + '</td><td>' + esc(metadata.label || metadata.endpoint || 'Credencial cifrada') + '</td>' +
        '<td>' + esc(new Date(item.updated_at).toLocaleString('pt-AO')) + '</td><td>' + remove + '</td></tr>';
    }).join('');
    const form = canManage
      ? '<div class="form-grid"><div class="form-group"><label>Fornecedor / serviço</label><select id="ki-provider">' +
        Object.keys(providerLabels).map(code => '<option value="' + code + '">' + esc(providerLabels[code]) + '</option>').join('') +
        '</select></div><div class="form-group"><label>Ambiente</label><select id="ki-environment"><option value="sandbox">Sandbox / testes</option><option value="production">Produção</option></select></div>' +
        '<div class="form-group full"><label>Endpoint HTTPS (se aplicável)</label><input id="ki-endpoint" type="url" placeholder="https://api.fornecedor.ao" autocomplete="off"></div>' +
        '<div class="form-group full"><label>Identificação / descrição</label><input id="ki-label" maxlength="120" placeholder="Conta de testes / empresa" autocomplete="off"></div>' +
        '<div class="form-group full"><label>Credenciais em JSON</label><textarea id="ki-secret" rows="5" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder=\'{ "api_key": "..." }\'></textarea>' +
        '<small>O segredo é enviado à função segura, cifrado no servidor e limpo deste campo após o envio. Não é guardado em localStorage nem IndexedDB.</small></div></div>' +
        '<button class="btn btn-primary" onclick="KanawaIntegrations.saveCredential()"><i class="fas fa-lock"></i> Guardar credencial cifrada</button>'
      : '<p>Somente o proprietário ou administrador pode gerir credenciais de fornecedores.</p>';
    const list = state.credentialsError
      ? '<div class="alert alert-warning show">' + esc(state.credentialsError) + ' Aplique primeiro a migração do cofre no ambiente de teste e configure a chave de cifragem do servidor.</div>'
      : (rows
        ? '<div class="table-wrap"><table><thead><tr><th>Fornecedor</th><th>Ambiente</th><th>Identificação</th><th>Actualizado</th><th>Ações</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p style="color:var(--text-muted)">Nenhuma credencial configurada.</p>');
    return '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-vault"></i> Cofre de credenciais</h3><span class="badge badge-info">AES-256-GCM</span></div>' +
      '<p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px">O navegador nunca recebe uma credencial depois de guardada. O servidor armazena apenas o conteúdo cifrado e metadados não secretos.</p>' +
      form + '<div style="margin-top:14px"><h4>Integrações configuradas</h4>' + list + '</div></div>';
  }
  async function saveCredential() {
    const cloud = window.KanawaCloud;
    const field = document.getElementById('ki-secret');
    if (!cloud || !cloud.ready || !field) return;
    let secret = null;
    try {
      secret = JSON.parse(field.value);
      if (!secret || typeof secret !== 'object' || Array.isArray(secret)) throw new Error('Envie um objeto JSON com as credenciais.');
      const metadata = {
        environment:document.getElementById('ki-environment').value,
        endpoint:document.getElementById('ki-endpoint').value.trim(),
        label:document.getElementById('ki-label').value.trim()
      };
      const result = await cloud.saveProviderCredential({
        provider_code:document.getElementById('ki-provider').value,
        secret:secret,
        metadata:metadata
      });
      secret = null;
      field.value = '';
      if (window.toast) window.toast(result.message || 'Credencial cifrada no servidor.', 'success');
      if (typeof window.openModule === 'function') window.openModule('integracoes');
    } catch (error) {
      if (window.toast) window.toast(error.message || 'Não foi possível guardar a credencial.', 'error');
    } finally {
      secret = null;
      if (field) field.value = '';
    }
  }
  async function deleteCredential(providerCode) {
    const cloud = window.KanawaCloud;
    if (!cloud || !cloud.ready) return;
    if (!confirm('Remover a credencial cifrada de ' + (providerLabels[providerCode] || providerCode) + '?')) return;
    try {
      await cloud.deleteProviderCredential(providerCode);
      if (window.toast) window.toast('Credencial removida do cofre.', 'success');
      if (typeof window.openModule === 'function') window.openModule('integracoes');
    } catch (error) {
      if (window.toast) window.toast(error.message || 'Não foi possível remover a credencial.', 'error');
    }
  }
  async function render() {
    const cloud = window.KanawaCloud;
    const company = cloud && cloud.context && cloud.context.company;
    const canManage = !!(cloud && cloud.ready && cloud.context && ['owner','admin'].includes(cloud.context.role));
    if (canManage) await loadCredentials(cloud);
    return '<div class="card"><div class="card-header"><h2 class="card-title"><i class="fas fa-plug"></i> Centro de Integrações e APIs</h2></div>' +
      '<p style="color:var(--text-muted);margin-bottom:14px">Diagnóstico real da ligação cloud, autenticação, permissões, armazenamento e tabelas normalizadas.</p>' +
      '<div class="metric-grid"><div class="metric-card"><div class="label">Base central</div><div class="value" style="font-size:1rem">Supabase PostgreSQL</div><div class="sub">' + (cloud && cloud.ready ? 'Sessão activa' : 'Sem sessão activa') + '</div></div>' +
      '<div class="metric-card"><div class="label">Empresa</div><div class="value" style="font-size:1rem">' + esc(company && (company.trade_name || company.legal_name) || '—') + '</div><div class="sub">Contexto isolado por empresa</div></div>' +
      '<div class="metric-card"><div class="label">APIs externas</div><div class="value" style="font-size:1rem">Dependentes de configuração</div><div class="sub">Fornecedor, contrato e sandbox necessários</div></div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Testes de integração</h3><button class="btn btn-primary" onclick="KanawaIntegrations.runChecks()" ' + (state.running ? 'disabled' : '') + '><i class="fas fa-vial"></i> Testar agora</button></div><div id="ki-results"></div></div>' +
      renderCredentialVault(canManage) +
      '<div class="card"><h3 class="card-title"><i class="fas fa-shield-alt"></i> Regras de segurança</h3>' +
      '<p>Guardar uma credencial não significa que o fornecedor esteja ligado. Cada banco, gateway, WhatsApp, Gmail, AGT, mapa e transportadora ainda precisa do respectivo adaptador, contrato, webhook e teste sandbox.</p>' +
      '<p style="margin-top:8px;color:var(--text-muted)">KANAWA_CREDENTIALS_ENCRYPTION_KEY deve ser definida como segredo no ambiente Supabase antes de guardar credenciais. O valor deve ter 32 bytes em Base64.</p></div></div>';
  }
  window.KanawaIntegrations = { render, runChecks, saveCredential, deleteCredential };
})();
