(function () {
  'use strict';
  const originalOpenModule = window.openModule;
  const originalCanAccess = window.podeAcessar;
  let activeModule = 'dashboard';
  const groups = [
    { id: 'comercial-hub', label: 'Comercial', icon: 'fa-cash-register', description: 'Ponto de venda, vendas e orçamentos.', children: [
      ['pdv','Ponto de Venda','fa-cash-register'],['vendas','Vendas e faturas','fa-receipt'],['orcamentos','Orçamentos','fa-file-invoice']
    ]},
    { id: 'catalogo-hub', label: 'Produtos e Serviços', icon: 'fa-boxes', description: 'Catálogo, categorias, serviços e preços.', children: [
      ['produtos','Produtos','fa-boxes'],['categorias','Categorias','fa-tags'],['servicos','Serviços','fa-concierge-bell'],['produtos-avaliacoes','Avaliações','fa-star'],['tabelas-precos','Tabelas de preços','fa-table']
    ]},
    { id: 'ecommerce-hub', label: 'E-commerce', icon: 'fa-store', description: 'Loja, pedidos, pagamentos e rastreio.', children: [
      ['ecommerce-vitrine','Vitrine','fa-store'],['ecommerce-carrinho','Carrinho','fa-shopping-bag'],['ecommerce-pedidos','Pedidos','fa-truck'],['ecommerce-produtos','Produtos da loja','fa-box'],['ecommerce-pagamento','Pagamentos','fa-credit-card'],['ecommerce-rastreio','Rastreio','fa-map-marker-alt']
    ]},
    { id: 'compras-hub', label: 'Compras e Fornecedores', icon: 'fa-shopping-basket', description: 'Compras, fornecedores e transportadoras.', children: [
      ['compras','Compras','fa-shopping-bag'],['fornecedores','Fornecedores','fa-truck'],['transportadoras','Transportadoras','fa-shipping-fast']
    ]},
    { id: 'estoque-hub', label: 'Estoque e Armazéns', icon: 'fa-warehouse', description: 'Inventário, armazenagem e movimentações.', children: [
      ['estoque','Visão do estoque','fa-warehouse'],['logistica-armazens','Armazéns','fa-building'],['logistica-etiquetas','Etiquetas','fa-tags'],['logistica-picking','Picking','fa-boxes'],['logistica-crossdocking','Cross-docking','fa-exchange-alt']
    ]},
    { id: 'producao-hub', label: 'Produção', icon: 'fa-industry', description: 'Ordens, materiais, custos e qualidade.', children: [
      ['producao','Painel de produção','fa-industry'],['ordens-producao','Ordens de produção','fa-clipboard-list'],['mrp','MRP','fa-cogs'],['bom','Lista de materiais (BOM)','fa-sitemap'],['custos-producao','Custos de produção','fa-calculator'],['controle-qualidade','Controlo de qualidade','fa-check-double'],['planos-producao','Planos de produção','fa-calendar-alt']
    ]},
    { id: 'clientes-hub', label: 'Clientes', icon: 'fa-users', description: 'Carteira, fidelização e portal do cliente.', children: [
      ['clientes','Carteira de clientes','fa-users'],['clientes-fidelidade','Fidelidade','fa-star'],['clientes-cupons','Cupões','fa-ticket-alt'],['clientes-segmentacao','Segmentação','fa-users-cog'],['portal-cliente','Portal do cliente','fa-user-circle']
    ]},
    { id: 'crm-hub', label: 'CRM e Marketing', icon: 'fa-handshake', description: 'Leads, oportunidades, campanhas e análise.', children: [
      ['crm','CRM','fa-handshake'],['crm-pipeline','Pipeline','fa-columns'],['crm-automacao','Automação','fa-robot'],['crm-score','Pontuação de leads','fa-chart-line'],['crm-remarketing','Remarketing','fa-retweet'],['marketing-campanhas','Campanhas','fa-bullhorn'],['marketing-analise','Análise de marketing','fa-chart-pie']
    ]},
    { id: 'financeiro-hub', label: 'Financeiro e Fiscal', icon: 'fa-coins', description: 'Finanças, impostos e integração fiscal.', children: [
      ['financeiro','Financeiro','fa-coins'],['fiscal','Fiscal e AGT','fa-landmark']
    ]},
    { id: 'rh-hub', label: 'Recursos Humanos', icon: 'fa-user-tie', description: 'Equipa, contratos, ponto e desenvolvimento.', children: [
      ['rh','Funcionários','fa-users'],['rh-recrutamento','Recrutamento','fa-user-plus'],['rh-desempenho','Desempenho','fa-chart-bar'],['rh-beneficios','Benefícios','fa-gift'],['rh-onboarding','Integração de colaboradores','fa-user-graduate'],['rh-ponto','Ponto e assiduidade','fa-clock'],['rh-rescisao','Rescisões','fa-file-signature'],['rh-plano-carreira','Plano de carreira','fa-arrow-up']
    ]},
    { id: 'projetos-hub', label: 'Projetos e Tarefas', icon: 'fa-project-diagram', description: 'Planeamento, equipas, custos e riscos.', children: [
      ['projetos','Projetos','fa-project-diagram'],['projetos-tarefas','Tarefas','fa-tasks'],['projetos-kanban','Kanban','fa-columns'],['projetos-gantt','Gantt','fa-chart-bar'],['projetos-recursos','Recursos','fa-users-cog'],['projetos-timesheet','Tempos de trabalho','fa-clock'],['projetos-custos','Custos de projeto','fa-calculator'],['projetos-riscos','Riscos','fa-exclamation-triangle']
    ]},
    { id: 'ativos-hub', label: 'Ativos e Património', icon: 'fa-building', description: 'Ativos, depreciação, manutenção e garantias.', children: [
      ['ativos','Ativos','fa-building'],['ativos-depreciacao','Depreciação','fa-chart-line'],['ativos-manutencao','Manutenção','fa-tools'],['ativos-garantia','Garantias','fa-shield-alt']
    ]},
    { id: 'frota-hub', label: 'Frota e GPS', icon: 'fa-truck-moving', description: 'Veículos, rotas, combustível e localização.', children: [
      ['frota','Veículos','fa-truck-moving'],['frota-manutencao','Manutenção da frota','fa-tools'],['frota-rotas','Rotas','fa-route'],['frota-gps','GPS e mapa','fa-satellite'],['frota-combustivel','Combustível','fa-gas-pump'],['frota-documentos','Documentos','fa-file-alt'],['frota-multas','Multas','fa-exclamation-circle'],['frota-desempenho','Desempenho','fa-chart-bar']
    ]},
    { id: 'assistencia-hub', label: 'Assistência Técnica', icon: 'fa-tools', description: 'Ordens de serviço, técnicos e calendário.', children: [
      ['os','Ordens de serviço','fa-clipboard-list'],['os-manutencao','Manutenção','fa-tools'],['os-checklist','Checklists','fa-clipboard-check'],['os-calendario','Calendário','fa-calendar-alt'],['os-tecnicos','Técnicos','fa-user-cog'],['tickets','Tickets de suporte','fa-ticket-alt']
    ]},
    { id: 'logistica-hub', label: 'Logística e Entregas', icon: 'fa-route', description: 'Rotas, entregas e rastreamento.', children: [
      ['logistica-roteirizacao','Roteirização','fa-route'],['logistica-rastreio','Rastreio de entregas','fa-map-marked-alt']
    ]},
    { id: 'documentos-hub', label: 'Contratos e Documentos', icon: 'fa-folder-open', description: 'Contratos, arquivos e documentação.', children: [
      ['contratos','Contratos','fa-file-contract'],['documentos','Documentos','fa-folder-open']
    ]},
    { id: 'formacao-hub', label: 'Formação e Cursos', icon: 'fa-graduation-cap', description: 'Cursos, certificações e progresso.', children: [
      ['elearning-cursos','Cursos','fa-graduation-cap'],['elearning-alunos','Alunos, aulas e notas','fa-user-graduate'],['elearning-modelos','Modelos de certificado','fa-certificate'],['elearning-certificacoes','Certificações','fa-award'],['elearning-quizzes','Questionários','fa-question-circle'],['elearning-progresso','Progresso','fa-chart-line'],['elearning-relatorios','Relatórios de formação','fa-file-alt']
    ]},
    { id: 'administracao-hub', label: 'Administração', icon: 'fa-cog', description: 'Utilizadores, permissões, auditoria e sistema.', children: [
      ['usuarios','Utilizadores e permissões','fa-user-shield'],['integracoes-api','Chaves de API / Loja','fa-key'],['pagamentos-integracoes','Métodos de pagamento','fa-credit-card'],['auditoria','Auditoria','fa-history'],['dispositivos','Dispositivos e impressão','fa-print'],['config','Configurações','fa-cog'],['modulos','Gestão de módulos','fa-code'],['perfil','Meu perfil','fa-user-circle'],['notificacoes','Notificações','fa-bell']
    ]},
    { id: 'relatorios-hub', label: 'Relatórios', icon: 'fa-chart-bar', description: 'Indicadores e relatórios de gestão.', children: [
      ['relatorios','Relatórios gerais','fa-chart-bar']
    ]}
  ];

  function can(id) { return typeof originalCanAccess !== 'function' || originalCanAccess(id); }
  function visibleChildren(group) { return group.children.filter(function (item) { return can(item[0]); }); }
  function groupForRoute(id) {
    return groups.find(function (group) { return group.children.some(function (item) { return item[0] === id; }); });
  }
  function card(group, item) {
    return '<button class="kanawa-module-tile" type="button" onclick="openModule(\'' + item[0] + '\')">' +
      '<span class="kanawa-module-icon"><i class="fas ' + item[2] + '"></i></span>' +
      '<span class="kanawa-module-tile-copy"><strong>' + item[1] + '</strong><small>Abrir e gerir</small></span>' +
      '<i class="fas fa-chevron-right kanawa-module-arrow"></i></button>';
  }
  function renderHub(group) {
    const items = visibleChildren(group);
    return '<section class="kanawa-module-home">' +
      '<div class="card kanawa-module-heading"><div><span class="kanawa-module-kicker">MÓDULO</span><h2><i class="fas ' + group.icon + '"></i> ' + group.label + '</h2><p>' + group.description + '</p></div><span class="kanawa-module-count">' + items.length + ' opções</span></div>' +
      '<div class="kanawa-module-grid">' + items.map(function (item) { return card(group, item); }).join('') + '</div></section>';
  }
  window.renderSidebar = function () {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    let html = '';
    if (can('dashboard')) html += '<button class="sidebar-item" data-id="dashboard" onclick="openModule(\'dashboard\')"><i class="fas fa-chart-pie"></i><span>Início</span></button>';
    groups.forEach(function (group) {
      if (visibleChildren(group).length) html += '<button class="sidebar-item" data-id="' + group.id + '" onclick="openModule(\'' + group.id + '\')"><i class="fas ' + group.icon + '"></i><span>' + group.label + '</span></button>';
    });
    sidebar.innerHTML = html;
    const active = groupForRoute(activeModule);
    const activeId = active ? active.id : activeModule;
    sidebar.querySelectorAll('.sidebar-item').forEach(function (item) {
      item.classList.toggle('active', item.dataset.id === activeId);
    });
  };
  window.openModule = async function (id) {
    const group = groups.find(function (item) { return item.id === id; });
    if (group) {
      const items = visibleChildren(group);
      if (!items.length) { if (window.toast) window.toast('Sem permissões para este módulo.', 'warning'); return; }
      activeModule = id;
      const content = document.getElementById('content');
      if (content) { content.innerHTML = renderHub(group); content.scrollTop = 0; }
      document.querySelectorAll('.sidebar-item').forEach(function (item) { item.classList.toggle('active', item.dataset.id === id); });
      closeSidebar();
      return;
    }
    if (typeof originalOpenModule !== 'function') return;
    await originalOpenModule.call(window, id);
    activeModule = id;
    const parent = groupForRoute(id);
    if (parent) {
      document.querySelectorAll('.sidebar-item').forEach(function (item) { item.classList.toggle('active', item.dataset.id === parent.id); });
    }
    closeSidebar();
    if (id === 'frota-gps' && typeof window.initFrotaGpsMap === 'function') {
      window.initFrotaGpsMap().catch(function (error) {
        const status = document.getElementById('frotaGpsMapStatus');
        if (status) status.textContent = 'Não foi possível carregar o mapa: ' + error.message;
      });
    }
  };
  function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }
  window.toggleSidebar = function (force) {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (!sidebar) return;
    const open = typeof force === 'boolean' ? force : !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open);
    if (backdrop) backdrop.classList.toggle('active', open);
  };
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) closeSidebar();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.renderSidebar);
  else window.renderSidebar();
})();