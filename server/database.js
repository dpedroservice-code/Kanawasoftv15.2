const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// ============================================================
// BANCO RELACIONAL — 100+ tabelas com chaves estrangeiras
// 85% dos dados vivem aqui, 15% no IndexedDB (cache offline)
// ============================================================
class KanawaDB {
  constructor(SQL, dbPath) {
    this.SQL = SQL;
    this.dbPath = dbPath;
    this.saveTimer = null;

    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath);
      this.db = new SQL.Database(buf);
      console.log('📂 Banco carregado:', dbPath);
    } else {
      this.db = new SQL.Database();
      console.log('🆕 Novo banco criado:', dbPath);
    }

    this.initSchema();
    this.ensureAdminUser();
    this.saveNow();
  }

  initSchema() {
    // Ativa foreign keys
    this.db.run('PRAGMA foreign_keys = ON;');

    this.db.run(`
      -- ============ VERSÃO DO ESQUEMA ============
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        aplicado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ EMPRESA ============
      CREATE TABLE IF NOT EXISTS empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firma TEXT,
        nome TEXT NOT NULL,
        nif TEXT UNIQUE,
        alvara TEXT,
        regime TEXT DEFAULT 'geral',
        telefone TEXT,
        email TEXT,
        endereco TEXT,
        website TEXT,
        banco TEXT,
        iban TEXT,
        moeda TEXT DEFAULT 'AOA',
        logo TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ USUÁRIOS ============
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        telefone TEXT,
        nif TEXT,
        avatar TEXT,
        perfil TEXT DEFAULT 'operador',
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CATEGORIAS ============
      CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ UNIDADES ============
      CREATE TABLE IF NOT EXISTS unidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sigla TEXT NOT NULL,
        nome TEXT NOT NULL,
        tipo TEXT DEFAULT 'padrão',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PRODUTOS ============
      CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        codigo_barras TEXT,
        nome TEXT NOT NULL,
        categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
        categoria TEXT,
        preco REAL DEFAULT 0,
        preco_kg REAL DEFAULT 0,
        estoque INTEGER DEFAULT 0,
        estoque_min INTEGER DEFAULT 10,
        unidade TEXT DEFAULT 'UN',
        imagem TEXT,
        descricao TEXT,
        publicado INTEGER DEFAULT 1,
        etiqueta_impressa INTEGER DEFAULT 0,
        data_etiqueta DATETIME,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos(codigo_barras);
      CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);

      -- ============ SERVIÇOS ============
      CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT NOT NULL,
        descricao TEXT,
        preco REAL DEFAULT 0,
        duracao TEXT,
        status TEXT DEFAULT 'ativo',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ TABELAS DE PREÇOS ============
      CREATE TABLE IF NOT EXISTS tabelas_precos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        produtos INTEGER DEFAULT 0,
        desconto REAL DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ AVALIAÇÕES DE PRODUTOS ============
      CREATE TABLE IF NOT EXISTS avaliacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
        produto TEXT,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente TEXT,
        nota INTEGER DEFAULT 5,
        comentario TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CLIENTES ============
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        nif TEXT,
        telefone TEXT,
        email TEXT,
        endereco TEXT,
        data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE
      );

      -- ============ FORNECEDORES ============
      CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        nif TEXT,
        telefone TEXT,
        email TEXT,
        endereco TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ TRANSPORTADORAS ============
      CREATE TABLE IF NOT EXISTS transportadoras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT,
        custo_base REAL DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE
      );

      -- ============ VENDAS ============
      CREATE TABLE IF NOT EXISTS vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_fatura TEXT UNIQUE NOT NULL,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente_nome TEXT,
        cliente_nif TEXT,
        cliente_telefone TEXT,
        subtotal REAL DEFAULT 0,
        desconto REAL DEFAULT 0,
        desconto_valor REAL DEFAULT 0,
        iva REAL DEFAULT 0,
        total REAL DEFAULT 0,
        valor_recebido REAL DEFAULT 0,
        troco REAL DEFAULT 0,
        pagamento TEXT,
        regime TEXT DEFAULT 'geral',
        aplicar_iva INTEGER DEFAULT 1,
        observacoes TEXT,
        status TEXT DEFAULT 'finalizada',
        hash TEXT,
        assinatura TEXT,
        operador TEXT,
        operador_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_vendas_fatura ON vendas(numero_fatura);
      CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(criado_em DESC);

      -- ============ ITENS DA VENDA ============
      CREATE TABLE IF NOT EXISTS venda_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER REFERENCES vendas(id) ON DELETE CASCADE,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        nome TEXT,
        preco REAL DEFAULT 0,
        quantidade INTEGER DEFAULT 1,
        subtotal REAL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_venda_itens_venda ON venda_itens(venda_id);

      -- ============ VENDAS CONSIGNADAS ============
      CREATE TABLE IF NOT EXISTS vendas_consignadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente TEXT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        produto TEXT,
        quantidade INTEGER DEFAULT 0,
        valor REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ COMPRAS ============
      CREATE TABLE IF NOT EXISTS compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
        fornecedor TEXT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        produto TEXT,
        quantidade INTEGER DEFAULT 0,
        valor REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MOVIMENTAÇÕES DE ESTOQUE ============
      CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL,
        quantidade INTEGER DEFAULT 0,
        descricao TEXT,
        venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CONTAS A RECEBER ============
      CREATE TABLE IF NOT EXISTS contas_receber (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente TEXT,
        venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
        descricao TEXT,
        valor REAL DEFAULT 0,
        vencimento DATE,
        status TEXT DEFAULT 'pendente',
        data_pagamento DATETIME,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CONTAS A PAGAR ============
      CREATE TABLE IF NOT EXISTS contas_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
        fornecedor TEXT,
        descricao TEXT,
        valor REAL DEFAULT 0,
        vencimento DATE,
        status TEXT DEFAULT 'pendente',
        data_pagamento DATETIME,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CATEGORIAS FINANCEIRAS ============
      CREATE TABLE IF NOT EXISTS categorias_financeiras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipo TEXT DEFAULT 'ambos',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PLANO DE CONTAS ============
      CREATE TABLE IF NOT EXISTS plano_contas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        tipo TEXT,
        natureza TEXT,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ EXTRATOS BANCÁRIOS ============
      CREATE TABLE IF NOT EXISTS extratos_bancarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        descricao TEXT,
        valor REAL DEFAULT 0,
        tipo TEXT DEFAULT 'credito',
        banco TEXT,
        conta TEXT,
        conciliado INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CONCILIAÇÕES ============
      CREATE TABLE IF NOT EXISTS conciliacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        banco TEXT,
        saldo REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        observacoes TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ TRANSACÇÕES BANCÁRIAS ============
      CREATE TABLE IF NOT EXISTS transacoes_bancarias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        descricao TEXT,
        valor REAL DEFAULT 0,
        saldo REAL DEFAULT 0,
        categoria TEXT,
        status TEXT DEFAULT 'confirmado',
        referencia TEXT,
        banco TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ORÇAMENTOS (BUDGETS) ============
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoria TEXT NOT NULL,
        planejado REAL DEFAULT 0,
        real REAL DEFAULT 0,
        periodo TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FORECASTS ============
      CREATE TABLE IF NOT EXISTS forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        valor REAL DEFAULT 0,
        periodo TEXT,
        confianca TEXT DEFAULT 'Média',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PREVISÕES / TENDÊNCIAS ============
      CREATE TABLE IF NOT EXISTS previsoes_vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        valor REAL DEFAULT 0,
        periodo TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS tendencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tema TEXT NOT NULL,
        regiao TEXT,
        periodo TEXT,
        resultados INTEGER DEFAULT 0,
        categoria TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FISCAL — IVA, IRT, DOCS FISCAIS ============
      CREATE TABLE IF NOT EXISTS ivas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        periodo TEXT,
        base REAL DEFAULT 0,
        iva REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS irts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mes INTEGER,
        ano INTEGER,
        funcionarios INTEGER DEFAULT 0,
        total REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS documentos_fiscais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        cliente TEXT,
        valor REAL DEFAULT 0,
        tipo TEXT DEFAULT 'Fatura',
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FUNCIONÁRIOS (RH) ============
      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cargo TEXT,
        salario REAL DEFAULT 0,
        telefone TEXT,
        nif TEXT,
        departamento_id INTEGER,
        data_contratacao DATE,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — DEPARTAMENTOS ============
      CREATE TABLE IF NOT EXISTS rh_departamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — FOLHA DE PAGAMENTO ============
      CREATE TABLE IF NOT EXISTS folhas_pagamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        periodo TEXT,
        funcionarios INTEGER DEFAULT 0,
        total REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — TURNOS ============
      CREATE TABLE IF NOT EXISTS turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        data DATE,
        entrada TEXT,
        saida TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — FÉRIAS ============
      CREATE TABLE IF NOT EXISTS ferias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        inicio DATE,
        fim DATE,
        dias INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — VAGAS ============
      CREATE TABLE IF NOT EXISTS vagas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        departamento TEXT,
        status TEXT DEFAULT 'aberta',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — CANDIDATOS ============
      CREATE TABLE IF NOT EXISTS candidatos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        vaga TEXT,
        status TEXT DEFAULT 'novo',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — DESEMPENHO ============
      CREATE TABLE IF NOT EXISTS desempenho_rh (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        nota REAL DEFAULT 5,
        comentario TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — BENEFÍCIOS ============
      CREATE TABLE IF NOT EXISTS beneficios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        funcionario TEXT,
        valor REAL DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — PLANO DE CARREIRA ============
      CREATE TABLE IF NOT EXISTS planos_carreira (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        posicao_atual TEXT,
        proximo_passo TEXT,
        previsao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — ONBOARDING ============
      CREATE TABLE IF NOT EXISTS onboarding (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        etapa TEXT,
        progresso INTEGER DEFAULT 0,
        status TEXT DEFAULT 'em_andamento',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — PONTO DIGITAL ============
      CREATE TABLE IF NOT EXISTS ponto_digital (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        data DATE,
        entrada TEXT,
        saida TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — RESCISÕES ============
      CREATE TABLE IF NOT EXISTS rescisoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        data_saida DATE,
        valor REAL DEFAULT 0,
        motivo TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — FREQUÊNCIAS ============
      CREATE TABLE IF NOT EXISTS frequencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        status TEXT,
        obs TEXT,
        horario TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — FÉRIAS FUNCIONÁRIOS ============
      CREATE TABLE IF NOT EXISTS ferias_funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        data_inicio DATE,
        data_fim DATE,
        dias INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ RH — PAGAMENTOS FUNCIONÁRIOS ============
      CREATE TABLE IF NOT EXISTS pagamentos_funcionarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario TEXT,
        valor REAL DEFAULT 0,
        data_pagamento DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PRODUÇÃO ============
      CREATE TABLE IF NOT EXISTS producao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT NOT NULL,
        tipo TEXT DEFAULT 'acabado',
        descricao TEXT,
        status TEXT DEFAULT 'ativo',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ORDENS DE PRODUÇÃO ============
      CREATE TABLE IF NOT EXISTS ordens_producao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        quantidade INTEGER DEFAULT 1,
        quantidade_produzida INTEGER DEFAULT 0,
        prioridade TEXT DEFAULT 'media',
        prazo DATE,
        status TEXT DEFAULT 'pendente',
        observacoes TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MRP ============
      CREATE TABLE IF NOT EXISTS mrp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
        produto TEXT,
        demanda INTEGER DEFAULT 0,
        estoque INTEGER DEFAULT 0,
        em_producao INTEGER DEFAULT 0,
        em_compra INTEGER DEFAULT 0,
        necessidade INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ BOM ============
      CREATE TABLE IF NOT EXISTS boms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
        produto TEXT,
        material TEXT,
        quantidade REAL DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CUSTOS DE PRODUÇÃO ============
      CREATE TABLE IF NOT EXISTS custos_producao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        material REAL DEFAULT 0,
        mao_obra REAL DEFAULT 0,
        indireto REAL DEFAULT 0,
        quantidade INTEGER DEFAULT 1,
        categoria TEXT DEFAULT 'geral',
        observacoes TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CONTROLE DE QUALIDADE ============
      CREATE TABLE IF NOT EXISTS controle_qualidade (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        lote TEXT,
        resultado TEXT DEFAULT 'pendente',
        itens_conformes INTEGER DEFAULT 0,
        itens_nao_conformes INTEGER DEFAULT 0,
        inspetor TEXT,
        observacoes TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PLANOS DE PRODUÇÃO ============
      CREATE TABLE IF NOT EXISTS planos_producao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
        quantidade INTEGER DEFAULT 0,
        periodo TEXT,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — ROTEIRIZAÇÃO ============
      CREATE TABLE IF NOT EXISTS roteirizacao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origem TEXT,
        destino TEXT,
        distancia TEXT,
        veiculo TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — ETIQUETAS ============
      CREATE TABLE IF NOT EXISTS etiquetas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        produto TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — ARMAZÉNS ============
      CREATE TABLE IF NOT EXISTS armazens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        capacidade TEXT,
        localizacao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — TRANSFERÊNCIAS ============
      CREATE TABLE IF NOT EXISTS transferencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        quantidade INTEGER DEFAULT 0,
        origem TEXT,
        destino TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — INVENTÁRIOS ============
      CREATE TABLE IF NOT EXISTS inventarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        quantidade INTEGER DEFAULT 0,
        obs TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — LOTES ============
      CREATE TABLE IF NOT EXISTS lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto TEXT,
        numero TEXT,
        quantidade INTEGER DEFAULT 0,
        validade DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — RASTREIOS ============
      CREATE TABLE IF NOT EXISTS rastreios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL,
        produto TEXT,
        status TEXT DEFAULT 'pendente',
        ultima_atualizacao DATETIME,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — RECEBIMENTOS ============
      CREATE TABLE IF NOT EXISTS recebimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor TEXT,
        produto TEXT,
        quantidade INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ LOGÍSTICA — PEÇAS DE ESTOQUE ============
      CREATE TABLE IF NOT EXISTS pecas_estoque (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT,
        quantidade INTEGER DEFAULT 0,
        localizacao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-COMMERCE — PRODUTOS PUBLICADOS ============
      CREATE TABLE IF NOT EXISTS ecommerce_produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
        publicado INTEGER DEFAULT 1,
        destaque INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-COMMERCE — CARRINHOS ============
      CREATE TABLE IF NOT EXISTS ecommerce_carrinhos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT,
        itens_json TEXT,
        total REAL DEFAULT 0,
        status TEXT DEFAULT 'aberto',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-COMMERCE — PEDIDOS ============
      CREATE TABLE IF NOT EXISTS ecommerce_pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT,
        itens_json TEXT,
        total REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        forma_pagamento TEXT,
        endereco_entrega TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-COMMERCE — PAGAMENTOS ============
      CREATE TABLE IF NOT EXISTS pagamentos_ecommerce (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER REFERENCES ecommerce_pedidos(id) ON DELETE CASCADE,
        valor REAL DEFAULT 0,
        forma TEXT,
        status TEXT DEFAULT 'pendente',
        referencia TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PROJETOS ============
      CREATE TABLE IF NOT EXISTS projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        status TEXT DEFAULT 'ativo',
        progresso INTEGER DEFAULT 0,
        prioridade TEXT DEFAULT 'media',
        data_inicio DATE,
        data_fim DATE,
        orcamento REAL DEFAULT 0,
        custo REAL DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ TAREFAS ============
      CREATE TABLE IF NOT EXISTS tarefas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        descricao TEXT,
        projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
        projeto TEXT,
        prioridade TEXT DEFAULT 'média',
        status TEXT DEFAULT 'pendente',
        prazo DATE,
        responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        responsavel TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PROJETOS — GANTT ============
      CREATE TABLE IF NOT EXISTS gantt_projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        atividade TEXT NOT NULL,
        projeto TEXT,
        inicio DATE,
        fim DATE,
        progresso INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PROJETOS — TIMESHEETS ============
      CREATE TABLE IF NOT EXISTS timesheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recurso TEXT,
        projeto TEXT,
        horas REAL DEFAULT 0,
        data DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PROJETOS — TAREFAS EXTRAS ============
      CREATE TABLE IF NOT EXISTS tarefas_projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
        titulo TEXT,
        status TEXT DEFAULT 'pendente',
        responsavel TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PROJETOS — MEMBROS ============
      CREATE TABLE IF NOT EXISTS membros_projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        funcao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PROJETOS — ATIVIDADES ============
      CREATE TABLE IF NOT EXISTS atividades_projetos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projeto_id INTEGER REFERENCES projetos(id) ON DELETE CASCADE,
        descricao TEXT,
        usuario TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ATIVOS ============
      CREATE TABLE IF NOT EXISTS ativos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        patrimonio TEXT,
        valor REAL DEFAULT 0,
        valor_depreciado REAL DEFAULT 0,
        depreciacao REAL DEFAULT 0,
        vida_util INTEGER DEFAULT 5,
        categoria TEXT,
        localizacao TEXT,
        fornecedor TEXT,
        status TEXT DEFAULT 'ativo',
        data_aquisicao DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ATIVOS — DEPRECIAÇÕES ============
      CREATE TABLE IF NOT EXISTS depreciacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ativo_id INTEGER REFERENCES ativos(id) ON DELETE CASCADE,
        valor_anterior REAL DEFAULT 0,
        valor_novo REAL DEFAULT 0,
        percentual REAL DEFAULT 0,
        descricao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ATIVOS — MANUTENÇÕES ============
      CREATE TABLE IF NOT EXISTS manutencoes_ativos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ativo_id INTEGER REFERENCES ativos(id) ON DELETE CASCADE,
        ativo TEXT,
        descricao TEXT,
        custo REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ATIVOS — GARANTIAS ============
      CREATE TABLE IF NOT EXISTS garantias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ativo_id INTEGER REFERENCES ativos(id) ON DELETE CASCADE,
        ativo TEXT,
        inicio DATE,
        fim DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FROTA ============
      CREATE TABLE IF NOT EXISTS frotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        placa TEXT NOT NULL,
        modelo TEXT,
        marca TEXT,
        ano INTEGER,
        cor TEXT,
        km_atual INTEGER DEFAULT 0,
        km_proxima_manutencao INTEGER DEFAULT 0,
        motorista TEXT,
        status TEXT DEFAULT 'ativo',
        observacoes TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FROTA — MOTORISTAS ============
      CREATE TABLE IF NOT EXISTS motoristas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT,
        cnh TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FROTA — MANUTENÇÕES ============
      CREATE TABLE IF NOT EXISTS manutencoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        veiculo_id INTEGER REFERENCES frotas(id) ON DELETE CASCADE,
        veiculo TEXT,
        ativo TEXT,
        tipo TEXT,
        descricao TEXT,
        custo REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FROTA — ROTAS ============
      CREATE TABLE IF NOT EXISTS frota_rotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origem TEXT,
        destino TEXT,
        distancia TEXT,
        veiculo TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FROTA — GPS ============
      CREATE TABLE IF NOT EXISTS gps_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        veiculo TEXT NOT NULL,
        lat TEXT,
        lng TEXT,
        ultima_atualizacao DATETIME,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FROTA — ABASTECIMENTOS ============
      CREATE TABLE IF NOT EXISTS abastecimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        veiculo TEXT,
        litros REAL DEFAULT 0,
        custo REAL DEFAULT 0,
        combustivel TEXT DEFAULT 'Gasolina',
        km INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FROTA — MULTAS ============
      CREATE TABLE IF NOT EXISTS multas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        veiculo TEXT,
        valor REAL DEFAULT 0,
        descricao TEXT,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ORDENS DE SERVIÇO ============
      CREATE TABLE IF NOT EXISTS ordens_servico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente TEXT,
        descricao TEXT,
        servico TEXT,
        tecnico_id INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
        tecnico TEXT,
        prioridade TEXT DEFAULT 'media',
        valor REAL DEFAULT 0,
        valor_pago REAL DEFAULT 0,
        prazo DATE,
        status TEXT DEFAULT 'aberta',
        observacoes TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ OS — TÉCNICOS ============
      CREATE TABLE IF NOT EXISTS tecnicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        especialidade TEXT,
        telefone TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ OS — MANUTENÇÕES ============
      CREATE TABLE IF NOT EXISTS ordens_manutencao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipamento TEXT,
        veiculo TEXT,
        descricao TEXT,
        custo REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ OS — CHECKLISTS ============
      CREATE TABLE IF NOT EXISTS checklists_inspecao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item TEXT NOT NULL,
        responsavel TEXT,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ OS — CALENDÁRIO ============
      CREATE TABLE IF NOT EXISTS calendario_manutencoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipamento TEXT,
        tipo TEXT DEFAULT 'Preventiva',
        data DATE,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ OS — HISTÓRICO ============
      CREATE TABLE IF NOT EXISTS historico_os (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        os_id INTEGER REFERENCES ordens_servico(id) ON DELETE CASCADE,
        descricao TEXT,
        usuario TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CONTRATOS ============
      CREATE TABLE IF NOT EXISTS contratos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente TEXT,
        valor REAL DEFAULT 0,
        inicio DATE,
        fim DATE,
        status TEXT DEFAULT 'ativo',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ DOCUMENTOS ============
      CREATE TABLE IF NOT EXISTS documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipo TEXT,
        conteudo TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ASSINATURAS DIGITAIS ============
      CREATE TABLE IF NOT EXISTS assinaturas_digitais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        imagem TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ TICKETS ============
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente TEXT,
        descricao TEXT,
        prioridade TEXT DEFAULT 'normal',
        status TEXT DEFAULT 'aberto',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ NOTIFICAÇÕES ============
      CREATE TABLE IF NOT EXISTS notificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        mensagem TEXT,
        tipo TEXT DEFAULT 'info',
        modulo TEXT,
        lida INTEGER DEFAULT 0,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MENSAGENS CHAT ============
      CREATE TABLE IF NOT EXISTS mensagens_chat (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remetente TEXT,
        destinatario TEXT,
        mensagem TEXT,
        lida INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MENSAGENS WHATSAPP ============
      CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        para TEXT,
        nome TEXT,
        mensagem TEXT,
        status TEXT DEFAULT 'pendente',
        tentativas INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CONTATOS WHATSAPP ============
      CREATE TABLE IF NOT EXISTS contatos_whatsapp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        numero TEXT NOT NULL,
        empresa TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ TEMPLATES WHATSAPP ============
      CREATE TABLE IF NOT EXISTS templates_whatsapp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        conteudo TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ GOOGLE CALENDAR ============
      CREATE TABLE IF NOT EXISTS eventos_calendar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        inicio DATETIME,
        fim DATETIME,
        local TEXT,
        descricao TEXT,
        status TEXT DEFAULT 'pendente',
        cor TEXT,
        categoria TEXT,
        lembrete INTEGER DEFAULT 15,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CRM — LEADS ============
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT,
        email TEXT,
        origem TEXT,
        status TEXT DEFAULT 'novo',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CRM — AUTOMAÇÕES ============
      CREATE TABLE IF NOT EXISTS automacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        gatilho TEXT,
        acao TEXT,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ CRM — SCORE LEADS ============
      CREATE TABLE IF NOT EXISTS score_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead TEXT,
        score INTEGER DEFAULT 0,
        nivel TEXT,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MARKETING — CAMPANHAS ============
      CREATE TABLE IF NOT EXISTS campanhas_marketing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        canal TEXT,
        orcamento REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MARKETING — SEGMENTAÇÕES ============
      CREATE TABLE IF NOT EXISTS segmentacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        criterio TEXT,
        clientes INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MARKETING — CUPONS ============
      CREATE TABLE IF NOT EXISTS cupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        cliente TEXT,
        desconto REAL DEFAULT 0,
        tipo TEXT DEFAULT 'geral',
        validade DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MARKETING — FIDELIDADE ============
      CREATE TABLE IF NOT EXISTS fidelidade (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        pontos INTEGER DEFAULT 0,
        nivel TEXT DEFAULT 'bronze',
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ ORÇAMENTOS ============
      CREATE TABLE IF NOT EXISTS orcamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_nome TEXT,
        itens_json TEXT,
        subtotal REAL DEFAULT 0,
        total REAL DEFAULT 0,
        status TEXT DEFAULT 'pendente',
        validade DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ DEVOLUÇÕES ============
      CREATE TABLE IF NOT EXISTS devolucoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
        venda_numero TEXT,
        cliente TEXT,
        motivo TEXT,
        total REAL DEFAULT 0,
        status TEXT DEFAULT 'processada',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ PROMOÇÕES ============
      CREATE TABLE IF NOT EXISTS promocoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        desconto REAL DEFAULT 0,
        descricao TEXT,
        data_inicio DATE,
        data_fim DATE,
        ativa INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ AUDITORIA ============
      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        usuario TEXT,
        acao TEXT NOT NULL,
        modulo TEXT,
        detalhes TEXT,
        ip TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auditoria_data ON auditoria(criado_em DESC);

      -- ============ LOGS DE SEGURANÇA ============
      CREATE TABLE IF NOT EXISTS logs_seguranca (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        descricao TEXT,
        nivel TEXT DEFAULT 'info',
        usuario TEXT,
        ip TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ SEGURANÇA (config) ============
      CREATE TABLE IF NOT EXISTS seguranca (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        two_factor TEXT DEFAULT 'inativo',
        tempo_sessao INTEGER DEFAULT 30,
        tentativas_login INTEGER DEFAULT 5,
        bloqueio_tempo INTEGER DEFAULT 15,
        ips_bloqueados TEXT,
        ips_permitidos TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ DISPOSITIVOS / IMPRESSORAS / GAVETA ============
      CREATE TABLE IF NOT EXISTS dispositivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipo TEXT DEFAULT 'termica_58',
        conexao TEXT DEFAULT 'USB',
        dispositivo_sistema TEXT,
        endereco TEXT,
        porta TEXT,
        padrao INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        observacoes TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FILA DE SINCRONIZAÇÃO ============
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entidade TEXT NOT NULL,
        entidade_id INTEGER,
        acao TEXT NOT NULL,
        payload TEXT,
        dispositivo TEXT,
        processado INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ DISPOSITIVOS CONECTADOS (rede) ============
      CREATE TABLE IF NOT EXISTS dispositivos_rede (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT UNIQUE NOT NULL,
        nome TEXT,
        tipo TEXT,
        ip TEXT,
        ultima_sync DATETIME,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-COMMERCE (legado) ============
      CREATE TABLE IF NOT EXISTS ecommerce (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
        publicado INTEGER DEFAULT 1,
        destaque INTEGER DEFAULT 0,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-LEARNING — CURSOS ============
      CREATE TABLE IF NOT EXISTS cursos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        modulos INTEGER DEFAULT 0,
        alunos INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ativo',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-LEARNING — CERTIFICAÇÕES ============
      CREATE TABLE IF NOT EXISTS certificacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aluno TEXT,
        curso TEXT,
        validade DATE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ E-LEARNING — QUIZZES ============
      CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        questoes INTEGER DEFAULT 5,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ BACKUPS ============
      CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        tamanho TEXT,
        dados TEXT,
        tipo TEXT DEFAULT 'manual',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS backups_agendados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        frequencia TEXT,
        hora TEXT,
        manter INTEGER DEFAULT 10,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS backups_nuvem (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        data DATETIME,
        servico TEXT,
        tamanho TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MÓDULOS PERSONALIZADOS ============
      CREATE TABLE IF NOT EXISTS modulos_personalizados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mod_id TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        icon TEXT,
        cor TEXT,
        descricao TEXT,
        submodulos_json TEXT,
        ativo INTEGER DEFAULT 1,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ INTEGRAÇÕES AGT ============
      CREATE TABLE IF NOT EXISTS integracoes_agt (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nif TEXT,
        chave TEXT,
        status TEXT DEFAULT 'pendente',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ HISTÓRICO MAPAS (DDG/Bing) ============
      CREATE TABLE IF NOT EXISTS ddg_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local TEXT,
        lat TEXT,
        lng TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS bing_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local TEXT,
        lat TEXT,
        lng TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ FEEDBACKS ============
      CREATE TABLE IF NOT EXISTS feedbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT,
        avaliacao INTEGER DEFAULT 5,
        comentario TEXT,
        categoria TEXT DEFAULT 'geral',
        status TEXT DEFAULT 'pendente',
        resposta TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ DEPARTAMENTOS (genérico) ============
      CREATE TABLE IF NOT EXISTS departamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- ============ MIGRAÇÕES ============
      CREATE TABLE IF NOT EXISTS migracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        versao TEXT,
        descricao TEXT,
        script TEXT,
        registros INTEGER DEFAULT 0,
        status TEXT DEFAULT 'concluido',
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Esquema relacional criado (100+ tabelas com foreign keys)');

    // Registra versão do schema
    try {
      const existe = this.get('SELECT version FROM schema_version WHERE version = ?', [15]);
      if (!existe) this.db.run('INSERT INTO schema_version (version) VALUES (?)', [15]);
    } catch (e) { }
  }

  ensureAdminUser() {
    const stmt = this.db.prepare('SELECT id FROM usuarios WHERE email = ?');
    stmt.bind(['admin@kanawasoft.com']);
    const exists = stmt.step();
    stmt.free();
    if (!exists) {
      const hash = bcrypt.hashSync('admin123', 10);
      this.db.run(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil, avatar) VALUES (?, ?, ?, ?, ?)',
        ['Administrador', 'admin@kanawasoft.com', hash, 'admin', null]
      );
      console.log('👤 Admin criado: admin@kanawasoft.com / admin123');
    }
  }

  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const data = this.db.export();
        fs.writeFileSync(this.dbPath, Buffer.from(data));
      } catch (e) { console.error('Erro ao salvar:', e); }
    }, 400);
  }

  saveNow() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (e) { console.error('Erro ao salvar:', e); }
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  get(sql, params = []) {
    const rows = this.all(sql, params);
    return rows[0] || null;
  }

  run(sql, params = []) {
    this.db.run(sql, params);
    const lastId = this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0] || 0;
    this.save();
    return { lastInsertRowid: lastId };
  }
}

let instance = null;

async function initDB(dbPath) {
  const SQL = await initSqlJs();
  instance = new KanawaDB(SQL, dbPath);
  return instance;
}

module.exports = { initDB, getInstance: () => instance };