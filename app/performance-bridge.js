(function () {
  'use strict';
  const lastRefresh = new Map();
  const writesInProgress = new Set();
  const originalGetData = window.getData;
  const originalSaveData = window.saveData;

  window.getData = async function (store) {
    try {
      const localRows = await DB.getAll(store);
      const cloud = window.KanawaCloud;
      if (cloud && cloud.ready && !cloud.isLocalOnly(store) && !writesInProgress.has(store)) {
        const companyId = cloud.context && cloud.context.company ? cloud.context.company.id : 'active';
        const key = companyId + ':' + store;
        const now = Date.now();
        if (!lastRefresh.has(key) || now - lastRefresh.get(key) > 30000) {
          lastRefresh.set(key, now);
          Promise.resolve().then(async function () {
            const pending = await DB.getAll('_sync_queue');
            if (pending.some(function (item) { return !item.synced && item.entity === store; })) return;
            const remote = await cloud.getStore(store);
            if (!Array.isArray(remote)) return;
            if (writesInProgress.has(store)) return;
            const latestPending = await DB.getAll('_sync_queue');
            if (latestPending.some(function (item) { return !item.synced && item.entity === store; })) return;
            await DB.clear(store);
            for (const item of remote) await DB.put(store, item);
          }).catch(function (error) { console.warn('Atualização de cache em segundo plano:', store, error); });
        }
      }
      return localRows;
    } catch (error) {
      console.warn('Leitura local:', store, error);
      return [];
    }
  };

  window.saveData = async function (store, item, options) {
    writesInProgress.add(store);
    try {
      const opts = options || {};
      const existed = item.id !== undefined && item.id !== null && item.id !== '';
      const previous = existed ? await DB.get(store, item.id) : null;
      const id = existed ? (await DB.put(store, item), item.id) : await DB.add(store, item);
      const record = Object.assign({}, item, { id: id });
      const cloud = window.KanawaCloud;
      if (!cloud || cloud.isLocalOnly(store)) return id;

      const queue = async function (extra) {
        await queueSync(store, existed ? 'update' : 'create', record, extra || opts);
        Promise.resolve().then(function () {
          if (cloud.ready && typeof processSyncQueue === 'function') processSyncQueue().catch(function (error) {
            console.warn('Sincronização em segundo plano:', error);
          });
        });
      };

      if (store === 'empresas' && cloud.ready) {
        try { await cloud.updateCompany(record); return id; }
        catch (error) {
          if (previous) await DB.put(store, previous); else await DB.del(store, id);
          throw error;
        }
      }

      if (!cloud.ready) {
        await queue(opts);
        return id;
      }

      if (store === 'vendas' && record.status === 'finalizada' && !opts.skipSaleFinalize) {
        try {
          await cloud.upsertRecord(store, record, { deferMirror: true });
        } catch (error) {
          if (previous) await DB.put(store, previous); else await DB.del(store, id);
          throw error;
        }
        try { await queue(Object.assign({}, opts, { skipSaleFinalize: true })); }
        catch (queueError) {
          console.warn('Venda confirmada; espelho histórico aguarda sincronização:', queueError);
          cloud.upsertRecord(store, record, { skipSaleFinalize: true }).catch(function (error) {
            console.warn('Falha ao criar espelho da venda confirmada:', error);
          });
        }
        return id;
      }

      if (store === 'produtos' && !opts.skipStockSync) {
        try { await cloud.upsertRecord(store, record, opts); return id; }
        catch (error) {
          if (previous) await DB.put(store, previous); else await DB.del(store, id);
          throw error;
        }
      }

      await queue(opts);
      return id;
    } finally {
      writesInProgress.delete(store);
    }
  };
})();