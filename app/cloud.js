/* Kanawa Soft Cloud Bridge — Supabase Auth + PostgreSQL */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://jiehrswweoyesbabrpjf.supabase.co';
  // Publishable key: designed for browser use. Database access is restricted by RLS.
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l9HL3zMMJ5rN7vnXUZPa1g_9ZA1q7PO';
  const sdk = window.supabase;
  const client = sdk && typeof sdk.createClient === 'function'
    ? sdk.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
      })
    : null;

  const LOCAL_ONLY_STORES = new Set([
    'empresas', 'usuarios', 'config', 'dispositivos', 'sessoes',
    'tentativasLogin', 'politicasSenha', 'sms2FA', 'acessos',
    'logsSeguranca', 'seguranca', 'migracoes', '_sync_queue'
  ]);

  let context = null;

  function failIfError(result) {
    if (result && result.error) throw result.error;
    return result ? result.data : null;
  }

  function appRole(role) {
    if (role === 'owner' || role === 'admin') return 'admin';
    if (role === 'manager') return 'gerente';
    if (role === 'operator') return 'operador';
    if (role === 'cashier') return 'caixa';
    if (role === 'accountant') return 'contabilista';
    if (role === 'viewer') return 'visualizador';
    return 'visualizador';
  }

  function assertPreviewTenant(company) {
    const hostname = String(window.location && window.location.hostname || '').toLowerCase();
    const isDeployPreview = /^deploy-preview-\d+--kanawa-soft\.netlify\.app$/.test(hostname);
    if (!isDeployPreview) return;
    const companyNames = [company && company.trade_name, company && company.legal_name]
      .map(value => String(value || '').trim()).filter(Boolean);
    if (!companyNames.some(name => /^TESTE(?:\b|[-_ ])/i.test(name))) {
      throw new Error('Este ambiente de teste só aceita uma empresa isolada cujo nome comece por “TESTE”. Crie uma conta/empresa de teste; a conta de produção não pode entrar neste Deploy Preview.');
    }
  }

  async function loadContext(user) {
    if (!client || !user) throw new Error('Sessão Kanawa não encontrada.');
    const membershipResult = await client
      .from('ks_company_memberships')
      .select('company_id, role, status, permissions')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const membership = failIfError(membershipResult);
    if (!membership) {
      throw new Error('A conta foi autenticada, mas ainda não tem uma empresa ativa. Confirme o email ou contacte o administrador.');
    }

    // After membership resolves, fetch independent context records concurrently.
    // This reduces three serial network round-trips to one parallel batch.
    const [companyResult, profileResult, platformAdminResult] = await Promise.all([
      client.from('ks_companies').select('*').eq('id', membership.company_id).single(),
      client.from('ks_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      client.from('ks_platform_admins').select('role').eq('user_id', user.id).maybeSingle()
    ]);
    const company = failIfError(companyResult);
    assertPreviewTenant(company);
    const profile = failIfError(profileResult);
    const platformAdmin = failIfError(platformAdminResult);

    context = {
      user: user,
      company: company,
      membership: membership,
      profile: profile || {},
      role: appRole(membership.role),
      isPlatformAdmin: !!platformAdmin,
      platformRole: platformAdmin ? platformAdmin.role : null
    };
    try { localStorage.setItem('kanawa_cloud_context', JSON.stringify(context)); } catch (e) { }
    return context;
  }

  const Cloud = {
    client: client,
    get context() { return context; },
    get ready() { return !!(client && context && context.company && context.user); },
    isLocalOnly: function (store) { return LOCAL_ONLY_STORES.has(store); },

    async init() {
      if (!client) return null;
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      const session = result.data && result.data.session;
      if (!session) return null;
      try { return await loadContext(session.user); }
      catch (networkError) {
        // Permit an already-authenticated installation to open its local cache while offline.
        try {
          const cached = JSON.parse(localStorage.getItem('kanawa_cloud_context') || 'null');
          if (cached && cached.user && cached.user.id === session.user.id && cached.company && cached.company.id) {
            assertPreviewTenant(cached.company);
            context = cached;
            return context;
          }
        } catch (e) { }
        throw networkError;
      }
    },

    async signIn(email, password) {
      if (!client) throw new Error('Biblioteca de ligação à base de dados não carregou. Atualize a página.');
      const result = await client.auth.signInWithPassword({ email: email, password: password });
      if (result.error) throw result.error;
      return await loadContext(result.data.user);
    },

    async signUp(details) {
      if (!client) throw new Error('Biblioteca de ligação à base de dados não carregou. Atualize a página.');
      const result = await client.auth.signUp({
        email: details.email,
        password: details.password,
        options: {
          data: {
            full_name: details.fullName,
            phone: details.phone || '',
            company_legal_name: details.companyName,
            company_trade_name: details.companyName,
            company_tax_id: details.taxId,
            country_code: 'AO',
            currency_code: 'AOA',
            tax_regime: details.taxRegime || 'not_configured'
          }
        }
      });
      if (result.error) throw result.error;
      if (result.data.session && result.data.user) {
        await loadContext(result.data.user);
      }
      return {
        user: result.data.user,
        session: result.data.session,
        needsEmailConfirmation: !result.data.session
      };
    },

    async changePassword(currentPassword, newPassword) {
      if (!this.ready) throw new Error('Sessão da nuvem não está ativa.');
      if (!currentPassword || !newPassword || String(newPassword).length < 8) {
        throw new Error('Informe a senha atual e uma nova senha com pelo menos 8 caracteres.');
      }
      const reauth = await client.auth.signInWithPassword({ email: context.user.email, password: currentPassword });
      if (reauth.error) throw new Error('A senha atual está incorreta.');
      const update = await client.auth.updateUser({ password: newPassword });
      if (update.error) throw update.error;
      return true;
    },

    async getNativeTrackingConfig(details) {
      if (!this.ready) throw new Error('Sessão da nuvem não está ativa.');
      if (!details || !details.recordId || !details.deviceKey) throw new Error('Identificação do dispositivo GPS inválida.');
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data && sessionResult.data.session;
      if (!session || !session.access_token || !session.refresh_token) {
        throw new Error('Sessão segura incompleta. Termine sessão e volte a entrar.');
      }
      const config = {
        supabaseUrl: SUPABASE_URL,
        publishableKey: SUPABASE_PUBLISHABLE_KEY,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        companyId: context.company.id,
        userId: context.user.id,
        recordId: String(details.recordId),
        deviceKey: String(details.deviceKey),
        deviceLabel: String(details.deviceLabel || 'Dispositivo Android').slice(0, 120),
        vehicleLabel: String(details.vehicleLabel || 'Dispositivo móvel').slice(0, 120),
        trail: Array.isArray(details.trail) ? details.trail.slice(-100) : []
      };
      if (details.lastPoint && Number.isFinite(Number(details.lastPoint.lat)) &&
          Number.isFinite(Number(details.lastPoint.lng))) {
        config.lastPoint = {
          lat: Number(details.lastPoint.lat), lng: Number(details.lastPoint.lng),
          accuracy: details.lastPoint.accuracy || null,
          speed: details.lastPoint.speed || null,
          heading: details.lastPoint.heading || null,
          timestamp: String(details.lastPoint.timestamp || new Date().toISOString())
        };
      }
      return config;
    },

    async signOut() {
      if (!client) return;
      try { if (window.KanawaAndroid && window.KanawaAndroid.stopTracking) await window.KanawaAndroid.stopTracking(); } catch (e) { }
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
      context = null;
      try { localStorage.removeItem('kanawa_cloud_context'); } catch (e) { }
    },

    async check() {
      if (!client || !context) return false;
      const result = await client
        .from('ks_company_memberships')
        .select('company_id')
        .eq('company_id', context.company.id)
        .eq('user_id', context.user.id)
        .eq('status', 'active')
        .maybeSingle();
      return !result.error && !!result.data;
    },

    async countRecords() {
      if (!this.ready) return 0;
      const result = await client
        .from('ks_records')
        .select('record_id', { count: 'exact', head: true })
        .eq('company_id', context.company.id);
      if (result.error) throw result.error;
      return result.count || 0;
    },

    async getAllRecords() {
      if (!this.ready) return [];
      const all = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const result = await client
          .from('ks_records')
          .select('store_key, record_id, payload, updated_at')
          .eq('company_id', context.company.id)
          .order('store_key', { ascending: true })
          .order('record_id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (result.error) throw result.error;
        const rows = result.data || [];
        all.push.apply(all, rows);
        if (rows.length < pageSize) break;
      }
      return all;
    },

    async getStore(store) {
      if (!this.ready || this.isLocalOnly(store)) return null;
      const result = await client
        .from('ks_records')
        .select('record_id, payload, updated_at')
        .eq('company_id', context.company.id)
        .eq('store_key', store)
        .order('updated_at', { ascending: true });
      if (result.error) throw result.error;
      const records = (result.data || []).map(function (row) {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
        const id = payload.id !== undefined ? payload.id : (/^\d+$/.test(row.record_id) ? Number(row.record_id) : row.record_id);
        return Object.assign({}, payload, { id: id });
      });
      if (store === 'produtos') {
        // The normalized inventory table is authoritative after atomic sales.
        const stockResult = await client.from('ks_products')
          .select('external_id, stock_quantity, is_active')
          .eq('company_id', context.company.id);
        if (stockResult.error) throw stockResult.error;
        const stockById = new Map((stockResult.data || []).map(function (row) { return [String(row.external_id), row]; }));
        return records.map(function (product) {
          const normalized = stockById.get(String(product.id));
          if (!normalized) return product;
          return Object.assign({}, product, {
            estoque: Number(normalized.stock_quantity),
            stock_quantity: Number(normalized.stock_quantity),
            ativo: normalized.is_active !== false
          });
        });
      }
      return records;
    },

    async upsertRecord(store, item, options) {
      if (!this.ready || this.isLocalOnly(store)) return false;
      const id = String(item.id === undefined || item.id === null ? '' : item.id);
      if (!id || id.length > 120) throw new Error('Identificador de registo inválido para sincronização.');

      // Mirror products into the normalized table so stock and plan quotas are enforced centrally.
      if (store === 'produtos') {
        const stock = Math.max(0, Number(item.estoque) || 0);
        const product = {
          external_id: id,
          sku: item.codigo || item.codigoBarras || null,
          name: item.nome || 'Produto',
          category: item.categoria || null,
          unit: item.unidade || 'UN',
          unit_price: Math.max(0, Number(item.preco) || 0),
          stock_quantity: stock,
          min_stock: Math.max(0, Number(item.estoqueMin !== undefined ? item.estoqueMin : item.estoque_min) || 0),
          description: item.descricao || null,
          image_path: (typeof item.imagem === 'string' && !item.imagem.startsWith('data:')) ? item.imagem : null,
          is_active: item.ativo !== false
        };
        const syncProduct = await client.rpc('ks_sync_product', {
          p_company_id: context.company.id,
          p_product: product
        });
        if (syncProduct.error) throw syncProduct.error;
        if (!(options && options.skipStockSync)) {
          const stockUpdate = await client.from('ks_products')
            .update({ stock_quantity: stock, updated_at: new Date().toISOString() })
            .eq('company_id', context.company.id)
            .eq('external_id', id);
          if (stockUpdate.error) throw stockUpdate.error;
        }
      }

      // A finalização da venda e o espelho do módulo são gravados numa única
      // transação PostgreSQL quando a migração v15.4.3 está instalada.
      let saleFinalized = false;
      let saleHistoryAtomic = false;
      if (store === 'vendas' && item.status === 'finalizada' && !(options && options.skipSaleFinalize)) {
        if (!window.KanawaSales || typeof window.KanawaSales.normalizeSale !== 'function') {
          throw new Error('Validador de vendas não carregado. Atualize a aplicação.');
        }
        const normalized = window.KanawaSales.normalizeSale(Object.assign({}, item, { id: id }));
        const recordPayload = Object.assign({}, item, {
          id: id,
          status: 'finalizada',
          numeroFatura: normalized.sale.invoice_number,
          subtotal: normalized.sale.subtotal,
          descontoValor: normalized.sale.discount_value,
          iva: normalized.sale.tax_amount,
          total: normalized.sale.total,
          valorRecebido: normalized.sale.amount_received,
          troco: normalized.sale.change_amount,
          pagamento: normalized.sale.payment_method,
          itens: normalized.items.map(function (line) {
            return {
              id: line.product_external_id,
              nome: line.product_name,
              preco: line.unit_price,
              qty: line.quantity,
              subtotal: line.line_total
            };
          })
        });
        normalized.sale.record_payload = recordPayload;
        const sessionResult = await client.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
        const session = sessionResult.data && sessionResult.data.session;
        if (!session || !session.access_token) throw new Error('Sessão expirada. Entre novamente para finalizar a venda.');
        const apiResponse = await fetch('/api/sales/finalize', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + session.access_token,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            company_id: context.company.id,
            sale: normalized.sale,
            items: normalized.items
          })
        });
        let apiResult;
        try { apiResult = await apiResponse.json(); }
        catch (_error) { apiResult = { error: 'Resposta inválida da API de vendas.' }; }
        if (!apiResponse.ok) {
          const apiError = new Error(apiResult.error || 'A API não confirmou a venda.');
          apiError.code = apiResult.code || 'SALE_API_ERROR';
          apiError.status = apiResponse.status;
          throw apiError;
        }
        const finalizeSale = { data: apiResult };
        saleFinalized = true;
        if (finalizeSale.data && finalizeSale.data.duplicate === true &&
            finalizeSale.data.idempotency_enforced !== true) {
          // The shared preview database still has the legacy RPC. Do not let
          // an unverified duplicate retry overwrite its historical snapshot.
          const migrationError = new Error('A proteção de repetição ainda não está instalada na base de teste. A repetição foi bloqueada; não altere nem reenvie esta venda até atualizar a base de teste.');
          migrationError.code = 'IDEMPOTENCY_MIGRATION_REQUIRED';
          throw migrationError;
        }
        saleHistoryAtomic = !!(finalizeSale.data && finalizeSale.data.history_atomic === true);
        // The RPC already persisted the finalized sale record, payment, stock
        // decrement, movement ledger and usage event atomically. Do not issue a
        // second write that could overwrite the committed financial snapshot.
        if (saleHistoryAtomic) return true;
      }

      const result = await client
        .from('ks_records')
        .upsert({
          company_id: context.company.id,
          store_key: store,
          record_id: id,
          payload: item
        }, { onConflict: 'company_id,store_key,record_id' });
      if (result.error) {
        if (saleFinalized) {
          const mirrorError = new Error('A venda foi confirmada, mas o histórico detalhado aguarda sincronização: ' + result.error.message);
          mirrorError.code = result.error.code || 'SALE_HISTORY_SYNC_PENDING';
          mirrorError.saleFinalized = true;
          throw mirrorError;
        }
        throw result.error;
      }
      return true;
    },

    async deleteRecord(store, id) {
      if (!this.ready || this.isLocalOnly(store)) return false;
      if (store === 'produtos') {
        const deactivate = await client.from('ks_products')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('company_id', context.company.id)
          .eq('external_id', String(id));
        if (deactivate.error) throw deactivate.error;
      }
      const result = await client
        .from('ks_records')
        .delete()
        .eq('company_id', context.company.id)
        .eq('store_key', store)
        .eq('record_id', String(id));
      if (result.error) throw result.error;
      return true;
    },

    async updateCompany(details) {
      if (!this.ready) throw new Error('Sessão da nuvem não está ativa.');
      if (!context.company || context.company.owner_user_id !== context.user.id) {
        throw new Error('Apenas o proprietário da empresa pode alterar os dados principais.');
      }
      const patch = {
        legal_name: details.nome || details.firma,
        trade_name: details.firma || details.nome,
        tax_id: details.nif || null,
        tax_regime: details.regime || 'not_configured',
        phone: details.telefone || null,
        email: details.email || null,
        address: details.endereco || null
      };
      const result = await client.from('ks_companies')
        .update(patch)
        .eq('id', context.company.id)
        .select('*')
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('A empresa não foi atualizada. Verifique a permissão do proprietário.');
      context.company = Object.assign({}, context.company, result.data);
      return result.data;
    },

    async listCompanyMembers() {
      if (!this.ready) throw new Error('Sessão da empresa não está ativa.');
      if (context.role !== 'admin') throw new Error('Apenas administradores podem consultar a equipa.');
      const memberships = failIfError(await client
        .from('ks_company_memberships')
        .select('user_id, role, status, permissions, created_at')
        .eq('company_id', context.company.id)
        .order('created_at', { ascending: true })) || [];
      const ids = memberships.map(function (member) { return member.user_id; });
      let profiles = [];
      if (ids.length) {
        profiles = failIfError(await client
          .from('ks_profiles')
          .select('user_id, full_name, email')
          .in('user_id', ids)) || [];
      }
      const byId = new Map(profiles.map(function (profile) { return [profile.user_id, profile]; }));
      return memberships.map(function (member) {
        const profile = byId.get(member.user_id) || {};
        return Object.assign({}, member, { full_name: profile.full_name || 'Utilizador', email: profile.email || '' });
      });
    },

    async inviteMember(details) {
      if (!this.ready) throw new Error('Sessão da empresa não está ativa.');
      if (context.role !== 'admin') throw new Error('Apenas o proprietário ou administrador pode convidar utilizadores.');
      const result = await client.functions.invoke('ks-invite-member', {
        body: { company_id: context.company.id, full_name: details.full_name, email: details.email, role: details.role }
      });
      if (result.error) throw result.error;
      if (result.data && result.data.error) throw new Error(result.data.error);
      return result.data;
    },

    async updateTeamMemberAccess(details) {
      if (!this.ready) throw new Error('Sessão da empresa não está ativa.');
      if (context.role !== 'admin') throw new Error('Apenas o proprietário ou administrador pode alterar permissões.');
      if (!details || !details.user_id || !['manager','operator','cashier','accountant','viewer'].includes(details.role)) {
        throw new Error('Utilizador ou perfil inválido.');
      }
      if (!details.permissions || typeof details.permissions !== 'object' || Array.isArray(details.permissions)) {
        throw new Error('Matriz de permissões inválida.');
      }
      const result = await client.rpc('ks_update_team_member_access', {
        p_user_id: details.user_id,
        p_role: details.role,
        p_permissions: details.permissions,
        p_status: details.status || 'active'
      });
      if (result.error) throw result.error;
      return result.data;
    },

    async listPaymentProviderStatus() {
      if (!this.ready) throw new Error('Sessão da nuvem não está ativa.');
      return failIfError(await client.rpc('ks_list_payment_provider_status')) || [];
    },

    async listCompanyProviderCredentials() {
      if (!this.ready || !context || !context.company) throw new Error('Sessão da empresa não está ativa.');
      if (!['owner','admin'].includes(context.role)) throw new Error('Apenas o administrador pode consultar integrações.');
      return failIfError(await client.rpc('ks_list_company_provider_credentials', { p_company_id: context.company.id })) || [];
    },

    async saveProviderCredential(details) {
      if (!this.ready || !context || !context.company) throw new Error('Sessão da empresa não está ativa.');
      if (!['owner','admin'].includes(context.role)) throw new Error('Apenas o administrador pode guardar credenciais.');
      const result = await client.functions.invoke('ks-save-provider-credential', {
        body: Object.assign({}, details, { company_id: context.company.id, action:'save' })
      });
      if (result.error) throw result.error;
      if (result.data && result.data.error) throw new Error(result.data.error);
      return result.data;
    },

    async deleteProviderCredential(providerCode) {
      if (!this.ready || !context || !context.company) throw new Error('Sessão da empresa não está ativa.');
      if (!['owner','admin'].includes(context.role)) throw new Error('Apenas o administrador pode remover credenciais.');
      const result = await client.functions.invoke('ks-save-provider-credential', {
        body: { company_id:context.company.id, provider_code:providerCode, action:'delete' }
      });
      if (result.error) throw result.error;
      if (result.data && result.data.error) throw new Error(result.data.error);
      return result.data;
    },

    async listCompanyPaymentMethods() {
      if (!this.ready || !context || !context.company) throw new Error('Sessão da empresa não está ativa.');
      return failIfError(await client.rpc('ks_list_company_payment_methods', {
        p_company_id: context.company.id
      })) || [];
    },

    async saveCompanyPaymentMethods(methods) {
      if (!this.ready || !context || !context.company) throw new Error('Sessão da empresa não está ativa.');
      if (!['owner','admin'].includes(context.role)) throw new Error('Apenas o proprietário ou administrador pode configurar métodos de pagamento.');
      if (!Array.isArray(methods)) throw new Error('Configuração de métodos inválida.');
      return failIfError(await client.rpc('ks_save_company_payment_methods', {
        p_company_id: context.company.id,
        p_methods: methods
      }));
    },

    async registerInstallation(appVersion) {
      if (!this.ready) return null;
      let key = localStorage.getItem('kanawa_installation_key');
      if (!key) {
        key = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() :
          'ks-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
        localStorage.setItem('kanawa_installation_key', key);
      }
      const existing = failIfError(await client
        .from('ks_installations')
        .select('id')
        .eq('company_id', context.company.id)
        .eq('installation_key', key)
        .maybeSingle());
      const payload = {
        company_id: context.company.id,
        installation_key: key,
        user_id: context.user.id,
        device_name: (navigator.userAgent || 'Dispositivo').slice(0, 180),
        platform: navigator.platform || 'web',
        app_version: appVersion,
        install_status: 'active',
        last_seen_at: new Date().toISOString(),
        metadata: { source: 'kanawasoft.shop', app: 'Kanawa Soft' }
      };
      if (existing) {
        const result = await client.from('ks_installations').update(payload).eq('id', existing.id);
        if (result.error) throw result.error;
      } else {
        const result = await client.from('ks_installations').insert(payload);
        if (result.error) throw result.error;
      }
      return key;
    },

    async getLicense() {
      if (!this.ready) return null;
      return failIfError(await client
        .from('ks_company_licenses')
        .select('id, plan_code, license_key, status, starts_at, expires_at, grace_until, max_users_override, max_installations_override')
        .eq('company_id', context.company.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle());
    },

    async getEntitlements() {
      if (!this.ready) return null;
      return failIfError(await client.rpc('ks_get_company_entitlements', { p_company_id: context.company.id }));
    },

    async submitDemoRequest(details) {
      if (!client) throw new Error('Serviço de demonstração indisponível.');
      const result = await client.from('ks_demo_requests').insert({
        company_name: details.companyName,
        contact_name: details.contactName,
        email: details.email,
        phone: details.phone || null,
        country_code: 'AO',
        preferred_plan: details.preferredPlan || null,
        requested_modules: details.modules || [],
        source: 'kanawa_site'
      });
      if (result.error) throw result.error;
      return true;
    }
  };

  window.KanawaCloud = Cloud;
})();