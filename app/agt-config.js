(function () {
  'use strict';
  const originalRenderConfig = window.renderConfig;
  function value(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function statusLabel(meta) {
    if (!meta || !meta.status) return 'Não configurado';
    const labels = { saved_not_tested: 'Credenciais guardadas — por testar', connected: 'Ligação testada', failed: 'Teste sem sucesso', connection_error: 'Erro de ligação' };
    return labels[meta.status] || meta.status;
  }
  async function renderCard() {
    let meta = null;
    if (window.KanawaCloud && KanawaCloud.ready && typeof KanawaCloud.getAgtSettings === 'function') {
      try { meta = await KanawaCloud.getAgtSettings(); } catch (error) { console.warn('AGT settings:', error); }
    }
    const company = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
    const nif = (meta && meta.tax_registration_number) || company.nif || '';
    const env = (meta && meta.environment) || 'hml';
    return '<div class="card" id="kanawaAgtConfig">' +
      '<div class="card-header"><h3 class="card-title"><i class="fas fa-file-signature"></i> Integração oficial de Faturação Electrónica — AGT</h3>' +
      '<span class="badge badge-' + (meta && meta.status === 'connected' ? 'success' : 'warning') + '">' + statusLabel(meta) + '</span></div>' +
      '<p style="font-size:.85rem;color:var(--text-muted);margin-bottom:14px">As credenciais são enviadas por HTTPS e guardadas no Supabase Vault. Não ficam no IndexedDB, no navegador nem nos registos normais da empresa. O teste consulta as séries; não emite facturas.</p>' +
      '<div class="form-grid">' +
      '<div class="form-group"><label>Ambiente AGT</label><select id="agtEnvironment"><option value="hml" ' + (env === 'hml' ? 'selected' : '') + '>Homologação / Testes</option><option value="prod" ' + (env === 'prod' ? 'selected' : '') + '>Produção</option></select></div>' +
      '<div class="form-group"><label>NIF do contribuinte *</label><input id="agtTaxRegistrationNumber" value="' + esc(nif) + '" maxlength="15" autocomplete="off"></div>' +
      '<div class="form-group"><label>Identificação do software *</label><input id="agtProductId" value="' + esc((meta && meta.product_id) || 'Kanawa Soft ERP') + '"></div>' +
      '<div class="form-group"><label>Versão do software *</label><input id="agtProductVersion" value="1.1.0" readonly></div>' +
      '<div class="form-group"><label>Número de validação/certificação do software *</label><input id="agtSoftwareValidationNumber" value="' + esc((meta && meta.software_validation_number) || '') + '" placeholder="Número atribuído pela AGT"></div>' +
      '<div class="form-group"><label>Versão da assinatura *</label><input id="agtSignatureVersion" type="number" min="1" value="' + Number((meta && meta.signature_version) || 1) + '"></div>' +
      '<div class="form-group"><label>Estabelecimento *</label><input id="agtEstablishmentNumber" value="' + esc((meta && meta.establishment_number) || 'SEDE') + '"></div>' +
      '<div class="form-group"><label>Utilizador Basic Auth AGT *</label><input id="agtUsername" autocomplete="off"></div>' +
      '<div class="form-group"><label>Palavra-passe Basic Auth AGT *</label><input id="agtPassword" type="password" autocomplete="new-password"></div>' +
      '<div class="form-group full"><label>Chave privada do software (PEM PKCS#8) *</label><textarea id="agtSoftwarePrivateKey" rows="4" placeholder="-----BEGIN PRIVATE KEY-----"></textarea><input type="file" accept=".pem,.key,.txt" onchange="lerChaveAGT(this,\'agtSoftwarePrivateKey\')"></div>' +
      '<div class="form-group full"><label>Chave privada do contribuinte / certificado AGT (PEM PKCS#8) *</label><textarea id="agtTaxpayerPrivateKey" rows="4" placeholder="-----BEGIN PRIVATE KEY-----"></textarea><input type="file" accept=".pem,.key,.txt" onchange="lerChaveAGT(this,\'agtTaxpayerPrivateKey\')"></div>' +
      '</div>' +
      '<div class="alert alert-warning" style="margin-top:12px"><strong>Importante:</strong> a AGT exige um número de validação do software e assinaturas JWS RS256. Não invente esse número. A utilização em produção só deve ser ativada depois da certificação do Kanawa Soft e da validação das chaves e séries.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="btn btn-success" type="button" onclick="guardarConfiguracaoAGT()"><i class="fas fa-lock"></i> Guardar credenciais com segurança</button>' +
      '<button class="btn btn-primary" type="button" onclick="testarLigacaoAGT()"><i class="fas fa-plug"></i> Testar ligação AGT</button></div>' +
      '<p id="agtConfigStatus" role="status" style="font-size:.82rem;color:var(--text-muted);margin-top:10px">' +
      (meta && meta.last_test_message ? esc(meta.last_test_message) : 'As chaves privadas nunca serão mostradas novamente depois de guardadas.') +
      (meta && meta.last_tested_at ? ' — Último teste: ' + esc(fmtDT(meta.last_tested_at)) : '') + '</p></div>';
  }

  window.renderConfig = async function () {
    const base = typeof originalRenderConfig === 'function' ? await originalRenderConfig() : '';
    if (typeof window.podeAcessar === 'function' && !window.podeAcessar('config')) return base;
    return base + await renderCard();
  };

  window.lerChaveAGT = function (input, targetId) {
    const file = input && input.files && input.files[0];
    if (!file) return;
    if (file.size > 128 * 1024) { toast('A chave excede 128 KB.', 'warning'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = function () {
      const target = document.getElementById(targetId);
      if (target) target.value = String(reader.result || '');
      toast('Chave carregada no formulário. Guarde-a para a enviar ao cofre seguro.', 'info');
    };
    reader.onerror = function () { toast('Não foi possível ler o ficheiro da chave.', 'error'); };
    reader.readAsText(file);
  };

  window.guardarConfiguracaoAGT = async function () {
    const config = {
      environment: value('agtEnvironment'),
      taxRegistrationNumber: value('agtTaxRegistrationNumber'),
      productId: value('agtProductId'),
      productVersion: '1.1.0',
      softwareValidationNumber: value('agtSoftwareValidationNumber'),
      signatureVersion: Number(value('agtSignatureVersion') || 1),
      establishmentNumber: value('agtEstablishmentNumber'),
      username: value('agtUsername'),
      password: value('agtPassword'),
      softwarePrivateKeyPem: value('agtSoftwarePrivateKey'),
      taxpayerPrivateKeyPem: value('agtTaxpayerPrivateKey')
    };
    if (!window.KanawaCloud || !KanawaCloud.ready || typeof KanawaCloud.saveAgtConfig !== 'function') {
      toast('Inicie sessão na empresa para guardar as credenciais AGT.', 'warning');
      return;
    }
    if (!config.taxRegistrationNumber || !config.productId || !config.softwareValidationNumber || !config.username ||
        !config.password || !config.establishmentNumber || !config.softwarePrivateKeyPem.startsWith('-----BEGIN PRIVATE KEY-----') ||
        !config.taxpayerPrivateKeyPem.startsWith('-----BEGIN PRIVATE KEY-----') || !Number.isInteger(config.signatureVersion) || config.signatureVersion < 1) {
      toast('Preencha os campos obrigatórios e use chaves privadas PEM PKCS#8 válidas.', 'warning');
      return;
    }
    const status = document.getElementById('agtConfigStatus');
    if (status) status.textContent = 'A guardar as credenciais cifradas no Supabase Vault…';
    try {
      const result = await KanawaCloud.saveAgtConfig(config);
      ['agtPassword','agtSoftwarePrivateKey','agtTaxpayerPrivateKey'].forEach(function (id) {
        const field = document.getElementById(id);
        if (field) field.value = '';
      });
      if (status) status.textContent = 'Credenciais guardadas no cofre seguro. Execute o teste de ligação.';
      toast(result && result.ok ? 'Credenciais AGT guardadas com segurança.' : 'Configuração guardada.', 'success');
    } catch (error) {
      if (status) status.textContent = error.message || 'Falha ao guardar credenciais.';
      toast(error.message || 'Não foi possível guardar as credenciais AGT.', 'error');
    }
  };

  window.testarLigacaoAGT = async function () {
    if (!window.KanawaCloud || !KanawaCloud.ready || typeof KanawaCloud.testAgtConfig !== 'function') {
      toast('Inicie sessão na empresa para testar a ligação AGT.', 'warning');
      return;
    }
    const status = document.getElementById('agtConfigStatus');
    if (status) status.textContent = 'A testar autenticação, assinaturas e acesso ao serviço de séries AGT…';
    try {
      const result = await KanawaCloud.testAgtConfig();
      if (status) status.textContent = result.message || (result.success ? 'Ligação confirmada.' : 'O teste não foi concluído.');
      toast(result.success ? 'Ligação AGT testada com sucesso.' : (result.message || 'A ligação AGT não foi validada.'), result.success ? 'success' : 'warning');
    } catch (error) {
      if (status) status.textContent = error.message || 'Erro durante o teste AGT.';
      toast(error.message || 'Erro durante o teste AGT.', 'error');
    }
  };
})();