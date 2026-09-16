'use strict';

/* ============================================================
   KANAWA SOFT ERP v15.2 — APP.JS COMPLETO
   Perfil · QR Code AGT · Firma · Gaveta · Impressoras · Líquido
   ============================================================ */

const APP_VERSION = '15.2';
const IS_DESKTOP = !!(window.kanawaNative && window.kanawaNative.isDesktop);
const API_BASE_URL = IS_DESKTOP
  ? window.location.origin + '/api'
  : (localStorage.getItem('kanawa_api_url') || 'http://localhost:3000/api');

let API_TOKEN = localStorage.getItem('kanawa_api_token') || null;
let API_ONLINE = false;
let setupStep = 1;
let currentModule = 'dashboard';
let scanner = null, scannerActive = false, scannerCallback = null;
let syncTimer = null;

let pdvState = {
  screen:1, carrinho:[], cliente:{nome:'Cliente Anônimo',nif:'',telefone:''},
  pagamento:'dinheiro', desconto:0, valorRecebido:0, aplicarIVA:true, regime:'geral', observacoes:''
};
let pdvCache = { produtos:[], favoritos:JSON.parse(localStorage.getItem('kanawa_favoritos')||'[]'), ts:0 };

const AGT_CONFIG = {
  iva:0.14, ivaReduzido:0.07,
  irt:{ faixas:[
    {min:0,max:70000,taxa:0,parcela:0},
    {min:70001,max:100000,taxa:0.10,parcela:7000},
    {min:100001,max:150000,taxa:0.15,parcela:12000},
    {min:150001,max:200000,taxa:0.20,parcela:19500},
    {min:200001,max:300000,taxa:0.25,parcela:29500},
    {min:300001,max:500000,taxa:0.30,parcela:44500},
    {min:500001,max:Infinity,taxa:0.35,parcela:69500}
  ]}
};

/* ============ UTILITÁRIOS ============ */
const fmt    = v => new Intl.NumberFormat('pt-AO',{style:'currency',currency:'AOA'}).format(Number(v)||0);
const fmtN   = v => new Intl.NumberFormat('pt-AO').format(Number(v)||0);
const fmtD   = d => d ? new Date(d).toLocaleDateString('pt-AO') : '-';
const fmtDT  = d => d ? new Date(d).toLocaleString('pt-AO') : '-';
const esc    = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $      = id => document.getElementById(id);
const $$     = sel => document.querySelectorAll(sel);
const num    = (v,d=0) => { const n = parseFloat(v); return isNaN(n)?d:n; };
const int    = (v,d=0) => { const n = parseInt(v); return isNaN(n)?d:n; };
const now    = () => new Date().toISOString();
const copy   = o => JSON.parse(JSON.stringify(o));

/* Número por extenso */
function numeroPorExtenso(n){
  n = Math.round(Number(n)||0);
  if (n === 0) return 'zero kwanzas';
  const u = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
  const d = ['','dez','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const e = ['dez','onze','doze','treze','catorze','quinze','dezasseis','dezassete','dezoito','dezanove'];
  const c = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  function grupo(x){
    if (x === 0) return '';
    if (x < 10) return u[x];
    if (x < 20) return e[x-10];
    if (x < 100) return d[Math.floor(x/10)] + (x%10 ? ' e '+u[x%10] : '');
    return c[Math.floor(x/100)] + (x%100 ? ' e '+grupo(x%100) : '');
  }
  const partes = [];
  const milhoes = Math.floor(n/1000000);
  const milhares = Math.floor((n%1000000)/1000);
  const resto = n%1000;
  if (milhoes) partes.push(grupo(milhoes) + (milhoes===1?' milhão':' milhões'));
  if (milhares) partes.push(grupo(milhares) + (milhares===1?' mil':' mil'));
  if (resto) partes.push(grupo(resto));
  return partes.join(' e ') + ' kwanzas';
}

function toast(msg, type='info'){
  const c = $('toastContainer'); if(!c) return;
  const t = document.createElement('div'); t.className = 'toast '+type;
  const icons = {success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  t.innerHTML = '<span style="font-size:1.2rem">'+(icons[type]||'ℹ️')+'</span><span>'+esc(msg)+'</span>';
  c.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); },3500);
}
function openModal(title, body, large){
  const o = $('modalOverlay'), c = $('modalContent'); if(!o||!c) return;
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = body;
  c.className = large ? 'modal modal-large' : 'modal';
  o.classList.add('active');
}
function closeModal(){ const o=$('modalOverlay'); if(o) o.classList.remove('active'); }
function updateApiStatus(online){
  const b=$('apiStatus'), t=$('apiStatusText'); if(!b||!t) return;
  b.className = 'api-badge '+(online?'online':'offline');
  t.textContent = online ? 'Online' : 'Offline';
}
function toggleTheme(){
  const h = document.documentElement;
  const isDark = h.getAttribute('data-theme') === 'dark';
  h.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const ic = $('themeIcon'); if(ic) ic.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
  localStorage.setItem('kanawa_theme', isDark ? 'light' : 'dark');
}
function toggleUserMenu(){ openModule('perfil'); }

function calcIRT(s){
  const f = AGT_CONFIG.irt.faixas.find(x => s>=x.min && s<=x.max);
  return f ? {irt:Math.max(0,(s*f.taxa)-f.parcela), faixa:f} : {irt:0, faixa:null};
}
function gerarHash(d){
  const s = JSON.stringify(d)+Date.now()+Math.random();
  let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h=h&h; }
  return Math.abs(h).toString(16).toUpperCase().padStart(16,'0');
}
function gerarAssinatura(v){
  const d = (v.numeroFatura||'')+'|'+(v.total||0)+'|'+(v.data||'')+'|'+((v.empresa&&v.empresa.nif)||'');
  let h=0; for(let i=0;i<d.length;i++){ h=((h<<5)-h)+d.charCodeAt(i); h=h&h; }
  return Math.abs(h).toString(36).toUpperCase().padStart(12,'0');
}

/* ============ INDEXEDDB ============ */
const DB_STORES = ['produtos','clientes','fornecedores','vendas','compras','estoque','contasReceber','contasPagar','funcionarios','categorias','projetos','tarefas','ativos','frotas','ordensServico','notificacoes','documentos','mensagens','cursos','leads','campanhas','eventos','devolucoes','faturas','pagamentos','empresas','usuarios','movimentacoesEstoque','promocoes','ecommerce','auditoria','orcamentos','transportadoras','contratos','aprovacoes','sincronizacao','tickets','dispositivos','_sync_queue'];

const DB = {
  name:'kanawa_erp_v15', version:6, db:null, stores:DB_STORES,
  init(){
    return new Promise((res, rej) => {
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        DB_STORES.forEach(s => {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath:'id', autoIncrement:true });
        });
      };
      req.onsuccess = e => { this.db = e.target.result; res(this.db); };
      req.onerror = e => rej(e.target.error);
    });
  },
  _tx(s, m){ return this.db.transaction(s, m||'readonly').objectStore(s); },
  add(s,i){ return new Promise((res,rej)=>{ const r=this._tx(s,'readwrite').add(i); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); },
  put(s,i){ return new Promise((res,rej)=>{ const r=this._tx(s,'readwrite').put(i); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); },
  get(s,id){ return new Promise((res,rej)=>{ const r=this._tx(s).get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); },
  getAll(s){ return new Promise((res,rej)=>{ const r=this._tx(s).getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); }); },
  del(s,id){ return new Promise((res,rej)=>{ const r=this._tx(s,'readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); },
  clear(s){ return new Promise((res,rej)=>{ const r=this._tx(s,'readwrite').clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); },
  count(s){ return new Promise((res,rej)=>{ const r=this._tx(s).count(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
};

/* ============ API ============ */
const API = {
  async req(m,e,d){
    const o = { method:m, headers:{'Content-Type':'application/json'} };
    if (API_TOKEN) o.headers['Authorization'] = 'Bearer '+API_TOKEN;
    if (d) o.body = JSON.stringify(d);
    try {
      const r = await fetch(API_BASE_URL+e, o);
      if (!r.ok) throw new Error('HTTP '+r.status);
      API_ONLINE = true; updateApiStatus(true);
      return await r.json();
    } catch(err){
      API_ONLINE = false; updateApiStatus(false);
      return { offline:true, error:err.message };
    }
  },
  get(e){ return this.req('GET', e); },
  post(e,d){ return this.req('POST', e, d); },
  put(e,d){ return this.req('PUT', e, d); },
  del(e){ return this.req('DELETE', e); },
  async checkHealth(){
    try {
      const r = await fetch(API_BASE_URL+'/health', { signal: AbortSignal.timeout(2000) });
      API_ONLINE = r.ok;
    } catch { API_ONLINE = false; }
    updateApiStatus(API_ONLINE);
    return API_ONLINE;
  }
};

async function getData(store){
  try { return await DB.getAll(store); }
  catch(e){ console.warn('getData:',store,e); return []; }
}
async function saveData(store, item){
  const id = item.id ? (await DB.put(store, item), item.id) : await DB.add(store, item);
  if (API_ONLINE){
    try {
      if (item.id) await API.put('/'+store+'/'+item.id, item);
      else await API.post('/'+store, item);
    } catch(e){ queueSync(store, 'create', item); }
  } else {
    queueSync(store, item.id ? 'update' : 'create', item);
  }
  return id;
}
async function deleteData(store, id){
  await DB.del(store, id);
  if (API_ONLINE){ try { await API.del('/'+store+'/'+id); } catch(e){ queueSync(store, 'delete', {id}); } }
  else { queueSync(store, 'delete', {id}); }
}
async function queueSync(entity, action, payload){
  try { await DB.add('_sync_queue', { entity, action, payload, data:now(), synced:false }); } catch(e){}
}
async function processSyncQueue(){
  if (!API_ONLINE) return 0;
  const queue = await DB.getAll('_sync_queue');
  const pending = queue.filter(x => !x.synced);
  if (!pending.length) return 0;
  let ok = 0;
  for (const item of pending){
    try {
      if (item.action === 'create') await API.post('/'+item.entity, item.payload);
      else if (item.action === 'update') await API.put('/'+item.entity+'/'+item.payload.id, item.payload);
      else if (item.action === 'delete') await API.del('/'+item.entity+'/'+item.payload.id);
      item.synced = true;
      await DB.put('_sync_queue', item);
      ok++;
    } catch(e){ break; }
  }
  return ok;
}
async function pullFromServer(){
  if (!API_ONLINE) return 0;
  let total = 0;
  const stores = DB_STORES.filter(s => !s.startsWith('_'));
  for (const store of stores){
    try {
      const remote = await API.get('/'+store);
      if (remote && !remote.offline && Array.isArray(remote)){
        for (const item of remote){
          if (!item.id) continue;
          try { await DB.put(store, item); total++; } catch(e){}
        }
      }
    } catch(e){}
  }
  return total;
}
async function syncNow(showToastFlag){
  const online = await API.checkHealth();
  if (!online){
    if (showToastFlag) toast('Servidor offline — dados salvos localmente','warning');
    return false;
  }
  const indicator = $('syncIndicator'), text = $('syncText');
  if (indicator) indicator.className = 'sync-indicator show syncing';
  if (text) text.textContent = 'Sincronizando...';
  const pushed = await processSyncQueue();
  const pulled = await pullFromServer();
  if (indicator) indicator.className = 'sync-indicator show online';
  if (text) text.textContent = 'Sincronizado ✓';
  setTimeout(()=>{ if (indicator) indicator.className = 'sync-indicator'; }, 2000);
  if (showToastFlag) toast('✅ Sincronizado ('+pushed+' enviados, '+pulled+' recebidos)','success');
  return true;
}
function toggleSync(){ syncNow(true); }
function startAutoSync(){
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(async ()=>{ if (API_ONLINE) await processSyncQueue(); }, 30000);
}

/* ============ PERMISSÕES ============ */
const PERMISSOES = {
  admin:{modulos:'*',acoes:['criar','editar','excluir','ver','configurar','aprovar','cancelar','exportar','importar'],verFinanceiro:true,excluir:true,configurar:true,descontoMax:100},
  gerente:{modulos:['dashboard','pdv','vendas','produtos','categorias','ecommerce','estoque','compras','clientes','fornecedores','crm','financeiro','fiscal','rh','projetos','tarefas','ativos','frota','os','documentos','relatorios','notificacoes','orcamentos','transportadoras','contratos','tickets','perfil','dispositivos'],acoes:['criar','editar','ver','aprovar','cancelar','exportar'],verFinanceiro:true,excluir:false,configurar:false,descontoMax:30},
  operador:{modulos:['dashboard','pdv','vendas','produtos','clientes','estoque','notificacoes','perfil'],acoes:['criar','ver'],verFinanceiro:false,excluir:false,configurar:false,descontoMax:10},
  caixa:{modulos:['pdv','vendas','clientes','notificacoes','perfil'],acoes:['criar','ver'],verFinanceiro:false,excluir:false,configurar:false,descontoMax:5}
};
function getPerms(){ const u=JSON.parse(localStorage.getItem('kanawa_user')||'{}'); return PERMISSOES[u.role||u.perfil||'operador']||PERMISSOES.operador; }
function podeAcessar(m){ const p=getPerms(); return p.modulos==='*' || p.modulos.indexOf(m)!==-1; }
function podeFazer(a){ return getPerms().acoes.indexOf(a)!==-1; }

/* ============ MENU ============ */
const MENU = [
  {id:'dashboard',icon:'fa-chart-pie',label:'Dashboard'},
  {id:'pdv',icon:'fa-cash-register',label:'PDV'},
  {id:'vendas',icon:'fa-receipt',label:'Vendas'},
  {id:'orcamentos',icon:'fa-file-invoice',label:'Orçamentos'},
  {id:'produtos',icon:'fa-boxes',label:'Produtos'},
  {id:'categorias',icon:'fa-tags',label:'Categorias'},
  {id:'ecommerce',icon:'fa-store',label:'E-commerce'},
  {id:'estoque',icon:'fa-warehouse',label:'Estoque'},
  {id:'compras',icon:'fa-shopping-bag',label:'Compras'},
  {id:'clientes',icon:'fa-users',label:'Clientes'},
  {id:'fornecedores',icon:'fa-truck',label:'Fornecedores'},
  {id:'transportadoras',icon:'fa-shipping-fast',label:'Transportadoras'},
  {id:'crm',icon:'fa-handshake',label:'CRM'},
  {id:'financeiro',icon:'fa-coins',label:'Financeiro'},
  {id:'fiscal',icon:'fa-landmark',label:'Fiscal AGT'},
  {id:'rh',icon:'fa-user-tie',label:'RH'},
  {id:'projetos',icon:'fa-project-diagram',label:'Projetos'},
  {id:'tarefas',icon:'fa-tasks',label:'Tarefas'},
  {id:'ativos',icon:'fa-building',label:'Ativos'},
  {id:'frota',icon:'fa-truck-moving',label:'Frota'},
  {id:'os',icon:'fa-clipboard-list',label:'Ordens Serviço'},
  {id:'contratos',icon:'fa-file-contract',label:'Contratos'},
  {id:'documentos',icon:'fa-folder-open',label:'Documentos'},
  {id:'tickets',icon:'fa-ticket-alt',label:'Tickets'},
  {id:'relatorios',icon:'fa-chart-bar',label:'Relatórios'},
  {id:'notificacoes',icon:'fa-bell',label:'Notificações'},
  {id:'usuarios',icon:'fa-user-shield',label:'Usuários'},
  {id:'auditoria',icon:'fa-history',label:'Auditoria'},
  {id:'perfil',icon:'fa-user-circle',label:'Meu Perfil'},
  {id:'dispositivos',icon:'fa-print',label:'Dispositivos'},
  {id:'config',icon:'fa-cog',label:'Configurações'},
  {id:'modulos',icon:'fa-code',label:'Módulos'}
];

function renderSidebar(){
  const sb = $('sidebar'); if(!sb) return;
  const permitidos = MENU.filter(m => podeAcessar(m.id));
  sb.innerHTML = permitidos.map(m =>
    '<button class="sidebar-item" data-id="'+m.id+'" onclick="openModule(\''+m.id+'\')">'+
      '<i class="fas '+m.icon+'"></i><span>'+m.label+'</span>'+
    '</button>'
  ).join('');
}

async function openModule(id){
  if(!podeAcessar(id)){ toast('🔒 Sem permissão','error'); return; }
  currentModule = id;
  $$('.sidebar-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  const c = $('content');
  c.innerHTML = '<div style="text-align:center;padding:60px"><i class="fas fa-spinner fa-spin" style="font-size:3rem;color:var(--primary)"></i></div>';
  const R = {
    dashboard:renderDashboard, pdv:renderPDV, vendas:renderVendas, orcamentos:renderOrcamentos,
    produtos:renderProdutos, categorias:renderCategorias, ecommerce:renderEcommerce,
    estoque:renderEstoque, compras:renderCompras, clientes:renderClientes,
    fornecedores:renderFornecedores, transportadoras:renderTransportadoras, crm:renderCRM,
    financeiro:renderFinanceiro, fiscal:renderFiscal, rh:renderRH,
    projetos:renderProjetos, tarefas:renderTarefas, ativos:renderAtivos,
    frota:renderFrota, os:renderOS, contratos:renderContratos,
    documentos:renderDocumentos, tickets:renderTickets, relatorios:renderRelatorios,
    notificacoes:renderNotificacoes, usuarios:renderUsuarios, auditoria:renderAuditoria,
    perfil:renderPerfil, dispositivos:renderDispositivos,
    config:renderConfig, modulos:renderModulos
  };
  try {
    c.innerHTML = R[id] ? await R[id]() : '<div class="card"><h3>Módulo '+id+'</h3></div>';
    c.scrollTop = 0;
  } catch(e){
    console.error(e);
    c.innerHTML = '<div class="card"><h3>Erro</h3><p>'+esc(e.message)+'</p></div>';
  }
}

/* ============ UI HELPERS ============ */
function header(title, subtitle, color, buttons, icon){
  return '<div class="card" style="background:linear-gradient(135deg,'+(color||'var(--primary)')+',var(--primary-dark));color:#fff;border:none">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
      '<div><h2 style="font-size:1.3rem;font-weight:800"><i class="fas '+(icon||'fa-th')+'"></i> '+esc(title)+'</h2>'+
      (subtitle?'<p style="opacity:.85;font-size:.9rem;margin-top:4px">'+subtitle+'</p>':'')+'</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+(buttons||'')+'</div>'+
    '</div></div>';
}
function emptyState(icon,msg){ return '<div class="empty"><i class="fas '+icon+'"></i>'+msg+'</div>'; }
function badge(text,type){ return '<span class="badge badge-'+(type||'info')+'">'+esc(text)+'</span>'; }
function table(headers, rows){
  if(!rows.length) return emptyState('fa-inbox','Sem registros');
  return '<div class="table-wrap"><table><thead><tr>'+
    headers.map(h=>'<th>'+h+'</th>').join('')+
    '</tr></thead><tbody>'+
    rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+
    '</tbody></table></div>';
}
const PLACEHOLDER = 'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e2e8f0"/><text x="100" y="130" font-size="80" text-anchor="middle">📦</text></svg>');
function imgSrc(p){ return p && p.imagem ? p.imagem : PLACEHOLDER; }

function aplicarLogo(){
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const src = (emp.logo && emp.logo.indexOf('data:') === 0) ? emp.logo : 'logo.png';
  ['loadingLogo','setupLogo','authLogo','topbarLogo'].forEach(id => {
    const el = $(id);
    if (el) el.innerHTML = '<img src="'+src+'" alt="Logo" onerror="this.parentElement.textContent=\'K\'">';
  });
}

/* ============ DASHBOARD ============ */
async function renderDashboard(){
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const hoje = new Date().toLocaleDateString('pt-AO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const html = header('Bem-vindo, '+(emp.nome||'Admin'), hoje+' • NIF: '+(emp.nif||'-'), 'var(--primary)','','fa-chart-pie')+
    '<div class="metric-grid">'+
      '<div class="metric-card" onclick="openModule(\'vendas\')"><div class="label">💰 Vendas</div><div class="value" id="dashVendas">...</div><div class="sub" id="dashVendasSub">...</div><i class="fas fa-money-bill-wave icon"></i></div>'+
      '<div class="metric-card" onclick="openModule(\'produtos\')" style="border-left-color:var(--info)"><div class="label">📦 Produtos</div><div class="value" id="dashProdutos">...</div><div class="sub" id="dashProdutosSub">...</div><i class="fas fa-boxes icon"></i></div>'+
      '<div class="metric-card" onclick="openModule(\'clientes\')" style="border-left-color:var(--warning)"><div class="label">👥 Clientes</div><div class="value" id="dashClientes">...</div><div class="sub" id="dashClientesSub">...</div><i class="fas fa-users icon"></i></div>'+
      '<div class="metric-card" onclick="openModule(\'pdv\')" style="border-left-color:var(--success)"><div class="label">🛒 PDV</div><div class="value">Abrir</div><div class="sub">Nova venda</div><i class="fas fa-cash-register icon"></i></div>'+
    '</div>'+
    '<div class="metric-grid">'+
      '<div class="metric-card" onclick="openModule(\'financeiro\')" style="border-left-color:var(--success)"><div class="label">📥 A Receber</div><div class="value" style="color:var(--success)" id="dashReceber">...</div></div>'+
      '<div class="metric-card" onclick="openModule(\'financeiro\')" style="border-left-color:var(--danger)"><div class="label">📤 A Pagar</div><div class="value" style="color:var(--danger)" id="dashPagar">...</div></div>'+
      '<div class="metric-card" onclick="openModule(\'notificacoes\')" style="border-left-color:var(--warning)"><div class="label">🔔 Não Lidas</div><div class="value" id="dashNotif">...</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-bolt"></i> Ações Rápidas</h3></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">'+
        '<button class="btn btn-success btn-lg" onclick="openModule(\'pdv\')"><i class="fas fa-cash-register"></i> Nova Venda</button>'+
        '<button class="btn btn-primary btn-lg" onclick="abrirModalProduto()"><i class="fas fa-plus"></i> Novo Produto</button>'+
        '<button class="btn btn-info btn-lg" onclick="abrirModalCliente()"><i class="fas fa-user-plus"></i> Novo Cliente</button>'+
        '<button class="btn btn-warning btn-lg" onclick="openModule(\'estoque\')"><i class="fas fa-warehouse"></i> Estoque</button>'+
      '</div></div>';
  Promise.all([getData('produtos'),getData('clientes'),getData('vendas'),getData('contasReceber'),getData('contasPagar'),getData('notificacoes')])
    .then(([prod,cli,vend,cRec,cPag,notifs])=>{
      const totalV = vend.reduce((s,v)=>s+(v.total||0),0);
      const baixo = prod.filter(p=>(p.estoque||0)<(p.estoqueMin||10)).length;
      const totalR = cRec.filter(c=>c.status!=='pago').reduce((s,c)=>s+(c.valor||0),0);
      const totalP = cPag.filter(c=>c.status!=='pago').reduce((s,c)=>s+(c.valor||0),0);
      const naoLidas = notifs.filter(n=>!n.lida).length;
      const set = (id,v)=>{const e=$(id);if(e)e.textContent=v;};
      set('dashVendas',fmt(totalV)); set('dashVendasSub',vend.length+' vendas');
      set('dashProdutos',prod.length); set('dashProdutosSub',baixo+' estoque baixo');
      set('dashClientes',cli.length); set('dashClientesSub','cadastrados');
      set('dashReceber',fmt(totalR)); set('dashPagar',fmt(totalP)); set('dashNotif',naoLidas);
    }).catch(()=>{});
  return html;
}

/* ============================================================
   MÓDULO PERFIL DO USUÁRIO
   ============================================================ */
async function renderPerfil(){
  const user = JSON.parse(localStorage.getItem('kanawa_user')||'{}');
  const avatarSrc = user.avatar || '';
  return header('Meu Perfil', 'Editar dados pessoais', 'var(--primary)','','fa-user-circle') +
    '<div class="card">'+
      '<div style="display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start">'+
        '<div style="text-align:center">'+
          '<div style="position:relative;display:inline-block">'+
            '<img id="perfilAvatarImg" src="'+(avatarSrc||'logo.png')+'" style="width:150px;height:150px;border-radius:50%;object-fit:cover;border:4px solid var(--primary);background:#f0f0f0" onerror="this.src=\'logo.png\'">'+
            '<label for="perfilAvatarInput" style="position:absolute;bottom:5px;right:5px;background:var(--primary);color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:3px solid var(--bg-card)">'+
              '<i class="fas fa-camera"></i>'+
            '</label>'+
            '<input type="file" id="perfilAvatarInput" accept="image/*" style="display:none" onchange="escolherAvatarPerfil(this)">'+
          '</div>'+
          '<div style="margin-top:12px"><button class="btn btn-sm btn-danger" onclick="removerAvatarPerfil()"><i class="fas fa-trash"></i> Remover foto</button></div>'+
        '</div>'+
        '<div>'+
          '<div class="form-grid">'+
            '<div class="form-group full"><label>Nome Completo *</label><input id="perfilNome" value="'+esc(user.nome||'')+'"></div>'+
            '<div class="form-group"><label>Email *</label><input id="perfilEmail" type="email" value="'+esc(user.email||'')+'"></div>'+
            '<div class="form-group"><label>Telefone</label><input id="perfilTel" value="'+esc(user.telefone||'')+'"></div>'+
            '<div class="form-group"><label>Perfil / Cargo</label><select id="perfilRole">'+
              ['admin','gerente','operador','caixa'].map(r=>'<option value="'+r+'" '+(user.role===r?'selected':'')+'>'+r.charAt(0).toUpperCase()+r.slice(1)+'</option>').join('')+
            '</select></div>'+
            '<div class="form-group"><label>NIF</label><input id="perfilNif" value="'+esc(user.nif||'')+'"></div>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-header"><h3 class="card-title"><i class="fas fa-lock"></i> Alterar Senha</h3></div>'+
      '<div class="form-grid" style="max-width:500px">'+
        '<div class="form-group full"><label>Senha Atual</label><input type="password" id="perfilSenhaAtual"></div>'+
        '<div class="form-group"><label>Nova Senha</label><input type="password" id="perfilNovaSenha" minlength="6"></div>'+
        '<div class="form-group"><label>Confirmar Nova Senha</label><input type="password" id="perfilConfSenha" minlength="6"></div>'+
      '</div>'+
      '<button class="btn btn-warning" onclick="alterarSenhaPerfil()"><i class="fas fa-key"></i> Alterar Senha</button>'+
    '</div>'+
    '<div class="card" style="display:flex;gap:10px;flex-wrap:wrap">'+
      '<button class="btn btn-success btn-lg" onclick="salvarPerfil()"><i class="fas fa-save"></i> Salvar Alterações</button>'+
      '<button class="btn btn-secondary btn-lg" onclick="openModule(\'dashboard\')"><i class="fas fa-arrow-left"></i> Cancelar</button>'+
    '</div>';
}
function escolherAvatarPerfil(input){
  const file = input.files[0]; if(!file) return;
  if(file.size > 2*1024*1024){ toast('Imagem muito grande (máx 2MB)','warning'); return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    const url = e.target.result;
    if($('perfilAvatarImg')) $('perfilAvatarImg').src = url;
    localStorage.setItem('kanawa_avatar_temp', url);
    toast('✅ Foto carregada — clique em Salvar','success');
  };
  reader.readAsDataURL(file);
}
function removerAvatarPerfil(){
  localStorage.removeItem('kanawa_avatar_temp');
  localStorage.setItem('kanawa_avatar_remove', 'true');
  if($('perfilAvatarImg')) $('perfilAvatarImg').src = 'logo.png';
  toast('Foto removida — clique em Salvar','info');
}
async function salvarPerfil(){
  const user = JSON.parse(localStorage.getItem('kanawa_user')||'{}');
  const nome = $('perfilNome').value.trim();
  const email = $('perfilEmail').value.trim();
  if(!nome || !email){ toast('Preencha nome e email','warning'); return; }
  user.nome = nome;
  user.email = email;
  user.telefone = $('perfilTel').value;
  user.role = $('perfilRole').value;
  user.nif = $('perfilNif').value;
  if(localStorage.getItem('kanawa_avatar_temp')){
    user.avatar = localStorage.getItem('kanawa_avatar_temp');
    localStorage.removeItem('kanawa_avatar_temp');
  }
  if(localStorage.getItem('kanawa_avatar_remove')){
    delete user.avatar;
    localStorage.removeItem('kanawa_avatar_remove');
  }
  localStorage.setItem('kanawa_user', JSON.stringify(user));
  try {
    const users = await DB.getAll('usuarios');
    const match = users.find(u => u.email === user.email || u.id === 1);
    if(match){
      match.nome = nome; match.email = email; match.telefone = user.telefone;
      match.perfil = user.role; match.nif = user.nif;
      if(user.avatar) match.avatar = user.avatar;
      await DB.put('usuarios', match);
    }
  } catch(e){}
  if($('userName')) $('userName').textContent = nome;
  if($('userRole')) $('userRole').textContent = user.role;
  if($('userAvatar')){
    $('userAvatar').src = user.avatar || 'logo.png';
    $('userAvatar').onerror = function(){ this.src = 'logo.png'; };
  }
  await registrarAuditoria('editar', 'perfil', {nome, email});
  toast('✅ Perfil atualizado','success');
  openModule('perfil');
}
async function alterarSenhaPerfil(){
  const user = JSON.parse(localStorage.getItem('kanawa_user')||'{}');
  const atual = $('perfilSenhaAtual').value;
  const nova = $('perfilNovaSenha').value;
  const conf = $('perfilConfSenha').value;
  if(!atual || !nova || !conf){ toast('Preencha todos os campos','warning'); return; }
  if(nova !== conf){ toast('Senhas não coincidem','error'); return; }
  if(nova.length < 6){ toast('Senha muito curta','warning'); return; }
  const users = await DB.getAll('usuarios');
  const match = users.find(u => u.email === user.email || u.id === 1);
  if(match && match.senha && match.senha !== atual){
    toast('Senha atual incorreta','error'); return;
  }
  if(match){ match.senha = nova; await DB.put('usuarios', match); }
  $('perfilSenhaAtual').value = '';
  $('perfilNovaSenha').value = '';
  $('perfilConfSenha').value = '';
  await registrarAuditoria('editar', 'senha', {});
  toast('✅ Senha alterada','success');
}

/* ============================================================
   MÓDULO DISPOSITIVOS (Impressora Térmica + A4 + Gaveta)
   ============================================================ */
async function renderDispositivos(){
  const disps = await getData('dispositivos');
  const impressorasDetectadas = await detectarImpressoras();
  
  return header('Dispositivos & Impressoras', 'Auto-detecção + configuração manual', 'var(--info)',
    '<button class="btn btn-success" onclick="abrirModalDispositivo()"><i class="fas fa-plus"></i> Adicionar</button>'+
    '<button class="btn btn-primary" onclick="detectarEDetalhes()"><i class="fas fa-search"></i> Detectar Novamente</button>',
    'fa-print') +
    
    // Detecção automática
    '<div class="card">'+
      '<div class="card-header"><h3 class="card-title"><i class="fas fa-search"></i> Dispositivos Detectados</h3></div>'+
      '<div id="dispositivosDetectados">'+
        (impressorasDetectadas.length ? 
          impressorasDetectadas.map(d => 
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">'+
              '<div><strong>'+esc(d.nome)+'</strong><br><small style="color:var(--text-muted)">'+esc(d.tipo)+' • '+esc(d.metodo)+'</small></div>'+
              '<div>'+badge(d.disponivel?'Disponível':'Indisponível', d.disponivel?'success':'secondary')+'</div>'+
            '</div>'
          ).join('')
          : '<div style="padding:12px;color:var(--text-muted);text-align:center"><i class="fas fa-info-circle"></i> Nenhum dispositivo detectado automaticamente. Use o botão "Adicionar" para configurar manualmente.</div>')+
      '</div>'+
    '</div>'+
    
    // Como conectar
    '<div class="card">'+
      '<div class="card-header"><h3 class="card-title"><i class="fas fa-question-circle"></i> Como Conectar</h3></div>'+
      '<div style="font-size:.9rem;line-height:1.9;color:var(--text-muted)">'+
        '<p><strong>🖨️ Impressora Térmica (58mm / 80mm):</strong></p>'+
        '<ul style="margin-left:20px">'+
        '<li>Conecte via <strong>USB</strong> → aparece no sistema operacional</li>'+
        '<li>Conecte via <strong>Bluetooth</strong> → emparelhe primeiro no Windows</li>'+
        '<li>O sistema detecta e usa automaticamente a impressora padrão</li>'+
        '</ul>'+
        '<p style="margin-top:12px"><strong>📄 Impressora Normal (A4):</strong></p>'+
        '<ul style="margin-left:20px">'+
        '<li>Para faturas formais em papel A4</li>'+
        '<li>Configuração via painel do Windows</li>'+
        '</ul>'+
        '<p style="margin-top:12px"><strong>💰 Gaveta de Dinheiro (Cash Drawer):</strong></p>'+
        '<ul style="margin-left:20px">'+
        '<li>Conecta na impressora térmica via cabo RJ11</li>'+
        '<li>Envio de pulso ESC/POS abre a gaveta</li>'+
        '<li>Ativa automaticamente ao finalizar venda</li>'+
        '</ul>'+
      '</div>'+
    '</div>'+
    
    // Configuradas
    '<div class="card">'+
      '<div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> Minhas Configurações</h3></div>'+
      (disps.length ? 
        '<div style="display:grid;gap:12px">'+
        disps.map(d => 
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border:1px solid var(--border);border-radius:8px;gap:10px;flex-wrap:wrap">'+
            '<div style="flex:1">'+
              '<div style="font-weight:700">'+esc(d.nome)+' '+badge(d.padrao?'Padrão':'Secundária', d.padrao?'success':'secondary')+'</div>'+
              '<div style="font-size:.85rem;color:var(--text-muted);margin-top:4px">Tipo: '+esc(d.tipo)+' • Conexão: '+esc(d.conexao)+'</div>'+
            '</div>'+
            '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
              '<button class="btn btn-sm btn-primary" onclick="testarImpressora('+d.id+')"><i class="fas fa-print"></i> Testar</button>'+
              (d.tipo!=='gaveta'?'<button class="btn btn-sm btn-warning" onclick="abrirGaveta('+d.id+')"><i class="fas fa-cash-register"></i> Gaveta</button>':'')+
              '<button class="btn btn-sm btn-info" onclick="definirPadrao('+d.id+')"><i class="fas fa-star"></i></button>'+
              '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'dispositivos\','+d.id+',\'dispositivos\')"><i class="fas fa-trash"></i></button>'+
            '</div>'+
          '</div>'
        ).join('')+
        '</div>'
        : emptyState('fa-print','Nenhum dispositivo configurado'))+
    '</div>';
}

/* Detecção automática de impressoras */
async function detectarImpressoras(){
  const detectadas = [];
  
  // 1. Detecta impressoras do sistema (via API do navegador em Electron)
  if (window.kanawaNative && window.kanawaNative.listarImpressoras) {
    try {
      const lista = await window.kanawaNative.listarImpressoras();
      lista.forEach(imp => {
        detectadas.push({nome: imp.name, tipo: 'Sistema', metodo: 'Electron', disponivel: true});
      });
    } catch(e){ console.warn('Erro ao listar impressoras:', e); }
  }
  
  // 2. Tenta API do navegador (Chrome)
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      devices.filter(d => d.kind === 'audiooutput' || d.kind === 'videoinput').forEach(d => {
        if (!detectadas.find(x => x.nome === d.label)) {
          detectadas.push({nome: d.label || 'Dispositivo sem nome', tipo: d.kind, metodo: 'MediaDevices', disponivel: true});
        }
      });
    }
  } catch(e){}
  
  // 3. Verifica Web Serial (para gavetas / térmicas seriais)
  if (navigator.serial) {
    try {
      const ports = await navigator.serial.getPorts();
      ports.forEach((p, i) => {
        detectadas.push({nome: 'Porta Serial '+(i+1), tipo: 'Serial', metodo: 'Web Serial', disponivel: true});
      });
    } catch(e){}
  }
  
  // 4. Verifica Web USB (impressoras USB diretas)
  if (navigator.usb) {
    try {
      const devices = await navigator.usb.getDevices();
      devices.forEach(d => {
        detectadas.push({nome: d.productName || 'USB Device', tipo: 'USB', metodo: 'Web USB', disponivel: true});
      });
    } catch(e){}
  }
  
  return detectadas;
}

function detectarEDetalhes(){
  toast('🔍 Detectando dispositivos...','info');
  setTimeout(()=>{ openModule('dispositivos'); toast('✅ Detecção concluída','success'); }, 1000);
}

function abrirModalDispositivo(){
  openModal('Adicionar Dispositivo',
    '<div class="form-group"><label>Nome / Identificação *</label><input id="dispNome" placeholder="Ex: Epson TM-T20"></div>'+
    '<div class="form-group"><label>Tipo</label><select id="dispTipo">'+
      '<option value="termica_58">Impressora Térmica 58mm</option>'+
      '<option value="termica_80">Impressora Térmica 80mm</option>'+
      '<option value="a4">Impressora A4 (fatura comum)</option>'+
      '<option value="gaveta">Gaveta de Dinheiro (Cash Drawer)</option>'+
      '<option value="balanca">Balança</option>'+
      '<option value="leitor">Leitor de Código de Barras</option>'+
    '</select></div>'+
    '<div class="form-group"><label>Conexão</label><select id="dispConexao">'+
      '<option value="USB">USB</option>'+
      '<option value="Bluetooth">Bluetooth</option>'+
      '<option value="Rede">Rede (Wi-Fi)</option>'+
      '<option value="Serial">Serial (COM)</option>'+
    '</select></div>'+
    '<div class="form-group"><label>Nome do dispositivo no sistema (opcional)</label><input id="dispSistema" placeholder="Ex: EPSON TM-T20 Receipt"></div>'+
    '<div class="form-group"><label><input type="checkbox" id="dispPadrao" checked> Definir como padrão</label></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarDispositivo()">Salvar</button>');
}

async function salvarDispositivo(){
  const nome = $('dispNome').value.trim();
  if(!nome){ toast('Informe o nome','warning'); return; }
  const isPadrao = $('dispPadrao').checked;
  if(isPadrao){
    const all = await DB.getAll('dispositivos');
    for(const d of all){ d.padrao = false; await DB.put('dispositivos', d); }
  }
  await saveData('dispositivos', {
    nome,
    tipo:$('dispTipo').value,
    conexao:$('dispConexao').value,
    dispositivoSistema:$('dispSistema').value,
    padrao:isPadrao,
    data:now()
  });
  toast('✅ Dispositivo adicionado','success');
  closeModal();
  openModule('dispositivos');
}

async function definirPadrao(id){
  const all = await DB.getAll('dispositivos');
  for(const d of all){ d.padrao = (d.id === id); await DB.put('dispositivos', d); }
  toast('✅ Definido como padrão','success');
  openModule('dispositivos');
}

async function testarImpressora(id){
  const d = await DB.get('dispositivos', id);
  if(!d) return;
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  
  // Teste visual simples
  const w = window.open('','_blank','width=400,height=600');
  w.document.write('<html><head><title>Teste '+esc(d.nome)+'</title></head><body style="font-family:monospace;text-align:center;padding:20px;font-size:12px">'+
    '<h2 style="margin:0">'+(emp.firma||emp.nome||'KANAWA SOFT')+'</h2>'+
    '<p style="font-size:10px">'+esc(emp.endereco||'Luanda, Angola')+'</p>'+
    '<p style="font-size:10px">NIF: '+esc(emp.nif||'-')+'</p>'+
    '<hr>'+
    '<h3>=== TESTE DE IMPRESSÃO ===</h3>'+
    '<p>Dispositivo: <strong>'+esc(d.nome)+'</strong></p>'+
    '<p>Tipo: '+esc(d.tipo)+'</p>'+
    '<p>Conexão: '+esc(d.conexao)+'</p>'+
    '<p>'+new Date().toLocaleString('pt-AO')+'</p>'+
    '<hr>'+
    '<p>Se você está vendo este recibo impresso,</p>'+
    '<p>a impressora está funcionando!</p>'+
    '<hr>'+
    '<p style="font-size:10px">Kanawa Soft ERP v'+APP_VERSION+'</p>'+
    '</body></html>');
  w.document.close();
  setTimeout(()=>{ w.print(); }, 500);
  toast('📄 Teste enviado para impressão','success');
}

function abrirGaveta(id){
  toast('💵 Enviando comando para abrir gaveta...','info');
  try {
    // Método 1: Web Serial (impressoras seriais)
    if (navigator.serial) {
      navigator.serial.getPorts().then(ports => {
        if (ports.length > 0) {
          const port = ports[0];
          return port.open({ baudRate: 9600 }).then(() => {
            const writer = port.writable.getWriter();
            const cmd = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
            return writer.write(cmd).then(() => writer.releaseLock()).then(() => port.close());
          }).then(() => toast('✅ Gaveta aberta via Serial','success'));
        }
      }).catch(e => console.warn('Serial:', e.message));
    }
    
    // Método 2: Chamar impressora via Electron (se tiver)
    if (window.kanawaNative && window.kanawaNative.abrirGaveta) {
      window.kanawaNative.abrirGaveta().then(() => {
        toast('✅ Comando enviado via impressora','success');
      }).catch(() => {});
    }
    
    // Feedback visual
    setTimeout(()=>{ 
      console.log('ESC/POS: 0x1B 0x70 0x00 0x19 0xFA enviado');
    }, 500);
  } catch(e){
    console.warn('Gaveta:', e.message);
  }
}

/* Abre gaveta automaticamente ao finalizar venda */
function abrirGavetaAutomatico(){
  try {
    const autogaveta = localStorage.getItem('kanawa_gaveta_auto') !== 'false';
    if (autogaveta) {
      console.log('💵 Tentando abrir gaveta automaticamente...');
      if (navigator.serial) {
        navigator.serial.getPorts().then(ports => {
          if (ports.length > 0) {
            const port = ports[0];
            port.open({ baudRate: 9600 }).then(() => {
              const writer = port.writable.getWriter();
              const cmd = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
              return writer.write(cmd).then(() => writer.releaseLock()).then(() => port.close());
            }).catch(()=>{});
          }
        }).catch(()=>{});
      }
    }
  } catch(e){}
}

/* ============================================================
   FATURA COM QR CODE + AGT COMPLETO
   ============================================================ */
async function abrirFatura(venda){
  const emp = venda.empresa || JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const logo = (emp.logo && emp.logo.indexOf('data:') === 0) ? emp.logo : (emp.logo || 'logo.png');
  
  // QR Code: dados AGT
  const qrText = [
    'KANAWA-AGT-v1',
    'NIF:'+(emp.nif||''),
    'FAT:'+venda.numeroFatura,
    'DT:'+venda.data,
    'TOT:'+Number(venda.total||0).toFixed(2),
    'IVA:'+Number(venda.iva||0).toFixed(2),
    'HASH:'+venda.hash,
    'ASS:'+(venda.assinatura||gerarAssinatura(venda))
  ].join('|');
  
  // Valores AGT
  const subtotal = Number(venda.subtotal||0);
  const desconto = Number(venda.descontoValor||0);
  const base = subtotal - desconto;
  const iva = Number(venda.iva||0);
  const total = Number(venda.total||0);
  const totalExtenso = numeroPorExtenso(total);
  
  const itensHTML = (venda.itens||[]).map((it,i)=>
    '<tr style="border-bottom:1px solid #e2e8f0">'+
      '<td style="padding:6px;font-size:.75rem">'+(i+1)+'</td>'+
      '<td style="padding:6px;font-size:.75rem">'+esc(it.nome)+'</td>'+
      '<td style="padding:6px;text-align:center;font-size:.75rem">'+it.qty+'</td>'+
      '<td style="padding:6px;text-align:right;font-size:.75rem">'+fmt(it.preco)+'</td>'+
      '<td style="padding:6px;text-align:right;font-size:.75rem">'+fmt(it.subtotal||it.preco*it.qty)+'</td>'+
    '</tr>'
  ).join('');

  const faturaHTML =
    '<div id="faturaPreview" style="background:#fff;color:#000;padding:24px;max-width:820px;margin:0 auto;font-family:Arial;font-size:.85rem">'+
      // Cabeçalho com firma
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1a3a5c;padding-bottom:12px;margin-bottom:12px">'+
        '<div style="display:flex;align-items:center;gap:12px">'+
          '<img src="'+logo+'" alt="Logo" style="width:70px;height:70px;object-fit:contain" onerror="this.style.display=\'none\'">'+
          '<div>'+
            '<h2 style="color:#1a3a5c;font-size:1.2rem;margin:0">'+esc(emp.firma||emp.nome||'KANAWA SOFT')+'</h2>'+
            (emp.nome && emp.firma && emp.nome !== emp.firma ? '<div style="font-size:.75rem;color:#666">'+esc(emp.nome)+'</div>' : '')+
            '<div style="font-size:.7rem;color:#555;line-height:1.5;margin-top:4px">'+
              '<div><strong>NIF:</strong> '+esc(emp.nif||'-')+'</div>'+
              (emp.regime ? '<div><strong>Regime:</strong> '+esc(emp.regime)+'</div>' : '')+
              '<div>'+esc(emp.endereco||'Luanda, Angola')+'</div>'+
              '<div><strong>Tel:</strong> '+esc(emp.telefone||'-')+(emp.email?' | '+esc(emp.email):'')+'</div>'+
              (emp.alvara ? '<div><strong>Alvará:</strong> '+esc(emp.alvara)+'</div>' : '')+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-size:.65rem;color:#999">FATURA / RECIBO</div>'+
          '<div style="font-size:1rem;font-weight:800;color:#1a3a5c">'+esc(venda.numeroFatura)+'</div>'+
          '<div style="font-size:.7rem;color:#555;margin-top:2px"><strong>Data:</strong> '+fmtDT(venda.data)+'</div>'+
          '<div style="font-size:.7rem;color:#555"><strong>Origem:</strong> '+esc(venda.operador||'Admin')+'</div>'+
        '</div>'+
      '</div>'+
      
      // Cliente + Operação
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;padding:10px;border-radius:6px;margin-bottom:12px;font-size:.78rem">'+
        '<div style="line-height:1.6">'+
          '<strong style="color:#1a3a5c;display:block;margin-bottom:2px">CLIENTE</strong>'+
          '<div>Nome: '+esc(venda.clienteNome||'Consumidor Final')+'</div>'+
          (venda.clienteNif?'<div>NIF: '+esc(venda.clienteNif)+'</div>':'')+
          (venda.clienteTelefone?'<div>Tel: '+esc(venda.clienteTelefone)+'</div>':'')+
        '</div>'+
        '<div style="line-height:1.6">'+
          '<strong style="color:#1a3a5c;display:block;margin-bottom:2px">OPERAÇÃO</strong>'+
          '<div>Pagamento: '+esc(venda.pagamento||'-')+'</div>'+
          '<div>Regime: '+esc(venda.regime||'geral')+'</div>'+
          '<div>Tipo Doc: Fatura-Recibo</div>'+
        '</div>'+
      '</div>'+
      
      // Itens
      '<table style="width:100%;border-collapse:collapse;margin-bottom:12px">'+
        '<thead><tr style="background:#1a3a5c;color:#fff">'+
          '<th style="padding:6px;text-align:left;font-size:.75rem">#</th>'+
          '<th style="padding:6px;text-align:left;font-size:.75rem">Descrição</th>'+
          '<th style="padding:6px;text-align:center;font-size:.75rem">Qtd</th>'+
          '<th style="padding:6px;text-align:right;font-size:.75rem">Preço Unit.</th>'+
          '<th style="padding:6px;text-align:right;font-size:.75rem">Total</th>'+
        '</tr></thead><tbody>'+itensHTML+'</tbody></table>'+
      
      // Totais + QR
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start">'+
        '<div style="text-align:center">'+
          '<div id="qrcodeContainer" style="display:inline-block;padding:6px;background:#fff;border:2px solid #1a3a5c;border-radius:6px;min-width:130px;min-height:130px"></div>'+
          '<div style="font-size:.6rem;color:#777;margin-top:4px"><strong>Código de Autenticação AGT</strong></div>'+
          '<div style="font-size:.55rem;color:#999;font-family:monospace;margin-top:2px;word-break:break-all;max-width:200px;line-height:1.3">'+esc(venda.hash)+'</div>'+
          '<div style="font-size:.55rem;color:#999;margin-top:2px">Verifique em: quiosqueagt.minfin.gov.ao</div>'+
        '</div>'+
        '<div style="font-size:.82rem;line-height:1.8">'+
          '<div style="display:flex;justify-content:space-between"><span>Subtotal:</span><strong>'+fmt(subtotal)+'</strong></div>'+
          (desconto>0?'<div style="display:flex;justify-content:space-between;color:#dc3545"><span>Desconto ('+venda.desconto+'%):</span><strong>-'+fmt(desconto)+'</strong></div>':'')+
          '<div style="display:flex;justify-content:space-between"><span><strong>Montante Ilíquido:</strong></span><strong>'+fmt(base)+'</strong></div>'+
          '<div style="display:flex;justify-content:space-between"><span>Imposto (IVA '+(venda.regime==='simplificado'?'7':'14')+'%):</span><strong>'+fmt(iva)+'</strong></div>'+
          '<div style="display:flex;justify-content:space-between;color:#999;font-size:.7rem"><span>Imposto Devido:</span><span>'+fmt(iva)+'</span></div>'+
          '<div style="display:flex;justify-content:space-between;border-top:2px solid #1a3a5c;padding-top:6px;margin-top:6px;font-size:1rem;color:#1a3a5c"><strong>TOTAL LÍQUIDO:</strong><strong>'+fmt(total)+'</strong></div>'+
          (venda.valorRecebido>0?'<div style="display:flex;justify-content:space-between;margin-top:4px"><span>Valor Recebido:</span><strong>'+fmt(venda.valorRecebido)+'</strong></div>'+
            '<div style="display:flex;justify-content:space-between;color:#10b981"><span>Troco:</span><strong>'+fmt(venda.troco)+'</strong></div>':'')+
        '</div>'+
      '</div>'+
      
      // Valor por extenso
      '<div style="margin-top:12px;padding:8px;background:#f8fafc;border-radius:6px;font-size:.75rem;border-left:3px solid #1a3a5c">'+
        '<strong>Valor por extenso:</strong> <em>'+esc(totalExtenso)+'</em>'+
      '</div>'+
      
      // Termos AGT
      '<div style="margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:.6rem;color:#666;line-height:1.5">'+
        '<strong style="color:#1a3a5c">TERMOS E CONDIÇÕES — AGT ANGOLA</strong><br>'+
        '• Documento emitido nos termos do Decreto Executivo n.º 29/22 de 20 de Março (Facturação Electrónica).<br>'+
        '• IVA à taxa de '+(venda.regime==='simplificado'?'7%':'14%')+' conforme Código do IVA (Lei n.º 7/19 de 24 de Abril).<br>'+
        '• Processado por computador — Programa certificado Kanawa Soft ERP v'+APP_VERSION+'.<br>'+
        '• Autenticidade verificável em https://quiosqueagt.minfin.gov.ao<br>'+
        '• Hash de assinatura: '+esc(venda.hash)+'<br>'+
        '• Assinatura digital: '+esc(venda.assinatura||gerarAssinatura(venda))+
      '</div>'+
      
      '<div style="text-align:center;margin-top:12px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:.7rem;color:#777">'+
        '<strong>Obrigado pela preferência!</strong><br>'+
        '<span style="font-size:.65rem">'+esc(emp.firma||emp.nome||'KANAWA SOFT')+' — '+new Date().getFullYear()+'</span>'+
      '</div>'+
    '</div>';
  
  window._vendaAtual = venda;
  openModal('🖨️ Fatura / Recibo — '+venda.numeroFatura,
    '<div style="max-height:65vh;overflow-y:auto;background:#fff;padding:0;border-radius:var(--radius-sm)">'+faturaHTML+'</div>'+
    '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">'+
      '<button class="btn btn-success" onclick="imprimirFatura()"><i class="fas fa-print"></i> A4</button>'+
      '<button class="btn btn-primary" onclick="imprimirTermica()"><i class="fas fa-receipt"></i> Térmica</button>'+
      '<button class="btn btn-info" onclick="baixarFaturaPDF()"><i class="fas fa-file-pdf"></i> PDF</button>'+
      '<button class="btn btn-warning" onclick="compartilharWhatsApp(window._vendaAtual)"><i class="fab fa-whatsapp"></i> WhatsApp</button>'+
      '<button class="btn btn-purple" onclick="abrirGaveta()"><i class="fas fa-cash-register"></i> Abrir Gaveta</button>'+
      '<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>'+
    '</div>', true);
  
  // Gera QR Code
  setTimeout(() => gerarQRCodeFatura(qrText), 250);
}

function gerarQRCodeFatura(texto){
  const container = $('qrcodeContainer');
  if (!container) return;
  container.innerHTML = '';
  
  // Tenta biblioteca qrcodejs
  if (typeof QRCode !== 'undefined') {
    try {
      new QRCode(container, {
        text: texto,
        width: 130,
        height: 130,
        colorDark: '#1a3a5c',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      console.log('✅ QR Code gerado');
      return;
    } catch(e) {
      console.warn('Erro QRCode:', e);
    }
  }
  
  // Fallback: gera QR visual no canvas
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 130; canvas.height = 130;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 130, 130);
    ctx.fillStyle = '#1a3a5c';
    
    // Hash do texto
    let hash = 0;
    for (let i = 0; i < texto.length; i++) {
      hash = ((hash << 5) - hash) + texto.charCodeAt(i);
      hash = hash & hash;
    }
    hash = Math.abs(hash);
    
    const grid = 25;
    const cell = 130 / grid;
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const val = ((hash * (i + 1) * (j + 1)) % 11);
        if (val < 5) ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }
    // Marcadores de posição
    ctx.fillStyle = '#1a3a5c';
    [[0,0],[grid-7,0],[0,grid-7]].forEach(([x,y]) => {
      ctx.fillRect(x*cell, y*cell, 7*cell, 7*cell);
      ctx.fillStyle = '#fff';
      ctx.fillRect((x+1)*cell, (y+1)*cell, 5*cell, 5*cell);
      ctx.fillStyle = '#1a3a5c';
      ctx.fillRect((x+2)*cell, (y+2)*cell, 3*cell, 3*cell);
    });
    container.appendChild(canvas);
    console.log('⚠️ QR visual (fallback) gerado');
  } catch(e) {
    container.innerHTML = '<div style="width:130px;height:130px;display:flex;align-items:center;justify-content:center;font-size:.6rem;color:#666;padding:8px;word-break:break-all;text-align:center">'+esc(texto.slice(0,80))+'</div>';
  }
}

function imprimirFatura(){
  const el = $('faturaPreview'); if(!el) return;
  const w = window.open('','_blank');
  w.document.write('<html><head><title>Fatura</title><style>body{font-family:Arial;padding:20px;margin:0}table{width:100%;border-collapse:collapse}th{background:#1a3a5c;color:#fff;padding:8px}td{padding:6px;border-bottom:1px solid #e2e8f0}@media print{@page{margin:5mm}}</style></head><body>'+el.innerHTML+'</body></html>');
  w.document.close();
  setTimeout(()=>{ w.print(); }, 500);
}

function imprimirTermica(){
  const v = window._vendaAtual; if(!v) return;
  const emp = v.empresa || JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const texto = [
    '=================================',
    '   '+(emp.firma||emp.nome||'KANAWA SOFT').toUpperCase(),
    '   NIF: '+(emp.nif||'-'),
    '   '+(emp.endereco||'Luanda, Angola'),
    '   Tel: '+(emp.telefone||'-'),
    '=================================',
    'FATURA-RECIBO: '+v.numeroFatura,
    'Data: '+fmtDT(v.data),
    'Cliente: '+v.clienteNome,
    (v.clienteNif ? 'NIF: '+v.clienteNif : ''),
    '=================================',
    ...(v.itens||[]).map(it => 
      it.nome.substring(0,20).padEnd(20) + '\n' +
      '  '+it.qty+' x '+fmt(it.preco).padEnd(12) + fmt(it.subtotal)
    ),
    '=================================',
    'Subtotal:    '+fmt(v.subtotal),
    (v.desconto>0 ? 'Desconto:    -'+fmt(v.descontoValor) : ''),
    'Imposto:     '+fmt(v.iva),
    'TOTAL:       '+fmt(v.total),
    v.valorRecebido>0 ? 'Recebido:    '+fmt(v.valorRecebido) : '',
    v.valorRecebido>0 ? 'Troco:       '+fmt(v.troco) : '',
    '=================================',
    'Valor: '+numeroPorExtenso(v.total),
    '---------------------------------',
    'Hash: '+v.hash,
    'Assinatura: '+(v.assinatura||''),
    '---------------------------------',
    '    Obrigado pela preferência!',
    '   Processado por Kanawa Soft ERP',
    '       www.kanawasoft.com',
    '================================='
  ].filter(Boolean).join('\n');
  
  const w = window.open('','_blank','width=300,height=600');
  w.document.write('<html><head><title>Recibo</title><style>'+
    '@media print{@page{margin:0;size:58mm auto}}'+
    'body{font-family:"Courier New",monospace;font-size:11px;width:200px;margin:0 auto;padding:5px;white-space:pre;line-height:1.3}'+
    '</style></head><body>'+texto+'</body></html>');
  w.document.close();
  setTimeout(()=>{ w.print(); }, 500);
  abrirGavetaAutomatico();
}

async function baixarFaturaPDF(){
  const el = $('faturaPreview'); if(!el) return;
  if(!window.jspdf){ toast('PDF indisponível','warning'); return; }
  const {jsPDF} = window.jspdf;
  const d = new jsPDF('p','pt','a4');
  d.html(el, {callback:x=>{x.save('fatura_'+Date.now()+'.pdf');toast('📄 PDF baixado','success');},x:10,y:10,width:580});
}

function compartilharWhatsApp(v){
  if(!v) return;
  const txt = '*'+(v.empresa&&v.empresa.nome||'Kanawa')+'*\n\nFatura: '+v.numeroFatura+'\nData: '+fmtDT(v.data)+'\nTotal: '+fmt(v.total)+'\n\n'+
    (v.itens||[]).map(i=>'• '+i.nome+' x'+i.qty+' = '+fmt(i.subtotal)).join('\n')+'\n\nHash: '+v.hash;
  window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');
}

/* ============================================================
   PRODUTOS / PDV (mesma estrutura, inclui tudo)
   ============================================================ */
async function carregarCachePDV(force){
  const t = Date.now();
  if(!force && pdvCache.produtos.length && (t-pdvCache.ts)<30000) return pdvCache.produtos;
  pdvCache.produtos = await getData('produtos');
  pdvCache.ts = t;
  return pdvCache.produtos;
}
function renderGridProdutos(produtos, favs){
  if(!produtos.length) return '<div style="grid-column:1/-1">'+emptyState('fa-box-open','Sem produtos — clique em "Novo"')+'</div>';
  return produtos.slice(0,150).map(p=>{
    const isFav = favs.indexOf(p.id)!==-1;
    return '<div class="pdv-prod-card" data-id="'+p.id+'" data-nome="'+esc((p.nome||'').toLowerCase())+'" onclick="pdvSelecionarProduto('+p.id+')">'+
      '<span class="favorite '+(isFav?'active':'')+'" onclick="event.stopPropagation();toggleFavorito('+p.id+',this)"><i class="fas fa-star"></i></span>'+
      '<div class="img"><img src="'+imgSrc(p)+'" alt="'+esc(p.nome)+'" loading="lazy" onerror="this.onerror=null;this.src=\''+PLACEHOLDER+'\'"></div>'+
      '<div class="info"><div class="name">'+esc(p.nome)+'</div>'+
      '<div class="price">'+fmt(p.preco)+'</div>'+
      '<div class="stock">Estoque: '+(p.estoque||0)+'</div>'+
      (p.codigoBarras?'<div class="codigo">'+esc(p.codigoBarras)+'</div>':'')+
      '</div></div>';
  }).join('');
}
async function renderPDV(){
  const produtos = await carregarCachePDV();
  const favs = pdvCache.favoritos;
  const pags = [
    {v:'dinheiro',i:'fa-money-bill-wave',l:'Dinheiro'},
    {v:'cartao',i:'fa-credit-card',l:'Cartão'},
    {v:'transferencia',i:'fa-university',l:'Transferência'},
    {v:'multicaixa',i:'fa-mobile-alt',l:'Multicaixa'},
    {v:'misto',i:'fa-random',l:'Misto'},
    {v:'credito',i:'fa-file-invoice',l:'Crédito'}
  ];
  return header('PDV — Ponto de Venda', produtos.length+' produtos disponíveis', 'var(--success)',
    '<button class="btn btn-sm" onclick="abrirScanner()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-barcode"></i> Scanner</button>'+
    '<button class="btn btn-sm" onclick="imprimirEtiquetasLote()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-tags"></i> Etiquetas</button>'+
    '<button class="btn btn-sm" onclick="openModule(\'vendas\')" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-history"></i> Histórico</button>',
    'fa-cash-register')+
    '<div class="pdv-breadcrumb">'+
      '<div class="step active" data-step="1"><span class="num">1</span>Produtos</div><span class="sep">›</span>'+
      '<div class="step" data-step="2"><span class="num">2</span>Carrinho</div><span class="sep">›</span>'+
      '<div class="step" data-step="3"><span class="num">3</span>Cliente</div><span class="sep">›</span>'+
      '<div class="step" data-step="4"><span class="num">4</span>Pagamento</div><span class="sep">›</span>'+
      '<div class="step" data-step="5"><span class="num">5</span>Valores</div><span class="sep">›</span>'+
      '<div class="step" data-step="6"><span class="num">6</span>Finalizar</div>'+
    '</div>'+
    '<div class="pdv-screen active" id="pdvScreen1"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-boxes"></i> Produtos</h3>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<input type="text" id="pdvBusca" placeholder="🔍 Buscar..." style="padding:10px 14px;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);min-width:200px" oninput="filtrarPDV(this.value)">'+
        '<input type="text" id="pdvCodigoBarras" placeholder="📷 Código" style="padding:10px 14px;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);width:150px" onkeypress="if(event.key===\'Enter\'){buscarPorCodigo(this.value);this.value=\'\'}">'+
        '<button class="btn btn-sm btn-info" onclick="abrirScanner()"><i class="fas fa-camera"></i></button>'+
      '</div></div>'+
      '<div class="pdv-products-grid" id="pdvProductsGrid">'+renderGridProdutos(produtos, favs)+'</div></div>'+
      '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;margin-top:16px;border:1px solid var(--border)">'+
        '<div><div style="font-size:.8rem;color:var(--text-muted)">Carrinho</div>'+
          '<div style="font-size:1.3rem;font-weight:800" id="pdvScreen1Total">'+pdvState.carrinho.length+' itens</div></div>'+
        '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(2)">Ver Carrinho <i class="fas fa-arrow-right"></i></button>'+
      '</div></div>'+
    '<div class="pdv-screen" id="pdvScreen2"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-shopping-cart"></i> Carrinho</h3>'+
      '<button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(1)"><i class="fas fa-arrow-left"></i> Voltar</button></div>'+
      '<div class="pdv-cart-full" id="pdvCarrinhoFull"></div></div>'+
      '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">'+
        '<div><div style="font-size:.8rem;color:var(--text-muted)">Subtotal</div>'+
          '<div style="font-size:1.5rem;font-weight:800;color:var(--secondary)" id="pdvSubtotalTela2">'+fmt(0)+'</div></div>'+
        '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(3)">Continuar <i class="fas fa-arrow-right"></i></button>'+
      '</div></div>'+
    '<div class="pdv-screen" id="pdvScreen3"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-user"></i> Cliente</h3>'+
      '<button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(2)"><i class="fas fa-arrow-left"></i> Voltar</button></div>'+
      '<div class="form-grid" style="max-width:600px">'+
        '<div class="form-group full"><label>Nome *</label><input id="pdvClienteNome" value="'+esc(pdvState.cliente.nome)+'"></div>'+
        '<div class="form-group"><label>NIF</label><input id="pdvClienteNif" value="'+esc(pdvState.cliente.nif)+'"></div>'+
        '<div class="form-group"><label>Telefone</label><input id="pdvClienteTel" value="'+esc(pdvState.cliente.telefone)+'"></div>'+
      '</div>'+
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'+
        '<button class="btn btn-info" onclick="abrirModalPDVCliente()"><i class="fas fa-user-plus"></i> Novo Cliente</button>'+
        '<button class="btn btn-secondary" onclick="pdvClienteAnonimo()"><i class="fas fa-user-secret"></i> Anônimo</button>'+
      '</div></div>'+
      '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">'+
        '<div><div style="font-size:.8rem;color:var(--text-muted)">Cliente</div>'+
          '<div style="font-size:1.1rem;font-weight:700" id="pdvClienteResumo">'+esc(pdvState.cliente.nome)+'</div></div>'+
        '<button class="btn btn-primary btn-lg" onclick="pdvSalvarCliente()">Continuar <i class="fas fa-arrow-right"></i></button>'+
      '</div></div>'+
    '<div class="pdv-screen" id="pdvScreen4"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-credit-card"></i> Pagamento</h3>'+
      '<button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(3)"><i class="fas fa-arrow-left"></i> Voltar</button></div>'+
      '<div class="payment-methods-grid">'+
        pags.map(p=>'<div class="payment-method-card '+(pdvState.pagamento===p.v?'selected':'')+'" data-payment="'+p.v+'" onclick="pdvSelecionarPagamento(\''+p.v+'\')"><i class="fas '+p.i+'"></i><span>'+p.l+'</span></div>').join('')+
      '</div></div>'+
      '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">'+
        '<div><div style="font-size:.8rem;color:var(--text-muted)">Pagamento</div>'+
          '<div style="font-size:1.1rem;font-weight:700" id="pdvPagamentoResumo">Dinheiro</div></div>'+
        '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(5)">Continuar <i class="fas fa-arrow-right"></i></button>'+
      '</div></div>'+
    '<div class="pdv-screen" id="pdvScreen5"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-calculator"></i> Valores e Impostos</h3>'+
      '<button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(4)"><i class="fas fa-arrow-left"></i> Voltar</button></div>'+
      '<div class="form-grid">'+
        '<div class="form-group"><label>🏷️ Desconto (%) máx: '+getPerms().descontoMax+'%</label><input type="number" id="pdvDescontoInput" value="'+pdvState.desconto+'" min="0" max="'+getPerms().descontoMax+'" oninput="pdvAtualizarValores()" style="font-size:1.1rem;text-align:right"></div>'+
        '<div class="form-group"><label>💰 Valor Recebido</label><input type="number" id="pdvValorRecebidoInput" value="'+pdvState.valorRecebido+'" oninput="pdvAtualizarValores()" style="font-size:1.1rem;text-align:right"></div>'+
        '<div class="form-group"><label>⚖️ Regime Fiscal</label><select id="pdvRegimeInput" onchange="pdvAtualizarValores()">'+
          '<option value="geral" '+(pdvState.regime==='geral'?'selected':'')+'>Regime Geral (IVA 14%)</option>'+
          '<option value="simplificado" '+(pdvState.regime==='simplificado'?'selected':'')+'>Simplificado (7%)</option>'+
          '<option value="isento" '+(pdvState.regime==='isento'?'selected':'')+'>Isento</option>'+
        '</select></div>'+
        '<div class="form-group"><label>Aplicações</label><div style="padding-top:6px">'+
          '<label style="display:block;margin-bottom:6px;font-weight:400"><input type="checkbox" id="pdvAplicarIVA" '+(pdvState.aplicarIVA?'checked':'')+' onchange="pdvAtualizarValores()"> Aplicar IVA</label>'+
        '</div></div>'+
      '</div>'+
      '<div class="form-group"><label>📝 Observações</label><textarea id="pdvObs" rows="2">'+esc(pdvState.observacoes)+'</textarea></div>'+
      '<div class="total-box" style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;border-radius:14px;padding:18px;margin:16px 0">'+
        '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Subtotal:</span><span id="pdvCalcSubtotal">'+fmt(0)+'</span></div>'+
        '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Desconto:</span><span id="pdvCalcDesconto">-'+fmt(0)+'</span></div>'+
        '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Montante Ilíquido:</span><span id="pdvCalcBase">'+fmt(0)+'</span></div>'+
        '<div style="display:flex;justify-content:space-between;padding:6px 0"><span>Imposto Devido:</span><span id="pdvCalcIVA">'+fmt(0)+'</span></div>'+
        '<div style="display:flex;justify-content:space-between;border-top:2px solid rgba(255,255,255,.3);margin-top:8px;padding-top:12px;font-size:1.3rem;font-weight:800"><span>TOTAL LÍQUIDO:</span><span id="pdvCalcTotal">'+fmt(0)+'</span></div>'+
      '</div>'+
      '<div id="pdvTrocoBox" style="background:linear-gradient(135deg,var(--success),var(--secondary));color:#fff;border-radius:10px;padding:16px;margin-top:12px;display:none">'+
        '<div style="font-size:.85rem;opacity:.9">💵 Troco</div>'+
        '<div style="font-size:2rem;font-weight:800;margin-top:4px" id="pdvTrocoValue">'+fmt(0)+'</div>'+
      '</div>'+
    '</div>'+
      '<div style="position:sticky;bottom:16px;background:var(--bg-card);padding:16px;border-radius:14px;box-shadow:var(--shadow-hover);display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border)">'+
        '<div><div style="font-size:.8rem;color:var(--text-muted)">Total a Pagar</div>'+
          '<div style="font-size:1.5rem;font-weight:800;color:var(--secondary)" id="pdvTotalFinalTela5">'+fmt(0)+'</div></div>'+
        '<button class="btn btn-primary btn-lg" onclick="pdvIrParaTela(6)">Revisar <i class="fas fa-arrow-right"></i></button>'+
      '</div></div>'+
    '<div class="pdv-screen" id="pdvScreen6"><div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-check-circle"></i> Revisão Final</h3>'+
      '<button class="btn btn-sm btn-secondary" onclick="pdvIrParaTela(5)"><i class="fas fa-arrow-left"></i> Voltar</button></div>'+
      '<div style="background:var(--bg);border-radius:10px;padding:16px;margin-bottom:16px" id="pdvResumoFinal"></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">'+
        '<button class="btn btn-danger btn-lg" onclick="pdvCancelarVenda()"><i class="fas fa-times-circle"></i> Cancelar</button>'+
        '<button class="btn btn-warning btn-lg" onclick="pdvSalvarRascunho()"><i class="fas fa-save"></i> Rascunho</button>'+
        '<button class="btn btn-info btn-lg" onclick="pdvSalvarOrcamento()"><i class="fas fa-file-invoice"></i> Orçamento</button>'+
        '<button class="btn btn-purple btn-lg" onclick="pdvFinalizarVenda()"><i class="fas fa-print"></i> Finalizar & Imprimir</button>'+
      '</div></div></div>';
}

function pdvIrParaTela(n){
  $$('.pdv-screen').forEach(el => el.classList.remove('active'));
  const t = $('pdvScreen'+n); if(t) t.classList.add('active');
  $$('.pdv-breadcrumb .step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s===n);
    el.classList.toggle('done', s<n);
  });
  pdvState.screen = n;
  if(n===2) pdvRenderCarrinhoFull();
  if(n===5) pdvAtualizarValores();
  if(n===6) pdvRenderResumoFinal();
  const c = $('content'); if(c) c.scrollTop = 0;
}
async function pdvSelecionarProduto(id){
  const p = pdvCache.produtos.find(x => x.id===id) || await DB.get('produtos', id);
  if(!p) return;
  if((p.estoque||0)<=0){ toast('Produto sem estoque','warning'); return; }
  const it = pdvState.carrinho.find(i => i.id===id);
  if(it){
    if(it.qty >= p.estoque){ toast('Estoque insuficiente','warning'); return; }
    it.qty++; it.subtotal = it.preco * it.qty;
  } else {
    pdvState.carrinho.push({ id:p.id, nome:p.nome, preco:p.preco, qty:1, subtotal:p.preco, imagem:p.imagem, codigoBarras:p.codigoBarras });
  }
  toast('✅ '+p.nome+' (x'+pdvState.carrinho.length+')','success');
  const el = $('pdvScreen1Total'); if(el) el.textContent = pdvState.carrinho.length+' itens';
}
function pdvRenderCarrinhoFull(){
  const box = $('pdvCarrinhoFull'); if(!box) return;
  if(!pdvState.carrinho.length){ box.innerHTML = emptyState('fa-shopping-cart','Carrinho vazio'); const st=$('pdvSubtotalTela2'); if(st) st.textContent=fmt(0); return; }
  box.innerHTML = pdvState.carrinho.map(i =>
    '<div class="pdv-cart-item-full" style="display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid var(--border);background:var(--bg-card);border-radius:10px;margin-bottom:8px;gap:10px;flex-wrap:wrap">'+
      '<div style="flex:1;min-width:140px"><div style="font-weight:700;font-size:1rem">'+esc(i.nome)+'</div>'+
        '<div style="font-size:.85rem;color:var(--text-muted);margin-top:2px">'+fmt(i.preco)+' × '+i.qty+'</div></div>'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<button onclick="pdvAltQty('+i.id+',-1)" style="width:38px;height:38px;border-radius:50%;border:none;background:var(--primary);color:#fff;cursor:pointer;font-weight:700;font-size:1.1rem">−</button>'+
        '<span style="min-width:44px;text-align:center;font-weight:700;font-size:1.1rem">'+i.qty+'</span>'+
        '<button onclick="pdvAltQty('+i.id+',1)" style="width:38px;height:38px;border-radius:50%;border:none;background:var(--primary);color:#fff;cursor:pointer;font-weight:700;font-size:1.1rem">+</button>'+
      '</div>'+
      '<div style="font-weight:800;font-size:1.1rem;min-width:110px;text-align:right">'+fmt(i.subtotal)+'</div>'+
      '<button onclick="pdvRemoverItem('+i.id+')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:1.2rem;padding:6px 10px"><i class="fas fa-trash"></i></button>'+
    '</div>'
  ).join('');
  const st = pdvState.carrinho.reduce((s,i)=>s+i.subtotal,0);
  const el = $('pdvSubtotalTela2'); if(el) el.textContent = fmt(st);
}
function pdvAltQty(id,d){
  const it = pdvState.carrinho.find(i => i.id===id); if(!it) return;
  it.qty += d; it.subtotal = it.preco * it.qty;
  if(it.qty<=0) pdvState.carrinho = pdvState.carrinho.filter(i => i.id!==id);
  pdvRenderCarrinhoFull();
}
function pdvRemoverItem(id){
  pdvState.carrinho = pdvState.carrinho.filter(i => i.id!==id);
  pdvRenderCarrinhoFull();
  toast('Removido','info');
}
function pdvSalvarCliente(){
  pdvState.cliente.nome = ($('pdvClienteNome').value.trim() || 'Cliente Anônimo');
  pdvState.cliente.nif = $('pdvClienteNif').value.trim();
  pdvState.cliente.telefone = $('pdvClienteTel').value.trim();
  pdvIrParaTela(4);
}
function pdvClienteAnonimo(){
  $('pdvClienteNome').value = 'Cliente Anônimo';
  $('pdvClienteNif').value = '';
  $('pdvClienteTel').value = '';
  pdvState.cliente = {nome:'Cliente Anônimo',nif:'',telefone:''};
  toast('Cliente anônimo','info');
}
function pdvSelecionarPagamento(t){
  pdvState.pagamento = t;
  $$('.payment-method-card').forEach(el => el.classList.toggle('selected', el.dataset.payment===t));
  const map = {dinheiro:'Dinheiro',cartao:'Cartão',transferencia:'Transferência',multicaixa:'Multicaixa',misto:'Misto',credito:'Crédito'};
  const el = $('pdvPagamentoResumo'); if(el) el.textContent = map[t]||t;
}
function pdvAtualizarValores(){
  const dEl=$('pdvDescontoInput'), vEl=$('pdvValorRecebidoInput'), rEl=$('pdvRegimeInput'), iEl=$('pdvAplicarIVA');
  if(!dEl) return {subtotal:0,descontoValor:0,base:0,iva:0,total:0,troco:0};
  const maxD = getPerms().descontoMax;
  let desc = num(dEl.value,0);
  if(desc>maxD){ desc=maxD; dEl.value=maxD; }
  const vRec = num(vEl.value,0);
  const regime = rEl.value;
  const aplicarIVA = iEl.checked;
  pdvState.desconto=desc; pdvState.valorRecebido=vRec;
  pdvState.regime=regime; pdvState.aplicarIVA=aplicarIVA;
  const subtotal = pdvState.carrinho.reduce((s,i)=>s+i.subtotal,0);
  const descVal = subtotal * (desc/100);
  const base = subtotal - descVal;
  let taxa = 0;
  if(aplicarIVA) taxa = regime==='geral'?0.14:(regime==='simplificado'?0.07:0);
  const iva = base * taxa;
  const total = base + iva;
  const troco = vRec - total;
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  set('pdvCalcSubtotal', fmt(subtotal));
  set('pdvCalcDesconto', '-'+fmt(descVal));
  set('pdvCalcBase', fmt(base));
  set('pdvCalcIVA', fmt(iva));
  set('pdvCalcTotal', fmt(total));
  set('pdvTotalFinalTela5', fmt(total));
  const tb=$('pdvTrocoBox'), tv=$('pdvTrocoValue');
  if(tb && tv){
    if(vRec>0){ tb.style.display='block'; tv.textContent = troco>=0?fmt(troco):'Faltam '+fmt(Math.abs(troco)); }
    else tb.style.display='none';
  }
  return {subtotal,descontoValor:descVal,base,iva,total,troco};
}
function pdvRenderResumoFinal(){
  const c = pdvAtualizarValores();
  const map = {dinheiro:'Dinheiro',cartao:'Cartão',transferencia:'Transferência',multicaixa:'Multicaixa',misto:'Misto',credito:'Crédito'};
  const el = $('pdvResumoFinal'); if(!el) return;
  el.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'+
      '<div><strong style="color:var(--primary)">👤 Cliente</strong><div>'+esc(pdvState.cliente.nome)+'</div>'+
      (pdvState.cliente.nif?'<div style="font-size:.8rem;color:var(--text-muted)">NIF: '+esc(pdvState.cliente.nif)+'</div>':'')+'</div>'+
      '<div><strong style="color:var(--primary)">💳 Pagamento</strong><div>'+(map[pdvState.pagamento]||'')+'</div>'+
      '<div style="font-size:.8rem;color:var(--text-muted)">Regime: '+pdvState.regime+'</div></div>'+
    '</div>'+
    '<hr style="border:1px dashed var(--border);margin:12px 0">'+
    '<div style="font-size:.88rem">'+
      '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Itens:</span><span>'+pdvState.carrinho.length+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Subtotal:</span><span>'+fmt(c.subtotal)+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Desconto ('+pdvState.desconto+'%):</span><span>-'+fmt(c.descontoValor)+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Imposto:</span><span>'+fmt(c.iva)+'</span></div>'+
      '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:1.2rem;font-weight:800;border-top:2px solid var(--border);margin-top:6px"><span>TOTAL LÍQUIDO:</span><span style="color:var(--secondary)">'+fmt(c.total)+'</span></div>'+
      '<div style="padding:6px 0;font-size:.75rem;color:var(--text-muted);font-style:italic">'+numeroPorExtenso(c.total)+'</div>'+
      (pdvState.valorRecebido>0?'<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Recebido:</span><span>'+fmt(pdvState.valorRecebido)+'</span></div>'+
        '<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--success);font-weight:700"><span>Troco:</span><span>'+fmt(c.troco)+'</span></div>':'')+
    '</div>';
}
function pdvCancelarVenda(){
  if(!confirm('Cancelar esta venda?')) return;
  pdvState.carrinho = []; pdvState.cliente = {nome:'Cliente Anônimo',nif:'',telefone:''};
  pdvState.desconto = 0; pdvState.valorRecebido = 0;
  toast('Venda cancelada','info');
  openModule('pdv');
}
async function pdvSalvarRascunho(){
  await saveData('vendas', Object.assign(copy(pdvState),{status:'rascunho',data:now()}));
  toast('📝 Rascunho salvo','success');
}
async function pdvSalvarOrcamento(){
  const c = pdvAtualizarValores();
  await saveData('orcamentos', Object.assign(copy(pdvState),{total:c.total,status:'pendente',data:now()}));
  toast('📄 Orçamento gerado','success');
}
async function pdvFinalizarVenda(modo){
  modo = modo || 'finalizada';
  if(!pdvState.carrinho.length){ toast('Carrinho vazio','warning'); return; }
  const c = pdvAtualizarValores();
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const user = JSON.parse(localStorage.getItem('kanawa_user')||'{}');
  const numeroFatura = 'FT-'+new Date().getFullYear()+'-'+String(Date.now()).slice(-6);
  const venda = {
    numeroFatura,
    clienteNome: pdvState.cliente.nome,
    clienteNif: pdvState.cliente.nif,
    clienteTelefone: pdvState.cliente.telefone,
    itens: pdvState.carrinho.map(i=>({id:i.id,nome:i.nome,preco:i.preco,qty:i.qty,subtotal:i.subtotal})),
    subtotal: c.subtotal, desconto: pdvState.desconto, descontoValor: c.descontoValor,
    iva: c.iva, total: c.total, valorRecebido: pdvState.valorRecebido, troco: c.troco,
    pagamento: pdvState.pagamento, regime: pdvState.regime, aplicarIVA: pdvState.aplicarIVA,
    observacoes: pdvState.observacoes, status: modo, data: now(),
    hash: gerarHash({total:c.total,data:Date.now()}),
    operador: user.nome || 'Admin', empresa: emp
  };
  venda.assinatura = gerarAssinatura(venda);
  await saveData('vendas', venda);
  for(const item of pdvState.carrinho){
    const p = await DB.get('produtos', item.id);
    if(p){ p.estoque = Math.max(0,(p.estoque||0)-item.qty); await saveData('produtos', p); }
  }
  await saveData('movimentacoesEstoque',{tipo:'saida',descricao:'Venda '+numeroFatura,itens:pdvState.carrinho.map(i=>({id:i.id,nome:i.nome,qtd:i.qty})),data:now()});
  if(pdvState.pagamento==='credito'){
    await saveData('contasReceber',{cliente:pdvState.cliente.nome,valor:c.total,descricao:'Venda '+numeroFatura,vencimento:new Date(Date.now()+30*86400000).toISOString(),status:'pendente',data:now()});
  }
  await criarNotificacao('Nova Venda', numeroFatura+' - '+fmt(c.total),'success','vendas');
  toast('✅ Venda '+numeroFatura+': '+fmt(c.total),'success');
  abrirFatura(venda);
  abrirGavetaAutomatico();
  pdvCache.ts = 0;
  pdvState.carrinho = []; pdvState.cliente = {nome:'Cliente Anônimo',nif:'',telefone:''};
  pdvState.desconto = 0; pdvState.valorRecebido = 0;
}
function filtrarPDV(termo){
  const t = (termo||'').toLowerCase().trim();
  const grid = $('pdvProductsGrid'); if(!grid) return;
  const filt = pdvCache.produtos.filter(p => (p.nome||'').toLowerCase().indexOf(t)!==-1 || (p.codigoBarras||'').indexOf(t)!==-1 || (p.codigo||'').toLowerCase().indexOf(t)!==-1);
  grid.innerHTML = renderGridProdutos(filt, pdvCache.favoritos);
}
function toggleFavorito(id, el){
  const favs = pdvCache.favoritos;
  const i = favs.indexOf(id);
  if(i>-1){ favs.splice(i,1); el.classList.remove('active'); }
  else { favs.push(id); el.classList.add('active'); }
  localStorage.setItem('kanawa_favoritos', JSON.stringify(favs));
}

/* ============================================================
   SCANNER
   ============================================================ */
async function abrirScanner(cb){
  scannerCallback = cb || null;
  const modal = $('scannerModal'); if(modal) modal.classList.add('active');
  const el = $('scannerReader');
  if(el) el.innerHTML = '<div style="text-align:center;padding:40px;color:#fff"><i class="fas fa-spinner fa-spin" style="font-size:2.5rem"></i><p style="margin-top:12px">Iniciando câmera...</p></div>';
  if(scannerActive) return;
  if(typeof Html5Qrcode === 'undefined'){
    if(el) el.innerHTML = '<div style="text-align:center;padding:30px;color:#fff"><p>Scanner indisponível. Digite o código:</p>'+
      '<input type="text" id="codigoManual" placeholder="Código de barras" style="padding:10px;border-radius:8px;border:none;margin-top:10px;width:80%;max-width:300px" onkeypress="if(event.key===\'Enter\'){processarCodigoLido(this.value);this.value=\'\'}"></div>';
    return;
  }
  try {
    scanner = new Html5Qrcode('scannerReader', {verbose:false});
    await scanner.start({facingMode:'environment'},{fps:15,qrbox:{width:260,height:260}},async (txt)=>{ await processarCodigoLido(txt); },()=>{});
    scannerActive = true;
    toast('📷 Câmera ativa','info');
  } catch(err){
    if(el) el.innerHTML = '<div style="text-align:center;padding:30px;color:#fff"><i class="fas fa-exclamation-triangle" style="font-size:2.5rem;color:#f59e0b"></i><p style="margin-top:12px">Câmera indisponível</p></div>';
  }
}
async function processarCodigoLido(codigo){
  if(!codigo) return;
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.value = 1200; g.gain.value = 0.1;
    o.start(); setTimeout(()=>{o.stop();c.close();},100);
  } catch(e){}
  if(navigator.vibrate) navigator.vibrate(100);
  const produtos = await carregarCachePDV();
  const prod = produtos.find(p => p.codigoBarras===codigo || p.codigo===codigo);
  if(prod){
    if(scannerCallback){ scannerCallback(prod); fecharScanner(); return; }
    pdvSelecionarProduto(prod.id);
    setTimeout(fecharScanner, 1200);
  } else {
    toast('⚠️ Não cadastrado: '+codigo,'warning');
    setTimeout(()=>{ fecharScanner(); cadastroRapidoProduto(codigo); }, 800);
  }
}
function fecharScanner(){
  const modal = $('scannerModal'); if(modal) modal.classList.remove('active');
  if(scanner && scannerActive){
    scanner.stop().then(()=>{scannerActive=false;scanner=null;scannerCallback=null;}).catch(()=>{scannerActive=false;scanner=null;});
  }
}
async function buscarPorCodigo(c){ if(c) await processarCodigoLido(c); }
async function cadastroRapidoProduto(codigo){
  openModal('⚡ Cadastro Rápido',
    '<div class="form-group"><label>Código de Barras</label><input id="rcCodigo" value="'+esc(codigo)+'" readonly style="background:var(--bg-hover)"></div>'+
    '<div class="form-group"><label>Nome *</label><input id="rcNome" autofocus></div>'+
    '<div class="form-group"><label>Preço (Kz) *</label><input id="rcPreco" type="number" step="0.01"></div>'+
    '<div class="form-group"><label>Estoque Inicial</label><input id="rcEstoque" type="number" value="0"></div>'+
    '<div class="form-group"><label>Categoria</label><input id="rcCategoria" value="Geral"></div>'+
    '<button class="btn btn-success btn-block" onclick="salvarCadastroRapido()"><i class="fas fa-save"></i> Cadastrar e Adicionar</button>');
}
async function salvarCadastroRapido(){
  const nome = $('rcNome').value.trim();
  const preco = num($('rcPreco').value,0);
  if(!nome || !preco){ toast('Preencha nome e preço','warning'); return; }
  const novo = {
    codigo: 'P'+Date.now().toString().slice(-6),
    codigoBarras: $('rcCodigo').value,
    nome, preco,
    estoque: int($('rcEstoque').value,0),
    categoria: $('rcCategoria').value || 'Geral',
    dataCadastro: now()
  };
  const id = await saveData('produtos', novo); novo.id = id;
  pdvCache.produtos.push(novo);
  toast('✅ '+nome+' cadastrado','success');
  closeModal();
  pdvSelecionarProduto(id);
}

/* ============================================================
   PRODUTOS / CATEGORIAS / CLIENTES / FORNECEDORES / etc
   ============================================================ */
async function renderProdutos(){
  const produtos = await getData('produtos');
  const rows = produtos.map(p=>[
    '<div style="width:44px;height:44px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden"><img src="'+imgSrc(p)+'" style="width:100%;height:100%;object-fit:cover" onerror="this.onerror=null;this.src=\''+PLACEHOLDER+'\'"></div>',
    esc(p.codigo||'-')+'<br><small style="color:var(--text-muted);font-family:monospace">'+esc(p.codigoBarras||'')+'</small>',
    '<strong>'+esc(p.nome)+'</strong>',
    esc(p.categoria||'-'),
    fmt(p.preco),
    badge(p.estoque||0,(p.estoque||0)>0?'success':'danger'),
    '<button class="btn btn-sm btn-primary" onclick="abrirModalProduto('+p.id+')"><i class="fas fa-edit"></i></button> '+
    '<button class="btn btn-sm btn-info" onclick="imprimirEtiquetaIndividual('+p.id+')"><i class="fas fa-tag"></i></button> '+
    (podeFazer('excluir')?'<button class="btn btn-sm btn-danger" onclick="excluirItem(\'produtos\','+p.id+')"><i class="fas fa-trash"></i></button>':'')
  ]);
  return header('Produtos', produtos.length+' produtos','var(--primary)',
    '<button class="btn btn-sm" onclick="exportarProdutos()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-file-export"></i> Exportar</button>'+
    '<button class="btn btn-sm" onclick="imprimirEtiquetasLote()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-tags"></i> Etiquetas</button>'+
    '<button class="btn btn-success" onclick="abrirModalProduto()"><i class="fas fa-plus"></i> Novo</button>',
    'fa-boxes')+
    '<div class="card">'+table(['Img','Código','Nome','Categoria','Preço','Estoque','Ações'],rows)+'</div>';
}
async function abrirModalProduto(id){
  const cats = await getData('categorias');
  const p = id ? (await DB.get('produtos', id)) || {} : {};
  openModal(id?'Editar Produto':'Novo Produto',
    '<div class="form-grid">'+
      '<div class="form-group"><label>Código Interno</label><input id="pCodigo" value="'+esc(p.codigo||'')+'"></div>'+
      '<div class="form-group"><label>📷 Código de Barras</label><div style="display:flex;gap:6px">'+
        '<input id="pCodigoBarras" value="'+esc(p.codigoBarras||'')+'" style="flex:1">'+
        '<button class="btn btn-sm btn-info" onclick="abrirScanner(function(prod){document.getElementById(\'pCodigoBarras\').value=prod.codigoBarras})"><i class="fas fa-camera"></i></button>'+
      '</div></div>'+
      '<div class="form-group full"><label>Nome *</label><input id="pNome" value="'+esc(p.nome||'')+'"></div>'+
      '<div class="form-group"><label>Categoria</label><select id="pCategoria"><option value="">Selecione...</option>'+
        cats.map(c=>'<option value="'+esc(c.nome)+'" '+(p.categoria===c.nome?'selected':'')+'>'+esc(c.nome)+'</option>').join('')+
        '<option value="Geral" '+(p.categoria==='Geral'?'selected':'')+'>Geral</option></select></div>'+
      '<div class="form-group"><label>Preço (Kz) *</label><input id="pPreco" type="number" step="0.01" value="'+(p.preco||0)+'"></div>'+
      '<div class="form-group"><label>Estoque</label><input id="pEstoque" type="number" value="'+(p.estoque||0)+'"></div>'+
      '<div class="form-group"><label>Estoque Mínimo</label><input id="pEstoqueMin" type="number" value="'+(p.estoqueMin||10)+'"></div>'+
      '<div class="form-group"><label>Unidade</label><select id="pUnidade">'+['UN','KG','L','M'].map(u=>'<option value="'+u+'" '+(p.unidade===u?'selected':'')+'>'+u+'</option>').join('')+'</select></div>'+
      '<div class="form-group full"><label>🖼️ Imagem do Produto</label>'+
        '<div class="image-picker" onclick="document.getElementById(\'pImagemInput\').click()">'+
          '<div class="placeholder" id="pImagemPlaceholder" style="'+(p.imagem?'display:none':'')+'"><i class="fas fa-image"></i><span style="font-size:.85rem">Clique para escolher do dispositivo</span></div>'+
          '<img id="pImagemPreview" src="'+(p.imagem||'')+'" style="'+(p.imagem?'':'display:none')+'" onerror="this.style.display=\'none\'">'+
        '</div>'+
        '<input type="file" id="pImagemInput" accept="image/*" style="display:none" onchange="escolherImagemProduto(this)">'+
        '<input type="hidden" id="pImagem" value="'+esc(p.imagem||'')+'">'+
        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
          '<button class="btn btn-sm btn-secondary" type="button" onclick="document.getElementById(\'pImagemInput\').click()"><i class="fas fa-folder-open"></i> Escolher</button>'+
          '<button class="btn btn-sm btn-danger" type="button" onclick="removerImagemProduto()"><i class="fas fa-trash"></i> Remover</button>'+
        '</div>'+
      '</div>'+
      '<div class="form-group full"><label>Descrição</label><textarea id="pDesc" rows="2">'+esc(p.descricao||'')+'</textarea></div>'+
    '</div>'+
    '<button class="btn btn-primary btn-block btn-lg" style="margin-top:16px" onclick="salvarProduto('+(id||'null')+')"><i class="fas fa-save"></i> Salvar</button>', true);
}
function escolherImagemProduto(input){
  const file = input.files[0]; if(!file) return;
  if(file.size > 3*1024*1024){ toast('Imagem muito grande (máx 3MB)','warning'); return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    const url = e.target.result;
    const inp = $('pImagem'); if(inp) inp.value = url;
    const prev = $('pImagemPreview'); const ph = $('pImagemPlaceholder');
    if(prev){ prev.src = url; prev.style.display = 'block'; }
    if(ph) ph.style.display = 'none';
    toast('✅ Imagem carregada','success');
  };
  reader.readAsDataURL(file);
}
function removerImagemProduto(){
  const inp = $('pImagem'); if(inp) inp.value = '';
  const prev = $('pImagemPreview'); const ph = $('pImagemPlaceholder');
  if(prev){ prev.src = ''; prev.style.display = 'none'; }
  if(ph) ph.style.display = 'block';
}
async function salvarProduto(id){
  const nome = $('pNome').value.trim();
  if(!nome){ toast('Informe o nome','warning'); return; }
  const data = {
    codigo: $('pCodigo').value, codigoBarras: $('pCodigoBarras').value, nome,
    categoria: $('pCategoria').value, preco: num($('pPreco').value,0),
    estoque: int($('pEstoque').value,0), estoqueMin: int($('pEstoqueMin').value,10),
    unidade: $('pUnidade').value, imagem: $('pImagem').value, descricao: $('pDesc').value
  };
  if(id) data.id = id;
  await saveData('produtos', data);
  pdvCache.ts = 0;
  toast(id?'Atualizado':'Cadastrado','success');
  closeModal(); openModule('produtos');
}
async function excluirProduto(id){
  if(!podeFazer('excluir')){ toast('Sem permissão','error'); return; }
  if(!confirm('Excluir produto?')) return;
  await deleteData('produtos', id);
  pdvCache.ts = 0;
  toast('Excluído','info'); openModule('produtos');
}
async function exportarProdutos(){
  if(typeof XLSX === 'undefined'){ toast('Excel indisponível','warning'); return; }
  const data = await getData('produtos');
  const ws = XLSX.utils.json_to_sheet(data.map(p=>({codigo:p.codigo,codigoBarras:p.codigoBarras,nome:p.nome,categoria:p.categoria,preco:p.preco,estoque:p.estoque,unidade:p.unidade})));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
  XLSX.writeFile(wb, 'produtos_'+Date.now()+'.xlsx');
  toast('📤 Exportado','success');
}
function abrirModalImportar(){
  openModal('Importar Produtos',
    '<p style="color:var(--text-muted);margin-bottom:12px">Colunas: codigo, codigoBarras, nome, categoria, preco, estoque, unidade</p>'+
    '<div class="form-group"><input type="file" id="importFile" accept=".xlsx,.xls,.csv" style="padding:10px"></div>'+
    '<button class="btn btn-primary btn-block" onclick="importarProdutos()"><i class="fas fa-upload"></i> Importar</button>');
}
async function importarProdutos(){
  if(typeof XLSX === 'undefined'){ toast('Excel indisponível','warning'); return; }
  const f = $('importFile').files[0];
  if(!f){ toast('Selecione arquivo','warning'); return; }
  const r = new FileReader();
  r.onload = async (e)=>{
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      let c = 0;
      for(const row of rows){
        await saveData('produtos', {codigo:row.codigo||'',codigoBarras:row.codigoBarras||'',nome:row.nome||'',categoria:row.categoria||'Geral',preco:num(row.preco,0),estoque:int(row.estoque,0),unidade:row.unidade||'UN'});
        c++;
      }
      pdvCache.ts = 0;
      toast('✅ '+c+' produtos importados','success');
      closeModal(); openModule('produtos');
    } catch(err){ toast('Erro: '+err.message,'error'); }
  };
  r.readAsArrayBuffer(f);
}

/* ============================================================
   ETIQUETAS
   ============================================================ */
async function imprimirEtiquetaIndividual(id){
  const p = await DB.get('produtos', id); if(!p) return;
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  openModal('🏷️ Etiqueta',
    '<div id="etiquetaContainer" style="text-align:center;background:#fff;padding:20px;border-radius:10px">'+
      '<div class="etiqueta-print" style="margin:0 auto">'+
        '<div style="font-size:12px;font-weight:bold;color:#1a3a5c">'+esc(emp.firma||emp.nome||'KANAWA SOFT')+'</div>'+
        '<div style="font-size:10px;margin:3px 0;color:#555">'+esc(p.categoria||'Geral')+'</div>'+
        '<hr style="border-top:1px solid #000">'+
        '<div style="font-size:13px;font-weight:bold;margin:5px 0">'+esc(p.nome)+'</div>'+
        '<div style="font-size:11px;font-family:monospace;margin:5px 0">'+esc(p.codigo||'')+'</div>'+
        (p.codigoBarras?'<canvas id="barcodeEtq" style="max-width:240px"></canvas>':'')+
        '<div style="font-size:20px;font-weight:800;color:#217346;margin-top:6px">'+fmt(p.preco)+'</div>'+
        '<div style="font-size:9px;color:#777;margin-top:3px">'+new Date().toLocaleDateString('pt-AO')+'</div>'+
      '</div></div>'+
    '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">'+
      '<button class="btn btn-success" onclick="imprimirEtiquetaHTML()"><i class="fas fa-print"></i> Imprimir</button>'+
      '<button class="btn btn-info" onclick="baixarEtiquetaPDF()"><i class="fas fa-file-pdf"></i> PDF</button>'+
      '<button class="btn btn-secondary" onclick="closeModal()">Fechar</button>'+
    '</div>');
  if(p.codigoBarras && window.JsBarcode){
    setTimeout(()=>{ try{ JsBarcode('#barcodeEtq', p.codigoBarras, {format:'CODE128',width:2,height:50,displayValue:true,fontSize:12}); }catch(e){} }, 100);
  }
}
async function imprimirEtiquetasLote(){
  const produtos = await carregarCachePDV();
  if(!produtos.length){ toast('Sem produtos','warning'); return; }
  openModal('🏷️ Impressão em Lote',
    '<div class="form-group"><label><input type="checkbox" id="loteTodos" onchange="document.querySelectorAll(\'.lote-produto\').forEach(c=>c.checked=this.checked)" checked> Selecionar todos ('+produtos.length+')</label></div>'+
    '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);padding:10px;border-radius:10px">'+
      produtos.map(p=>'<label style="display:block;padding:6px;border-bottom:1px solid var(--border)"><input type="checkbox" class="lote-produto" value="'+p.id+'" checked> '+esc(p.nome)+' - '+fmt(p.preco)+'</label>').join('')+
    '</div>'+
    '<div class="form-group" style="margin-top:12px"><label>Cópias por produto</label><input type="number" id="loteQtd" value="1" min="1" max="100"></div>'+
    '<button class="btn btn-primary btn-block" onclick="gerarLoteEtiquetas()"><i class="fas fa-print"></i> Gerar</button>', true);
}
async function gerarLoteEtiquetas(){
  const ids = Array.from($$('.lote-produto:checked')).map(c=>parseInt(c.value));
  const qtd = int($('loteQtd').value,1);
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  if(!ids.length){ toast('Selecione produtos','warning'); return; }
  let html = '';
  for(const id of ids){
    const p = await DB.get('produtos', id); if(!p) continue;
    for(let i=0;i<qtd;i++){
      html += '<div class="etiqueta-print">'+
        '<div style="font-size:12px;font-weight:bold;color:#1a3a5c">'+esc(emp.firma||emp.nome||'KANAWA SOFT')+'</div>'+
        '<div style="font-size:10px;margin:3px 0;color:#555">'+esc(p.categoria||'Geral')+'</div>'+
        '<hr style="border-top:1px solid #000">'+
        '<div style="font-size:13px;font-weight:bold;margin:5px 0">'+esc(p.nome)+'</div>'+
        '<div style="font-size:11px;font-family:monospace;margin:5px 0">'+esc(p.codigo||'')+'</div>'+
        '<div style="font-size:11px;font-family:monospace;margin:5px 0">'+esc(p.codigoBarras||'')+'</div>'+
        '<div style="font-size:20px;font-weight:800;color:#217346;margin-top:6px">'+fmt(p.preco)+'</div>'+
      '</div>';
    }
  }
  const w = window.open('','_blank');
  w.document.write('<html><head><title>Etiquetas</title><style>body{font-family:Arial;margin:0;padding:10px}@media print{.etiqueta-print{page-break-inside:avoid}}</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(), 400);
  toast('✅ '+(ids.length*qtd)+' etiquetas geradas','success');
  closeModal();
}
function imprimirEtiquetaHTML(){
  const el = $('etiquetaContainer'); if(!el) return;
  const w = window.open('','_blank');
  w.document.write('<html><head><title>Etiqueta</title></head><body style="font-family:Arial;text-align:center">'+el.innerHTML+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(), 400);
}
async function baixarEtiquetaPDF(){
  const el = $('etiquetaContainer'); if(!el) return;
  if(!window.jspdf){ toast('PDF indisponível','warning'); return; }
  const {jsPDF} = window.jspdf;
  const d = new jsPDF('p','mm','a4');
  d.html(el, {callback:x=>{x.save('etiqueta_'+Date.now()+'.pdf');toast('PDF gerado','success');},x:10,y:10,width:190});
}

/* ============================================================
   CATEGORIAS / CLIENTES / FORNECEDORES / TRANSPORTADORAS
   ============================================================ */
async function renderCategorias(){
  const cats = await getData('categorias');
  const rows = cats.map(c=>[
    c.id, '<strong>'+esc(c.nome)+'</strong>', esc(c.descricao||'-'),
    '<button class="btn btn-sm btn-primary" onclick="editarCategoria('+c.id+')"><i class="fas fa-edit"></i></button> '+
    (podeFazer('excluir')?'<button class="btn btn-sm btn-danger" onclick="excluirItem(\'categorias\','+c.id+')"><i class="fas fa-trash"></i></button>':'')
  ]);
  return header('Categorias', cats.length+' categorias','var(--info)',
    '<button class="btn btn-success" onclick="abrirModalCategoria()"><i class="fas fa-plus"></i> Nova</button>','fa-tags')+
    '<div class="card">'+table(['#','Nome','Descrição','Ações'],rows)+'</div>';
}
function abrirModalCategoria(){
  openModal('Nova Categoria',
    '<div class="form-group"><label>Nome *</label><input id="catNome"></div>'+
    '<div class="form-group"><label>Descrição</label><textarea id="catDesc" rows="2"></textarea></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarCategoria()">Salvar</button>');
}
async function salvarCategoria(){
  const n = $('catNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('categorias', {nome:n, descricao:$('catDesc').value});
  toast('Criada','success'); closeModal(); openModule('categorias');
}
async function editarCategoria(id){
  const c = await DB.get('categorias', id); if(!c) return;
  openModal('Editar Categoria',
    '<div class="form-group"><label>Nome</label><input id="catENome" value="'+esc(c.nome)+'"></div>'+
    '<div class="form-group"><label>Descrição</label><textarea id="catEDesc" rows="2">'+esc(c.descricao||'')+'</textarea></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarEditCategoria('+id+')">Salvar</button>');
}
async function salvarEditCategoria(id){
  const c = await DB.get('categorias', id);
  c.nome = $('catENome').value; c.descricao = $('catEDesc').value;
  await saveData('categorias', c);
  toast('Atualizada','success'); closeModal(); openModule('categorias');
}
async function renderClientes(){
  const cli = await getData('clientes');
  const rows = cli.map(c=>[
    c.id, '<strong>'+esc(c.nome)+'</strong>', esc(c.nif||'-'), esc(c.telefone||'-'), esc(c.email||'-'),
    (podeFazer('excluir')?'<button class="btn btn-sm btn-danger" onclick="excluirItem(\'clientes\','+c.id+')"><i class="fas fa-trash"></i></button>':'')
  ]);
  return header('Clientes', cli.length+' clientes','var(--info)',
    '<button class="btn btn-success" onclick="abrirModalCliente()"><i class="fas fa-plus"></i> Novo</button>','fa-users')+
    '<div class="card">'+table(['#','Nome','NIF','Telefone','Email','Ações'],rows)+'</div>';
}
function abrirModalCliente(){
  openModal('Novo Cliente',
    '<div class="form-group"><label>Nome *</label><input id="cliNome"></div>'+
    '<div class="form-group"><label>NIF</label><input id="cliNif"></div>'+
    '<div class="form-group"><label>Telefone</label><input id="cliTel"></div>'+
    '<div class="form-group"><label>Email</label><input id="cliEmail" type="email"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarClienteModal()">Salvar</button>');
}
async function salvarClienteModal(){
  const n = $('cliNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('clientes', {nome:n, nif:$('cliNif').value, telefone:$('cliTel').value, email:$('cliEmail').value, dataCadastro:now()});
  toast('Cadastrado','success'); closeModal(); openModule('clientes');
}
function abrirModalPDVCliente(){
  openModal('Novo Cliente',
    '<div class="form-group"><label>Nome *</label><input id="novoCliNome" autofocus></div>'+
    '<div class="form-group"><label>NIF</label><input id="novoCliNif"></div>'+
    '<div class="form-group"><label>Telefone</label><input id="novoCliTel"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarNovoClientePDV()">Salvar</button>');
}
async function salvarNovoClientePDV(){
  const n = $('novoCliNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  const c = {nome:n, nif:$('novoCliNif').value, telefone:$('novoCliTel').value, dataCadastro:now()};
  await saveData('clientes', c);
  if($('pdvClienteNome')){
    $('pdvClienteNome').value = n;
    $('pdvClienteNif').value = c.nif;
    $('pdvClienteTel').value = c.telefone;
  }
  pdvState.cliente = {nome:n, nif:c.nif, telefone:c.telefone};
  toast('Cliente cadastrado','success'); closeModal();
}
async function renderFornecedores(){
  const f = await getData('fornecedores');
  const rows = f.map(x=>[
    x.id, '<strong>'+esc(x.nome)+'</strong>', esc(x.nif||'-'), esc(x.telefone||'-'),
    (podeFazer('excluir')?'<button class="btn btn-sm btn-danger" onclick="excluirItem(\'fornecedores\','+x.id+')"><i class="fas fa-trash"></i></button>':'')
  ]);
  return header('Fornecedores', f.length+' fornecedores','var(--warning)',
    '<button class="btn btn-success" onclick="abrirModalFornecedor()"><i class="fas fa-plus"></i> Novo</button>','fa-truck')+
    '<div class="card">'+table(['#','Nome','NIF','Telefone','Ações'],rows)+'</div>';
}
function abrirModalFornecedor(){
  openModal('Novo Fornecedor',
    '<div class="form-group"><label>Nome *</label><input id="fNome"></div>'+
    '<div class="form-group"><label>NIF</label><input id="fNif"></div>'+
    '<div class="form-group"><label>Telefone</label><input id="fTel"></div>'+
    '<div class="form-group"><label>Email</label><input id="fEmail" type="email"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarFornecedor()">Salvar</button>');
}
async function salvarFornecedor(){
  const n = $('fNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('fornecedores', {nome:n, nif:$('fNif').value, telefone:$('fTel').value, email:$('fEmail').value});
  toast('Cadastrado','success'); closeModal(); openModule('fornecedores');
}
async function renderTransportadoras(){
  const t = await getData('transportadoras');
  const rows = t.map(x=>[
    x.id, '<strong>'+esc(x.nome)+'</strong>', esc(x.telefone||'-'), fmt(x.custoBase),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'transportadoras\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Transportadoras', t.length+' transportadoras','var(--info)',
    '<button class="btn btn-success" onclick="abrirModalTransportadora()"><i class="fas fa-plus"></i> Nova</button>','fa-shipping-fast')+
    '<div class="card">'+table(['#','Nome','Telefone','Custo Base','Ações'],rows)+'</div>';
}
function abrirModalTransportadora(){
  openModal('Nova Transportadora',
    '<div class="form-group"><label>Nome *</label><input id="tNome"></div>'+
    '<div class="form-group"><label>Telefone</label><input id="tTel"></div>'+
    '<div class="form-group"><label>Custo Base (Kz)</label><input id="tCusto" type="number" value="0"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarTransportadora()">Salvar</button>');
}
async function salvarTransportadora(){
  const n = $('tNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('transportadoras', {nome:n, telefone:$('tTel').value, custoBase:num($('tCusto').value,0)});
  toast('Cadastrada','success'); closeModal(); openModule('transportadoras');
}

/* ============================================================
   ESTOQUE / COMPRAS / CRM
   ============================================================ */
async function renderEstoque(){
  const p = await getData('produtos');
  const m = await getData('movimentacoesEstoque');
  const total = p.reduce((s,x)=>s+(x.estoque||0),0);
  const baixo = p.filter(x=>(x.estoque||0)<(x.estoqueMin||10));
  const prodRows = p.map(x=>[
    '<strong>'+esc(x.nome)+'</strong>', '<strong>'+(x.estoque||0)+'</strong>', x.estoqueMin||10,
    badge((x.estoque||0)>=(x.estoqueMin||10)?'OK':((x.estoque||0)>0?'Baixo':'Esgotado'), (x.estoque||0)>=(x.estoqueMin||10)?'success':((x.estoque||0)>0?'warning':'danger')),
    '<button class="btn btn-sm btn-success" onclick="ajustarEstoque('+x.id+',1)"><i class="fas fa-plus"></i></button> '+
    '<button class="btn btn-sm btn-danger" onclick="ajustarEstoque('+x.id+',-1)"><i class="fas fa-minus"></i></button>'
  ]);
  const movRows = m.slice(-30).reverse().map(x=>[
    fmtDT(x.data), badge(x.tipo, x.tipo==='entrada'?'success':(x.tipo==='saida'?'danger':'info')), esc(x.descricao)
  ]);
  return header('Estoque', fmtN(total)+' unidades em '+p.length+' produtos','var(--info)',
    '<button class="btn btn-sm btn-success" onclick="abrirMovEstoque(\'entrada\')"><i class="fas fa-arrow-down"></i> Entrada</button>'+
    '<button class="btn btn-sm btn-danger" onclick="abrirMovEstoque(\'saida\')"><i class="fas fa-arrow-up"></i> Saída</button>'+
    '<button class="btn btn-sm btn-warning" onclick="abrirMovEstoque(\'ajuste\')"><i class="fas fa-edit"></i> Ajuste</button>',
    'fa-warehouse')+
    '<div class="metric-grid">'+
      '<div class="metric-card"><div class="label">Total Itens</div><div class="value">'+fmtN(total)+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">OK</div><div class="value">'+(p.length-baixo.length)+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--danger)"><div class="label">Baixo</div><div class="value">'+baixo.length+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--info)"><div class="label">Movimentações</div><div class="value">'+m.length+'</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-boxes"></i> Produtos</h3></div>'+table(['Produto','Qtd','Mín','Status','Ações'],prodRows)+'</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-history"></i> Movimentações</h3></div>'+table(['Data','Tipo','Descrição'],movRows)+'</div>';
}
async function ajustarEstoque(id, d){
  const p = await DB.get('produtos', id); if(!p) return;
  p.estoque = Math.max(0, (p.estoque||0)+d);
  await saveData('produtos', p);
  await saveData('movimentacoesEstoque', {tipo:d>0?'entrada':'saida', descricao:'Ajuste: '+(d>0?'+':'')+d+' '+p.nome, data:now()});
  pdvCache.ts = 0;
  openModule('estoque');
}
function abrirMovEstoque(tipo){
  DB.getAll('produtos').then(ps=>{
    openModal(tipo.charAt(0).toUpperCase()+tipo.slice(1)+' de Estoque',
      '<div class="form-group"><label>Produto *</label><select id="movProd">'+ps.map(p=>'<option value="'+p.id+'">'+esc(p.nome)+' (Est: '+(p.estoque||0)+')</option>').join('')+'</select></div>'+
      '<div class="form-group"><label>Quantidade *</label><input id="movQtd" type="number" value="1" min="1"></div>'+
      '<div class="form-group"><label>Motivo</label><input id="movObs"></div>'+
      '<button class="btn btn-primary btn-block" onclick="salvarMov(\''+tipo+'\')">Registrar</button>');
  });
}
async function salvarMov(tipo){
  const pid = int($('movProd').value);
  const qtd = int($('movQtd').value,0);
  const obs = $('movObs').value;
  const p = await DB.get('produtos', pid); if(!p) return;
  if(tipo==='entrada') p.estoque = (p.estoque||0)+qtd;
  else if(tipo==='saida'){ if((p.estoque||0)<qtd){ toast('Estoque insuficiente','error'); return; } p.estoque -= qtd; }
  else if(tipo==='ajuste') p.estoque = qtd;
  await saveData('produtos', p);
  await saveData('movimentacoesEstoque', {tipo, descricao:(obs||tipo)+': '+qtd+' '+p.nome, produtoId:pid, qtd, data:now()});
  pdvCache.ts = 0;
  toast('✅ '+tipo+' registrada','success');
  closeModal(); openModule('estoque');
}
async function renderCompras(){
  const c = await getData('compras');
  const rows = c.slice().reverse().map(x=>[
    '#'+x.id, esc(x.fornecedor||'-'), esc(x.produto||'-'), x.quantidade||0, '<strong>'+fmt(x.valor)+'</strong>', fmtDT(x.data),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'compras\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Compras', c.length+' compras','var(--warning)',
    '<button class="btn btn-success" onclick="abrirModalCompra()"><i class="fas fa-plus"></i> Nova</button>','fa-shopping-bag')+
    '<div class="card">'+table(['#','Fornecedor','Produto','Qtd','Valor','Data','Ações'],rows)+'</div>';
}
function abrirModalCompra(){
  DB.getAll('fornecedores').then(fs=>{
    openModal('Nova Compra',
      '<div class="form-grid">'+
        '<div class="form-group full"><label>Fornecedor</label><select id="cForn"><option value="">Selecione...</option>'+fs.map(f=>'<option value="'+esc(f.nome)+'">'+esc(f.nome)+'</option>').join('')+'</select></div>'+
        '<div class="form-group full"><label>Produto</label><input id="cProd"></div>'+
        '<div class="form-group"><label>Qtd</label><input id="cQtd" type="number" value="1"></div>'+
        '<div class="form-group"><label>Valor</label><input id="cValor" type="number" value="0"></div>'+
      '</div><button class="btn btn-primary btn-block" onclick="salvarCompra()">Salvar</button>');
  });
}
async function salvarCompra(){
  const f = $('cForn').value;
  const p = $('cProd').value.trim();
  if(!p){ toast('Informe produto','warning'); return; }
  const q = int($('cQtd').value,1);
  const v = num($('cValor').value,0);
  await saveData('compras', {fornecedor:f, produto:p, quantidade:q, valor:v, data:now(), status:'pendente'});
  const prods = await getData('produtos');
  const match = prods.find(x=>x.nome.toLowerCase()===p.toLowerCase());
  if(match){ match.estoque = (match.estoque||0)+q; await saveData('produtos', match); pdvCache.ts = 0; }
  toast('Compra registrada','success'); closeModal(); openModule('compras');
}
async function renderCRM(){
  const l = await getData('leads');
  const rows = l.map(x=>[
    x.id, '<strong>'+esc(x.nome)+'</strong>', esc(x.telefone||'-'), esc(x.origem||'-'), badge(x.status||'novo','info'),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'leads\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('CRM', l.length+' leads','var(--purple)',
    '<button class="btn btn-success" onclick="abrirModalLead()"><i class="fas fa-plus"></i> Novo Lead</button>','fa-handshake')+
    '<div class="card">'+table(['#','Nome','Telefone','Origem','Status','Ações'],rows)+'</div>';
}
function abrirModalLead(){
  openModal('Novo Lead',
    '<div class="form-group"><label>Nome *</label><input id="lNome"></div>'+
    '<div class="form-group"><label>Telefone</label><input id="lTel"></div>'+
    '<div class="form-group"><label>Email</label><input id="lEmail" type="email"></div>'+
    '<div class="form-group"><label>Origem</label><select id="lOrigem"><option>Site</option><option>WhatsApp</option><option>Facebook</option><option>Indicação</option></select></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarLead()">Salvar</button>');
}
async function salvarLead(){
  const n = $('lNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('leads', {nome:n, telefone:$('lTel').value, email:$('lEmail').value, origem:$('lOrigem').value, status:'novo', data:now()});
  toast('Lead cadastrado','success'); closeModal(); openModule('crm');
}

/* ============================================================
   FINANCEIRO / FISCAL / RH
   ============================================================ */
async function renderFinanceiro(){
  const [rec,pag] = await Promise.all([getData('contasReceber'), getData('contasPagar')]);
  const tR = rec.reduce((s,c)=>s+(c.valor||0),0);
  const tP = pag.reduce((s,c)=>s+(c.valor||0),0);
  const recRows = rec.slice().reverse().map(c=>[
    esc(c.cliente), '<strong>'+fmt(c.valor)+'</strong>', fmtD(c.vencimento), badge(c.status, c.status==='pago'?'success':'warning'),
    (c.status!=='pago'?'<button class="btn btn-sm btn-success" onclick="marcarPago('+c.id+',\'receber\')"><i class="fas fa-check"></i></button> ':'')+
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'contasReceber\','+c.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  const pagRows = pag.slice().reverse().map(c=>[
    esc(c.fornecedor), '<strong>'+fmt(c.valor)+'</strong>', fmtD(c.vencimento), badge(c.status, c.status==='pago'?'success':'warning'),
    (c.status!=='pago'?'<button class="btn btn-sm btn-success" onclick="marcarPago('+c.id+',\'pagar\')"><i class="fas fa-check"></i></button> ':'')+
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'contasPagar\','+c.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Financeiro','Contas a receber e a pagar','var(--success)','','fa-coins')+
    '<div class="metric-grid">'+
      '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">📥 A Receber</div><div class="value" style="color:var(--success)">'+fmt(tR)+'</div><div class="sub">'+rec.length+' contas</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--danger)"><div class="label">📤 A Pagar</div><div class="value" style="color:var(--danger)">'+fmt(tP)+'</div><div class="sub">'+pag.length+' contas</div></div>'+
      '<div class="metric-card"><div class="label">📊 Saldo</div><div class="value">'+fmt(tR-tP)+'</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-hand-holding-heart"></i> A Receber</h3><button class="btn btn-sm btn-success" onclick="abrirModalConta(\'receber\')"><i class="fas fa-plus"></i> Nova</button></div>'+table(['Cliente','Valor','Vencimento','Status','Ações'],recRows)+'</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-file-invoice-dollar"></i> A Pagar</h3><button class="btn btn-sm btn-success" onclick="abrirModalConta(\'pagar\')"><i class="fas fa-plus"></i> Nova</button></div>'+table(['Fornecedor','Valor','Vencimento','Status','Ações'],pagRows)+'</div>';
}
function abrirModalConta(tipo){
  const isR = tipo==='receber';
  openModal(isR?'Nova Conta a Receber':'Nova Conta a Pagar',
    '<div class="form-group"><label>'+(isR?'Cliente':'Fornecedor')+' *</label><input id="ctNome"></div>'+
    '<div class="form-group"><label>Descrição</label><input id="ctDesc"></div>'+
    '<div class="form-group"><label>Valor *</label><input id="ctValor" type="number" value="0"></div>'+
    '<div class="form-group"><label>Vencimento</label><input id="ctVenc" type="date" value="'+new Date(Date.now()+30*86400000).toISOString().slice(0,10)+'"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarConta(\''+tipo+'\')">Salvar</button>');
}
async function salvarConta(tipo){
  const n = $('ctNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  const d = {valor:num($('ctValor').value,0), descricao:$('ctDesc').value, vencimento:$('ctVenc').value, status:'pendente', data:now()};
  if(tipo==='receber'){ d.cliente = n; await saveData('contasReceber', d); }
  else { d.fornecedor = n; await saveData('contasPagar', d); }
  toast('Conta registrada','success'); closeModal(); openModule('financeiro');
}
async function marcarPago(id, tipo){
  const s = tipo==='receber'?'contasReceber':'contasPagar';
  const c = await DB.get(s, id);
  c.status = 'pago'; c.dataPagamento = now();
  await saveData(s, c);
  toast('Marcado pago','success'); openModule('financeiro');
}
async function renderFiscal(){
  const vendas = await getData('vendas');
  const compras = await getData('compras');
  const tV = vendas.reduce((s,v)=>s+(v.total||0),0);
  const tC = compras.reduce((s,c)=>s+(c.valor||0),0);
  const ivaV = vendas.reduce((s,v)=>s+(v.iva||0),0);
  const ivaC = tC * 0.14;
  const irtRows = AGT_CONFIG.irt.faixas.map(f=>[
    fmt(f.min)+' - '+(f.max===Infinity?'∞':fmt(f.max)),
    '<strong>'+(f.taxa*100).toFixed(0)+'%</strong>',
    fmt(f.parcela)
  ]);
  return header('Fiscal AGT','Gestão fiscal — Angola','var(--purple)','','fa-landmark')+
    '<div class="metric-grid">'+
      '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">IVA Vendas</div><div class="value">'+fmt(ivaV)+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--info)"><div class="label">IVA Compras</div><div class="value">'+fmt(ivaC)+'</div></div>'+
      '<div class="metric-card" style="border-left-color:'+((ivaV-ivaC)>=0?'var(--danger)':'var(--success)')+'"><div class="label">Saldo IVA</div><div class="value">'+fmt(Math.abs(ivaV-ivaC))+'</div></div>'+
      '<div class="metric-card"><div class="label">Faturação</div><div class="value">'+fmt(tV)+'</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-percent"></i> Tabela IRT</h3></div>'+table(['Faixa','Taxa','Parcela'],irtRows)+'</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-download"></i> Exportações AGT</h3></div>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
        '<button class="btn btn-success" onclick="exportarSAFTCompleto()"><i class="fas fa-file-code"></i> SAF-T Completo</button>'+
        '<button class="btn btn-info" onclick="exportarIRTDeclaracao()"><i class="fas fa-file-invoice"></i> Declaração IRT</button>'+
        '<button class="btn btn-warning" onclick="exportarIVADeclaracao()"><i class="fas fa-percent"></i> Declaração IVA</button>'+
        '<button class="btn btn-primary" onclick="exportarInventario()"><i class="fas fa-boxes"></i> Inventário</button>'+
      '</div></div>';
}
async function exportarSAFTCompleto(){
  const [vendas,produtos,clientes,emp] = await Promise.all([getData('vendas'),getData('produtos'),getData('clientes'),Promise.resolve(JSON.parse(localStorage.getItem('kanawa_empresa')||'{}'))]);
  const saft = { AuditFile: {
    Header: { AuditFileVersion:'1.0_01', CompanyID:emp.nif||'', TaxRegistrationNumber:emp.nif||'', CompanyName:emp.firma||emp.nome||'', FiscalYear:new Date().getFullYear(), StartDate:new Date(new Date().getFullYear(),0,1).toISOString(), EndDate:now(), CurrencyCode:'AOA', DateCreated:now(), ProductID:'KanawaSoft/ERP' },
    MasterFiles: {
      Customer: clientes.map(c=>({CustomerID:c.id, AccountID:'C'+c.id, CustomerTaxID:c.nif||'', CompanyName:c.nome, BillingAddress:{AddressDetail:c.endereco||'-', City:'Luanda', PostalCode:'0000', Country:'AO'}})),
      Product: produtos.map(p=>({ProductType:'P', ProductCode:p.codigo||'P'+p.id, ProductDescription:p.nome, ProductNumberCode:p.codigoBarras||p.codigo||'', UnitOfMeasure:p.unidade||'UN'}))
    },
    SourceDocuments: { SalesInvoices: { NumberOfEntries:vendas.length, TotalDebit:0, TotalCredit:vendas.reduce((s,v)=>s+(v.total||0),0),
      Invoice: vendas.map(v=>({
        InvoiceNo:v.numeroFatura, DocumentStatus:{InvoiceStatus:'N', InvoiceStatusDate:v.data, SourceID:'KanawaSoft', SourceBilling:'P'},
        Hash:v.hash||'', InvoiceDate:v.data, InvoiceType:'FT', CustomerID:v.clienteNif||'Consumidor Final',
        Line:(v.itens||[]).map((it,i)=>({LineNumber:i+1, ProductCode:it.id?it.id.toString():'P'+i, ProductDescription:it.nome, Quantity:it.qty, UnitPrice:it.preco, CreditAmount:it.subtotal, Tax:{TaxType:'IVA', TaxCountryRegion:'AO', TaxCode:'NOR', TaxPercentage:14}})),
        DocumentTotals:{ TaxPayable:v.iva||0, NetTotal:v.subtotal-(v.descontoValor||0), GrossTotal:v.total||0 }
      }))
    }}
  }};
  const blob = new Blob([JSON.stringify(saft,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'SAFT_'+(emp.nif||'empresa')+'_'+new Date().getFullYear()+'.xml'; a.click();
  URL.revokeObjectURL(url);
  toast('📄 SAF-T completo exportado','success');
}
async function exportarIRTDeclaracao(){
  const funcs = await getData('funcionarios');
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  let csv = 'DECLARAÇÃO IRT - '+(emp.nome||'')+' (NIF: '+(emp.nif||'')+')\nMês: '+new Date().toLocaleDateString('pt-AO',{month:'long',year:'numeric'})+'\n\n';
  csv += 'Nome,Cargo,Salário,IRT,Líquido\n';
  funcs.forEach(f=>{
    const irt = calcIRT(f.salario||0).irt;
    csv += '"'+f.nome+'","'+(f.cargo||'')+'",'+(f.salario||0)+','+irt+','+((f.salario||0)-irt)+'\n';
  });
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IRT_'+new Date().toISOString().slice(0,7)+'.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('📄 IRT gerado','success');
}
async function exportarIVADeclaracao(){
  const vendas = await getData('vendas');
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const ivaV = vendas.reduce((s,v)=>s+(v.iva||0),0);
  const base = vendas.reduce((s,v)=>s+(v.subtotal-(v.descontoValor||0)),0);
  let txt = 'DECLARAÇÃO IVA - '+(emp.nome||'')+' (NIF: '+(emp.nif||'')+')\n';
  txt += 'Período: '+new Date().toLocaleDateString('pt-AO',{month:'long',year:'numeric'})+'\n\n';
  txt += 'Regime: '+(emp.regime||'geral')+'\nMontante Ilíquido: '+fmt(base)+'\nImposto Devido (IVA): '+fmt(ivaV)+'\nIVA a Pagar: '+fmt(ivaV)+'\n\nFaturas: '+vendas.length+'\n';
  const blob = new Blob([txt],{type:'text/plain'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'IVA_'+new Date().toISOString().slice(0,7)+'.txt'; a.click();
  URL.revokeObjectURL(url);
  toast('📄 IVA gerado','success');
}
async function exportarInventario(){
  if(typeof XLSX === 'undefined'){ toast('Excel indisponível','warning'); return; }
  const p = await getData('produtos');
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const ws = XLSX.utils.json_to_sheet(p.map(x=>({Codigo:x.codigo, CodigoBarras:x.codigoBarras, Nome:x.nome, Categoria:x.categoria, Estoque:x.estoque||0, Preco:x.preco, Total:(x.estoque||0)*x.preco})));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
  XLSX.writeFile(wb, 'Inventario_'+(emp.nif||'emp')+'_'+Date.now()+'.xlsx');
  toast('📄 Inventário exportado','success');
}
async function renderRH(){
  const f = await getData('funcionarios');
  const rows = f.map(x=>{
    const irt = calcIRT(x.salario||0).irt;
    return [x.id, '<strong>'+esc(x.nome)+'</strong>', esc(x.cargo||'-'), fmt(x.salario), '<span style="color:var(--danger)">-'+fmt(irt)+'</span>', '<span style="color:var(--success);font-weight:700">'+fmt((x.salario||0)-irt)+'</span>', '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'funcionarios\','+x.id+')"><i class="fas fa-trash"></i></button>'];
  });
  return header('RH — Recursos Humanos', f.length+' funcionários','var(--info)',
    '<button class="btn btn-success" onclick="abrirModalFuncionario()"><i class="fas fa-plus"></i> Novo</button>','fa-user-tie')+
    '<div class="card">'+table(['#','Nome','Cargo','Salário','IRT','Líquido','Ações'],rows)+'</div>';
}
function abrirModalFuncionario(){
  openModal('Novo Funcionário',
    '<div class="form-group"><label>Nome *</label><input id="fnNome"></div>'+
    '<div class="form-group"><label>Cargo</label><input id="fnCargo"></div>'+
    '<div class="form-group"><label>Salário *</label><input id="fnSalario" type="number" value="0"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarFuncionario()">Salvar</button>');
}
async function salvarFuncionario(){
  const n = $('fnNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('funcionarios', {nome:n, cargo:$('fnCargo').value, salario:num($('fnSalario').value,0), dataContratacao:now()});
  toast('Cadastrado','success'); closeModal(); openModule('rh');
}

/* ============================================================
   PROJETOS / TAREFAS / ATIVOS / FROTA / OS / CONTRATOS / DOCS / TICKETS
   ============================================================ */
async function renderProjetos(){
  const p = await getData('projetos');
  const rows = p.map(x=>[
    x.id, '<strong>'+esc(x.nome)+'</strong>', badge(x.status||'ativo','info'),
    '<div style="background:var(--border);height:8px;border-radius:4px;overflow:hidden;width:100px;display:inline-block;vertical-align:middle"><div style="background:var(--success);height:100%;width:'+(x.progresso||0)+'%"></div></div> '+(x.progresso||0)+'%',
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'projetos\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Projetos', p.length+' projetos','var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalProjeto()"><i class="fas fa-plus"></i> Novo</button>','fa-project-diagram')+
    '<div class="card">'+table(['#','Nome','Status','Progresso','Ações'],rows)+'</div>';
}
function abrirModalProjeto(){
  openModal('Novo Projeto',
    '<div class="form-group"><label>Nome *</label><input id="pjNome"></div>'+
    '<div class="form-group"><label>Descrição</label><textarea id="pjDesc" rows="2"></textarea></div>'+
    '<div class="form-group"><label>Progresso (%)</label><input id="pjProg" type="number" value="0" min="0" max="100"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarProjeto()">Salvar</button>');
}
async function salvarProjeto(){
  const n = $('pjNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('projetos', {nome:n, descricao:$('pjDesc').value, progresso:int($('pjProg').value,0), status:'ativo', dataInicio:now()});
  toast('Criado','success'); closeModal(); openModule('projetos');
}
async function renderTarefas(){
  const t = await getData('tarefas');
  const rows = t.map(x=>[
    x.id, '<strong>'+esc(x.titulo)+'</strong>', esc(x.prioridade||'média'), badge(x.status||'pendente', x.status==='concluida'?'success':'warning'), fmtD(x.prazo),
    '<button class="btn btn-sm btn-success" onclick="concluirTarefa('+x.id+')"><i class="fas fa-check"></i></button> '+
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'tarefas\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Tarefas', t.length+' tarefas','var(--purple)',
    '<button class="btn btn-success" onclick="abrirModalTarefa()"><i class="fas fa-plus"></i> Nova</button>','fa-tasks')+
    '<div class="card">'+table(['#','Título','Prioridade','Status','Prazo','Ações'],rows)+'</div>';
}
function abrirModalTarefa(){
  openModal('Nova Tarefa',
    '<div class="form-group"><label>Título *</label><input id="tkTitulo"></div>'+
    '<div class="form-group"><label>Prioridade</label><select id="tkPrior"><option>baixa</option><option selected>média</option><option>alta</option></select></div>'+
    '<div class="form-group"><label>Prazo</label><input id="tkPrazo" type="date" value="'+new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarTarefa()">Salvar</button>');
}
async function salvarTarefa(){
  const n = $('tkTitulo').value.trim();
  if(!n){ toast('Informe título','warning'); return; }
  await saveData('tarefas', {titulo:n, prioridade:$('tkPrior').value, prazo:$('tkPrazo').value, status:'pendente', data:now()});
  toast('Criada','success'); closeModal(); openModule('tarefas');
}
async function concluirTarefa(id){
  const t = await DB.get('tarefas', id);
  if(t){ t.status = 'concluida'; t.dataConclusao = now(); await saveData('tarefas', t); toast('Concluída','success'); openModule('tarefas'); }
}
async function renderAtivos(){
  const a = await getData('ativos');
  const rows = a.map(x=>[
    x.id, '<strong>'+esc(x.nome)+'</strong>', esc(x.patrimonio||'-'), fmt(x.valor),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'ativos\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Ativos', a.length+' ativos','var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalAtivo()"><i class="fas fa-plus"></i> Novo</button>','fa-building')+
    '<div class="card">'+table(['#','Nome','Patrimônio','Valor','Ações'],rows)+'</div>';
}
function abrirModalAtivo(){
  openModal('Novo Ativo',
    '<div class="form-group"><label>Nome *</label><input id="atNome"></div>'+
    '<div class="form-group"><label>Patrimônio</label><input id="atPatr"></div>'+
    '<div class="form-group"><label>Valor</label><input id="atValor" type="number" value="0"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarAtivo()">Salvar</button>');
}
async function salvarAtivo(){
  const n = $('atNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('ativos', {nome:n, patrimonio:$('atPatr').value, valor:num($('atValor').value,0), dataAquisicao:now()});
  toast('Cadastrado','success'); closeModal(); openModule('ativos');
}
async function renderFrota(){
  const f = await getData('frotas');
  const rows = f.map(x=>[
    x.id, '<strong>'+esc(x.placa)+'</strong>', esc(x.modelo), x.ano||'-',
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'frotas\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Frota', f.length+' veículos','var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalVeiculo()"><i class="fas fa-plus"></i> Novo</button>','fa-truck-moving')+
    '<div class="card">'+table(['#','Placa','Modelo','Ano','Ações'],rows)+'</div>';
}
function abrirModalVeiculo(){
  openModal('Novo Veículo',
    '<div class="form-group"><label>Placa *</label><input id="vPlaca"></div>'+
    '<div class="form-group"><label>Modelo *</label><input id="vModelo"></div>'+
    '<div class="form-group"><label>Ano</label><input id="vAno" type="number" value="'+new Date().getFullYear()+'"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarVeiculo()">Salvar</button>');
}
async function salvarVeiculo(){
  const p = $('vPlaca').value.trim();
  const m = $('vModelo').value.trim();
  if(!p || !m){ toast('Preencha placa e modelo','warning'); return; }
  await saveData('frotas', {placa:p, modelo:m, ano:int($('vAno').value), status:'ativo'});
  toast('Cadastrado','success'); closeModal(); openModule('frota');
}
async function renderOS(){
  const o = await getData('ordensServico');
  const rows = o.map(x=>[
    '#'+x.id, esc(x.cliente), esc(x.descricao||'-'), badge(x.status||'aberta','warning'),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'ordensServico\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Ordens de Serviço', o.length+' OS','var(--danger)',
    '<button class="btn btn-success" onclick="abrirModalOS()"><i class="fas fa-plus"></i> Nova</button>','fa-clipboard-list')+
    '<div class="card">'+table(['#','Cliente','Descrição','Status','Ações'],rows)+'</div>';
}
function abrirModalOS(){
  openModal('Nova OS',
    '<div class="form-group"><label>Cliente *</label><input id="osCliente"></div>'+
    '<div class="form-group"><label>Descrição</label><textarea id="osDesc" rows="2"></textarea></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarOS()">Salvar</button>');
}
async function salvarOS(){
  const c = $('osCliente').value.trim();
  if(!c){ toast('Informe cliente','warning'); return; }
  await saveData('ordensServico', {cliente:c, descricao:$('osDesc').value, status:'aberta', data:now()});
  toast('Criada','success'); closeModal(); openModule('os');
}
async function renderContratos(){
  const c = await getData('contratos');
  const rows = c.map(x=>[
    x.id, esc(x.cliente), fmt(x.valor), fmtD(x.inicio), fmtD(x.fim),
    badge(x.status||'ativo', x.status==='ativo'?'success':'warning'),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'contratos\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Contratos', c.length+' contratos','var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalContrato()"><i class="fas fa-plus"></i> Novo</button>','fa-file-contract')+
    '<div class="card">'+table(['#','Cliente','Valor','Início','Fim','Status','Ações'],rows)+'</div>';
}
function abrirModalContrato(){
  openModal('Novo Contrato',
    '<div class="form-group"><label>Cliente *</label><input id="ctContNome"></div>'+
    '<div class="form-group"><label>Valor *</label><input id="ctContValor" type="number" value="0"></div>'+
    '<div class="form-group"><label>Início</label><input id="ctContIni" type="date" value="'+new Date().toISOString().slice(0,10)+'"></div>'+
    '<div class="form-group"><label>Fim</label><input id="ctContFim" type="date" value="'+new Date(Date.now()+365*86400000).toISOString().slice(0,10)+'"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarContrato()">Salvar</button>');
}
async function salvarContrato(){
  const c = $('ctContNome').value.trim();
  if(!c){ toast('Informe cliente','warning'); return; }
  await saveData('contratos', {cliente:c, valor:num($('ctContValor').value,0), inicio:$('ctContIni').value, fim:$('ctContFim').value, status:'ativo'});
  toast('Criado','success'); closeModal(); openModule('contratos');
}
async function renderDocumentos(){
  const d = await getData('documentos');
  const rows = d.map(x=>[
    x.id, esc(x.nome), esc(x.tipo||'-'), fmtD(x.data),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'documentos\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Documentos', d.length+' documentos','var(--primary)',
    '<button class="btn btn-success" onclick="abrirModalDocumento()"><i class="fas fa-plus"></i> Novo</button>','fa-folder-open')+
    '<div class="card">'+table(['#','Nome','Tipo','Data','Ações'],rows)+'</div>';
}
function abrirModalDocumento(){
  openModal('Novo Documento',
    '<div class="form-group"><label>Nome *</label><input id="docNome"></div>'+
    '<div class="form-group"><label>Tipo</label><select id="docTipo"><option>Fatura</option><option>Contrato</option><option>Recibo</option><option>Outro</option></select></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarDocumento()">Salvar</button>');
}
async function salvarDocumento(){
  const n = $('docNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('documentos', {nome:n, tipo:$('docTipo').value, data:now()});
  toast('Salvo','success'); closeModal(); openModule('documentos');
}
async function renderTickets(){
  const t = await getData('tickets');
  const rows = t.map(x=>[
    '#'+x.id, esc(x.titulo), esc(x.cliente||'-'), badge(x.prioridade||'normal','info'), badge(x.status||'aberto', x.status==='resolvido'?'success':'warning'),
    '<button class="btn btn-sm btn-success" onclick="resolverTicket('+x.id+')"><i class="fas fa-check"></i></button> '+
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'tickets\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Tickets de Suporte', t.length+' tickets','var(--danger)',
    '<button class="btn btn-success" onclick="abrirModalTicket()"><i class="fas fa-plus"></i> Novo</button>','fa-ticket-alt')+
    '<div class="card">'+table(['#','Título','Cliente','Prioridade','Status','Ações'],rows)+'</div>';
}
function abrirModalTicket(){
  openModal('Novo Ticket',
    '<div class="form-group"><label>Título *</label><input id="tkTTitulo"></div>'+
    '<div class="form-group"><label>Cliente</label><input id="tkTCliente"></div>'+
    '<div class="form-group"><label>Descrição</label><textarea id="tkTDesc" rows="3"></textarea></div>'+
    '<div class="form-group"><label>Prioridade</label><select id="tkTPrior"><option>baixa</option><option selected>normal</option><option>alta</option><option>urgente</option></select></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarTicket()">Abrir Ticket</button>');
}
async function salvarTicket(){
  const n = $('tkTTitulo').value.trim();
  if(!n){ toast('Informe título','warning'); return; }
  await saveData('tickets', {titulo:n, cliente:$('tkTCliente').value, descricao:$('tkTDesc').value, prioridade:$('tkTPrior').value, status:'aberto', data:now()});
  toast('Ticket criado','success'); closeModal(); openModule('tickets');
}
async function resolverTicket(id){
  const t = await DB.get('tickets', id);
  if(t){ t.status = 'resolvido'; t.dataResolucao = now(); await saveData('tickets', t); toast('Resolvido','success'); openModule('tickets'); }
}

/* ============================================================
   VENDAS / ORÇAMENTOS / ECOMMERCE
   ============================================================ */
async function renderVendas(){
  const v = await getData('vendas');
  const d = await getData('devolucoes');
  const rows = v.slice().reverse().map(x=>[
    '<strong>'+esc(x.numeroFatura||'#'+x.id)+'</strong>', esc(x.clienteNome||'-'), '<strong>'+fmt(x.total)+'</strong>', esc(x.pagamento||'-'),
    badge(x.status||'-','success'), fmtDT(x.data),
    '<button class="btn btn-sm btn-info" onclick="verFatura('+x.id+')"><i class="fas fa-eye"></i></button>'+
    (podeFazer('excluir')?' <button class="btn btn-sm btn-danger" onclick="excluirItem(\'vendas\','+x.id+')"><i class="fas fa-trash"></i></button>':'')
  ]);
  const devRows = d.slice().reverse().map(x=>[
    esc(x.vendaNumero||'-'), esc(x.cliente||'-'), esc(x.motivo||'-'), fmt(x.total), fmtDT(x.data)
  ]);
  return header('Vendas', v.length+' vendas | '+d.length+' devoluções','var(--primary)',
    '<button class="btn btn-success" onclick="openModule(\'pdv\')"><i class="fas fa-plus"></i> Nova</button>','fa-receipt')+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-list"></i> Vendas</h3></div>'+table(['Nº','Cliente','Total','Pagamento','Status','Data','Ações'],rows)+'</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-undo-alt"></i> Devoluções</h3></div>'+table(['Venda','Cliente','Motivo','Total','Data'],devRows)+'</div>';
}
async function verFatura(id){ const v = await DB.get('vendas', id); if(v) abrirFatura(v); }
async function renderOrcamentos(){
  const o = await getData('orcamentos');
  const rows = o.map(x=>[
    x.id, esc((x.cliente&&x.cliente.nome)||'-'), (x.carrinho||[]).length, '<strong>'+fmt(x.total)+'</strong>', badge(x.status||'pendente','warning'),
    '<button class="btn btn-sm btn-success" onclick="converterOrcamento('+x.id+')"><i class="fas fa-arrow-right"></i></button> '+
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'orcamentos\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Orçamentos', o.length+' orçamentos','var(--info)','','fa-file-invoice')+
    '<div class="card">'+table(['#','Cliente','Itens','Total','Status','Ações'],rows)+'</div>';
}
async function converterOrcamento(id){
  const o = await DB.get('orcamentos', id); if(!o) return;
  pdvState.carrinho = o.carrinho || [];
  pdvState.cliente = o.cliente || {nome:'Cliente Anônimo',nif:'',telefone:''};
  pdvState.desconto = o.desconto || 0;
  toast('Orçamento carregado no PDV','success');
  openModule('pdv');
}
async function renderEcommerce(){
  const p = await getData('produtos');
  const promo = await getData('promocoes');
  const cards = p.map(x=>{
    const pub = x.publicado !== false;
    return '<div class="pdv-prod-card"><div class="img"><img src="'+imgSrc(x)+'" onerror="this.onerror=null;this.src=\''+PLACEHOLDER+'\'"></div>'+
      '<div class="info"><div class="name">'+esc(x.nome)+'</div><div class="price">'+fmt(x.preco)+'</div><div class="stock">'+esc(x.categoria||'')+'</div>'+
      '<div style="margin-top:8px;display:flex;gap:4px;justify-content:center">'+
      '<button class="btn btn-sm btn-primary" onclick="abrirModalProduto('+x.id+')"><i class="fas fa-edit"></i></button>'+
      '<button class="btn btn-sm '+(pub?'btn-success':'btn-secondary')+'" onclick="togglePublicado('+x.id+')"><i class="fas fa-'+(pub?'eye':'eye-slash')+'"></i></button>'+
      '</div></div></div>';
  }).join('');
  return header('E-commerce','Loja virtual e catálogo','var(--success)',
    '<button class="btn btn-success" onclick="abrirModalPromocao()"><i class="fas fa-percent"></i> Nova Promoção</button>','fa-store')+
    '<div class="metric-grid">'+
      '<div class="metric-card"><div class="label">Publicados</div><div class="value">'+p.filter(x=>x.publicado!==false).length+'</div><div class="sub">de '+p.length+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--warning)"><div class="label">Promoções</div><div class="value">'+promo.length+'</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-box"></i> Catálogo</h3></div><div class="pdv-products-grid">'+cards+'</div></div>';
}
async function togglePublicado(id){
  const p = await DB.get('produtos', id);
  p.publicado = p.publicado === false ? true : false;
  await saveData('produtos', p);
  openModule('ecommerce');
}
function abrirModalPromocao(){
  openModal('Nova Promoção',
    '<div class="form-group"><label>Nome *</label><input id="prNome"></div>'+
    '<div class="form-group"><label>Desconto (%)</label><input id="prDesc" type="number" value="10"></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarPromocao()">Salvar</button>');
}
async function salvarPromocao(){
  const n = $('prNome').value.trim();
  if(!n){ toast('Informe nome','warning'); return; }
  await saveData('promocoes', {nome:n, desconto:num($('prDesc').value,0), data:now()});
  toast('Criada','success'); closeModal(); openModule('ecommerce');
}

/* ============================================================
   RELATÓRIOS / USUÁRIOS / AUDITORIA / MÓDULOS
   ============================================================ */
async function renderRelatorios(){
  const [vendas,produtos,clientes] = await Promise.all([getData('vendas'),getData('produtos'),getData('clientes')]);
  const tV = vendas.reduce((s,v)=>s+(v.total||0),0);
  return header('Relatórios','Análise e exportação','var(--primary)','','fa-chart-bar')+
    '<div class="metric-grid">'+
      '<div class="metric-card"><div class="label">Total Vendas</div><div class="value">'+vendas.length+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--success)"><div class="label">Faturamento</div><div class="value">'+fmt(tV)+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--info)"><div class="label">Ticket Médio</div><div class="value">'+(vendas.length?fmt(tV/vendas.length):fmt(0))+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--warning)"><div class="label">Produtos</div><div class="value">'+produtos.length+'</div></div>'+
      '<div class="metric-card" style="border-left-color:var(--purple)"><div class="label">Clientes</div><div class="value">'+clientes.length+'</div></div>'+
    '</div>'+
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-download"></i> Exportar</h3></div>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
        '<button class="btn btn-success" onclick="exportarBackupCompleto()"><i class="fas fa-database"></i> Backup JSON</button>'+
        '<button class="btn btn-info" onclick="exportarVendasCSV()"><i class="fas fa-file-csv"></i> Vendas CSV</button>'+
        '<button class="btn btn-primary" onclick="exportarProdutos()"><i class="fas fa-file-excel"></i> Produtos Excel</button>'+
      '</div></div>';
}
async function exportarBackupCompleto(){
  const data = {};
  for(const s of DB.stores){ try { data[s] = await DB.getAll(s); } catch(e){ data[s] = []; } }
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'kanawa_backup_'+Date.now()+'.json'; a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado','success');
}
async function exportarVendasCSV(){
  const vendas = await getData('vendas');
  let csv = 'Nº,Cliente,Total,Pagamento,Status,Data\n';
  vendas.forEach(v=>{ csv += '"'+(v.numeroFatura||v.id)+'","'+(v.clienteNome||'')+'",'+v.total+','+(v.pagamento||'')+','+(v.status||'')+','+v.data+'\n'; });
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'vendas_'+Date.now()+'.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado','success');
}
async function renderUsuarios(){
  if(!podeAcessar('usuarios')) return '<div class="card"><h3>Sem permissão</h3></div>';
  const u = await getData('usuarios');
  const rows = u.map(x=>[
    x.id, '<strong>'+esc(x.nome)+'</strong>', esc(x.email), badge(x.perfil||'operador','primary'),
    badge(x.ativo!==false?'Ativo':'Inativo', x.ativo!==false?'success':'danger'),
    '<button class="btn btn-sm btn-danger" onclick="excluirItem(\'usuarios\','+x.id+')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Usuários', u.length+' usuários','var(--danger)',
    '<button class="btn btn-success" onclick="abrirModalUsuario()"><i class="fas fa-plus"></i> Novo</button>','fa-user-shield')+
    '<div class="card">'+table(['#','Nome','Email','Perfil','Status','Ações'],rows)+'</div>';
}
function abrirModalUsuario(){
  openModal('Novo Usuário',
    '<div class="form-group"><label>Nome *</label><input id="uNome"></div>'+
    '<div class="form-group"><label>Email *</label><input id="uEmail" type="email"></div>'+
    '<div class="form-group"><label>Senha *</label><input id="uSenha" type="password" minlength="6"></div>'+
    '<div class="form-group"><label>Perfil</label><select id="uPerfil"><option value="admin">Administrador</option><option value="gerente">Gerente</option><option value="operador">Operador</option><option value="caixa">Operador de Caixa</option></select></div>'+
    '<button class="btn btn-primary btn-block" onclick="salvarUsuario()">Salvar</button>');
}
async function salvarUsuario(){
  const n = $('uNome').value.trim(), e = $('uEmail').value.trim(), s = $('uSenha').value;
  if(!n || !e || s.length<6){ toast('Preencha todos os campos','warning'); return; }
  await saveData('usuarios', {nome:n, email:e, senha:s, perfil:$('uPerfil').value, ativo:true, dataCriacao:now()});
  toast('Usuário criado','success'); closeModal(); openModule('usuarios');
}
async function renderAuditoria(){
  if(!podeAcessar('auditoria')) return '<div class="card"><h3>Sem permissão</h3></div>';
  const a = await getData('auditoria');
  const rows = a.slice(-100).reverse().map(x=>[
    fmtDT(x.data), esc(x.usuario||'-'), badge(x.acao,'info'), esc(x.modulo),
    '<small>'+esc((JSON.stringify(x.detalhes)||'').slice(0,60))+'...</small>'
  ]);
  return header('Auditoria', a.length+' registros','var(--purple)','','fa-history')+
    '<div class="card">'+table(['Data','Usuário','Ação','Módulo','Detalhes'],rows)+'</div>';
}
async function registrarAuditoria(acao, modulo, detalhes){
  const u = JSON.parse(localStorage.getItem('kanawa_user')||'{}');
  await saveData('auditoria', {acao, modulo, detalhes, usuario:u.nome||'Admin', data:now()});
}
async function renderModulos(){
  const rows = MENU.map((m,i)=>[
    i+1, '<i class="fas '+m.icon+'" style="font-size:1.3rem;color:var(--primary)"></i>',
    '<code>'+m.id+'</code>', '<strong>'+m.label+'</strong>',
    badge(podeAcessar(m.id)?'Acessível':'Bloqueado', podeAcessar(m.id)?'success':'danger')
  ]);
  return header('Módulos', MENU.length+' módulos','var(--purple)','','fa-code')+
    '<div class="card">'+table(['#','Ícone','ID','Nome','Status'],rows)+'</div>';
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
async function renderConfig(){
  if(!podeAcessar('config')) return '<div class="card"><h3>Sem permissão</h3></div>';
  const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const regras = JSON.parse(localStorage.getItem('kanawa_regras')||'{}');
  const logoPreview = (emp.logo && emp.logo.indexOf('data:') === 0) ? emp.logo : 'logo.png';
  const counts = {};
  for(const s of DB.stores){ try { counts[s] = await DB.count(s); } catch(e){ counts[s] = 0; } }
  const countRows = Object.entries(counts).map(([k,v])=>[
    '<code>'+k+'</code>', badge(v,'info'),
    '<button class="btn btn-sm btn-danger" onclick="limparColecao(\''+k+'\')"><i class="fas fa-trash"></i></button>'
  ]);
  return header('Configurações','Definições completas do sistema','var(--primary)','','fa-cog')+
    // EMPRESA
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-building"></i> Dados da Empresa</h3></div>'+
      '<div class="form-grid">'+
        '<div class="form-group full"><label>Nome da Firma / Razão Social *</label><input id="cfgFirma" value="'+esc(emp.firma||emp.nome||'')+'" placeholder="Ex: KANAWA SOFT, LDA"></div>'+
        '<div class="form-group full"><label>Nome Comercial (opcional)</label><input id="cfgNome" value="'+esc(emp.nome||'')+'" placeholder="Ex: Kanawa Soft"></div>'+
        '<div class="form-group"><label>NIF *</label><input id="cfgNif" value="'+esc(emp.nif||'')+'"></div>'+
        '<div class="form-group"><label>Nº Alvará</label><input id="cfgAlvara" value="'+esc(emp.alvara||'')+'"></div>'+
        '<div class="form-group"><label>Regime Fiscal</label><select id="cfgRegime">'+
          '<option value="geral" '+(emp.regime==='geral'?'selected':'')+'>Geral (IVA 14%)</option>'+
          '<option value="simplificado" '+(emp.regime==='simplificado'?'selected':'')+'>Simplificado (7%)</option>'+
          '<option value="isento" '+(emp.regime==='isento'?'selected':'')+'>Isento</option></select></div>'+
        '<div class="form-group"><label>Telefone</label><input id="cfgTel" value="'+esc(emp.telefone||'')+'"></div>'+
        '<div class="form-group"><label>Email</label><input id="cfgEmail" value="'+esc(emp.email||'')+'"></div>'+
        '<div class="form-group full"><label>Endereço Completo</label><input id="cfgEnd" value="'+esc(emp.endereco||'')+'"></div>'+
        '<div class="form-group"><label>Website</label><input id="cfgSite" value="'+esc(emp.website||'')+'"></div>'+
        '<div class="form-group"><label>Banco</label><input id="cfgBanco" value="'+esc(emp.banco||'')+'"></div>'+
        '<div class="form-group full"><label>IBAN</label><input id="cfgIban" value="'+esc(emp.iban||'')+'"></div>'+
        '<div class="form-group full"><label>🖼️ Logo da Empresa (usado na fatura)</label>'+
          '<div class="image-picker" onclick="document.getElementById(\'cfgLogoInput\').click()" style="height:160px">'+
            '<div class="placeholder" id="cfgLogoPlaceholder" style="'+(emp.logo&&emp.logo.indexOf('data:')===0?'display:none':'')+'"><i class="fas fa-image"></i><span style="font-size:.85rem">Clique para escolher a imagem</span></div>'+
            '<img id="cfgLogoPreview" src="'+logoPreview+'" style="'+(emp.logo&&emp.logo.indexOf('data:')===0?'':'display:none')+'" onerror="this.style.display=\'none\'">'+
          '</div>'+
          '<input type="file" id="cfgLogoInput" accept="image/*" style="display:none" onchange="escolherLogoEmpresa(this)">'+
          '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
            '<button class="btn btn-sm btn-secondary" type="button" onclick="document.getElementById(\'cfgLogoInput\').click()"><i class="fas fa-folder-open"></i> Escolher imagem</button>'+
            '<button class="btn btn-sm btn-danger" type="button" onclick="removerLogoEmpresa()"><i class="fas fa-undo"></i> Restaurar logo.png</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-success btn-lg" style="margin-top:16px" onclick="salvarConfigEmpresa()"><i class="fas fa-save"></i> Salvar Empresa</button></div>'+
    // REGRAS
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-sliders-h"></i> Regras do Sistema</h3></div>'+
      '<div class="form-grid">'+
        '<div class="form-group"><label><input type="checkbox" id="cfgAplicarIVA" '+(regras.aplicarIVA!==false?'checked':'')+'> Aplicar IVA automaticamente</label></div>'+
        '<div class="form-group"><label><input type="checkbox" id="cfgAplicarIRT" '+(regras.aplicarIRT?'checked':'')+'> Calcular IRT</label></div>'+
        '<div class="form-group"><label><input type="checkbox" id="cfgControlarEstoque" '+(regras.controlarEstoque!==false?'checked':'')+'> Controlar estoque</label></div>'+
        '<div class="form-group"><label><input type="checkbox" id="cfgEmitirFatura" '+(regras.emitirFatura!==false?'checked':'')+'> Emitir fatura</label></div>'+
        '<div class="form-group"><label><input type="checkbox" id="cfgCredito" '+(regras.credito!==false?'checked':'')+'> Permitir crédito</label></div>'+
        '<div class="form-group"><label><input type="checkbox" id="cfgGavetaAuto" '+(localStorage.getItem('kanawa_gaveta_auto')!=='false'?'checked':'')+'> Abrir gaveta automaticamente</label></div>'+
        '<div class="form-group"><label>Estoque Mínimo Padrão</label><input type="number" id="cfgEstMin" value="'+(regras.estoqueMin||10)+'"></div>'+
        '<div class="form-group"><label>Desconto Máximo (%)</label><input type="number" id="cfgDescMax" value="'+(regras.descontoMax||50)+'"></div>'+
      '</div>'+
      '<button class="btn btn-success btn-lg" style="margin-top:16px" onclick="salvarRegras()"><i class="fas fa-save"></i> Salvar Regras</button></div>'+
    // SERVIDOR
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-server"></i> Servidor (Opcional)</h3></div>'+
      '<p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px">O sistema funciona 100% offline. Configure para compartilhar dados com outras telas/dispositivos.</p>'+
      '<div class="form-grid">'+
        '<div class="form-group full"><label>URL do Servidor</label><input id="cfgApiUrl" value="'+esc(localStorage.getItem('kanawa_api_url')||'http://localhost:3000/api')+'"></div>'+
        '<div class="form-group"><label>Status</label><div style="padding:10px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+(API_ONLINE?'#4ade80':'#f87171')+';margin-right:6px"></span>'+(API_ONLINE?'Conectado':'Desconectado')+'</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'+
        '<button class="btn btn-success" onclick="salvarConfigAPI()"><i class="fas fa-save"></i> Salvar URL</button>'+
        '<button class="btn btn-primary" onclick="testarAPI()"><i class="fas fa-check"></i> Testar</button>'+
        '<button class="btn btn-info" onclick="syncNow(true)"><i class="fas fa-sync"></i> Sincronizar Agora</button>'+
      '</div></div>'+
    // BANCO
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-database"></i> Banco Local (IndexedDB)</h3></div>'+
      table(['Coleção','Registros','Ações'],countRows)+'</div>'+
    // FERRAMENTAS
    '<div class="card"><div class="card-header"><h3 class="card-title"><i class="fas fa-tools"></i> Ferramentas</h3></div>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
        '<button class="btn btn-warning" onclick="recarregarDemo()"><i class="fas fa-seedling"></i> Dados Demo</button>'+
        '<button class="btn btn-info" onclick="exportarBackupCompleto()"><i class="fas fa-download"></i> Backup</button>'+
        '<button class="btn btn-danger" onclick="resetTotal()"><i class="fas fa-bomb"></i> Reset Total</button>'+
      '</div></div>';
}
function salvarConfigEmpresa(){
  const empAtual = JSON.parse(localStorage.getItem('kanawa_empresa')||'{}');
  const logoAtual = empAtual.logo || 'logo.png';
  const logoNovo = localStorage.getItem('kanawa_logo_temp') || logoAtual;
  const e = {
    firma:$('cfgFirma').value,
    nome:$('cfgNome').value,
    nif:$('cfgNif').value,
    alvara:$('cfgAlvara').value,
    regime:$('cfgRegime').value,
    telefone:$('cfgTel').value,
    email:$('cfgEmail').value,
    endereco:$('cfgEnd').value,
    website:$('cfgSite').value,
    banco:$('cfgBanco').value,
    iban:$('cfgIban').value,
    logo: logoNovo
  };
  localStorage.setItem('kanawa_empresa', JSON.stringify(e));
  localStorage.removeItem('kanawa_logo_temp');
  aplicarLogo();
  $('topbarEmpresa').textContent = e.firma || e.nome || 'Kanawa Soft';
  toast('✅ Empresa atualizada','success');
}
function escolherLogoEmpresa(input){
  const file = input.files[0]; if(!file) return;
  if(file.size > 2*1024*1024){ toast('Imagem muito grande (máx 2MB)','warning'); return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    const url = e.target.result;
    const prev = $('cfgLogoPreview'); const ph = $('cfgLogoPlaceholder');
    if(prev){ prev.src = url; prev.style.display = 'block'; }
    if(ph) ph.style.display = 'none';
    localStorage.setItem('kanawa_logo_temp', url);
    toast('✅ Logo carregada — clique em Salvar','success');
  };
  reader.readAsDataURL(file);
}
function removerLogoEmpresa(){
  localStorage.removeItem('kanawa_logo_temp');
  const prev = $('cfgLogoPreview'); const ph = $('cfgLogoPlaceholder');
  if(prev){ prev.src = 'logo.png'; prev.style.display = 'none'; }
  if(ph) ph.style.display = 'block';
  toast('Logo restaurada para logo.png','info');
}
function salvarRegras(){
  const r = {aplicarIVA:$('cfgAplicarIVA').checked, aplicarIRT:$('cfgAplicarIRT').checked, controlarEstoque:$('cfgControlarEstoque').checked, emitirFatura:$('cfgEmitirFatura').checked, credito:$('cfgCredito').checked, estoqueMin:int($('cfgEstMin').value,10), descontoMax:int($('cfgDescMax').value,50)};
  localStorage.setItem('kanawa_regras', JSON.stringify(r));
  localStorage.setItem('kanawa_gaveta_auto', $('cfgGavetaAuto').checked ? 'true' : 'false');
  toast('✅ Regras salvas','success');
}
function salvarConfigAPI(){
  localStorage.setItem('kanawa_api_url', $('cfgApiUrl').value);
  toast('URL salva — recarregando...','success');
  setTimeout(()=>location.reload(), 800);
}
async function testarAPI(){
  const ok = await API.checkHealth();
  toast(ok?'✅ Servidor Online':'❌ Servidor Offline', ok?'success':'warning');
}
async function limparColecao(s){
  if(!confirm('Limpar '+s+'?')) return;
  await DB.clear(s);
  toast('Limpo','info'); openModule('config');
}
async function recarregarDemo(){
  if(!confirm('Carregar demo?')) return;
  await seedDemo();
  pdvCache.ts = 0;
  toast('Demo carregado','success'); openModule('config');
}
async function resetTotal(){
  if(!confirm('⚠️ APAGAR TODOS OS DADOS?')) return;
  if(!confirm('Confirme novamente')) return;
  for(const s of DB.stores){ try { await DB.clear(s); } catch(e){} }
  localStorage.clear();
  location.reload();
}

/* ============================================================
   SETUP / AUTH
   ============================================================ */
function setupNextStep(s){
  if(setupStep===1){ const n=$('setupNome').value.trim(); const nif=$('setupNif').value.trim(); if(!n||!nif){ toast('Preencha nome e NIF','warning'); return; } }
  if(setupStep===2){ const n=$('setupAdminNome').value.trim(); const e=$('setupAdminEmail').value.trim(); const p=$('setupAdminSenha').value; if(!n||!e||p.length<6){ toast('Preencha todos os campos','warning'); return; } }
  if(s===3){
    $('setupResumo').innerHTML =
      '<div><strong>🏢 Empresa:</strong> '+esc($('setupNome').value)+'</div>'+
      '<div><strong>📋 NIF:</strong> '+esc($('setupNif').value)+'</div>'+
      '<div><strong>👤 Admin:</strong> '+esc($('setupAdminNome').value)+'</div>';
  }
  const prev = $('setupStep'+setupStep), next = $('setupStep'+s);
  if(prev) prev.style.display = 'none';
  if(next) next.style.display = 'block';
  $$('.setup-step').forEach(el=>{
    const x = parseInt(el.dataset.step);
    el.classList.toggle('active', x===s);
    el.classList.toggle('done', x<s);
  });
  setupStep = s;
}
async function finalizarSetup(){
  const e = {id:1, firma:$('setupNome').value.trim(), nome:$('setupNome').value.trim(), nif:$('setupNif').value.trim(), regime:$('setupRegime').value, telefone:$('setupTelefone').value, email:$('setupEmail').value, endereco:$('setupEndereco').value, logo:'logo.png', dataCriacao:now()};
  const u = {id:1, nome:$('setupAdminNome').value.trim(), email:$('setupAdminEmail').value.trim(), senha:$('setupAdminSenha').value, perfil:$('setupAdminPerfil').value, ativo:true, dataCriacao:now()};
  await DB.add('empresas', e);
  await DB.add('usuarios', u);
  localStorage.setItem('kanawa_empresa', JSON.stringify(e));
  localStorage.setItem('kanawa_user', JSON.stringify({nome:u.nome, email:u.email, role:u.perfil}));
  localStorage.setItem('kanawa_setup_done', 'true');
  if($('setupCarregarDemo').checked) await seedDemo();
  aplicarLogo();
  $('setupWizard').classList.remove('active');
  $('authScreen').classList.add('active');
  $('loginEmail').value = u.email;
  toast('✅ Empresa configurada','success');
}
function logout(){
  if(!confirm('Sair?')) return;
  localStorage.removeItem('kanawa_user');
  $('app').classList.remove('active');
  $('authScreen').classList.add('active');
}

/* ============================================================
   NOTIFICAÇÕES
   ============================================================ */
async function criarNotificacao(titulo, mensagem, tipo, modulo){
  const n = {titulo, mensagem, tipo:tipo||'info', modulo:modulo||null, data:now(), lida:false};
  await saveData('notificacoes', n);
  updateNotifBadge();
  toast(titulo, tipo||'info');
}
function updateNotifBadge(){
  DB.getAll('notificacoes').then(n=>{
    const c = n.filter(x=>!x.lida).length;
    const b = $('notifBadge');
    if(b){ b.style.display = c>0?'inline':'none'; b.textContent = c; }
  }).catch(()=>{});
}
async function renderNotificacoes(){
  const notifs = await getData('notificacoes');
  const naoLidas = notifs.filter(n=>!n.lida).length;
  const rows = notifs.slice().reverse().map(n =>
    '<div style="padding:14px;background:var(--bg);border-radius:10px;margin-bottom:10px;border-left:4px solid var(--'+(n.tipo||'info')+');'+(n.lida?'opacity:.6':'')+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">'+
        '<div style="flex:1"><div style="font-weight:700">'+esc(n.titulo)+'</div>'+
        '<div style="font-size:.85rem;color:var(--text-muted);margin-top:4px">'+esc(n.mensagem)+'</div>'+
        '<div style="font-size:.72rem;color:var(--text-muted);margin-top:6px">'+fmtDT(n.data)+'</div></div>'+
        (!n.lida?'<button class="btn btn-sm btn-success" onclick="marcarNotificacaoLida('+n.id+')"><i class="fas fa-check"></i></button>':'')+
      '</div></div>'
  ).join('');
  return header('Notificações', notifs.length+' total • '+naoLidas+' não lidas','var(--primary)',
    '<button class="btn btn-sm" onclick="marcarTodasLidas()" style="background:rgba(255,255,255,.2);color:#fff"><i class="fas fa-check-double"></i> Marcar lidas</button>',
    'fa-bell')+
    '<div class="card">'+(rows||emptyState('fa-bell-slash','Sem notificações'))+'</div>';
}
async function marcarNotificacaoLida(id){
  const n = await DB.get('notificacoes', id);
  if(n){ n.lida = true; await saveData('notificacoes', n); updateNotifBadge(); openModule('notificacoes'); }
}
async function marcarTodasLidas(){
  const all = await DB.getAll('notificacoes');
  for(const n of all){ n.lida = true; await DB.put('notificacoes', n); }
  updateNotifBadge();
  openModule('notificacoes');
}

/* ============================================================
   EXCLUIR ITEM GENÉRICO
   ============================================================ */
async function excluirItem(store, id, modulo){
  if(!confirm('Excluir registro?')) return;
  await deleteData(store, id);
  toast('Excluído','info');
  pdvCache.ts = 0;
  openModule(modulo || currentModule);
}

/* ============================================================
   SEED
   ============================================================ */
async function seedDemo(){
  if((await DB.count('produtos'))>0) return;
  const produtos = [
    {codigo:'P001',codigoBarras:'7501234567890',nome:'Caneta Esferográfica',preco:150,estoque:50,estoqueMin:10,categoria:'Papelaria'},
    {codigo:'P002',codigoBarras:'7501234567891',nome:'Caderno 100 Folhas',preco:450,estoque:30,estoqueMin:5,categoria:'Papelaria'},
    {codigo:'P003',codigoBarras:'7501234567892',nome:'Mochila Escolar',preco:2500,estoque:15,estoqueMin:3,categoria:'Acessórios'},
    {codigo:'P004',codigoBarras:'7501234567893',nome:'Calculadora Científica',preco:1200,estoque:8,estoqueMin:2,categoria:'Eletrônicos'},
    {codigo:'P005',codigoBarras:'7501234567894',nome:'Fita Adesiva',preco:80,estoque:100,estoqueMin:20,categoria:'Papelaria'},
    {codigo:'P006',codigoBarras:'7501234567895',nome:'Pasta Arquivo',preco:200,estoque:25,estoqueMin:5,categoria:'Papelaria'}
  ];
  for(const p of produtos) await DB.add('produtos', p);
  await DB.add('clientes', {nome:'João Silva', nif:'006518595L', telefone:'+244 900 000 001', email:'joao@email.com', dataCadastro:now()});
  await DB.add('clientes', {nome:'Maria Santos', telefone:'+244 900 000 002', email:'maria@email.com', dataCadastro:now()});
  await DB.add('categorias', {nome:'Papelaria', descricao:'Materiais de escritório'});
  await DB.add('categorias', {nome:'Eletrônicos', descricao:'Dispositivos'});
  await DB.add('categorias', {nome:'Acessórios', descricao:'Acessórios diversos'});
  await DB.add('funcionarios', {nome:'Ana Costa', cargo:'Vendedora', salario:120000});
  await DB.add('notificacoes', {titulo:'🎉 Bem-vindo', mensagem:'Kanawa Soft ERP v15.2 configurado!', tipo:'success', data:now(), lida:false});
}

/* ============================================================
   INIT
   ============================================================ */
async function init(){
  try {
    const manifest = {
      name: 'Kanawa Soft ERP', short_name: 'Kanawa', start_url: '.', display: 'standalone',
      background_color: '#1a3a5c', theme_color: '#1a3a5c', orientation: 'any',
      icons: [{src:'logo.png',sizes:'192x192',type:'image/png'},{src:'logo.png',sizes:'512x512',type:'image/png'}]
    };
    const blob = new Blob([JSON.stringify(manifest)], {type:'application/json'});
    const manifestLink = $('pwaManifest');
    if (manifestLink) manifestLink.href = URL.createObjectURL(blob);

    await DB.init();
    const theme = localStorage.getItem('kanawa_theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = $('themeIcon');
    if(themeIcon) themeIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';

    aplicarLogo();
    API.checkHealth().catch(()=>{});

    setTimeout(()=>{
      const loading = $('loadingScreen'); if(loading) loading.classList.add('hidden');
      const emp = JSON.parse(localStorage.getItem('kanawa_empresa')||'null');
      const setupDone = localStorage.getItem('kanawa_setup_done');
      if(!setupDone || !emp){
        const wiz = $('setupWizard'); if(wiz) wiz.classList.add('active');
        return;
      }
      if(emp){ $('topbarEmpresa').textContent = emp.firma || emp.nome || 'Kanawa Soft'; }
      const user = JSON.parse(localStorage.getItem('kanawa_user')||'null');
      if(user){
        $('authScreen').classList.remove('active');
        $('app').classList.add('active');
        $('userName').textContent = user.nome;
        $('userRole').textContent = user.role;
        if ($('userAvatar')) {
          $('userAvatar').src = user.avatar || 'logo.png';
          $('userAvatar').onerror = function(){ this.src = 'logo.png'; };
        }
        renderSidebar();
        openModule('dashboard');
        updateNotifBadge();
      } else {
        $('authScreen').classList.add('active');
      }
    }, 200);

    const loginForm = $('loginForm');
    if(loginForm){
      loginForm.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const email = $('loginEmail').value.trim();
        const senha = $('loginPassword').value;
        const err = $('loginError');
        const users = await DB.getAll('usuarios');
        const u = users.find(x => x.email===email && x.senha===senha);
        if(u || (email==='admin@kanawasoft.com' && senha==='admin123')){
          const user = u || {nome:'Administrador', email, perfil:'admin'};
          localStorage.setItem('kanawa_user', JSON.stringify({nome:user.nome, email:user.email, role:user.perfil, avatar:user.avatar||null, telefone:user.telefone||'', nif:user.nif||''}));
          $('authScreen').classList.remove('active');
          $('app').classList.add('active');
          $('userName').textContent = user.nome;
          $('userRole').textContent = user.perfil || 'admin';
          if ($('userAvatar')) {
            $('userAvatar').src = user.avatar || 'logo.png';
            $('userAvatar').onerror = function(){ this.src = 'logo.png'; };
          }
          renderSidebar();
          openModule('dashboard');
          updateNotifBadge();
          toast('✅ Login realizado','success');
        } else {
          err.textContent = '❌ Email ou senha incorretos';
          err.classList.add('show');
        }
      });
    }
    startAutoSync();
  } catch(e){
    console.error('Init error:', e);
    const loading = $('loadingScreen'); if(loading) loading.classList.add('hidden');
    alert('Erro: '+e.message);
  }
}

/* ============ INTEGRAÇÃO ELECTRON ============ */
if (window.kanawaNative && window.kanawaNative.isDesktop) {
  window.kanawaNative.onMenuNavigate((moduleId) => {
    if (moduleId === '__toggle_theme') { toggleTheme(); return; }
    if (moduleId === '__sync') { syncNow(true); return; }
    if (moduleId && MENU.find(m => m.id === moduleId)) openModule(moduleId);
  });
  if (window.kanawaNative.notifyReady) window.kanawaNative.notifyReady();
}

/* ============ EXPORT GLOBAL ============ */
const EXPORTS = [
  'openModule','closeModal','openModal','toggleTheme','toggleUserMenu','logout','aplicarLogo',
  'setupNextStep','finalizarSetup','toggleSync','syncNow',
  'pdvIrParaTela','pdvSelecionarProduto','pdvAltQty','pdvRemoverItem','pdvSalvarCliente','pdvClienteAnonimo',
  'pdvSelecionarPagamento','pdvAtualizarValores','pdvCancelarVenda','pdvSalvarRascunho','pdvSalvarOrcamento',
  'pdvFinalizarVenda','abrirModalPDVCliente','salvarNovoClientePDV','filtrarPDV','toggleFavorito',
  'abrirScanner','fecharScanner','buscarPorCodigo','cadastroRapidoProduto','salvarCadastroRapido',
  'imprimirEtiquetaIndividual','imprimirEtiquetasLote','gerarLoteEtiquetas','imprimirEtiquetaHTML','baixarEtiquetaPDF',
  'abrirFatura','imprimirFatura','imprimirTermica','baixarFaturaPDF','compartilharWhatsApp','gerarQRCodeFatura',
  'abrirModalProduto','salvarProduto','excluirProduto','exportarProdutos','abrirModalImportar','importarProdutos',
  'escolherImagemProduto','removerImagemProduto',
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
  'detectarImpressoras','detectarEDetalhes',
  'numeroPorExtenso'
];
EXPORTS.forEach(name => { try { window[name] = eval(name); } catch(e){} });

/* ============ START ============ */
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}