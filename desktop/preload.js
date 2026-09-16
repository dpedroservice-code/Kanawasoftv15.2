const { contextBridge, ipcRenderer } = require('electron');

/* ============================================================
   KANAWA SOFT ERP v15.2 — preload.js
   Bridge segura entre Renderer (app.js) e Main (main.js)
   ============================================================ */

/* ---------- Utilitário: listener seguro com cleanup ---------- */
function safeOn(channel, callback) {
  const handler = (_event, ...args) => {
    try { callback(...args); } catch (e) { console.warn('[preload] callback erro em ' + channel + ':', e.message); }
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

/* ---------- Utilitário: invoke com tratamento ---------- */
async function safeInvoke(channel, ...args) {
  try {
    return await ipcRenderer.invoke(channel, ...args);
  } catch (err) {
    console.warn('[preload] Erro em ' + channel + ':', err.message);
    return null;
  }
}

contextBridge.exposeInMainWorld('kanawaNative', {
  /* ====== IDENTIFICAÇÃO ====== */
  isDesktop: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,
  nodeVersion: process.versions.node,
  appVersion: '15.2.0',
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',

  /* ====== MENU NATIVO ====== */
  onMenuNavigate: (callback) => safeOn('menu-navigate', callback),
  offMenuNavigate: () => ipcRenderer.removeAllListeners('menu-navigate'),
  notifyReady: () => ipcRenderer.send('renderer-ready'),

  /* ====== APP / SISTEMA ====== */
  getDataDir: () => safeInvoke('app:getDataDir'),
  getVersion: () => safeInvoke('app:getVersion'),
  openExternal: (url) => safeInvoke('app:openExternal', url),
  openPath: (p) => safeInvoke('app:openPath', p),
  showMessage: (title, message, detail) => safeInvoke('app:showMessage', { title, message, detail }),
  showConfirm: (title, message) => safeInvoke('app:showConfirm', { title, message }),
  selectFile: (options) => safeInvoke('app:selectFile', options || {}),
  selectDirectory: () => safeInvoke('app:selectDirectory'),
  saveFile: (options) => safeInvoke('app:saveFile', options || {}),

  /* ====== IMPRESSORAS ====== */
  listarImpressoras: async () => (await safeInvoke('printer:list')) || [],
  getImpressoraPadrao: async () => (await safeInvoke('printer:default')) || null,
  imprimirHTML: (options) => safeInvoke('printer:printHTML', options || {}),
  imprimirArquivo: (options) => safeInvoke('printer:printFile', options || {}),
  enviarESCPOS: (options) => safeInvoke('printer:escp', options || {}),

  /* ====== GAVETA ====== */
  abrirGaveta: () => safeInvoke('drawer:open'),
  abrirGavetaEm: (printer) => safeInvoke('drawer:openOn', { printer }),

  /* ====== LEITOR DE CÓDIGO DE BARRAS ====== */
  onBarcodeScanned: (callback) => safeOn('barcode-scanned', callback),
  offBarcodeScanned: () => ipcRenderer.removeAllListeners('barcode-scanned'),

  /* ====== JANELA ====== */
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleFullscreen: () => ipcRenderer.send('window:toggleFullscreen'),
  reload: () => ipcRenderer.send('window:reload'),
  toggleDevTools: () => ipcRenderer.send('window:toggleDevTools'),

  /* ====== NOTIFICAÇÕES ====== */
  notificar: (options) => safeInvoke('notification:show', options || {}),

  /* ====== AUTO-UPDATE ====== */
  verificarAtualizacoes: () => safeInvoke('update:check'),
  onUpdateProgress: (callback) => safeOn('update:progress', callback),

  /* ====== BACKUP ====== */
  criarBackup: (options) => safeInvoke('backup:create', options || {}),
  restaurarBackup: (filePath) => safeInvoke('backup:restore', { filePath }),

  /* ====== DEBUG ====== */
  getSystemInfo: () => safeInvoke('system:info'),
  log: (message) => ipcRenderer.send('log:message', String(message))
});

/* ============================================================
   EVENTOS DE CICLO DE VIDA
   ============================================================ */
contextBridge.exposeInMainWorld('kanawaEvents', {
  onWindowFocus: (cb) => safeOn('window-focus', cb),
  onWindowBlur: (cb) => safeOn('window-blur', cb),
  onBeforeQuit: (cb) => safeOn('app-before-quit', cb),
  onPowerSuspend: (cb) => safeOn('power-suspend', cb),
  onPowerResume: (cb) => safeOn('power-resume', cb)
});