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
    if (role === 'cashier') return 'caixa';
    return 'operador';
  }

  async function loadContext(user) {
    if (!client || !user) throw new Error('Sessão Kanawa não encontrada.');
    const membershipResult = await client
      .from('ks_company_memberships')
      .select('company_id, role, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const membership = failIfError(membershipResult);
    if (!membership) {
      throw new Error('A conta foi autenticada, mas ainda não tem uma empresa ativa. Confirme o email ou contacte o administrador.');
    }

    const company = failIfError(await client
      .from('ks_companies')
      .select('*')
      .eq('id', membership.company_id)
      .single());

    const profile = failIfError(await client
      .from('ks_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle());

    const platformAdmin = failIfError(await client
      .from('ks_platform_admins')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle());

    context = {
      user: user,
      company: company,
      membership: membership,
      profile: profile || {},
      role: appRole(membership.role),
      isPlatformAdmin: !!platformAdmin,
      platformRole: platformAdmin ? platformAdmin.role : null
    };
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
      return await loadContext(session.user);
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

    async signOut() {
      if (!client) return;
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
      context = null;
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
      return (result.data || []).map(function (row) {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
        const id = payload.id !== undefined ? payload.id : (/^\d+$/.test(row.record_id) ? Number(row.record_id) : row.record_id);
        return Object.assign({}, payload, { id: id });
      });
    },

    async upsertRecord(store, item) {
      if (!this.ready || this.isLocalOnly(store)) return false;
      const id = String(item.id === undefined || item.id === null ? '' : item.id);
      if (!id || id.length > 120) throw new Error('Identificador de registo inválido para sincronização.');
      const result = await client
        .from('ks_records')
        .upsert({
          company_id: context.company.id,
          store_key: store,
          record_id: id,
          payload: item
        }, { onConflict: 'company_id,store_key,record_id' });
      if (result.error) throw result.error;
      return true;
    },

    async deleteRecord(store, id) {
      if (!this.ready || this.isLocalOnly(store)) return false;
      const result = await client
        .from('ks_records')
        .delete()
        .eq('company_id', context.company.id)
        .eq('store_key', store)
        .eq('record_id', String(id));
      if (result.error) throw result.error;
      return true;
    },

    async updateCompany(data) {
      if (!this.ready) return;
      const update = {
        legal_name: data.nome || data.firma || context.company.legal_name,
        trade_name: data.firma || data.nome || context.company.trade_name,
        tax_id: data.nif || context.company.tax_id,
        phone: data.telefone || context.company.phone,
        email: data.email || context.company.email,
        updated_at: new Date().toISOString()
      };
      const result = await client.from('ks_companies').update(update).eq('id', context.company.id);
      if (result.error) throw result.error;
      context.company = Object.assign({}, context.company, update);
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