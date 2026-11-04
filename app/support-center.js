/* Kanawa Soft 15.3 — apoio, integração de loja, pagamentos e formação */
(function () {
  'use strict';
  const API_URL = 'https://jiehrswweoyesbabrpjf.supabase.co/functions/v1/ks-store-api';
  const SUPABASE_KEY = 'sb_publishable_l9HL3zMMJ5rN7vnXUZPa1g_9ZA1q7PO';
  const STORE_NAMES = ['alunos','aulasFormacao','avaliacoesFormacao','presencasFormacao','modelosCertificado'];
  if (typeof DB !== 'undefined' && Array.isArray(DB.stores)) {
    STORE_NAMES.forEach(function (name) { if (!DB.stores.includes(name)) DB.stores.push(name); });
    DB.version = Math.max(Number(DB.version) || 0, 9);
  }
  const companyId = function () { return window.KanawaCloud && KanawaCloud.context && KanawaCloud.context.company ? KanawaCloud.context.company.id : ''; };
  const escHtml = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); };
  const apiCall = async function (body) {
    if (!window.KanawaCloud || !KanawaCloud.ready) throw new Error('Inicie sessão na empresa para gerir integrações.');
    const sessionResult = await KanawaCloud.client.auth.getSession();
    const session = sessionResult.data && sessionResult.data.session;
    if (!session || !session.access_token) throw new Error('Sessão expirada. Entre novamente.');
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify(Object.assign({ company_id: companyId() }, body))
    });
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok || data.error) throw new Error(data.error || 'Falha na integração (' + response.status + ').');
    return data;
  };
  const getSessionCompany = function () {
    const user = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
    if (!companyId()) throw new Error('Empresa central não identificada.');
    const membershipRole = window.KanawaCloud && KanawaCloud.context && KanawaCloud.context.membership ? KanawaCloud.context.membership.role : '';
    if (!['owner','admin'].includes(membershipRole) && user.role !== 'admin') throw new Error('Apenas o proprietário ou administrador da empresa pode gerir estas integrações.');
  };
  const fileAsDataUrl = function (input) {
    return new Promise(function (resolve, reject) {
      const file = input && input.files && input.files[0];
      if (!file) return resolve('');
      if (file.size > 1500000) return reject(new Error('A imagem deve ter no máximo 1,5 MB.'));
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Não foi possível ler a imagem.')); };
      reader.readAsDataURL(file);
    });
  };
  const formatDate = function (value) { return value ? new Date(value).toLocaleDateString('pt-AO') : '—'; };
  const uploadPrivateStudentDocument = async function (input, studentId, side) {
    const file = input && input.files && input.files[0];
    if (!file) return '';
    if (!window.KanawaCloud || !KanawaCloud.ready) throw new Error('A ligação segura à nuvem é necessária para guardar documentos do BI.');
    if (file.size > 3 * 1024 * 1024) throw new Error('Cada documento do BI deve ter no máximo 3 MB.');
    const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
    if (!allowed.includes(file.type)) throw new Error('Formato de documento não permitido. Use JPG, PNG, WEBP ou PDF.');
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1];
    const path = companyId() + '/students/' + String(studentId) + '/bi-' + side + '.' + ext;
    const result = await KanawaCloud.client.storage.from('kanawa-private-documents').upload(path, file, { upsert: true, contentType: file.type });
    if (result.error) throw result.error;
    return result.data.path;
  };
  const formatNumber = function (value) { return Number(value || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  async function renderIntegracoesApi() {
    try { getSessionCompany(); } catch (e) { return header('Integrações API', 'Acesso protegido', 'var(--primary)', '', 'fa-key') + '<div class="card">' + escHtml(e.message) + '</div>'; }
    return header('Integrações API e Loja Online', 'Chaves seguras para a D.Pedro Soluções e outros e-commerces', 'var(--primary)', '', 'fa-key') +
      '<div class="card"><h3 class="card-title">Criar chave de acesso ao catálogo</h3><p style="color:var(--text-muted);margin:8px 0 14px">A chave permite apenas consultar produtos ativos, preços e stock. Não permite alterar dados, criar vendas ou modificar preços.</p>' +
      '<div class="form-grid"><div class="form-group"><label>Nome da integração *</label><input id="storeApiName" placeholder="Ex.: Loja D.Pedro Soluções"></div>' +
      '<div class="form-group"><label>Finalidade *</label><input id="storeApiPurpose" placeholder="Sincronizar o catálogo da loja online"></div>' +
      '<div class="form-group full"><label>Domínios autorizados (um por linha)</label><textarea id="storeApiOrigins" rows="3" placeholder="https://dpedrosolucoes.shop"></textarea><small>Deixe vazio para integração servidor-a-servidor. Utilize sempre HTTPS.</small></div></div>' +
      '<button class="btn btn-success" onclick="ksCreateStoreApiKey()"><i class="fas fa-key"></i> Gerar chave segura</button><div id="storeApiNewSecret" style="display:none;margin-top:14px"></div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Chaves emitidas</h3><button class="btn btn-secondary btn-sm" onclick="ksLoadStoreApiKeys()">Atualizar</button></div><div id="storeApiKeysList">A carregar…</div></div>' +
      '<div class="card"><h3 class="card-title">Ligação da loja</h3><p>Endpoint de catálogo:</p><code style="display:block;overflow-wrap:anywhere;padding:12px;background:var(--bg)">' + API_URL + '/catalog/products</code>' +
      '<p style="margin-top:10px">Cabeçalho: <code>Authorization: Bearer SUA_CHAVE</code></p><div class="note" style="border-left:4px solid var(--warning);padding:12px;margin-top:10px">A chave secreta deve ser guardada no servidor da loja, nunca em JavaScript público, HTML, repositórios ou aplicações móveis. O catálogo é apenas de leitura.</div>' +
      '<button class="btn btn-info" onclick="ksTestStoreApi()"><i class="fas fa-plug"></i> Testar serviço de integrações</button><div id="storeApiTestResult" style="margin-top:10px"></div></div>';
  }
  async function ksCreateStoreApiKey() {
    try {
      getSessionCompany();
      const name = document.getElementById('storeApiName').value.trim();
      const purpose = document.getElementById('storeApiPurpose').value.trim();
      const origins = document.getElementById('storeApiOrigins').value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (name.length < 2 || purpose.length < 5) throw new Error('Preencha o nome e a finalidade da integração.');
      if (origins.some(function (x) { return !/^https:\/\//i.test(x); })) throw new Error('Os domínios autorizados devem começar por https://.');
      const result = await apiCall({ action: 'create-key', name: name, purpose: purpose, allowed_origins: origins });
      const box = document.getElementById('storeApiNewSecret');
      if (box) {
        box.style.display = 'block';
        box.innerHTML = '<div class="alert alert-success show">Chave criada. Guarde o identificador e o segredo; o segredo só é apresentado agora.</div><label>API Key (identificador)</label><input id="storeApiPublicKey" readonly style="width:100%;font-family:monospace"><label style="display:block;margin-top:8px">API Secret (segredo único)</label><textarea id="storeApiSecretOnce" rows="3" readonly style="width:100%;font-family:monospace"></textarea><div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById(\'storeApiSecretOnce\').value).then(function(){toast(\'Chave copiada\',\'success\')})">Copiar chave</button><button class="btn btn-secondary" onclick="document.getElementById(\'storeApiNewSecret\').style.display=\'none\'">Ocultar segredo</button></div>';
        document.getElementById('storeApiPublicKey').value = result.key.key_prefix;
        document.getElementById('storeApiSecretOnce').value = result.secret;
      }
      await ksLoadStoreApiKeys();
      toast('Chave de API criada com permissão catalog:read.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function ksLoadStoreApiKeys() {
    const target = document.getElementById('storeApiKeysList');
    if (!target) return;
    try {
      const result = await apiCall({ action: 'list-keys' });
      if (!result.keys.length) { target.innerHTML = '<p class="empty">Ainda não existem chaves.</p>'; return; }
      target.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Prefixo</th><th>Permissão</th><th>Estado</th><th>Último uso</th><th>Ação</th></tr></thead><tbody>' +
        result.keys.map(function (key) { return '<tr><td><b>' + escHtml(key.name) + '</b><br><small>' + escHtml(key.purpose) + '</small></td><td><code>' + escHtml(key.key_prefix) + '…</code></td><td>' + escHtml((key.scopes || []).join(', ')) + '</td><td>' + (key.revoked_at ? '<span class="badge badge-danger">Revogada</span>' : '<span class="badge badge-success">Ativa</span>') + '</td><td>' + formatDate(key.last_used_at) + '</td><td>' + (!key.revoked_at ? '<button class="btn btn-sm btn-danger" onclick="ksRevokeStoreApiKey(\'' + key.id + '\')">Revogar</button>' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    } catch (e) { target.textContent = e.message; }
  }
  async function ksRevokeStoreApiKey(id) {
    if (!confirm('Revogar esta chave? A loja deixará de conseguir consultar o catálogo.')) return;
    try { await apiCall({ action: 'revoke-key', key_id: id }); toast('Chave revogada.', 'success'); await ksLoadStoreApiKeys(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function ksTestStoreApi() {
    const target = document.getElementById('storeApiTestResult'); if (!target) return;
    target.textContent = 'Teste de autenticação de gestão concluído. Para validar o catálogo público, utilize a chave no servidor da loja.';
    try { await apiCall({ action: 'list-keys' }); target.textContent = 'Ligação autenticada ao serviço de integrações. Crie uma chave e teste-a a partir do backend da loja.'; }
    catch (e) { target.textContent = 'Falha: ' + e.message; }
  }

  async function renderPagamentosIntegracoes() {
    try { getSessionCompany(); } catch (e) { return header('Métodos de pagamento', 'Acesso protegido', 'var(--primary)', '', 'fa-credit-card') + '<div class="card">' + escHtml(e.message) + '</div>'; }
    return header('Métodos de Pagamento', 'Credenciais protegidas e configuração por empresa/filial', 'var(--success)', '', 'fa-credit-card') +
      '<div class="card"><h3 class="card-title">Configurar método</h3><div class="form-grid">' +
      '<div class="form-group"><label>Fornecedor / método *</label><select id="payProvider"><option value="multicaixa-express">Multicaixa Express</option><option value="unitel-money">Unitel Money</option><option value="paypay">PayPay</option><option value="stripe">Stripe</option><option value="paypal">PayPal</option><option value="bank-transfer">Transferência bancária</option><option value="manual">Pagamento manual</option><option value="other">Outro fornecedor</option></select></div>' +
      '<div class="form-group"><label>Nome apresentado ao cliente *</label><input id="payDisplayName" placeholder="Ex.: Multicaixa Express"></div>' +
      '<div class="form-group"><label>Ambiente</label><select id="payMode"><option value="sandbox">Teste / Sandbox</option><option value="production">Produção</option><option value="manual">Manual</option></select></div>' +
      '<div class="form-group"><label>Ativar método</label><select id="payEnabled"><option value="false">Desativado</option><option value="true">Ativado após validação</option></select></div>' +
      '<div class="form-group full"><label>Finalidade *</label><input id="payPurpose" placeholder="Receber pagamentos de pedidos da loja D.Pedro Soluções"></div>' +
      '<div class="form-group"><label>API Key</label><input id="payApiKey" type="password" autocomplete="off"></div>' +
      '<div class="form-group"><label>API Secret</label><input id="payApiSecret" type="password" autocomplete="new-password"></div>' +
      '<div class="form-group"><label>Merchant / Account ID</label><input id="payMerchant" autocomplete="off"></div>' +
      '<div class="form-group"><label>Webhook Secret</label><input id="payWebhook" type="password" autocomplete="new-password"></div>' +
      '<div class="form-group full"><label>URL de checkout / endpoint oficial</label><input id="payCheckout" type="url" placeholder="https://..."></div>' +
      '<div class="form-group full"><label>Referência da conta / IBAN (se aplicável)</label><input id="payReference"></div></div>' +
      '<div class="note" style="border-left:4px solid var(--warning);padding:12px">As credenciais são guardadas no Vault do servidor. A opção “Ativar” guarda a preferência, mas não ativa cobranças reais até o conector oficial do fornecedor ser implementado e testado.</div>' +
      '<button class="btn btn-success" onclick="ksSavePaymentIntegration()">Guardar configuração segura</button> <button class="btn btn-info" onclick="ksTestPaymentIntegration()">Testar configuração</button><div id="paymentTestResult" style="margin-top:12px"></div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Métodos registados</h3><button class="btn btn-secondary btn-sm" onclick="ksLoadPaymentIntegrations()">Atualizar</button></div><div id="paymentIntegrationsList">A carregar…</div></div>';
  }
  async function ksSavePaymentIntegration() {
    try {
      getSessionCompany();
      const provider = document.getElementById('payProvider').value;
      const result = await apiCall({ action: 'save-payment', provider_code: provider,
        display_name: document.getElementById('payDisplayName').value.trim(),
        purpose: document.getElementById('payPurpose').value.trim(),
        mode: document.getElementById('payMode').value,
        enabled: document.getElementById('payEnabled').value === 'true',
        api_key: document.getElementById('payApiKey').value,
        api_secret: document.getElementById('payApiSecret').value,
        merchant_id: document.getElementById('payMerchant').value,
        webhook_secret: document.getElementById('payWebhook').value,
        checkout_url: document.getElementById('payCheckout').value,
        account_reference: document.getElementById('payReference').value
      });
      ['payApiKey','payApiSecret','payWebhook'].forEach(function (id) { document.getElementById(id).value = ''; });
      toast(result.message || 'Configuração guardada.', 'success'); await ksLoadPaymentIntegrations();
    } catch (e) { toast(e.message, 'error'); }
  }
  async function ksTestPaymentIntegration() {
    const target = document.getElementById('paymentTestResult');
    try {
      const result = await apiCall({ action: 'test-payment', provider_code: document.getElementById('payProvider').value });
      if (target) target.textContent = result.message + (result.live_transaction_tested ? '' : ' (sem transação real)');
      toast(result.message, result.success ? 'success' : 'warning');
    } catch (e) { if (target) target.textContent = e.message; toast(e.message, 'error'); }
  }
  async function ksLoadPaymentIntegrations() {
    const target = document.getElementById('paymentIntegrationsList'); if (!target) return;
    try {
      const result = await apiCall({ action: 'list-payments' });
      target.innerHTML = result.payments.length ? '<div class="table-wrap"><table><thead><tr><th>Método</th><th>Finalidade</th><th>Modo</th><th>Estado</th><th>Ativo</th></tr></thead><tbody>' +
        result.payments.map(function (p) { return '<tr><td>' + escHtml(p.display_name) + '</td><td>' + escHtml(p.purpose) + '</td><td>' + escHtml(p.mode) + '</td><td>' + escHtml(p.status) + '</td><td>' + (p.enabled ? 'Sim' : 'Não') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">Nenhum método configurado.</p>';
    } catch (e) { target.textContent = e.message; }
  }

  async function renderElearningAlunos() {
    const students = await getData('alunos') || [];
    const courses = await getData('cursos') || [];
    const lessons = await getData('aulasFormacao') || [];
    const grades = await getData('avaliacoesFormacao') || [];
    const attend = await getData('presencasFormacao') || [];
    const rows = students.map(function (s) {
      const g = ksStudentGrade(s.id, grades);
      const a = ksStudentAttendance(s.id, lessons, attend, s.cursoId);
      return [escHtml(s.nome), escHtml(s.bi), escHtml(s.classe), escHtml((courses.find(function (c) { return String(c.id) === String(s.cursoId); }) || {}).nome || '—'),
        g.count ? formatNumber(g.average) + '/20' : 'Sem notas', a.total ? formatNumber(a.rate) + '%' : 'Sem presenças',
        (s.biFrentePath ? '<button class="btn btn-sm btn-secondary" onclick="ksOpenStudentDocument(' + s.id + ',\'frente\')">BI frente</button> ' : '') + (s.biVersoPath ? '<button class="btn btn-sm btn-secondary" onclick="ksOpenStudentDocument(' + s.id + ',\'verso\')">BI verso</button> ' : '') + '<button class="btn btn-sm btn-primary" onclick="ksOpenStudent(' + s.id + ')">Editar</button> <button class="btn btn-sm btn-info" onclick="ksIssueCertificate(' + s.id + ')">Certificado</button> <button class="btn btn-sm btn-danger" onclick="ksDeleteStudent(' + s.id + ')">Apagar</button>'];
    });
    return header('Gestão de Alunos, Aulas e Avaliações', students.length + ' alunos · ' + lessons.length + ' aulas registadas', 'var(--success)', '', 'fa-user-graduate') +
      '<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-success" onclick="ksOpenStudent()"><i class="fas fa-user-plus"></i> Cadastrar aluno</button><button class="btn btn-primary" onclick="ksCreateLesson()"><i class="fas fa-chalkboard-teacher"></i> Registar aula</button><button class="btn btn-info" onclick="ksRecordGrade()"><i class="fas fa-clipboard-check"></i> Lançar nota</button><button class="btn btn-secondary" onclick="ksRecordAttendance()"><i class="fas fa-calendar-check"></i> Presença</button></div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Alunos inscritos</h3></div>' + (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>BI</th><th>Classe</th><th>Curso</th><th>Média</th><th>Presença</th><th>Ações</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">Ainda não existem alunos cadastrados.</p>') + '</div>' +
      '<div class="card"><h3 class="card-title">Resumo das aulas e avaliações</h3><p>' + grades.length + ' avaliações registadas · ' + attend.length + ' presenças lançadas.</p><p style="color:var(--text-muted)">As médias são calculadas a partir das notas lançadas. Sem avaliação registada, o sistema não apresenta uma nota fictícia.</p></div>';
  }
  function ksStudentGrade(id, grades) {
    const items = (grades || []).filter(function (g) { return String(g.alunoId) === String(id) && Number(g.maximo) > 0; });
    if (!items.length) return { count: 0, average: 0 };
    return { count: items.length, average: items.reduce(function (sum, g) { return sum + (Number(g.nota) / Number(g.maximo) * 20); }, 0) / items.length };
  }
  function ksStudentAttendance(id, lessons, attend, courseId) {
    const relevantLessons = (lessons || []).filter(function (l) { return courseId === undefined || String(l.cursoId) === String(courseId); });
    const lessonIds = new Set(relevantLessons.map(function (l) { return String(l.id); }));
    const entries = (attend || []).filter(function (a) { return String(a.alunoId) === String(id) && lessonIds.has(String(a.aulaId)); });
    if (!relevantLessons.length) return { total: 0, rate: 0 };
    const present = entries.filter(function (a) { return a.estado === 'presente'; }).length;
    return { total: relevantLessons.length, rate: present / relevantLessons.length * 100 };
  }
  async function ksOpenStudent(id) {
    const students = await getData('alunos') || [];
    const student = id ? students.find(function (s) { return String(s.id) === String(id); }) : {};
    const courses = await getData('cursos') || [];
    const options = courses.map(function (c) { return '<option value="' + c.id + '" ' + (student && String(student.cursoId) === String(c.id) ? 'selected' : '') + '>' + escHtml(c.nome) + '</option>'; }).join('');
    openModal(student && student.id ? 'Editar aluno' : 'Novo aluno',
      '<div class="form-grid"><div class="form-group full"><label>Nome completo *</label><input id="ksStudentName" value="' + escHtml(student.nome || '') + '"></div>' +
      '<div class="form-group"><label>Bilhete de Identidade *</label><input id="ksStudentBI" value="' + escHtml(student.bi || '') + '" placeholder="Número do BI"></div>' +
      '<div class="form-group"><label>Classe / Nível *</label><input id="ksStudentClass" value="' + escHtml(student.classe || '') + '" placeholder="Ex.: 12.ª classe"></div>' +
      '<div class="form-group"><label>Curso *</label><select id="ksStudentCourse"><option value="">Selecione um curso</option>' + options + '</select></div>' +
      '<div class="form-group"><label>Telefone</label><input id="ksStudentPhone" value="' + escHtml(student.telefone || '') + '"></div>' +
      '<div class="form-group"><label>E-mail</label><input id="ksStudentEmail" type="email" value="' + escHtml(student.email || '') + '"></div>' +
      '<div class="form-group"><label>Data de nascimento</label><input id="ksStudentBirth" type="date" value="' + escHtml(student.dataNascimento || '') + '"></div>' +
      '<div class="form-group"><label>Morada</label><input id="ksStudentAddress" value="' + escHtml(student.morada || '') + '"></div>' +
      '<div class="form-group"><label>BI — frente (imagem/PDF)</label><input id="ksStudentBIFront" type="file" accept="image/*,.pdf"></div>' +
      '<div class="form-group"><label>BI — verso (imagem/PDF)</label><input id="ksStudentBIBack" type="file" accept="image/*,.pdf"></div></div>' +
      '<p style="font-size:.78rem;color:var(--text-muted)">Os documentos são dados pessoais: carregue apenas com autorização e mantenha o acesso limitado aos responsáveis da formação.</p>' +
      '<button class="btn btn-success" onclick="ksSaveStudent(' + (student && student.id ? student.id : 'null') + ')">Guardar aluno</button>');
  }
  async function ksSaveStudent(id) {
    const nome = document.getElementById('ksStudentName').value.trim();
    const bi = document.getElementById('ksStudentBI').value.trim();
    const classe = document.getElementById('ksStudentClass').value.trim();
    const cursoId = document.getElementById('ksStudentCourse').value;
    if (!nome || !bi || !classe || !cursoId) { toast('Nome, BI, classe e curso são obrigatórios.', 'warning'); return; }
    const courses = await getData('cursos') || [];
    const course = courses.find(function (c) { return String(c.id) === String(cursoId); });
    if (!course) { toast('Selecione um curso existente.', 'warning'); return; }
    const frontInput = document.getElementById('ksStudentBIFront'), backInput = document.getElementById('ksStudentBIBack');
    if ((frontInput.files.length || backInput.files.length) && (!window.KanawaCloud || !KanawaCloud.ready)) { toast('Ligue-se à internet e à base central para guardar os documentos de BI em segurança.', 'warning'); return; }
    const existing = (await getData('alunos') || []).find(function (s) { return String(s.id) === String(id); }) || {};
    const student = { id: id || undefined, nome: nome, bi: bi, classe: classe, cursoId: course.id, curso: course.nome,
      telefone: document.getElementById('ksStudentPhone').value.trim(), email: document.getElementById('ksStudentEmail').value.trim(),
      dataNascimento: document.getElementById('ksStudentBirth').value, morada: document.getElementById('ksStudentAddress').value.trim(),
      biFrentePath: existing.biFrentePath || '', biVersoPath: existing.biVersoPath || '',
      inscritoEm: existing.inscritoEm || new Date().toISOString(), estado: 'inscrito' };
    const savedId = await saveData('alunos', student);
    let frontPath = '', backPath = '';
    try {
      frontPath = await uploadPrivateStudentDocument(frontInput, savedId, 'frente');
      backPath = await uploadPrivateStudentDocument(backInput, savedId, 'verso');
    } catch (uploadError) {
      const partial = [frontPath, backPath].filter(Boolean);
      if (partial.length && window.KanawaCloud && KanawaCloud.ready) await KanawaCloud.client.storage.from('kanawa-private-documents').remove(partial);
      throw uploadError;
    }
    if (frontPath || backPath) {
      student.id = savedId; student.biFrentePath = frontPath || student.biFrentePath; student.biVersoPath = backPath || student.biVersoPath;
      await saveData('alunos', student);
    }
    closeModal(); toast('Aluno guardado. Os documentos de identificação foram enviados para armazenamento privado.', 'success'); openModule('elearning-alunos');
  }
  async function ksOpenStudentDocument(id, side) {
    const student = (await getData('alunos') || []).find(function (x) { return String(x.id) === String(id); });
    const path = student && (side === 'frente' ? student.biFrentePath : student.biVersoPath);
    if (!path || !window.KanawaCloud || !KanawaCloud.ready) { toast('Documento não disponível.', 'warning'); return; }
    const result = await KanawaCloud.client.storage.from('kanawa-private-documents').createSignedUrl(path, 180);
    if (result.error) { toast('Não foi possível abrir o documento: ' + result.error.message, 'error'); return; }
    window.open(result.data.signedUrl, '_blank', 'noopener');
  }
  async function ksDeleteStudent(id) {
    if (!confirm('Apagar o registo deste aluno? As notas e presenças também serão eliminadas?')) return;
    const [grades, attend] = await Promise.all([getData('avaliacoesFormacao'), getData('presencasFormacao')]);
    const student = (await getData('alunos') || []).find(function (x) { return String(x.id) === String(id); });
    const studentPaths = student ? [student.biFrentePath, student.biVersoPath].filter(Boolean) : [];
    if (studentPaths.length && (!window.KanawaCloud || !KanawaCloud.ready)) { toast('Ligue-se à base central para apagar os documentos privados deste aluno.', 'warning'); return; }
    if (studentPaths.length) { const removed = await KanawaCloud.client.storage.from('kanawa-private-documents').remove(studentPaths); if (removed.error) { toast('Não foi possível apagar os documentos privados: ' + removed.error.message, 'error'); return; } }
    for (const g of grades.filter(function (x) { return String(x.alunoId) === String(id); })) await deleteData('avaliacoesFormacao', g.id);
    for (const a of attend.filter(function (x) { return String(x.alunoId) === String(id); })) await deleteData('presencasFormacao', a.id);
    await deleteData('alunos', id); openModule('elearning-alunos');
  }
  async function ksCreateLesson() {
    const courses = await getData('cursos') || [];
    if (!courses.length) { toast('Cadastre primeiro um curso.', 'warning'); return; }
    openModal('Registar aula real', '<div class="form-grid"><div class="form-group full"><label>Curso *</label><select id="ksLessonCourse">' + courses.map(function (c) { return '<option value="' + c.id + '">' + escHtml(c.nome) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group full"><label>Tema / conteúdo da aula *</label><input id="ksLessonTitle"></div><div class="form-group"><label>Data *</label><input id="ksLessonDate" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
      '<div class="form-group"><label>Hora de início *</label><input id="ksLessonStart" type="time"></div><div class="form-group"><label>Hora de fim *</label><input id="ksLessonEnd" type="time"></div><div class="form-group"><label>Formador *</label><input id="ksLessonTeacher"></div></div><button class="btn btn-success" onclick="ksSaveLesson()">Guardar aula</button>');
  }
  async function ksSaveLesson() {
    const courseId = document.getElementById('ksLessonCourse').value;
    const title = document.getElementById('ksLessonTitle').value.trim();
    const date = document.getElementById('ksLessonDate').value;
    const start = document.getElementById('ksLessonStart').value;
    const end = document.getElementById('ksLessonEnd').value;
    const teacher = document.getElementById('ksLessonTeacher').value.trim();
    if (!courseId || !title || !date || !start || !end || !teacher || end <= start) { toast('Preencha todos os campos e confirme o horário.', 'warning'); return; }
    const course = (await getData('cursos')).find(function (c) { return String(c.id) === String(courseId); });
    await saveData('aulasFormacao', { cursoId: course.id, curso: course.nome, tema: title, data: date, horaInicio: start, horaFim: end, formador: teacher, duracaoMinutos: (Number(end.split(':')[0])*60+Number(end.split(':')[1]))-(Number(start.split(':')[0])*60+Number(start.split(':')[1])) });
    closeModal(); toast('Aula registada.', 'success'); openModule('elearning-alunos');
  }
  async function ksRecordGrade() {
    const students = await getData('alunos') || [];
    if (!students.length) { toast('Cadastre primeiro um aluno.', 'warning'); return; }
    openModal('Lançar avaliação', '<div class="form-grid"><div class="form-group full"><label>Aluno *</label><select id="ksGradeStudent">' + students.map(function (s) { return '<option value="' + s.id + '">' + escHtml(s.nome) + ' · ' + escHtml(s.bi) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>Avaliação *</label><input id="ksGradeTitle" placeholder="Teste, prova, trabalho…"></div><div class="form-group"><label>Data *</label><input id="ksGradeDate" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
      '<div class="form-group"><label>Nota obtida *</label><input id="ksGradeScore" type="number" min="0" step="0.01"></div><div class="form-group"><label>Nota máxima *</label><input id="ksGradeMax" type="number" min="0.01" step="0.01" value="20"></div></div><button class="btn btn-success" onclick="ksSaveGrade()">Registar nota</button>');
  }
  async function ksSaveGrade() {
    const alunoId = document.getElementById('ksGradeStudent').value, titulo = document.getElementById('ksGradeTitle').value.trim();
    const nota = Number(document.getElementById('ksGradeScore').value), maximo = Number(document.getElementById('ksGradeMax').value), data = document.getElementById('ksGradeDate').value;
    if (!alunoId || !titulo || !data || !Number.isFinite(nota) || !Number.isFinite(maximo) || maximo <= 0 || nota < 0 || nota > maximo) { toast('Dados de avaliação inválidos.', 'warning'); return; }
    const student = (await getData('alunos')).find(function (s) { return String(s.id) === String(alunoId); });
    await saveData('avaliacoesFormacao', { alunoId: student.id, aluno: student.nome, cursoId: student.cursoId, titulo: titulo, nota: nota, maximo: maximo, data: data });
    closeModal(); toast('Nota real registada.', 'success'); openModule('elearning-alunos');
  }
  async function ksRecordAttendance() {
    const students = await getData('alunos') || [], lessons = await getData('aulasFormacao') || [];
    if (!students.length || !lessons.length) { toast('Registe primeiro alunos e aulas.', 'warning'); return; }
    openModal('Registar presença', '<div class="form-grid"><div class="form-group full"><label>Aluno *</label><select id="ksAttendStudent">' + students.map(function (s) { return '<option value="' + s.id + '">' + escHtml(s.nome) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group full"><label>Aula *</label><select id="ksAttendLesson">' + lessons.map(function (l) { return '<option value="' + l.id + '">' + escHtml(l.curso) + ' — ' + escHtml(l.tema) + ' (' + formatDate(l.data) + ')</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>Estado *</label><select id="ksAttendState"><option value="presente">Presente</option><option value="ausente">Ausente</option><option value="justificada">Falta justificada</option></select></div></div><button class="btn btn-success" onclick="ksSaveAttendance()">Guardar presença</button>');
  }
  async function ksSaveAttendance() {
    const alunoId = document.getElementById('ksAttendStudent').value, aulaId = document.getElementById('ksAttendLesson').value, estado = document.getElementById('ksAttendState').value;
    const student = (await getData('alunos')).find(function (s) { return String(s.id) === String(alunoId); });
    const lesson = (await getData('aulasFormacao')).find(function (l) { return String(l.id) === String(aulaId); });
    if (!student || !lesson || String(student.cursoId) !== String(lesson.cursoId)) { toast('A aula selecionada não pertence ao curso do aluno.', 'warning'); return; }
    const existing = (await getData('presencasFormacao')).find(function (x) { return String(x.alunoId) === String(alunoId) && String(x.aulaId) === String(aulaId); });
    await saveData('presencasFormacao', { id: existing && existing.id, alunoId: student.id, aluno: student.nome, aulaId: lesson.id, cursoId: lesson.cursoId, estado: estado, data: lesson.data });
    closeModal(); toast('Presença registada.', 'success'); openModule('elearning-alunos');
  }

  async function renderElearningModelos() {
    let models = await getData('modelosCertificado') || [];
    if (!models.length) {
      await saveData('modelosCertificado', { nome: 'Clássico Branco e Dourado', primary: '#17395b', accent: '#c99a36', titulo: 'CERTIFICADO DE CONCLUSÃO', texto: 'Certificamos que', rodape: 'Concluiu com aproveitamento o curso', ativo: true });
      models = await getData('modelosCertificado') || [];
    }
    const rows = models.map(function (m) { return [escHtml(m.nome), '<span style="display:inline-block;width:22px;height:22px;border-radius:5px;background:' + escHtml(m.accent || '#c99a36') + '"></span>', m.ativo ? 'Ativo' : 'Inativo',
      '<button class="btn btn-sm btn-primary" onclick="ksEditCertificateModel(' + m.id + ')">Personalizar</button>']; });
    return header('Modelos de Certificado', models.length + ' modelos disponíveis', 'var(--warning)', '', 'fa-certificate') +
      '<div class="card"><p>Escolha e personalize o modelo para cada aluno. O modelo base é offline e não depende de chamadas à Canva ou a outros serviços.</p>' +
      '<div class="card" style="border:2px solid #c99a36;background:#fff;color:#17395b;padding:24px;text-align:center"><div style="font-size:.75rem;letter-spacing:.3em;color:#c99a36">KANAWA SOFT · FORMAÇÃO</div><h2 style="font-family:Georgia,serif;margin:12px 0;color:#17395b">CERTIFICADO DE CONCLUSÃO</h2><p>Certificamos que</p><h2 style="font-family:Georgia,serif;color:#17395b">NOME DO ALUNO</h2><p>concluiu com aproveitamento o curso de</p><h3 style="color:#c99a36">NOME DO CURSO</h3><div style="display:flex;justify-content:space-around;gap:16px;margin-top:38px;flex-wrap:wrap"><span>Assinatura do Proprietário</span><span>Carimbo da Empresa</span><span>Assinatura do Diretor</span></div></div></div>' +
      '<div class="card"><div class="card-header"><h3 class="card-title">Modelos disponíveis</h3><button class="btn btn-success" onclick="ksEditCertificateModel()">Novo modelo</button></div>' + (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Modelo</th><th>Cor</th><th>Estado</th><th>Ações</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">Sem modelos.</p>') +
      '<p style="margin-top:12px;color:var(--text-muted)">Referência Canva encontrada na conta conectada: <a href="https://www.canva.com/d/Wy7SEswWPTQR0vB" target="_blank">Certificado branco e dourado (abrir e editar no Canva)</a>. O Kanawa mantém o modelo HTML independente para uso offline.</p></div>';
  }
  async function ksEditCertificateModel(id) {
    const models = await getData('modelosCertificado') || [];
    const m = models.find(function (x) { return String(x.id) === String(id); }) || {};
    openModal('Personalizar modelo de certificado', '<div class="form-grid"><div class="form-group full"><label>Nome do modelo *</label><input id="ksModelName" value="' + escHtml(m.nome || '') + '"></div>' +
      '<div class="form-group"><label>Cor principal</label><input id="ksModelPrimary" type="color" value="' + escHtml(m.primary || '#17395b') + '"></div><div class="form-group"><label>Cor de destaque</label><input id="ksModelAccent" type="color" value="' + escHtml(m.accent || '#c99a36') + '"></div>' +
      '<div class="form-group full"><label>Título do certificado</label><input id="ksModelTitle" value="' + escHtml(m.titulo || 'CERTIFICADO DE CONCLUSÃO') + '"></div>' +
      '<div class="form-group full"><label>Texto introdutório</label><input id="ksModelIntro" value="' + escHtml(m.texto || 'Certificamos que') + '"></div>' +
      '<div class="form-group full"><label>Texto de conclusão</label><input id="ksModelFooter" value="' + escHtml(m.rodape || 'Concluiu com aproveitamento o curso') + '"></div>' +
      '<div class="form-group"><label>Carimbo da empresa (imagem)</label><input id="ksModelStamp" type="file" accept="image/*"></div><div class="form-group"><label>Assinatura do proprietário</label><input id="ksModelOwner" type="file" accept="image/*"></div>' +
      '<div class="form-group"><label>Assinatura do diretor</label><input id="ksModelDirector" type="file" accept="image/*"></div><div class="form-group"><label>Logótipo da empresa</label><input id="ksModelLogo" type="file" accept="image/*"></div></div>' +
      '<button class="btn btn-success" onclick="ksSaveCertificateModel(' + (m.id || 'null') + ')">Guardar modelo</button>');
  }
  async function ksSaveCertificateModel(id) {
    try {
      const fields = await Promise.all(['ksModelStamp','ksModelOwner','ksModelDirector','ksModelLogo'].map(function (id) { return fileAsDataUrl(document.getElementById(id)); }));
      const existing = (await getData('modelosCertificado') || []).find(function (x) { return String(x.id) === String(id); }) || {};
      const model = { id: id || undefined, nome: document.getElementById('ksModelName').value.trim(), primary: document.getElementById('ksModelPrimary').value,
        accent: document.getElementById('ksModelAccent').value, titulo: document.getElementById('ksModelTitle').value.trim(),
        texto: document.getElementById('ksModelIntro').value.trim(), rodape: document.getElementById('ksModelFooter').value.trim(),
        carimbo: fields[0] || existing.carimbo || '', assinaturaProprietario: fields[1] || existing.assinaturaProprietario || '',
        assinaturaDiretor: fields[2] || existing.assinaturaDiretor || '', logotipo: fields[3] || existing.logotipo || '', ativo: true };
      if (!model.nome || !model.titulo) throw new Error('Indique o nome e o título do modelo.');
      await saveData('modelosCertificado', model); closeModal(); toast('Modelo guardado para utilização offline.', 'success'); openModule('elearning-modelos');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function ksIssueCertificate(studentId, modelId) {
    const students = await getData('alunos') || [], lessons = await getData('aulasFormacao') || [], grades = await getData('avaliacoesFormacao') || [], attendance = await getData('presencasFormacao') || [], models = await getData('modelosCertificado') || [];
    const s = students.find(function (x) { return String(x.id) === String(studentId); });
    if (!s) { toast('Aluno não encontrado.', 'error'); return; }
    const courseLessons = lessons.filter(function (l) { return String(l.cursoId) === String(s.cursoId); });
    const courseAttendance = attendance.filter(function (a) { return String(a.alunoId) === String(s.id) && courseLessons.some(function (l) { return String(l.id) === String(a.aulaId); }); });
    const grade = ksStudentGrade(s.id, grades);
    const present = courseAttendance.filter(function (a) { return a.estado === 'presente'; }).length;
    const attendanceRate = courseAttendance.length ? present / courseAttendance.length * 100 : 0;
    if (!courseLessons.length || courseAttendance.length < courseLessons.length || !grade.count || grade.average < 10 || attendanceRate < 75) {
      toast('Certificado bloqueado: registe todas as aulas/presenças e avaliações. Requisitos: média mínima 10/20 e presença mínima 75%.', 'warning'); return;
    }
    const availableModels = models.filter(function (m) { return m.ativo !== false; });
    if (!modelId) {
      if (!availableModels.length) { toast('Crie ou ative um modelo de certificado primeiro.', 'warning'); return; }
      openModal('Escolher modelo de certificado', '<div class="form-group"><label>Modelo *</label><select id="ksIssueModel">' + availableModels.map(function (m) { return '<option value="' + m.id + '">' + escHtml(m.nome) + '</option>'; }).join('') + '</select></div><p>Aluno: <b>' + escHtml(s.nome) + '</b><br>Curso: ' + escHtml(s.curso) + '<br>Média: ' + formatNumber(grade.average) + '/20 · Presença: ' + formatNumber(attendanceRate) + '%</p><button class="btn btn-success" onclick="ksIssueCertificate(' + s.id + ',document.getElementById(\'ksIssueModel\').value)">Emitir com este modelo</button>');
      return;
    }
    const model = availableModels.find(function (m) { return String(m.id) === String(modelId); }) || availableModels[0] || { nome:'Clássico Branco e Dourado',primary:'#17395b',accent:'#c99a36',titulo:'CERTIFICADO DE CONCLUSÃO',texto:'Certificamos que',rodape:'Concluiu com aproveitamento o curso' };
    const company = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
    const user = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
    const cert = { alunoId:s.id, aluno:s.nome, bi:s.bi, curso:s.curso, cursoId:s.cursoId, data:new Date().toISOString(), notaFinal:grade.average, presenca:attendanceRate, modelo:model.nome, numero:'CERT-' + Date.now() };
    await saveData('certificacoes', cert);
    const image = function (src, style) { return src ? '<img src="' + src + '" style="' + style + '">' : ''; };
    const html = '<!doctype html><html lang="pt"><meta charset="utf-8"><title>' + escHtml(cert.numero) + '</title><style>body{margin:0;font-family:Georgia,serif;color:' + escHtml(model.primary) + '}main{margin:24px;border:8px double ' + escHtml(model.accent) + ';min-height:680px;padding:50px;text-align:center;position:relative}h1{font-size:32px;color:' + escHtml(model.accent) + ';margin:30px 0}h2{font-size:30px;margin:16px}p{font-size:18px}.sign{display:flex;justify-content:space-around;gap:20px;margin-top:55px;align-items:end}.sign div{width:28%;border-top:1px solid #555;padding-top:8px;font:13px Arial}.sign img{max-width:150px;max-height:70px;display:block;margin:auto}.stamp{max-width:110px;max-height:110px}.logo{max-width:100px;max-height:70px}@media print{button{display:none}}</style><main>' +
      image(model.logotipo,'logo') + '<div style="letter-spacing:5px;color:' + escHtml(model.accent) + '">FORMAÇÃO PROFISSIONAL</div><h1>' + escHtml(model.titulo) + '</h1><p>' + escHtml(model.texto) + '</p><h2>' + escHtml(s.nome) + '</h2><p>Bilhete de Identidade: ' + escHtml(s.bi) + '</p><p>' + escHtml(model.rodape) + '</p><h2 style="color:' + escHtml(model.accent) + '">' + escHtml(s.curso) + '</h2><p>Classificação final: ' + formatNumber(grade.average) + '/20 · Presença: ' + formatNumber(attendanceRate) + '%</p><p>Carga de aulas registadas: ' + courseLessons.length + ' · Emitido em ' + formatDate(cert.data) + '</p><div class="sign"><div>' + image(model.assinaturaProprietario,'') + 'Proprietário<br>' + escHtml(company.proprietario || user.nome || 'Responsável') + '</div><div>' + image(model.carimbo,'stamp') + 'Carimbo da empresa</div><div>' + image(model.assinaturaDiretor,'') + 'Diretor<br>' + escHtml(company.diretor || '') + '</div></div><p style="font:12px Arial;margin-top:25px">N.º ' + escHtml(cert.numero) + '</p></main><script>window.onload=function(){window.print()}<\/script></html>';
    const win = window.open('', '_blank'); if (!win) { toast('Permita janelas pop-up para imprimir o certificado.', 'warning'); return; }
    win.document.open(); win.document.write(html); win.document.close();
    toast('Certificado registado. Confirme a impressão/guardar em PDF.', 'success');
  }

  window.renderIntegracoesApi = renderIntegracoesApi;
  window.renderPagamentosIntegracoes = renderPagamentosIntegracoes;
  window.renderElearningAlunos = renderElearningAlunos;
  window.renderElearningModelos = renderElearningModelos;
  Object.assign(window, { ksCreateStoreApiKey, ksLoadStoreApiKeys, ksRevokeStoreApiKey, ksTestStoreApi, ksSavePaymentIntegration, ksTestPaymentIntegration, ksLoadPaymentIntegrations,
    ksOpenStudent, ksSaveStudent, ksDeleteStudent, ksOpenStudentDocument, ksCreateLesson, ksSaveLesson, ksRecordGrade, ksSaveGrade, ksRecordAttendance, ksSaveAttendance,
    ksEditCertificateModel, ksSaveCertificateModel, ksIssueCertificate });
  document.addEventListener('DOMContentLoaded', function () {
    try { const company = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}'); const phone = document.getElementById('kanawaSupportPhone'); if (phone && company.telefone) phone.textContent = company.telefone; } catch (e) { }
  });
})();