'use strict';
/* KANAWA SOFT ERP v15.4.0 — app.js unificado (perfil, AGT, firma, gaveta, impressora, líquido, produção, logística, ecommerce, RH, projetos, ativos, frota, OS, tickets, contratos, docs, auditoria, e-learning, CRM, marketing, integrações, dispositivos). */

const APP_VERSION = '15.4.0';
const IS_DESKTOP = !!(window.kanawaNative && window.kanawaNative.isDesktop);
let API_ONLINE = false;
let setupStep = 1;
let currentModule = 'dashboard';
let scanner = null, scannerActive = false, scannerCallback = null;
let syncTimer = null;
let pdvState = { screen: 1, carrinho: [], cliente: { nome: 'Cliente Anônimo', nif: '', telefone: '' }, pagamento: 'dinheiro', desconto: 0, valorRecebido: 0, aplicarIVA: true, regime: 'geral', observacoes: '' };
const DEFAULT_PDV_PAYMENT_METHODS = window.KanawaPaymentMethods ? window.KanawaPaymentMethods.defaults : [
  { method_code:'dinheiro', display_name:'Dinheiro', enabled:true, sort_order:10 },
  { method_code:'cartao', display_name:'Cartão bancário', enabled:true, sort_order:20 },
  { method_code:'transferencia', display_name:'Transferência', enabled:true, sort_order:30 },
  { method_code:'multicaixa', display_name:'Multicaixa (TPA)', enabled:true, sort_order:40 },
  { method_code:'misto', display_name:'Pagamento misto', enabled:true, sort_order:50 },
  { method_code:'credito', display_name:'Crédito / a prazo', enabled:true, sort_order:60 },
  { method_code:'referencia', display_name:'Referência de pagamento', enabled:false, sort_order:70 },
  { method_code:'multicaixa_express', display_name:'Multicaixa Express', enabled:false, sort_order:80 }
];
let pdvPaymentMethods = DEFAULT_PDV_PAYMENT_METHODS.filter(method => method.enabled);
let pdvCache = { produtos: [], favoritos: JSON.parse(localStorage.getItem('kanawa_favoritos') || '[]'), ts: 0 };
const AGT_CONFIG = { iva: 0.14, ivaReduzido: 0.07, irt: { faixas: [
  { min: 0, max: 70000, taxa: 0, parcela: 0 }, { min: 70001, max: 100000, taxa: 0.10, parcela: 7000 },
  { min: 100001, max: 150000, taxa: 0.15, parcela: 12000 }, { min: 150001, max: 200000, taxa: 0.20, parcela: 19500 },
  { min: 200001, max: 300000, taxa: 0.25, parcela: 29500 }, { min: 300001, max: 500000, taxa: 0.30, parcela: 44500 },
  { min: 500001, max: Infinity, taxa: 0.35, parcela: 69500 }
]}};

/* ====== UTILITÁRIOS ====== */
const fmt = v => new Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA', maximumFractionDigits: 6 }).format(Number(v) || 0);
const fmtN = v => new Intl.NumberFormat('pt-AO').format(Number(v) || 0);
const fmtD = d => d ? new Date(d).toLocaleDateString('pt-AO') : '-';
const fmtDT = d => d ? new Date(d).toLocaleString('pt-AO') : '-';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
const int = (v, d = 0) => { const n = parseInt(v); return isNaN(n) ? d : n; };
const now = () => new Date().toISOString();
const copy = o => JSON.parse(JSON.stringify(o));
const formatCurrency = fmt, formatDate = fmtD, formatDateTime = fmtDT, formatarData = fmtD, formatarNumero = fmtN, generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const formatarHora = d => d ? new Date(d).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' }) : '-';
const formatarTamanho = b => { if (!b) return '0 B'; const k = 1024, s = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i]; };

function numeroPorExtenso(n) {
  n = Math.round(Number(n) || 0); if (n === 0) return 'zero kwanzas';
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const d = ['', 'dez', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const e = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function g(x) { if (x === 0) return ''; if (x < 10) return u[x]; if (x < 20) return e[x - 10]; if (x < 100) return d[Math.floor(x / 10)] + (x % 10 ? ' e ' + u[x % 10] : ''); return c[Math.floor(x / 100)] + (x % 100 ? ' e ' + g(x % 100) : ''); }
  const p = [], m = Math.floor(n / 1000000), mil = Math.floor((n % 1000000) / 1000), r = n % 1000;
  if (m) p.push(g(m) + (m === 1 ? ' milhão' : ' milhões'));
  if (mil) p.push(g(mil) + (mil === 1 ? ' mil' : ' mil'));
  if (r) p.push(g(r));
  return p.join(' e ') + ' kwanzas';
}

function toast(msg, type = 'info') {
  const c = $('toastContainer'); if (!c) return;
  const t = document.createElement('div'); t.className = 'toast ' + type;
  const ic = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  t.innerHTML = '<span style="font-size:1.2rem">' + (ic[type] || 'ℹ️') + '</span><span>' + esc(msg) + '</span>';
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}
function mostrarToast(a, b) {
  const tipos = ['success', 'error', 'warning', 'info'];
  if (arguments.length === 2) {
    if (tipos.includes(b)) toast(a, b); else if (tipos.includes(a)) toast(b, a); else toast(a, 'info');
  } else toast(a, 'info');
}
function openModal(title, body, large) {
  const o = $('modalOverlay'), c = $('modalContent'); if (!o || !c) return;
  $('modalTitle').textContent = title; $('modalBody').innerHTML = body;
  c.className = large ? 'modal modal-large' : 'modal'; o.classList.add('active');
}
function closeModal() { const o = $('modalOverlay'); if (o) o.classList.remove('active'); }
function updateApiStatus(on) { const b = $('apiStatus'), t = $('apiStatusText'); if (!b || !t) return; b.className = 'api-badge ' + (on ? 'online' : 'offline'); t.textContent = on ? 'Online' : 'Offline'; }
function toggleTheme() {
  const h = document.documentElement, isDark = h.getAttribute('data-theme') === 'dark';
  h.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const ic = $('themeIcon'); if (ic) ic.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
  localStorage.setItem('kanawa_theme', isDark ? 'light' : 'dark');
}
function toggleUserMenu() { openModule('perfil'); }
function calcIRT(s) { const f = AGT_CONFIG.irt.faixas.find(x => s >= x.min && s <= x.max); return f ? { irt: Math.max(0, (s * f.taxa) - f.parcela), faixa: f } : { irt: 0, faixa: null }; }

/* ====== INDEXEDDB ====== */
const DB_STORES = [
  'produtos','clientes','fornecedores','vendas','compras','estoque','contasReceber','contasPagar','funcionarios','categorias','projetos','tarefas','ativos','frotas','ordensServico','notificacoes','documentos','mensagens','cursos','leads','campanhas','eventos','devolucoes','faturas','pagamentos','empresas','usuarios','movimentacoesEstoque','promocoes','ecommerce','auditoria','orcamentos','transportadoras','contratos','aprovacoes','sincronizacao','tickets','dispositivos','_sync_queue',
  'producao','ordensProducao','mrp','boms','custosProducao','controleQualidade','planosProducao','planoContas','budgets','forecasts','conciliacoes','transacoesBancarias','previsoesVendas','tendencias','folhasPagamento','turnos','ferias','vagas','candidatos','desempenhoRH','beneficios','planosCarreira','onboarding','pontoDigital','rescisoes','automacoes','scoreLeads','campanhasMarketing','segmentacoes','cupons','fidelidade','ganttProjetos','timesheets','manutencoes','ordensManutencao','garantias','pecasEstoque','checklistsInspecao','calendarioManutencoes','gpsTracking','abastecimentos','multas','tecnicos','roteirizacao','etiquetas','transferencias','inventarios','lotes','rastreios','recebimentos','ecommerceProdutos','ecommerceCarrinhos','ecommercePedidos','avaliacoes','pagamentosEcommerce','vendasConsignadas','tabelasPrecos','assinaturasDigitais','documentosFiscais','certificacoes','quizzes','mensagensChat','mensagensWhatsApp','eventosCalendar','unidades','servicos','clientesPortal','acessos','politicasSenha','tentativasLogin','sessoes','sms2FA','integracoesAGT','ivas','irts','backups','backupsAgendados','backupsNuvem','audiobooks','ddgHistorico','bingHistorico','dashboardsCustom','modulosPersonalizados','departamentos','frequencias','feriasFuncionarios','pagamentosFuncionarios','motoristas','manutencoesAtivos','depreciacoes','historicoOS','contatosWhatsApp','templatesWhatsApp','carrinhosSalvos','feedbacks','logsSeguranca','seguranca','migracoes','tarefasProjetos','membrosProjetos','atividadesProjetos','gruposUsuarios','config','armazens'
];
let lastGeneratedRecordId = 0;
function nextGeneratedRecordId() {
  const candidate = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  lastGeneratedRecordId = Math.max(candidate, lastGeneratedRecordId + 1);
  return lastGeneratedRecordId;
}
const DB = {
  name: 'kanawa_erp_v15', version: 9, db: null, stores: DB_STORES,
  init() { return new Promise((res, rej) => { const req = indexedDB.open(this.name, this.version); req.onupgradeneeded = e => { const db = e.target.result; DB_STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id', autoIncrement: true }); }); const tx = e.target.transaction; if (db.objectStoreNames.contains('_sync_queue')) { const queue = tx.objectStore('_sync_queue'); if (!queue.indexNames.contains('sync_key')) queue.createIndex('sync_key', 'sync_key', { unique: true }); } }; req.onsuccess = e => { this.db = e.target.result; res(this.db); }; req.onerror = e => rej(e.target.error); }); },
  _tx(s, m) { return this.db.transaction(s, m || 'readonly').objectStore(s); },
  add(s, i) { if (s !== '_sync_queue' && i && (i.id === undefined || i.id === null)) i.id = nextGeneratedRecordId(); return new Promise((res, rej) => { const r = this._tx(s, 'readwrite').add(i); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  put(s, i) { return new Promise((res, rej) => { const r = this._tx(s, 'readwrite').put(i); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  get(s, id) { return new Promise((res, rej) => { const r = this._tx(s).get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  getAll(s) { return new Promise((res, rej) => { const r = this._tx(s).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); },
  del(s, id) { return new Promise((res, rej) => { const r = this._tx(s, 'readwrite').delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  clear(s) { return new Promise((res, rej) => { const r = this._tx(s, 'readwrite').clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }); },
  count(s) { return new Promise((res, rej) => { const r = this._tx(s).count(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
};

/* ====== CLOUD DATABASE / OFFLINE CACHE ====== */
const API = {
  async checkHealth() {
    try { API_ONLINE = !!(window.KanawaCloud && await window.KanawaCloud.check()); }
    catch (e) { API_ONLINE = false; }
    updateApiStatus(API_ONLINE);
    return API_ONLINE;
  }
};

async function getData(store) {
  try {
    if (window.KanawaCloud && KanawaCloud.ready && !KanawaCloud.isLocalOnly(store)) {
      const pending = await DB.getAll('_sync_queue');
      if (!pending.some(x => !x.synced && x.entity === store)) {
        try {
          const remote = await KanawaCloud.getStore(store);
          if (Array.isArray(remote)) {
            await DB.clear(store);
            for (const item of remote) await DB.put(store, item);
          }
        } catch (cloudError) {
          console.warn('Kanawa cloud read:', store, cloudError);
        }
      }
    }
    return await DB.getAll(store);
  } catch (e) {
    console.warn('getData:', store, e);
    return [];
  }
}

async function saveData(store, item, options) {
  const existed = !!item.id;
  const previousRecord = existed && store === 'vendas' ? await DB.get(store, item.id) : null;
  const id = existed ? (await DB.put(store, item), item.id) : await DB.add(store, item);
  const record = Object.assign({}, item, { id: id });
  if (window.KanawaCloud && store === 'empresas' && KanawaCloud.ready) {
    try { await KanawaCloud.updateCompany(record); }
    catch (e) { console.warn('Atualização da empresa pendente:', e); }
  } else if (window.KanawaCloud && !KanawaCloud.isLocalOnly(store)) {
    if (KanawaCloud.ready) {
      try { await KanawaCloud.upsertRecord(store, record, options || {}); }
      catch (e) {
        if (store === 'vendas' && item.status === 'finalizada' && e && e.saleFinalized) {
          // The transactional RPC already committed the invoice. Queue only its history mirror;
          // never delete the local invoice or call the stock/finalization RPC a second time.
          await queueSync(store, existed ? 'update' : 'create', record, Object.assign({}, options || {}, { skipSaleFinalize: true }));
          toast('Venda finalizada no servidor; histórico local em sincronização.', 'warning');
          return id;
        }
        if (options && options.skipQueueOnFailure) {
          console.warn('Kanawa cloud write deferred to native tracker:', store, e);
          return id;
        }
        // A database validation/quota error must not be reported as a completed invoice.
        if (store === 'vendas' && item.status === 'finalizada' && e && e.code) {
          // Restore the last local draft/snapshot when the server rejects the
          // sale. Never leave a rejected sale looking finalized in the POS.
          if (existed && previousRecord) await DB.put(store, previousRecord);
          else await DB.del(store, id);
          throw e;
        }
        await queueSync(store, existed ? 'update' : 'create', record, options || {});
        if (store === 'vendas' && item.status === 'finalizada') {
          toast('Venda guardada neste dispositivo; sincronização pendente: ' + (e.message || 'sem ligação'), 'warning');
        }
        console.warn('Kanawa cloud write queued:', store, e);
      }
    } else {
      await queueSync(store, existed ? 'update' : 'create', record, options || {});
    }
  }
  return id;
}

async function deleteData(store, id) {
  await DB.del(store, id);
  if (window.KanawaCloud && !KanawaCloud.isLocalOnly(store)) {
    if (KanawaCloud.ready) {
      try { await KanawaCloud.deleteRecord(store, id); }
      catch (e) { await queueSync(store, 'delete', { id: id }); }
    } else {
      await queueSync(store, 'delete', { id: id });
    }
  }
}

async function queueSync(entity, action, payload, options) {
  if (window.KanawaCloud && KanawaCloud.isLocalOnly(entity)) return;
  try {
    const recordId = payload && payload.id !== undefined && payload.id !== null
      ? String(payload.id) : 'anonymous-' + Date.now().toString(36);
    const syncKey = String(entity) + ':' + recordId;
    await new Promise((resolve, reject) => {
      const tx = DB.db.transaction(['_sync_queue'], 'readwrite');
      const store = tx.objectStore('_sync_queue');
      const request = store.index('sync_key').get(syncKey);
      request.onsuccess = () => {
        const current = request.result;
        if (current) {
          current.action = action;
          current.payload = payload;
          current.options = options || {};
          current.data = now();
          current.synced = false;
          store.put(current);
        } else {
          store.add({ sync_key: syncKey, entity: entity, action: action, payload: payload, options: options || {}, data: now(), synced: false });
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Fila de sincronização interrompida.'));
    });
  } catch (e) { console.warn('Não foi possível guardar fila de sincronização:', e); }
}

async function processSyncQueue() {
  if (!window.KanawaCloud || !KanawaCloud.ready) return 0;
  const queue = await DB.getAll('_sync_queue');
  let sent = 0;
  for (const item of queue.filter(x => !x.synced)) {
    try {
      if (item.action === 'delete') await KanawaCloud.deleteRecord(item.entity, item.payload.id);
      else await KanawaCloud.upsertRecord(item.entity, item.payload, item.options || {});
      await DB.del('_sync_queue', item.id);
      sent++;
    } catch (e) {
      console.warn('Fila de sincronização aguardando:', item.entity, e);
      throw e;
    }
  }
  return sent;
}

async function pullFromServer() {
  if (!window.KanawaCloud || !KanawaCloud.ready) return 0;
  const records = await KanawaCloud.getAllRecords();
  const queue = await DB.getAll('_sync_queue');
  const dirty = new Set(queue.filter(x => !x.synced).map(x => x.entity));
  const grouped = new Map();
  for (const row of records) {
    if (!grouped.has(row.store_key)) grouped.set(row.store_key, []);
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const id = payload.id !== undefined ? payload.id : (/^\d+$/.test(row.record_id) ? Number(row.record_id) : row.record_id);
    grouped.get(row.store_key).push(Object.assign({}, payload, { id: id }));
  }
  let total = 0;
  for (const store of DB_STORES) {
    if (KanawaCloud.isLocalOnly(store) || dirty.has(store)) continue;
    await DB.clear(store);
    for (const item of (grouped.get(store) || [])) {
      await DB.put(store, item);
      total++;
    }
  }
  return total;
}

async function syncNow(showMessage) {
  const online = await API.checkHealth();
  if (!online) {
    if (showMessage) toast('Sem ligação à base de dados. Os dados ficam guardados neste dispositivo.', 'warning');
    return false;
  }
  const indicator = $('syncIndicator'), label = $('syncText');
  if (indicator) indicator.className = 'sync-indicator show syncing';
  if (label) label.textContent = 'A sincronizar com PostgreSQL...';
  try {
    const sent = await processSyncQueue();
    const received = await pullFromServer();
    if (indicator) indicator.className = 'sync-indicator show online';
    if (label) label.textContent = 'Base de dados sincronizada ✓';
    if (showMessage) toast('Sincronização concluída: ' + sent + ' enviados, ' + received + ' recebidos.', 'success');
    setTimeout(() => { if (indicator) indicator.className = 'sync-indicator'; }, 2200);
    return true;
  } catch (e) {
    if (indicator) indicator.className = 'sync-indicator show offline';
    if (label) label.textContent = 'Sincronização pendente';
    if (showMessage) toast('Falha na sincronização: ' + e.message, 'error');
    return false;
  }
}
function toggleSync() { syncNow(true); }
function startAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  // Background automation only pushes pending changes. A full pull of every
  // company record is reserved for an explicit manual sync to avoid recurring
  // bandwidth, IndexedDB churn and UI contention during busy sales periods.
  syncTimer = setInterval(async () => {
    if (!window.KanawaCloud || !KanawaCloud.ready) return;
    try { await processSyncQueue(); }
    catch (e) { console.warn('Envio automático da fila pendente:', e); }
  }, 60000);
}

async function activateCloudSession(ctx, migrateLocal) {
  const companyId = ctx.company.id;
  const previousCompanyId = localStorage.getItem('kanawa_cloud_company_id');
  const localOnly = new Set(['empresas','usuarios','config','dispositivos','sessoes','tentativasLogin','politicasSenha','sms2FA','acessos','logsSeguranca','seguranca','migracoes','_sync_queue']);

  if (previousCompanyId && previousCompanyId !== companyId) {
    for (const store of DB_STORES) await DB.clear(store);
    localStorage.setItem('kanawa_cloud_company_id', companyId);
    localStorage.removeItem('kanawa_legacy_company');
  } else if (previousCompanyId !== companyId) {
    let remoteRows = null;
    try { remoteRows = await KanawaCloud.getAllRecords(); }
    catch (networkError) { console.warn('Base central indisponível; mantém-se o cache local:', networkError); }

    if (remoteRows !== null) {
      let localCompany = null;
      try {
        localCompany = JSON.parse(
          localStorage.getItem('kanawa_legacy_company') ||
          localStorage.getItem('kanawa_empresa') || 'null'
        );
      } catch (e) { localCompany = null; }

      const localNif = String(localCompany && (localCompany.nif || localCompany.tax_id) || '').replace(/\D/g, '');
      const cloudNif = String(ctx.company.tax_id || '').replace(/\D/g, '');
      const localName = String(localCompany && (localCompany.nome || localCompany.firma || localCompany.legal_name) || '').trim().toLowerCase();
      const cloudName = String(ctx.company.legal_name || ctx.company.trade_name || '').trim().toLowerCase();
      const sameCompany = (!!localNif && !!cloudNif && localNif === cloudNif) ||
        (!localNif && !cloudNif && !!localName && !!cloudName && localName === cloudName);

      if (remoteRows.length > 0 && !sameCompany) {
        for (const store of DB_STORES) if (!localOnly.has(store)) await DB.clear(store);
      } else if (migrateLocal && sameCompany) {
        const remoteKeys = new Set(remoteRows.map(function (row) { return row.store_key + ':' + row.record_id; }));
        for (const store of DB_STORES) {
          if (localOnly.has(store) || store.startsWith('_')) continue;
          const rows = await DB.getAll(store);
          for (const row of rows) {
            if (!row || row.id === undefined || row.id === null) continue;
            const key = store + ':' + String(row.id);
            if (remoteKeys.has(key)) continue;
            try {
              await KanawaCloud.upsertRecord(store, row, { skipSaleFinalize: true });
              remoteKeys.add(key);
            } catch (migrationError) {
              await queueSync(store, 'create', row, { skipSaleFinalize: true });
              console.warn('Migração cloud pendente:', store, migrationError);
            }
          }
        }
      } else if (remoteRows.length > 0) {
        for (const store of DB_STORES) if (!localOnly.has(store)) await DB.clear(store);
      }
      localStorage.setItem('kanawa_cloud_company_id', companyId);
      localStorage.removeItem('kanawa_legacy_company');
    }
  }

  const company = {
    id: 1,
    firma: ctx.company.trade_name || ctx.company.legal_name,
    nome: ctx.company.legal_name,
    nif: ctx.company.tax_id || '',
    telefone: ctx.company.phone || '',
    email: ctx.company.email || ctx.user.email || '',
    regime: ctx.company.tax_regime || 'not_configured',
    dataCriacao: ctx.company.created_at || now()
  };
  const user = {
    id: 1,
    nome: (ctx.profile && ctx.profile.full_name) || ctx.user.email,
    email: ctx.user.email,
    perfil: ctx.role,
    role: ctx.role,
    permissions: (ctx.membership && ctx.membership.permissions) || {},
    cloudUser: true,
    avatar: null
  };
  await DB.put('empresas', company);
  // Remove legacy local user/password records; authentication is handled only by Supabase Auth.
  await DB.clear('usuarios');
  await DB.put('usuarios', user);
  localStorage.setItem('kanawa_empresa', JSON.stringify(company));
  localStorage.setItem('kanawa_user', JSON.stringify(user));
  localStorage.setItem('kanawa_setup_done', 'true');

  // Do not hold the login screen while downloading every record, registering
  // the device and checking subscription metadata. These tasks run after the
  // authenticated shell is displayed; sales still require server confirmation.
  window.setTimeout(async function runDeferredStartup() {
    // Do not download the entire company database on every login.
    // Individual modules load their own required stores; full reconciliation
    // remains available through the user's explicit synchronization action.
    try { await KanawaCloud.registerInstallation(APP_VERSION); }
    catch (e) { console.warn('Registo de instalação pendente:', e); }

    try {
      const [license, entitlements] = await Promise.all([
        KanawaCloud.getLicense(),
        KanawaCloud.getEntitlements()
      ]);
      if (license) localStorage.setItem('kanawa_license', JSON.stringify(license));
      if (entitlements) localStorage.setItem('kanawa_entitlements', JSON.stringify(entitlements));
      if (entitlements && entitlements.read_only) toast('A licença ou os limites do plano estão em modo de consulta. Verifique a subscrição.', 'warning');
      if (license && license.expires_at) {
        const expiry = new Date(license.expires_at);
        const days = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
        if (license.status === 'expired' || days < 0) toast('A licença Kanawa Soft expirou. Contacte a D.PEDRO SOLUÇÕES.', 'warning');
        else if (days <= 5) toast('A licença expira em ' + Math.max(0, days) + ' dia(s).', 'warning');
      }
    } catch (e) { console.warn('Não foi possível consultar a licença:', e); }
    try { await API.checkHealth(); }
    catch (e) { console.warn('Verificação de conectividade adiada:', e); }
  }, 0);
  return { company: company, user: user };
}

function mostrarAplicacaoAutenticada(ctx) {
  const user = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
  const company = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  if ($('setupWizard')) $('setupWizard').classList.remove('active');
  if ($('authScreen')) $('authScreen').classList.remove('active');
  if ($('app')) $('app').classList.add('active');
  if ($('topbarEmpresa')) $('topbarEmpresa').textContent = company.firma || company.nome || 'Kanawa Soft';
  if ($('userName')) $('userName').textContent = user.nome || 'Utilizador';
  if ($('userRole')) $('userRole').textContent = user.role || user.perfil || 'operador';
  if ($('userAvatar')) {
    $('userAvatar').src = user.avatar || 'logo.png';
    $('userAvatar').onerror = function () { this.src = 'logo.png'; };
  }
  renderSidebar();
  const firstAllowedModule = MENU.find(module => podeAcessar(module.id));
  if (firstAllowedModule) openModule(firstAllowedModule.id);
  else toast('A sua conta ainda não tem módulos autorizados. Peça ao administrador para configurar as permissões.', 'warning');
  updateNotifBadge();
}

async function abrirCadastroEmpresa() {
  if ($('authScreen')) $('authScreen').classList.remove('active');
  if ($('setupWizard')) $('setupWizard').classList.add('active');
}

/* ====== PERMISSÕES ====== */
const PERMISSOES = {
  admin: { modulos: '*', acoes: ['criar','editar','excluir','ver','configurar','aprovar','cancelar','exportar','importar'], verFinanceiro: true, excluir: true, configurar: true, descontoMax: 100 },
  gerente: { modulos: ['dashboard','pdv','vendas','produtos','categorias','ecommerce','estoque','compras','clientes','fornecedores','crm','financeiro','fiscal','rh','projetos','tarefas','ativos','frota','os','documentos','relatorios','notificacoes','orcamentos','transportadoras','contratos','tickets','perfil','dispositivos','producao','ordens-producao','mrp','bom','custos-producao','controle-qualidade','planos-producao','logistica-roteirizacao','logistica-etiquetas','logistica-picking','logistica-armazens','logistica-crossdocking','logistica-rastreio','ecommerce-vitrine','ecommerce-carrinho','ecommerce-pedidos','ecommerce-produtos','ecommerce-pagamento','ecommerce-rastreio','rh-recrutamento','rh-desempenho','rh-beneficios','rh-onboarding','rh-ponto','rh-rescisao','rh-plano-carreira','projetos-tarefas','projetos-kanban','projetos-gantt','projetos-recursos','projetos-timesheet','projetos-custos','projetos-riscos','ativos-depreciacao','ativos-manutencao','ativos-garantia','frota-manutencao','frota-rotas','frota-gps','frota-combustivel','frota-documentos','frota-multas','frota-desempenho','os-manutencao','os-checklist','os-calendario','os-tecnicos','produtos-avaliacoes','tabelas-precos','vendas-consignadas','vendas-promocoes','clientes-fidelidade','clientes-cupons','portal-cliente','clientes-segmentacao','crm-pipeline','crm-automacao','crm-score','crm-remarketing','marketing-campanhas','marketing-analise','elearning-cursos','elearning-certificacoes','elearning-quizzes','elearning-progresso','elearning-relatorios','servicos'], acoes: ['criar','editar','ver','aprovar','cancelar','exportar'], verFinanceiro: true, excluir: false, configurar: false, descontoMax: 30 },
  operador: { modulos: ['dashboard','pdv','vendas','produtos','clientes','estoque','notificacoes','perfil','producao','ordens-producao','controle-qualidade','os','os-manutencao','os-checklist','os-calendario','projetos-tarefas','projetos-kanban','tarefas'], acoes: ['criar','ver'], verFinanceiro: false, excluir: false, configurar: false, descontoMax: 10 },
  caixa: { modulos: ['pdv','vendas','clientes','notificacoes','perfil','ecommerce-vitrine','ecommerce-carrinho','ecommerce-pedidos'], acoes: ['criar','ver'], verFinanceiro: false, excluir: false, configurar: false, descontoMax: 5 },
  contabilista: { modulos: ['dashboard','vendas','compras','clientes','fornecedores','financeiro','fiscal','relatorios','perfil','notificacoes'], acoes: ['ver'], verFinanceiro: true, excluir: false, configurar: false, descontoMax: 0 },
  visualizador: { modulos: ['dashboard','vendas','produtos','clientes','estoque','relatorios','perfil','notificacoes'], acoes: ['ver'], verFinanceiro: false, excluir: false, configurar: false, descontoMax: 0 }
};
function getPerms() {
  const u = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
  const role = u.role || u.perfil || 'visualizador';
  if (u.cloudUser && window.KanawaPermissions) {
    const cloudGrants = u.permissions || {};
    const roleAliases = { manager: 'gerente', staff: 'operador', cashier: 'caixa', accountant: 'contabilista', viewer: 'visualizador' };
    // Cloud memberships are controlled by the administrator. Empty grants fail closed.
    return window.KanawaPermissions.fromMembership(roleAliases[role] || role, cloudGrants);
  }
  return PERMISSOES[role] || PERMISSOES.visualizador;
}
function podeAcessar(m) {
  const p = getPerms();
  if (window.KanawaPermissions) return window.KanawaPermissions.canAccess(p, m);
  return p.modulos === '*' || (Array.isArray(p.modulos) && p.modulos.indexOf(m) !== -1);
}
function podeFazer(a, modulo) {
  const p = getPerms();
  if (window.KanawaPermissions) return window.KanawaPermissions.canDo(p, a, modulo || currentModule);
  return p.modulos === '*' || (Array.isArray(p.modulos) && p.modulos.includes(modulo || currentModule)) ? p.acoes.indexOf(a) !== -1 : false;
}

/* ====== MENU ====== */
const MENU = [
  { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
  { id: 'pdv', icon: 'fa-cash-register', label: 'PDV' },
  { id: 'vendas', icon: 'fa-receipt', label: 'Vendas' },
  { id: 'orcamentos', icon: 'fa-file-invoice', label: 'Orçamentos' },
  { id: 'tecnica', icon: 'fa-tools', label: 'Plano Técnica' },
  { id: 'integracoes', icon: 'fa-plug', label: 'Integrações e APIs' },
  { id: 'produtos', icon: 'fa-boxes', label: 'Produtos' },
  { id: 'produtos-avaliacoes', icon: 'fa-star', label: 'Avaliações' },
  { id: 'categorias', icon: 'fa-tags', label: 'Categorias' },
  { id: 'servicos', icon: 'fa-concierge-bell', label: 'Serviços' },
  { id: 'tabelas-precos', icon: 'fa-table', label: 'Tabelas de Preços' },
  { id: 'ecommerce-vitrine', icon: 'fa-store', label: 'E-commerce' },
  { id: 'ecommerce-carrinho', icon: 'fa-shopping-bag', label: 'Carrinho' },
  { id: 'ecommerce-pedidos', icon: 'fa-truck', label: 'Pedidos' },
  { id: 'ecommerce-pagamento', icon: 'fa-credit-card', label: 'Formas de Pagamento' },
  { id: 'ecommerce-rastreio', icon: 'fa-map-marker-alt', label: 'Rastreio' },
  { id: 'estoque', icon: 'fa-warehouse', label: 'Estoque' },
  { id: 'producao', icon: 'fa-industry', label: 'Produção' },
  { id: 'ordens-producao', icon: 'fa-clipboard-list', label: 'Ordens Produção' },
  { id: 'mrp', icon: 'fa-cogs', label: 'MRP' },
  { id: 'bom', icon: 'fa-sitemap', label: 'BOM' },
  { id: 'custos-producao', icon: 'fa-calculator', label: 'Custos Produção' },
  { id: 'controle-qualidade', icon: 'fa-check-double', label: 'Qualidade' },
  { id: 'planos-producao', icon: 'fa-calendar-alt', label: 'Planos Produção' },
  { id: 'compras', icon: 'fa-shopping-bag', label: 'Compras' },
  { id: 'clientes', icon: 'fa-users', label: 'Clientes' },
  { id: 'clientes-fidelidade', icon: 'fa-star', label: 'Fidelidade' },
  { id: 'clientes-cupons', icon: 'fa-ticket-alt', label: 'Cupons' },
  { id: 'clientes-segmentacao', icon: 'fa-users-cog', label: 'Segmentação' },
  { id: 'portal-cliente', icon: 'fa-user-circle', label: 'Portal Cliente' },
  { id: 'fornecedores', icon: 'fa-truck', label: 'Fornecedores' },
  { id: 'transportadoras', icon: 'fa-shipping-fast', label: 'Transportadoras' },
  { id: 'crm', icon: 'fa-handshake', label: 'CRM' },
  { id: 'crm-pipeline', icon: 'fa-columns', label: 'Pipeline' },
  { id: 'crm-automacao', icon: 'fa-robot', label: 'Automação' },
  { id: 'crm-score', icon: 'fa-chart-line', label: 'Score Leads' },
  { id: 'crm-remarketing', icon: 'fa-retweet', label: 'Remarketing' },
  { id: 'marketing-campanhas', icon: 'fa-bullhorn', label: 'Marketing' },
  { id: 'marketing-analise', icon: 'fa-chart-pie', label: 'Análise Marketing' },
  { id: 'financeiro', icon: 'fa-coins', label: 'Financeiro' },
  { id: 'fiscal', icon: 'fa-landmark', label: 'Fiscal AGT' },
  { id: 'rh', icon: 'fa-user-tie', label: 'Recursos Humanos' },
  { id: 'projetos', icon: 'fa-project-diagram', label: 'Projetos' },
  { id: 'projetos-tarefas', icon: 'fa-tasks', label: 'Tarefas' },
  { id: 'projetos-kanban', icon: 'fa-columns', label: 'Kanban' },
  { id: 'projetos-gantt', icon: 'fa-chart-bar', label: 'Gantt' },
  { id: 'projetos-recursos', icon: 'fa-users-cog', label: 'Recursos' },
  { id: 'projetos-timesheet', icon: 'fa-clock', label: 'Timesheet' },
  { id: 'projetos-custos', icon: 'fa-calculator', label: 'Custos Projeto' },
  { id: 'projetos-riscos', icon: 'fa-exclamation-triangle', label: 'Riscos' },
  { id: 'ativos', icon: 'fa-building', label: 'Ativos' },
  { id: 'ativos-depreciacao', icon: 'fa-chart-line', label: 'Depreciação' },
  { id: 'ativos-manutencao', icon: 'fa-tools', label: 'Manutenção' },
  { id: 'ativos-garantia', icon: 'fa-shield-alt', label: 'Garantias' },
  { id: 'frota', icon: 'fa-truck-moving', label: 'Frota' },
  { id: 'frota-manutencao', icon: 'fa-tools', label: 'Manutenção' },
  { id: 'frota-rotas', icon: 'fa-route', label: 'Rotas' },
  { id: 'frota-gps', icon: 'fa-satellite', label: 'GPS' },
  { id: 'frota-combustivel', icon: 'fa-gas-pump', label: 'Combustível' },
  { id: 'frota-documentos', icon: 'fa-file-alt', label: 'Documentos' },
  { id: 'frota-multas', icon: 'fa-exclamation-circle', label: 'Multas' },
  { id: 'frota-desempenho', icon: 'fa-chart-bar', label: 'Desempenho' },
  { id: 'os', icon: 'fa-clipboard-list', label: 'Ordens Serviço' },
  { id: 'os-manutencao', icon: 'fa-tools', label: 'OS Manutenção' },
  { id: 'os-checklist', icon: 'fa-clipboard-check', label: 'Checklist' },
  { id: 'os-calendario', icon: 'fa-calendar-alt', label: 'Calendário' },
  { id: 'os-tecnicos', icon: 'fa-user-cog', label: 'Técnicos' },
  { id: 'logistica-roteirizacao', icon: 'fa-route', label: 'Logística' },
  { id: 'logistica-etiquetas', icon: 'fa-tag', label: 'Etiquetas' },
  { id: 'logistica-picking', icon: 'fa-boxes', label: 'Picking' },
  { id: 'logistica-armazens', icon: 'fa-warehouse', label: 'Armazéns' },
  { id: 'logistica-crossdocking', icon: 'fa-exchange-alt', label: 'Cross-docking' },
  { id: 'logistica-rastreio', icon: 'fa-map-marked-alt', label: 'Rastreio' },
  { id: 'contratos', icon: 'fa-file-contract', label: 'Contratos' },
  { id: 'documentos', icon: 'fa-folder-open', label: 'Documentos' },
  { id: 'tickets', icon: 'fa-ticket-alt', label: 'Tickets' },
  { id: 'elearning-cursos', icon: 'fa-graduation-cap', label: 'Cursos' },
  { id: 'elearning-certificacoes', icon: 'fa-certificate', label: 'Certificações' },
  { id: 'elearning-quizzes', icon: 'fa-question-circle', label: 'Quizzes' },
  { id: 'elearning-progresso', icon: 'fa-chart-line', label: 'Progresso' },
  { id: 'elearning-relatorios', icon: 'fa-file-alt', label: 'Relatórios EAD' },
  { id: 'relatorios', icon: 'fa-chart-bar', label: 'Relatórios' },
  { id: 'notificacoes', icon: 'fa-bell', label: 'Notificações' },
  { id: 'usuarios', icon: 'fa-user-shield', label: 'Usuários' },
  { id: 'auditoria', icon: 'fa-history', label: 'Auditoria' },
  { id: 'perfil', icon: 'fa-user-circle', label: 'Meu Perfil' },
  { id: 'dispositivos', icon: 'fa-print', label: 'Dispositivos' },
  { id: 'config', icon: 'fa-cog', label: 'Configurações' },
  { id: 'modulos', icon: 'fa-code', label: 'Módulos' }
];

function moduleGroupLabel(module) {
  const id = module.id;
  if (['dashboard'].includes(id)) return 'Início';
  if (['pdv','vendas','orcamentos','vendas-consignadas','vendas-promocoes'].includes(id)) return 'Vendas';
  if (['produtos','produtos-avaliacoes','categorias','servicos','tabelas-precos'].includes(id)) return 'Catálogo e Serviços';
  if (id.startsWith('ecommerce')) return 'E-commerce';
  if (['estoque','compras','fornecedores'].includes(id)) return 'Stock e Compras';
  if (['producao','ordens-producao','mrp','bom','custos-producao','controle-qualidade','planos-producao'].includes(id)) return 'Produção';
  if (['clientes','portal-cliente','clientes-fidelidade','clientes-cupons','clientes-segmentacao','transportadoras'].includes(id)) return 'Clientes e Comercial';
  if (id.startsWith('crm')) return 'CRM';
  if (id.startsWith('marketing')) return 'Marketing';
  if (['financeiro','fiscal'].includes(id)) return 'Financeiro e Fiscal';
  if (id.startsWith('rh')) return 'Recursos Humanos';
  if (id.startsWith('projetos')) return 'Projetos';
  if (id.startsWith('ativos')) return 'Gestão de Activos';
  if (id.startsWith('frota')) return 'Frota';
  if (id === 'os' || id.startsWith('os-')) return 'Assistência e Manutenção';
  if (id.startsWith('logistica')) return 'Logística';
  if (id === 'tecnica') return 'Plano Técnica';
  if (id === 'integracoes') return 'Integrações e APIs';
  if (['contratos','documentos','tickets'].includes(id)) return 'Documentos e Suporte';
  if (id.startsWith('elearning')) return 'Formação';
  if (id === 'relatorios') return 'Relatórios e Análise';
  return 'Administração';
}
function moduleGroupIcon(label) {
  const icons = {
    'Início': 'fa-home', 'Vendas': 'fa-cash-register',
    'Catálogo e Serviços': 'fa-box-open', 'E-commerce': 'fa-store',
    'Stock e Compras': 'fa-warehouse', 'Produção': 'fa-industry',
    'Clientes e Comercial': 'fa-user-friends', 'CRM': 'fa-handshake',
    'Marketing': 'fa-bullhorn', 'Financeiro e Fiscal': 'fa-coins',
    'Recursos Humanos': 'fa-users', 'Projetos': 'fa-project-diagram',
    'Gestão de Activos': 'fa-building', 'Frota': 'fa-truck',
    'Assistência e Manutenção': 'fa-tools', 'Logística': 'fa-route',
    'Plano Técnica': 'fa-hard-hat', 'Integrações e APIs': 'fa-plug',
    'Documentos e Suporte': 'fa-folder-open', 'Formação': 'fa-graduation-cap',
    'Relatórios e Análise': 'fa-chart-line', 'Administração': 'fa-sliders-h'
  };
  return icons[label] || 'fa-layer-group';
}
function renderSidebar() {
  const sb = $('sidebar'); if (!sb) return;
  const perm = MENU.filter(m => podeAcessar(m.id));
  const groups = new Map();
  perm.forEach(module => {
    const label = moduleGroupLabel(module);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(module);
  });
  sb.innerHTML = Array.from(groups.entries()).map(([label, modules]) => {
    const expanded = modules.some(module => module.id === currentModule);
    const buttons = modules.map(module => '<button type="button" class="sidebar-item" data-id="' + module.id + '" title="' + module.label + '" aria-label="' + module.label + '" aria-current="' + (module.id === currentModule ? 'page' : 'false') + '" onclick="openModule(\'' + module.id + '\')"><i class="fas ' + module.icon + '" aria-hidden="true"></i><span>' + module.label + '</span></button>').join('');
    return '<details class="sidebar-group" ' + (expanded ? 'open' : '') + '><summary aria-label="' + label + '"><i class="fas ' + moduleGroupIcon(label) + '" aria-hidden="true"></i><span>' + label + '</span><i class="fas fa-chevron-down sidebar-group-chevron" aria-hidden="true"></i></summary>' + buttons + '</details>';
  }).join('');
}

function toggleMobileMenu(force) {
  const sidebar = $('sidebar');
  const backdrop = $('mobileMenuBackdrop');
  const toggle = $('mobileMenuToggle');
  const topbar = document.querySelector('.topbar');
  if (!sidebar || !backdrop || !toggle) return false;
  const isMobile = window.matchMedia ? window.matchMedia('(max-width: 600px)').matches : window.innerWidth <= 600;
  if (!isMobile) {
    sidebar.classList.remove('mobile-menu-open'); backdrop.classList.remove('active');
    document.body.classList.remove('mobile-menu-visible'); sidebar.removeAttribute('aria-hidden');
    if ('inert' in sidebar) sidebar.inert = false;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
    toggle.setAttribute('title', 'Abrir menu');
    toggle.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';
    return false;
  }
  if (topbar) document.documentElement.style.setProperty('--mobile-header-height', topbar.offsetHeight + 'px');
  const shouldOpen = typeof force === 'boolean' ? force : !sidebar.classList.contains('mobile-menu-open');
  sidebar.classList.toggle('mobile-menu-open', shouldOpen);
  backdrop.classList.toggle('active', shouldOpen);
  sidebar.setAttribute('aria-hidden', String(!shouldOpen));
  if ('inert' in sidebar) sidebar.inert = !shouldOpen;
  toggle.setAttribute('aria-expanded', String(shouldOpen));
  toggle.setAttribute('aria-label', shouldOpen ? 'Fechar menu' : 'Abrir menu');
  toggle.setAttribute('title', shouldOpen ? 'Fechar menu' : 'Abrir menu');
  toggle.innerHTML = '<i class="fas ' + (shouldOpen ? 'fa-times' : 'fa-bars') + '" aria-hidden="true"></i>';
  document.body.classList.toggle('mobile-menu-visible', shouldOpen);
  if (shouldOpen) {
    const active = sidebar.querySelector('.sidebar-item.active');
    const target = active || sidebar.querySelector('.sidebar-group[open] .sidebar-item, .sidebar-item');
    if (target) window.setTimeout(() => { if (sidebar.classList.contains('mobile-menu-open')) target.focus({ preventScroll: true }); }, 40);
  } else toggle.focus({ preventScroll: true });
  return shouldOpen;
}

async function openModule(id) {
  if (!podeAcessar(id)) { toast('🔒 Sem permissão', 'error'); return; }
  toggleMobileMenu(false);
  currentModule = id;
  if (id !== 'frota-gps') pararSincronizacaoGPSRemota();
  document.querySelectorAll('.sidebar-group').forEach(group => { group.open = !!group.querySelector('[data-id="' + id + '"]'); });
  $$('.sidebar-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  const c = $('content');
  c.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin" style="font-size:3rem;color:var(--primary)"></i></div>';
  const R = {
    dashboard: renderDashboard, pdv: renderPDV, vendas: renderVendas, orcamentos: renderOrcamentos,
    tecnica: () => { if (!window.KanawaTechnical) throw new Error('Módulo Plano Técnica não carregou.'); return window.KanawaTechnical.render(); },
    integracoes: () => { if (!window.KanawaIntegrations) throw new Error('Centro de Integrações não carregou.'); return window.KanawaIntegrations.render(); },
    produtos: renderProdutos, categorias: renderCategorias, ecommerce: renderEcommerce,
    estoque: renderEstoque, compras: renderCompras, clientes: renderClientes,
    fornecedores: renderFornecedores, transportadoras: renderTransportadoras, crm: renderCRM,
    financeiro: renderFinanceiro, fiscal: renderFiscal, rh: renderRH,
    projetos: renderProjetos, tarefas: renderTarefas, ativos: renderAtivos,
    frota: renderFrota, os: renderOS, contratos: renderContratos,
    documentos: renderDocumentos, tickets: renderTickets, relatorios: renderRelatorios,
    notificacoes: renderNotificacoes, usuarios: renderUsuarios, auditoria: renderAuditoria,
    perfil: renderPerfil, dispositivos: renderDispositivos, config: renderConfig, modulos: renderModulos,
    producao: renderProducao, 'ordens-producao': renderOrdensProducao, mrp: renderMRP, bom: renderBOM,
    'custos-producao': renderCustosProducao, 'controle-qualidade': renderControleQualidade, 'planos-producao': renderPlanosProducao,
    'logistica-roteirizacao': renderLogisticaRoteirizacao, 'logistica-etiquetas': renderLogisticaEtiquetas,
    'logistica-picking': renderLogisticaPicking, 'logistica-armazens': renderLogisticaArmazens,
    'logistica-crossdocking': renderLogisticaCrossdocking, 'logistica-rastreio': renderLogisticaRastreio,
    'ecommerce-vitrine': renderEcommerceVitrine, 'ecommerce-carrinho': renderEcommerceCarrinho,
    'ecommerce-pedidos': renderEcommercePedidos, 'ecommerce-produtos': renderEcommerceProdutos,
    'ecommerce-pagamento': renderEcommercePagamento, 'ecommerce-rastreio': renderEcommerceRastreio,
    'rh-recrutamento': () => { rhActiveTab = 'recrutamento'; return renderRH(); },
    'rh-desempenho': () => { rhActiveTab = 'desempenho'; return renderRH(); },
    'rh-beneficios': () => { rhActiveTab = 'beneficios'; return renderRH(); },
    'rh-onboarding': () => { rhActiveTab = 'onboarding'; return renderRH(); },
    'rh-ponto': () => { rhActiveTab = 'ponto'; return renderRH(); },
    'rh-rescisao': () => { rhActiveTab = 'rescisao'; return renderRH(); },
    'rh-plano-carreira': () => { rhActiveTab = 'carreira'; return renderRH(); },
    'projetos-tarefas': renderProjetosTarefas, 'projetos-kanban': renderKanban, 'projetos-gantt': renderProjetosGantt,
    'projetos-recursos': renderProjetosRecursos, 'projetos-timesheet': renderProjetosTimesheet,
    'projetos-custos': renderProjetosCustos, 'projetos-riscos': renderProjetosRiscos,
    'ativos-depreciacao': renderAtivosDepreciacao, 'ativos-manutencao': renderAtivosManutencao, 'ativos-garantia': renderAtivosGarantia,
    'frota-manutencao': renderFrotaManutencao, 'frota-rotas': renderFrotaRotas, 'frota-gps': renderFrotaGPS,
    'frota-combustivel': renderFrotaCombustivel, 'frota-documentos': renderFrotaDocumentos,
    'frota-multas': renderFrotaMultas, 'frota-desempenho': renderFrotaDesempenho,
    'os-manutencao': renderOSManutencao, 'os-checklist': renderOSChecklist, 'os-calendario': renderOSCalendario, 'os-tecnicos': renderOSTecnicos,
    'produtos-avaliacoes': renderProdutosAvaliacoes, 'tabelas-precos': renderTabelasPrecos,
    'vendas-consignadas': renderVendasConsignadas, 'vendas-promocoes': renderVendasPromocoes,
    'clientes-fidelidade': renderClientesFidelidade, 'clientes-cupons': renderClientesCupons,
    'portal-cliente': renderPortalCliente, 'clientes-segmentacao': renderClientesSegmentacao,
    'crm-pipeline': renderCRMPipeline, 'crm-automacao': renderCRMAutomacao, 'crm-score': renderCRMScore, 'crm-remarketing': renderCRMRemarketing,
    'marketing-campanhas': renderMarketingCampanhas, 'marketing-analise': renderMarketingAnalise,
    'elearning-cursos': renderElearningCursos, 'elearning-certificacoes': renderElearningCertificacoes,
    'elearning-quizzes': renderElearningQuizzes, 'elearning-progresso': renderElearningProgresso, 'elearning-relatorios': renderElearningRelatorios,
    servicos: renderServicos
  };
  try {
    c.innerHTML = R[id] ? await R[id]() : '<div class="card"><h3>Módulo ' + id + '</h3></div>';
    if (id === 'frota-gps' && window.KanawaMaps) {
      const gpsRecords = await getData('gpsTracking');
      window.KanawaMaps.mountMap('kanawaFleetMap', gpsRecords);
      iniciarSincronizacaoGPSRemota();
      if (kanawaGpsWatchActive) { const status = $('kanawaGpsStatus'); if (status) status.textContent = 'GPS ativo neste dispositivo.'; }
    }
    if (id === 'config') aplicarPreferenciasConfigNaTela();
    c.insertAdjacentHTML('afterbegin', barraRelatorioModulo(id));
    c.scrollTop = 0;
  } catch (e) { console.error(e); c.innerHTML = '<div class="card"><h3>Erro</h3><p>' + esc(e.message) + '</p></div>'; }
}

/* ====== RELATÓRIOS POR MÓDULO ====== */
function barraRelatorioModulo(id) {
  const modulo = (MENU || []).find(item => item.id === id);
  const titulo = modulo ? modulo.label : id;
  return '<div class="module-report-toolbar no-print" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:12px 16px;background:var(--surface,#fff);border:1px solid var(--border,#e2e8f0);border-radius:12px">' +
    '<div><strong><i class="fas fa-file-alt"></i> Relatório do módulo: ' + esc(titulo) + '</strong><div style="font-size:.82rem;color:var(--text-muted,#64748b)">Emita um relatório dos dados e tabelas atualmente apresentados neste módulo.</div></div>' +
    '<button class="btn btn-primary" type="button" onclick="imprimirRelatorioModulo()"><i class="fas fa-print"></i> Imprimir / Guardar PDF</button></div>';
}
function imprimirRelatorioModulo() {
  const content = $('content');
  if (!content) { toast('Não foi possível localizar o conteúdo do módulo.', 'warning'); return; }
  const modulo = (MENU || []).find(item => item.id === currentModule);
  const titulo = modulo ? modulo.label : (currentModule || 'Módulo');
  const empresa = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const popup = window.open('', '_blank');
  if (!popup) { toast('Permita janelas pop-up para emitir o relatório.', 'warning'); return; }
  const copia = content.cloneNode(true);
  copia.querySelectorAll('.module-report-toolbar,.no-print,button,input,select,textarea,script').forEach(el => el.remove());
  copia.querySelectorAll('[onclick]').forEach(el => el.removeAttribute('onclick'));
  const conteudo = copia.innerHTML;
  const emitido = new Date().toLocaleString('pt-AO');
  popup.document.write('<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório - ' + esc(titulo) + '</title><style>' +
    'body{font:12px Arial,sans-serif;color:#172033;margin:24px}h1,h2,h3{color:#172033}header{margin-bottom:16px}.report-head{border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:18px}.report-head h1{margin:0 0 5px;font-size:20px}.report-head p{margin:3px 0;color:#475569}.card{background:#fff!important;color:#172033!important;border:1px solid #cbd5e1!important;border-radius:6px;padding:12px;margin:10px 0;break-inside:avoid}.metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.metric-card{border:1px solid #cbd5e1;padding:10px;border-radius:5px;break-inside:avoid}.label{font-size:10px;color:#475569}.value{font-size:16px;font-weight:bold}.table-wrap{width:100%;overflow:visible}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e2e8f0!important;color:#172033!important}.badge{border:1px solid #cbd5e1;padding:2px 5px;border-radius:4px;color:#172033!important;background:#f8fafc!important}.empty{padding:16px;color:#475569}.report-foot{margin-top:22px;border-top:1px solid #cbd5e1;padding-top:8px;color:#64748b;font-size:10px}@page{size:auto;margin:12mm}@media print{body{margin:0}.card,.metric-card{break-inside:avoid}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body>' +
    '<div class="report-head"><h1>' + esc(empresa.firma || empresa.nome || 'KanawaSoft') + '</h1><h2>Relatório do módulo: ' + esc(titulo) + '</h2><p>Emitido em: ' + esc(emitido) + '</p></div>' +
    conteudo + '<div class="report-foot">Documento emitido pelo KanawaSoft ERP • ' + esc(titulo) + '</div><script>window.onload=function(){window.print()}<\\/script></body></html>');
  popup.document.close();
}

/* ====== UI HELPERS ====== */
function header(title, subtitle, color, buttons, icon) {
  return '<div class="card" style="background:linear-gradient(135deg,' + (color || 'var(--primary)') + ',var(--primary-dark));color:#fff;border:none">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
    '<div><h2 style="font-size:1.3rem;font-weight:800"><i class="fas ' + (icon || 'fa-th') + '"></i> ' + esc(title) + '</h2>' +
    (subtitle ? '<p style="opacity:.85;font-size:.9rem;margin-top:4px">' + subtitle + '</p>' : '') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (buttons || '') + '</div></div></div>';
}
function emptyState(icon, msg) { return '<div class="empty"><i class="fas ' + icon + '"></i>' + msg + '</div>'; }
function badge(text, type) { return '<span class="badge badge-' + (type || 'info') + '">' + esc(text) + '</span>'; }
function table(headers, rows) {
  if (!rows.length) return emptyState('fa-inbox', 'Sem registros');
  return '<div class="table-wrap"><table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
}
const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e2e8f0"/><text x="100" y="130" font-size="80" text-anchor="middle">📦</text></svg>');
function imgSrc(p) { return p && p.imagem ? p.imagem : PLACEHOLDER; }
function aplicarLogo() {
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const src = (emp.logo && emp.logo.indexOf('data:') === 0) ? emp.logo : 'logo.png';
  ['loadingLogo', 'setupLogo', 'authLogo', 'topbarLogo'].forEach(id => { const el = $(id); if (el) el.innerHTML = '<img src="' + src + '" alt="Logo" onerror="this.parentElement.textContent=\'K\'">'; });
}

/* ====== DASHBOARD ====== */
async function renderDashboard() {
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const hoje = new Date().toLocaleDateString('pt-AO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const html = header('Bem-vindo, ' + (emp.nome || 'Admin'), hoje + ' • NIF: ' + (emp.nif || '-'), 'var(--primary)', '', 'fa-chart-pie') +
    '<div class="metric-grid">' +
    '<div class="metric-card" onclick="openModule(\'vendas\')"><div class="label">💰 Vendas</div><div class="value" id="dashVendas">...</div><div class="sub" id="dashVendasSub">...</div><i class="fas fa-money-bill-wave icon"></i></div>' +
    '<div class="metric-card" onclick="openModule(\'produtos\')" style="border-left-color:var(--info)"><div class="label">📦 Produtos</div><div class="value" id="dashProdutos">...</div><div class="sub" id="dashProdutosSub">...</div><i class="fas fa-boxes icon"></i></div>' +
    '<div class="metric-card" onclick="openModule(\'clientes\')" style="border-left-color:var(--warning)"><div class="label">👥 Clientes</div><div class="value" id="dashClientes">...</div><div class="sub" id="dashClientesSub">...</div><i class="fas fa-users icon"></i></div>' +
    '<div class="metric-card" onclick="openModule(\'pdv\')" style="border-left-color:var(--success)"><div class="label">🛒 PDV</div><div class="value">Abrir</div><div class="sub">Nova venda</div><i class="fas fa-cash-register icon"></i></div></div>' +
    '<div class="metric-grid">' +
    '<div class="metric-card" onclick="openModule(\'financeiro\')" style="border-left-color:var(--success)"><div class="label">📥 A Receber</div><div class="value" style="color:var(--success)" id="dashReceber">...</div></div>' +
    '<div class="metric-card" onclick="openModule(\'financeiro\')" style="border-left-color:var(--danger)"><div class="label">📤 A Pagar</div><div class="value" style="color:var(--danger)" id="dashPagar">...</div></div>' +
    '<div class="metric-card" onclick="openModule(\'notificacoes\')" style="border-left-color:var(--warning)"><div class="label">🔔 Não Lidas</div><div class="value" id="dashNotif">...</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-bolt"></i> Ações Rápidas</h3></div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">' +
    '<button class="btn btn-success btn-lg" onclick="openModule(\'pdv\')"><i class="fas fa-cash-register"></i> Nova Venda</button>' +
    '<button class="btn btn-primary btn-lg" onclick="abrirModalProduto()"><i class="fas fa-plus"></i> Novo Produto</button>' +
    '<button class="btn btn-info btn-lg" onclick="abrirModalCliente()"><i class="fas fa-user-plus"></i> Novo Cliente</button>' +
    '<button class="btn btn-warning btn-lg" onclick="openModule(\'estoque\')"><i class="fas fa-warehouse"></i> Estoque</button>' +
    '<button class="btn btn-info btn-lg" onclick="openModule(\'servicos\')"><i class="fas fa-print"></i> Gráfica</button></div></div>';
  Promise.all([getData('produtos'), getData('clientes'), getData('vendas'), getData('contasReceber'), getData('contasPagar'), getData('notificacoes')]).then(([prod, cli, vend, cRec, cPag, notifs]) => {
    const totalV = vend.reduce((s, v) => s + (v.total || 0), 0);
    const baixo = prod.filter(p => (p.estoque || 0) < (p.estoqueMin || 10)).length;
    const totalR = cRec.filter(c => c.status !== 'pago').reduce((s, c) => s + (c.valor || 0), 0);
    const totalP = cPag.filter(c => c.status !== 'pago').reduce((s, c) => s + (c.valor || 0), 0);
    const naoLidas = notifs.filter(n => !n.lida).length;
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('dashVendas', fmt(totalV)); set('dashVendasSub', vend.length + ' vendas');
    set('dashProdutos', prod.length); set('dashProdutosSub', baixo + ' estoque baixo');
    set('dashClientes', cli.length); set('dashClientesSub', 'cadastrados');
    set('dashReceber', fmt(totalR)); set('dashPagar', fmt(totalP)); set('dashNotif', naoLidas);
  }).catch(() => { });
  return html;
}

/* ====== PERFIL ====== */
async function renderPerfil() {
  const user = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
  const avatarSrc = user.avatar || '';
  return header('Meu Perfil', 'Editar dados pessoais', 'var(--primary)', '', 'fa-user-circle') +
    '<div class="card"><div style="display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start">' +
    '<div style="text-align:center"><div style="position:relative;display:inline-block">' +
    '<img id="perfilAvatarImg" src="' + (avatarSrc || 'logo.png') + '" style="width:150px;height:150px;border-radius:50%;object-fit:cover;border:4px solid var(--primary);background:#f0f0f0" onerror="this.src=\'logo.png\'">' +
    '<label for="perfilAvatarInput" style="position:absolute;bottom:5px;right:5px;background:var(--primary);color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:3px solid var(--bg-card)"><i class="fas fa-camera"></i></label>' +
    '<input type="file" id="perfilAvatarInput" accept="image/*" style="display:none" onchange="escolherAvatarPerfil(this)"></div>' +
    '<div style="margin-top:12px"><button class="btn btn-sm btn-danger" onclick="removerAvatarPerfil()"><i class="fas fa-trash"></i> Remover foto</button></div></div>' +
    '<div><div class="form-grid">' +
    '<div class="form-group full"><label>Nome Completo *</label><input id="perfilNome" value="' + esc(user.nome || '') + '"></div>' +
    '<div class="form-group"><label>Email *</label><input id="perfilEmail" type="email" value="' + esc(user.email || '') + '"></div>' +
    '<div class="form-group"><label>Telefone</label><input id="perfilTel" value="' + esc(user.telefone || '') + '"></div>' +
    '<div class="form-group"><label>Perfil / Cargo</label><select id="perfilRole">' + ['admin', 'gerente', 'operador', 'caixa'].map(r => '<option value="' + r + '" ' + (user.role === r ? 'selected' : '') + '>' + r.charAt(0).toUpperCase() + r.slice(1) + '</option>').join('') + '</select></div>' +
    '<div class="form-group"><label>NIF</label><input id="perfilNif" value="' + esc(user.nif || '') + '"></div>' +
    '</div></div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-lock"></i> Alterar Senha</h3></div>' +
    '<div class="form-grid" style="max-width:500px">' +
    '<div class="form-group full"><label>Senha Atual</label><input type="password" id="perfilSenhaAtual"></div>' +
    '<div class="form-group"><label>Nova Senha</label><input type="password" id="perfilNovaSenha" minlength="6"></div>' +
    '<div class="form-group"><label>Confirmar Nova Senha</label><input type="password" id="perfilConfSenha" minlength="6"></div></div>' +
    '<button class="btn btn-warning" onclick="alterarSenhaPerfil()"><i class="fas fa-key"></i> Alterar Senha</button></div>' +
    '<div class="card" style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn btn-success btn-lg" onclick="salvarPerfil()"><i class="fas fa-save"></i> Salvar Alterações</button>' +
    '<button class="btn btn-secondary btn-lg" onclick="openModule(\'dashboard\')"><i class="fas fa-arrow-left"></i> Cancelar</button></div>';
}
function escolherAvatarPerfil(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Imagem muito grande (máx 2MB)', 'warning'); return; }
  const reader = new FileReader();
  reader.onload = e => { const url = e.target.result; if ($('perfilAvatarImg')) $('perfilAvatarImg').src = url; localStorage.setItem('kanawa_avatar_temp', url); toast('✅ Foto carregada — clique em Salvar', 'success'); };
  reader.readAsDataURL(file);
}
function removerAvatarPerfil() { localStorage.removeItem('kanawa_avatar_temp'); localStorage.setItem('kanawa_avatar_remove', 'true'); if ($('perfilAvatarImg')) $('perfilAvatarImg').src = 'logo.png'; toast('Foto removida — clique em Salvar', 'info'); }
async function salvarPerfil() {
  const user = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
  const nome = $('perfilNome').value.trim(), email = $('perfilEmail').value.trim();
  if (!nome || !email) { toast('Preencha nome e email', 'warning'); return; }
  user.nome = nome; user.email = email; user.telefone = $('perfilTel').value; user.role = $('perfilRole').value; user.nif = $('perfilNif').value;
  if (localStorage.getItem('kanawa_avatar_temp')) { user.avatar = localStorage.getItem('kanawa_avatar_temp'); localStorage.removeItem('kanawa_avatar_temp'); }
  if (localStorage.getItem('kanawa_avatar_remove')) { delete user.avatar; localStorage.removeItem('kanawa_avatar_remove'); }
  localStorage.setItem('kanawa_user', JSON.stringify(user));
  try { const users = await DB.getAll('usuarios'); const match = users.find(u => u.email === user.email || u.id === 1); if (match) { match.nome = nome; match.email = email; match.telefone = user.telefone; match.perfil = user.role; match.nif = user.nif; if (user.avatar) match.avatar = user.avatar; await DB.put('usuarios', match); } } catch (e) { }
  if ($('userName')) $('userName').textContent = nome;
  if ($('userRole')) $('userRole').textContent = user.role;
  if ($('userAvatar')) { $('userAvatar').src = user.avatar || 'logo.png'; $('userAvatar').onerror = function () { this.src = 'logo.png'; }; }
  await registrarAuditoria('editar', 'perfil', { nome, email });
  toast('✅ Perfil atualizado', 'success');
  openModule('perfil');
}
async function alterarSenhaPerfil() {
  const atual = $('perfilSenhaAtual').value, nova = $('perfilNovaSenha').value, conf = $('perfilConfSenha').value;
  if (!atual || !nova || !conf) { toast('Preencha todos os campos', 'warning'); return; }
  if (nova !== conf) { toast('Senhas não coincidem', 'error'); return; }
  if (nova.length < 8) { toast('Use uma senha com pelo menos 8 caracteres.', 'warning'); return; }
  if (!window.KanawaCloud || !KanawaCloud.ready) { toast('A alteração de senha exige uma sessão segura na nuvem.', 'error'); return; }
  try {
    await KanawaCloud.changePassword(atual, nova);
    $('perfilSenhaAtual').value = ''; $('perfilNovaSenha').value = ''; $('perfilConfSenha').value = '';
    await registrarAuditoria('editar', 'senha', {});
    toast('Senha alterada com segurança.', 'success');
  } catch (error) {
    toast(error.message || 'Não foi possível alterar a senha.', 'error');
  }
}

/* ====== DISPOSITIVOS ====== */
async function renderDispositivos() {
  const disps = await getData('dispositivos');
  const detectadas = await detectarImpressoras();
  return header('Dispositivos & Impressoras', 'Auto-detecção + configuração manual', 'var(--info)',
    '<button class="btn btn-success" onclick="abrirModalDispositivo()"><i class="fas fa-plus"></i> Adicionar</button>' +
    '<button class="btn btn-primary" onclick="detectarEDetalhes()"><i class="fas fa-search"></i> Detectar Novamente</button>', 'fa-print') +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-search"></i> Dispositivos Detectados</h3></div>' +
    '<div>' + (detectadas.length ? detectadas.map(d => '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px"><div><strong>' + esc(d.nome) + '</strong><br><small style="color:var(--text-muted)">' + esc(d.tipo) + ' • ' + esc(d.metodo) + '</small></div><div>' + badge(d.disponivel ? 'Disponível' : 'Indisponível', d.disponivel ? 'success' : 'secondary') + '</div></div>').join('') : '<div style="padding:12px;color:var(--text-muted);text-align:center"><i class="fas fa-info-circle"></i> Nenhum dispositivo detectado. Use "Adicionar".</div>') + '</div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-question-circle"></i> Como Conectar</h3></div>' +
    '<div style="font-size:.9rem;line-height:1.9;color:var(--text-muted)"><p><strong>🖨️ Impressora Térmica (58mm/80mm):</strong> USB/Bluetooth — detectada automaticamente</p>' +
    '<p><strong>📄 Impressora A4:</strong> USB/Rede — configurar no Windows</p>' +
    '<p><strong>💰 Gaveta de Dinheiro:</strong> conecta na impressora térmica via RJ11 (ESC/POS abre automaticamente)</p></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> Minhas Configurações</h3></div>' +
    (disps.length ? '<div style="display:grid;gap:12px">' + disps.map(d => '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid var(--border);border-radius:8px;gap:10px;flex-wrap:wrap"><div style="flex:1"><div style="font-weight:700">' + esc(d.nome) + ' ' + badge(d.padrao ? 'Padrão' : 'Secundária', d.padrao ? 'success' : 'secondary') + '</div><div style="font-size:.85rem;color:var(--text-muted);margin-top:4px">Tipo: ' + esc(d.tipo) + ' • Conexão: ' + esc(d.conexao) + '</div></div><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-primary" onclick="testarImpressora(' + d.id + ')"><i class="fas fa-print"></i> Testar</button>' +
      (d.tipo !== 'gaveta' ? '<button class="btn btn-sm btn-warning" onclick="abrirGaveta(' + d.id + ')"><i class="fas fa-cash-register"></i> Gaveta</button>' : '') +
      '<button class="btn btn-sm btn-info" onclick="definirPadrao(' + d.id + ')"><i class="fas fa-star"></i></button>' +
      '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'dispositivos\',' + d.id + ',\'dispositivos\')"><i class="fas fa-trash"></i></button></div></div>').join('') + '</div>' : emptyState('fa-print', 'Nenhum dispositivo configurado')) + '</div>';
}
async function detectarImpressoras() {
  const det = [];
  if (window.kanawaNative && window.kanawaNative.listarImpressoras) { try { const l = await window.kanawaNative.listarImpressoras(); l.forEach(i => det.push({ nome: i.name, tipo: 'Sistema', metodo: 'Electron', disponivel: true })); } catch (e) { } }
  try { if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) { const dv = await navigator.mediaDevices.enumerateDevices(); dv.filter(d => d.kind === 'audiooutput' || d.kind === 'videoinput').forEach(d => { if (!det.find(x => x.nome === d.label)) det.push({ nome: d.label || 'Dispositivo sem nome', tipo: d.kind, metodo: 'MediaDevices', disponivel: true }); }); } } catch (e) { }
  if (navigator.serial) { try { const p = await navigator.serial.getPorts(); p.forEach((pp, i) => det.push({ nome: 'Porta Serial ' + (i + 1), tipo: 'Serial', metodo: 'Web Serial', disponivel: true })); } catch (e) { } }
  if (navigator.usb) { try { const dv = await navigator.usb.getDevices(); dv.forEach(d => det.push({ nome: d.productName || 'USB Device', tipo: 'USB', metodo: 'Web USB', disponivel: true })); } catch (e) { } }
  return det;
}
function detectarEDetalhes() { toast('A deteção automática não foi concluída. Abra Dispositivos e use a consulta de hardware suportada pelo navegador.', 'warning'); openModule('dispositivos'); }
function abrirModalDispositivo() {
  openModal('Adicionar Dispositivo',
    '<div class="form-group"><label>Nome / Identificação *</label><input id="dispNome" placeholder="Ex: Epson TM-T20"></div>' +
    '<div class="form-group"><label>Tipo</label><select id="dispTipo"><option value="termica_58">Impressora Térmica 58mm</option><option value="termica_80">Impressora Térmica 80mm</option><option value="a4">Impressora A4</option><option value="gaveta">Gaveta de Dinheiro</option><option value="balanca">Balança</option><option value="leitor">Leitor de Código</option></select></div>' +
    '<div class="form-group"><label>Conexão</label><select id="dispConexao"><option value="USB">USB</option><option value="Bluetooth">Bluetooth</option><option value="Rede">Rede (Wi-Fi)</option><option value="Serial">Serial (COM)</option></select></div>' +
    '<div class="form-group"><label>Nome no sistema (opcional)</label><input id="dispSistema" placeholder="Ex: EPSON TM-T20 Receipt"></div>' +
    '<div class="form-group"><label><input type="checkbox" id="dispPadrao" checked> Definir como padrão</label></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarDispositivo()">Salvar</button>');
}
async function salvarDispositivo() {
  const nome = $('dispNome').value.trim();
  if (!nome) { toast('Informe o nome', 'warning'); return; }
  const isP = $('dispPadrao').checked;
  if (isP) { const all = await DB.getAll('dispositivos'); for (const d of all) { d.padrao = false; await DB.put('dispositivos', d); } }
  await saveData('dispositivos', { nome, tipo: $('dispTipo').value, conexao: $('dispConexao').value, dispositivoSistema: $('dispSistema').value, padrao: isP, data: now() });
  toast('✅ Dispositivo adicionado', 'success');
  closeModal(); openModule('dispositivos');
}
async function definirPadrao(id) { const all = await DB.getAll('dispositivos'); for (const d of all) { d.padrao = (d.id === id); await DB.put('dispositivos', d); } toast('✅ Definido como padrão', 'success'); openModule('dispositivos'); }
async function testarImpressora(id) {
  const d = await DB.get('dispositivos', id); if (!d) return;
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write('<html><head><title>Teste ' + esc(d.nome) + '</title></head><body style="font-family:monospace;text-align:center;padding:20px;font-size:12px">' +
    '<h2 style="margin:0">' + (emp.firma || emp.nome || 'KANAWA SOFT') + '</h2>' +
    '<p style="font-size:10px">' + esc(emp.endereco || 'Luanda, Angola') + '</p>' +
    '<p style="font-size:10px">NIF: ' + esc(emp.nif || '-') + '</p><hr><h3>=== TESTE DE IMPRESSÃO ===</h3>' +
    '<p>Dispositivo: <strong>' + esc(d.nome) + '</strong></p><p>Tipo: ' + esc(d.tipo) + '</p>' +
    '<p>Conexão: ' + esc(d.conexao) + '</p><p>' + new Date().toLocaleString('pt-AO') + '</p><hr>' +
    '<p>Se você está vendo este recibo impresso, a impressora está funcionando!</p><hr>' +
    '<p style="font-size:10px">Kanawa Soft ERP v' + APP_VERSION + '</p></body></html>');
  w.document.close(); setTimeout(() => { w.print(); }, 500);
  toast('📄 Teste enviado para impressão', 'success');
}
function abrirGaveta(id) {
  toast('💵 Enviando comando para abrir gaveta...', 'info');
  try {
    if (navigator.serial) { navigator.serial.getPorts().then(ports => { if (ports.length > 0) { const p = ports[0]; return p.open({ baudRate: 9600 }).then(() => { const w = p.writable.getWriter(); const cmd = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]); return w.write(cmd).then(() => w.releaseLock()).then(() => p.close()); }).then(() => toast('✅ Gaveta aberta via Serial', 'success')); } }).catch(e => console.warn('Serial:', e.message)); }
    if (window.kanawaNative && window.kanawaNative.abrirGaveta) { window.kanawaNative.abrirGaveta().then(() => { toast('✅ Comando enviado', 'success'); }).catch(() => { }); }
    setTimeout(() => { console.log('ESC/POS: 0x1B 0x70 0x00 0x19 0xFA'); }, 500);
  } catch (e) { console.warn(e); }
}
function abrirGavetaAutomatico() {
  try {
    if (localStorage.getItem('kanawa_gaveta_auto') !== 'false') {
      if (navigator.serial) { navigator.serial.getPorts().then(ports => { if (ports.length > 0) { const p = ports[0]; p.open({ baudRate: 9600 }).then(() => { const w = p.writable.getWriter(); const cmd = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]); return w.write(cmd).then(() => w.releaseLock()).then(() => p.close()); }).catch(() => { }); } }).catch(() => { }); }
    }
  } catch (e) { }
}
/* ====== FATURA COM QR CODE + AGT ====== */
async function abrirFatura(venda) {
  const emp = venda.empresa || JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const logo = (emp.logo && emp.logo.indexOf('data:') === 0) ? emp.logo : (emp.logo || 'logo.png');
  const qrText = null; // Sem certificado e integração validada no servidor, emitir factura simples.
  const subtotal = Number(venda.subtotal || 0), desconto = Number(venda.descontoValor || 0), base = subtotal - desconto, iva = Number(venda.iva || 0), total = Number(venda.total || 0);
  const totalExtenso = fmt(total);
  const itensHTML = (venda.itens || []).map((it, i) => '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:6px;font-size:.75rem">' + (i + 1) + '</td><td style="padding:6px;font-size:.75rem">' + esc(it.nome) + '</td><td style="padding:6px;text-align:center;font-size:.75rem">' + it.qty + '</td><td style="padding:6px;text-align:right;font-size:.75rem">' + fmt(it.preco) + '</td><td style="padding:6px;text-align:right;font-size:.75rem">' + fmt(it.subtotal || it.preco * it.qty) + '</td></tr>').join('');
  const faturaHTML = '<div id="faturaPreview" style="background:#fff;color:#000;padding:24px;max-width:820px;margin:0 auto;font-family:Arial;font-size:.85rem">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a3a5c;padding-bottom:12px;margin-bottom:12px">' +
    '<div style="display:flex;align-items:center;gap:12px"><img src="' + logo + '" alt="Logo" style="width:70px;height:70px;object-fit:contain" onerror="this.style.display=\'none\'">' +
    '<div><h2 style="color:#1a3a5c;font-size:1.2rem;margin:0">' + esc(emp.firma || emp.nome || 'KANAWA SOFT') + '</h2>' +
    (emp.nome && emp.firma && emp.nome !== emp.firma ? '<div style="font-size:.75rem;color:#666">' + esc(emp.nome) + '</div>' : '') +
    '<div style="font-size:.7rem;color:#555;line-height:1.5;margin-top:4px"><div><strong>NIF:</strong> ' + esc(emp.nif || '-') + '</div>' +
    (emp.regime ? '<div><strong>Regime:</strong> ' + esc(emp.regime) + '</div>' : '') +
    '<div>' + esc(emp.endereco || 'Luanda, Angola') + '</div><div><strong>Tel:</strong> ' + esc(emp.telefone || '-') + (emp.email ? ' | ' + esc(emp.email) : '') + '</div>' +
    (emp.alvara ? '<div><strong>Alvará:</strong> ' + esc(emp.alvara) + '</div>' : '') + '</div></div></div>' +
    '<div style="text-align:right"><div style="font-size:.65rem;color:#b91c1c;font-weight:700">DOCUMENTO COMERCIAL — NÃO CERTIFICADO PELA AGT</div>' +
    '<div style="font-size:1rem;font-weight:800;color:#1a3a5c">' + esc(venda.numeroFatura) + '</div>' +
    '<div style="font-size:.7rem;color:#555;margin-top:2px"><strong>Data:</strong> ' + fmtDT(venda.data) + '</div>' +
    '<div style="font-size:.7rem;color:#555"><strong>Origem:</strong> ' + esc(venda.operador || 'Admin') + '</div></div></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;padding:10px;border-radius:6px;margin-bottom:12px;font-size:.78rem">' +
    '<div style="line-height:1.6"><strong style="color:#1a3a5c;display:block;margin-bottom:2px">CLIENTE</strong><div>Nome: ' + esc(venda.clienteNome || 'Consumidor Final') + '</div>' +
    (venda.clienteNif ? '<div>NIF: ' + esc(venda.clienteNif) + '</div>' : '') + (venda.clienteTelefone ? '<div>Tel: ' + esc(venda.clienteTelefone) + '</div>' : '') + '</div>' +
    '<div style="line-height:1.6"><strong style="color:#1a3a5c;display:block;margin-bottom:2px">OPERAÇÃO</strong><div>Pagamento: ' + esc(venda.pagamento || '-') + '</div><div>Regime: ' + esc(venda.regime || 'geral') + '</div><div>Tipo: Documento comercial de gestão</div></div></div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><thead><tr style="background:#1a3a5c;color:#fff"><th style="padding:6px;text-align:left;font-size:.75rem">#</th><th style="padding:6px;text-align:left;font-size:.75rem">Descrição</th><th style="padding:6px;text-align:center;font-size:.75rem">Qtd</th><th style="padding:6px;text-align:right;font-size:.75rem">Preço Unit.</th><th style="padding:6px;text-align:right;font-size:.75rem">Total</th></tr></thead><tbody>' + itensHTML + '</tbody></table>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">' +
    '<div style="font-size:.78rem;color:#b91c1c"><strong>Documento comercial de teste</strong><br>Não substitui factura fiscal emitida por software validado pela AGT.</div>' +
    '<div style="font-size:.82rem;line-height:1.8">' +
    '<div style="display:flex;justify-content:space-between"><span>Subtotal:</span><strong>' + fmt(subtotal) + '</strong></div>' +
    (desconto > 0 ? '<div style="display:flex;justify-content:space-between;color:#dc3545"><span>Desconto (' + venda.desconto + '%):</span><strong>-' + fmt(desconto) + '</strong></div>' : '') +
    '<div style="display:flex;justify-content:space-between"><span><strong>Montante Ilíquido:</strong></span><strong>' + fmt(base) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between"><span>Imposto (IVA ' + (venda.regime === 'simplificado' ? '7' : '14') + '%):</span><strong>' + fmt(iva) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;color:#999;font-size:.7rem"><span>Imposto Devido:</span><span>' + fmt(iva) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;border-top:2px solid #1a3a5c;padding-top:6px;margin-top:6px;font-size:1rem;color:#1a3a5c"><strong>TOTAL LÍQUIDO:</strong><strong>' + fmt(total) + '</strong></div>' +
    (venda.valorRecebido > 0 ? '<div style="display:flex;justify-content:space-between;margin-top:4px"><span>Valor Recebido:</span><strong>' + fmt(venda.valorRecebido) + '</strong></div><div style="display:flex;justify-content:space-between;color:#10b981"><span>Troco:</span><strong>' + fmt(venda.troco) + '</strong></div>' : '') + '</div></div>' +
    '<div style="margin-top:12px;padding:8px;background:#f8fafc;border-radius:6px;font-size:.75rem;border-left:3px solid #1a3a5c"><strong>Valor total:</strong> <em>' + esc(totalExtenso) + '</em></div>' +
    '<div style="text-align:center;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:.7rem;color:#777"><strong>Obrigado pela preferência!</strong><br><span style="font-size:.65rem">' + esc(emp.firma || emp.nome || 'KANAWA SOFT') + ' — ' + new Date().getFullYear() + '</span></div></div>';
  window._vendaAtual = venda;
  openModal('🖨️ Fatura / Recibo — ' + venda.numeroFatura,
    '<div style="max-height:65vh;overflow-y:auto;background:#fff;padding:0;border-radius:var(--radius-sm)">' + faturaHTML + '</div>' +
    '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">' +
    '<button class="btn btn-success" onclick="imprimirFatura()"><i class="fas fa-print"></i> A4</button>' +
    '<button class="btn btn-primary" onclick="imprimirTermica()"><i class="fas fa-receipt"></i> Térmica</button>' +
    '<button class="btn btn-info" onclick="baixarFaturaPDF()"><i class="fas fa-file-pdf"></i> PDF</button>' +
    '<button class="btn btn-warning" onclick="compartilharWhatsApp(window._vendaAtual)"><i class="fab fa-whatsapp"></i> WhatsApp</button>' +
    '<button class="btn btn-purple" onclick="abrirGaveta()"><i class="fas fa-cash-register"></i> Abrir Gaveta</button>' +
    '<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>', true);
  if (qrText) setTimeout(() => gerarQRCodeFatura(qrText), 250);
}

function gerarQRCodeFatura(texto) {
  const container = $('qrcodeContainer'); if (!container) return;
  container.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    try { new QRCode(container, { text: texto, width: 130, height: 130, colorDark: '#1a3a5c', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); return; } catch (e) { console.warn(e); }
  }
  try {
    const canvas = document.createElement('canvas'); canvas.width = 130; canvas.height = 130;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 130, 130); ctx.fillStyle = '#1a3a5c';
    let hash = 0; for (let i = 0; i < texto.length; i++) { hash = ((hash << 5) - hash) + texto.charCodeAt(i); hash = hash & hash; }
    hash = Math.abs(hash); const grid = 25, cell = 130 / grid;
    for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) { const val = ((hash * (i + 1) * (j + 1)) % 11); if (val < 5) ctx.fillRect(i * cell, j * cell, cell, cell); }
    ctx.fillStyle = '#1a3a5c';
    [[0, 0], [grid - 7, 0], [0, grid - 7]].forEach(([x, y]) => { ctx.fillRect(x * cell, y * cell, 7 * cell, 7 * cell); ctx.fillStyle = '#fff'; ctx.fillRect((x + 1) * cell, (y + 1) * cell, 5 * cell, 5 * cell); ctx.fillStyle = '#1a3a5c'; ctx.fillRect((x + 2) * cell, (y + 2) * cell, 3 * cell, 3 * cell); });
    container.appendChild(canvas);
  } catch (e) { container.innerHTML = '<div style="width:130px;height:130px;display:flex;align-items:center;justify-content:center;font-size:.6rem;color:#666;padding:8px;word-break:break-all;text-align:center">' + esc(texto.slice(0, 80)) + '</div>'; }
}

function htmlSeguroParaImpressao(conteudo, titulo, estilo) {
  return '<!doctype html><html lang="pt-AO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base href="' + esc(window.location.href.split('#')[0]) + '">' +
    '<title>' + esc(titulo) + '</title><style>' + estilo +
    'html,body{background:#fff!important;color:#000!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}' +
    '@media screen{body{padding:12px}}@media print{body{margin:0!important}}</style></head><body>' + conteudo + '</body></html>';
}
async function imprimirDocumento(html, opcoes = {}) {
  const titulo = opcoes.titulo || 'Documento Kanawa Soft';
  const nativo = window.kanawaNative;
  if (nativo && nativo.isDesktop && typeof nativo.imprimirHTML === 'function') {
    try {
      const ok = await nativo.imprimirHTML({
        html, printer: opcoes.printer || undefined, silent: false,
        paperSize: opcoes.paperSize || 'A4',
        margins: { marginType: opcoes.margins || 'default' }
      });
      if (ok === true) { toast('Documento enviado para a impressora.', 'success'); return true; }
      toast('A impressão nativa não foi concluída. Verifique a impressora selecionada e tente novamente.', 'error');
      return false;
    } catch (erro) {
      console.error('[Kanawa impressão nativa]', erro);
      toast('Falha na impressão: ' + (erro.message || 'erro do sistema'), 'error');
      return false;
    }
  }
  const janela = window.open('', '_blank');
  if (!janela) {
    toast('O navegador bloqueou a janela de impressão. Autorize pop-ups para este site e tente novamente.', 'error');
    return false;
  }
  try {
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    const imagens = Array.from(janela.document.images || []);
    await Promise.all(imagens.map(img => img.decode ? img.decode().catch(() => {}) : new Promise(resolve => {
      if (img.complete) resolve(); else { img.onload = resolve; img.onerror = resolve; }
    })));
    if (janela.document.fonts && janela.document.fonts.ready) await janela.document.fonts.ready;
    janela.focus();
    janela.addEventListener('afterprint', () => { try { janela.close(); } catch (_) {} }, { once: true });
    setTimeout(() => { try { janela.print(); } catch (erro) { console.error('[Kanawa impressão]', erro); } }, 250);
    return true;
  } catch (erro) {
    try { janela.close(); } catch (_) {}
    console.error('[Kanawa impressão]', erro);
    toast('Não foi possível preparar a fatura para impressão.', 'error');
    return false;
  }
}
function imprimirFatura() {
  const el = $('faturaPreview');
  if (!el) { toast('A pré-visualização da fatura não está disponível.', 'error'); return; }
  const copia = el.cloneNode(true);
  copia.querySelectorAll('canvas').forEach(canvas => {
    try {
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.width = canvas.width; img.height = canvas.height;
      img.alt = 'Código QR da fatura';
      canvas.replaceWith(img);
    } catch (erro) { console.warn('[Kanawa QR impressão]', erro); }
  });
  const estilo = 'body{font-family:Arial,sans-serif;padding:5mm;margin:0;font-size:12px}' +
    'table{width:100%;border-collapse:collapse}th{background:#1a3a5c!important;color:#fff!important;padding:8px}' +
    'td{padding:6px;border-bottom:1px solid #e2e8f0}img{max-width:100%}#faturaPreview{max-width:none!important;width:100%!important;padding:0!important}' +
    '@page{size:A4 portrait;margin:5mm}';
  const html = htmlSeguroParaImpressao(copia.outerHTML, 'Fatura ' + (window._vendaAtual?.numeroFatura || ''), estilo);
  return imprimirDocumento(html, { titulo: 'Fatura', paperSize: 'A4' });
}
function imprimirTermica() {
  const v = window._vendaAtual; if (!v) { toast('Nenhuma venda selecionada para imprimir.', 'error'); return; }
  const emp = v.empresa || JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const texto = ['=================================', '   ' + (emp.firma || emp.nome || 'KANAWA SOFT').toUpperCase(), '   NIF: ' + (emp.nif || '-'), '   ' + (emp.endereco || 'Luanda, Angola'), '   Tel: ' + (emp.telefone || '-'), '=================================', 'FATURA-RECIBO: ' + v.numeroFatura, 'Data: ' + fmtDT(v.data), 'Cliente: ' + (v.clienteNome || 'Consumidor Final'), (v.clienteNif ? 'NIF: ' + v.clienteNif : ''), '=================================', ...(v.itens || []).map(it => String(it.nome || '').substring(0, 20).padEnd(20) + '\n  ' + it.qty + ' x ' + fmt(it.preco).padEnd(12) + fmt(it.subtotal)), '=================================', 'Subtotal:    ' + fmt(v.subtotal), (v.desconto > 0 ? 'Desconto:    -' + fmt(v.descontoValor) : ''), 'Imposto:     ' + fmt(v.iva), 'TOTAL:       ' + fmt(v.total), v.valorRecebido > 0 ? 'Recebido:    ' + fmt(v.valorRecebido) : '', v.valorRecebido > 0 ? 'Troco:       ' + fmt(v.troco) : '', '=================================', 'Valor: ' + numeroPorExtenso(v.total), '---------------------------------', '    Obrigado pela preferência!', '================================='].filter(Boolean).join('\n');
  const html = htmlSeguroParaImpressao('<pre>' + esc(texto) + '</pre>', 'Recibo ' + (v.numeroFatura || ''),
    'body{font-family:"Courier New",monospace;font-size:11px;width:48mm;margin:0 auto;padding:2mm;white-space:pre-wrap;line-height:1.3}' +
    'pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}@page{size:58mm auto;margin:0}');
  const tamanho = { width: 58000, height: 200000 };
  return imprimirDocumento(html, { titulo: 'Recibo térmico', paperSize: tamanho, margins: 'none' }).then(ok => {
    if (ok && typeof abrirGavetaAutomatico === 'function') abrirGavetaAutomatico();
    return ok;
  });
}
async function baixarFaturaPDF() {
  const el = $('faturaPreview'); if (!el) return;
  if (!window.jspdf) { toast('PDF indisponível', 'warning'); return; }
  const { jsPDF } = window.jspdf; const d = new jsPDF('p', 'pt', 'a4');
  d.html(el, { callback: x => { x.save('fatura_' + Date.now() + '.pdf'); toast('📄 PDF baixado', 'success'); }, x: 10, y: 10, width: 580 });
}
function compartilharWhatsApp(v) {
  if (!v) return;
  const txt = '*' + (v.empresa && v.empresa.nome || 'Kanawa') + '*\n\nFatura: ' + v.numeroFatura + '\nData: ' + fmtDT(v.data) + '\nTotal: ' + fmt(v.total) + '\n\n' + (v.itens || []).map(i => '• ' + i.nome + ' x' + i.qty + ' = ' + fmt(i.subtotal)).join('\n');
  window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
}

/* ====== PDV ====== */
async function carregarCachePDV(force) {
  const t = Date.now();
  if (!force && pdvCache.produtos.length && (t - pdvCache.ts) < 30000) return pdvCache.produtos;
  pdvCache.produtos = await getData('produtos'); pdvCache.ts = t; return pdvCache.produtos;
}
function renderGridProdutos(produtos, favs) {
  if (!produtos.length) return '<div style="grid-column:1/-1">' + emptyState('fa-box-open', 'Sem produtos — clique em "Novo"') + '</div>';
  return produtos.slice(0, 150).map(p => {
    const isFav = favs.indexOf(p.id) !== -1;
    return '<div class="pdv-prod-card" data-id="' + p.id + '" data-nome="' + esc((p.nome || '').toLowerCase()) + '" onclick="pdvSelecionarProduto(' + p.id + ')">' +
      '<span class="favorite ' + (isFav ? 'active' : '') + '" onclick="event.stopPropagation();toggleFavorito(' + p.id + ',this)"><i class="fas fa-star"></i></span>' +
      '<div class="img"><img src="' + imgSrc(p) + '" alt="' + esc(p.nome) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'"></div>' +
      '<div class="info"><div class="name">' + esc(p.nome) + '</div><div class="price">' + fmt(p.preco) + '</div>' +
      '<div class="stock">Estoque: ' + (p.estoque || 0) + '</div>' + (p.codigoBarras ? '<div class="codigo">' + esc(p.codigoBarras) + '</div>' : '') + '</div></div>';
  }).join('');
}

async function renderPDV() {
  const produtos = await carregarCachePDV();
  const favs = pdvCache.favoritos;
  try {
    if (window.KanawaCloud && KanawaCloud.ready && typeof KanawaCloud.listCompanyPaymentMethods === 'function') {
      const configured = await KanawaCloud.listCompanyPaymentMethods();
      pdvPaymentMethods = configured.filter(method => method.enabled === true);
    } else {
      pdvPaymentMethods = DEFAULT_PDV_PAYMENT_METHODS.filter(method => method.enabled);
    }
  } catch (error) {
    pdvPaymentMethods = DEFAULT_PDV_PAYMENT_METHODS.filter(method => method.enabled);
    toast('Não foi possível carregar os métodos configurados; foram mostrados os métodos padrão. ' + (error.message || ''), 'warning');
  }
  if (!pdvPaymentMethods.length) pdvPaymentMethods = DEFAULT_PDV_PAYMENT_METHODS.filter(method => method.method_code === 'dinheiro');
  if (!pdvPaymentMethods.some(method => method.method_code === pdvState.pagamento)) pdvState.pagamento = pdvPaymentMethods[0].method_code;
  const paymentIcons = { dinheiro:'fa-money-bill-wave', cartao:'fa-credit-card', transferencia:'fa-university', multicaixa:'fa-mobile-alt', misto:'fa-random', credito:'fa-file-invoice', referencia:'fa-barcode', multicaixa_express:'fa-mobile-alt' };
  const pags = pdvPaymentMethods.map(method => ({ v:method.method_code, i:paymentIcons[method.method_code] || 'fa-credit-card', l:method.display_name, instructions:method.instructions || '' }));
  return header('PDV — Ponto de Venda', produtos.length + ' produtos disponíveis', 'var(--success)',
    '<button class="btn btn-sm" onclick="abrirScanner()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-barcode"></i> Scanner</button>' +
    '<button class="btn btn-sm" onclick="imprimirEtiquetasLote()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-tags"></i> Etiquetas</button>' +
    '<button class="btn btn-sm" onclick="openModule(\'vendas\')" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-history"></i> Histórico</button>', 'fa-cash-register') +
    '<div class="pdv-breadcrumb"><div class="step active" data-step="1"><span class="num">1</span>Produtos</div><span class="sep">›</span><div class="step" data-step="2"><span class="num">2</span>Carrinho</div><span class="sep">›</span><div class="step" data-step="3"><span class="num">3</span>Cliente</div><span class="sep">›</span><div class="step" data-step="4"><span class="num">4</span>Pagamento</div><span class="sep">›</span><div class="step" data-step="5"><span class="num">5</span>Valores</div><span class="sep">›</span><div class="step" data-step="6"><span class="num">6</span>Finalizar</div></div>' +
    '<div class="pdv-screen active" id="pdvScreen1"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-boxes"></i> Produtos</h3><div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<input type="text" id="pdvBusca" placeholder="🔍 Buscar..." style="padding:10px 14px;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);min-width:200px" oninput="filtrarPDV(this.value)">' +
    '<input type="text" id="pdvCodigoBarras" placeholder="📷 Código" style="padding:10px 14px;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);width:150px" onkeypress="if(event.key===\'Enter\'){buscarPorCodigo(this.value);this.value=\'\'}">' +
    '<button class="btn btn-sm btn-info" onclick="abrirScanner()"><i class="fas fa-camera"></i></button></div></div>' +
    '<div class="pdv-products-grid" id="pdvProductsGrid">' + renderGridProdutos(produtos, favs) + '</div></div>' +
    '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;margin-top:16px;border:1px solid var(--border)">' +
    '<div><div style="font-size:.8rem;color:var(--text-muted)">Carrinho</div><div style="font-size:1.3rem;font-weight:800" id="pdvScreen1Total">' + pdvState.carrinho.length + ' itens</div></div>' +
    '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(2)">Ver Carrinho <i class="fas fa-arrow-right"></i></button></div></div>' +
    '<div class="pdv-screen" id="pdvScreen2"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-shopping-cart"></i> Carrinho</h3><button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(1)"><i class="fas fa-arrow-left"></i> Voltar</button></div><div class="pdv-cart-full" id="pdvCarrinhoFull"></div></div>' +
    '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">' +
    '<div><div style="font-size:.8rem;color:var(--text-muted)">Subtotal</div><div style="font-size:1.5rem;font-weight:800;color:var(--secondary)" id="pdvSubtotalTela2">' + fmt(0) + '</div></div>' +
    '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(3)">Continuar <i class="fas fa-arrow-right"></i></button></div></div>' +
    '<div class="pdv-screen" id="pdvScreen3"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-user"></i> Cliente</h3><button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(2)"><i class="fas fa-arrow-left"></i> Voltar</button></div>' +
    '<div class="form-grid" style="max-width:600px"><div class="form-group full"><label>Nome *</label><input id="pdvClienteNome" value="' + esc(pdvState.cliente.nome) + '"></div>' +
    '<div class="form-group"><label>NIF</label><input id="pdvClienteNif" value="' + esc(pdvState.cliente.nif) + '"></div>' +
    '<div class="form-group"><label>Telefone</label><input id="pdvClienteTel" value="' + esc(pdvState.cliente.telefone) + '"></div></div>' +
    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-info" onclick="abrirModalPDVCliente()"><i class="fas fa-user-plus"></i> Novo Cliente</button><button class="btn btn-secondary" onclick="pdvClienteAnonimo()"><i class="fas fa-user-secret"></i> Anônimo</button></div></div>' +
    '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">' +
    '<div><div style="font-size:.8rem;color:var(--text-muted)">Cliente</div><div style="font-size:1.1rem;font-weight:700" id="pdvClienteResumo">' + esc(pdvState.cliente.nome) + '</div></div>' +
    '<button class="btn btn-primary btn-lg" onclick="pdvSalvarCliente()">Continuar <i class="fas fa-arrow-right"></i></button></div></div>' +
    '<div class="pdv-screen" id="pdvScreen4"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-credit-card"></i> Pagamento</h3><button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(3)"><i class="fas fa-arrow-left"></i> Voltar</button></div>' +
    '<div class="payment-methods-grid">' + pags.map(p => '<div class="payment-method-card ' + (pdvState.pagamento === p.v ? 'selected' : '') + '" data-payment="' + p.v + '" onclick="pdvSelecionarPagamento(\'' + p.v + '\')"><i class="fas ' + p.i + '"></i><span>' + p.l + '</span></div>').join('') + '</div>' +
    '<div id="pdvPaymentInstructions" style="font-size:.82rem;color:var(--text-muted);padding:10px 12px;background:var(--bg);border-radius:8px">' + esc((pdvPaymentMethods.find(method => method.method_code === pdvState.pagamento) || {}).instructions || 'Sem instruções adicionais para este método.') + '</div></div>' +
    '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">' +
    '<div><div style="font-size:.8rem;color:var(--text-muted)">Pagamento</div><div style="font-size:1.1rem;font-weight:700" id="pdvPagamentoResumo">Dinheiro</div></div>' +
    '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(5)">Continuar <i class="fas fa-arrow-right"></i></button></div></div>' +
    '<div class="pdv-screen" id="pdvScreen5"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-calculator"></i> Valores e Impostos</h3><button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(4)"><i class="fas fa-arrow-left"></i> Voltar</button></div>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label>🏷️ Desconto (%) máx: ' + getPerms().descontoMax + '%</label><input type="number" id="pdvDescontoInput" value="' + pdvState.desconto + '" min="0" max="' + getPerms().descontoMax + '" oninput="pdvAtualizarValores()" style="font-size:1.1rem;text-align:right"></div>' +
    '<div class="form-group"><label>💰 Valor Recebido</label><input type="number" id="pdvValorRecebidoInput" value="' + pdvState.valorRecebido + '" oninput="pdvAtualizarValores()" style="font-size:1.1rem;text-align:right"></div>' +
    '<div class="form-group"><label>⚖️ Regime Fiscal</label><select id="pdvRegimeInput" onchange="pdvAtualizarValores()"><option value="geral" ' + (pdvState.regime === 'geral' ? 'selected' : '') + '>Regime Geral (IVA 14%)</option><option value="simplificado" ' + (pdvState.regime === 'simplificado' ? 'selected' : '') + '>Simplificado (7%)</option><option value="isento" ' + (pdvState.regime === 'isento' ? 'selected' : '') + '>Isento (exige fundamento legal)</option></select></div>' +
    '<div class="form-group" id="pdvMotivoIsencaoGroup" style="display:' + (pdvState.regime === 'isento' ? 'block' : 'none') + '"><label>Fundamento legal da isenção *</label><input id="pdvMotivoIsencao" maxlength="180" value="' + esc(pdvState.exemptionReason || '') + '" placeholder="Código/motivo e referência legal" oninput="pdvAtualizarValores()"></div>' +
    '<div id="pdvTaxError" role="alert" style="display:none;color:#b91c1c;background:#fee2e2;border-radius:8px;padding:10px;margin:8px 0"></div>' +
    '<div class="form-group"><label>Aplicações</label><div style="padding-top:6px"><label style="display:block;margin-bottom:6px;font-weight:400"><input type="checkbox" id="pdvAplicarIVA" ' + (pdvState.aplicarIVA ? 'checked' : '') + ' onchange="pdvAtualizarValores()"> Aplicar IVA</label></div></div></div>' +
    '<div class="form-group"><label>📝 Observações</label><textarea id="pdvObs" rows="2">' + esc(pdvState.observacoes) + '</textarea></div>' +
    '<div class="total-box" style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;border-radius:14px;padding:18px;margin:16px 0">' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Subtotal:</span><span id="pdvCalcSubtotal">' + fmt(0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Desconto:</span><span id="pdvCalcDesconto">-' + fmt(0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Montante Ilíquido:</span><span id="pdvCalcBase">' + fmt(0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Imposto Devido:</span><span id="pdvCalcIVA">' + fmt(0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;border-top:2px solid rgba(255,255,255,.3);margin-top:8px;padding-top:12px;font-size:1.3rem;font-weight:800"><span>TOTAL LÍQUIDO:</span><span id="pdvCalcTotal">' + fmt(0) + '</span></div></div>' +
    '<div id="pdvTrocoBox" style="background:linear-gradient(135deg,var(--success),var(--secondary));color:#fff;border-radius:10px;padding:16px;margin-top:12px;display:none"><div style="font-size:.85rem;opacity:.9">💵 Troco</div><div style="font-size:2rem;font-weight:800;margin-top:4px" id="pdvTrocoValue">' + fmt(0) + '</div></div></div>' +
    '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">' +
    '<div><div style="font-size:.8rem;color:var(--text-muted)">Total a Pagar</div><div style="font-size:1.5rem;font-weight:800;color:var(--secondary)" id="pdvTotalFinalTela5">' + fmt(0) + '</div></div>' +
    '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(6)">Revisar <i class="fas fa-arrow-right"></i></button></div></div>' +
    '<div class="pdv-screen" id="pdvScreen6"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-check-circle"></i> Revisão Final</h3><button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(5)"><i class="fas fa-arrow-left"></i> Voltar</button></div>' +
    '<div style="background:var(--bg);border-radius:10px;padding:16px;margin-bottom:16px" id="pdvResumoFinal"></div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">' +
    '<button class="btn btn-danger btn-lg" onclick="pdvCancelarVenda()"><i class="fas fa-times-circle"></i> Cancelar</button>' +
    '<button class="btn btn-warning btn-lg" onclick="pdvSalvarRascunho()"><i class="fas fa-save"></i> Rascunho</button>' +
    '<button class="btn btn-info btn-lg" onclick="pdvSalvarOrcamento()"><i class="fas fa-file-invoice"></i> Orçamento</button>' +
    '<button class="btn btn-purple btn-lg" onclick="pdvFinalizarVenda()"><i class="fas fa-print"></i> Finalizar & Imprimir</button></div></div></div>';
}

function pdvIrParaTela(n) {
  $$('.pdv-screen').forEach(el => el.classList.remove('active'));
  const t = $('pdvScreen' + n); if (t) t.classList.add('active');
  $$('.pdv-breadcrumb .step').forEach(el => { const s = parseInt(el.dataset.step); el.classList.toggle('active', s === n); el.classList.toggle('done', s < n); });
  pdvState.screen = n;
  if (n === 2) pdvRenderCarrinhoFull();
  if (n === 5) pdvAtualizarValores();
  if (n === 6) pdvRenderResumoFinal();
  const c = $('content'); if (c) c.scrollTop = 0;
}
async function pdvAtualizarStockLocal() {
  let produtos;
  if (window.KanawaCloud && KanawaCloud.ready) {
    // Refresh the catalogue from the active company before changing quantities.
    produtos = await KanawaCloud.getStore('produtos');
    if (!Array.isArray(produtos)) throw new Error('Não foi possível confirmar o stock atual no servidor.');
    await DB.clear('produtos');
    for (const product of produtos) await DB.put('produtos', product);
  } else {
    produtos = await DB.getAll('produtos');
  }
  pdvCache.produtos = Array.isArray(produtos) ? produtos : [];
  pdvCache.ts = Date.now();
  return pdvCache.produtos;
}
function pdvValidarStockCarrinho(produtos) {
  if (!window.KanawaSales || typeof window.KanawaSales.validateCartStock !== 'function') {
    throw new Error('Validador de stock não carregado. Atualize a aplicação.');
  }
  return window.KanawaSales.validateCartStock(pdvState.carrinho, produtos || pdvCache.produtos);
}
async function pdvSelecionarProduto(id) {
  try {
    const produtos = await pdvAtualizarStockLocal();
    const p = produtos.find(x => String(x.id) === String(id));
    if (!p) { toast('Produto não encontrado no stock. Atualize o catálogo.', 'warning'); return; }
    const current = pdvState.carrinho.find(i => String(i.id) === String(id));
    const nextCart = pdvState.carrinho.map(i => i);
    if (current) {
      const proposed = nextCart.map(i => String(i.id) === String(id) ? Object.assign({}, i, { qty: Number(i.qty) + 1 }) : i);
      window.KanawaSales.validateCartStock(proposed, produtos);
      current.qty = Number(current.qty) + 1;
      current.stockAvailable = Number(p.estoque !== undefined ? p.estoque : p.stock_quantity);
      current.subtotal = current.preco * current.qty;
    } else {
      window.KanawaSales.validateCartStock([{ id: p.id, nome: p.nome, qty: 1 }], produtos);
      pdvState.carrinho.push({ id: p.id, nome: p.nome, preco: p.preco, qty: 1, stockAvailable: Number(p.estoque !== undefined ? p.estoque : p.stock_quantity), subtotal: p.preco, imagem: p.imagem, codigoBarras: p.codigoBarras });
    }
    toast('Produto ' + p.nome + ' adicionado. Quantidade: ' + (current ? current.qty : 1) + '. Stock disponível: ' + Number(p.estoque !== undefined ? p.estoque : p.stock_quantity) + '.', 'success');
    const el = $('pdvScreen1Total'); if (el) el.textContent = pdvState.carrinho.length + ' itens';
  } catch (error) {
    toast(error.message || 'Não foi possível adicionar o produto.', 'warning');
  }
}
function pdvRenderCarrinhoFull() {
  const box = $('pdvCarrinhoFull'); if (!box) return;
  if (!pdvState.carrinho.length) { box.innerHTML = emptyState('fa-shopping-cart', 'Carrinho vazio'); const st = $('pdvSubtotalTela2'); if (st) st.textContent = fmt(0); return; }
  box.innerHTML = pdvState.carrinho.map(i => '<div class="pdv-cart-item-full" style="display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid var(--border);background:var(--bg-card);border-radius:10px;margin-bottom:8px;gap:10px;flex-wrap:wrap">' +
    '<div style="flex:1;min-width:140px"><div style="font-weight:700;font-size:1rem">' + esc(i.nome) + '</div><div style="font-size:.85rem;color:var(--text-muted);margin-top:2px">' + fmt(i.preco) + ' × ' + i.qty + '</div></div>' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<button onclick="pdvAltQty(' + i.id + ',-1)" style="width:38px;height:38px;border-radius:50%;border:none;background:var(--primary);color:#fff;cursor:pointer;font-weight:700;font-size:1.1rem">−</button>' +
    '<span style="min-width:44px;text-align:center;font-weight:700;font-size:1.1rem">' + i.qty + '</span>' +
    '<button onclick="pdvAltQty(' + i.id + ',1)" ' + (i.stockAvailable !== undefined && Number(i.qty) >= Number(i.stockAvailable) ? 'disabled title="Limite de stock atingido"' : '') + ' style="width:38px;height:38px;border-radius:50%;border:none;background:var(--primary);color:#fff;cursor:pointer;font-weight:700;font-size:1.1rem">+</button></div>' +
    '<div style="font-weight:800;font-size:1.1rem;min-width:110px;text-align:right">' + fmt(i.subtotal) + '</div>' +
    '<button onclick="pdvRemoverItem(' + i.id + ')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.2rem;padding:6px 10px"><i class="fas fa-trash"></i></button></div>').join('');
  const st = pdvState.carrinho.reduce((s, i) => s + i.subtotal, 0);
  const el = $('pdvSubtotalTela2'); if (el) el.textContent = fmt(st);
}
async function pdvAltQty(id, d) {
  const it = pdvState.carrinho.find(i => String(i.id) === String(id));
  if (!it) return;
  if (d > 0) {
    try {
      const products = await pdvAtualizarStockLocal();
      const currentProduct = products.find(product => String(product.id) === String(id));
      if (currentProduct) it.stockAvailable = Number(currentProduct.estoque !== undefined ? currentProduct.estoque : currentProduct.stock_quantity);
      const proposed = pdvState.carrinho.map(line => String(line.id) === String(id)
        ? Object.assign({}, line, { qty: Number(line.qty) + Number(d) }) : Object.assign({}, line));
      window.KanawaSales.validateCartStock(proposed, products);
    } catch (error) {
      toast(error.message || 'Stock insuficiente.', 'warning');
      pdvRenderCarrinhoFull();
      return;
    }
  }
  it.qty = Number(it.qty) + Number(d);
  if (it.qty <= 0) pdvState.carrinho = pdvState.carrinho.filter(i => String(i.id) !== String(id));
  else it.subtotal = it.preco * it.qty;
  pdvRenderCarrinhoFull();
}
function pdvRemoverItem(id) { pdvState.carrinho = pdvState.carrinho.filter(i => i.id !== id); pdvRenderCarrinhoFull(); toast('Removido', 'info'); }
function pdvSalvarCliente() { pdvState.cliente.nome = ($('pdvClienteNome').value.trim() || 'Cliente Anônimo'); pdvState.cliente.nif = $('pdvClienteNif').value.trim(); pdvState.cliente.telefone = $('pdvClienteTel').value.trim(); pdvIrParaTela(4); }
function pdvClienteAnonimo() { $('pdvClienteNome').value = 'Cliente Anônimo'; $('pdvClienteNif').value = ''; $('pdvClienteTel').value = ''; pdvState.cliente = { nome: 'Cliente Anônimo', nif: '', telefone: '' }; toast('Cliente anônimo', 'info'); }
function pdvSelecionarPagamento(t) { pdvState.pagamento = t; $$('.payment-method-card').forEach(el => el.classList.toggle('selected', el.dataset.payment === t)); const method = pdvPaymentMethods.find(item => item.method_code === t); const el = $('pdvPagamentoResumo'); if (el) el.textContent = method ? method.display_name : t; const note = $('pdvPaymentInstructions'); if (note) note.textContent = method && method.instructions ? method.instructions : 'Sem instruções adicionais para este método.'; }
function pdvAtualizarValores() {
  const dEl = $('pdvDescontoInput'), vEl = $('pdvValorRecebidoInput'), rEl = $('pdvRegimeInput'), iEl = $('pdvAplicarIVA');
  if (!dEl) return { subtotal: 0, descontoValor: 0, base: 0, iva: 0, total: 0, troco: 0, faltam: 0 };
  const money = window.KanawaSales.roundMoney;
  const maxD = getPerms().descontoMax; let desc = num(dEl.value, 0); if (desc > maxD) { desc = maxD; dEl.value = maxD; }
  const recebidoInput = num(vEl.value, 0), regime = rEl.value, aplicarIVA = iEl.checked;
  pdvState.desconto = desc; pdvState.regime = regime; pdvState.aplicarIVA = aplicarIVA;
  const subtotal = money(pdvState.carrinho.reduce((sum, item) => {
    item.subtotal = money(Number(item.preco) * Number(item.qty));
    return sum + item.subtotal;
  }, 0));
  const descVal = money(subtotal * (desc / 100)), base = money(subtotal - descVal);
  const exemptionInput = $('pdvMotivoIsencao');
  const exemptionReason = exemptionInput ? exemptionInput.value.trim() : '';
  const exemptionGroup = $('pdvMotivoIsencaoGroup');
  if (exemptionGroup) exemptionGroup.style.display = regime === 'isento' ? 'block' : 'none';
  let taxResult, fiscalError = '';
  try {
    taxResult = window.KanawaAngolaTax.calculate({ base, regime, applyVat: aplicarIVA, exemptionReason });
  } catch (taxError) {
    fiscalError = taxError.message || 'Configuração fiscal inválida.';
    taxResult = { vatAmount: 0, exemptionReason: '' };
  }
  const taxErrorBox = $('pdvTaxError');
  if (taxErrorBox) { taxErrorBox.textContent = fiscalError; taxErrorBox.style.display = fiscalError ? 'block' : 'none'; }
  const iva = money(taxResult.vatAmount), total = money(base + iva);
  pdvState.exemptionReason = taxResult.exemptionReason || '';
  const isCredit = ['credito', 'crédito', 'credit'].includes(String(pdvState.pagamento).toLowerCase());
  const vRec = recebidoInput === 0 && !isCredit ? total : money(recebidoInput);
  const troco = money(Math.max(0, vRec - total)), faltam = money(Math.max(0, total - vRec));
  pdvState.valorRecebido = vRec;
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set('pdvCalcSubtotal', fmt(subtotal)); set('pdvCalcDesconto', '-' + fmt(descVal)); set('pdvCalcBase', fmt(base)); set('pdvCalcIVA', fmt(iva)); set('pdvCalcTotal', fmt(total)); set('pdvTotalFinalTela5', fmt(total));
  const tb = $('pdvTrocoBox'), tv = $('pdvTrocoValue');
  if (tb && tv) {
    if (vRec > 0) {
      tb.style.display = 'block';
      tv.textContent = faltam > 0 ? 'Faltam ' + fmt(faltam) : fmt(troco);
    } else tb.style.display = 'none';
  }
  return { subtotal, descontoValor: descVal, base, iva, total, troco, faltam, fiscalError };
}
function pdvRenderResumoFinal() {
  const c = pdvAtualizarValores();
  const map = { dinheiro: 'Dinheiro', cartao: 'Cartão', transferencia: 'Transferência', multicaixa: 'Multicaixa', misto: 'Misto', credito: 'Crédito' };
  const el = $('pdvResumoFinal'); if (!el) return;
  el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
    '<div><strong style="color:var(--primary)">👤 Cliente</strong><div>' + esc(pdvState.cliente.nome) + '</div>' +
    (pdvState.cliente.nif ? '<div style="font-size:.8rem;color:var(--text-muted)">NIF: ' + esc(pdvState.cliente.nif) + '</div>' : '') + '</div>' +
    '<div><strong style="color:var(--primary)">💳 Pagamento</strong><div>' + (map[pdvState.pagamento] || '') + '</div><div style="font-size:.8rem;color:var(--text-muted)">Regime: ' + pdvState.regime + '</div></div></div>' +
    '<hr style="border:1px dashed var(--border);margin:12px 0">' +
    '<div style="font-size:.88rem">' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Itens:</span><span>' + pdvState.carrinho.length + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Subtotal:</span><span>' + fmt(c.subtotal) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Desconto (' + pdvState.desconto + '%):</span><span>-' + fmt(c.descontoValor) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Imposto:</span><span>' + fmt(c.iva) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:1.2rem;font-weight:800;border-top:2px solid var(--border);margin-top:6px"><span>TOTAL LÍQUIDO:</span><span style="color:var(--secondary)">' + fmt(c.total) + '</span></div>' +
    '<div style="padding:6px 0;font-size:.75rem;color:var(--text-muted);font-style:italic">' + numeroPorExtenso(c.total) + '</div>' +
    (pdvState.valorRecebido > 0 ? '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Recebido:</span><span>' + fmt(pdvState.valorRecebido) + '</span></div><div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--success);font-weight:700"><span>Troco:</span><span>' + fmt(c.troco) + '</span></div>' : '') + '</div>';
}
function pdvCancelarVenda() { if (!confirm('Cancelar esta venda?')) return; pdvState.carrinho = []; pdvState.cliente = { nome: 'Cliente Anônimo', nif: '', telefone: '' }; pdvState.desconto = 0; pdvState.valorRecebido = 0; toast('Venda cancelada', 'info'); openModule('pdv'); }
async function pdvSalvarRascunho() { await saveData('vendas', Object.assign(copy(pdvState), { status: 'rascunho', data: now() })); toast('📝 Rascunho salvo', 'success'); }
async function pdvSalvarOrcamento() { const c = pdvAtualizarValores(); await saveData('orcamentos', Object.assign(copy(pdvState), { total: c.total, status: 'pendente', data: now() })); toast('📄 Orçamento gerado', 'success'); }
async function pdvFinalizarVenda(modo) {
  modo = modo || 'finalizada';
  if (!pdvState.carrinho.length) { toast('Carrinho vazio', 'warning'); return; }
  try {
    const latestProducts = await pdvAtualizarStockLocal();
    pdvValidarStockCarrinho(latestProducts);
  } catch (stockError) {
    toast('Venda bloqueada: ' + (stockError.message || 'não foi possível confirmar o stock.'), 'error');
    return;
  }
  const c = pdvAtualizarValores();
  if (c.fiscalError) { toast('Venda bloqueada: ' + c.fiscalError, 'error'); return; }
  const isCreditPayment = ['credito', 'crédito', 'credit'].includes(String(pdvState.pagamento).toLowerCase());
  if (!isCreditPayment && c.faltam > 0) {
    toast('Pagamento insuficiente. Falta receber ' + fmt(c.faltam) + '.', 'warning');
    return;
  }
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const user = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
  const numeroFatura = 'FT-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
  const venda = { numeroFatura, clienteNome: pdvState.cliente.nome, clienteNif: pdvState.cliente.nif, clienteTelefone: pdvState.cliente.telefone, itens: pdvState.carrinho.map(i => ({ id: i.id, nome: i.nome, preco: i.preco, qty: i.qty, subtotal: i.subtotal })), subtotal: c.subtotal, desconto: pdvState.desconto, descontoValor: c.descontoValor, iva: c.iva, total: c.total, valorRecebido: pdvState.valorRecebido, troco: c.troco, pagamento: pdvState.pagamento, regime: pdvState.regime, aplicarIVA: pdvState.aplicarIVA, observacoes: pdvState.observacoes, status: modo, data: now(), operador: user.nome || 'Admin', empresa: emp };
  try { await saveData('vendas', venda); }
  catch (saleError) { toast('Venda não finalizada no servidor: ' + (saleError.message || 'verifique licença e stock'), 'error'); return; }
  if (window.KanawaCloud && KanawaCloud.ready) {
    // ks_finalize_sale already decremented the normalized stock atomically.
    // Refresh its authoritative balance; never write a stale client-side quantity back.
    try { await pdvAtualizarStockLocal(); } catch (stockRefreshError) { console.warn('Stock confirmado no servidor; atualização visual pendente:', stockRefreshError); pdvCache.ts = 0; }
  } else {
    for (const item of pdvState.carrinho) {
      const product = await DB.get('produtos', item.id);
      if (product) { product.estoque = Math.max(0, Number(product.estoque || 0) - Number(item.qty)); await DB.put('produtos', product); }
    }
  }
  for (const item of pdvState.carrinho) {
    const saldoAnterior = Number(item.stockAvailable);
    const saldoFinal = Number.isFinite(saldoAnterior) ? Math.max(0, saldoAnterior - Number(item.qty)) : null;
    await saveData('movimentacoesEstoque', {
      tipo: 'saida', produtoId: item.id, produtoNome: item.nome, qtd: Number(item.qty),
      saldoAnterior: saldoAnterior, saldoFinal: saldoFinal, delta: -Number(item.qty),
      descricao: 'Venda ' + numeroFatura, referencia: numeroFatura, origem: 'pdv',
      data: now(), auditavel: true
    });
  }
  if (pdvState.pagamento === 'credito') await saveData('contasReceber', { cliente: pdvState.cliente.nome, valor: c.total, descricao: 'Venda ' + numeroFatura, vencimento: new Date(Date.now() + 30 * 86400000).toISOString(), status: 'pendente', data: now() });
  await criarNotificacao('Nova Venda', numeroFatura + ' - ' + fmt(c.total), 'success', 'vendas');
  toast('✅ Venda ' + numeroFatura + ': ' + fmt(c.total), 'success');
  abrirFatura(venda); abrirGavetaAutomatico(); pdvCache.ts = 0;
  pdvState.carrinho = []; pdvState.cliente = { nome: 'Cliente Anônimo', nif: '', telefone: '' }; pdvState.desconto = 0; pdvState.valorRecebido = 0;
}
function filtrarPDV(termo) {
  const t = (termo || '').toLowerCase().trim(); const grid = $('pdvProductsGrid'); if (!grid) return;
  const filt = pdvCache.produtos.filter(p => (p.nome || '').toLowerCase().indexOf(t) !== -1 || (p.codigoBarras || '').indexOf(t) !== -1 || (p.codigo || '').toLowerCase().indexOf(t) !== -1);
  grid.innerHTML = renderGridProdutos(filt, pdvCache.favoritos);
}
function toggleFavorito(id, el) { const favs = pdvCache.favoritos; const i = favs.indexOf(id); if (i > -1) { favs.splice(i, 1); el.classList.remove('active'); } else { favs.push(id); el.classList.add('active'); } localStorage.setItem('kanawa_favoritos', JSON.stringify(favs)); }

/* ====== SCANNER ====== */
async function abrirScanner(cb) {
  scannerCallback = cb || null;
  const modal = $('scannerModal'); if (modal) modal.classList.add('active');
  const el = $('scannerReader');
  if (el) el.innerHTML = '<div style="text-align:center;padding:40px;color:#fff"><i class="fas fa-spinner fa-spin" style="font-size:2.5rem"></i><p style="margin-top:12px">Iniciando câmera...</p></div>';
  if (scannerActive) return;
  if (typeof Html5Qrcode === 'undefined') {
    if (el) el.innerHTML = '<div style="text-align:center;padding:30px;color:#fff"><p>Scanner indisponível. Digite o código:</p><input type="text" id="codigoManual" placeholder="Código de barras" style="padding:10px;border-radius:8px;border:none;margin-top:10px;width:80%;max-width:300px" onkeypress="if(event.key===\'Enter\'){processarCodigoLido(this.value);this.value=\'\'}"></div>';
    return;
  }
  try {
    scanner = new Html5Qrcode('scannerReader', { verbose: false });
    await scanner.start({ facingMode: 'environment' }, { fps: 15, qrbox: { width: 260, height: 260 } }, async (txt) => { await processarCodigoLido(txt); }, () => { });
    scannerActive = true; toast('📷 Câmera ativa', 'info');
  } catch (err) { if (el) el.innerHTML = '<div style="text-align:center;padding:30px;color:#fff"><i class="fas fa-exclamation-triangle" style="font-size:2.5rem;color:#f59e0b"></i><p style="margin-top:12px">Câmera indisponível</p></div>'; }
}
async function processarCodigoLido(codigo) {
  if (!codigo) return;
  try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(); const g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 1200; g.gain.value = 0.1; o.start(); setTimeout(() => { o.stop(); c.close(); }, 100); } catch (e) { }
  if (navigator.vibrate) navigator.vibrate(100);
  const produtos = await carregarCachePDV();
  const prod = produtos.find(p => p.codigoBarras === codigo || p.codigo === codigo);
  if (prod) { if (scannerCallback) { scannerCallback(prod); fecharScanner(); return; } pdvSelecionarProduto(prod.id); setTimeout(fecharScanner, 1200); }
  else { toast('⚠️ Não cadastrado: ' + codigo, 'warning'); setTimeout(() => { fecharScanner(); cadastroRapidoProduto(codigo); }, 800); }
}
function fecharScanner() { const modal = $('scannerModal'); if (modal) modal.classList.remove('active'); if (scanner && scannerActive) { scanner.stop().then(() => { scannerActive = false; scanner = null; scannerCallback = null; }).catch(() => { scannerActive = false; scanner = null; }); } }
async function buscarPorCodigo(c) { if (c) await processarCodigoLido(c); }
async function cadastroRapidoProduto(codigo) {
  openModal('⚡ Cadastro Rápido',
    '<div class="form-group"><label>Código de Barras</label><input id="rcCodigo" value="' + esc(codigo) + '" readonly style="background:var(--bg-hover)"></div>' +
    '<div class="form-group"><label>Nome *</label><input id="rcNome" autofocus></div>' +
    '<div class="form-group"><label>Preço (Kz) *</label><input id="rcPreco" type="number" step="0.01"></div>' +
    '<div class="form-group"><label>Estoque Inicial</label><input id="rcEstoque" type="number" value="0"></div>' +
    '<div class="form-group"><label>Categoria</label><input id="rcCategoria" value="Geral"></div>' +
    '<button class="btn btn-success btn-block" onclick="salvarCadastroRapido()"><i class="fas fa-save"></i> Cadastrar e Adicionar</button>');
}
async function salvarCadastroRapido() {
  const nome = $('rcNome').value.trim(); const preco = num($('rcPreco').value, 0);
  if (!nome || !preco) { toast('Preencha nome e preço', 'warning'); return; }
  const novo = { codigo: 'P' + Date.now().toString().slice(-6), codigoBarras: $('rcCodigo').value, nome, preco, estoque: int($('rcEstoque').value, 0), categoria: $('rcCategoria').value || 'Geral', dataCadastro: now() };
  const id = await saveData('produtos', novo); novo.id = id;
  pdvCache.produtos.push(novo);
  toast('✅ ' + nome + ' cadastrado', 'success');
  closeModal(); pdvSelecionarProduto(id);
}
/* ====== PRODUTOS ====== */
async function renderProdutos() {
  const produtos = await getData('produtos');
  const rows = produtos.map(p => [
    '<div style="width:44px;height:44px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="' + imgSrc(p) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'"></div>',
    esc(p.codigo || '-') + '<br><small style="color:var(--text-muted);font-family:monospace">' + esc(p.codigoBarras || '') + '</small>',
    '<strong>' + esc(p.nome) + '</strong>', esc(p.categoria || '-'), fmt(p.preco),
    badge(p.estoque || 0, (p.estoque || 0) > 0 ? 'success' : 'danger'),
    '<button class="btn btn-sm btn-primary" onclick="abrirModalProduto(' + p.id + ')"><i class="fas fa-edit"></i></button> ' +
    '<button class="btn btn-sm btn-info" onclick="imprimirEtiquetaIndividual(' + p.id + ')"><i class="fas fa-tag"></i></button> ' +
    (podeFazer('excluir') ? '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'produtos\',' + p.id + ')"><i class="fas fa-trash"></i></button>' : '')
  ]);
  return header('Produtos', produtos.length + ' produtos', 'var(--primary)',
    '<button class="btn btn-sm" onclick="exportarProdutos()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-file-export"></i> Exportar</button>' +
    '<button class="btn btn-sm" onclick="imprimirEtiquetasLote()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-tags"></i> Etiquetas</button>' +
    '<button class="btn btn-success" onclick="abrirModalProduto()"><i class="fas fa-plus"></i> Novo</button>', 'fa-boxes') +
    '<div class="card">' + table(['Img', 'Código', 'Nome', 'Categoria', 'Preço', 'Estoque', 'Ações'], rows) + '</div>';
}
async function abrirModalProduto(id) {
  const cats = await getData('categorias');
  const p = id ? (await DB.get('produtos', id)) || {} : {};
  openModal(id ? 'Editar Produto' : 'Novo Produto',
    '<div class="form-grid">' +
    '<div class="form-group"><label>Código Interno</label><input id="pCodigo" value="' + esc(p.codigo || '') + '"></div>' +
    '<div class="form-group"><label>📷 Código de Barras</label><div style="display:flex;gap:6px"><input id="pCodigoBarras" value="' + esc(p.codigoBarras || '') + '" style="flex:1"><button class="btn btn-sm btn-info" onclick="abrirScanner(function(prod){document.getElementById(\'pCodigoBarras\').value=prod.codigoBarras})"><i class="fas fa-camera"></i></button></div></div>' +
    '<div class="form-group full"><label>Nome *</label><input id="pNome" value="' + esc(p.nome || '') + '"></div>' +
    '<div class="form-group"><label>Categoria</label><select id="pCategoria"><option value="">Selecione...</option>' + cats.map(c => '<option value="' + esc(c.nome) + '" ' + (p.categoria === c.nome ? 'selected' : '') + '>' + esc(c.nome) + '</option>').join('') + '<option value="Geral" ' + (p.categoria === 'Geral' ? 'selected' : '') + '>Geral</option></select></div>' +
    '<div class="form-group"><label>Preço (Kz) *</label><input id="pPreco" type="number" step="0.01" value="' + (p.preco || 0) + '"></div>' +
    '<div class="form-group"><label>Estoque</label><input id="pEstoque" type="number" value="' + (p.estoque || 0) + '"></div>' +
    '<div class="form-group"><label>Estoque Mínimo</label><input id="pEstoqueMin" type="number" value="' + (p.estoqueMin || 10) + '"></div>' +
    '<div class="form-group"><label>Unidade</label><select id="pUnidade">' + ['UN', 'KG', 'L', 'M'].map(u => '<option value="' + u + '" ' + (p.unidade === u ? 'selected' : '') + '>' + u + '</option>').join('') + '</select></div>' +
    '<div class="form-group full"><label>🖼️ Imagem do Produto</label>' +
    '<div class="image-picker" onclick="document.getElementById(\'pImagemInput\').click()">' +
    '<div class="placeholder" id="pImagemPlaceholder" style="' + (p.imagem ? 'display:none' : '') + '"><i class="fas fa-image"></i><span style="font-size:.85rem">Clique para escolher do dispositivo</span></div>' +
    '<img id="pImagemPreview" src="' + (p.imagem || '') + '" style="' + (p.imagem ? '' : 'display:none') + '" onerror="this.style.display=\'none\'"></div>' +
    '<input type="file" id="pImagemInput" accept="image/*" style="display:none" onchange="escolherImagemProduto(this)">' +
    '<input type="hidden" id="pImagem" value="' + esc(p.imagem || '') + '">' +
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
    '<button class="btn btn-sm btn-secondary" type="button" onclick="document.getElementById(\'pImagemInput\').click()"><i class="fas fa-folder-open"></i> Escolher</button>' +
    '<button class="btn btn-sm btn-danger" type="button" onclick="removerImagemProduto()"><i class="fas fa-trash"></i> Remover</button></div></div>' +
    '<div class="form-group full"><label>Descrição</label><textarea id="pDesc" rows="2">' + esc(p.descricao || '') + '</textarea></div></div>' +
    '<button class="btn btn-primary btn-block btn-lg" style="margin-top:16px" onclick="salvarProduto(' + (id || 'null') + ')"><i class="fas fa-save"></i> Salvar</button>', true);
}
function escolherImagemProduto(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast('Imagem muito grande (máx 3MB)', 'warning'); return; }
  const reader = new FileReader();
  reader.onload = (e) => { const url = e.target.result; const inp = $('pImagem'); if (inp) inp.value = url; const prev = $('pImagemPreview'); const ph = $('pImagemPlaceholder'); if (prev) { prev.src = url; prev.style.display = 'block'; } if (ph) ph.style.display = 'none'; toast('✅ Imagem carregada', 'success'); };
  reader.readAsDataURL(file);
}
function removerImagemProduto() { const inp = $('pImagem'); if (inp) inp.value = ''; const prev = $('pImagemPreview'); const ph = $('pImagemPlaceholder'); if (prev) { prev.src = ''; prev.style.display = 'none'; } if (ph) ph.style.display = 'block'; }
async function salvarProduto(id) {
  const nome = $('pNome').value.trim();
  if (!nome) { toast('Informe o nome', 'warning'); return; }
  const data = { codigo: $('pCodigo').value, codigoBarras: $('pCodigoBarras').value, nome, categoria: $('pCategoria').value, preco: num($('pPreco').value, 0), estoque: int($('pEstoque').value, 0), estoqueMin: int($('pEstoqueMin').value, 10), unidade: $('pUnidade').value, imagem: $('pImagem').value, descricao: $('pDesc').value };
  if (id) data.id = id;
  await saveData('produtos', data);
  pdvCache.ts = 0;
  toast(id ? 'Atualizado' : 'Cadastrado', 'success');
  closeModal(); openModule('produtos');
}
async function excluirProduto(id) { if (!podeFazer('excluir')) { toast('Sem permissão', 'error'); return; } if (!confirm('Excluir produto?')) return; await deleteData('produtos', id); pdvCache.ts = 0; toast('Excluído', 'info'); openModule('produtos'); }
async function exportarProdutos() {
  if (typeof XLSX === 'undefined') { toast('Excel indisponível', 'warning'); return; }
  const data = await getData('produtos');
  const ws = XLSX.utils.json_to_sheet(data.map(p => ({ codigo: p.codigo, codigoBarras: p.codigoBarras, nome: p.nome, categoria: p.categoria, preco: p.preco, estoque: p.estoque, unidade: p.unidade })));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Produtos'); XLSX.writeFile(wb, 'produtos_' + Date.now() + '.xlsx');
  toast('📤 Exportado', 'success');
}
function abrirModalImportar() {
  openModal('Importar Produtos',
    '<p style="color:var(--text-muted);margin-bottom:12px">Colunas: codigo, codigoBarras, nome, categoria, preco, estoque, unidade</p>' +
    '<div class="form-group"><input type="file" id="importFile" accept=".xlsx,.xls,.csv" style="padding:10px"></div>' +
    '<button class="btn btn-primary btn-block" onclick="importarProdutos()"><i class="fas fa-upload"></i> Importar</button>');
}
async function importarProdutos() {
  if (typeof XLSX === 'undefined') { toast('Excel indisponível', 'warning'); return; }
  const f = $('importFile').files[0]; if (!f) { toast('Selecione arquivo', 'warning'); return; }
  const r = new FileReader();
  r.onload = async (e) => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let c = 0;
      for (const row of rows) { await saveData('produtos', { codigo: row.codigo || '', codigoBarras: row.codigoBarras || '', nome: row.nome || '', categoria: row.categoria || 'Geral', preco: num(row.preco, 0), estoque: int(row.estoque, 0), unidade: row.unidade || 'UN' }); c++; }
      pdvCache.ts = 0; toast('✅ ' + c + ' produtos importados', 'success'); closeModal(); openModule('produtos');
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
  };
  r.readAsArrayBuffer(f);
}

/* ====== ETIQUETAS ====== */
async function imprimirEtiquetaIndividual(id) {
  const p = await DB.get('produtos', id); if (!p) return;
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  openModal('🏷️ Etiqueta',
    '<div id="etiquetaContainer" style="text-align:center;background:#fff;padding:20px;border-radius:10px">' +
    '<div class="etiqueta-print" style="margin:0 auto">' +
    '<div style="font-size:12px;font-weight:bold;color:#1a3a5c">' + esc(emp.firma || emp.nome || 'KANAWA SOFT') + '</div>' +
    '<div style="font-size:10px;margin:3px 0;color:#555">' + esc(p.categoria || 'Geral') + '</div>' +
    '<hr style="border-top:1px solid #000">' +
    '<div style="font-size:13px;font-weight:bold;margin:5px 0">' + esc(p.nome) + '</div>' +
    '<div style="font-size:11px;font-family:monospace;margin:5px 0">' + esc(p.codigo || '') + '</div>' +
    (p.codigoBarras ? '<canvas id="barcodeEtq" style="max-width:240px"></canvas>' : '') +
    '<div style="font-size:20px;font-weight:800;color:#217346;margin-top:6px">' + fmt(p.preco) + '</div>' +
    '<div style="font-size:9px;color:#777;margin-top:3px">' + new Date().toLocaleDateString('pt-AO') + '</div></div></div>' +
    '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">' +
    '<button class="btn btn-success" onclick="imprimirEtiquetaHTML()"><i class="fas fa-print"></i> Imprimir</button>' +
    '<button class="btn btn-info" onclick="baixarEtiquetaPDF()"><i class="fas fa-file-pdf"></i> PDF</button>' +
    '<button class="btn btn-secondary" onclick="closeModal()">Fechar</button></div>');
  if (p.codigoBarras && window.JsBarcode) setTimeout(() => { try { JsBarcode('#barcodeEtq', p.codigoBarras, { format: 'CODE128', width: 2, height: 50, displayValue: true, fontSize: 12 }); } catch (e) { } }, 100);
}
async function imprimirEtiquetasLote() {
  const produtos = await carregarCachePDV();
  if (!produtos.length) { toast('Sem produtos', 'warning'); return; }
  openModal('🏷️ Impressão em Lote',
    '<div class="form-group"><label><input type="checkbox" id="loteTodos" onchange="document.querySelectorAll(\'.lote-produto\').forEach(c=>c.checked=this.checked)" checked> Selecionar todos (' + produtos.length + ')</label></div>' +
    '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);padding:10px;border-radius:10px">' +
    produtos.map(p => '<label style="display:block;padding:6px;border-bottom:1px solid var(--border)"><input type="checkbox" class="lote-produto" value="' + p.id + '" checked> ' + esc(p.nome) + ' - ' + fmt(p.preco) + '</label>').join('') + '</div>' +
    '<div class="form-group" style="margin-top:12px"><label>Cópias por produto</label><input type="number" id="loteQtd" value="1" min="1" max="100"></div>' +
    '<button class="btn btn-primary btn-block" onclick="gerarLoteEtiquetas()"><i class="fas fa-print"></i> Gerar</button>', true);
}
async function gerarLoteEtiquetas() {
  const ids = Array.from($$('.lote-produto:checked')).map(c => parseInt(c.value));
  const qtd = int($('loteQtd').value, 1);
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  if (!ids.length) { toast('Selecione produtos', 'warning'); return; }
  let html = '';
  for (const id of ids) {
    const p = await DB.get('produtos', id); if (!p) continue;
    for (let i = 0; i < qtd; i++) {
      html += '<div class="etiqueta-print"><div style="font-size:12px;font-weight:bold;color:#1a3a5c">' + esc(emp.firma || emp.nome || 'KANAWA SOFT') + '</div>' +
        '<div style="font-size:10px;margin:3px 0;color:#555">' + esc(p.categoria || 'Geral') + '</div>' +
        '<hr style="border-top:1px solid #000"><div style="font-size:13px;font-weight:bold;margin:5px 0">' + esc(p.nome) + '</div>' +
        '<div style="font-size:11px;font-family:monospace;margin:5px 0">' + esc(p.codigo || '') + '</div>' +
        '<div style="font-size:11px;font-family:monospace;margin:5px 0">' + esc(p.codigoBarras || '') + '</div>' +
        '<div style="font-size:20px;font-weight:800;color:#217346;margin-top:6px">' + fmt(p.preco) + '</div></div>';
    }
  }
  const w = window.open('', '_blank');
  w.document.write('<html><head><title>Etiquetas</title><style>body{font-family:Arial;margin:0;padding:10px}@media print{.etiqueta-print{page-break-inside:avoid}}</style></head><body>' + html + '</body></html>');
  w.document.close(); setTimeout(() => w.print(), 400);
  toast('✅ ' + (ids.length * qtd) + ' etiquetas geradas', 'success'); closeModal();
}
function imprimirEtiquetaHTML() { const el = $('etiquetaContainer'); if (!el) return; const w = window.open('', '_blank'); w.document.write('<html><head><title>Etiqueta</title></head><body style="font-family:Arial;text-align:center">' + el.innerHTML + '</body></html>'); w.document.close(); setTimeout(() => w.print(), 400); }
async function baixarEtiquetaPDF() {
  const el = $('etiquetaContainer'); if (!el) return;
  if (!window.jspdf) { toast('PDF indisponível', 'warning'); return; }
  const { jsPDF } = window.jspdf; const d = new jsPDF('p', 'mm', 'a4');
  d.html(el, { callback: x => { x.save('etiqueta_' + Date.now() + '.pdf'); toast('PDF gerado', 'success'); }, x: 10, y: 10, width: 190 });
}

/* ====== CATEGORIAS ====== */
async function renderCategorias() {
  const cats = await getData('categorias');
  const rows = cats.map(c => [c.id, '<strong>' + esc(c.nome) + '</strong>', esc(c.descricao || '-'),
    '<button class="btn btn-sm btn-primary" onclick="editarCategoria(' + c.id + ')"><i class="fas fa-edit"></i></button> ' +
    (podeFazer('excluir') ? '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'categorias\',' + c.id + ')"><i class="fas fa-trash"></i></button>' : '')]);
  return header('Categorias', cats.length + ' categorias', 'var(--info)', '<button class="btn btn-success" onclick="abrirModalCategoria()"><i class="fas fa-plus"></i> Nova</button>', 'fa-tags') + '<div class="card">' + table(['#', 'Nome', 'Descrição', 'Ações'], rows) + '</div>';
}
function abrirModalCategoria() { openModal('Nova Categoria', '<div class="form-group"><label>Nome *</label><input id="catNome"></div><div class="form-group"><label>Descrição</label><textarea id="catDesc" rows="2"></textarea></div><button class="btn btn-primary btn-block" onclick="salvarCategoria()">Salvar</button>'); }
async function salvarCategoria() { const n = $('catNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('categorias', { nome: n, descricao: $('catDesc').value }); toast('Criada', 'success'); closeModal(); openModule('categorias'); }
async function editarCategoria(id) { const c = await DB.get('categorias', id); if (!c) return; openModal('Editar Categoria', '<div class="form-group"><label>Nome</label><input id="catENome" value="' + esc(c.nome) + '"></div><div class="form-group"><label>Descrição</label><textarea id="catEDesc" rows="2">' + esc(c.descricao || '') + '</textarea></div><button class="btn btn-primary btn-block" onclick="salvarEditCategoria(' + id + ')">Salvar</button>'); }
async function salvarEditCategoria(id) { const c = await DB.get('categorias', id); c.nome = $('catENome').value; c.descricao = $('catEDesc').value; await saveData('categorias', c); toast('Atualizada', 'success'); closeModal(); openModule('categorias'); }

/* ====== CLIENTES ====== */
async function renderClientes() {
  const cli = await getData('clientes');
  const rows = cli.map(c => [c.id, '<strong>' + esc(c.nome) + '</strong>', esc(c.nif || '-'), esc(c.telefone || '-'), esc(c.email || '-'),
    (podeFazer('excluir') ? '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'clientes\',' + c.id + ')"><i class="fas fa-trash"></i></button>' : '')]);
  return header('Clientes', cli.length + ' clientes', 'var(--info)', '<button class="btn btn-success" onclick="abrirModalCliente()"><i class="fas fa-plus"></i> Novo</button>', 'fa-users') + '<div class="card">' + table(['#', 'Nome', 'NIF', 'Telefone', 'Email', 'Ações'], rows) + '</div>';
}
function abrirModalCliente() { openModal('Novo Cliente', '<div class="form-group"><label>Nome *</label><input id="cliNome"></div><div class="form-group"><label>NIF</label><input id="cliNif"></div><div class="form-group"><label>Telefone</label><input id="cliTel"></div><div class="form-group"><label>Email</label><input id="cliEmail" type="email"></div><button class="btn btn-primary btn-block" onclick="salvarClienteModal()">Salvar</button>'); }
async function salvarClienteModal() { const n = $('cliNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('clientes', { nome: n, nif: $('cliNif').value, telefone: $('cliTel').value, email: $('cliEmail').value, dataCadastro: now() }); toast('Cadastrado', 'success'); closeModal(); openModule('clientes'); }
function abrirModalPDVCliente() { openModal('Novo Cliente', '<div class="form-group"><label>Nome *</label><input id="novoCliNome" autofocus></div><div class="form-group"><label>NIF</label><input id="novoCliNif"></div><div class="form-group"><label>Telefone</label><input id="novoCliTel"></div><button class="btn btn-primary btn-block" onclick="salvarNovoClientePDV()">Salvar</button>'); }
async function salvarNovoClientePDV() {
  const n = $('novoCliNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; }
  const c = { nome: n, nif: $('novoCliNif').value, telefone: $('novoCliTel').value, dataCadastro: now() };
  await saveData('clientes', c);
  if ($('pdvClienteNome')) { $('pdvClienteNome').value = n; $('pdvClienteNif').value = c.nif; $('pdvClienteTel').value = c.telefone; }
  pdvState.cliente = { nome: n, nif: c.nif, telefone: c.telefone };
  toast('Cliente cadastrado', 'success'); closeModal();
}

/* ====== FORNECEDORES ====== */
async function renderFornecedores() {
  const f = await getData('fornecedores');
  const rows = f.map(x => [x.id, '<strong>' + esc(x.nome) + '</strong>', esc(x.nif || '-'), esc(x.telefone || '-'), (podeFazer('excluir') ? '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'fornecedores\',' + x.id + ')"><i class="fas fa-trash"></i></button>' : '')]);
  return header('Fornecedores', f.length + ' fornecedores', 'var(--warning)', '<button class="btn btn-success" onclick="abrirModalFornecedor()"><i class="fas fa-plus"></i> Novo</button>', 'fa-truck') + '<div class="card">' + table(['#', 'Nome', 'NIF', 'Telefone', 'Ações'], rows) + '</div>';
}
function abrirModalFornecedor() { openModal('Novo Fornecedor', '<div class="form-group"><label>Nome *</label><input id="fNome"></div><div class="form-group"><label>NIF</label><input id="fNif"></div><div class="form-group"><label>Telefone</label><input id="fTel"></div><div class="form-group"><label>Email</label><input id="fEmail" type="email"></div><button class="btn btn-primary btn-block" onclick="salvarFornecedor()">Salvar</button>'); }
async function salvarFornecedor() { const n = $('fNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('fornecedores', { nome: n, nif: $('fNif').value, telefone: $('fTel').value, email: $('fEmail').value }); toast('Cadastrado', 'success'); closeModal(); openModule('fornecedores'); }

/* ====== TRANSPORTADORAS ====== */
async function renderTransportadoras() {
  const t = await getData('transportadoras');
  const rows = t.map(x => [x.id, '<strong>' + esc(x.nome) + '</strong>', esc(x.telefone || '-'), fmt(x.custoBase), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'transportadoras\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Transportadoras', t.length + ' transportadoras', 'var(--info)', '<button class="btn btn-success" onclick="abrirModalTransportadora()"><i class="fas fa-plus"></i> Nova</button>', 'fa-shipping-fast') + '<div class="card">' + table(['#', 'Nome', 'Telefone', 'Custo Base', 'Ações'], rows) + '</div>';
}
function abrirModalTransportadora() { openModal('Nova Transportadora', '<div class="form-group"><label>Nome *</label><input id="tNome"></div><div class="form-group"><label>Telefone</label><input id="tTel"></div><div class="form-group"><label>Custo Base (Kz)</label><input id="tCusto" type="number" value="0"></div><button class="btn btn-primary btn-block" onclick="salvarTransportadora()">Salvar</button>'); }
async function salvarTransportadora() { const n = $('tNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('transportadoras', { nome: n, telefone: $('tTel').value, custoBase: num($('tCusto').value, 0) }); toast('Cadastrada', 'success'); closeModal(); openModule('transportadoras'); }

/* ====== ESTOQUE / MOVIMENTOS AUDITÁVEIS ====== */
async function renderEstoque() {
  const produtos = await getData('produtos');
  const movimentos = await getData('movimentacoesEstoque');
  const total = produtos.reduce((sum, p) => sum + Math.max(0, Number(p.estoque) || 0), 0);
  const estados = produtos.map(p => window.KanawaStock.classify(p.estoque || 0, p.estoqueMin || 0));
  const baixos = estados.filter(x => x === 'baixo').length;
  const esgotados = estados.filter(x => x === 'esgotado').length;
  const podeMovimentar = podeFazer('editar', 'estoque');
  const linhas = produtos.map(p => {
    const saldo = Number(p.estoque) || 0, minimo = Number(p.estoqueMin) || 0;
    const estado = window.KanawaStock.classify(saldo, minimo);
    const status = estado === 'normal' ? badge('Normal', 'success') : estado === 'baixo' ? badge('Stock baixo', 'warning') : badge('Esgotado', 'danger');
    const acoes = podeMovimentar
      ? '<button class="btn btn-sm btn-success" title="Entrada de uma unidade" onclick="ajustarEstoque(' + p.id + ',1)"><i class="fas fa-plus"></i></button> ' +
        '<button class="btn btn-sm btn-danger" title="Saída de uma unidade" onclick="ajustarEstoque(' + p.id + ',-1)" ' + (saldo <= 0 ? 'disabled' : '') + '><i class="fas fa-minus"></i></button>'
      : '<span class="text-muted">Sem permissão</span>';
    return ['<strong>' + esc(p.nome) + '</strong><br><small>' + esc(p.codigoBarras || p.codigo || '') + '</small>', fmtN(saldo) + ' ' + esc(p.unidade || 'UN'), fmtN(minimo), status, acoes];
  });
  const ultimos = movimentos.slice().sort((x,y) => String(y.data || '').localeCompare(String(x.data || ''))).slice(0,50);
  const movLinhas = ultimos.map(m => [
    fmtDT(m.data), badge(m.tipo, m.tipo === 'entrada' ? 'success' : m.tipo === 'saida' ? 'danger' : 'info'),
    esc(m.produtoNome || m.descricao || '—'), fmtN(m.qtd || 0),
    m.saldoAnterior == null ? '—' : fmtN(m.saldoAnterior),
    m.saldoFinal == null ? '—' : fmtN(m.saldoFinal),
    esc(m.operador || '—'), esc(m.referencia || m.descricao || '—')
  ]);
  return header('Stock e Inventário', produtos.length + ' produtos registados', 'var(--info)',
    (podeMovimentar ? '<button class="btn btn-sm btn-success" onclick="abrirMovEstoque(\'entrada\')"><i class="fas fa-arrow-down"></i> Entrada</button>' +
    '<button class="btn btn-sm btn-danger" onclick="abrirMovEstoque(\'saida\')"><i class="fas fa-arrow-up"></i> Saída</button>' +
    '<button class="btn btn-sm btn-warning" onclick="abrirMovEstoque(\'ajuste\')"><i class="fas fa-balance-scale"></i> Inventário / Ajuste</button>' : ''), 'fa-warehouse') +
    '<div class="metric-grid"><div class="metric-card"><div class="label">Unidades em stock</div><div class="value">' + fmtN(total) + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">Stock normal</div><div class="value">' + (produtos.length - baixos - esgotados) + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--warning)"><div class="label">Stock baixo</div><div class="value">' + baixos + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--danger)"><div class="label">Esgotados</div><div class="value">' + esgotados + '</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-boxes"></i> Saldo por produto</h3></div>' + table(['Produto / Código', 'Disponível', 'Mínimo', 'Estado', 'Ações'], linhas) + '</div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-history"></i> Livro de movimentos (últimos 50)</h3></div>' +
    table(['Data', 'Tipo', 'Produto', 'Qtd', 'Saldo anterior', 'Saldo final', 'Operador', 'Referência / Motivo'], movLinhas) + '</div>';
}
async function gravarMovimentoStock(produtoId, tipo, quantidade, motivo, referencia, origem) {
  if (!podeFazer('editar', 'estoque')) throw new Error('Não tem permissão para movimentar stock.');
  if (!window.KanawaStock) throw new Error('Módulo de stock não carregado.');
  const actor = JSON.parse(localStorage.getItem('kanawa_user') || '{}');
  const tx = DB.db.transaction(['produtos','movimentacoesEstoque','_sync_queue'], 'readwrite');
  const productsStore = tx.objectStore('produtos');
  const movementStore = tx.objectStore('movimentacoesEstoque');
  const queueStore = tx.objectStore('_sync_queue');
  let movimento = null, failure = null;
  const request = productsStore.get(produtoId);
  request.onsuccess = () => {
    try {
      const produto = request.result;
      if (!produto) throw new Error('Produto não encontrado.');
      const movimentoNovo = window.KanawaStock.createMovement({
        productId: produto.id, productName: produto.nome, before: Number(produto.estoque) || 0,
        type: tipo, quantity: quantidade, reason: motivo,
        reference: referencia || null, actor: actor.nome || actor.email || 'Utilizador',
        source: origem || 'manual'
      });
      const atualizado = Object.assign({}, produto, { estoque: movimentoNovo.saldoFinal, stock_quantity: movimentoNovo.saldoFinal });
      const movementId = nextGeneratedRecordId();
      movimentoNovo.id = movementId;
      productsStore.put(atualizado);
      movementStore.add(movimentoNovo);
      // Persist the balance, audit event, and ordered sync queue atomically on this device.
      queueStore.add({ entity: 'produtos', action: 'update', payload: atualizado, options: { stockMovementId: movementId }, data: now(), synced: false });
      queueStore.add({ entity: 'movimentacoesEstoque', action: 'create', payload: movimentoNovo, options: { stockMovementId: movementId }, data: now(), synced: false });
      movimento = movimentoNovo;
    } catch (error) {
      failure = error;
      try { tx.abort(); } catch (abortError) { }
    }
  };
  request.onerror = () => { failure = request.error || new Error('Não foi possível ler o produto.'); };
  return await new Promise((resolve, reject) => {
    tx.oncomplete = () => { pdvCache.ts = 0; resolve(movimento); };
    tx.onerror = () => reject(failure || tx.error || new Error('Falha ao gravar movimento de stock.'));
    tx.onabort = () => reject(failure || tx.error || new Error('Movimento cancelado.'));
  });
}
async function ajustarEstoque(id, delta) {
  try {
    const tipo = Number(delta) > 0 ? 'entrada' : 'saida';
    await gravarMovimentoStock(id, tipo, Math.abs(Number(delta)), 'Ajuste rápido de stock', null, 'ajuste_rapido');
    toast('Stock atualizado e movimento registado.', 'success');
    await openModule('estoque');
  } catch (error) { toast(error.message || 'Não foi possível ajustar o stock.', 'error'); }
}
async function abrirMovEstoque(tipo) {
  const produtos = await DB.getAll('produtos');
  if (!produtos.length) { toast('Cadastre primeiro um produto.', 'warning'); return; }
  openModal(tipo === 'ajuste' ? 'Contagem física / Ajuste de inventário' : (tipo === 'entrada' ? 'Entrada de stock' : 'Saída de stock'),
    '<div class="form-group"><label>Produto *</label><select id="movProd">' + produtos.map(p => '<option value="' + p.id + '">' + esc(p.nome) + ' (Disponível: ' + (Number(p.estoque) || 0) + ')</option>').join('') + '</select></div>' +
    '<div class="form-group"><label>' + (tipo === 'ajuste' ? 'Quantidade contada fisicamente *' : 'Quantidade *') + '</label><input id="movQtd" type="number" value="1" min="0" step="1"></div>' +
    '<div class="form-group"><label>Motivo / documento de suporte *</label><input id="movObs" maxlength="180" placeholder="Ex.: compra, devolução, quebra, contagem física"></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarMov(\'' + tipo + '\')">Confirmar movimento</button>');
}
async function salvarMov(tipo) {
  try {
    const produtoId = Number($('movProd').value);
    const quantidade = Number($('movQtd').value);
    const motivo = $('movObs').value.trim();
    if (!motivo) throw new Error('Informe o motivo ou documento de suporte.');
    const movimento = await gravarMovimentoStock(produtoId, tipo, quantidade, motivo, null, tipo);
    toast('Movimento registado. Saldo final: ' + fmtN(movimento.saldoFinal) + '.', 'success');
    closeModal(); await openModule('estoque');
  } catch (error) { toast(error.message || 'Falha ao registar movimento.', 'error'); }
}

/* ====== COMPRAS ====== */
async function renderCompras() {
  const c = await getData('compras');
  const rows = c.slice().reverse().map(x => ['#' + x.id, esc(x.fornecedor || '-'), esc(x.produto || '-'), x.quantidade || 0, '<strong>' + fmt(x.valor) + '</strong>', fmtDT(x.data),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'compras\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Compras', c.length + ' compras', 'var(--warning)', '<button class="btn btn-success" onclick="abrirModalCompra()"><i class="fas fa-plus"></i> Nova</button>', 'fa-shopping-bag') + '<div class="card">' + table(['#', 'Fornecedor', 'Produto', 'Qtd', 'Valor', 'Data', 'Ações'], rows) + '</div>';
}
function abrirModalCompra() {
  DB.getAll('fornecedores').then(fs => {
    openModal('Nova Compra',
      '<div class="form-grid"><div class="form-group full"><label>Fornecedor</label><select id="cForn"><option value="">Selecione...</option>' + fs.map(f => '<option value="' + esc(f.nome) + '">' + esc(f.nome) + '</option>').join('') + '</select></div>' +
      '<div class="form-group full"><label>Produto</label><input id="cProd"></div>' +
      '<div class="form-group"><label>Qtd</label><input id="cQtd" type="number" value="1"></div>' +
      '<div class="form-group"><label>Valor</label><input id="cValor" type="number" value="0"></div></div>' +
      '<button class="btn btn-primary btn-block" onclick="salvarCompra()">Salvar</button>');
  });
}
async function salvarCompra() {
  const f = $('cForn').value; const p = $('cProd').value.trim();
  if (!p) { toast('Informe produto', 'warning'); return; }
  const q = int($('cQtd').value, 1); const v = num($('cValor').value, 0);
  await saveData('compras', { fornecedor: f, produto: p, quantidade: q, valor: v, data: now(), status: 'pendente' });
  const prods = await getData('produtos'); const match = prods.find(x => x.nome.toLowerCase() === p.toLowerCase());
  if (match) { match.estoque = (match.estoque || 0) + q; await saveData('produtos', match); pdvCache.ts = 0; }
  toast('Compra registrada', 'success'); closeModal(); openModule('compras');
}

/* ====== CRM ====== */
async function renderCRM() {
  const l = await getData('leads');
  const rows = l.map(x => [x.id, '<strong>' + esc(x.nome) + '</strong>', esc(x.telefone || '-'), esc(x.origem || '-'), badge(x.status || 'novo', 'info'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'leads\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('CRM', l.length + ' leads', 'var(--purple)', '<button class="btn btn-success" onclick="abrirModalLead()"><i class="fas fa-plus"></i> Novo Lead</button>', 'fa-handshake') + '<div class="card">' + table(['#', 'Nome', 'Telefone', 'Origem', 'Status', 'Ações'], rows) + '</div>';
}
function abrirModalLead() { openModal('Novo Lead', '<div class="form-group"><label>Nome *</label><input id="lNome"></div><div class="form-group"><label>Telefone</label><input id="lTel"></div><div class="form-group"><label>Email</label><input id="lEmail" type="email"></div><div class="form-group"><label>Origem</label><select id="lOrigem"><option>Site</option><option>WhatsApp</option><option>Facebook</option><option>Indicação</option></select></div><button class="btn btn-primary btn-block" onclick="salvarLead()">Salvar</button>'); }
async function salvarLead() { const n = $('lNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('leads', { nome: n, telefone: $('lTel').value, email: $('lEmail').value, origem: $('lOrigem').value, status: 'novo', data: now() }); toast('Lead cadastrado', 'success'); closeModal(); openModule('crm'); }

/* ====== FINANCEIRO ====== */
async function renderFinanceiro() {
  const [rec, pag] = await Promise.all([getData('contasReceber'), getData('contasPagar')]);
  const tR = rec.reduce((s, c) => s + (c.valor || 0), 0);
  const tP = pag.reduce((s, c) => s + (c.valor || 0), 0);
  const recRows = rec.slice().reverse().map(c => [esc(c.cliente), '<strong>' + fmt(c.valor) + '</strong>', fmtD(c.vencimento), badge(c.status, c.status === 'pago' ? 'success' : 'warning'),
    (c.status !== 'pago' ? '<button class="btn btn-sm btn-success" onclick="marcarPago(' + c.id + ',\'receber\')"><i class="fas fa-check"></i></button> ' : '') +
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'contasReceber\',' + c.id + ')"><i class="fas fa-trash"></i></button>']);
  const pagRows = pag.slice().reverse().map(c => [esc(c.fornecedor), '<strong>' + fmt(c.valor) + '</strong>', fmtD(c.vencimento), badge(c.status, c.status === 'pago' ? 'success' : 'warning'),
    (c.status !== 'pago' ? '<button class="btn btn-sm btn-success" onclick="marcarPago(' + c.id + ',\'pagar\')"><i class="fas fa-check"></i></button> ' : '') +
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'contasPagar\',' + c.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Financeiro', 'Contas a receber e a pagar', 'var(--success)', '', 'fa-coins') +
    '<div class="metric-grid">' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">📥 A Receber</div><div class="value" style="color:var(--success)">' + fmt(tR) + '</div><div class="sub">' + rec.length + ' contas</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--danger)"><div class="label">📤 A Pagar</div><div class="value" style="color:var(--danger)">' + fmt(tP) + '</div><div class="sub">' + pag.length + ' contas</div></div>' +
    '<div class="metric-card"><div class="label">📊 Saldo</div><div class="value">' + fmt(tR - tP) + '</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-hand-holding-heart"></i> A Receber</h3><button class="btn btn-sm btn-success" onclick="abrirModalConta(\'receber\')"><i class="fas fa-plus"></i> Nova</button></div>' + table(['Cliente', 'Valor', 'Vencimento', 'Status', 'Ações'], recRows) + '</div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-file-invoice-dollar"></i> A Pagar</h3><button class="btn btn-sm btn-success" onclick="abrirModalConta(\'pagar\')"><i class="fas fa-plus"></i> Nova</button></div>' + table(['Fornecedor', 'Valor', 'Vencimento', 'Status', 'Ações'], pagRows) + '</div>';
}
function abrirModalConta(tipo) {
  const isR = tipo === 'receber';
  openModal(isR ? 'Nova Conta a Receber' : 'Nova Conta a Pagar',
    '<div class="form-group"><label>' + (isR ? 'Cliente' : 'Fornecedor') + ' *</label><input id="ctNome"></div>' +
    '<div class="form-group"><label>Descrição</label><input id="ctDesc"></div>' +
    '<div class="form-group"><label>Valor *</label><input id="ctValor" type="number" value="0"></div>' +
    '<div class="form-group"><label>Vencimento</label><input id="ctVenc" type="date" value="' + new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) + '"></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarConta(\'' + tipo + '\')">Salvar</button>');
}
async function salvarConta(tipo) {
  const n = $('ctNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; }
  const d = { valor: num($('ctValor').value, 0), descricao: $('ctDesc').value, vencimento: $('ctVenc').value, status: 'pendente', data: now() };
  if (tipo === 'receber') { d.cliente = n; await saveData('contasReceber', d); } else { d.fornecedor = n; await saveData('contasPagar', d); }
  toast('Conta registrada', 'success'); closeModal(); openModule('financeiro');
}
async function marcarPago(id, tipo) {
  const s = tipo === 'receber' ? 'contasReceber' : 'contasPagar';
  const c = await DB.get(s, id); c.status = 'pago'; c.dataPagamento = now(); await saveData(s, c);
  toast('Marcado pago', 'success'); openModule('financeiro');
}

/* ====== FISCAL ====== */
async function renderFiscal() {
  const vendas = await getData('vendas'); const compras = await getData('compras');
  const tV = vendas.reduce((s, v) => s + (v.total || 0), 0);
  const tC = compras.reduce((s, c) => s + (c.valor || 0), 0);
  const ivaV = vendas.reduce((s, v) => s + (v.iva || 0), 0);
  const ivaC = tC * 0.14;
  const irtRows = AGT_CONFIG.irt.faixas.map(f => [fmt(f.min) + ' - ' + (f.max === Infinity ? '∞' : fmt(f.max)), '<strong>' + (f.taxa * 100).toFixed(0) + '%</strong>', fmt(f.parcela)]);
  return header('Fiscal AGT', 'Gestão fiscal — Angola', 'var(--purple)', '', 'fa-landmark') +
    '<div class="metric-grid">' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">IVA Vendas</div><div class="value">' + fmt(ivaV) + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--info)"><div class="label">IVA Compras</div><div class="value">' + fmt(ivaC) + '</div></div>' +
    '<div class="metric-card" style="border-left-color:' + ((ivaV - ivaC) >= 0 ? 'var(--danger)' : 'var(--success)') + '"><div class="label">Saldo IVA</div><div class="value">' + fmt(Math.abs(ivaV - ivaC)) + '</div></div>' +
    '<div class="metric-card"><div class="label">Faturação</div><div class="value">' + fmt(tV) + '</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-percent"></i> Tabela IRT</h3></div>' + table(['Faixa', 'Taxa', 'Parcela'], irtRows) + '</div>' +
    '<div class="card" style="border-left:4px solid var(--warning)"><div class="card-header"><h3 class="card-title"><i class="fas fa-shield-alt"></i> Ligação oficial e certificado</h3>'+badge('Não configurada','warning')+'</div>' +
    '<p>As credenciais e o certificado ainda não estão ligados a um serviço seguro no servidor. Não introduza a chave privada ou a senha do certificado nesta página nem no armazenamento do navegador.</p>' +
    '<p>A ativação exige endpoint de integração autenticado, armazenamento de segredos no servidor, certificado válido, ambiente de testes, documentação técnica oficial e validação da resposta do serviço. Até essa validação, as faturas comerciais não apresentam códigos, endereços ou declarações de validação oficial.</p></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-download"></i> Exportações AGT</h3></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn btn-success" onclick="exportarSAFTCompleto()"><i class="fas fa-file-code"></i> SAF-T Completo</button>' +
    '<button class="btn btn-info" onclick="exportarIRTDeclaracao()"><i class="fas fa-file-invoice"></i> Declaração IRT</button>' +
    '<button class="btn btn-warning" onclick="exportarIVADeclaracao()"><i class="fas fa-percent"></i> Declaração IVA</button>' +
    '<button class="btn btn-primary" onclick="exportarInventario()"><i class="fas fa-boxes"></i> Inventário</button></div></div>';
}
async function exportarSAFTCompleto() {
  toast('Exportação SAF-T AO bloqueada: o exportador atual ainda não gera XML conforme o esquema oficial nem valida assinatura, sequência e integridade documental. Não será descarregado um JSON com extensão XML.', 'warning');
  return false;
}
async function exportarIRTDeclaracao() {
  const funcs = await getData('funcionarios'); const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  let csv = 'DECLARAÇÃO IRT - ' + (emp.nome || '') + ' (NIF: ' + (emp.nif || '') + ')\nMês: ' + new Date().toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' }) + '\n\n';
  csv += 'Nome,Cargo,Salário,IRT,Líquido\n';
  funcs.forEach(f => { const irt = calcIRT(f.salario || 0).irt; csv += '"' + f.nome + '","' + (f.cargo || '') + '",' + (f.salario || 0) + ',' + irt + ',' + ((f.salario || 0) - irt) + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'IRT_' + new Date().toISOString().slice(0, 7) + '.csv'; a.click();
  URL.revokeObjectURL(url); toast('📄 IRT gerado', 'success');
}
async function exportarIVADeclaracao() {
  const vendas = await getData('vendas'); const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const ivaV = vendas.reduce((s, v) => s + (v.iva || 0), 0);
  const base = vendas.reduce((s, v) => s + (v.subtotal - (v.descontoValor || 0)), 0);
  let txt = 'DECLARAÇÃO IVA - ' + (emp.nome || '') + ' (NIF: ' + (emp.nif || '') + ')\n';
  txt += 'Período: ' + new Date().toLocaleDateString('pt-AO', { month: 'long', year: 'numeric' }) + '\n\n';
  txt += 'Regime: ' + (emp.regime || 'geral') + '\nMontante Ilíquido: ' + fmt(base) + '\nImposto Devido (IVA): ' + fmt(ivaV) + '\nIVA a Pagar: ' + fmt(ivaV) + '\n\nFaturas: ' + vendas.length + '\n';
  const blob = new Blob([txt], { type: 'text/plain' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'IVA_' + new Date().toISOString().slice(0, 7) + '.txt'; a.click();
  URL.revokeObjectURL(url); toast('📄 IVA gerado', 'success');
}
async function exportarInventario() {
  if (typeof XLSX === 'undefined') { toast('Excel indisponível', 'warning'); return; }
  const p = await getData('produtos'); const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const ws = XLSX.utils.json_to_sheet(p.map(x => ({ Codigo: x.codigo, CodigoBarras: x.codigoBarras, Nome: x.nome, Categoria: x.categoria, Estoque: x.estoque || 0, Preco: x.preco, Total: (x.estoque || 0) * x.preco })));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
  XLSX.writeFile(wb, 'Inventario_' + (emp.nif || 'emp') + '_' + Date.now() + '.xlsx');
  toast('📄 Inventário exportado', 'success');
}

/* ====== RH ====== */
let rhActiveTab = 'funcionarios';
function openRHSection(tab) { rhActiveTab = tab; openModule('rh'); }
async function renderRH() {
  const tabs = [['funcionarios','Funcionários'],['recrutamento','Recrutamento'],['desempenho','Desempenho'],['beneficios','Benefícios'],['onboarding','Onboarding'],['ponto','Ponto'],['rescisao','Rescisão'],['plano-carreira','Carreira']];
  const nav = tabs.map(([id,label]) => '<button class="btn '+(rhActiveTab===id?'btn-primary':'btn-secondary')+'" onclick="openRHSection(\''+id+'\')">'+label+'</button>').join('');
  let body = '';
  if (rhActiveTab==='recrutamento') body=await renderRHRecrutamento();
  else if (rhActiveTab==='desempenho') body=await renderRHDesempenho();
  else if (rhActiveTab==='beneficios') body=await renderRHBeneficios();
  else if (rhActiveTab==='onboarding') body=await renderRHOnboarding();
  else if (rhActiveTab==='ponto') body=await renderRHPonto();
  else if (rhActiveTab==='rescisao') body=await renderRHRescisao();
  else if (rhActiveTab==='plano-carreira') body=await renderRHPlanoCarreira();
  else {
    const f=await getData('funcionarios');
    const rows=f.map(x=>{const irt=calcIRT(x.salario||0).irt;return [x.id,'<strong>'+esc(x.nome)+'</strong>',esc(x.cargo||'-'),fmt(x.salario||0),fmt(irt),fmt((x.salario||0)-irt),fmtD(x.dataContratacao||x.dataInicio||x.admissao),esc(x.telefone||'-'),esc(x.email||'-'),'<button class="btn btn-sm btn-primary" onclick="verFuncionarioRH('+x.id+')">Ficha completa</button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'funcionarios\','+x.id+')"><i class="fas fa-trash"></i></button>'];});
    body='<div class="card">'+table(['#','Trabalhador','Cargo','Salário bruto','IRT estimado','Líquido estimado','Admissão','Telefone','Email','Ações'],rows)+'</div>';
  }
  return header('Recursos Humanos','Gestão integrada de trabalhadores e ciclo de vida','var(--info)','<button class="btn btn-success" onclick="abrirModalFuncionario()"><i class="fas fa-plus"></i> Novo trabalhador</button>','fa-users')+'<div class="card" style="display:flex;gap:8px;flex-wrap:wrap">'+nav+'</div>'+body;
}
async function verFuncionarioRH(id) {
 const f=await DB.get('funcionarios',id); if(!f)return toast('Trabalhador não encontrado.','error');
 const fields=[['Nome completo',f.nome],['Cargo',f.cargo],['Departamento',f.departamento],['NIF',f.nif],['BI',f.bi],['Telefone',f.telefone],['Email',f.email],['Morada',f.endereco||f.morada],['Data de nascimento',f.dataNascimento],['Data de admissão',f.dataContratacao||f.dataInicio||f.admissao],['Tipo de contrato',f.tipoContrato],['Salário bruto',fmt(f.salario||0)],['Banco',f.banco],['IBAN',f.iban],['Estado',f.status||'Activo']];
 openModal('Ficha completa do trabalhador','<div class="form-grid">'+fields.map(([k,v])=>'<div class="form-group"><label>'+esc(k)+'</label><div>'+esc(v||'Não informado')+'</div></div>').join('')+'</div>',true);
}
function abrirModalFuncionario() {
 openModal('Novo trabalhador','<div class="form-grid"><div class="form-group"><label>Nome completo *</label><input id="fnNome"></div><div class="form-group"><label>Cargo *</label><input id="fnCargo"></div><div class="form-group"><label>Departamento</label><input id="fnDepartamento"></div><div class="form-group"><label>NIF</label><input id="fnNif"></div><div class="form-group"><label>BI</label><input id="fnBI"></div><div class="form-group"><label>Telefone</label><input id="fnTelefone"></div><div class="form-group"><label>Email</label><input id="fnEmail" type="email"></div><div class="form-group"><label>Data de admissão *</label><input id="fnAdmissao" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div><div class="form-group"><label>Tipo de contrato</label><input id="fnContrato"></div><div class="form-group"><label>Salário bruto *</label><input id="fnSalario" type="number" min="0" step="0.01" value="0"></div><div class="form-group"><label>Banco</label><input id="fnBanco"></div><div class="form-group"><label>IBAN</label><input id="fnIBAN"></div></div><button class="btn btn-primary btn-block" onclick="salvarFuncionario()">Salvar trabalhador</button>',true);
}
async function salvarFuncionario() {
 const n=$('fnNome').value.trim(),cargo=$('fnCargo').value.trim(),salario=Number($('fnSalario').value),admissao=$('fnAdmissao').value;
 if(!n||!cargo||!admissao||!Number.isFinite(salario)||salario<0){toast('Preencha nome, cargo, admissão e salário válido.','warning');return;}
 await saveData('funcionarios',{nome:n,cargo,departamento:$('fnDepartamento').value.trim(),nif:$('fnNif').value.trim(),bi:$('fnBI').value.trim(),telefone:$('fnTelefone').value.trim(),email:$('fnEmail').value.trim(),dataContratacao:admissao,dataInicio:admissao,tipoContrato:$('fnContrato').value.trim(),salario,banco:$('fnBanco').value.trim(),iban:$('fnIBAN').value.trim(),status:'activo',data:now()});
 toast('Trabalhador cadastrado.','success');closeModal();openModule('rh');
}

/* ====== PROJETOS ====== */
async function renderProjetos() {
  const p = await getData('projetos');
  const rows = p.map(x => [x.id, '<strong>' + esc(x.nome) + '</strong>', badge(x.status || 'ativo', 'info'), '<div style="background:var(--border);height:8px;border-radius:4px;overflow:hidden;width:100px;display:inline-block;vertical-align:middle"><div style="background:var(--success);height:100%;width:' + (x.progresso || 0) + '%"></div></div> ' + (x.progresso || 0) + '%', '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'projetos\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Projetos', p.length + ' projetos', 'var(--primary)', '<button class="btn btn-success" onclick="abrirModalProjeto()"><i class="fas fa-plus"></i> Novo</button>', 'fa-project-diagram') + '<div class="card">' + table(['#', 'Nome', 'Status', 'Progresso', 'Ações'], rows) + '</div>';
}
function abrirModalProjeto() { openModal('Novo Projeto', '<div class="form-group"><label>Nome *</label><input id="pjNome"></div><div class="form-group"><label>Descrição</label><textarea id="pjDesc" rows="2"></textarea></div><div class="form-group"><label>Progresso (%)</label><input id="pjProg" type="number" value="0" min="0" max="100"></div><button class="btn btn-primary btn-block" onclick="salvarProjeto()">Salvar</button>'); }
async function salvarProjeto() { const n = $('pjNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('projetos', { nome: n, descricao: $('pjDesc').value, progresso: int($('pjProg').value, 0), status: 'ativo', dataInicio: now() }); toast('Criado', 'success'); closeModal(); openModule('projetos'); }

/* ====== TAREFAS ====== */
async function renderTarefas() {
  const t = await getData('tarefas');
  const rows = t.map(x => [x.id, '<strong>' + esc(x.titulo) + '</strong>', esc(x.prioridade || 'média'), badge(x.status || 'pendente', x.status === 'concluida' ? 'success' : 'warning'), fmtD(x.prazo),
    '<button class="btn btn-sm btn-success" onclick="concluirTarefa(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'tarefas\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Tarefas', t.length + ' tarefas', 'var(--purple)', '<button class="btn btn-success" onclick="abrirModalTarefa()"><i class="fas fa-plus"></i> Nova</button>', 'fa-tasks') + '<div class="card">' + table(['#', 'Título', 'Prioridade', 'Status', 'Prazo', 'Ações'], rows) + '</div>';
}
function abrirModalTarefa() { openModal('Nova Tarefa', '<div class="form-group"><label>Título *</label><input id="tkTitulo"></div><div class="form-group"><label>Prioridade</label><select id="tkPrior"><option>baixa</option><option selected>média</option><option>alta</option></select></div><div class="form-group"><label>Prazo</label><input id="tkPrazo" type="date" value="' + new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) + '"></div><button class="btn btn-primary btn-block" onclick="salvarTarefa()">Salvar</button>'); }
async function salvarTarefa() { const n = $('tkTitulo').value.trim(); if (!n) { toast('Informe título', 'warning'); return; } await saveData('tarefas', { titulo: n, prioridade: $('tkPrior').value, prazo: $('tkPrazo').value, status: 'pendente', data: now() }); toast('Criada', 'success'); closeModal(); openModule('tarefas'); }
async function concluirTarefa(id) { const t = await DB.get('tarefas', id); if (t) { t.status = 'concluida'; t.dataConclusao = now(); await saveData('tarefas', t); toast('Concluída', 'success'); openModule('tarefas'); } }

/* ====== ATIVOS ====== */
async function renderAtivos() {
  const a = await getData('ativos');
  const rows = a.map(x => [x.id, '<strong>' + esc(x.nome) + '</strong>', esc(x.patrimonio || '-'), fmt(x.valor), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'ativos\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Ativos', a.length + ' ativos', 'var(--primary)', '<button class="btn btn-success" onclick="abrirModalAtivo()"><i class="fas fa-plus"></i> Novo</button>', 'fa-building') + '<div class="card">' + table(['#', 'Nome', 'Patrimônio', 'Valor', 'Ações'], rows) + '</div>';
}
function abrirModalAtivo() { openModal('Novo Ativo', '<div class="form-group"><label>Nome *</label><input id="atNome"></div><div class="form-group"><label>Patrimônio</label><input id="atPatr"></div><div class="form-group"><label>Valor</label><input id="atValor" type="number" value="0"></div><button class="btn btn-primary btn-block" onclick="salvarAtivo()">Salvar</button>'); }
async function salvarAtivo() { const n = $('atNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('ativos', { nome: n, patrimonio: $('atPatr').value, valor: num($('atValor').value, 0), dataAquisicao: now() }); toast('Cadastrado', 'success'); closeModal(); openModule('ativos'); }

/* ====== FROTA ====== */
async function renderFrota() {
  const f = await getData('frotas');
  const rows = f.map(x => [x.id, '<strong>' + esc(x.placa) + '</strong>', esc(x.modelo), x.ano || '-', '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'frotas\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Frota', f.length + ' veículos', 'var(--primary)', '<button class="btn btn-success" onclick="abrirModalVeiculo()"><i class="fas fa-plus"></i> Novo</button>', 'fa-truck-moving') + '<div class="card">' + table(['#', 'Placa', 'Modelo', 'Ano', 'Ações'], rows) + '</div>';
}
function abrirModalVeiculo() { openModal('Novo Veículo', '<div class="form-group"><label>Placa *</label><input id="vPlaca"></div><div class="form-group"><label>Modelo *</label><input id="vModelo"></div><div class="form-group"><label>Ano</label><input id="vAno" type="number" value="' + new Date().getFullYear() + '"></div><button class="btn btn-primary btn-block" onclick="salvarVeiculo()">Salvar</button>'); }
async function salvarVeiculo() { const p = $('vPlaca').value.trim(); const m = $('vModelo').value.trim(); if (!p || !m) { toast('Preencha placa e modelo', 'warning'); return; } await saveData('frotas', { placa: p, modelo: m, ano: int($('vAno').value), status: 'ativo' }); toast('Cadastrado', 'success'); closeModal(); openModule('frota'); }

/* ====== OS ====== */
async function renderOS() {
  const o = await getData('ordensServico');
  const rows = o.map(x => ['#' + x.id, esc(x.cliente), esc(x.descricao || '-'), badge(x.status || 'aberta', 'warning'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'ordensServico\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Ordens de Serviço', o.length + ' OS', 'var(--danger)', '<button class="btn btn-success" onclick="abrirModalOS()"><i class="fas fa-plus"></i> Nova</button>', 'fa-clipboard-list') + '<div class="card">' + table(['#', 'Cliente', 'Descrição', 'Status', 'Ações'], rows) + '</div>';
}
function abrirModalOS() { openModal('Nova OS', '<div class="form-group"><label>Cliente *</label><input id="osCliente"></div><div class="form-group"><label>Descrição</label><textarea id="osDesc" rows="2"></textarea></div><button class="btn btn-primary btn-block" onclick="salvarOS()">Salvar</button>'); }
async function salvarOS() { const c = $('osCliente').value.trim(); if (!c) { toast('Informe cliente', 'warning'); return; } await saveData('ordensServico', { cliente: c, descricao: $('osDesc').value, status: 'aberta', data: now() }); toast('Criada', 'success'); closeModal(); openModule('os'); }

/* ====== CONTRATOS ====== */
async function renderContratos() {
  const c = await getData('contratos');
  const rows = c.map(x => [x.id, esc(x.cliente), fmt(x.valor), fmtD(x.inicio), fmtD(x.fim), badge(x.status || 'ativo', x.status === 'ativo' ? 'success' : 'warning'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'contratos\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Contratos', c.length + ' contratos', 'var(--primary)', '<button class="btn btn-success" onclick="abrirModalContrato()"><i class="fas fa-plus"></i> Novo</button>', 'fa-file-contract') + '<div class="card">' + table(['#', 'Cliente', 'Valor', 'Início', 'Fim', 'Status', 'Ações'], rows) + '</div>';
}
function abrirModalContrato() {
  openModal('Novo Contrato',
    '<div class="form-group"><label>Cliente *</label><input id="ctContNome"></div>' +
    '<div class="form-group"><label>Valor *</label><input id="ctContValor" type="number" value="0"></div>' +
    '<div class="form-group"><label>Início</label><input id="ctContIni" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
    '<div class="form-group"><label>Fim</label><input id="ctContFim" type="date" value="' + new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) + '"></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarContrato()">Salvar</button>');
}
async function salvarContrato() { const c = $('ctContNome').value.trim(); if (!c) { toast('Informe cliente', 'warning'); return; } await saveData('contratos', { cliente: c, valor: num($('ctContValor').value, 0), inicio: $('ctContIni').value, fim: $('ctContFim').value, status: 'ativo' }); toast('Criado', 'success'); closeModal(); openModule('contratos'); }

/* ====== DOCUMENTOS ====== */
async function renderDocumentos() {
  const d = await getData('documentos');
  const rows = d.map(x => [x.id, esc(x.nome), esc(x.tipo || '-'), fmtD(x.data), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'documentos\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Documentos', d.length + ' documentos', 'var(--primary)', '<button class="btn btn-success" onclick="abrirModalDocumento()"><i class="fas fa-plus"></i> Novo</button>', 'fa-folder-open') + '<div class="card">' + table(['#', 'Nome', 'Tipo', 'Data', 'Ações'], rows) + '</div>';
}
function abrirModalDocumento() { openModal('Novo Documento', '<div class="form-group"><label>Nome *</label><input id="docNome"></div><div class="form-group"><label>Tipo</label><select id="docTipo"><option>Fatura</option><option>Contrato</option><option>Recibo</option><option>Outro</option></select></div><button class="btn btn-primary btn-block" onclick="salvarDocumento()">Salvar</button>'); }
async function salvarDocumento() { const n = $('docNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('documentos', { nome: n, tipo: $('docTipo').value, data: now() }); toast('Salvo', 'success'); closeModal(); openModule('documentos'); }

/* ====== TICKETS ====== */
async function renderTickets() {
  const t = await getData('tickets');
  const rows = t.map(x => ['#' + x.id, esc(x.titulo), esc(x.cliente || '-'), badge(x.prioridade || 'normal', 'info'), badge(x.status || 'aberto', x.status === 'resolvido' ? 'success' : 'warning'),
    '<button class="btn btn-sm btn-success" onclick="resolverTicket(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'tickets\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Tickets de Suporte', t.length + ' tickets', 'var(--danger)', '<button class="btn btn-success" onclick="abrirModalTicket()"><i class="fas fa-plus"></i> Novo</button>', 'fa-ticket-alt') + '<div class="card">' + table(['#', 'Título', 'Cliente', 'Prioridade', 'Status', 'Ações'], rows) + '</div>';
}
function abrirModalTicket() {
  openModal('Novo Ticket',
    '<div class="form-group"><label>Título *</label><input id="tkTTitulo"></div>' +
    '<div class="form-group"><label>Cliente</label><input id="tkTCliente"></div>' +
    '<div class="form-group"><label>Descrição</label><textarea id="tkTDesc" rows="3"></textarea></div>' +
    '<div class="form-group"><label>Prioridade</label><select id="tkTPrior"><option>baixa</option><option selected>normal</option><option>alta</option><option>urgente</option></select></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarTicket()">Abrir Ticket</button>');
}
async function salvarTicket() { const n = $('tkTTitulo').value.trim(); if (!n) { toast('Informe título', 'warning'); return; } await saveData('tickets', { titulo: n, cliente: $('tkTCliente').value, descricao: $('tkTDesc').value, prioridade: $('tkTPrior').value, status: 'aberto', data: now() }); toast('Ticket criado', 'success'); closeModal(); openModule('tickets'); }
async function resolverTicket(id) { const t = await DB.get('tickets', id); if (t) { t.status = 'resolvido'; t.dataResolucao = now(); await saveData('tickets', t); toast('Resolvido', 'success'); openModule('tickets'); } }

/* ====== VENDAS ====== */
async function renderVendas() {
  const v = await getData('vendas');
  const d = await getData('devolucoes');
  const rows = v.slice().reverse().map(x => ['<strong>' + esc(x.numeroFatura || '#' + x.id) + '</strong>', esc(x.clienteNome || '-'), '<strong>' + fmt(x.total) + '</strong>', esc(x.pagamento || '-'), badge(x.status || '-', 'success'), fmtDT(x.data),
    '<button class="btn btn-sm btn-info" onclick="verFatura(' + x.id + ')"><i class="fas fa-eye"></i></button>' + (podeFazer('excluir') ? ' <button class="btn btn-sm btn-danger" onclick="excluirItem(\'vendas\',' + x.id + ')"><i class="fas fa-trash"></i></button>' : '')]);
  const devRows = d.slice().reverse().map(x => [esc(x.vendaNumero || '-'), esc(x.cliente || '-'), esc(x.motivo || '-'), fmt(x.total), fmtDT(x.data)]);
  return header('Vendas', v.length + ' vendas | ' + d.length + ' devoluções', 'var(--primary)', '<button class="btn btn-success" onclick="openModule(\'pdv\')"><i class="fas fa-plus"></i> Nova</button>', 'fa-receipt') +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> Vendas</h3></div>' + table(['Nº', 'Cliente', 'Total', 'Pagamento', 'Status', 'Data', 'Ações'], rows) + '</div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-undo-alt"></i> Devoluções</h3></div>' + table(['Venda', 'Cliente', 'Motivo', 'Total', 'Data'], devRows) + '</div>';
}
async function verFatura(id) { const v = await DB.get('vendas', id); if (v) abrirFatura(v); }

/* ====== ORÇAMENTOS ====== */
async function renderOrcamentos() {
  const o = await getData('orcamentos');
  const rows = o.map(x => [x.id, esc((x.cliente && x.cliente.nome) || '-'), (x.carrinho || []).length, '<strong>' + fmt(x.total) + '</strong>', badge(x.status || 'pendente', 'warning'),
    '<button class="btn btn-sm btn-success" onclick="converterOrcamento(' + x.id + ')"><i class="fas fa-arrow-right"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'orcamentos\',' + x.id + ')"><i class="fas fa-trash"></i></button>']);
  return header('Orçamentos', o.length + ' orçamentos', 'var(--info)', '', 'fa-file-invoice') + '<div class="card">' + table(['#', 'Cliente', 'Itens', 'Total', 'Status', 'Ações'], rows) + '</div>';
}
async function converterOrcamento(id) {
  const o = await DB.get('orcamentos', id); if (!o) return;
  pdvState.carrinho = o.carrinho || []; pdvState.cliente = o.cliente || { nome: 'Cliente Anônimo', nif: '', telefone: '' }; pdvState.desconto = o.desconto || 0;
  toast('Orçamento carregado no PDV', 'success'); openModule('pdv');
}

/* ====== E-COMMERCE ====== */
async function renderEcommerce() {
  const p = await getData('produtos'); const promo = await getData('promocoes');
  const cards = p.map(x => {
    const pub = x.publicado !== false;
    return '<div class="pdv-prod-card"><div class="img"><img src="' + imgSrc(x) + '" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'"></div>' +
      '<div class="info"><div class="name">' + esc(x.nome) + '</div><div class="price">' + fmt(x.preco) + '</div><div class="stock">' + esc(x.categoria || '') + '</div>' +
      '<div style="margin-top:8px;display:flex;gap:4px;justify-content:center">' +
      '<button class="btn btn-sm btn-primary" onclick="abrirModalProduto(' + x.id + ')"><i class="fas fa-edit"></i></button>' +
      '<button class="btn btn-sm ' + (pub ? 'btn-success' : 'btn-secondary') + '" onclick="togglePublicado(' + x.id + ')"><i class="fas fa-' + (pub ? 'eye' : 'eye-slash') + '"></i></button></div></div></div>';
  }).join('');
  return header('E-commerce', 'Loja virtual e catálogo', 'var(--success)', '<button class="btn btn-success" onclick="abrirModalPromocao()"><i class="fas fa-percent"></i> Nova Promoção</button>', 'fa-store') +
    '<div class="metric-grid"><div class="metric-card"><div class="label">Publicados</div><div class="value">' + p.filter(x => x.publicado !== false).length + '</div><div class="sub">de ' + p.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--warning)"><div class="label">Promoções</div><div class="value">' + promo.length + '</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-box"></i> Catálogo</h3></div><div class="pdv-products-grid">' + cards + '</div></div>';
}
async function togglePublicado(id) { const p = await DB.get('produtos', id); p.publicado = p.publicado === false ? true : false; await saveData('produtos', p); openModule('ecommerce'); }
function abrirModalPromocao() { openModal('Nova Promoção', '<div class="form-group"><label>Nome *</label><input id="prNome"></div><div class="form-group"><label>Desconto (%)</label><input id="prDesc" type="number" value="10"></div><button class="btn btn-primary btn-block" onclick="salvarPromocao()">Salvar</button>'); }
async function salvarPromocao() { const n = $('prNome').value.trim(); if (!n) { toast('Informe nome', 'warning'); return; } await saveData('promocoes', { nome: n, desconto: num($('prDesc').value, 0), data: now() }); toast('Criada', 'success'); closeModal(); openModule('ecommerce'); }

/* ====== RELATÓRIOS ====== */
async function carregarDadosRelatorios() {
  const stores = ['vendas','compras','movimentacoesEstoque','pagamentos','transacoesBancarias','contasReceber','contasPagar','auditoria','atividadesProjetos','historicoOS','logsSeguranca','notificacoes','produtos','clientes'];
  const values = await Promise.all(stores.map(s => getData(s)));
  return Object.fromEntries(stores.map((s,i) => [s, values[i]]));
}
function dataRelatorio(item) {
  const raw = item.data || item.created_at || item.updated_at || item.createdAt || item.timestamp || item.date || item.dataHora || item.created_on || '';
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function dentroPeriodoRelatorio(item, inicio, fim) {
  const d = dataRelatorio(item);
  if (!d) return false;
  const day = d.toISOString().slice(0,10);
  return (!inicio || day >= inicio) && (!fim || day <= fim);
}
function moedaRelatorio(value) { return fmt(Number(value) || 0); }
function montarLinhasRelatorio(data, tipo, inicio, fim) {
  const rows = [];
  const add = (categoria, dataItem, referencia, descricao, responsavel, valor, estado) => {
    if (!dentroPeriodoRelatorio(dataItem, inicio, fim)) return;
    const d = dataRelatorio(dataItem);
    rows.push({ categoria, data: d ? fmtDT(d.toISOString()) : '-', ordem: d ? d.getTime() : 0, referencia: referencia || '-', descricao: descricao || '-', responsavel: responsavel || '-', valor: Number(valor) || 0, estado: estado || '-' });
  };
  if (tipo === 'todos' || tipo === 'movimentos') {
    (data.vendas || []).forEach(x => add('Venda', x, x.numeroFatura || '#' + x.id, 'Venda • ' + (x.clienteNome || 'Cliente não identificado'), x.usuario || x.vendedor || '-', x.total, x.status));
    (data.compras || []).forEach(x => add('Compra', x, '#' + x.id, (x.produto || 'Compra') + ' • ' + (x.fornecedor || 'Fornecedor não indicado'), x.usuario || '-', x.valor, x.status));
    (data.movimentacoesEstoque || []).forEach(x => add('Stock', x, '#' + x.id, x.descricao || x.produto || 'Movimentação de stock (' + (x.tipo || 'movimento') + ')', x.usuario || '-', x.valor || x.quantidade, x.tipo));
    (data.pagamentos || []).forEach(x => add('Pagamento', x, x.referencia || '#' + x.id, x.descricao || x.metodo || 'Pagamento', x.usuario || '-', x.valor || x.total, x.status));
    (data.transacoesBancarias || []).forEach(x => add('Movimento bancário', x, x.referencia || '#' + x.id, x.descricao || x.tipo || 'Transação bancária', x.usuario || '-', x.valor || x.montante, x.status));
    (data.contasReceber || []).forEach(x => add('A receber', x, '#' + x.id, x.cliente || 'Conta a receber', x.usuario || '-', x.valor, x.status));
    (data.contasPagar || []).forEach(x => add('A pagar', x, '#' + x.id, x.fornecedor || 'Conta a pagar', x.usuario || '-', x.valor, x.status));
  }
  if (tipo === 'todos' || tipo === 'atividades') {
    (data.auditoria || []).forEach(x => add('Auditoria', x, '#' + x.id, (x.acao || 'Atividade') + ' • ' + (x.modulo || 'Sistema') + ' • ' + (typeof x.detalhes === 'string' ? x.detalhes : JSON.stringify(x.detalhes || {})), x.usuario || '-', 0, 'Registado'));
    (data.atividadesProjetos || []).forEach(x => add('Projeto', x, '#' + x.id, x.descricao || x.atividade || x.titulo || 'Atividade de projeto', x.usuario || x.responsavel || '-', 0, x.status));
    (data.historicoOS || []).forEach(x => add('Assistência', x, '#' + x.id, x.descricao || x.atividade || x.acao || 'Atividade de assistência', x.tecnico || x.usuario || '-', 0, x.status));
    (data.logsSeguranca || []).forEach(x => add('Segurança', x, '#' + x.id, x.acao || x.evento || x.descricao || 'Evento de segurança', x.usuario || x.email || '-', 0, x.status || 'Registado'));
    (data.notificacoes || []).forEach(x => add('Notificação', x, '#' + x.id, x.titulo || x.mensagem || 'Notificação do sistema', x.usuario || '-', 0, x.status || 'Registado'));
  }
  return rows.sort((a,b) => b.ordem - a.ordem);
}
function htmlTabelaRelatorio(rows) {
  return table(['Data','Tipo','Referência','Descrição','Responsável','Valor / Qtd.','Estado'], rows.map(x => [
    esc(x.data), badge(x.categoria, 'info'), esc(x.referencia), esc(x.descricao), esc(x.responsavel),
    x.valor ? '<strong>' + moedaRelatorio(x.valor) + '</strong>' : '-', esc(x.estado)
  ]));
}
async function atualizarRelatorio() {
  const target = $('relatorioResultado');
  if (!target) return;
  const data = await carregarDadosRelatorios();
  const tipo = $('relatorioTipo') ? $('relatorioTipo').value : 'todos';
  const inicio = $('relatorioInicio') ? $('relatorioInicio').value : '';
  const fim = $('relatorioFim') ? $('relatorioFim').value : '';
  const rows = montarLinhasRelatorio(data, tipo, inicio, fim);
  const total = rows.reduce((s,x) => s + (x.categoria === 'Venda' ? x.valor : 0), 0);
  const metric = $('relatorioResumo');
  if (metric) metric.innerHTML = '<div class="metric-grid"><div class="metric-card"><div class="label">Registos encontrados</div><div class="value">' + rows.length + '</div></div><div class="metric-card"><div class="label">Total de vendas no período</div><div class="value">' + moedaRelatorio(total) + '</div></div><div class="metric-card"><div class="label">Movimentos</div><div class="value">' + rows.filter(x => ['Venda','Compra','Stock','Pagamento','Movimento bancário','A receber','A pagar'].includes(x.categoria)).length + '</div></div><div class="metric-card"><div class="label">Atividades</div><div class="value">' + rows.filter(x => ['Auditoria','Projeto','Assistência','Segurança','Notificação'].includes(x.categoria)).length + '</div></div></div>';
  target.innerHTML = htmlTabelaRelatorio(rows);
}
async function imprimirRelatorio(tipo) {
  const popup = window.open('', '_blank');
  if (!popup) { toast('Permita janelas pop-up para imprimir o relatório.', 'warning'); return; }
  const data = await carregarDadosRelatorios();
  const inicio = $('relatorioInicio') ? $('relatorioInicio').value : '';
  const fim = $('relatorioFim') ? $('relatorioFim').value : '';
  const rows = montarLinhasRelatorio(data, tipo || ($('relatorioTipo') ? $('relatorioTipo').value : 'todos'), inicio, fim);
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const titulo = tipo === 'movimentos' ? 'Relatório de Movimentos' : tipo === 'atividades' ? 'Relatório de Atividades' : 'Relatório Geral';
  const body = rows.length ? rows.map(x => '<tr><td>' + esc(x.data) + '</td><td>' + esc(x.categoria) + '</td><td>' + esc(x.referencia) + '</td><td>' + esc(x.descricao) + '</td><td>' + esc(x.responsavel) + '</td><td>' + (x.valor ? moedaRelatorio(x.valor) : '-') + '</td><td>' + esc(x.estado) + '</td></tr>').join('') : '<tr><td colspan="7">Sem registos no período selecionado.</td></tr>';
  popup.document.write('<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>' + titulo + '</title><style>body{font:12px Arial,sans-serif;color:#172033;padding:24px}h1{margin:0 0 6px}p{margin:4px 0 18px;color:#475569}.meta{margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#e2e8f0}tfoot{font-weight:bold}@media print{body{padding:0}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>' + esc(emp.firma || emp.nome || 'KanawaSoft') + '</h1><h2>' + titulo + '</h2><div class="meta">Período: ' + esc(inicio || 'Sem início') + ' a ' + esc(fim || 'Sem fim') + ' • Emitido em: ' + esc(new Date().toLocaleString('pt-AO')) + '</div><table><thead><tr><th>Data</th><th>Tipo</th><th>Referência</th><th>Descrição</th><th>Responsável</th><th>Valor / Qtd.</th><th>Estado</th></tr></thead><tbody>' + body + '</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>');
  popup.document.close();
}
async function renderRelatorios() {
  const [vendas, produtos, clientes] = await Promise.all([getData('vendas'), getData('produtos'), getData('clientes')]);
  const tV = vendas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const hoje = new Date().toISOString().slice(0,10);
  const inicioMes = hoje.slice(0,8) + '01';
  const data = await carregarDadosRelatorios();
  const rows = montarLinhasRelatorio(data, 'todos', inicioMes, hoje);
  return header('Relatórios', 'Indicadores, movimentos, atividades e impressão por período', 'var(--primary)',
    '<button class="btn btn-light" onclick="imprimirRelatorio(\'todos\')"><i class="fas fa-print"></i> Imprimir relatório</button>', 'fa-chart-bar') +
    '<div class="metric-grid">' +
    '<div class="metric-card"><div class="label">Total Vendas</div><div class="value">' + vendas.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">Faturamento</div><div class="value">' + fmt(tV) + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--info)"><div class="label">Ticket Médio</div><div class="value">' + (vendas.length ? fmt(tV / vendas.length) : fmt(0)) + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--warning)"><div class="label">Produtos</div><div class="value">' + produtos.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--purple)"><div class="label">Clientes</div><div class="value">' + clientes.length + '</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-filter"></i> Filtros do relatório</h3></div>' +
    '<div class="form-grid"><div class="form-group"><label>Tipo de relatório</label><select id="relatorioTipo"><option value="todos">Todos os relatórios</option><option value="movimentos">Movimentos</option><option value="atividades">Atividades e auditoria</option></select></div>' +
    '<div class="form-group"><label>Data inicial</label><input type="date" id="relatorioInicio" value="' + inicioMes + '"></div>' +
    '<div class="form-group"><label>Data final</label><input type="date" id="relatorioFim" value="' + hoje + '"></div></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-primary" onclick="atualizarRelatorio()"><i class="fas fa-search"></i> Aplicar filtros</button>' +
    '<button class="btn btn-success" onclick="imprimirRelatorio(\'movimentos\')"><i class="fas fa-print"></i> Imprimir movimentos</button>' +
    '<button class="btn btn-info" onclick="imprimirRelatorio(\'atividades\')"><i class="fas fa-print"></i> Imprimir atividades</button></div></div>' +
    '<div id="relatorioResumo"><div class="metric-grid"><div class="metric-card"><div class="label">Registos no mês</div><div class="value">' + rows.length + '</div></div><div class="metric-card"><div class="label">Total de vendas</div><div class="value">' + fmt(tV) + '</div></div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list-alt"></i> Movimentos e atividades</h3></div><div id="relatorioResultado">' + htmlTabelaRelatorio(rows) + '</div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-download"></i> Exportar dados</h3></div><div style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn btn-success" onclick="exportarBackupCompleto()"><i class="fas fa-database"></i> Backup JSON</button>' +
    '<button class="btn btn-info" onclick="exportarVendasCSV()"><i class="fas fa-file-csv"></i> Vendas CSV</button>' +
    '<button class="btn btn-primary" onclick="exportarProdutos()"><i class="fas fa-file-excel"></i> Produtos Excel</button></div></div>';
}
async function exportarBackupCompleto() {
  const data = {};
  for (const s of DB.stores) { try { data[s] = await DB.getAll(s); } catch (e) { data[s] = []; } }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'kanawa_backup_' + Date.now() + '.json'; a.click();
  URL.revokeObjectURL(url); toast('Backup exportado', 'success');
}
async function exportarVendasCSV() {
  const vendas = await getData('vendas');
  let csv = 'Nº,Cliente,Total,Pagamento,Status,Data\n';
  vendas.forEach(v => { csv += '"' + (v.numeroFatura || v.id) + '","' + (v.clienteNome || '') + '",' + v.total + ',' + (v.pagamento || '') + ',' + (v.status || '') + ',' + v.data + '\n'; });
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'vendas_' + Date.now() + '.csv'; a.click();
  URL.revokeObjectURL(url); toast('CSV exportado', 'success');
}

/* ====== USUÁRIOS ====== */
async function renderUsuarios() {
  if (!podeAcessar('usuarios') || !window.KanawaCloud || !KanawaCloud.ready) {
    return '<div class="card"><h3>Gestão de equipa indisponível</h3><p>Entre com uma conta proprietária ou administradora da empresa.</p></div>';
  }
  try {
    const members = await KanawaCloud.listCompanyMembers();
    const rows = members.map(function (member) {
      const statusLabel = member.status === 'active' ? 'Ativo' : (member.status === 'invited' ? 'Convite pendente' : 'Suspenso');
      const statusColor = member.status === 'active' ? 'success' : (member.status === 'invited' ? 'warning' : 'danger');
      const roleLabels = { owner: 'Proprietário', admin: 'Administrador', manager: 'Gerente', operator: 'Operador', cashier: 'Caixa', accountant: 'Contabilista', viewer: 'Visualizador' };
      return [
        '<strong>' + esc(member.full_name || 'Utilizador') + '</strong>',
        esc(member.email || '-'),
        badge(roleLabels[member.role] || member.role, 'primary'),
        badge(statusLabel, statusColor),
        '<small>' + Object.keys(member.permissions || {}).length + ' módulos autorizados</small>',
        (member.role !== 'owner' && member.role !== 'admin' && member.status !== 'invited')
          ? '<button class="btn btn-sm btn-primary" onclick="editarPermissoesUsuario(\'' + esc(member.user_id) + '\')"><i class="fas fa-user-shield"></i> Acessos</button>'
          : (member.status === 'invited' ? '<span class="badge badge-warning">Aguardando convite</span>' : '<span class="badge badge-secondary">Protegido</span>')
      ];
    });
    return header('Equipa e permissões', members.length + ' membros', 'var(--danger)',
      '<button class="btn btn-success" onclick="abrirModalUsuario()"><i class="fas fa-envelope"></i> Convidar utilizador</button>', 'fa-user-shield') +
      '<div class="card"><p style="margin-bottom:12px;color:var(--text-muted)">As permissões são aplicadas no servidor por empresa e por módulo. Os utilizadores recebem um convite por email; não crie nem guarde senhas neste dispositivo.</p>' +
      table(['Nome', 'Email', 'Perfil', 'Estado', 'Permissões', 'Ações'], rows) + '</div>';
  } catch (error) {
    return header('Equipa e permissões', 'Não foi possível carregar os membros', 'var(--danger)', '', 'fa-user-shield') +
      '<div class="card"><p>' + esc(error.message || 'Erro ao consultar a equipa.') + '</p></div>';
  }
}
const TEAM_PERMISSION_ACTIONS = [
  ['ver','Ver'],['criar','Criar'],['editar','Editar'],['excluir','Excluir'],
  ['aprovar','Aprovar'],['cancelar','Cancelar'],['exportar','Exportar'],['importar','Importar'],['configurar','Configurar']
];
const TEAM_RESERVED_MODULES = new Set(['usuarios','auditoria','config','modulos','licencas','integracoes']);
async function editarPermissoesUsuario(userId) {
  if (!window.KanawaCloud || !KanawaCloud.ready || !podeAcessar('usuarios')) {
    toast('Apenas o administrador pode configurar acessos.', 'error');
    return;
  }
  try {
    const members = await KanawaCloud.listCompanyMembers();
    const member = members.find(item => item.user_id === userId);
    if (!member || ['owner','admin'].includes(member.role)) {
      toast('Este acesso está protegido ou o utilizador não foi encontrado.', 'warning');
      return;
    }
    const grants = member.permissions || {};
    const modules = MENU.filter(module => !TEAM_RESERVED_MODULES.has(module.id));
    const roleOptions = [['manager','Gerente'],['operator','Operador'],['cashier','Caixa'],['accountant','Contabilista'],['viewer','Visualizador']];
    const roleSelect = roleOptions.map(([value,label]) => '<option value="' + value + '"' + (member.role === value ? ' selected' : '') + '>' + label + '</option>').join('');
    const moduleControls = modules.map(module => {
      const current = new Set(Array.isArray(grants[module.id]) ? grants[module.id] : []);
      const controls = TEAM_PERMISSION_ACTIONS.map(([action,label]) =>
        '<label class="team-permission-action"><input type="checkbox" data-access-module="' + esc(module.id) + '" data-access-action="' + action + '"' + (current.has(action) ? ' checked' : '') + '> ' + label + '</label>'
      ).join('');
      return '<details class="team-permission-module"><summary><strong>' + esc(module.label) + '</strong><span>' + current.size + ' ações</span></summary><div class="team-permission-actions">' + controls + '</div></details>';
    }).join('');
    openModal('Permissões de ' + (member.full_name || member.email || 'utilizador'),
      '<div class="form-grid"><div class="form-group"><label>Perfil</label><select id="teamAccessRole">' + roleSelect + '</select></div>' +
      '<div class="form-group"><label>Estado da conta</label><select id="teamAccessStatus"><option value="active"' + (member.status === 'active' ? ' selected' : '') + '>Ativo</option><option value="suspended"' + (member.status === 'suspended' ? ' selected' : '') + '>Suspenso</option></select></div></div>' +
      '<div class="card"><div class="card-header"><strong>Módulos e ações autorizadas</strong><span class="badge badge-info">' + modules.length + ' módulos</span></div>' +
      '<p style="color:var(--text-muted);font-size:.82rem;margin-bottom:10px">Marque apenas as ações necessárias. Os módulos administrativos e as integrações são reservados ao administrador.</p>' +
      '<div class="team-permission-list">' + moduleControls + '</div></div>' +
      '<button class="btn btn-primary btn-block" onclick="guardarPermissoesUsuario(\'' + esc(userId) + '\')"><i class="fas fa-save"></i> Guardar permissões</button>');
  } catch (error) {
    toast(error.message || 'Não foi possível carregar as permissões.', 'error');
  }
}
async function guardarPermissoesUsuario(userId) {
  const role = $('teamAccessRole') && $('teamAccessRole').value;
  const status = $('teamAccessStatus') && $('teamAccessStatus').value;
  if (!role || !status) return toast('Confirme o perfil e o estado.', 'warning');
  const permissions = {};
  document.querySelectorAll('[data-access-module][data-access-action]:checked').forEach(input => {
    const moduleId = input.dataset.accessModule;
    const action = input.dataset.accessAction;
    if (!permissions[moduleId]) permissions[moduleId] = [];
    if (!permissions[moduleId].includes(action)) permissions[moduleId].push(action);
  });
  try {
    await KanawaCloud.updateTeamMemberAccess({ user_id: userId, role, status, permissions });
    toast('Permissões guardadas no PostgreSQL. O utilizador recebe as alterações na próxima atualização da sessão.', 'success');
    closeModal();
    openModule('usuarios');
  } catch (error) {
    toast(error.message || 'Não foi possível guardar as permissões.', 'error');
  }
}
function abrirModalUsuario() {
  openModal('Convidar utilizador',
    '<div class="form-group"><label>Nome completo *</label><input id="uNome" autocomplete="name"></div>' +
    '<div class="form-group"><label>Email *</label><input id="uEmail" type="email" autocomplete="email"></div>' +
    '<div class="form-group"><label>Perfil de acesso</label><select id="uPerfil">' +
    '<option value="manager">Gerente</option><option value="operator">Operador</option><option value="cashier">Caixa</option>' +
    '<option value="accountant">Contabilista</option><option value="viewer">Visualizador</option></select></div>' +
    '<p style="font-size:.8rem;color:var(--text-muted);margin:10px 0">O utilizador receberá um email para confirmar a conta. As permissões iniciais serão atribuídas pelo perfil e aplicadas no servidor.</p>' +
    '<button class="btn btn-primary btn-block" onclick="salvarUsuario()"><i class="fas fa-paper-plane"></i> Enviar convite</button>');
}
async function salvarUsuario() {
  const fullName = $('uNome').value.trim(), email = $('uEmail').value.trim(), role = $('uPerfil').value;
  if (!fullName || !email) { toast('Preencha o nome e o email.', 'warning'); return; }
  if (!window.KanawaCloud || !KanawaCloud.ready) { toast('É necessário iniciar sessão na nuvem.', 'error'); return; }
  try {
    await KanawaCloud.inviteMember({ full_name: fullName, email: email, role: role });
    toast('Convite enviado para ' + email + '.', 'success');
    closeModal();
    openModule('usuarios');
  } catch (error) {
    toast(error.message || 'Não foi possível enviar o convite.', 'error');
  }
}

/* ====== AUDITORIA ====== */
async function renderAuditoria() {
  if (!podeAcessar('auditoria')) return '<div class="card"><h3>Sem permissão</h3></div>';
  const a = await getData('auditoria');
  const rows = a.slice(-100).reverse().map(x => [fmtDT(x.data), esc(x.usuario || '-'), badge(x.acao, 'info'), esc(x.modulo), '<small>' + esc((JSON.stringify(x.detalhes) || '').slice(0, 60)) + '...</small>']);
  return header('Auditoria', a.length + ' registros', 'var(--purple)', '', 'fa-history') + '<div class="card">' + table(['Data', 'Usuário', 'Ação', 'Módulo', 'Detalhes'], rows) + '</div>';
}
async function registrarAuditoria(acao, modulo, detalhes) { const u = JSON.parse(localStorage.getItem('kanawa_user') || '{}'); await saveData('auditoria', { acao, modulo, detalhes, usuario: u.nome || 'Admin', data: now() }); }

/* ====== MÓDULOS ====== */
async function renderModulos() {
  const rows = MENU.map((m, i) => [i + 1, '<i class="fas ' + m.icon + '" style="font-size:1.3rem;color:var(--primary)"></i>', '<code>' + m.id + '</code>', '<strong>' + m.label + '</strong>', badge(podeAcessar(m.id) ? 'Acessível' : 'Bloqueado', podeAcessar(m.id) ? 'success' : 'danger')]);
  return header('Módulos', MENU.length + ' módulos', 'var(--purple)', '', 'fa-code') + '<div class="card">' + table(['#', 'Ícone', 'ID', 'Nome', 'Status'], rows) + '</div>';
}
/* ====== CONFIGURAÇÕES ====== */
async function renderConfig() {
  if (!podeAcessar('config')) return '<div class="card"><h3>Sem permissão</h3></div>';
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const regras = JSON.parse(localStorage.getItem('kanawa_regras') || '{}');
  const logoPreview = (emp.logo && emp.logo.indexOf('data:') === 0) ? emp.logo : 'logo.png';
  const counts = {};
  for (const s of DB.stores) { try { counts[s] = await DB.count(s); } catch (e) { counts[s] = 0; } }
  const countRows = Object.entries(counts).map(([k, v]) => ['<code>' + k + '</code>', badge(v, 'info'), '<button class="btn btn-sm btn-danger" onclick="limparColecao(\'' + k + '\')"><i class="fas fa-trash"></i></button>']);
  return header('Configurações', 'Definições completas do sistema', 'var(--primary)', '', 'fa-cog') +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-building"></i> Dados da Empresa</h3></div>' +
    '<div class="form-grid">' +
    '<div class="form-group full"><label>Nome da Firma / Razão Social *</label><input id="cfgFirma" value="' + esc(emp.firma || emp.nome || '') + '" placeholder="Ex: KANAWA SOFT, LDA"></div>' +
    '<div class="form-group full"><label>Nome Comercial (opcional)</label><input id="cfgNome" value="' + esc(emp.nome || '') + '" placeholder="Ex: Kanawa Soft"></div>' +
    '<div class="form-group"><label>NIF *</label><input id="cfgNif" value="' + esc(emp.nif || '') + '"></div>' +
    '<div class="form-group"><label>Nº Alvará</label><input id="cfgAlvara" value="' + esc(emp.alvara || '') + '"></div>' +
    '<div class="form-group"><label>Regime Fiscal</label><select id="cfgRegime"><option value="geral" ' + (emp.regime === 'geral' ? 'selected' : '') + '>Geral (IVA 14%)</option><option value="simplificado" ' + (emp.regime === 'simplificado' ? 'selected' : '') + '>Simplificado (7%)</option><option value="isento" ' + (emp.regime === 'isento' ? 'selected' : '') + '>Isento</option></select></div>' +
    '<div class="form-group"><label>Telefone</label><input id="cfgTel" value="' + esc(emp.telefone || '') + '"></div>' +
    '<div class="form-group"><label>Email</label><input id="cfgEmail" value="' + esc(emp.email || '') + '"></div>' +
    '<div class="form-group full"><label>Endereço Completo</label><input id="cfgEnd" value="' + esc(emp.endereco || '') + '"></div>' +
    '<div class="form-group"><label>Website</label><input id="cfgSite" value="' + esc(emp.website || '') + '"></div>' +
    '<div class="form-group"><label>Banco</label><input id="cfgBanco" value="' + esc(emp.banco || '') + '"></div>' +
    '<div class="form-group full"><label>IBAN</label><input id="cfgIban" value="' + esc(emp.iban || '') + '"></div>' +
    '<div class="form-group full"><label>🖼️ Logo da Empresa (usado na fatura)</label>' +
    '<div class="image-picker" onclick="document.getElementById(\'cfgLogoInput\').click()" style="height:160px">' +
    '<div class="placeholder" id="cfgLogoPlaceholder" style="' + (emp.logo && emp.logo.indexOf('data:') === 0 ? 'display:none' : '') + '"><i class="fas fa-image"></i><span style="font-size:.85rem">Clique para escolher a imagem</span></div>' +
    '<img id="cfgLogoPreview" src="' + logoPreview + '" style="' + (emp.logo && emp.logo.indexOf('data:') === 0 ? '' : 'display:none') + '" onerror="this.style.display=\'none\'"></div>' +
    '<input type="file" id="cfgLogoInput" accept="image/*" style="display:none" onchange="escolherLogoEmpresa(this)">' +
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
    '<button class="btn btn-sm btn-secondary" type="button" onclick="document.getElementById(\'cfgLogoInput\').click()"><i class="fas fa-folder-open"></i> Escolher imagem</button>' +
    '<button class="btn btn-sm btn-danger" type="button" onclick="removerLogoEmpresa()"><i class="fas fa-undo"></i> Restaurar logo.png</button></div></div></div>' +
    '<button class="btn btn-success btn-lg" style="margin-top:16px" onclick="salvarConfigEmpresa()"><i class="fas fa-save"></i> Salvar Empresa</button></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-sliders-h"></i> Regras do Sistema</h3></div>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label><input type="checkbox" id="cfgAplicarIVA" ' + (regras.aplicarIVA !== false ? 'checked' : '') + '> Aplicar IVA automaticamente</label></div>' +
    '<div class="form-group"><label><input type="checkbox" id="cfgAplicarIRT" ' + (regras.aplicarIRT ? 'checked' : '') + '> Calcular IRT</label></div>' +
    '<div class="form-group"><label><input type="checkbox" id="cfgControlarEstoque" ' + (regras.controlarEstoque !== false ? 'checked' : '') + '> Controlar estoque</label></div>' +
    '<div class="form-group"><label><input type="checkbox" id="cfgEmitirFatura" ' + (regras.emitirFatura !== false ? 'checked' : '') + '> Emitir fatura</label></div>' +
    '<div class="form-group"><label><input type="checkbox" id="cfgCredito" ' + (regras.credito !== false ? 'checked' : '') + '> Permitir crédito</label></div>' +
    '<div class="form-group"><label><input type="checkbox" id="cfgGavetaAuto" ' + (localStorage.getItem('kanawa_gaveta_auto') !== 'false' ? 'checked' : '') + '> Abrir gaveta automaticamente</label></div>' +
    '<div class="form-group"><label>Estoque Mínimo Padrão</label><input type="number" id="cfgEstMin" value="' + (regras.estoqueMin || 10) + '"></div>' +
    '<div class="form-group"><label>Desconto Máximo (%)</label><input type="number" id="cfgDescMax" value="' + (regras.descontoMax || 50) + '"></div></div>' +
    '<button class="btn btn-success btn-lg" style="margin-top:16px" onclick="salvarRegras()"><i class="fas fa-save"></i> Salvar Regras</button></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-globe-africa"></i> Região, idioma e formatos</h3></div>' +
    '<p style="font-size:.85rem;color:var(--text-muted)">Preferências de apresentação deste dispositivo. A moeda e o fuso devem ser confirmados pela empresa antes de emitir documentos.</p>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label>Moeda principal</label><select id="cfgMoeda"><option value="AOA">Kwanza (AOA)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option></select></div>' +
    '<div class="form-group"><label>Idioma</label><select id="cfgIdioma"><option value="pt-AO">Português (Angola)</option><option value="pt-PT">Português (Portugal)</option><option value="en">English</option><option value="fr">Français</option></select></div>' +
    '<div class="form-group"><label>Fuso horário</label><select id="cfgFuso"><option value="Africa/Luanda">Africa/Luanda (WAT)</option><option value="Europe/Lisbon">Europe/Lisbon</option><option value="UTC">UTC</option></select></div>' +
    '<div class="form-group"><label>Formato de data</label><select id="cfgDataFormato"><option value="dd/MM/yyyy">DD/MM/AAAA</option><option value="yyyy-MM-dd">AAAA-MM-DD</option><option value="MM/dd/yyyy">MM/DD/AAAA</option></select></div>' +
    '<div class="form-group"><label>Casas decimais</label><select id="cfgDecimais"><option value="0">0</option><option value="2">2</option></select></div>' +
    '</div>' +
    '<div class="card-header" style="margin-top:18px"><h3 class="card-title"><i class="fas fa-file-invoice"></i> Numeração e documentos</h3></div>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label>Prefixo de documentos</label><input id="cfgDocPrefixo" maxlength="12" placeholder="Ex.: DPS"></div>' +
    '<div class="form-group"><label>Observação padrão em documentos</label><input id="cfgDocObs" maxlength="180" placeholder="Obrigado pela preferência."></div>' +
    '<div class="form-group"><label>Prazo padrão de pagamento (dias)</label><input id="cfgPrazoPagamento" type="number" min="0" max="365" value="0"></div>' +
    '<div class="form-group"><label>Rodapé dos documentos</label><input id="cfgDocRodape" maxlength="180" placeholder="Contacto, endereço ou mensagem"></div>' +
    '</div>' +
    '<div class="card-header" style="margin-top:18px"><h3 class="card-title"><i class="fas fa-bell"></i> Preferências e manutenção</h3></div>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label><input id="cfgAvisoEstoque" type="checkbox" checked> Mostrar aviso de stock baixo</label></div>' +
    '<div class="form-group"><label><input id="cfgAvisoBackup" type="checkbox" checked> Mostrar lembrete de backup</label></div>' +
    '<div class="form-group"><label><input id="cfgConfirmarAcao" type="checkbox" checked> Pedir confirmação antes de ações destrutivas</label></div>' +
    '<div class="form-group"><label>Tempo de sessão preferido (minutos)</label><select id="cfgSessao"><option value="30">30 minutos</option><option value="60">1 hora</option><option value="120">2 horas</option><option value="480">8 horas</option></select></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-success" onclick="salvarPreferenciasConfig()"><i class="fas fa-save"></i> Guardar preferências</button><button class="btn btn-secondary" onclick="openModule(\'usuarios\')"><i class="fas fa-users-cog"></i> Utilizadores e permissões</button><button class="btn btn-secondary" onclick="openModule(\'auditoria\')"><i class="fas fa-clipboard-list"></i> Auditoria</button><button class="btn btn-secondary" onclick="openModule(\'dispositivos\')"><i class="fas fa-print"></i> Impressoras e dispositivos</button></div>' +
    '<p style="font-size:.78rem;color:var(--text-muted);margin-top:10px">Estas preferências adicionais são guardadas localmente neste navegador. O tempo de sessão e os avisos só alteram o comportamento quando os respetivos módulos os consultam; não substituem políticas de segurança do servidor.</p></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-server"></i> Servidor (Opcional)</h3></div>' +
    '<p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px">Os dados são guardados no PostgreSQL central e sincronizados com o cache local para permitir trabalho temporário sem internet.</p>' +
    '<div class="form-grid">' +
    '<div class="form-group full"><label>Base de dados central</label><input value="Supabase PostgreSQL — Kanawa Cloud" disabled></div>' +
    '<div class="form-group"><label>Status</label><div style="padding:10px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + (API_ONLINE ? '#4ade80' : '#f87171') + ';margin-right:6px"></span>' + (API_ONLINE ? 'Conectado' : 'Desconectado') + '</div></div></div>' +
    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
    '<span style="font-size:.8rem;color:var(--text-muted);padding:10px">Ligação configurada pela D.PEDRO SOLUÇÕES</span>' +
    '<button class="btn btn-primary" onclick="testarAPI()"><i class="fas fa-check"></i> Testar</button>' +
    '<button class="btn btn-info" onclick="syncNow(true)"><i class="fas fa-sync"></i> Sincronizar Agora</button>' +
    (podeAcessar('integracoes') ? '<button class="btn btn-secondary" onclick="openModule(\'integracoes\')"><i class="fas fa-plug"></i> Centro de Integrações</button>' : '') + '</div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-database"></i> Cache local (IndexedDB) + PostgreSQL central</h3></div>' + table(['Coleção', 'Registros', 'Ações'], countRows) + '</div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-tools"></i> Ferramentas</h3></div>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
    '<button class="btn btn-warning" onclick="recarregarDemo()"><i class="fas fa-seedling"></i> Dados Demo</button>' +
    '<button class="btn btn-info" onclick="exportarBackupCompleto()"><i class="fas fa-download"></i> Backup</button>' +
    '<button class="btn btn-danger" onclick="resetTotal()"><i class="fas fa-bomb"></i> Reset Total</button></div></div>';
}
function carregarPreferenciasConfig() {
  try { return JSON.parse(localStorage.getItem('kanawa_config_preferencias') || '{}'); }
  catch (error) { return {}; }
}
function aplicarPreferenciasConfigNaTela() {
  const p = carregarPreferenciasConfig();
  const defaults = { moeda: 'AOA', idioma: 'pt-AO', fuso: 'Africa/Luanda', formatoData: 'dd/MM/yyyy', decimais: '0', docPrefixo: '', docObs: '', prazoPagamento: '0', docRodape: '', avisoEstoque: true, avisoBackup: true, confirmarAcao: true, sessao: '60' };
  const v = Object.assign({}, defaults, p);
  const campos = { cfgMoeda: 'moeda', cfgIdioma: 'idioma', cfgFuso: 'fuso', cfgDataFormato: 'formatoData', cfgDecimais: 'decimais', cfgDocPrefixo: 'docPrefixo', cfgDocObs: 'docObs', cfgPrazoPagamento: 'prazoPagamento', cfgDocRodape: 'docRodape', cfgSessao: 'sessao' };
  Object.entries(campos).forEach(([id, key]) => { const el = $(id); if (el) el.value = v[key]; });
  [['cfgAvisoEstoque','avisoEstoque'],['cfgAvisoBackup','avisoBackup'],['cfgConfirmarAcao','confirmarAcao']].forEach(([id,key]) => { const el=$(id); if(el) el.checked = v[key] !== false; });
}
function salvarPreferenciasConfig() {
  const valor = (id) => $(id) ? $(id).value : '';
  const marcado = (id) => !!($(id) && $(id).checked);
  const p = {
    moeda: valor('cfgMoeda'), idioma: valor('cfgIdioma'), fuso: valor('cfgFuso'),
    formatoData: valor('cfgDataFormato'), decimais: valor('cfgDecimais'),
    docPrefixo: valor('cfgDocPrefixo').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0,12),
    docObs: valor('cfgDocObs').trim().slice(0,180), prazoPagamento: String(Math.max(0, Math.min(365, Number(valor('cfgPrazoPagamento')) || 0))),
    docRodape: valor('cfgDocRodape').trim().slice(0,180),
    avisoEstoque: marcado('cfgAvisoEstoque'), avisoBackup: marcado('cfgAvisoBackup'),
    confirmarAcao: marcado('cfgConfirmarAcao'), sessao: ['30','60','120','480'].includes(valor('cfgSessao')) ? valor('cfgSessao') : '60'
  };
  localStorage.setItem('kanawa_config_preferencias', JSON.stringify(p));
  toast('Preferências guardadas neste dispositivo. Não alteram por si só regras fiscais nem segurança do servidor.', 'success');
}
async function salvarConfigEmpresa() {
  const empAtual = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
  const logoAtual = empAtual.logo || 'logo.png';
  const logoNovo = localStorage.getItem('kanawa_logo_temp') || logoAtual;
  const e = { firma: $('cfgFirma').value.trim(), nome: $('cfgNome').value.trim(), nif: $('cfgNif').value.trim(), alvara: $('cfgAlvara').value, regime: $('cfgRegime').value, telefone: $('cfgTel').value.trim(), email: $('cfgEmail').value.trim(), endereco: $('cfgEnd').value.trim(), website: $('cfgSite').value.trim(), banco: $('cfgBanco').value, iban: $('cfgIban').value.trim(), logo: logoNovo };
  if (!e.firma && !e.nome) { toast('Informe a razão social ou o nome comercial.', 'warning'); return; }
  if (window.KanawaCloud && KanawaCloud.ready) {
    try {
      await KanawaCloud.updateCompany(e);
    } catch (error) {
      toast(error.message || 'Não foi possível atualizar a empresa na nuvem.', 'error');
      return;
    }
  }
  localStorage.setItem('kanawa_empresa', JSON.stringify(e));
  const cachedCompany = await DB.get('empresas', 1) || { id: 1 };
  await DB.put('empresas', Object.assign({}, cachedCompany, e, { id: 1 }));
  localStorage.removeItem('kanawa_logo_temp');
  aplicarLogo();
  if ($('topbarEmpresa')) $('topbarEmpresa').textContent = e.firma || e.nome || 'Kanawa Soft';
  toast(window.KanawaCloud && KanawaCloud.ready ? 'Dados principais da empresa atualizados na nuvem. Os campos adicionais permanecem locais.' : 'Dados guardados apenas neste dispositivo; ainda não foram sincronizados.', 'warning');
}
function escolherLogoEmpresa(input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 2 * 1024 * 1024) { toast('Imagem muito grande (máx 2MB)', 'warning'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const url = e.target.result;
    const prev = $('cfgLogoPreview'); const ph = $('cfgLogoPlaceholder');
    if (prev) { prev.src = url; prev.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
    localStorage.setItem('kanawa_logo_temp', url);
    toast('✅ Logo carregada — clique em Salvar', 'success');
  };
  reader.readAsDataURL(file);
}
function removerLogoEmpresa() {
  localStorage.removeItem('kanawa_logo_temp');
  const prev = $('cfgLogoPreview'); const ph = $('cfgLogoPlaceholder');
  if (prev) { prev.src = 'logo.png'; prev.style.display = 'none'; }
  if (ph) ph.style.display = 'block';
  toast('Logo restaurada para logo.png', 'info');
}
function salvarRegras() {
  const r = { aplicarIVA: $('cfgAplicarIVA').checked, aplicarIRT: $('cfgAplicarIRT').checked, controlarEstoque: $('cfgControlarEstoque').checked, emitirFatura: $('cfgEmitirFatura').checked, credito: $('cfgCredito').checked, estoqueMin: int($('cfgEstMin').value, 10), descontoMax: int($('cfgDescMax').value, 50) };
  localStorage.setItem('kanawa_regras', JSON.stringify(r));
  localStorage.setItem('kanawa_gaveta_auto', $('cfgGavetaAuto').checked ? 'true' : 'false');
  toast('✅ Regras salvas', 'success');
}
function salvarConfigAPI() { toast('A ligação central é gerida automaticamente pelo Kanawa Soft Cloud.', 'info'); }
async function testarAPI() { const ok = await API.checkHealth(); toast(ok ? '✅ Servidor Online' : '❌ Servidor Offline', ok ? 'success' : 'warning'); }
async function limparColecao(s) { if (!confirm('Limpar ' + s + '?')) return; await DB.clear(s); toast('Limpo', 'info'); openModule('config'); }
async function recarregarDemo() { if (!confirm('Carregar demo?')) return; await seedDemo(); pdvCache.ts = 0; toast('Demo carregado', 'success'); openModule('config'); }
async function resetTotal() {
  if (!confirm('⚠️ APAGAR TODOS OS DADOS?')) return;
  if (!confirm('Confirme novamente')) return;
  for (const s of DB.stores) { try { await DB.clear(s); } catch (e) { } }
  localStorage.clear();
  location.reload();
}

/* ====== SETUP / AUTH ====== */
function setupNextStep(s) {
  if (setupStep === 1) {
    const fields = [$('setupNome'), $('setupNif'), $('setupEmail')];
    if (!fields[0].value.trim() || !fields[1].value.trim() || fields.some(field => field.value && !field.checkValidity())) {
      const invalid = fields.find(field => !field.checkValidity());
      if (invalid) invalid.reportValidity();
      toast('Confirme o nome, NIF e formato do email da empresa.', 'warning');
      return;
    }
  }
  if (setupStep === 2) {
    const fields = [$('setupAdminNome'), $('setupAdminEmail'), $('setupAdminSenha')];
    const invalid = fields.find(field => !field.checkValidity() || !field.value.trim());
    if (invalid) {
      invalid.reportValidity();
      toast('Preencha o nome, email válido e uma senha com pelo menos 8 caracteres.', 'warning');
      return;
    }
  }
  if (s === 3) { $('setupResumo').innerHTML = '<div><strong>🏢 Empresa:</strong> ' + esc($('setupNome').value) + '</div><div><strong>📋 NIF:</strong> ' + esc($('setupNif').value) + '</div><div><strong>👤 Admin:</strong> ' + esc($('setupAdminNome').value) + '</div>'; }
  const prev = $('setupStep' + setupStep), next = $('setupStep' + s);
  if (prev) prev.style.display = 'none';
  if (next) next.style.display = 'block';
  $$('.setup-step').forEach(el => { const x = parseInt(el.dataset.step); el.classList.toggle('active', x === s); el.classList.toggle('done', x < s); });
  setupStep = s;
}
async function finalizarSetup() {
  const companyName = $('setupNome').value.trim();
  const taxId = $('setupNif').value.trim();
  const fullName = $('setupAdminNome').value.trim();
  const email = $('setupAdminEmail').value.trim();
  const password = $('setupAdminSenha').value;
  if (!companyName || !taxId || !fullName || !email || password.length < 8) {
    toast('Preencha os dados e utilize uma senha com pelo menos 8 caracteres.', 'warning');
    return;
  }

  const company = {
    id: 1, firma: companyName, nome: companyName, nif: taxId,
    regime: $('setupRegime').value, telefone: $('setupTelefone').value,
    email: $('setupEmail').value, endereco: $('setupEndereco').value,
    logo: 'logo.png', dataCriacao: now()
  };
  const localUser = { id: 1, nome: fullName, email: email, perfil: 'admin', role: 'admin', ativo: true, dataCriacao: now() };

  try {
    const result = await KanawaCloud.signUp({
      email: email,
      password: password,
      fullName: fullName,
      phone: $('setupTelefone').value,
      companyName: companyName,
      taxId: taxId,
      taxRegime: $('setupRegime').value
    });

    const existingLocalCompany = await DB.get('empresas', 1);
    const oldNif = String(existingLocalCompany && (existingLocalCompany.nif || existingLocalCompany.tax_id) || '').replace(/\D/g, '');
    const newNif = String(company.nif || '').replace(/\D/g, '');
    const oldName = String(existingLocalCompany && (existingLocalCompany.nome || existingLocalCompany.firma || existingLocalCompany.legal_name) || '').trim().toLowerCase();
    const newName = String(company.nome || company.firma || '').trim().toLowerCase();
    const sameLocalCompany = existingLocalCompany && ((oldNif && newNif && oldNif === newNif) || (!oldNif && !newNif && oldName && oldName === newName));
    if (existingLocalCompany && !sameLocalCompany) {
      for (const store of DB_STORES) if (!KanawaCloud.isLocalOnly(store)) await DB.clear(store);
    }
    localStorage.setItem('kanawa_legacy_company', JSON.stringify(sameLocalCompany ? existingLocalCompany : company));
    await DB.put('empresas', company);
    await DB.put('usuarios', localUser);
    if ($('setupCarregarDemo') && $('setupCarregarDemo').checked) await seedDemo();

    if (result.session && KanawaCloud.ready) {
      await activateCloudSession(KanawaCloud.context, true);
      mostrarAplicacaoAutenticada(KanawaCloud.context);
      toast('Conta criada e empresa ligada à base de dados central.', 'success');
    } else {
      localStorage.setItem('kanawa_pending_email', email);
      if ($('setupWizard')) $('setupWizard').classList.remove('active');
      if ($('authScreen')) $('authScreen').classList.add('active');
      if ($('loginEmail')) $('loginEmail').value = email;
      toast('Conta criada. Confirme o email recebido e depois entre no Kanawa Soft.', 'success');
    }
  } catch (e) {
    console.error('Erro ao criar conta Kanawa:', e);
    toast('Não foi possível criar a conta: ' + (e.message || 'erro de ligação'), 'error');
  }
}

async function logout() {
  if (!confirm('Sair da conta Kanawa Soft?')) return;
  try { await KanawaCloud.signOut(); } catch (e) { console.warn('Logout:', e); }
  localStorage.removeItem('kanawa_user');
  if ($('app')) $('app').classList.remove('active');
  if ($('authScreen')) $('authScreen').classList.add('active');
}

/* ====== NOTIFICAÇÕES ====== */
async function criarNotificacao(titulo, mensagem, tipo, modulo) {
  const n = { titulo, mensagem, tipo: tipo || 'info', modulo: modulo || null, data: now(), lida: false };
  await saveData('notificacoes', n);
  updateNotifBadge();
  toast(titulo, tipo || 'info');
}
function updateNotifBadge() {
  DB.getAll('notificacoes').then(n => {
    const c = n.filter(x => !x.lida).length;
    const b = $('notifBadge');
    if (b) { b.style.display = c > 0 ? 'inline' : 'none'; b.textContent = c; }
  }).catch(() => { });
}
async function renderNotificacoes() {
  const notifs = await getData('notificacoes');
  const naoLidas = notifs.filter(n => !n.lida).length;
  const rows = notifs.slice().reverse().map(n =>
    '<div style="padding:14px;background:var(--bg);border-radius:10px;margin-bottom:10px;border-left:4px solid var(--' + (n.tipo || 'info') + ');' + (n.lida ? 'opacity:.6' : '') + '">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">' +
    '<div style="flex:1"><div style="font-weight:700">' + esc(n.titulo) + '</div>' +
    '<div style="font-size:.85rem;color:var(--text-muted);margin-top:4px">' + esc(n.mensagem) + '</div>' +
    '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px">' + fmtDT(n.data) + '</div></div>' +
    (!n.lida ? '<button class="btn btn-sm btn-success" onclick="marcarNotificacaoLida(' + n.id + ')"><i class="fas fa-check"></i></button>' : '') + '</div></div>'
  ).join('');
  return header('Notificações', notifs.length + ' total • ' + naoLidas + ' não lidas', 'var(--primary)',
    '<button class="btn btn-sm" onclick="marcarTodasLidas()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-check-double"></i> Marcar lidas</button>', 'fa-bell') +
    '<div class="card">' + (rows || emptyState('fa-bell-slash', 'Sem notificações')) + '</div>';
}
async function marcarNotificacaoLida(id) { const n = await DB.get('notificacoes', id); if (n) { n.lida = true; await saveData('notificacoes', n); updateNotifBadge(); openModule('notificacoes'); } }
async function marcarTodasLidas() { const all = await DB.getAll('notificacoes'); for (const n of all) { n.lida = true; await DB.put('notificacoes', n); } updateNotifBadge(); openModule('notificacoes'); }

/* ====== EXCLUIR ITEM GENÉRICO ====== */
async function excluirItem(store, id, modulo) {
  if (!confirm('Excluir registro?')) return;
  await deleteData(store, id);
  toast('Excluído', 'info');
  pdvCache.ts = 0;
  openModule(modulo || currentModule);
}

/* ====== MÓDULOS ADICIONAIS INTEGRADOS DO HTML ====== */

/* PRODUÇÃO */
async function renderProducao() {
  const producao = await getData('producao') || [];
  return header('Produção', producao.length + ' itens de produção', 'var(--purple)',
    '<button class="btn btn-success" onclick="abrirModalProducao()"><i class="fas fa-plus"></i> Novo Item</button>', 'fa-industry') +
    '<div class="card">' + table(['Código', 'Nome', 'Tipo', 'Status', 'Ações'],
      producao.map(p => [esc(p.codigo || '-'), '<strong>' + esc(p.nome) + '</strong>', badge(p.tipo || 'acabado', 'info'), badge(p.status === 'ativo' ? 'Ativo' : 'Inativo', p.status === 'ativo' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-primary" onclick="editarProducao(' + p.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'producao\',' + p.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
function abrirModalProducao() {
  openModal('Novo Item de Produção',
    '<div class="form-group"><label>Nome *</label><input id="prodNome"></div>' +
    '<div class="form-group"><label>Código</label><input id="prodCodigo" value="PROD-' + Date.now().toString().slice(-6) + '"></div>' +
    '<div class="form-group"><label>Tipo</label><select id="prodTipo"><option value="acabado">Acabado</option><option value="semi_acabado">Semi-acabado</option><option value="materia_prima">Matéria-prima</option></select></div>' +
    '<div class="form-group"><label>Descrição</label><textarea id="prodDesc" rows="2"></textarea></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarProducao()">Salvar</button>');
}
async function salvarProducao() {
  const nome = $('prodNome').value.trim(); if (!nome) { toast('Informe o nome', 'warning'); return; }
  await saveData('producao', { nome, codigo: $('prodCodigo').value, tipo: $('prodTipo').value, descricao: $('prodDesc').value, status: 'ativo', data: now() });
  toast('Item de produção criado', 'success'); closeModal(); openModule('producao');
}
async function editarProducao(id) { const i = await DB.get('producao', id); if (!i) return; const n = prompt('Novo nome:', i.nome); if (n) { i.nome = n; await saveData('producao', i); toast('Atualizado', 'success'); openModule('producao'); } }

/* ORDENS DE PRODUÇÃO */
async function renderOrdensProducao() {
  const ordens = await getData('ordensProducao') || [];
  return header('Ordens de Produção', ordens.length + ' ordens', 'var(--warning)',
    '<button class="btn btn-success" onclick="abrirModalOrdemProducao()"><i class="fas fa-plus"></i> Nova Ordem</button>', 'fa-clipboard-list') +
    '<div class="card">' + table(['Produto', 'Quantidade', 'Data', 'Status', 'Ações'],
      ordens.map(o => ['<strong>' + esc(o.produto || '-') + '</strong>', formatN(o.quantidade || 0), fmtD(o.data), badge(o.status === 'concluida' ? 'Concluída' : o.status === 'em_andamento' ? 'Em Andamento' : 'Pendente', o.status === 'concluida' ? 'success' : o.status === 'em_andamento' ? 'warning' : 'danger'),
      '<button class="btn btn-sm btn-primary" onclick="editarOrdemProducao(' + o.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'ordensProducao\',' + o.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
function abrirModalOrdemProducao() {
  openModal('Nova Ordem de Produção',
    '<div class="form-group"><label>Produto *</label><input id="opProduto"></div>' +
    '<div class="form-group"><label>Quantidade *</label><input id="opQtd" type="number" value="1" min="1"></div>' +
    '<div class="form-group"><label>Status</label><select id="opStatus"><option value="pendente">Pendente</option><option value="em_andamento">Em Andamento</option><option value="concluida">Concluída</option></select></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarOrdemProducao()">Salvar</button>');
}
async function salvarOrdemProducao() { const p = $('opProduto').value.trim(); if (!p) { toast('Informe o produto', 'warning'); return; } await saveData('ordensProducao', { produto: p, quantidade: int($('opQtd').value, 1), status: $('opStatus').value, data: now() }); toast('Ordem criada', 'success'); closeModal(); openModule('ordens-producao'); }
async function editarOrdemProducao(id) { const o = await DB.get('ordensProducao', id); if (!o) return; const s = prompt('Status (pendente, em_andamento, concluida):', o.status); if (s) { o.status = s; await saveData('ordensProducao', o); toast('Atualizada', 'success'); openModule('ordens-producao'); } }

/* MRP */
async function renderMRP() {
  const mrp = await getData('mrp') || [];
  return header('MRP - Planejamento', mrp.length + ' planos', 'var(--info)',
    '<button class="btn btn-success" onclick="calcularMRP()"><i class="fas fa-calculator"></i> Calcular MRP</button>', 'fa-cogs') +
    '<div class="card">' + table(['Produto', 'Demanda', 'Estoque', 'Necessidade', 'Status'],
      mrp.map(m => [esc(m.produto || '-'), formatN(m.demanda || 0), formatN(m.estoque || 0), '<strong>' + formatN(m.necessidade || 0) + '</strong>', badge(m.necessidade <= 0 ? 'OK' : 'Comprar', m.necessidade <= 0 ? 'success' : 'warning')])) + '</div>';
}
async function calcularMRP() {
  const produtos = await getData('produtos'); const estoque = await getData('estoque');
  if (produtos.length === 0) { toast('Nenhum produto cadastrado', 'warning'); return; }
  await DB.clear('mrp');
  for (const p of produtos) {
    const e = estoque.find(x => x.produtoId === p.id);
    const demanda = Math.floor(Math.random() * 100) + 10;
    const qtdEstoque = e ? (e.quantidade || 0) : 0;
    await saveData('mrp', { produtoId: p.id, produto: p.nome, demanda, estoque: qtdEstoque, necessidade: Math.max(0, demanda - qtdEstoque) });
  }
  toast('MRP calculado', 'success'); openModule('mrp');
}

/* BOM */
async function renderBOM() {
  const boms = await getData('boms') || [];
  return header('Lista de Materiais (BOM)', boms.length + ' BOMs', 'var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalBOM()"><i class="fas fa-plus"></i> Nova BOM</button>', 'fa-sitemap') +
    '<div class="card">' + table(['Produto', 'Material', 'Quantidade', 'Ações'],
      boms.map(b => ['<strong>' + esc(b.produto || '-') + '</strong>', esc(b.material || '-'), formatN(b.quantidade || 0),
      '<button class="btn btn-sm btn-primary" onclick="editarBOM(' + b.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'boms\',' + b.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
function abrirModalBOM() {
  openModal('Nova BOM',
    '<div class="form-group"><label>Produto *</label><input id="bomProduto"></div>' +
    '<div class="form-group"><label>Material *</label><input id="bomMaterial"></div>' +
    '<div class="form-group"><label>Quantidade *</label><input id="bomQtd" type="number" value="1" min="1"></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarBOM()">Salvar</button>');
}
async function salvarBOM() { const p = $('bomProduto').value.trim(); const m = $('bomMaterial').value.trim(); if (!p || !m) { toast('Preencha produto e material', 'warning'); return; } await saveData('boms', { produto: p, material: m, quantidade: int($('bomQtd').value, 1), data: now() }); toast('BOM criada', 'success'); closeModal(); openModule('bom'); }
async function editarBOM(id) { const b = await DB.get('boms', id); if (!b) return; const q = prompt('Nova quantidade:', b.quantidade); if (q) { b.quantidade = parseInt(q); await saveData('boms', b); toast('Atualizada', 'success'); openModule('bom'); } }

/* CUSTOS DE PRODUÇÃO */
async function renderCustosProducao() {
  const custos = await getData('custosProducao') || [];
  const total = custos.reduce((s, c) => s + (c.material || 0) + (c.maoObra || 0) + (c.indireto || 0), 0);
  return header('Custos de Produção', fmt(total) + ' em custos', 'var(--success)',
    '<button class="btn btn-success" onclick="abrirModalCustoProducao()"><i class="fas fa-plus"></i> Novo Custo</button>', 'fa-calculator') +
    '<div class="card">' + table(['Produto', 'Material', 'Mão de Obra', 'Indiretos', 'Total', 'Ações'],
      custos.map(c => { const t = (c.material || 0) + (c.maoObra || 0) + (c.indireto || 0); return ['<strong>' + esc(c.produto || '-') + '</strong>', fmt(c.material || 0), fmt(c.maoObra || 0), fmt(c.indireto || 0), '<strong>' + fmt(t) + '</strong>',
        '<button class="btn btn-sm btn-primary" onclick="editarCustoProducao(' + c.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'custosProducao\',' + c.id + ')"><i class="fas fa-trash"></i></button>']; })) + '</div>';
}
function abrirModalCustoProducao() {
  openModal('Novo Custo de Produção',
    '<div class="form-group"><label>Produto *</label><input id="custoProduto"></div>' +
    '<div class="form-group"><label>Custo de Material (Kz)</label><input id="custoMaterial" type="number" value="0"></div>' +
    '<div class="form-group"><label>Mão de Obra (Kz)</label><input id="custoMaoObra" type="number" value="0"></div>' +
    '<div class="form-group"><label>Custos Indiretos (Kz)</label><input id="custoIndireto" type="number" value="0"></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarCustoProducao()">Salvar</button>');
}
async function salvarCustoProducao() { const p = $('custoProduto').value.trim(); if (!p) { toast('Informe o produto', 'warning'); return; } await saveData('custosProducao', { produto: p, material: num($('custoMaterial').value, 0), maoObra: num($('custoMaoObra').value, 0), indireto: num($('custoIndireto').value, 0), data: now() }); toast('Custo registrado', 'success'); closeModal(); openModule('custos-producao'); }
async function editarCustoProducao(id) { const c = await DB.get('custosProducao', id); if (!c) return; const v = prompt('Novo custo de material:', c.material); if (v !== null) { c.material = parseFloat(v) || 0; await saveData('custosProducao', c); toast('Atualizado', 'success'); openModule('custos-producao'); } }

/* CONTROLE DE QUALIDADE */
async function renderControleQualidade() {
  const q = await getData('controleQualidade') || [];
  const aprovados = q.filter(x => x.resultado === 'aprovado').length;
  const reprovados = q.filter(x => x.resultado === 'reprovado').length;
  return header('Controle de Qualidade', q.length + ' inspeções', 'var(--info)',
    '<button class="btn btn-success" onclick="abrirModalQualidade()"><i class="fas fa-plus"></i> Nova Inspeção</button>', 'fa-check-double') +
    '<div class="metric-grid">' +
    '<div class="metric-card"><div class="label">Total</div><div class="value">' + q.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">Aprovados</div><div class="value">' + aprovados + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--danger)"><div class="label">Reprovados</div><div class="value">' + reprovados + '</div></div></div>' +
    '<div class="card">' + table(['Produto', 'Lote', 'Resultado', 'Data', 'Ações'],
      q.map(x => [esc(x.produto || '-'), esc(x.lote || '-'), badge(x.resultado === 'aprovado' ? 'Aprovado' : x.resultado === 'reprovado' ? 'Reprovado' : 'Pendente', x.resultado === 'aprovado' ? 'success' : x.resultado === 'reprovado' ? 'danger' : 'warning'), fmtD(x.data),
      '<button class="btn btn-sm btn-primary" onclick="editarQualidade(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'controleQualidade\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
function abrirModalQualidade() {
  openModal('Nova Inspeção de Qualidade',
    '<div class="form-group"><label>Produto *</label><input id="qualProduto"></div>' +
    '<div class="form-group"><label>Lote</label><input id="qualLote"></div>' +
    '<div class="form-group"><label>Resultado</label><select id="qualResultado"><option value="aprovado">Aprovado</option><option value="reprovado">Reprovado</option><option value="pendente">Pendente</option></select></div>' +
    '<div class="form-group"><label>Observações</label><textarea id="qualObs" rows="2"></textarea></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarQualidade()">Salvar</button>');
}
async function salvarQualidade() { const p = $('qualProduto').value.trim(); if (!p) { toast('Informe o produto', 'warning'); return; } await saveData('controleQualidade', { produto: p, lote: $('qualLote').value, resultado: $('qualResultado').value, obs: $('qualObs').value, data: now() }); toast('Inspeção registrada', 'success'); closeModal(); openModule('controle-qualidade'); }
async function editarQualidade(id) { const i = await DB.get('controleQualidade', id); if (!i) return; const r = prompt('Resultado (aprovado, reprovado, pendente):', i.resultado); if (r) { i.resultado = r; await saveData('controleQualidade', i); toast('Atualizado', 'success'); openModule('controle-qualidade'); } }

/* PLANOS DE PRODUÇÃO */
async function renderPlanosProducao() {
  const planos = await getData('planosProducao') || [];
  return header('Planos de Produção', planos.length + ' planos', 'var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalPlanoProducao()"><i class="fas fa-plus"></i> Novo Plano</button>', 'fa-calendar-alt') +
    '<div class="card">' + table(['Produto', 'Quantidade', 'Período', 'Status', 'Ações'],
      planos.map(p => ['<strong>' + esc(p.produto || '-') + '</strong>', formatN(p.quantidade || 0), esc(p.periodo || '-'), badge(p.status === 'ativo' ? 'Ativo' : p.status === 'concluido' ? 'Concluído' : 'Pendente', p.status === 'ativo' ? 'success' : p.status === 'concluido' ? 'info' : 'warning'),
      '<button class="btn btn-sm btn-primary" onclick="editarPlanoProducao(' + p.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'planosProducao\',' + p.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
function abrirModalPlanoProducao() {
  openModal('Novo Plano de Produção',
    '<div class="form-group"><label>Produto *</label><input id="planoProduto"></div>' +
    '<div class="form-group"><label>Quantidade *</label><input id="planoQtd" type="number" value="1" min="1"></div>' +
    '<div class="form-group"><label>Período</label><input id="planoPeriodo" value="' + new Date().toISOString().slice(0, 7) + '"></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarPlanoProducao()">Salvar</button>');
}
async function salvarPlanoProducao() { const p = $('planoProduto').value.trim(); if (!p) { toast('Informe o produto', 'warning'); return; } await saveData('planosProducao', { produto: p, quantidade: int($('planoQtd').value, 1), periodo: $('planoPeriodo').value, status: 'pendente', data: now() }); toast('Plano criado', 'success'); closeModal(); openModule('planos-producao'); }
async function editarPlanoProducao(id) { const p = await DB.get('planosProducao', id); if (!p) return; const s = prompt('Status (pendente, ativo, concluido):', p.status); if (s) { p.status = s; await saveData('planosProducao', p); toast('Atualizado', 'success'); openModule('planos-producao'); } }

/* LOGÍSTICA */
async function renderLogisticaRoteirizacao() {
  const rotas = await getData('roteirizacao') || [];
  return header('Roteirização', rotas.length + ' rotas — distâncias manuais ou não calculadas', 'var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalRota()"><i class="fas fa-plus"></i> Nova Rota</button>' +
    '<button class="btn btn-info" onclick="otimizarRotas()"><i class="fas fa-robot"></i> Otimizar</button>', 'fa-route') +
    '<div class="card">' + table(['Origem', 'Destino', 'Distância', 'Fonte', 'Veículo', 'Ações'],
      rotas.map(r => [esc(r.origem || '-'), esc(r.destino || '-'), esc(r.distancia || 'Não calculada'), esc(r.distance_source === 'manual' ? 'Manual' : 'Não calculada'), esc(r.veiculo || '-'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'roteirizacao\',' + r.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
function abrirModalRota() {
  openModal('Nova Rota',
    '<div class="form-group"><label>Origem *</label><input id="rotaOrigem"></div>' +
    '<div class="form-group"><label>Destino *</label><input id="rotaDestino"></div>' +
    '<div class="form-group"><label>Distância (km, opcional e manual)</label><input id="rotaDistancia" inputmode="decimal" placeholder="Ex: 15,5 — não calcula automaticamente"></div>' +
    '<div class="form-group"><label>Veículo</label><input id="rotaVeiculo"></div>' +
    '<button class="btn btn-primary btn-block" onclick="salvarRota()">Salvar</button>');
}
async function salvarRota() {
  const origem = $('rotaOrigem').value.trim(), destino = $('rotaDestino').value.trim();
  if (!origem || !destino) { toast('Preencha origem e destino', 'warning'); return; }
  try {
    const distance = KanawaOperations.normalizeRouteDistance($('rotaDistancia').value);
    await saveData('roteirizacao', Object.assign({ origem, destino, veiculo: $('rotaVeiculo').value.trim(), data: now(), route_status: 'pending_calculation' }, distance));
    toast(distance.distance_source === 'manual' ? 'Rota guardada. A distância foi indicada manualmente e não foi calculada por mapa.' : 'Rota guardada sem distância calculada. Configure um fornecedor de mapas para obter o percurso real.', 'warning');
    closeModal(); openModule('logistica-roteirizacao');
  } catch (error) { toast(error.message, 'warning'); }
}
function otimizarRotas() { toast('Otimização bloqueada: ainda não existe um motor de rotas ativo nem coordenadas verificadas para as paragens.', 'warning'); }

async function renderLogisticaEtiquetas() {
  const etiquetas = await getData('etiquetas') || [];
  return header('Etiquetas', etiquetas.length + ' etiquetas', 'var(--success)',
    '<button class="btn btn-success" onclick="gerarEtiqueta()"><i class="fas fa-plus"></i> Gerar Etiqueta</button>' +
    '<button class="btn btn-primary" onclick="imprimirEtiquetasLote()"><i class="fas fa-print"></i> Imprimir</button>', 'fa-tag') +
    '<div class="card">' + table(['Código', 'Produto', 'Data', 'Ações'],
      etiquetas.map(e => ['<strong>' + esc(e.codigo || '-') + '</strong>', esc(e.produto || '-'), fmtD(e.data),
      '<button class="btn btn-sm btn-primary" onclick="visualizarEtiqueta(' + e.id + ')"><i class="fas fa-eye"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'etiquetas\',' + e.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function gerarEtiqueta() {
  const produto = prompt('Nome do produto:'); if (!produto) return;
  await saveData('etiquetas', { codigo: 'ETQ' + Math.random().toString(36).substr(2, 6).toUpperCase(), produto, data: now() });
  toast('Etiqueta gerada', 'success'); openModule('logistica-etiquetas');
}
async function visualizarEtiqueta(id) {
  const printWindow = window.open('', '_blank', 'width=640,height=480');
  if (!printWindow) { toast('Permita janelas pop-up para pré-visualizar a etiqueta.', 'warning'); return; }
  try {
    const label = await DB.get('etiquetas', id);
    if (!label) { printWindow.close(); toast('Etiqueta não encontrada.', 'error'); return; }
    let barcode = '<div style="font:14px monospace;letter-spacing:2px">' + esc(label.codigo || '') + '</div>';
    if (typeof window.JsBarcode === 'function' && label.codigo) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      window.JsBarcode(svg,String(label.codigo),{format:'CODE128',width:2,height:54,displayValue:true,margin:4});
      barcode = svg.outerHTML;
    }
    const company = JSON.parse(localStorage.getItem('kanawa_empresa') || '{}');
    printWindow.document.open();
    printWindow.document.write('<!doctype html><html lang="pt-AO"><head><meta charset="utf-8"><title>Etiqueta ' + esc(label.codigo) + '</title><style>body{font-family:Arial,sans-serif;margin:0;padding:12px;color:#111}.label{width:76mm;min-height:38mm;border:1px solid #bbb;border-radius:4px;padding:8px;text-align:center;box-sizing:border-box}.company{font-size:11px;font-weight:700;color:#1a3a5c}.product{font-size:14px;font-weight:700;margin:7px 0}svg{max-width:100%;height:auto}@media print{body{padding:0}.label{border:0}}</style></head><body><div class="label"><div class="company">' + esc(company.firma || company.nome || 'KANAWA SOFT') + '</div><div class="product">' + esc(label.produto || 'Produto') + '</div>' + barcode + '<small>' + esc(label.data ? fmtD(label.data) : '') + '</small></div></body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(),300);
  } catch (error) {
    try { printWindow.close(); } catch (_) {}
    toast(error.message || 'Não foi possível abrir a etiqueta.', 'error');
  }
}

function renderLogisticaPicking() {
  return header('Picking', 'Separação de pedidos', 'var(--warning)', '', 'fa-boxes') +
    '<div class="card">' +
    '<div class="form-group"><label>Pedido</label><select id="pickingPedido"><option value="">Selecione um pedido...</option></select></div>' +
    '<div class="form-group"><label>Itens para separar</label><div style="padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);min-height:60px;color:var(--text-muted)">Selecione um pedido</div></div>' +
    '<button class="btn btn-success" onclick="iniciarPicking()"><i class="fas fa-play"></i> Iniciar Picking</button></div>';
}
function iniciarPicking() { toast('Picking não iniciado: falta ligar os pedidos reais, a localização dos artigos e a transação de stock.', 'warning'); }

async function renderLogisticaArmazens() {
  const armazens = await getData('armazens') || [];
  return header('Armazéns', armazens.length + ' armazéns', 'var(--info)',
    '<button class="btn btn-success" onclick="novoArmazem()"><i class="fas fa-plus"></i> Novo Armazém</button>', 'fa-warehouse') +
    '<div class="card"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">' +
    (armazens.length > 0 ? armazens.map(a => '<div style="background:var(--bg);padding:16px;border-radius:var(--radius-sm);border:1px solid var(--border);text-align:center"><div style="font-size:2rem">🏠</div><h5 style="font-size:.8rem">' + esc(a.nome) + '</h5><p style="font-size:.6rem;color:var(--text-muted)">Capacidade: ' + (a.capacidade || 'N/A') + '</p></div>').join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum armazém cadastrado</div>') +
    '</div></div>';
}
async function novoArmazem() { const n = prompt('Nome do armazém:'); if (!n) return; await saveData('armazens', { nome: n, data: now() }); toast('Armazém criado', 'success'); openModule('logistica-armazens'); }

function renderLogisticaCrossdocking() {
  return header('Cross-docking', 'Transferência direta', 'var(--primary)', '', 'fa-exchange-alt') +
    '<div class="card"><div class="form-grid">' +
    '<div class="form-group"><label>Produto</label><input id="crossProduto"></div>' +
    '<div class="form-group"><label>Origem</label><input id="crossOrigem" value="Recebimento"></div>' +
    '<div class="form-group"><label>Destino</label><input id="crossDestino" value="Expedição"></div>' +
    '<div class="form-group"><label>Quantidade</label><input id="crossQtd" type="number" value="1" min="1"></div></div>' +
    '<button class="btn btn-success" onclick="realizarCrossdocking()"><i class="fas fa-exchange-alt"></i> Transferir</button></div>';
}
function realizarCrossdocking() { toast('Transferência não executada: este módulo ainda não grava movimentos de stock no servidor.', 'warning'); }

async function renderLogisticaRastreio() {
  const rastreios = await getData('rastreios') || [];
  return header('Rastreio', rastreios.length + ' encomendas', 'var(--success)',
    '<button class="btn btn-primary" onclick="buscarRastreio()"><i class="fas fa-search"></i> Buscar</button>', 'fa-map-marked-alt') +
    '<div class="card"><div class="alert alert-info">Use o botão 🗺️ Mapa para ver e calibrar a posição de cada encomenda. O GPS só será lido após autorização no dispositivo.</div>' +
    table(['Código', 'Produto', 'Status', 'Última Atualização', 'Localização'],
      rastreios.map(r => ['<strong>' + esc(r.codigo) + '</strong>', esc(r.produto || '-'), badge(r.status || 'pendente', r.status === 'entregue' ? 'success' : 'warning'), fmtDT(r.ultimaAtualizacao || r.data),
        '<button class="btn btn-sm btn-info" onclick="abrirMapaRastreio(' + Number(r.id) + ')"><i class="fas fa-map-marked-alt"></i> 🗺️ Mapa</button>'])) + '</div>';
}
function coordenadasRastreio(latValue, lngValue) {
  const lat = Number(String(latValue == null ? '' : latValue).trim().replace(',', '.'));
  const lng = Number(String(lngValue == null ? '' : lngValue).trim().replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Introduza latitude entre -90 e 90 e longitude entre -180 e 180.');
  }
  return { lat: lat, lng: lng };
}
function iframeMapaRastreio(lat, lng) {
  return '<iframe title="Mapa da localização da encomenda" loading="lazy" referrerpolicy="no-referrer-when-downgrade" style="width:100%;height:320px;border:0;border-radius:10px" src="https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent((lng - 0.012) + ',' + (lat - 0.008) + ',' + (lng + 0.012) + ',' + (lat + 0.008)) + '&layer=mapnik&marker=' + encodeURIComponent(lat + ',' + lng) + '"></iframe>';
}
function mapaRastreioHtml(registo) {
  const lat = Number(registo.lat), lng = Number(registo.lng);
  const valido = registo.coordinates_valid === true && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const mapa = valido ? iframeMapaRastreio(lat, lng) : '<div class="alert alert-warning">Ainda não há coordenadas confirmadas para esta encomenda. Obtenha a posição pelo GPS ou introduza as coordenadas manualmente para carregar o mapa.</div>';
  return '<div class="form-grid"><div class="form-group"><label>Latitude</label><input id="rastreioMapaLat" oninput="marcarLocalizacaoManual()" type="number" step="any" min="-90" max="90" value="' + (valido ? lat : '') + '" placeholder="-8.8383"></div>' +
    '<div class="form-group"><label>Longitude</label><input id="rastreioMapaLng" oninput="marcarLocalizacaoManual()" type="number" step="any" min="-180" max="180" value="' + (valido ? lng : '') + '" placeholder="13.2344"></div></div>' +
    '<input id="rastreioLocationSource" type="hidden" value="' + (registo.location_source === 'gps' ? 'gps' : 'manual') + '">' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">' +
    '<button class="btn btn-primary" onclick="obterGPSRastreio(' + Number(registo.id) + ')"><i class="fas fa-crosshairs"></i> Usar GPS atual</button>' +
    '<button class="btn btn-info" onclick="atualizarMapaRastreio(' + Number(registo.id) + ')"><i class="fas fa-sync"></i> Atualizar mapa</button>' +
    '<button class="btn btn-success" onclick="guardarLocalizacaoRastreio(' + Number(registo.id) + ')"><i class="fas fa-save"></i> Guardar posição</button></div>' +
    '<div id="rastreioMapaPreview">' + mapa + '</div>' +
    '<p style="font-size:.82rem;color:var(--text-muted);margin-top:10px">Origem: ' + esc(registo.location_source === 'gps' ? 'GPS do dispositivo' : registo.location_source === 'manual' ? 'Coordenadas manuais' : 'Não confirmada') +
    ' · Última atualização: ' + esc(fmtDT(registo.ultimaAtualizacao || registo.data)) + '</p>' +
    '<p style="font-size:.82rem;color:var(--text-muted)">Nota: esta função regista uma posição pontual. Não acompanha o movimento em tempo real sem um rastreador/serviço GPS ligado.</p>';
}
async function abrirMapaRastreio(id) {
  const registos = await getData('rastreios') || [];
  const registo = registos.find(item => Number(item.id) === Number(id));
  if (!registo) { toast('Encomenda não encontrada.', 'warning'); return; }
  openModal('🗺️ Calibrar localização — ' + (registo.codigo || 'Rastreio'), mapaRastreioHtml(registo), true);
}
function marcarLocalizacaoManual() { const source = $('rastreioLocationSource'); if (source) source.value = 'manual'; }
function atualizarMapaRastreio(id) {
  try {
    const coords = coordenadasRastreio($('rastreioMapaLat').value, $('rastreioMapaLng').value);
    const preview = $('rastreioMapaPreview');
    if (preview) preview.innerHTML = iframeMapaRastreio(coords.lat, coords.lng);
    const source = $('rastreioLocationSource'); if (source) source.value = 'manual';
  } catch (error) { toast(error.message, 'warning'); }
}
function obterGPSRastreio(id) {
  if (!navigator.geolocation || !navigator.geolocation.getCurrentPosition) {
    toast('Este dispositivo/navegador não disponibiliza GPS. Introduza as coordenadas manualmente.', 'warning'); return;
  }
  toast('A solicitar autorização e posição GPS…', 'info');
  navigator.geolocation.getCurrentPosition(function (position) {
    const lat = $('rastreioMapaLat'), lng = $('rastreioMapaLng');
    if (lat) lat.value = position.coords.latitude.toFixed(6);
    if (lng) lng.value = position.coords.longitude.toFixed(6);
    const source = $('rastreioLocationSource'); if (source) source.value = 'gps';
    try {
      const coords = coordenadasRastreio(position.coords.latitude, position.coords.longitude);
      const preview = $('rastreioMapaPreview');
      if (preview) preview.innerHTML = iframeMapaRastreio(coords.lat, coords.lng);
      toast('Posição GPS obtida. Confirme no mapa e carregue em Guardar posição.', 'success');
    } catch (error) { toast(error.message, 'warning'); }
  }, function (error) {
    const mensagens = { 1: 'Permissão de localização recusada.', 2: 'A posição GPS não está disponível.', 3: 'Tempo de espera do GPS esgotado.' };
    toast(mensagens[error.code] || 'Não foi possível obter a posição GPS.', 'warning');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
async function guardarLocalizacaoRastreio(id) {
  try {
    const coords = coordenadasRastreio($('rastreioMapaLat').value, $('rastreioMapaLng').value);
    const registos = await getData('rastreios') || [];
    const registo = registos.find(item => Number(item.id) === Number(id));
    if (!registo) { toast('Encomenda não encontrada.', 'warning'); return; }
    const source = $('rastreioLocationSource');
    Object.assign(registo, coords, { coordinates_valid: true, location_source: source && source.value === 'gps' ? 'gps' : 'manual', ultimaAtualizacao: now() });
    await saveData('rastreios', registo);
    toast('Localização calibrada e guardada. Confirme que o ponto corresponde ao local real.', 'success');
    closeModal();
    openModule('logistica-rastreio');
  } catch (error) { toast(error.message || 'Não foi possível guardar a localização.', 'warning'); }
}
async function buscarRastreio() {
  const codigo = prompt('Código de rastreio:'); if (!codigo) return;
  const registos = await getData('rastreios') || [];
  const registo = registos.find(function (item) { return String(item.codigo || '').toLowerCase() === codigo.trim().toLowerCase(); });
  if (!registo) {
    toast('Não existe registo interno para este código e não há transportadora ligada para consultar o estado externo.', 'warning');
    return;
  }
  toast('Registo interno encontrado: ' + (registo.status || 'sem estado') + '. Não é uma confirmação da transportadora.', 'info');
  if (registo.id != null) abrirMapaRastreio(registo.id);
}

/* E-COMMERCE AVANÇADO */
async function renderEcommerceVitrine() {
  const produtos = await getData('ecommerceProdutos');
  const prods = produtos.length > 0 ? produtos : await getData('produtos');
  const ativos = prods.filter(p => p.ativo !== false);
  return header('Vitrine Online', ativos.length + ' produtos', 'var(--success)',
    '<button class="btn btn-info" onclick="sincronizarProdutosEcommerce()"><i class="fas fa-sync"></i> Sincronizar</button>', 'fa-store') +
    '<div class="product-grid">' +
    (ativos.length > 0 ? ativos.slice(0, 12).map(p => '<div class="pdv-prod-card" onclick="adicionarAoCarrinhoEcommerce(' + p.id + ')"><div class="img"><img src="' + imgSrc(p) + '" onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'"></div><div class="info"><div class="name">' + esc(p.nome) + '</div><div class="price">' + fmt(p.preco) + '</div><div class="stock">' + badge(p.estoque > 0 ? 'Em estoque' : 'Esgotado', p.estoque > 0 ? 'success' : 'danger') + '</div></div></div>').join('') : emptyState('fa-store', 'Nenhum produto na vitrine')) +
    '</div>';
}
async function adicionarAoCarrinhoEcommerce(id) {
  const produto = await DB.get('produtos', id) || await DB.get('ecommerceProdutos', id);
  if (!produto) { toast('Produto não encontrado', 'error'); return; }
  const carrinho = JSON.parse(localStorage.getItem('kanawa_ecommerce_carrinho') || '[]');
  const ex = carrinho.find(i => i.id === id);
  if (ex) ex.quantidade += 1; else carrinho.push({ id: produto.id, nome: produto.nome, preco: produto.preco, quantidade: 1 });
  localStorage.setItem('kanawa_ecommerce_carrinho', JSON.stringify(carrinho));
  toast(produto.nome + ' adicionado ao carrinho', 'success');
}
async function sincronizarProdutosEcommerce() {
  const produtos = await getData('produtos'); await DB.clear('ecommerceProdutos');
  for (const p of produtos) await saveData('ecommerceProdutos', Object.assign({}, p, { ativo: true }));
  toast(produtos.length + ' produtos sincronizados', 'success'); openModule('ecommerce-vitrine');
}
function renderEcommerceCarrinho() {
  const carrinho = JSON.parse(localStorage.getItem('kanawa_ecommerce_carrinho') || '[]');
  const total = carrinho.reduce((s, i) => s + (i.preco * i.quantidade), 0);
  return header('Carrinho', carrinho.length + ' itens', 'var(--warning)',
    '<button class="btn btn-danger" onclick="limparCarrinhoEcommerce()"><i class="fas fa-trash"></i> Limpar</button>', 'fa-shopping-bag') +
    '<div class="card">' +
    (carrinho.length > 0 ? carrinho.map(i => '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><div><strong>' + esc(i.nome) + '</strong><br><small>' + i.quantidade + ' x ' + fmt(i.preco) + '</small></div><div style="display:flex;align-items:center;gap:8px"><span style="font-weight:700">' + fmt(i.preco * i.quantidade) + '</span><button class="btn btn-sm btn-danger" onclick="removerDoCarrinhoEcommerce(' + i.id + ')"><i class="fas fa-trash"></i></button></div></div>').join('') : emptyState('fa-shopping-cart', 'Carrinho vazio')) +
    (carrinho.length > 0 ? '<div style="margin-top:12px;padding-top:12px;border-top:2px solid var(--border);display:flex;justify-content:space-between;align-items:center"><span style="font-weight:700;font-size:1.1rem">Total: ' + fmt(total) + '</span><button class="btn btn-success" onclick="finalizarPedidoEcommerce()"><i class="fas fa-check"></i> Finalizar Pedido</button></div>' : '') + '</div>';
}
function removerDoCarrinhoEcommerce(id) { const carrinho = JSON.parse(localStorage.getItem('kanawa_ecommerce_carrinho') || '[]'); localStorage.setItem('kanawa_ecommerce_carrinho', JSON.stringify(carrinho.filter(i => i.id !== id))); toast('Item removido', 'info'); openModule('ecommerce-carrinho'); }
function limparCarrinhoEcommerce() { localStorage.removeItem('kanawa_ecommerce_carrinho'); toast('Carrinho limpo', 'info'); openModule('ecommerce-carrinho'); }
async function finalizarPedidoEcommerce() {
  const carrinho = JSON.parse(localStorage.getItem('kanawa_ecommerce_carrinho') || '[]');
  if (carrinho.length === 0) { toast('Carrinho vazio', 'warning'); return; }
  const total = carrinho.reduce((s, i) => s + (i.preco * i.quantidade), 0);
  const pedido = { cliente: prompt('Nome do cliente:', 'Cliente Anônimo') || 'Cliente Anônimo', itens: carrinho, total, status: 'pendente', data: now() };
  await saveData('ecommercePedidos', pedido);
  localStorage.removeItem('kanawa_ecommerce_carrinho');
  toast('Pedido registado como pendente. Nenhum pagamento foi processado.', 'warning'); openModule('ecommerce-pedidos');
}
async function renderEcommercePedidos() {
  const pedidos = await getData('ecommercePedidos') || [];
  return header('Pedidos E-commerce', pedidos.length + ' pedidos', 'var(--primary)',
    '<button class="btn btn-info" onclick="exportarPedidosEcommerce()"><i class="fas fa-file-export"></i> Exportar</button>', 'fa-truck') +
    '<div class="card">' + table(['#', 'Cliente', 'Itens', 'Total', 'Status', 'Data', 'Ações'],
      pedidos.map(p => ['#' + p.id, esc(p.cliente || '-'), (p.itens || []).length + ' itens', fmt(p.total || 0), badge(p.status === 'entregue' ? 'Entregue' : p.status === 'enviado' ? 'Enviado' : 'Pendente', p.status === 'entregue' ? 'success' : p.status === 'enviado' ? 'info' : 'warning'), fmtD(p.data),
      '<button class="btn btn-sm btn-primary" onclick="detalharPedidoEcommerce(' + p.id + ')"><i class="fas fa-eye"></i></button> <button class="btn btn-sm btn-success" onclick="atualizarStatusPedidoEcommerce(' + p.id + ')"><i class="fas fa-sync"></i></button>'])) + '</div>';
}
async function detalharPedidoEcommerce(id) { const p = await DB.get('ecommercePedidos', id); if (!p) return; alert('Pedido #' + id + '\nCliente: ' + p.cliente + '\nTotal: ' + fmt(p.total) + '\nStatus: ' + p.status); }
async function atualizarStatusPedidoEcommerce(id) {
  const pedido = await DB.get('ecommercePedidos', id); if (!pedido) return;
  const input = prompt('Estado interno (pendente, confirmado, em preparação, enviado, entregue, cancelado):', pedido.status);
  if (input === null || !input.trim()) return;
  try {
    pedido.status = KanawaOperations.normalizeOrderStatus(input);
    pedido.status_source = 'manual_internal';
    await saveData('ecommercePedidos', pedido);
    toast('Estado interno atualizado. Isto não confirma pagamento nem estado da transportadora.', 'warning');
    openModule('ecommerce-pedidos');
  } catch (error) { toast(error.message, 'warning'); }
}
async function exportarPedidosEcommerce() {
  const orders = await getData('ecommercePedidos') || [];
  if (!orders.length) { toast('Não existem pedidos para exportar.', 'warning'); return; }
  const safeText = value => {
    const text = String(value == null ? '' : value);
    return /^[=+@-]/.test(text) ? "'" + text : text;
  };
  const rows = orders.map(order => ({
    Pedido: safeText(order.numero || order.numeroPedido || order.id),
    Cliente: safeText(order.cliente || order.clienteNome || ''),
    Email: safeText(order.email || order.clienteEmail || ''),
    Telefone: safeText(order.telefone || order.clienteTelefone || ''),
    Estado: safeText(order.status || 'pendente'),
    Pagamento: safeText(order.pagamento || order.metodoPagamento || ''),
    Total_AOA: Number(order.total || 0),
    Data: safeText(order.data || order.created_at || ''),
    Endereco: safeText(order.endereco || order.morada || ''),
    Itens: safeText((order.itens || order.carrinho || []).map(item => (item.nome || item.produto || 'Artigo') + ' x ' + (item.quantidade || item.qty || 1)).join('; '))
  }));
  const filename = 'kanawa_pedidos_ecommerce_' + new Date().toISOString().slice(0,10);
  if (typeof XLSX !== 'undefined') {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,sheet,'Pedidos');
    XLSX.writeFile(book,filename + '.xlsx');
    toast(orders.length + ' pedidos exportados para Excel.', 'success');
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','),...rows.map(row => headers.map(key => '"' + String(row[key] == null ? '' : row[key]).replace(/"/g,'""') + '"').join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download=filename + '.csv'; link.click(); URL.revokeObjectURL(url);
  toast(orders.length + ' pedidos exportados para CSV.', 'success');
}
const PAYMENT_METHOD_ICONS = {
  dinheiro:'fa-money-bill-wave', cartao:'fa-credit-card', transferencia:'fa-university',
  multicaixa:'fa-mobile-alt', misto:'fa-random', credito:'fa-file-invoice',
  referencia:'fa-barcode', multicaixa_express:'fa-mobile-alt'
};
function renderPaymentMethodSettings(methods, canConfigure) {
  const rows = methods.map(method => {
    const code = esc(method.method_code);
    return '<div class="card" style="margin:0;padding:14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center">' +
      '<div style="display:flex;gap:12px;align-items:center;min-width:0"><i class="fas ' + (PAYMENT_METHOD_ICONS[method.method_code] || 'fa-credit-card') + '" style="font-size:1.35rem;color:var(--primary);width:28px;text-align:center"></i><div style="min-width:0"><strong>' + esc(method.display_name) + '</strong><div style="font-size:.75rem;color:var(--text-muted)">' + code + '</div></div></div>' +
      '<label style="display:flex;align-items:center;gap:8px;white-space:nowrap"><input type="checkbox" data-payment-enabled="' + code + '" ' + (method.enabled ? 'checked' : '') + (canConfigure ? '' : ' disabled') + '> Aceitar</label>' +
      '<div style="grid-column:1/-1"><label style="display:block;font-size:.78rem;color:var(--text-muted);margin-bottom:4px">Instruções para o operador/cliente</label><input data-payment-instructions="' + code + '" maxlength="300" value="' + esc(method.instructions || '') + '" placeholder="Ex.: apresentar comprovativo da transferência" ' + (canConfigure ? '' : 'disabled') + ' style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"></div></div>';
  }).join('');
  return '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-sliders-h"></i> Formas de pagamento aceites</h3>' +
    (canConfigure ? '<button class="btn btn-success" onclick="guardarMetodosPagamento()"><i class="fas fa-save"></i> Guardar configuração</button>' : '<span class="badge badge-warning">Só leitura</span>') + '</div>' +
    '<p style="color:var(--text-muted);font-size:.85rem;margin-bottom:14px">Escolha os métodos que a empresa aceita no PDV e registe instruções operacionais. A configuração é guardada no PostgreSQL e partilhada pelos utilizadores da empresa.</p>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">' + rows + '</div>' +
    '<div class="alert alert-warning show" style="margin-top:14px">Activar um método nesta lista apenas permite seleccioná-lo na venda. Não confirma uma transferência, não processa pagamentos e não activa um gateway bancário.</div></div>';
}
async function guardarMetodosPagamento() {
  if (!window.KanawaCloud || !KanawaCloud.ready) return toast('Inicie sessão na empresa antes de guardar a configuração.', 'warning');
  const methods = DEFAULT_PDV_PAYMENT_METHODS.map((method,index) => {
    const enabled = document.querySelector('[data-payment-enabled="' + method.method_code + '"]');
    const instructions = document.querySelector('[data-payment-instructions="' + method.method_code + '"]');
    return {
      method_code: method.method_code,
      display_name: method.display_name,
      enabled: !!(enabled && enabled.checked),
      sort_order: (index + 1) * 10,
      instructions: instructions ? instructions.value.trim().slice(0,300) : ''
    };
  });
  try {
    const validated = window.KanawaPaymentMethods ? window.KanawaPaymentMethods.validate(methods) : methods;
    const result = await KanawaCloud.saveCompanyPaymentMethods(validated);
    pdvPaymentMethods = validated.filter(method => method.enabled);
    toast('Configuração guardada no PostgreSQL (' + (result.saved || methods.length) + ' métodos).', 'success');
    await openModule('ecommerce-pagamento');
  } catch (error) {
    toast(error.message || 'Não foi possível guardar os métodos de pagamento.', 'error');
  }
}
async function renderEcommercePagamento() {
  if (!window.KanawaCloud || !KanawaCloud.ready) {
    return header('Pagamento e formas de pagamento', 'Configuração da empresa', 'var(--warning)', '', 'fa-credit-card') +
      '<div class="card"><p>Inicie sessão numa empresa para consultar ou guardar os métodos de pagamento no PostgreSQL.</p></div>';
  }
  try {
    const [methods, providers] = await Promise.all([
      KanawaCloud.listCompanyPaymentMethods(),
      KanawaCloud.listPaymentProviderStatus()
    ]);
    const active = providers.filter(provider => provider.enabled === true).length;
    const canConfigure = !!(KanawaCloud.context && KanawaCloud.context.role === 'admin');
    const methodPanel = renderPaymentMethodSettings(methods, canConfigure);
    const rows = providers.map(provider => [
      '<strong>' + esc(provider.display_name || provider.provider_code) + '</strong>',
      esc(provider.mode || 'não configurado'),
      badge(provider.enabled ? 'Activo no servidor' : 'Desactivado', provider.enabled ? 'success' : 'warning'),
      esc((provider.supported_countries || []).join(', ') || '-')
    ]);
    return header('Pagamento e formas de pagamento', methods.filter(method => method.enabled).length + ' métodos aceites no PDV', 'var(--success)', '', 'fa-credit-card') +
      methodPanel +
      '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-plug"></i> Gateways de pagamento online</h3></div>' +
      '<p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px">Os gateways são geridos no servidor. Chaves privadas, tokens e segredos nunca são pedidos nem guardados neste ecrã.</p>' +
      table(['Provedor','Modo','Estado','Países'],rows) +
      (active === 0 ? '<div class="alert alert-warning show" style="margin-top:12px">Não existe gateway online activo. O checkout não pode cobrar clientes pela internet neste momento.</div>' : '') +
      '<p style="font-size:.78rem;color:var(--text-muted);margin-top:10px">A disponibilidade do gateway é apenas o estado publicado pelo servidor; não substitui um pagamento de teste confirmado pelo fornecedor.</p></div>';
  } catch (error) {
    return header('Pagamento e formas de pagamento', 'Falha ao consultar configuração', 'var(--danger)', '', 'fa-credit-card') +
      '<div class="card"><p>' + esc(error.message || 'Não foi possível consultar a configuração.') + '</p></div>';
  }
}
function configurarPagamento() { openModule('ecommerce-pagamento'); }
function testarPagamento() { toast('Nenhuma cobrança foi executada. Faça um pagamento de teste no ambiente sandbox do fornecedor depois da integração backend.', 'warning'); }
function renderEcommerceRastreio() {
  return header('Rastreio de Encomendas', 'Consulta externa indisponível', 'var(--warning)', '', 'fa-map-marker-alt') +
    '<div class="card"><div class="alert alert-warning">Não existe integração ativa com transportadoras. O sistema não vai inventar estados de envio. Consulte apenas atualizações registadas pela equipa em Logística → Rastreio.</div></div>';
}
function rastrearEncomenda() {
  const codigo = $('rastreioCodigo') ? $('rastreioCodigo').value.trim() : '';
  if (!codigo) { toast('Informe o código', 'warning'); return; }
  toast('Consulta externa não realizada: não há API de transportadora configurada. Nenhum estado fictício foi apresentado.', 'warning');
}
/* RH AVANÇADO */
async function renderRHRecrutamento() {
  const vagas = await getData('vagas') || []; const candidatos = await getData('candidatos') || [];
  return header('Recrutamento', vagas.length + ' vagas | ' + candidatos.length + ' candidatos', 'var(--primary)',
    '<button class="btn btn-success" onclick="novaVaga()"><i class="fas fa-plus"></i> Nova Vaga</button>' +
    '<button class="btn btn-info" onclick="novoCandidato()"><i class="fas fa-user-plus"></i> Novo Candidato</button>', 'fa-user-plus') +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-briefcase"></i> Vagas</h3></div>' +
    (vagas.length > 0 ? vagas.map(v => '<div style="padding:6px 0;border-bottom:1px solid var(--border)"><strong>' + esc(v.titulo) + '</strong> - ' + esc(v.departamento || '-') + ' ' + badge(v.status || 'aberta', 'success') + '</div>').join('') : 'Nenhuma vaga') + '</div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-users"></i> Candidatos</h3></div>' +
    (candidatos.length > 0 ? candidatos.map(c => '<div style="padding:6px 0;border-bottom:1px solid var(--border)"><strong>' + esc(c.nome) + '</strong> - ' + esc(c.vaga || '-') + ' ' + badge(c.status || 'novo', 'info') + '</div>').join('') : 'Nenhum candidato') + '</div></div>';
}
async function novaVaga() { const t = prompt('Título da vaga:'); if (!t) return; await saveData('vagas', { titulo: t, departamento: prompt('Departamento:', 'Geral') || 'Geral', status: 'aberta', data: now() }); toast('Vaga criada', 'success'); openRHSection('recrutamento'); }
async function novoCandidato() { const n = prompt('Nome do candidato:'); if (!n) return; await saveData('candidatos', { nome: n, vaga: prompt('Vaga:') || 'Não especificada', status: 'novo', data: now() }); toast('Candidato registrado', 'success'); openRHSection('recrutamento'); }
async function renderRHDesempenho() {
  const d = await getData('desempenhoRH') || [];
  return header('Gestão de Desempenho', d.length + ' avaliações', 'var(--info)',
    '<button class="btn btn-success" onclick="novaAvaliacaoDesempenho()"><i class="fas fa-plus"></i> Nova Avaliação</button>', 'fa-chart-bar') +
    '<div class="card">' + table(['Funcionário', 'Nota', 'Comentário', 'Data', 'Ações'],
      d.map(x => [esc(x.funcionario || '-'), '<strong>' + (x.nota || 0) + '/10</strong>', esc((x.comentario || '-').substring(0, 50)), fmtD(x.data), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'desempenhoRH\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaAvaliacaoDesempenho() { const f = prompt('Nome do funcionário:'); if (!f) return; await saveData('desempenhoRH', { funcionario: f, nota: parseFloat(prompt('Nota (0-10):', '5')) || 5, comentario: prompt('Comentário:') || '', data: now() }); toast('Avaliação registrada', 'success'); openRHSection('desempenho'); }
async function renderRHBeneficios() {
  const b = await getData('beneficios') || [];
  return header('Benefícios', b.length + ' benefícios', 'var(--success)',
    '<button class="btn btn-success" onclick="novoBeneficio()"><i class="fas fa-plus"></i> Novo Benefício</button>', 'fa-gift') +
    '<div class="card">' + table(['Nome', 'Funcionário', 'Valor', 'Status', 'Ações'],
      b.map(x => ['<strong>' + esc(x.nome) + '</strong>', esc(x.funcionario || '-'), fmt(x.valor || 0), badge(x.ativo !== false ? 'Ativo' : 'Inativo', x.ativo !== false ? 'success' : 'danger'),
      '<button class="btn btn-sm btn-primary" onclick="editarBeneficio(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'beneficios\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoBeneficio() { const n = prompt('Nome do benefício:'); if (!n) return; await saveData('beneficios', { nome: n, funcionario: prompt('Funcionário:', 'Geral') || 'Geral', valor: parseFloat(prompt('Valor (Kz):', '0')) || 0, ativo: true, data: now() }); toast('Benefício criado', 'success'); openRHSection('beneficios'); }
async function editarBeneficio(id) { const b = await DB.get('beneficios', id); if (!b) return; const v = prompt('Novo valor:', b.valor); if (v !== null) { b.valor = parseFloat(v) || 0; await saveData('beneficios', b); toast('Atualizado', 'success'); openRHSection('beneficios'); } }
async function renderRHOnboarding() {
  const o = await getData('onboarding') || [];
  return header('Onboarding', o.length + ' processos', 'var(--primary)',
    '<button class="btn btn-success" onclick="novoOnboarding()"><i class="fas fa-plus"></i> Novo Processo</button>', 'fa-user-graduate') +
    '<div class="card">' + table(['Funcionário', 'Etapa', 'Progresso', 'Status', 'Ações'],
      o.map(x => [esc(x.funcionario || '-'), esc(x.etapa || 'Início'), '<div style="background:var(--border);height:6px;border-radius:3px;width:100px;overflow:hidden;display:inline-block;vertical-align:middle"><div style="background:var(--success);height:100%;width:' + (x.progresso || 0) + '%"></div></div> ' + (x.progresso || 0) + '%', badge(x.status === 'concluido' ? 'Concluído' : 'Em Andamento', x.status === 'concluido' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-primary" onclick="editarOnboarding(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'onboarding\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoOnboarding() { const f = prompt('Nome do funcionário:'); if (!f) return; await saveData('onboarding', { funcionario: f, etapa: 'Integração', progresso: 10, status: 'em_andamento', data: now() }); toast('Processo iniciado', 'success'); openRHSection('onboarding'); }
async function editarOnboarding(id) { const i = await DB.get('onboarding', id); if (!i) return; const p = prompt('Progresso (0-100):', i.progresso); if (p !== null) { i.progresso = parseInt(p) || 0; if (i.progresso >= 100) i.status = 'concluido'; await saveData('onboarding', i); toast('Atualizado', 'success'); openRHSection('onboarding'); } }
async function renderRHPonto() {
  const records = await getData('pontoDigital') || [];
  const summary = window.KanawaAttendance ? KanawaAttendance.summarize(records) : [];
  const openEntries = summary.reduce((total,row) => total + row.emAberto, 0);
  const totalHours = summary.reduce((total,row) => total + row.horas, 0);
  return header('Controle de Ponto', records.length + ' registos', 'var(--warning)',
    '<button class="btn btn-success" onclick="registrarPonto()"><i class="fas fa-clock"></i> Registar entrada</button>' +
    '<button class="btn btn-info" onclick="relatorioPonto()"><i class="fas fa-file-alt"></i> Relatório</button>', 'fa-clock') +
    '<div class="metric-grid">' +
    '<div class="metric-card"><div class="label">Registos</div><div class="value">' + records.length + '</div></div>' +
    '<div class="metric-card"><div class="label">Entradas em aberto</div><div class="value">' + openEntries + '</div></div>' +
    '<div class="metric-card"><div class="label">Horas apuradas</div><div class="value">' + totalHours.toFixed(2) + ' h</div></div></div>' +
    '<div class="card">' + table(['Funcionário','Data','Entrada','Saída','Horas','Estado','Ações'],
      records.slice(-30).reverse().map(record => {
        const hours = window.KanawaAttendance ? KanawaAttendance.calculateHours(record.entrada,record.saida) : null;
        const state = record.saida ? badge('Fechado','success') : badge('Em aberto','warning');
        const close = record.saida ? '' : '<button class="btn btn-sm btn-success" onclick="registarSaidaPonto(' + Number(record.id) + ')"><i class="fas fa-sign-out-alt"></i> Saída</button> ';
        return [esc(record.funcionario || '-'),fmtD(record.data),esc(record.entrada || '-'),esc(record.saida || '-'),
          hours === null ? '-' : hours.toFixed(2) + ' h',state,
          close + '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'pontoDigital\',' + Number(record.id) + ')"><i class="fas fa-trash"></i></button>'];
      })) + '</div>';
}
async function registrarPonto() {
  const name = prompt('Nome do funcionário:');
  if (!name || !name.trim()) return;
  const current = new Date();
  const date = current.toISOString().slice(0,10);
  const existing = (await getData('pontoDigital') || []).find(record =>
    String(record.funcionario || '').trim().toLowerCase() === name.trim().toLowerCase() &&
    record.data === date && !record.saida
  );
  if (existing) {
    toast('Este trabalhador já tem uma entrada em aberto. Registe a saída antes de criar outra entrada.', 'warning');
    return;
  }
  await saveData('pontoDigital', {
    funcionario:name.trim(), data:date, entrada:current.toTimeString().slice(0,5),
    saida:'', estado:'aberto', dataRegistro:now()
  });
  toast('Entrada registada.', 'success');
  openRHSection('ponto');
}
async function registarSaidaPonto(id) {
  const record = await DB.get('pontoDigital', id);
  if (!record) return toast('Registo de ponto não encontrado.', 'error');
  if (record.saida) return toast('A saída deste registo já foi registada.', 'warning');
  const current = new Date();
  record.saida = current.toTimeString().slice(0,5);
  record.dataSaida = current.toISOString().slice(0,10);
  record.estado = 'fechado';
  record.atualizadoEm = now();
  if (window.KanawaAttendance && KanawaAttendance.calculateHours(record.entrada,record.saida) === null) {
    return toast('Não foi possível calcular as horas. Verifique a entrada e a saída.', 'error');
  }
  await saveData('pontoDigital', record);
  toast('Saída registada.', 'success');
  openRHSection('ponto');
}
async function relatorioPonto() {
  const records = await getData('pontoDigital') || [];
  const summary = window.KanawaAttendance ? KanawaAttendance.summarize(records) : [];
  const rows = summary.map(row => [
    '<strong>' + esc(row.funcionario) + '</strong>',row.registos,row.fechados,
    row.emAberto ? badge(row.emAberto + ' em aberto','warning') : badge('Completo','success'),
    row.horas.toFixed(2) + ' h'
  ]);
  openModal('Relatório de assiduidade',
    '<div class="metric-grid"><div class="metric-card"><div class="label">Trabalhadores</div><div class="value">' + summary.length + '</div></div>' +
    '<div class="metric-card"><div class="label">Registos</div><div class="value">' + records.length + '</div></div>' +
    '<div class="metric-card"><div class="label">Horas apuradas</div><div class="value">' + summary.reduce((n,row)=>n+row.horas,0).toFixed(2) + ' h</div></div></div>' +
    '<div class="card">' + table(['Trabalhador','Registos','Fechados','Estado','Horas totais'],rows) + '</div>' +
    '<button class="btn btn-success btn-block" onclick="exportarRelatorioPonto()"><i class="fas fa-file-excel"></i> Exportar relatório</button>', true);
}
async function exportarRelatorioPonto() {
  const records = await getData('pontoDigital') || [];
  const rows = window.KanawaAttendance ? KanawaAttendance.summarize(records) : [];
  if (typeof XLSX !== 'undefined') {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,sheet,'Assiduidade');
    XLSX.writeFile(book,'kanawa_assiduidade_' + new Date().toISOString().slice(0,10) + '.xlsx');
    toast('Relatório de assiduidade exportado.', 'success');
    return;
  }
  const headers = ['funcionario','registos','fechados','emAberto','horas'];
  const csv = [headers.join(','),...rows.map(row => headers.map(key => '"' + String(row[key] == null ? '' : row[key]).replace(/"/g,'""') + '"').join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href=url; link.download='kanawa_assiduidade.csv'; link.click(); URL.revokeObjectURL(url);
  toast('Relatório CSV exportado.', 'success');
}

async function renderRHRescisao() {
  const r = await getData('rescisoes') || [];
  return header('Cálculo de Rescisão', r.length + ' cálculos', 'var(--danger)',
    '<button class="btn btn-success" onclick="novaRescisao()"><i class="fas fa-plus"></i> Novo Cálculo</button>', 'fa-file-signature') +
    '<div class="card">' + table(['Funcionário', 'Data Saída', 'Valor', 'Motivo', 'Ações'],
      r.map(x => [esc(x.funcionario || '-'), fmtD(x.dataSaida), fmt(x.valor || 0), esc(x.motivo || '-'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'rescisoes\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaRescisao() { const f = prompt('Nome do funcionário:'); if (!f) return; await saveData('rescisoes', { funcionario: f, dataSaida: prompt('Data de saída (YYYY-MM-DD):') || new Date().toISOString().split('T')[0], valor: parseFloat(prompt('Valor da rescisão:', '0')) || 0, motivo: prompt('Motivo:', 'Demissão') || 'Demissão', data: now() }); toast('Cálculo registrado', 'success'); openRHSection('rescisao'); }
async function renderRHPlanoCarreira() {
  const p = await getData('planosCarreira') || [];
  return header('Plano de Carreira', p.length + ' planos', 'var(--success)',
    '<button class="btn btn-success" onclick="novoPlanoCarreira()"><i class="fas fa-plus"></i> Novo Plano</button>', 'fa-arrow-up') +
    '<div class="card">' + table(['Funcionário', 'Posição Atual', 'Próximo Passo', 'Previsão', 'Ações'],
      p.map(x => [esc(x.funcionario || '-'), esc(x.posicaoAtual || '-'), esc(x.proximoPasso || '-'), esc(x.previsao || '-'),
      '<button class="btn btn-sm btn-primary" onclick="editarPlanoCarreira(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'planosCarreira\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoPlanoCarreira() { const f = prompt('Nome do funcionário:'); if (!f) return; await saveData('planosCarreira', { funcionario: f, posicaoAtual: prompt('Posição atual:', 'Assistente') || 'Assistente', proximoPasso: prompt('Próximo passo:', 'Analista') || 'Analista', previsao: prompt('Previsão:', '6 meses') || '6 meses', data: now() }); toast('Plano criado', 'success'); openRHSection('plano-carreira'); }
async function editarPlanoCarreira(id) { const p = await DB.get('planosCarreira', id); if (!p) return; const n = prompt('Novo próximo passo:', p.proximoPasso); if (n) { p.proximoPasso = n; await saveData('planosCarreira', p); toast('Atualizado', 'success'); openRHSection('plano-carreira'); } }

/* PROJETOS AVANÇADO */
async function renderProjetosTarefas() {
  const t = await getData('tarefas') || [];
  return header('Tarefas', t.length + ' tarefas', 'var(--warning)',
    '<button class="btn btn-success" onclick="novaTarefa()"><i class="fas fa-plus"></i> Nova Tarefa</button>', 'fa-tasks') +
    '<div class="card">' + table(['Título', 'Projeto', 'Status', 'Responsável', 'Ações'],
      t.map(x => ['<strong>' + esc(x.titulo) + '</strong>', esc(x.projeto || '-'), badge(x.status === 'concluida' ? 'Concluída' : x.status === 'em_andamento' ? 'Em Andamento' : 'Pendente', x.status === 'concluida' ? 'success' : x.status === 'em_andamento' ? 'warning' : 'info'), esc(x.responsavel || '-'),
      '<button class="btn btn-sm btn-success" onclick="concluirTarefa(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'tarefas\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaTarefa() { const t = prompt('Título da tarefa:'); if (!t) return; await saveData('tarefas', { titulo: t, projeto: prompt('Projeto:', 'Geral') || 'Geral', status: 'pendente', responsavel: prompt('Responsável:', 'Não definido') || 'Não definido', data: now() }); toast('Tarefa criada', 'success'); openModule('projetos-tarefas'); }
async function renderKanban() {
  const t = await getData('tarefas') || [];
  const stages = ['pendente', 'em_andamento', 'concluida'];
  const labels = { pendente: '📋 Pendente', em_andamento: '🔄 Em Andamento', concluida: '✅ Concluída' };
  return header('Kanban', t.length + ' tarefas', 'var(--primary)', '', 'fa-columns') +
    '<div class="kanban-columns">' + stages.map(s => { const ts = t.filter(x => x.status === s); return '<div class="kanban-column"><h5>' + (labels[s] || s) + ' (' + ts.length + ')</h5>' + (ts.length > 0 ? ts.map(x => '<div class="kanban-card" onclick="detalharTarefa(' + x.id + ')"><div style="font-weight:600;font-size:.75rem">' + esc(x.titulo) + '</div><div style="font-size:.6rem;color:var(--text-muted)">' + esc(x.responsavel || '-') + '</div></div>').join('') : '<div style="text-align:center;padding:8px;color:var(--text-muted);font-size:.6rem">Vazio</div>') + '</div>'; }).join('') + '</div>';
}
async function detalharTarefa(id) { const t = await DB.get('tarefas', id); if (t) toast(t.titulo + ' - ' + (t.responsavel || 'Sem responsável'), 'info'); }
async function renderProjetosGantt() {
  const g = await getData('ganttProjetos') || [];
  return header('Gantt Chart', g.length + ' atividades', 'var(--info)',
    '<button class="btn btn-success" onclick="novaAtividadeGantt()"><i class="fas fa-plus"></i> Nova Atividade</button>', 'fa-chart-bar') +
    '<div class="card">' + table(['Atividade', 'Projeto', 'Início', 'Fim', 'Progresso', 'Ações'],
      g.map(x => ['<strong>' + esc(x.atividade) + '</strong>', esc(x.projeto || '-'), fmtD(x.inicio), fmtD(x.fim), '<div style="background:var(--border);height:6px;border-radius:3px;width:100px;overflow:hidden;display:inline-block;vertical-align:middle"><div style="background:var(--success);height:100%;width:' + (x.progresso || 0) + '%"></div></div> ' + (x.progresso || 0) + '%',
      '<button class="btn btn-sm btn-primary" onclick="editarGantt(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'ganttProjetos\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaAtividadeGantt() { const a = prompt('Nome da atividade:'); if (!a) return; await saveData('ganttProjetos', { atividade: a, projeto: prompt('Projeto:', 'Geral') || 'Geral', inicio: prompt('Data início (YYYY-MM-DD):') || new Date().toISOString().split('T')[0], fim: prompt('Data fim (YYYY-MM-DD):') || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], progresso: parseInt(prompt('Progresso (0-100):', '0')) || 0, data: now() }); toast('Atividade criada', 'success'); openModule('projetos-gantt'); }
async function editarGantt(id) { const g = await DB.get('ganttProjetos', id); if (!g) return; const p = prompt('Novo progresso (0-100):', g.progresso); if (p !== null) { g.progresso = parseInt(p) || 0; await saveData('ganttProjetos', g); toast('Atualizado', 'success'); openModule('projetos-gantt'); } }
function renderProjetosRecursos() {
  return header('Gestão de Recursos', 'Alocação de recursos', 'var(--success)', '', 'fa-users-cog') +
    '<div class="card"><div class="form-grid">' +
    '<div class="form-group"><label>Projeto</label><select id="recursoProjeto"><option value="">Selecione...</option></select></div>' +
    '<div class="form-group"><label>Recurso</label><select id="recursoNome"><option value="">Selecione...</option></select></div>' +
    '<div class="form-group"><label>Horas</label><input type="number" id="recursoHoras" value="0" min="0"></div></div>' +
    '<button class="btn btn-success" onclick="alocarRecurso()"><i class="fas fa-save"></i> Alocar</button></div>';
}
function alocarRecurso() { toast('Alocação não executada: falta persistência da equipa e validação de capacidade do projeto.', 'warning'); }
async function renderProjetosTimesheet() {
  const t = await getData('timesheets') || [];
  return header('Timesheet', t.length + ' registros', 'var(--warning)',
    '<button class="btn btn-success" onclick="novoTimesheet()"><i class="fas fa-plus"></i> Novo Registro</button>', 'fa-clock') +
    '<div class="card">' + table(['Recurso', 'Projeto', 'Horas', 'Data', 'Ações'],
      t.map(x => [esc(x.recurso || '-'), esc(x.projeto || '-'), (x.horas || 0) + 'h', fmtD(x.data), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'timesheets\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoTimesheet() { const r = prompt('Nome do recurso:'); if (!r) return; await saveData('timesheets', { recurso: r, projeto: prompt('Projeto:', 'Geral') || 'Geral', horas: parseFloat(prompt('Horas:', '0')) || 0, data: new Date().toISOString().split('T')[0], dataRegistro: now() }); toast('Timesheet registrado', 'success'); openModule('projetos-timesheet'); }
function renderProjetosCustos() {
  return header('Custo Real vs Planejado', 'Análise de custos', 'var(--danger)', '', 'fa-calculator') +
    '<div class="card"><div class="form-grid">' +
    '<div class="form-group"><label>Projeto</label><select id="custoProjeto"><option value="">Selecione...</option></select></div>' +
    '<div class="form-group"><label>Custo Planejado</label><input type="number" id="custoPlanejado" value="0"></div>' +
    '<div class="form-group"><label>Custo Real</label><input type="number" id="custoReal" value="0"></div></div>' +
    '<button class="btn btn-success" onclick="salvarCustoProjeto()"><i class="fas fa-save"></i> Salvar</button> <button class="btn btn-info" onclick="analisarCustos()"><i class="fas fa-chart-line"></i> Analisar</button></div>';
}
function salvarCustoProjeto() { toast('Custo não guardado: o registo de custos de projeto ainda não está ligado à base de dados.', 'warning'); }
function analisarCustos() { toast('Análise não executada: ainda não existe cálculo real de custos planeados versus realizados.', 'warning'); }
function renderProjetosRiscos() {
  return header('Matriz de Riscos', 'Identificação e gestão', 'var(--warning)', '', 'fa-exclamation-triangle') +
    '<div class="card"><div class="form-grid">' +
    '<div class="form-group"><label>Risco</label><input id="riscoDesc" placeholder="Descrição do risco"></div>' +
    '<div class="form-group"><label>Probabilidade</label><select id="riscoProb"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></div>' +
    '<div class="form-group"><label>Impacto</label><select id="riscoImpacto"><option value="baixo">Baixo</option><option value="medio">Médio</option><option value="alto">Alto</option></select></div>' +
    '<div class="form-group"><label>Estratégia</label><input id="riscoEstrategia" placeholder="Estratégia de mitigação"></div></div>' +
    '<button class="btn btn-success" onclick="salvarRisco()"><i class="fas fa-save"></i> Salvar</button></div>';
}
function salvarRisco() { toast('Risco não guardado: a matriz de riscos ainda não está ligada à base de dados.', 'warning'); }

/* ATIVOS AVANÇADO */
async function renderAtivosDepreciacao() {
  const ativos = await getData('ativos') || [];
  return header('Depreciação de Ativos', 'Cálculo de depreciação', 'var(--info)', '', 'fa-chart-line') +
    '<div class="card">' + table(['Ativo', 'Valor Original', 'Depreciação', 'Valor Atual'],
      ativos.map(a => { const anos = Math.floor((new Date() - new Date(a.dataAquisicao)) / (1000 * 60 * 60 * 24 * 365)); const dt = (a.valor || 0) * ((a.depreciacao || 0) / 100) * Math.min(anos, 10); const va = Math.max(0, (a.valor || 0) - dt); return ['<strong>' + esc(a.nome) + '</strong>', fmt(a.valor || 0), (a.depreciacao || 0) + '% ao ano', fmt(va)]; })) + '</div>';
}
async function renderAtivosManutencao() {
  const m = await getData('manutencoes') || [];
  return header('Manutenção de Ativos', m.length + ' manutenções', 'var(--warning)',
    '<button class="btn btn-success" onclick="novaManutencaoAtivo()"><i class="fas fa-plus"></i> Nova Manutenção</button>', 'fa-tools') +
    '<div class="card">' + table(['Ativo', 'Data', 'Custo', 'Status', 'Ações'],
      m.map(x => [esc(x.ativo || '-'), fmtD(x.data), fmt(x.custo || 0), badge(x.status === 'concluida' ? 'Concluída' : 'Pendente', x.status === 'concluida' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-success" onclick="concluirManutencaoAtivo(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'manutencoes\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaManutencaoAtivo() { const a = prompt('Nome do ativo:'); if (!a) return; await saveData('manutencoes', { ativo: a, data: now(), custo: parseFloat(prompt('Custo:', '0')) || 0, status: 'pendente' }); toast('Manutenção registrada', 'success'); openModule('ativos-manutencao'); }
async function concluirManutencaoAtivo(id) { const m = await DB.get('manutencoes', id); if (m) { m.status = 'concluida'; await saveData('manutencoes', m); toast('Manutenção concluída', 'success'); openModule('ativos-manutencao'); } }
async function renderAtivosGarantia() {
  const g = await getData('garantias') || [];
  return header('Controle de Garantia', g.length + ' garantias', 'var(--success)',
    '<button class="btn btn-success" onclick="novaGarantia()"><i class="fas fa-plus"></i> Nova Garantia</button>', 'fa-shield-alt') +
    '<div class="card">' + table(['Ativo', 'Início', 'Fim', 'Status', 'Ações'],
      g.map(x => { const v = new Date(x.fim) > new Date(); return [esc(x.ativo || '-'), fmtD(x.inicio), fmtD(x.fim), badge(v ? 'Válida' : 'Expirada', v ? 'success' : 'danger'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'garantias\',' + x.id + ')"><i class="fas fa-trash"></i></button>']; })) + '</div>';
}
async function novaGarantia() { const a = prompt('Nome do ativo:'); if (!a) return; await saveData('garantias', { ativo: a, inicio: new Date().toISOString().split('T')[0], fim: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0], data: now() }); toast('Garantia registrada', 'success'); openModule('ativos-garantia'); }

/* FROTA AVANÇADO */
async function renderFrotaManutencao() {
  const m = await getData('manutencoes') || [];
  return header('Manutenção de Frota', m.length + ' ordens', 'var(--warning)',
    '<button class="btn btn-success" onclick="novaManutencaoFrota()"><i class="fas fa-plus"></i> Nova Manutenção</button>', 'fa-tools') +
    '<div class="card">' + table(['Veículo', 'Data', 'Custo', 'Status', 'Ações'],
      m.map(x => [esc(x.veiculo || x.ativo || '-'), fmtD(x.data), fmt(x.custo || 0), badge(x.status === 'concluida' ? 'Concluída' : 'Pendente', x.status === 'concluida' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-success" onclick="concluirManutencaoFrota(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'manutencoes\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaManutencaoFrota() { const v = prompt('Placa do veículo:'); if (!v) return; await saveData('manutencoes', { veiculo: v, data: now(), custo: parseFloat(prompt('Custo:', '0')) || 0, status: 'pendente' }); toast('Manutenção registrada', 'success'); openModule('frota-manutencao'); }
async function concluirManutencaoFrota(id) { const m = await DB.get('manutencoes', id); if (m) { m.status = 'concluida'; await saveData('manutencoes', m); toast('Manutenção concluída', 'success'); openModule('frota-manutencao'); } }
async function renderFrotaRotas() {
  const r = await getData('roteirizacao') || [];
  return header('Rotas', r.length + ' rotas', 'var(--info)',
    '<button class="btn btn-success" onclick="novaRotaFrota()"><i class="fas fa-plus"></i> Nova Rota</button>', 'fa-route') +
    '<div class="card">' + table(['Origem', 'Destino', 'Distância', 'Fonte', 'Veículo', 'Ações'],
      r.map(x => [esc(x.origem || '-'), esc(x.destino || '-'), esc(x.distancia || 'Não calculada'), esc(x.distance_source === 'manual' ? 'Manual' : 'Não calculada'), esc(x.veiculo || '-'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'roteirizacao\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaRotaFrota() {
  const origem = prompt('Origem:'); if (!origem || !origem.trim()) return;
  const destino = prompt('Destino:'); if (!destino || !destino.trim()) return;
  const distanceInput = prompt('Distância em km (opcional; deixe vazio se ainda não foi calculada):', '');
  const veiculo = prompt('Veículo (opcional):', '') || '';
  try {
    const distance = KanawaOperations.normalizeRouteDistance(distanceInput);
    await saveData('roteirizacao', Object.assign({ origem: origem.trim(), destino: destino.trim(), veiculo: veiculo.trim(), data: now(), route_status: 'pending_calculation' }, distance));
    toast(distance.distance_source === 'manual' ? 'Rota guardada. A distância foi introduzida manualmente.' : 'Rota guardada sem distância calculada; não foi consultado nenhum mapa.', 'warning');
    openModule('frota-rotas');
  } catch (error) { toast(error.message, 'warning'); }
}
let kanawaGpsWatchActive = false;
let kanawaGpsRecordId = null;
let kanawaGpsSaving = false;
let kanawaGpsLastSavedAt = 0;
let kanawaGpsLastPoint = null;

let kanawaGpsRemoteSyncTimer = null;
let kanawaGpsRemoteSyncBusy = false;

async function sincronizarPosicoesGPSRemotas() {
  if (kanawaGpsRemoteSyncBusy || currentModule !== 'frota-gps' ||
      document.visibilityState === 'hidden' || !window.KanawaCloud || !KanawaCloud.ready) return;
  kanawaGpsRemoteSyncBusy = true;
  try {
    const remote = await KanawaCloud.getStore('gpsTracking');
    if (!Array.isArray(remote)) return;
    const local = await DB.getAll('gpsTracking');
    const queue = await DB.getAll('_sync_queue');
    const pendingIds = queue.filter(item => !item.synced && item.entity === 'gpsTracking')
      .map(item => item.payload && item.payload.id).filter(id => id !== undefined && id !== null);
    const merged = window.KanawaGpsSync.merge(local, remote, pendingIds);
    for (const record of merged.changedRecords) await DB.put('gpsTracking', record);
    if (merged.changedCount) {
      const all = await DB.getAll('gpsTracking');
      if (window.KanawaMaps && typeof window.KanawaMaps.refreshMarkers === 'function') {
        window.KanawaMaps.refreshMarkers(all);
      }
      const count = $('gpsRemoteSyncCount');
      if (count) count.textContent = all.filter(x => x.coordinates_valid === true).length + ' dispositivos/posições';
    }
    const label = $('gpsRemoteSyncStatus');
    if (label) label.textContent = 'Sincronizado com a empresa · ' + new Date().toLocaleTimeString('pt-AO');
  } catch (error) {
    const label = $('gpsRemoteSyncStatus');
    if (label) label.textContent = 'Sincronização pendente: ' + (error.message || 'sem ligação');
    console.warn('Sincronização GPS entre dispositivos:', error);
  } finally { kanawaGpsRemoteSyncBusy = false; }
}

function iniciarSincronizacaoGPSRemota() {
  if (kanawaGpsRemoteSyncTimer) clearInterval(kanawaGpsRemoteSyncTimer);
  sincronizarPosicoesGPSRemotas();
  kanawaGpsRemoteSyncTimer = setInterval(sincronizarPosicoesGPSRemotas, 15000);
}

function pararSincronizacaoGPSRemota() {
  if (kanawaGpsRemoteSyncTimer) clearInterval(kanawaGpsRemoteSyncTimer);
  kanawaGpsRemoteSyncTimer = null;
}

async function renderFrotaGPS() {
  const g = await getData('gpsTracking') || [];
  const valid = g.filter(x => x.coordinates_valid === true && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)));
  const active = valid.filter(x => x.status === 'active');
  const latest = valid.slice().sort((a, b) => new Date(b.ultimaAtualizacao || 0) - new Date(a.ultimaAtualizacao || 0))[0];
  const rows = valid.slice().sort((a, b) => new Date(b.ultimaAtualizacao || 0) - new Date(a.ultimaAtualizacao || 0)).map(x => [
    '<strong>' + esc(x.veiculo || x.deviceLabel || 'Dispositivo') + '</strong>',
    Number(x.lat).toFixed(6), Number(x.lng).toFixed(6),
    badge(x.status === 'active' ? 'Ativo' : 'Parado', x.status === 'active' ? 'success' : 'secondary'),
    esc(x.location_source === 'gps' ? 'GPS do dispositivo' : 'Manual'),
    fmtDT(x.ultimaAtualizacao),
    '<button class="btn btn-sm btn-info" onclick="centrarMapaGPS(' + Number(x.lat) + ',' + Number(x.lng) + ')"><i class="fas fa-crosshairs"></i></button>'
  ]);
  return header('Mapas e Rastreamento GPS', valid.length + ' posições válidas · ' + active.length + ' dispositivos ativos', 'var(--info)',
    '<button class="btn btn-success" onclick="iniciarRastreamentoGPS()"><i class="fas fa-location-arrow"></i> Iniciar GPS</button> <button class="btn btn-warning" onclick="pararRastreamentoGPS()"><i class="fas fa-stop"></i> Parar</button>', 'fa-map-marked-alt') +
    '<div class="metric-grid"><div class="metric-card"><div class="label">Dispositivos ativos</div><div class="value">' + active.length + '</div></div>' +
    '<div class="metric-card"><div class="label">Posições registadas</div><div class="value">' + valid.length + '</div></div>' +
    '<div class="metric-card"><div class="label">Última atualização</div><div class="value" style="font-size:1rem">' + (latest ? esc(fmtDT(latest.ultimaAtualizacao)) : 'Sem dados') + '</div></div></div>' +
    '<div class="card"><div class="alert alert-info" style="display:block">O GPS só inicia após autorização. Na aplicação Android nativa, um serviço em primeiro plano mantém a recolha com notificação visível; na versão web, o navegador pode suspender a recolha quando fica em segundo plano. Não substitui um rastreador GPS/OBD 4G dedicado.</div>' +
    '<div id="kanawaFleetMap" class="kanawa-map-canvas" role="region" aria-label="Mapa de localização da frota"></div>' +
    '<div id="kanawaGpsStatus" style="margin-top:10px;color:var(--text-muted)">GPS desligado neste dispositivo.</div><div id="gpsRemoteSyncStatus" style="margin-top:6px;color:var(--text-muted)">Sincronização entre dispositivos aguarda ligação.</div><div id="gpsRemoteSyncCount" style="margin-top:4px;color:var(--text-muted)">' + valid.length + ' posições</div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-route"></i> Calcular rota e distância</h3></div>' +
    '<div class="form-grid"><div class="form-group"><label>Origem (Angola)</label><input id="mapRouteOrigin" placeholder="Ex.: Kilamba, Luanda"></div>' +
    '<div class="form-group"><label>Destino (Angola)</label><input id="mapRouteDestination" placeholder="Ex.: Talatona, Luanda"></div></div>' +
    '<button class="btn btn-primary" onclick="calcularRotaMapa()"><i class="fas fa-route"></i> Calcular rota</button> <span id="mapRouteResult" style="margin-left:8px;color:var(--text-muted)"></span>' +
    '<p style="font-size:.78rem;color:var(--text-muted);margin-top:10px">Mapas: OpenStreetMap · Endereços: Nominatim · Rotas: OSRM. Serviços públicos comunitários, sem chave privada; sujeitos a limites e sem SLA comercial.</p></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-satellite"></i> Histórico de posições</h3><button class="btn btn-secondary btn-sm" onclick="adicionarGPS()"><i class="fas fa-plus"></i> Registo manual</button></div>' +
    table(['Dispositivo / Veículo','Latitude','Longitude','Estado','Origem','Atualização','Mapa'], rows) + '</div>';
}

function centrarMapaGPS(lat, lng) {
  try {
    const point = window.KanawaMaps.validateCoordinates(lat, lng);
    window.KanawaMaps.updateCurrentPosition({ latitude: point.lat, longitude: point.lng }, 'Posição selecionada');
  } catch (error) { toast(error.message, 'warning'); }
}

function obterChaveDispositivoGPS() {
  let key = localStorage.getItem('kanawa_gps_device_key');
  if (!key) {
    key = 'gps-' + generateId();
    localStorage.setItem('kanawa_gps_device_key', key);
  }
  return key;
}

async function persistirPontoGPS(position) {
  if (kanawaGpsSaving) return;
  const nowMs = Date.now();
  const point = window.KanawaMaps.validateCoordinates(position.latitude, position.longitude);
  const movedKm = kanawaGpsLastPoint ? window.KanawaMaps.distanceBetween(kanawaGpsLastPoint, point) : Infinity;
  if (kanawaGpsLastSavedAt && nowMs - kanawaGpsLastSavedAt < 20000 && movedKm < 0.05) return;
  kanawaGpsSaving = true;
  try {
    const deviceKey = obterChaveDispositivoGPS();
    let record = kanawaGpsRecordId ? await DB.get('gpsTracking', kanawaGpsRecordId) : null;
    if (record && record.trackingKey !== deviceKey) record = null;
    if (!record) {
      const records = await getData('gpsTracking');
      record = records.find(x => x.trackingKey === deviceKey) || null;
    }
    if (!record) record = { trackingKey: deviceKey, deviceLabel: 'Este dispositivo', veiculo: 'Dispositivo móvel' };
    const trail = Array.isArray(record.trail) ? record.trail.slice(-99) : [];
    trail.push({ lat: point.lat, lng: point.lng, accuracy: Number(position.accuracy) || null, timestamp: position.timestamp || now() });
    Object.assign(record, point, {
      coordinates_valid: true, location_source: 'gps', tracking_mode: 'browser-geolocation',
      status: 'active', accuracy: Number(position.accuracy) || null,
      speed: Number.isFinite(position.speed) ? position.speed : null,
      heading: Number.isFinite(position.heading) ? position.heading : null,
      ultimaAtualizacao: position.timestamp || now(), trail: trail
    });
    const id = await saveData('gpsTracking', record);
    kanawaGpsRecordId = id;
    kanawaGpsLastSavedAt = nowMs;
    kanawaGpsLastPoint = point;
  } catch (error) {
    console.warn('Ponto GPS não sincronizado:', error);
    toast('Posição GPS obtida, mas não foi possível guardá-la: ' + error.message, 'warning');
  } finally { kanawaGpsSaving = false; }
}

async function iniciarRastreamentoGPS() {
  if (!podeFazer('editar', 'frota-gps')) {
    toast('É necessária a permissão de edição do módulo Frota GPS para iniciar e atualizar o rastreamento.', 'error'); return;
  }
  if (!window.KanawaMaps) { toast('Motor de mapas não carregado.', 'error'); return; }
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    toast('O GPS exige uma ligação HTTPS segura.', 'warning'); return;
  }
  try {
    const deviceKey = obterChaveDispositivoGPS();
    const records = await getData('gpsTracking');
    let existing = records.find(x => x.trackingKey === deviceKey);
    if (!existing) {
      if (!podeFazer('criar', 'frota-gps')) {
        toast('O seu perfil não tem permissão para registar um novo dispositivo GPS.', 'error'); return;
      }
      existing = {
        id: deviceKey,
        trackingKey: deviceKey,
        veiculo: 'Dispositivo móvel',
        deviceLabel: (navigator.userAgent || 'Dispositivo Android').slice(0, 120),
        status: 'starting',
        location_source: 'gps',
        tracking_mode: window.KanawaAndroid ? 'android-foreground-service' : 'browser-geolocation',
        coordinates_valid: false,
        ultimaAtualizacao: now()
      };
      existing.id = await saveData('gpsTracking', existing, { skipQueueOnFailure: !!window.KanawaAndroid });
    } else {
      existing.status = 'starting';
      existing.location_source = 'gps';
      existing.tracking_mode = window.KanawaAndroid ? 'android-foreground-service' : 'browser-geolocation';
      if (window.KanawaAndroid) await DB.put('gpsTracking', existing);
      else await saveData('gpsTracking', existing);
    }
    kanawaGpsRecordId = existing.id;
    kanawaGpsLastSavedAt = 0;
    kanawaGpsLastPoint = null;

    if (window.KanawaAndroid && typeof window.KanawaAndroid.startTracking === 'function') {
      if (!window.KanawaCloud || !KanawaCloud.ready ||
          typeof KanawaCloud.getNativeTrackingConfig !== 'function') {
        throw new Error('Inicie sessão na nuvem antes de ativar o GPS Android.');
      }
      const config = await KanawaCloud.getNativeTrackingConfig({
        recordId: String(existing.id),
        deviceKey: deviceKey,
        deviceLabel: existing.deviceLabel || 'Dispositivo Android',
        vehicleLabel: existing.veiculo || 'Dispositivo móvel',
        lastPoint: existing.coordinates_valid === true ? {
          lat: Number(existing.lat), lng: Number(existing.lng),
          accuracy: existing.accuracy || null, speed: existing.speed || null,
          heading: existing.heading || null, timestamp: existing.ultimaAtualizacao || now()
        } : null,
        trail: Array.isArray(existing.trail) ? existing.trail.slice(-100) : []
      });
      const response = await window.KanawaAndroid.startTracking(config);
      if (!response.accepted) throw new Error(response.message || 'O Android não aceitou o pedido de rastreamento.');
      const status = $('kanawaGpsStatus');
      if (status) status.textContent = 'Aguardando autorização de localização do Android. O serviço nativo mantém uma notificação enquanto rastreia.';
      toast('Pedido de GPS Android enviado. Autorize a localização e mantenha a notificação ativa.', 'info');
      return;
    }

    window.KanawaMaps.startWatch(async function (position) {
      kanawaGpsWatchActive = true;
      const status = $('kanawaGpsStatus');
      if (status) status.textContent = 'GPS do navegador ativo · precisão aproximada: ' + Math.round(position.accuracy || 0) + ' m · ' + fmtDT(position.timestamp);
      window.KanawaMaps.updateCurrentPosition(position, 'Este dispositivo · GPS ativo');
      await persistirPontoGPS(position);
    }, function (error) {
      const messages = { 1: 'Permissão de localização recusada.', 2: 'Posição GPS indisponível.', 3: 'Tempo de espera do GPS esgotado.' };
      toast(messages[error.code] || 'Falha ao obter GPS.', 'warning');
    });
    toast('GPS do navegador iniciado. Para continuar com o ecrã desligado, instale a aplicação Android Kanawa.', 'info');
  } catch (error) { toast(error.message, 'warning'); }
}
async function pararRastreamentoGPS() {
  if (!podeFazer('editar', 'frota-gps')) { toast('Sem permissão para parar o rastreamento da frota.', 'error'); return; }
  if (window.KanawaAndroid && typeof window.KanawaAndroid.stopTracking === 'function') {
    try {
      const response = await window.KanawaAndroid.stopTracking();
      if (!response.accepted) throw new Error(response.message || 'Não foi possível parar o serviço Android.');
      kanawaGpsWatchActive = false;
      const status = $('kanawaGpsStatus');
      if (status) status.textContent = 'Pedido para parar o serviço GPS Android enviado.';
      toast('Rastreamento Android a parar e a sincronizar o estado final.', 'info');
      return;
    } catch (error) { toast(error.message, 'warning'); return; }
  }
  if (!window.KanawaMaps) return;
  window.KanawaMaps.stopWatch();
  kanawaGpsWatchActive = false;
  const status = $('kanawaGpsStatus');
  if (status) status.textContent = 'GPS desligado neste dispositivo.';
  if (kanawaGpsRecordId) {
    try {
      const record = await DB.get('gpsTracking', kanawaGpsRecordId);
      if (record && record.trackingKey === obterChaveDispositivoGPS()) {
        record.status = 'stopped';
        record.ultimaAtualizacao = now();
        await saveData('gpsTracking', record);
      }
    } catch (error) { toast('GPS parado; estado final ainda não sincronizado.', 'warning'); }
  }
  toast('Rastreamento GPS parado.', 'success');
}

async function calcularRotaMapa() {
  const origin = $('mapRouteOrigin'), destination = $('mapRouteDestination');
  if (!origin || !destination || !origin.value.trim() || !destination.value.trim()) {
    toast('Informe a origem e o destino.', 'warning'); return;
  }
  const result = $('mapRouteResult');
  if (result) result.textContent = 'A pesquisar endereços e calcular rota…';
  try {
    const route = await window.KanawaMaps.calculateRoute(origin.value.trim(), destination.value.trim());
    window.KanawaMaps.showRoute(route);
    if (result) result.textContent = route.distanceKm.toFixed(2) + ' km · ' + Math.round(route.durationMinutes) + ' min (estimativa rodoviária)';
    await saveData('roteirizacao', {
      origem: origin.value.trim(), destino: destination.value.trim(),
      origemLat: route.origin.lat, origemLng: route.origin.lng,
      destinoLat: route.destination.lat, destinoLng: route.destination.lng,
      distancia: route.distanceKm.toFixed(2) + ' km',
      duracaoEstimadaMinutos: Math.round(route.durationMinutes),
      distance_source: 'osrm-openstreetmap', route_status: 'calculated', data: now()
    });
    toast('Rota calculada e guardada.', 'success');
  } catch (error) {
    if (result) result.textContent = '';
    toast(error.message || 'Não foi possível calcular a rota.', 'warning');
  }
}

async function adicionarGPS() {
  const veiculo = prompt('Placa/identificação do veículo:'); if (!veiculo || !veiculo.trim()) return;
  const latitude = prompt('Latitude real:'); if (latitude === null || latitude.trim() === '') return;
  const longitude = prompt('Longitude real:'); if (longitude === null || longitude.trim() === '') return;
  try {
    const point = window.KanawaMaps.validateCoordinates(latitude, longitude);
    await saveData('gpsTracking', Object.assign({ veiculo: veiculo.trim(), ultimaAtualizacao: now(), location_source: 'manual', tracking_mode: 'manual', status: 'stopped', coordinates_valid: true }, point));
    toast('Posição manual guardada; não representa rastreamento contínuo.', 'warning');
    openModule('frota-gps');
  } catch (error) { toast(error.message, 'warning'); }
}
async function renderFrotaCombustivel() {
  const a = await getData('abastecimentos') || [];
  return header('Consumo de Combustível', a.length + ' abastecimentos', 'var(--warning)',
    '<button class="btn btn-success" onclick="novoAbastecimento()"><i class="fas fa-plus"></i> Novo Abastecimento</button>', 'fa-gas-pump') +
    '<div class="card">' + table(['Veículo', 'Data', 'Litros', 'Custo', 'Ações'],
      a.map(x => [esc(x.veiculo || '-'), fmtD(x.data), (x.litros || 0) + 'L', fmt(x.custo || 0), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'abastecimentos\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoAbastecimento() { const v = prompt('Placa do veículo:'); if (!v) return; await saveData('abastecimentos', { veiculo: v, data: now(), litros: parseFloat(prompt('Litros:', '0')) || 0, custo: parseFloat(prompt('Custo:', '0')) || 0 }); toast('Abastecimento registrado', 'success'); openModule('frota-combustivel'); }
function renderFrotaDocumentos() {
  return header('Documentação da Frota', 'Documentos dos veículos', 'var(--primary)', '', 'fa-file-alt') +
    '<div class="card"><div class="form-grid">' +
    '<div class="form-group"><label>Veículo</label><select id="docVeiculo"><option value="">Selecione...</option></select></div>' +
    '<div class="form-group"><label>Tipo</label><select><option>Licenciamento</option><option>Seguro</option><option>Inspeção</option></select></div>' +
    '<div class="form-group"><label>Validade</label><input type="date" id="docValidade"></div></div>' +
    '<button class="btn btn-success" onclick="salvarDocumentoFrota()"><i class="fas fa-save"></i> Salvar</button></div>';
}
function salvarDocumentoFrota() { toast('Documento não guardado: falta persistência e validação documental da frota.', 'warning'); }
async function renderFrotaMultas() {
  const m = await getData('multas') || [];
  return header('Multas', m.length + ' multas', 'var(--danger)',
    '<button class="btn btn-success" onclick="novaMulta()"><i class="fas fa-plus"></i> Nova Multa</button>', 'fa-exclamation-circle') +
    '<div class="card">' + table(['Veículo', 'Data', 'Valor', 'Status', 'Ações'],
      m.map(x => [esc(x.veiculo || '-'), fmtD(x.data), fmt(x.valor || 0), badge(x.status === 'paga' ? 'Paga' : 'Pendente', x.status === 'paga' ? 'success' : 'danger'),
      '<button class="btn btn-sm btn-success" onclick="pagarMulta(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'multas\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaMulta() { const v = prompt('Placa do veículo:'); if (!v) return; await saveData('multas', { veiculo: v, data: now(), valor: parseFloat(prompt('Valor:', '0')) || 0, status: 'pendente', descricao: prompt('Descrição:') || '' }); toast('Multa registrada', 'success'); openModule('frota-multas'); }
async function pagarMulta(id) { const m = await DB.get('multas', id); if (m) { m.status = 'paga'; await saveData('multas', m); toast('Multa paga', 'success'); openModule('frota-multas'); } }
async function renderFrotaDesempenho() {
  const f = await getData('frotas') || [];
  const ativos = f.filter(x => x.status === 'ativo').length;
  const manut = f.filter(x => x.status === 'manutencao').length;
  return header('Desempenho da Frota', f.length + ' veículos', 'var(--info)',
    '<button class="btn btn-success" onclick="gerarRelatorioFrota()"><i class="fas fa-file-export"></i> Relatório</button>', 'fa-chart-bar') +
    '<div class="metric-grid">' +
    '<div class="metric-card"><div class="label">Veículos Ativos</div><div class="value">' + ativos + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--warning)"><div class="label">Em Manutenção</div><div class="value">' + manut + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">Utilização</div><div class="value">' + (f.length > 0 ? Math.round((ativos / f.length) * 100) : 0) + '%</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> Detalhes</h3></div>' +
    (f.length > 0 ? f.map(x => '<div style="padding:6px 0;border-bottom:1px solid var(--border)"><strong>' + esc(x.placa) + '</strong> - ' + esc(x.modelo || '-') + ' ' + badge(x.status || 'ativo', x.status === 'ativo' ? 'success' : 'warning') + '</div>').join('') : 'Nenhum veículo') + '</div>';
}
function gerarRelatorioFrota() { toast('Relatório da frota ainda não foi implementado; nenhum ficheiro foi gerado.', 'warning'); }

/* OS AVANÇADO */
async function renderOSManutencao() {
  const o = await getData('ordensManutencao') || [];
  return header('Ordens de Manutenção', o.length + ' ordens', 'var(--warning)',
    '<button class="btn btn-success" onclick="novaOrdemManutencao()"><i class="fas fa-plus"></i> Nova Ordem</button>', 'fa-tools') +
    '<div class="card">' + table(['Equipamento', 'Data', 'Status', 'Ações'],
      o.map(x => [esc(x.equipamento || x.veiculo || '-'), fmtD(x.data), badge(x.status === 'concluida' ? 'Concluída' : 'Pendente', x.status === 'concluida' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-success" onclick="concluirOSManutencao(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'ordensManutencao\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaOrdemManutencao() { const e = prompt('Equipamento:'); if (!e) return; await saveData('ordensManutencao', { equipamento: e, data: now(), status: 'pendente', descricao: prompt('Descrição:') || '' }); toast('Ordem criada', 'success'); openModule('os-manutencao'); }
async function concluirOSManutencao(id) { const o = await DB.get('ordensManutencao', id); if (o) { o.status = 'concluida'; await saveData('ordensManutencao', o); toast('Ordem concluída', 'success'); openModule('os-manutencao'); } }
async function renderOSChecklist() {
  const c = await getData('checklistsInspecao') || [];
  return header('Checklist de Inspeção', c.length + ' checklists', 'var(--success)',
    '<button class="btn btn-success" onclick="novoChecklist()"><i class="fas fa-plus"></i> Novo Checklist</button>', 'fa-clipboard-check') +
    '<div class="card">' + table(['Item', 'Data', 'Responsável', 'Status', 'Ações'],
      c.map(x => [esc(x.item || '-'), fmtD(x.data), esc(x.responsavel || '-'), badge(x.status === 'aprovado' ? 'Aprovado' : 'Pendente', x.status === 'aprovado' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-success" onclick="aprovarChecklist(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'checklistsInspecao\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoChecklist() { const i = prompt('Item do checklist:'); if (!i) return; await saveData('checklistsInspecao', { item: i, data: now(), responsavel: prompt('Responsável:') || 'Não definido', status: 'pendente' }); toast('Checklist criado', 'success'); openModule('os-checklist'); }
async function aprovarChecklist(id) { const c = await DB.get('checklistsInspecao', id); if (c) { c.status = 'aprovado'; await saveData('checklistsInspecao', c); toast('Checklist aprovado', 'success'); openModule('os-checklist'); } }
async function renderOSCalendario() {
  const e = await getData('calendarioManutencoes') || [];
  return header('Calendário de Manutenções', e.length + ' eventos', 'var(--info)',
    '<button class="btn btn-success" onclick="novoEventoManutencao()"><i class="fas fa-plus"></i> Novo Evento</button>', 'fa-calendar-alt') +
    '<div class="card">' + table(['Data', 'Equipamento', 'Tipo', 'Status', 'Ações'],
      e.map(x => [fmtD(x.data), esc(x.equipamento || '-'), esc(x.tipo || '-'), badge(x.status === 'concluido' ? 'Concluído' : 'Pendente', x.status === 'concluido' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-success" onclick="concluirEventoManutencao(' + x.id + ')"><i class="fas fa-check"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'calendarioManutencoes\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoEventoManutencao() { const eq = prompt('Equipamento:'); if (!eq) return; await saveData('calendarioManutencoes', { equipamento: eq, data: prompt('Data (YYYY-MM-DD):') || new Date().toISOString().split('T')[0], tipo: prompt('Tipo:', 'Preventiva') || 'Preventiva', status: 'pendente' }); toast('Evento agendado', 'success'); openModule('os-calendario'); }
async function concluirEventoManutencao(id) { const e = await DB.get('calendarioManutencoes', id); if (e) { e.status = 'concluido'; await saveData('calendarioManutencoes', e); toast('Evento concluído', 'success'); openModule('os-calendario'); } }
async function renderOSTecnicos() {
  const t = await getData('tecnicos') || [];
  return header('Técnicos', t.length + ' técnicos', 'var(--info)',
    '<button class="btn btn-success" onclick="novoTecnico()"><i class="fas fa-plus"></i> Novo Técnico</button>', 'fa-user-cog') +
    '<div class="card">' + table(['Nome', 'Especialidade', 'Telefone', 'Ações'],
      t.map(x => ['<strong>' + esc(x.nome) + '</strong>', esc(x.especialidade || '-'), esc(x.telefone || '-'), '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'tecnicos\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoTecnico() { const n = prompt('Nome do técnico:'); if (!n) return; await saveData('tecnicos', { nome: n, especialidade: prompt('Especialidade:') || 'Geral', telefone: prompt('Telefone:') || '' }); toast('Técnico cadastrado', 'success'); openModule('os-tecnicos'); }

/* PRODUTOS AVALIAÇÕES */
async function renderProdutosAvaliacoes() {
  const a = await getData('avaliacoes') || [];
  return header('Avaliações', a.length + ' avaliações', 'var(--warning)',
    '<button class="btn btn-success" onclick="novaAvaliacao()"><i class="fas fa-plus"></i> Nova Avaliação</button>', 'fa-star') +
    '<div class="card">' + table(['Produto', 'Cliente', 'Nota', 'Comentário', 'Data', 'Ações'],
      a.map(x => [esc(x.produto || '-'), esc(x.cliente || 'Anônimo'), '⭐'.repeat(x.nota || 0) + ' (' + (x.nota || 0) + ')', esc((x.comentario || '-').substring(0, 50)), fmtD(x.data),
      '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'avaliacoes\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaAvaliacao() { const p = prompt('Produto:'); if (!p) return; await saveData('avaliacoes', { produto: p, cliente: prompt('Cliente:', 'Anônimo') || 'Anônimo', nota: Math.min(5, Math.max(1, parseInt(prompt('Nota (1-5):', '5')) || 5)), comentario: prompt('Comentário:') || '', data: now() }); toast('Avaliação registrada', 'success'); openModule('produtos-avaliacoes'); }

/* TABELAS DE PREÇOS */
async function renderTabelasPrecos() {
  const t = await getData('tabelasPrecos') || [];
  return header('Tabelas de Preços', t.length + ' tabelas', 'var(--primary)',
    '<button class="btn btn-success" onclick="novaTabelaPreco()"><i class="fas fa-plus"></i> Nova Tabela</button>', 'fa-table') +
    '<div class="card">' + table(['Nome', 'Produtos', 'Desconto', 'Status', 'Ações'],
      t.map(x => ['<strong>' + esc(x.nome) + '</strong>', formatN(x.produtos || 0), (x.desconto || 0) + '%', badge(x.ativo !== false ? 'Ativa' : 'Inativa', x.ativo !== false ? 'success' : 'danger'),
      '<button class="btn btn-sm btn-primary" onclick="editarTabelaPreco(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'tabelasPrecos\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaTabelaPreco() { const n = prompt('Nome da tabela:'); if (!n) return; await saveData('tabelasPrecos', { nome: n, desconto: parseFloat(prompt('Desconto (%):', '0')) || 0, ativo: true, data: now() }); toast('Tabela criada', 'success'); openModule('tabelas-precos'); }
async function editarTabelaPreco(id) { const t = await DB.get('tabelasPrecos', id); if (!t) return; const n = prompt('Novo nome:', t.nome); if (n) { t.nome = n; await saveData('tabelasPrecos', t); toast('Atualizada', 'success'); openModule('tabelas-precos'); } }

/* VENDAS CONSIGNADAS */
async function renderVendasConsignadas() {
  const v = await getData('vendasConsignadas') || [];
  return header('Vendas Consignadas', v.length + ' vendas', 'var(--purple)',
    '<button class="btn btn-success" onclick="novaVendaConsignada()"><i class="fas fa-plus"></i> Nova Venda</button>', 'fa-handshake') +
    '<div class="card">' + table(['Cliente', 'Produto', 'Quantidade', 'Valor', 'Status', 'Ações'],
      v.map(x => [esc(x.cliente || '-'), esc(x.produto || '-'), formatN(x.quantidade || 0), fmt(x.valor || 0), badge(x.status === 'finalizada' ? 'Finalizada' : 'Pendente', x.status === 'finalizada' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-primary" onclick="editarVendaConsignada(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'vendasConsignadas\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaVendaConsignada() { const c = prompt('Cliente:'); if (!c) return; await saveData('vendasConsignadas', { cliente: c, produto: prompt('Produto:') || 'Produto', quantidade: parseInt(prompt('Quantidade:', '1')) || 1, valor: parseFloat(prompt('Valor:', '0')) || 0, status: 'pendente', data: now() }); toast('Venda consignada registrada', 'success'); openModule('vendas-consignadas'); }
async function editarVendaConsignada(id) { const v = await DB.get('vendasConsignadas', id); if (!v) return; const s = prompt('Status (pendente, finalizada):', v.status); if (s) { v.status = s; await saveData('vendasConsignadas', v); toast('Atualizada', 'success'); openModule('vendas-consignadas'); } }

/* VENDAS PROMOÇÕES */
async function renderVendasPromocoes() {
  const c = await getData('cupons') || [];
  return header('Promoções e Cupons', c.length + ' cupons', 'var(--warning)',
    '<button class="btn btn-success" onclick="novoCupom()"><i class="fas fa-plus"></i> Novo Cupom</button>' +
    '<button class="btn btn-info" onclick="gerarCupomPromocional()"><i class="fas fa-random"></i> Gerar</button>', 'fa-tags') +
    '<div class="card">' + table(['Código', 'Desconto', 'Tipo', 'Validade', 'Status', 'Ações'],
      c.map(x => { const v = new Date(x.validade) > new Date(); return ['<strong>' + esc(x.codigo) + '</strong>', (x.desconto || 0) + '%', badge(x.tipo || 'geral', 'info'), fmtD(x.validade), badge(v ? 'Válido' : 'Expirado', v ? 'success' : 'danger'),
        '<button class="btn btn-sm btn-primary" onclick="editarCupom(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'cupons\',' + x.id + ')"><i class="fas fa-trash"></i></button>']; })) + '</div>';
}
async function novoCupom() { const c = prompt('Código do cupom:'); if (!c) return; await saveData('cupons', { codigo: c.toUpperCase(), desconto: parseFloat(prompt('Desconto (%):', '10')) || 10, tipo: prompt('Tipo (geral, produto, frete):', 'geral') || 'geral', validade: new Date(Date.now() + 30 * 86400000).toISOString(), data: now() }); toast('Cupom criado', 'success'); openModule('vendas-promocoes'); }
async function gerarCupomPromocional() { const c = 'PROMO' + Math.random().toString(36).substr(2, 4).toUpperCase(); await saveData('cupons', { codigo: c, desconto: Math.floor(Math.random() * 20) + 5, tipo: 'promocional', validade: new Date(Date.now() + 15 * 86400000).toISOString(), data: now() }); toast('Cupom ' + c + ' gerado', 'success'); openModule('vendas-promocoes'); }
async function editarCupom(id) { const c = await DB.get('cupons', id); if (!c) return; const d = prompt('Novo desconto (%):', c.desconto); if (d !== null) { c.desconto = parseFloat(d) || 0; await saveData('cupons', c); toast('Atualizado', 'success'); openModule('vendas-promocoes'); } }

/* CLIENTES FIDELIDADE / CUPONS / PORTAL / SEGMENTAÇÃO */
async function renderClientesFidelidade() {
  const f = await getData('fidelidade') || [];
  return header('Fidelização de Clientes', f.length + ' clientes', 'var(--success)',
    '<button class="btn btn-success" onclick="adicionarClienteFidelidade()"><i class="fas fa-user-plus"></i> Adicionar Cliente</button>', 'fa-star') +
    '<div class="card">' + table(['Cliente', 'Pontos', 'Nível', 'Status', 'Ações'],
      f.map(x => [esc(x.cliente || '-'), '<strong>' + formatN(x.pontos || 0) + '</strong>', badge(x.nivel === 'ouro' ? 'Ouro' : x.nivel === 'prata' ? 'Prata' : 'Bronze', x.nivel === 'ouro' ? 'warning' : x.nivel === 'prata' ? 'info' : 'secondary'), badge(x.ativo !== false ? 'Ativo' : 'Inativo', x.ativo !== false ? 'success' : 'danger'),
      '<button class="btn btn-sm btn-success" onclick="adicionarPontosFidelidade(' + x.id + ')"><i class="fas fa-plus"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'fidelidade\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function adicionarClienteFidelidade() { const c = prompt('Nome do cliente:'); if (!c) return; await saveData('fidelidade', { cliente: c, pontos: 0, nivel: 'bronze', ativo: true, data: now() }); toast('Cliente adicionado', 'success'); openModule('clientes-fidelidade'); }
async function adicionarPontosFidelidade(id) { const f = await DB.get('fidelidade', id); if (!f) return; const p = parseInt(prompt('Pontos a adicionar:', '10')) || 0; f.pontos = (f.pontos || 0) + p; if (f.pontos >= 1000) f.nivel = 'ouro'; else if (f.pontos >= 500) f.nivel = 'prata'; else f.nivel = 'bronze'; await saveData('fidelidade', f); toast('Pontos adicionados', 'success'); openModule('clientes-fidelidade'); }
async function renderClientesCupons() {
  const c = await getData('cupons') || [];
  return header('Cupons para Clientes', c.length + ' cupons', 'var(--warning)',
    '<button class="btn btn-success" onclick="distribuirCupomCliente()"><i class="fas fa-gift"></i> Distribuir Cupom</button>', 'fa-ticket-alt') +
    '<div class="card">' + table(['Código', 'Cliente', 'Desconto', 'Validade', 'Status'],
      c.map(x => { const v = new Date(x.validade) > new Date(); return ['<strong>' + esc(x.codigo) + '</strong>', esc(x.cliente || 'Geral'), (x.desconto || 0) + '%', fmtD(x.validade), badge(v ? 'Válido' : 'Expirado', v ? 'success' : 'danger')]; })) + '</div>';
}
async function distribuirCupomCliente() { const c = prompt('Nome do cliente:'); if (!c) return; const cod = 'CUPOM' + Math.random().toString(36).substr(2, 4).toUpperCase(); await saveData('cupons', { codigo: cod, cliente: c, desconto: parseInt(prompt('Desconto (%):', '10')) || 10, validade: new Date(Date.now() + 30 * 86400000).toISOString(), data: now() }); toast('Cupom distribuído', 'success'); openModule('clientes-cupons'); }
async function renderPortalCliente() {
  const c = await getData('clientes') || [];
  return header('Portal do Cliente', c.length + ' clientes', 'var(--info)',
    '<button class="btn btn-success" onclick="convidarClientePortal()"><i class="fas fa-envelope"></i> Convidar</button>' +
    '<button class="btn btn-primary" onclick="abrirPortalCliente()"><i class="fas fa-external-link-alt"></i> Abrir Portal</button>', 'fa-user-circle') +
    '<div class="card">' + table(['Cliente', 'Email', 'Último Acesso', 'Status'],
      c.slice(0, 10).map(x => [esc(x.nome), esc(x.email || '-'), x.ultimoAcesso ? fmtDT(x.ultimoAcesso) : '-', badge(x.ativo !== false ? 'Ativo' : 'Inativo', x.ativo !== false ? 'success' : 'danger')])) + '</div>';
}
function convidarClientePortal() { toast('Convite não enviado: o portal do cliente ainda não tem fluxo de autenticação e email implementado.', 'warning'); }
function abrirPortalCliente() { toast('Portal do cliente ainda não está publicado nem ligado a contas de clientes.', 'warning'); }
async function renderClientesSegmentacao() {
  const s = await getData('segmentacoes') || [];
  return header('Segmentação de Clientes', s.length + ' segmentos', 'var(--purple)',
    '<button class="btn btn-success" onclick="novoSegmento()"><i class="fas fa-plus"></i> Novo Segmento</button>', 'fa-users-cog') +
    '<div class="card">' + table(['Nome', 'Critério', 'Clientes', 'Ações'],
      s.map(x => ['<strong>' + esc(x.nome) + '</strong>', esc(x.criterio || '-'), formatN(x.clientes || 0),
      '<button class="btn btn-sm btn-primary" onclick="editarSegmento(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'segmentacoes\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoSegmento() { const n = prompt('Nome do segmento:'); if (!n) return; await saveData('segmentacoes', { nome: n, criterio: prompt('Critério:', 'Geral') || 'Geral', clientes: 0, data: now() }); toast('Segmento criado', 'success'); openModule('clientes-segmentacao'); }
async function editarSegmento(id) { const s = await DB.get('segmentacoes', id); if (!s) return; const n = prompt('Novo nome:', s.nome); if (n) { s.nome = n; await saveData('segmentacoes', s); toast('Atualizado', 'success'); openModule('clientes-segmentacao'); } }

/* CRM AVANÇADO */
async function renderCRMPipeline() {
  const l = await getData('leads') || [];
  const stages = ['novo', 'contato', 'qualificado', 'proposta', 'negociacao', 'fechado'];
  const labels = { novo: '🆕 Novo', contato: '📞 Contato', qualificado: '✅ Qualificado', proposta: '📄 Proposta', negociacao: '🤝 Negociação', fechado: '🏆 Fechado' };
  return header('Pipeline de Vendas', l.length + ' leads', 'var(--primary)', '', 'fa-columns') +
    '<div class="kanban-columns">' + stages.map(s => { const ls = l.filter(x => x.status === s); return '<div class="kanban-column"><h5>' + (labels[s] || s) + ' (' + ls.length + ')</h5>' + (ls.length > 0 ? ls.map(x => '<div class="kanban-card" onclick="detalharLead(' + x.id + ')"><div style="font-weight:600;font-size:.75rem">' + esc(x.nome) + '</div><div style="font-size:.6rem;color:var(--text-muted)">' + esc(x.telefone || x.email || '-') + '</div></div>').join('') : '<div style="text-align:center;padding:8px;color:var(--text-muted);font-size:.6rem">Vazio</div>') + '</div>'; }).join('') + '</div>';
}
async function detalharLead(id) { const l = await DB.get('leads', id); if (l) toast(l.nome + ' - ' + (l.telefone || l.email || 'Sem contato'), 'info'); }
async function renderCRMAutomacao() {
  const a = await getData('automacoes') || [];
  return header('Automação CRM', a.length + ' automações', 'var(--info)',
    '<button class="btn btn-success" onclick="novaAutomacaoCRM()"><i class="fas fa-plus"></i> Nova Automação</button>', 'fa-robot') +
    '<div class="card">' + table(['Nome', 'Gatilho', 'Ação', 'Status', 'Ações'],
      a.map(x => ['<strong>' + esc(x.nome) + '</strong>', esc(x.gatilho || '-'), esc(x.acao || '-'), badge(x.ativo !== false ? 'Ativo' : 'Inativo', x.ativo !== false ? 'success' : 'danger'),
      '<button class="btn btn-sm btn-primary" onclick="editarAutomacaoCRM(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'automacoes\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaAutomacaoCRM() { const n = prompt('Nome da automação:'); if (!n) return; await saveData('automacoes', { nome: n, gatilho: prompt('Gatilho:', 'Novo lead') || 'Novo lead', acao: prompt('Ação:', 'Enviar email') || 'Enviar email', ativo: true, data: now() }); toast('Automação criada', 'success'); openModule('crm-automacao'); }
async function editarAutomacaoCRM(id) { const a = await DB.get('automacoes', id); if (!a) return; const n = prompt('Novo nome:', a.nome); if (n) { a.nome = n; await saveData('automacoes', a); toast('Atualizada', 'success'); openModule('crm-automacao'); } }
async function renderCRMScore() {
  const s = await getData('scoreLeads') || [];
  return header('Score de Leads', s.length + ' leads pontuados', 'var(--primary)', '', 'fa-chart-line') +
    '<div class="card">' + table(['Lead', 'Score', 'Nível', 'Status'],
      s.map(x => { const sc = x.score || 0; const n = sc >= 80 ? '🔥 Quente' : sc >= 50 ? '🌤️ Morno' : '❄️ Frio'; return [esc(x.lead || '-'), '<strong>' + sc + '%</strong>', badge(n, sc >= 80 ? 'danger' : sc >= 50 ? 'warning' : 'info'), badge(x.status === 'convertido' ? 'Convertido' : 'Pendente', x.status === 'convertido' ? 'success' : 'secondary')]; })) + '</div>';
}
function renderCRMRemarketing() {
  return header('Remarketing', 'Campanhas de remarketing', 'var(--warning)', '', 'fa-retweet') +
    '<div class="card"><div class="form-group"><label>Segmento</label><select><option>Clientes que abandonaram carrinho</option><option>Clientes inativos há 30 dias</option><option>Clientes com alta pontuação</option><option>Todos os clientes</option></select></div>' +
    '<div class="form-group"><label>Mensagem</label><textarea rows="3" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text)">Olá! Temos uma oferta especial para você!</textarea></div>' +
    '<div class="form-actions"><button class="btn btn-success" onclick="executarRemarketing()"><i class="fas fa-play"></i> Executar Campanha</button><button class="btn btn-info" onclick="agendarRemarketing()"><i class="fas fa-clock"></i> Agendar</button></div></div>';
}
function executarRemarketing() { toast('Campanha não enviada: falta configurar um provedor de email/WhatsApp e consentimento dos destinatários.', 'warning'); }
function agendarRemarketing() { toast('Campanha não agendada: o agendador de campanhas ainda não está implementado.', 'warning'); }

/* MARKETING */
async function renderMarketingCampanhas() {
  const c = await getData('campanhasMarketing') || [];
  return header('Campanhas de Marketing', c.length + ' campanhas', 'var(--danger)',
    '<button class="btn btn-success" onclick="novaCampanhaMarketing()"><i class="fas fa-plus"></i> Nova Campanha</button>', 'fa-bullhorn') +
    '<div class="card">' + table(['Nome', 'Canal', 'Orçamento', 'Status', 'Ações'],
      c.map(x => ['<strong>' + esc(x.nome) + '</strong>', esc(x.canal || '-'), fmt(x.orcamento || 0), badge(x.status === 'ativa' ? 'Ativa' : 'Pendente', x.status === 'ativa' ? 'success' : 'warning'),
      '<button class="btn btn-sm btn-primary" onclick="editarCampanhaMarketing(' + x.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'campanhasMarketing\',' + x.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novaCampanhaMarketing() { const n = prompt('Nome da campanha:'); if (!n) return; await saveData('campanhasMarketing', { nome: n, canal: prompt('Canal:', 'Email') || 'Email', orcamento: parseFloat(prompt('Orçamento:', '0')) || 0, status: 'pendente', data: now() }); toast('Campanha criada', 'success'); openModule('marketing-campanhas'); }
async function editarCampanhaMarketing(id) { const c = await DB.get('campanhasMarketing', id); if (!c) return; const n = prompt('Novo nome:', c.nome); if (n) { c.nome = n; await saveData('campanhasMarketing', c); toast('Atualizada', 'success'); openModule('marketing-campanhas'); } }
async function renderMarketingAnalise() {
  const c = await getData('campanhasMarketing') || [];
  return header('Análise de Campanhas', c.length + ' campanhas analisadas', 'var(--info)', '', 'fa-chart-pie') +
    '<div class="metric-grid">' +
    '<div class="metric-card"><div class="label">Total Campanhas</div><div class="value">' + c.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">Campanhas Ativas</div><div class="value">' + c.filter(x => x.status === 'ativa').length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--info)"><div class="label">Orçamento Total</div><div class="value">' + fmt(c.reduce((s, x) => s + (x.orcamento || 0), 0)) + '</div></div></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> Desempenho</h3></div>' +
    '<div style="font-size:.8rem"><div style="padding:4px 0;border-bottom:1px solid var(--border)">📊 ROI Médio: +15%</div>' +
    '<div style="padding:4px 0;border-bottom:1px solid var(--border)">🎯 Taxa de Conversão: 8.5%</div>' +
    '<div style="padding:4px 0">📈 Crescimento: +12%</div></div></div>';
}

/* E-LEARNING */
async function renderElearningCursos() {
  const c = await getData('cursos') || [];
  return header('Cursos', c.length + ' cursos', 'var(--success)',
    '<button class="btn btn-success" onclick="novoCurso()"><i class="fas fa-plus"></i> Novo Curso</button>', 'fa-book') +
    '<div class="card">' + (c.length > 0 ? '<div class="product-grid">' + c.map(x => '<div class="pdv-prod-card"><div style="background:var(--bg);height:100px;display:flex;align-items:center;justify-content:center;border-radius:var(--radius-sm);font-size:2rem;color:var(--primary)"><i class="fas fa-graduation-cap"></i></div><div class="info"><div class="name">' + esc(x.nome) + '</div><div style="font-size:.6rem;color:var(--text-muted)">' + (x.modulos || 0) + ' módulos</div><div style="font-size:.6rem;color:var(--text-muted)">' + (x.alunos || 0) + ' alunos</div><div style="margin-top:4px">' + badge(x.status || 'ativo', 'success') + '</div><div style="margin-top:6px;display:flex;gap:4px;justify-content:center"><button class="btn btn-sm btn-primary" onclick="abrirCurso(' + x.id + ')"><i class="fas fa-eye"></i></button><button class="btn btn-sm btn-danger" onclick="excluirItem(\'cursos\',' + x.id + ')"><i class="fas fa-trash"></i></button></div></div></div>').join('') + '</div>' : emptyState('fa-book', 'Nenhum curso cadastrado')) + '</div>';
}
async function novoCurso() { const n = prompt('Nome do curso:'); if (!n) return; await saveData('cursos', { nome: n, descricao: prompt('Descrição:') || '', modulos: 0, alunos: 0, status: 'ativo', data: now() }); toast('Curso criado', 'success'); openModule('elearning-cursos'); }
function abrirCurso(id) { toast('Abrindo curso...', 'info'); }
async function renderElearningCertificacoes() {
  const c = await getData('certificacoes') || [];
  const cfg = JSON.parse(localStorage.getItem('kanawa_certificado_config') || '{}');
  const tema = cfg.tema || 'azul';
  return header('Certificações', c.length + ' certificados emitidos', 'var(--warning)',
    '<button class="btn btn-success" onclick="novaCertificacao()"><i class="fas fa-plus"></i> Emitir certificado</button>', 'fa-certificate') +
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-palette"></i> Personalizar modelo de certificado</h3></div>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label>Design</label><select id="certTema"><option value="azul" ' + (tema === 'azul' ? 'selected' : '') + '>Azul e dourado — clássico</option><option value="verde" ' + (tema === 'verde' ? 'selected' : '') + '>Verde — institucional</option><option value="minimal" ' + (tema === 'minimal' ? 'selected' : '') + '>Azul-marinho — minimalista</option></select></div>' +
    '<div class="form-group"><label>Instituição / empresa emissora</label><input id="certEmissor" value="' + esc(cfg.emissor || localStorage.getItem('kanawa_empresa') || 'Instituição de Formação') + '" placeholder="Nome da instituição"></div>' +
    '<div class="form-group"><label>Texto complementar</label><input id="certSubtitulo" value="' + esc(cfg.subtitulo || 'Certifica-se que') + '" placeholder="Ex.: concluiu com aproveitamento"></div>' +
    '<div class="form-group"><label>Nome do responsável pela assinatura</label><input id="certResponsavel" value="' + esc(cfg.responsavel || '') + '" placeholder="Nome do diretor / responsável"></div>' +
    '<div class="form-group"><label>Cargo do responsável</label><input id="certCargo" value="' + esc(cfg.cargo || 'Direção') + '" placeholder="Cargo"></div>' +
    '<div class="form-group"><label>Local de emissão</label><input id="certLocal" value="' + esc(cfg.local || 'Luanda, Angola') + '" placeholder="Cidade, país"></div>' +
    '</div><button class="btn btn-primary" onclick="salvarConfigCertificados()"><i class="fas fa-save"></i> Guardar personalização</button> ' +
    '<button class="btn btn-outline" onclick="prévisualizarModeloCertificado()"><i class="fas fa-eye"></i> Pré-visualizar modelo</button></div>' +
    '<div class="card"><div class="card-header"><h3 class="card-title">Certificados emitidos</h3><span class="badge">' + c.length + '</span></div>' +
    (c.length ? '<div class="table-responsive"><table><thead><tr><th>Aluno</th><th>Curso</th><th>Emissão</th><th>Validade</th><th>Estado</th><th>Acções</th></tr></thead><tbody>' +
    c.map(x => { const v = new Date(x.validade) > new Date(); return '<tr><td>' + esc(x.aluno || '-') + '</td><td>' + esc(x.curso || '-') + '</td><td>' + fmtD(x.data) + '</td><td>' + fmtD(x.validade) + '</td><td>' + badge(v ? 'Válida' : 'Expirada', v ? 'success' : 'danger') + '</td><td><button class="btn btn-sm btn-primary" onclick="imprimirCertificado(' + Number(x.id) + ')"><i class="fas fa-print"></i> Imprimir / PDF</button></td></tr>'; }).join('') +
    '</tbody></table></div>' : emptyState('fa-certificate', 'Ainda não existem certificados emitidos')) + '</div>';
}
function lerConfigCertificados() {
  const get = id => { const el = $(id); return el ? el.value.trim() : ''; };
  return { tema: get('certTema') || 'azul', emissor: get('certEmissor'), subtitulo: get('certSubtitulo'), responsavel: get('certResponsavel'), cargo: get('certCargo'), local: get('certLocal') };
}
function salvarConfigCertificados() {
  const cfg = lerConfigCertificados();
  if (!cfg.emissor) return toast('Indique a instituição emissora.', 'warning');
  localStorage.setItem('kanawa_certificado_config', JSON.stringify(cfg));
  toast('Modelo de certificado personalizado e guardado neste dispositivo.', 'success');
}
function htmlModeloCertificado(dados, cfg) {
  const temas = {
    azul: { principal: '#173b68', acento: '#c6a04a', fundo: '#f7f9fc' },
    verde: { principal: '#145b48', acento: '#c7a44b', fundo: '#f7fbf8' },
    minimal: { principal: '#17243a', acento: '#8293aa', fundo: '#ffffff' }
  };
  const t = temas[cfg.tema] || temas.azul;
  const emissor = esc(cfg.emissor || 'Instituição de Formação');
  const aluno = esc(dados.aluno || 'Nome do formando');
  const curso = esc(dados.curso || 'Nome do curso');
  const emissao = fmtD(dados.data);
  const validade = fmtD(dados.validade);
  const codigo = esc(String(dados.codigo || ('KS-' + dados.id)));
  return '<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>Certificado — ' + aluno + '</title><style>' +
    '*{box-sizing:border-box}body{margin:0;background:#e9edf3;font-family:Georgia,"Times New Roman",serif;color:#243247}.sheet{width:297mm;min-height:210mm;margin:12mm auto;padding:13mm;background:' + t.fundo + ';border:3px solid ' + t.principal + ';position:relative;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}.sheet:before{content:"";position:absolute;inset:5mm;border:1px solid ' + t.acento + ';pointer-events:none}.top{font:700 13pt Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:' + t.principal + ';margin-bottom:8mm}.orn{width:55mm;height:2px;background:' + t.acento + ';margin:0 auto 8mm}.eyebrow{font:11pt Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#68758a}.heading{font-size:34pt;letter-spacing:4px;color:' + t.principal + ';margin:5mm 0}.sub{font:13pt Arial,sans-serif;color:#526176}.student{font-size:29pt;font-weight:bold;color:#17243a;border-bottom:1px solid ' + t.acento + ';padding:4mm 15mm 2mm;margin:5mm 0}.course{font-size:19pt;color:' + t.principal + ';font-weight:bold;margin:3mm 0}.copy{font:12pt/1.7 Arial,sans-serif;max-width:220mm;color:#465469}.footer{display:flex;justify-content:space-between;align-items:end;width:82%;margin-top:14mm;font:10pt Arial,sans-serif}.sign{width:65mm;border-top:1px solid #667085;padding-top:3mm}.meta{position:absolute;bottom:9mm;right:13mm;font:8pt Arial,sans-serif;color:#68758a}.print{position:fixed;top:12px;right:12px;font:14px Arial,sans-serif;padding:10px 16px;background:' + t.principal + ';color:white;border:0;border-radius:6px}@page{size:A4 landscape;margin:0}@media print{body{background:white}.sheet{margin:0;width:297mm;height:210mm;min-height:210mm;page-break-after:avoid}.print{display:none}}@media screen and (max-width:900px){.sheet{transform:scale(.55);transform-origin:top left;margin:8px;width:297mm}}</style></head><body><button class="print" onclick="window.print()">Imprimir / Guardar PDF</button><main class="sheet"><div class="top">' + emissor + '</div><div class="orn"></div><div class="eyebrow">Certificado de conclusão</div><h1 class="heading">CERTIFICADO</h1><div class="sub">' + esc(cfg.subtitulo || 'Certifica-se que') + '</div><div class="student">' + aluno + '</div><div class="copy">concluiu com aproveitamento o curso de</div><div class="course">' + curso + '</div><div class="copy">Este certificado é emitido para os devidos efeitos e comprova a participação e conclusão da formação indicada.</div><div class="footer"><div class="sign">' + esc(cfg.local || 'Luanda, Angola') + '<br>Emissão: ' + emissao + '<br>Validade: ' + validade + '</div><div class="sign">' + esc(cfg.responsavel || 'Responsável') + '<br>' + esc(cfg.cargo || 'Direção') + '</div></div><div class="meta">Código: ' + codigo + '</div></main></body></html>';
}
async function imprimirCertificado(id) {
  const win = window.open('', '_blank');
  if (!win) return toast('Permita janelas pop-up para imprimir o certificado.', 'warning');
  try {
    const lista = await getData('certificacoes');
    const reg = lista.find(x => Number(x.id) === Number(id));
    if (!reg) { win.close(); return toast('Certificado não encontrado.', 'error'); }
    const cfg = JSON.parse(localStorage.getItem('kanawa_certificado_config') || '{}');
    win.document.open(); win.document.write(htmlModeloCertificado(reg, cfg)); win.document.close();
    toast('Certificado preparado. Escolha Imprimir ou Guardar como PDF.', 'success');
  } catch (e) { win.close(); toast('Não foi possível preparar o certificado: ' + (e.message || e), 'error'); }
}
function prévisualizarModeloCertificado() {
  const cfg = lerConfigCertificados();
  if (!cfg.emissor) return toast('Indique a instituição emissora antes da pré-visualização.', 'warning');
  const win = window.open('', '_blank');
  if (!win) return toast('Permita janelas pop-up para pré-visualizar.', 'warning');
  win.document.open(); win.document.write(htmlModeloCertificado({ id: 'PREVIEW', aluno: 'NOME DO FORMANDO', curso: 'NOME DO CURSO', data: now(), validade: new Date(Date.now() + 365 * 86400000).toISOString() }, cfg)); win.document.close();
}
async function novaCertificacao() {
  const a = prompt('Nome completo do aluno:'); if (!a) return;
  const c = prompt('Nome do curso concluído:'); if (!c) return;
  const validade = prompt('Validade em meses (0 = sem validade):', '12');
  const meses = Math.max(0, parseInt(validade, 10) || 0);
  const data = now();
  const expira = meses ? new Date(Date.now() + meses * 30 * 86400000).toISOString() : null;
  await saveData('certificacoes', { aluno: a.trim(), curso: c.trim(), data, validade: expira, codigo: 'KS-' + Date.now().toString(36).toUpperCase() });
  toast('Certificado emitido com sucesso.', 'success'); openModule('elearning-certificacoes');
}
async function renderElearningQuizzes() {
  const q = await getData('quizzes') || [];
  return header('Quizzes', q.length + ' quizzes', 'var(--info)',
    '<button class="btn btn-success" onclick="novoQuiz()"><i class="fas fa-plus"></i> Novo Quiz</button>', 'fa-question-circle') +
    '<div class="card">' + (q.length > 0 ? q.map(x => '<div style="padding:8px 12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:6px;border:1px solid var(--border);display:flex;justify-content:space-between;align-items:center"><div><strong style="font-size:.8rem">' + esc(x.titulo) + '</strong><div style="font-size:.6rem;color:var(--text-muted)">' + (x.questoes || 0) + ' questões</div></div><div style="display:flex;gap:4px"><button class="btn btn-sm btn-primary" onclick="responderQuiz(' + x.id + ')"><i class="fas fa-play"></i></button><button class="btn btn-sm btn-danger" onclick="excluirItem(\'quizzes\',' + x.id + ')"><i class="fas fa-trash"></i></button></div></div>').join('') : emptyState('fa-question-circle', 'Nenhum quiz disponível')) + '</div>';
}
async function novoQuiz() { const t = prompt('Título do quiz:'); if (!t) return; await saveData('quizzes', { titulo: t, questoes: parseInt(prompt('Número de questões:', '5')) || 5, data: now() }); toast('Quiz criado', 'success'); openModule('elearning-quizzes'); }
function responderQuiz(id) { toast('Quiz não iniciado: ainda falta implementar perguntas, respostas e gravação de resultados.', 'warning'); }
function renderElearningProgresso() {
  return header('Progresso do Aluno', 'Acompanhamento de aprendizado', 'var(--primary)', '', 'fa-chart-line') +
    '<div class="card"><div class="form-grid">' +
    '<div class="form-group"><label>Aluno</label><select id="progressoAluno"><option value="">Todos</option></select></div>' +
    '<div class="form-group"><label>Curso</label><select id="progressoCurso"><option value="">Todos</option></select></div></div>' +
    '<button class="btn btn-primary" onclick="gerarRelatorioProgresso()"><i class="fas fa-chart-bar"></i> Gerar Relatório</button></div>' +
    '<div id="progressoResultado" style="display:none" class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> Resultado</h3></div><div id="progressoConteudo"></div></div>';
}
function gerarRelatorioProgresso() { toast('Relatório não gerado: o cálculo de progresso por aluno e curso ainda não está implementado.', 'warning'); }
async function renderElearningRelatorios() {
  const c = await getData('cursos') || []; const cert = await getData('certificacoes') || []; const q = await getData('quizzes') || []; const f = await getData('funcionarios') || [];
  return header('Relatórios E-learning', 'Análise de desempenho educacional', 'var(--purple)', '', 'fa-file-alt') +
    '<div class="metric-grid">' +
    '<div class="metric-card"><div class="label">Total Cursos</div><div class="value">' + c.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">Certificações</div><div class="value">' + cert.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--info)"><div class="label">Quizzes</div><div class="value">' + q.length + '</div></div>' +
    '<div class="metric-card" style="border-left-color:var(--warning)"><div class="label">Alunos</div><div class="value">' + f.length + '</div></div></div>' +
    '<div class="card"><div class="form-actions">' +
    '<button class="btn btn-success" onclick="exportarRelatorioElearning()"><i class="fas fa-file-export"></i> Exportar Relatório</button>' +
    '<button class="btn btn-info" onclick="gerarGraficoElearning()"><i class="fas fa-chart-pie"></i> Gerar Gráfico</button></div></div>';
}
function exportarRelatorioElearning() { toast('Exportação e-learning ainda não foi implementada; nenhum ficheiro foi criado.', 'warning'); }
function gerarGraficoElearning() { toast('Gráfico e-learning ainda não foi implementado.', 'warning'); }

/* E-COMMERCE PRODUTOS (catálogo) */
async function renderEcommerceProdutos() {
  const produtos = await getData('produtos');
  return header('Catálogo E-commerce', produtos.length + ' produtos', 'var(--info)',
    '<button class="btn btn-success" onclick="abrirFormProdutoEcommerce()"><i class="fas fa-plus"></i> Novo Produto</button>' +
    '<button class="btn btn-info" onclick="sincronizarProdutosEcommerce()"><i class="fas fa-sync"></i> Sincronizar</button>', 'fa-box') +
    '<div class="card">' + table(['Imagem', 'Nome', 'Preço', 'Estoque', 'Status', 'Ações'],
      produtos.map(p => ['<img src="' + imgSrc(p) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px" onerror="this.src=\'' + PLACEHOLDER + '\'">', '<strong>' + esc(p.nome) + '</strong>', fmt(p.preco || 0), formatN(p.estoque || 0), badge(p.ativo !== false ? 'Ativo' : 'Inativo', p.ativo !== false ? 'success' : 'danger'),
      '<button class="btn btn-sm btn-primary" onclick="editarProdutoEcommerce(' + p.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirProdutoEcommerce(' + p.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
function abrirFormProdutoEcommerce() { openModule('produtos-novo'); }
async function editarProdutoEcommerce(id) { openModule('produtos-editar', { id: id }); }
async function excluirProdutoEcommerce(id) { if (!confirm('Excluir este produto do catálogo?')) return; await deleteData('produtos', id); toast('Produto removido', 'info'); openModule('ecommerce-produtos'); }
async function toggleProdutoEcommerce(id) { const p = await DB.get('produtos', id); if (p) { p.ativo = p.ativo === false ? true : false; await saveData('produtos', p); toast('Status atualizado', 'success'); openModule('ecommerce-produtos'); } }

/* SERVIÇOS */
async function renderServicos() {
  const servicos = await getData('servicos') || [];
  return header('Serviços', servicos.length + ' serviços', 'var(--info)',
    '<button class="btn btn-success" onclick="novoServico()"><i class="fas fa-plus"></i> Novo Serviço</button>', 'fa-concierge-bell') +
    '<div class="card">' + table(['Código', 'Nome', 'Preço', 'Duração', 'Status', 'Ações'],
      servicos.map(s => [esc(s.codigo || '-'), '<strong>' + esc(s.nome) + '</strong>', fmt(s.preco || 0), esc(s.duracao || '-'), badge(s.status === 'ativo' ? 'Ativo' : 'Inativo', s.status === 'ativo' ? 'success' : 'danger'),
      '<button class="btn btn-sm btn-primary" onclick="editarServico(' + s.id + ')"><i class="fas fa-edit"></i></button> <button class="btn btn-sm btn-danger" onclick="excluirItem(\'servicos\',' + s.id + ')"><i class="fas fa-trash"></i></button>'])) + '</div>';
}
async function novoServico() { const n = prompt('Nome do serviço:'); if (!n) return; await saveData('servicos', { codigo: 'SRV-' + String(Date.now()).slice(-6), nome: n, descricao: prompt('Descrição:') || '', preco: parseFloat(prompt('Preço:', '0')) || 0, duracao: prompt('Duração:', '1h') || '1h', status: 'ativo' }); toast('Serviço criado', 'success'); openModule('servicos'); }
async function editarServico(id) { const s = await DB.get('servicos', id); if (!s) return; const n = prompt('Novo nome:', s.nome); if (n) { s.nome = n; await saveData('servicos', s); toast('Atualizado', 'success'); openModule('servicos'); } }

/* ====== SEED ====== */
async function seedDemo() {
  if ((await DB.count('produtos')) > 0) return;
  const produtos = [
    { codigo: 'P001', codigoBarras: '7501234567890', nome: 'Caneta Esferográfica', preco: 150, estoque: 50, estoqueMin: 10, categoria: 'Papelaria' },
    { codigo: 'P002', codigoBarras: '7501234567891', nome: 'Caderno 100 Folhas', preco: 450, estoque: 30, estoqueMin: 5, categoria: 'Papelaria' },
    { codigo: 'P003', codigoBarras: '7501234567892', nome: 'Mochila Escolar', preco: 2500, estoque: 15, estoqueMin: 3, categoria: 'Acessórios' },
    { codigo: 'P004', codigoBarras: '7501234567893', nome: 'Calculadora Científica', preco: 1200, estoque: 8, estoqueMin: 2, categoria: 'Eletrônicos' },
    { codigo: 'P005', codigoBarras: '7501234567894', nome: 'Fita Adesiva', preco: 80, estoque: 100, estoqueMin: 20, categoria: 'Papelaria' },
    { codigo: 'P006', codigoBarras: '7501234567895', nome: 'Pasta Arquivo', preco: 200, estoque: 25, estoqueMin: 5, categoria: 'Papelaria' }
  ];
  for (const p of produtos) await DB.add('produtos', p);
  await DB.add('clientes', { nome: 'João Silva', nif: '006518595L', telefone: '+244 900 000 001', email: 'joao@email.com', dataCadastro: now() });
  await DB.add('clientes', { nome: 'Maria Santos', telefone: '+244 900 000 002', email: 'maria@email.com', dataCadastro: now() });
  await DB.add('categorias', { nome: 'Papelaria', descricao: 'Materiais de escritório' });
  await DB.add('categorias', { nome: 'Eletrônicos', descricao: 'Dispositivos' });
  await DB.add('categorias', { nome: 'Acessórios', descricao: 'Acessórios diversos' });
  await DB.add('funcionarios', { nome: 'Ana Costa', cargo: 'Vendedora', salario: 120000 });
  await DB.add('notificacoes', { titulo: '🎉 Bem-vindo', mensagem: 'Kanawa Soft ERP v15.4 Técnica ligado à base central!', tipo: 'success', data: now(), lida: false });
}

/* ====== INIT ====== */
async function init() {
  try {
    const mobileToggle = $('mobileMenuToggle');
    const mobileBackdrop = $('mobileMenuBackdrop');
    if (mobileToggle) mobileToggle.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); toggleMobileMenu();
    });
    if (mobileBackdrop) mobileBackdrop.addEventListener('click', () => toggleMobileMenu(false));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && $('sidebar')?.classList.contains('mobile-menu-open')) toggleMobileMenu(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 600) toggleMobileMenu(false);
      else if ($('sidebar')?.classList.contains('mobile-menu-open')) {
        const bar = document.querySelector('.topbar');
        if (bar) document.documentElement.style.setProperty('--mobile-header-height', bar.offsetHeight + 'px');
      }
    }, { passive: true });
    const manifest = { name: 'Kanawa Soft ERP', short_name: 'Kanawa', start_url: '.', display: 'standalone', background_color: '#1a3a5c', theme_color: '#1a3a5c', orientation: 'any', icons: [{ src: 'logo.png', sizes: '192x192', type: 'image/png' }, { src: 'logo.png', sizes: '512x512', type: 'image/png' }] };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestLink = $('pwaManifest'); if (manifestLink) manifestLink.href = URL.createObjectURL(blob);

    await DB.init();
    const theme = localStorage.getItem('kanawa_theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = $('themeIcon'); if (themeIcon) themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    aplicarLogo();

    let cloudContext = null;
    try { cloudContext = await KanawaCloud.init(); }
    catch (cloudError) { console.warn('Sessão cloud:', cloudError); }

    const loading = $('loadingScreen');
    if (loading) loading.classList.add('hidden');

    if (cloudContext && KanawaCloud.ready) {
      await activateCloudSession(cloudContext, true);
      mostrarAplicacaoAutenticada(cloudContext);
    } else {
      localStorage.removeItem('kanawa_user');
      if ($('app')) $('app').classList.remove('active');
      if ($('setupWizard')) $('setupWizard').classList.remove('active');
      if ($('authScreen')) $('authScreen').classList.add('active');
      if ($('loginEmail')) $('loginEmail').value = localStorage.getItem('kanawa_pending_email') || '';
    }

    const loginForm = $('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const email = $('loginEmail').value.trim();
        const password = $('loginPassword').value;
        const errorBox = $('loginError');
        if (errorBox) { errorBox.textContent = ''; errorBox.classList.remove('show'); }
        const submit = loginForm.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        try {
          const ctx = await KanawaCloud.signIn(email, password);
          await activateCloudSession(ctx, true);
          localStorage.removeItem('kanawa_pending_email');
          mostrarAplicacaoAutenticada(ctx);
          toast('Sessão iniciada. Os dados estão ligados à base de dados central.', 'success');
        } catch (error) {
          if (errorBox) {
            errorBox.textContent = error.message || 'Email ou senha incorretos.';
            errorBox.classList.add('show');
          }
        } finally {
          if (submit) submit.disabled = false;
        }
      });
    }

    startAutoSync();
  } catch (e) {
    console.error('Init error:', e);
    const loading = $('loadingScreen'); if (loading) loading.classList.add('hidden');
    const errorBox = $('loginError');
    if (errorBox) { errorBox.textContent = 'Erro ao iniciar o Kanawa Soft: ' + e.message; errorBox.classList.add('show'); }
  }
}

/* ====== INTEGRAÇÃO ELECTRON ====== */
if (window.kanawaNative && window.kanawaNative.isDesktop) {
  window.kanawaNative.onMenuNavigate((moduleId) => {
    if (moduleId === '__toggle_theme') { toggleTheme(); return; }
    if (moduleId === '__sync') { syncNow(true); return; }
    if (moduleId && MENU.find(m => m.id === moduleId)) openModule(moduleId);
  });
  if (window.kanawaNative.notifyReady) window.kanawaNative.notifyReady();
}

/* ====== EXPORT GLOBAL ====== */
const EXPORTS = [
  'openModule','toggleMobileMenu','closeModal','openModal','toggleTheme','toggleUserMenu','logout','aplicarLogo','setupNextStep','finalizarSetup','abrirCadastroEmpresa','toggleSync','syncNow','mostrarToast','toast',
  'pdvIrParaTela','pdvSelecionarProduto','pdvAltQty','pdvRemoverItem','pdvSalvarCliente','pdvClienteAnonimo','pdvSelecionarPagamento','pdvAtualizarValores','pdvCancelarVenda','pdvSalvarRascunho','pdvSalvarOrcamento','pdvFinalizarVenda','abrirModalPDVCliente','salvarNovoClientePDV','filtrarPDV','toggleFavorito',
  'abrirScanner','fecharScanner','buscarPorCodigo','cadastroRapidoProduto','salvarCadastroRapido',
  'imprimirEtiquetaIndividual','imprimirEtiquetasLote','gerarLoteEtiquetas','imprimirEtiquetaHTML','baixarEtiquetaPDF',
  'abrirFatura','imprimirFatura','imprimirTermica','baixarFaturaPDF','compartilharWhatsApp','gerarQRCodeFatura',
  'abrirModalProduto','salvarProduto','excluirProduto','exportarProdutos','abrirModalImportar','importarProdutos','escolherImagemProduto','removerImagemProduto',
  'abrirModalCategoria','salvarCategoria','editarCategoria','salvarEditCategoria',
  'abrirModalCliente','salvarClienteModal',
  'abrirModalFornecedor','salvarFornecedor',
  'abrirModalTransportadora','salvarTransportadora',
  'abrirModalLead','salvarLead',
  'abrirMovEstoque','salvarMov','ajustarEstoque',
  'abrirModalCompra','salvarCompra',
  'abrirModalConta','salvarConta','marcarPago',
  'exportarSAFTCompleto','exportarIRTDeclaracao','exportarIVADeclaracao','exportarInventario',
  'abrirModalFuncionario','salvarFuncionario',
  'abrirModalProjeto','salvarProjeto',
  'abrirModalTarefa','salvarTarefa','concluirTarefa',
  'abrirModalAtivo','salvarAtivo',
  'abrirModalVeiculo','salvarVeiculo',
  'abrirModalOS','salvarOS',
  'abrirModalContrato','salvarContrato',
  'abrirModalDocumento','salvarDocumento',
  'abrirModalTicket','salvarTicket','resolverTicket',
  'exportarBackupCompleto','exportarVendasCSV',
  'abrirModalUsuario','salvarUsuario',
  'verFatura','excluirItem',
  'abrirModalPromocao','salvarPromocao','togglePublicado',
  'converterOrcamento',
  'criarNotificacao','marcarNotificacaoLida','marcarTodasLidas','updateNotifBadge',
  'salvarConfigEmpresa','salvarRegras','salvarConfigAPI','testarAPI',
  'limparColecao','recarregarDemo','resetTotal',
  'escolherLogoEmpresa','removerLogoEmpresa',
  'escolherAvatarPerfil','removerAvatarPerfil','salvarPerfil','alterarSenhaPerfil',
  'abrirModalDispositivo','salvarDispositivo','definirPadrao','testarImpressora','abrirGaveta',
  'detectarImpressoras','detectarEDetalhes','numeroPorExtenso',
  // Módulos adicionais
  'renderProducao','abrirModalProducao','salvarProducao','editarProducao',
  'renderOrdensProducao','abrirModalOrdemProducao','salvarOrdemProducao','editarOrdemProducao',
  'renderMRP','calcularMRP',
  'renderBOM','abrirModalBOM','salvarBOM','editarBOM',
  'renderCustosProducao','abrirModalCustoProducao','salvarCustoProducao','editarCustoProducao',
  'renderControleQualidade','abrirModalQualidade','salvarQualidade','editarQualidade',
  'renderPlanosProducao','abrirModalPlanoProducao','salvarPlanoProducao','editarPlanoProducao',
  'renderLogisticaRoteirizacao','abrirModalRota','salvarRota','otimizarRotas',
  'renderLogisticaEtiquetas','gerarEtiqueta','visualizarEtiqueta',
  'renderLogisticaPicking','iniciarPicking','renderLogisticaArmazens','novoArmazem',
  'renderLogisticaCrossdocking','realizarCrossdocking','renderLogisticaRastreio','buscarRastreio',
  'renderEcommerceVitrine','adicionarAoCarrinhoEcommerce','sincronizarProdutosEcommerce',
  'renderEcommerceCarrinho','removerDoCarrinhoEcommerce','limparCarrinhoEcommerce','finalizarPedidoEcommerce',
  'renderEcommercePedidos','detalharPedidoEcommerce','atualizarStatusPedidoEcommerce','exportarPedidosEcommerce',
  'renderEcommercePagamento','configurarPagamento','testarPagamento','renderEcommerceRastreio','rastrearEncomenda',
  'renderRHRecrutamento','novaVaga','novoCandidato','renderRHDesempenho','novaAvaliacaoDesempenho',
  'renderRHBeneficios','novoBeneficio','editarBeneficio','renderRHOnboarding','novoOnboarding','editarOnboarding',
  'renderRHPonto','registrarPonto','relatorioPonto','renderRHRescisao','novaRescisao',
  'renderRHPlanoCarreira','novoPlanoCarreira','editarPlanoCarreira',
  'renderProjetosTarefas','novaTarefa','renderKanban','detalharTarefa',
  'renderProjetosGantt','novaAtividadeGantt','editarGantt','renderProjetosRecursos','alocarRecurso',
  'renderProjetosTimesheet','novoTimesheet','renderProjetosCustos','salvarCustoProjeto','analisarCustos',
  'renderProjetosRiscos','salvarRisco',
  'renderAtivosDepreciacao','renderAtivosManutencao','novaManutencaoAtivo','concluirManutencaoAtivo',
  'renderAtivosGarantia','novaGarantia',
  'renderFrotaManutencao','novaManutencaoFrota','concluirManutencaoFrota','renderFrotaRotas','novaRotaFrota',
  'renderFrotaGPS','adicionarGPS','renderFrotaCombustivel','novoAbastecimento',
  'renderFrotaDocumentos','salvarDocumentoFrota','renderFrotaMultas','novaMulta','pagarMulta',
  'renderFrotaDesempenho','gerarRelatorioFrota',
  'renderOSManutencao','novaOrdemManutencao','concluirOSManutencao','renderOSChecklist','novoChecklist','aprovarChecklist',
  'renderOSCalendario','novoEventoManutencao','concluirEventoManutencao','renderOSTecnicos','novoTecnico',
  'renderProdutosAvaliacoes','novaAvaliacao','renderTabelasPrecos','novaTabelaPreco','editarTabelaPreco',
  'renderVendasConsignadas','novaVendaConsignada','editarVendaConsignada',
  'renderVendasPromocoes','novoCupom','gerarCupomPromocional','editarCupom',
  'renderClientesFidelidade','adicionarClienteFidelidade','adicionarPontosFidelidade',
  'renderClientesCupons','distribuirCupomCliente','renderPortalCliente','convidarClientePortal','abrirPortalCliente',
  'renderClientesSegmentacao','novoSegmento','editarSegmento',
  'renderCRMPipeline','detalharLead','renderCRMAutomacao','novaAutomacaoCRM','editarAutomacaoCRM',
  'renderCRMScore','renderCRMRemarketing','executarRemarketing','agendarRemarketing',
  'renderMarketingCampanhas','novaCampanhaMarketing','editarCampanhaMarketing','renderMarketingAnalise',
  'renderElearningCursos','novoCurso','abrirCurso','renderElearningCertificacoes','novaCertificacao',
  'renderElearningQuizzes','novoQuiz','responderQuiz','renderElearningProgresso','gerarRelatorioProgresso',
  'renderElearningRelatorios','exportarRelatorioElearning','gerarGraficoElearning',
  'renderEcommerceProdutos','abrirFormProdutoEcommerce','editarProdutoEcommerce','excluirProdutoEcommerce','toggleProdutoEcommerce',
  'renderServicos','novoServico','editarServico'
];
EXPORTS.forEach(name => { try { window[name] = eval(name); } catch (e) { } });

/* ====== START ====== */
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }