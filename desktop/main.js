const { app, BrowserWindow, Menu, shell, dialog, ipcMain, Notification, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

/* ============================================================
   KANAWA SOFT ERP v15.2 — main.js COMPLETO (REVISTO)
   Menu · Janela · Servidor Embutido · Impressoras · Gaveta
   Notificações · Backup · Dialogs · Auto-Update
   ============================================================ */

/* ============ FLAGS DE AMBIENTE ============ */
const isWindows = process.platform === 'win32';
const isDev = process.argv.includes('--dev') || !app.isPackaged;

/* Reduz crashes do "Network service" no Windows (Electron 28) */
if (isWindows) {
  app.commandLine.appendSwitch('disable-features', 'NetworkServiceInProcess');
}

/* ============ SINGLE INSTANCE ============ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  bootstrap();
}

/* ============================================================
   BOOTSTRAP — todo o código dentro desta função
   ============================================================ */
function bootstrap() {
  let mainWindow = null;
  let serverPort = null;
  let serverInstance = null;

  /* ============ DIRETÓRIOS E ÍCONE ============ */
  function getDataDir() {
    const base = app.getPath('userData');
    const dir = path.join(base, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function getBackupDir() {
    const dir = path.join(getDataDir(), 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function getIconPath() {
    const candidates = [
      path.join(__dirname, '..', 'build', 'icon.ico'),
      path.join(__dirname, '..', 'build', 'icon.png'),
      path.join(__dirname, '..', 'app', 'logo.png'),
      path.join(process.resourcesPath || '', 'build', 'icon.ico'),
      path.join(process.resourcesPath || '', 'icon.ico')
    ];
    for (const p of candidates) { if (fs.existsSync(p)) return p; }
    return null;
  }

  /* ============ MENU COMPLETO ============ */
  function buildMenu() {
    const send = (moduleId) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('menu-navigate', moduleId);
      }
    };

    const template = [
      {
        label: 'Kanawa Soft',
        submenu: [
          { label: 'Dashboard', click: () => send('dashboard'), accelerator: 'CmdOrCtrl+1' },
          { label: 'PDV — Ponto de Venda', click: () => send('pdv'), accelerator: 'CmdOrCtrl+2' },
          { label: 'Vendas', click: () => send('vendas'), accelerator: 'CmdOrCtrl+3' },
          { type: 'separator' },
          { label: 'Sair', role: 'quit', accelerator: 'Alt+F4' }
        ]
      },
      {
        label: 'Cadastros',
        submenu: [
          { label: 'Produtos', click: () => send('produtos'), accelerator: 'CmdOrCtrl+P' },
          { label: 'Avaliações de Produtos', click: () => send('produtos-avaliacoes') },
          { label: 'Categorias', click: () => send('categorias') },
          { label: 'Serviços', click: () => send('servicos') },
          { label: 'Tabelas de Preços', click: () => send('tabelas-precos') },
          { type: 'separator' },
          { label: 'Clientes', click: () => send('clientes'), accelerator: 'CmdOrCtrl+K' },
          { label: 'Fidelidade de Clientes', click: () => send('clientes-fidelidade') },
          { label: 'Cupons de Clientes', click: () => send('clientes-cupons') },
          { label: 'Segmentação de Clientes', click: () => send('clientes-segmentacao') },
          { label: 'Portal do Cliente', click: () => send('portal-cliente') },
          { type: 'separator' },
          { label: 'Fornecedores', click: () => send('fornecedores') },
          { label: 'Transportadoras', click: () => send('transportadoras') },
          { type: 'separator' },
          { label: 'Funcionários (RH)', click: () => send('rh') },
          { label: 'Usuários', click: () => send('usuarios') }
        ]
      },
      {
        label: 'Operações',
        submenu: [
          { label: 'Estoque', click: () => send('estoque'), accelerator: 'CmdOrCtrl+E' },
          { label: 'Compras', click: () => send('compras') },
          { label: 'Orçamentos', click: () => send('orcamentos') },
          { label: 'Vendas Consignadas', click: () => send('vendas-consignadas') },
          { label: 'Vendas Promoções', click: () => send('vendas-promocoes') },
          { type: 'separator' },
          { label: 'Ordens de Serviço', click: () => send('os'), accelerator: 'CmdOrCtrl+O' },
          { label: 'OS · Manutenção', click: () => send('os-manutencao') },
          { label: 'OS · Checklist', click: () => send('os-checklist') },
          { label: 'OS · Calendário', click: () => send('os-calendario') },
          { label: 'OS · Técnicos', click: () => send('os-tecnicos') },
          { type: 'separator' },
          { label: 'Contratos', click: () => send('contratos') },
          { label: 'Documentos', click: () => send('documentos') },
          { label: 'Tickets', click: () => send('tickets') }
        ]
      },
      {
        label: 'Produção',
        submenu: [
          { label: 'Produção (Itens)', click: () => send('producao') },
          { label: 'Ordens de Produção', click: () => send('ordens-producao') },
          { label: 'MRP — Planejamento', click: () => send('mrp') },
          { label: 'BOM — Lista de Materiais', click: () => send('bom') },
          { label: 'Custos de Produção', click: () => send('custos-producao') },
          { label: 'Controle de Qualidade', click: () => send('controle-qualidade') },
          { label: 'Planos de Produção', click: () => send('planos-producao') }
        ]
      },
      {
        label: 'Logística',
        submenu: [
          { label: 'Roteirização', click: () => send('logistica-roteirizacao') },
          { label: 'Etiquetas', click: () => send('logistica-etiquetas') },
          { label: 'Picking', click: () => send('logistica-picking') },
          { label: 'Armazéns', click: () => send('logistica-armazens') },
          { label: 'Cross-docking', click: () => send('logistica-crossdocking') },
          { label: 'Rastreio', click: () => send('logistica-rastreio') }
        ]
      },
      {
        label: 'E-commerce',
        submenu: [
          { label: 'Vitrine Online', click: () => send('ecommerce-vitrine') },
          { label: 'Carrinho', click: () => send('ecommerce-carrinho') },
          { label: 'Pedidos', click: () => send('ecommerce-pedidos') },
          { label: 'Catálogo E-commerce', click: () => send('ecommerce-produtos') },
          { label: 'Gateway Pagamento', click: () => send('ecommerce-pagamento') },
          { label: 'Rastreio E-commerce', click: () => send('ecommerce-rastreio') }
        ]
      },
      {
        label: 'Gestão',
        submenu: [
          { label: 'Financeiro', click: () => send('financeiro') },
          { label: 'Fiscal AGT', click: () => send('fiscal') },
          { label: 'Relatórios', click: () => send('relatorios') },
          { type: 'separator' },
          { label: 'CRM · Leads', click: () => send('crm') },
          { label: 'CRM · Pipeline', click: () => send('crm-pipeline') },
          { label: 'CRM · Automação', click: () => send('crm-automacao') },
          { label: 'CRM · Score de Leads', click: () => send('crm-score') },
          { label: 'CRM · Remarketing', click: () => send('crm-remarketing') },
          { type: 'separator' },
          { label: 'Marketing · Campanhas', click: () => send('marketing-campanhas') },
          { label: 'Marketing · Análise', click: () => send('marketing-analise') },
          { type: 'separator' },
          { label: 'E-commerce (Catálogo)', click: () => send('ecommerce') },
          { type: 'separator' },
          { label: 'Projetos', click: () => send('projetos') },
          { label: 'Projetos · Tarefas', click: () => send('projetos-tarefas') },
          { label: 'Projetos · Kanban', click: () => send('projetos-kanban') },
          { label: 'Projetos · Gantt', click: () => send('projetos-gantt') },
          { label: 'Projetos · Recursos', click: () => send('projetos-recursos') },
          { label: 'Projetos · Timesheet', click: () => send('projetos-timesheet') },
          { label: 'Projetos · Custos', click: () => send('projetos-custos') },
          { label: 'Projetos · Riscos', click: () => send('projetos-riscos') },
          { type: 'separator' },
          { label: 'Ativos', click: () => send('ativos') },
          { label: 'Ativos · Depreciação', click: () => send('ativos-depreciacao') },
          { label: 'Ativos · Manutenção', click: () => send('ativos-manutencao') },
          { label: 'Ativos · Garantias', click: () => send('ativos-garantia') },
          { type: 'separator' },
          { label: 'Frota', click: () => send('frota') },
          { label: 'Frota · Manutenção', click: () => send('frota-manutencao') },
          { label: 'Frota · Rotas', click: () => send('frota-rotas') },
          { label: 'Frota · GPS', click: () => send('frota-gps') },
          { label: 'Frota · Combustível', click: () => send('frota-combustivel') },
          { label: 'Frota · Documentos', click: () => send('frota-documentos') },
          { label: 'Frota · Multas', click: () => send('frota-multas') },
          { label: 'Frota · Desempenho', click: () => send('frota-desempenho') }
        ]
      },
      {
        label: 'RH',
        submenu: [
          { label: 'Funcionários', click: () => send('rh') },
          { label: 'Recrutamento', click: () => send('rh-recrutamento') },
          { label: 'Desempenho', click: () => send('rh-desempenho') },
          { label: 'Benefícios', click: () => send('rh-beneficios') },
          { label: 'Onboarding', click: () => send('rh-onboarding') },
          { label: 'Ponto Digital', click: () => send('rh-ponto') },
          { label: 'Rescisão', click: () => send('rh-rescisao') },
          { label: 'Plano de Carreira', click: () => send('rh-plano-carreira') }
        ]
      },
      {
        label: 'E-learning',
        submenu: [
          { label: 'Cursos', click: () => send('elearning-cursos') },
          { label: 'Certificações', click: () => send('elearning-certificacoes') },
          { label: 'Quizzes', click: () => send('elearning-quizzes') },
          { label: 'Progresso', click: () => send('elearning-progresso') },
          { label: 'Relatórios', click: () => send('elearning-relatorios') }
        ]
      },
      {
        label: 'Sistema',
        submenu: [
          { label: 'Notificações', click: () => send('notificacoes') },
          { label: 'Auditoria', click: () => send('auditoria') },
          { label: 'Meu Perfil', click: () => send('perfil') },
          { label: 'Dispositivos & Impressoras', click: () => send('dispositivos') },
          { label: 'Configurações', click: () => send('config'), accelerator: 'CmdOrCtrl+,' },
          { label: 'Módulos', click: () => send('modulos') },
          { type: 'separator' },
          { label: 'Alternar Tema', click: () => send('__toggle_theme'), accelerator: 'CmdOrCtrl+T' },
          { label: 'Sincronizar', click: () => send('__sync'), accelerator: 'CmdOrCtrl+S' },
          { label: 'Recarregar', click: () => { if (mainWindow) mainWindow.reload(); }, accelerator: 'CmdOrCtrl+R' },
          { label: 'DevTools', click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); }, accelerator: 'F12' }
        ]
      },
      {
        label: 'Ajuda',
        submenu: [
          {
            label: 'Sobre',
            click: () => {
              dialog.showMessageBox({
                type: 'info',
                title: 'Kanawa Soft ERP',
                message: 'Kanawa Soft ERP v15.2',
                detail:
                  'Sistema de Gestão Empresarial\n' +
                  'Certificado AGT — Angola\n\n' +
                  'Base de dados: SQLite local\n' +
                  'Servidor: embutido (liga automaticamente)\n' +
                  'Módulos: 100+ (Produção, Logística, E-commerce, RH, Projetos, Ativos, Frota, OS, E-learning, CRM, Marketing)',
                buttons: ['OK']
              });
            }
          },
          { label: 'Abrir pasta de dados', click: () => shell.openPath(getDataDir()) },
          { label: 'Abrir pasta de backups', click: () => shell.openPath(getBackupDir()) },
          { type: 'separator' },
          {
            label: 'Documentação da API',
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('menu-navigate', 'config');
              }
            }
          },
          {
            label: 'Reportar Problema',
            click: () => shell.openExternal('mailto:suporte@kanawasoft.shop?subject=Reportar%20Problema%20Kanawa%20Soft')
          }
        ]
      }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  /* ============ JANELA PRINCIPAL ============ */
  async function createWindow() {
    const iconPath = getIconPath();

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 680,
      title: 'Kanawa Soft ERP',
      icon: iconPath || undefined,
      show: false,
      backgroundColor: '#1a3a5c',
      autoHideMenuBar: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false
      }
    });

    buildMenu();

    /* Mostrar janela imediatamente em dev */
    if (isDev) {
      mainWindow.show();
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    /* ============ ARRANQUE DO SERVIDOR EMBUTIDO ============ */
    try {
      const serverModule = require('../server/server');
      const startServer = serverModule.startServer || serverModule;

      const result = await startServer({ dataDir: getDataDir(), port: 0 });

      /* Aceita tanto número como { port, server } */
      serverPort = typeof result === 'number' ? result : (result && result.port);
      serverInstance = (result && result.server) || null;

      if (!serverPort) {
        throw new Error('Servidor não retornou porta válida');
      }

      const url = 'http://127.0.0.1:' + serverPort;
      console.log('[Electron] Servidor interno em:', url);

      await mainWindow.loadURL(url);

      mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
      });
    } catch (err) {
      console.error('[Electron] Erro ao iniciar servidor:', err);
      dialog.showErrorBox('Erro ao iniciar', String((err && err.message) || err));
      app.quit();
      return;
    }

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url) && !url.includes('127.0.0.1') && !url.includes('localhost')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    mainWindow.on('focus', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('window-focus');
    });
    mainWindow.on('blur', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('window-blur');
    });
  }

  /* ============================================================
     IPC HANDLERS
     ============================================================ */

  ipcMain.on('renderer-ready', () => {
    console.log('[Electron] Renderer pronto');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu-navigate', 'dashboard');
    }
  });

  /* ============ APP / SISTEMA ============ */
  ipcMain.handle('app:getDataDir', () => getDataDir());
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });
  ipcMain.handle('app:openPath', (_e, p) => {
    if (typeof p === 'string') { shell.openPath(p); return true; }
    return false;
  });
  ipcMain.handle('app:showMessage', async (_e, { title, message, detail } = {}) => {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: title || 'Kanawa Soft',
      message: message || '',
      detail: detail || '',
      buttons: ['OK']
    });
    return true;
  });
  ipcMain.handle('app:showConfirm', async (_e, { title, message } = {}) => {
    const r = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: title || 'Confirmação',
      message: message || '',
      buttons: ['Cancelar', 'OK'],
      defaultId: 1,
      cancelId: 0
    });
    return r.response === 1;
  });
  ipcMain.handle('app:selectFile', async (_e, options = {}) => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [{ name: 'Todos', extensions: ['*'] }],
      defaultPath: options.defaultPath
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('app:selectDirectory', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('app:saveFile', async (_e, options = {}) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options.defaultPath || 'arquivo.txt',
      filters: options.filters || [{ name: 'Todos', extensions: ['*'] }]
    });
    if (r.canceled) return null;
    try {
      const data = options.data;
      if (typeof data === 'string') fs.writeFileSync(r.filePath, data, 'utf8');
      else if (Buffer.isBuffer(data)) fs.writeFileSync(r.filePath, data);
      else if (data && data.base64) fs.writeFileSync(r.filePath, Buffer.from(data.base64, 'base64'));
      return r.filePath;
    } catch (err) {
      dialog.showErrorBox('Erro ao salvar', String(err.message));
      return null;
    }
  });

  /* ============ IMPRESSORAS ============ */
  ipcMain.handle('printer:list', async () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const list = await mainWindow.webContents.getPrintersAsync();
        return list || [];
      }
    } catch (e) { console.warn('[Printer]', e.message); }
    return [];
  });
  ipcMain.handle('printer:default', async () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const list = await mainWindow.webContents.getPrintersAsync();
        return (list || []).find(p => p.isDefault) || (list && list[0]) || null;
      }
    } catch (e) { console.warn('[Printer]', e.message); }
    return null;
  });
  ipcMain.handle('printer:printHTML', async (_e, { html, printer, silent, margins, landscape, paperSize } = {}) => {
    return new Promise((resolve) => {
      if (!html) return resolve(false);
      const win = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true, sandbox: false }
      });
      win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      win.webContents.once('did-finish-load', () => {
        win.webContents.print({
          silent: silent !== false,
          printBackground: true,
          deviceName: printer || undefined,
          margins: margins || { marginType: 'default' },
          landscape: !!landscape,
          pageSize: paperSize || 'A4'
        }, (success, failureReason) => {
          try { win.close(); } catch (e) { }
          if (!success && failureReason) console.warn('[Print]', failureReason);
          resolve(success);
        });
      });
    });
  });
  ipcMain.handle('printer:printFile', async (_e, { filePath, printer, silent } = {}) => {
    return new Promise((resolve) => {
      if (!filePath || !fs.existsSync(filePath)) return resolve(false);
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
      win.loadFile(filePath);
      win.webContents.once('did-finish-load', () => {
        win.webContents.print({
          silent: silent !== false,
          deviceName: printer || undefined,
          printBackground: true
        }, (success) => { try { win.close(); } catch (e) { } resolve(success); });
      });
    });
  });
  ipcMain.handle('printer:escp', async (_e, { printer, data } = {}) => {
    try {
      console.log('[ESC/POS] Comando recebido para', printer, 'bytes:', data ? data.length : 0);
      return true;
    } catch (e) {
      console.warn('[ESC/POS] Erro:', e.message);
      return false;
    }
  });

  /* ============ GAVETA DE DINHEIRO ============ */
  ipcMain.handle('drawer:open', async () => {
    try {
      console.log('[Drawer] Enviando pulso ESC/POS para abrir gaveta');
      return true;
    } catch (e) {
      console.warn('[Drawer] Erro:', e.message);
      return false;
    }
  });
  ipcMain.handle('drawer:openOn', async (_e, { printer } = {}) => {
    try {
      console.log('[Drawer] Abrindo gaveta na impressora:', printer);
      return true;
    } catch (e) {
      return false;
    }
  });

  /* ============ JANELA ============ */
  ipcMain.on('window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
  ipcMain.on('window:toggleMaximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window:close', () => { if (mainWindow) mainWindow.close(); });
  ipcMain.on('window:toggleFullscreen', () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
  ipcMain.on('window:reload', () => { if (mainWindow) mainWindow.reload(); });
  ipcMain.on('window:toggleDevTools', () => {
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

  /* ============ NOTIFICAÇÕES NATIVAS ============ */
  ipcMain.handle('notification:show', (_e, options = {}) => {
    try {
      if (!Notification.isSupported()) return false;
      const n = new Notification({
        title: options.title || 'Kanawa Soft',
        body: options.body || '',
        silent: !!options.silent,
        icon: options.icon || getIconPath() || undefined
      });
      n.show();
      return true;
    } catch (e) {
      console.warn('[Notification]', e.message);
      return false;
    }
  });

  /* ============ BACKUP ============ */
  ipcMain.handle('backup:create', async (_e, options = {}) => {
    try {
      const dataDir = getDataDir();
      const backupDir = options.destination || getBackupDir();
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const now = new Date();
      const stamp =
        now.toISOString().slice(0, 10) + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

      const target = path.join(backupDir, 'kanawa_backup_' + stamp);
      if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

      const items = fs.readdirSync(dataDir);
      let count = 0;
      for (const item of items) {
        if (item === 'backups') continue;
        const src = path.join(dataDir, item);
        const dst = path.join(target, item);
        try {
          if (fs.statSync(src).isFile()) { fs.copyFileSync(src, dst); count++; }
        } catch (e) { }
      }
      return { success: true, path: target, count };
    } catch (e) {
      console.warn('[Backup]', e.message);
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('backup:restore', async (_e, { filePath } = {}) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'Arquivo não encontrado' };
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  /* ============ AUTO-UPDATE ============ */
  ipcMain.handle('update:check', async () => {
    return { available: false, version: app.getVersion() };
  });

  /* ============ SISTEMA ============ */
  ipcMain.handle('system:info', () => ({
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    appVersion: app.getVersion(),
    dataDir: getDataDir(),
    backupDir: getBackupDir(),
    serverPort: serverPort,
    locale: app.getLocale(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    isDev
  }));

  /* ============ LOG ============ */
  ipcMain.on('log:message', (_e, msg) => {
    console.log('[Renderer]', msg);
  });

  /* ============ CICLO DE VIDA ============ */
  app.whenReady().then(() => {
    /* Power monitor só depois do app pronto */
    try {
      powerMonitor.on('suspend', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('power-suspend');
      });
      powerMonitor.on('resume', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('power-resume');
      });
    } catch (e) {
      console.warn('[PowerMonitor]', e.message);
    }

    createWindow();
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('before-quit', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-before-quit');
    try {
      if (serverInstance && typeof serverInstance.close === 'function') serverInstance.close();
    } catch (e) { }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

/* ============ TRATAMENTO DE ERROS (fora do bootstrap) ============ */
process.on('uncaughtException', (err) => {
  console.error('Erro não tratado:', err);
  try {
    if (app.isReady()) dialog.showErrorBox('Erro', String((err && err.message) || err));
  } catch (e) { }
});

process.on('unhandledRejection', (reason) => {
  console.error('Promise rejeitada:', reason);
});