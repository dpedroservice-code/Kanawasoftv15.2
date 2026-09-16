const bcrypt = require('bcryptjs');
let jwt = null;
try { jwt = require('jsonwebtoken'); } catch (e) { console.warn('⚠️ jsonwebtoken não instalado — auth simplificada'); }

const JWT_SECRET = process.env.JWT_SECRET || 'kanawa-erp-secret';

// ============================================================
// MAPEAMENTO: store (frontend/app.js) → tabela (SQL) + campos válidos
// Cobre TODAS as 135 tabelas do database.js
// ============================================================
const TABLE_MAP = {
  /* ============ EMPRESA / USUÁRIOS ============ */
  empresas:            { table: 'empresas',            fields: ['firma','nome','nif','alvara','regime','telefone','email','endereco','website','banco','iban','moeda','logo'] },
  usuarios:            { table: 'usuarios',            fields: ['nome','email','senha_hash','telefone','nif','avatar','perfil','ativo','empresa_id'] },

  /* ============ CADASTROS BÁSICOS ============ */
  categorias:          { table: 'categorias',          fields: ['nome','descricao','empresa_id'] },
  unidades:            { table: 'unidades',            fields: ['sigla','nome','tipo','empresa_id'] },
  produtos:            { table: 'produtos',            fields: ['codigo','codigo_barras','nome','categoria_id','categoria','preco','preco_kg','estoque','estoque_min','unidade','imagem','descricao','publicado','etiqueta_impressa','data_etiqueta','empresa_id'] },
  servicos:            { table: 'servicos',            fields: ['codigo','nome','descricao','preco','duracao','status','empresa_id'] },
  'tabelas-precos':    { table: 'tabelas_precos',      fields: ['nome','produtos','desconto','ativo','empresa_id'] },
  tabelasPrecos:       { table: 'tabelas_precos',      fields: ['nome','produtos','desconto','ativo','empresa_id'] },
  avaliacoes:          { table: 'avaliacoes',          fields: ['produto_id','produto','cliente_id','cliente','nota','comentario','empresa_id'] },
  'produtos-avaliacoes': { table: 'avaliacoes',        fields: ['produto_id','produto','cliente_id','cliente','nota','comentario','empresa_id'] },

  /* ============ PARCEIROS ============ */
  clientes:            { table: 'clientes',            fields: ['nome','nif','telefone','email','endereco','empresa_id'] },
  fornecedores:        { table: 'fornecedores',        fields: ['nome','nif','telefone','email','endereco','empresa_id'] },
  transportadoras:     { table: 'transportadoras',     fields: ['nome','telefone','custo_base','empresa_id'] },

  /* ============ VENDAS ============ */
  vendas:              { table: 'vendas',              fields: ['numero_fatura','cliente_id','cliente_nome','cliente_nif','cliente_telefone','subtotal','desconto','desconto_valor','iva','total','valor_recebido','troco','pagamento','regime','aplicar_iva','observacoes','status','hash','assinatura','operador','operador_id','empresa_id'] },
  'venda-itens':       { table: 'venda_itens',         fields: ['venda_id','produto_id','nome','preco','quantidade','subtotal'] },
  vendaItens:          { table: 'venda_itens',         fields: ['venda_id','produto_id','nome','preco','quantidade','subtotal'] },
  'vendas-consignadas': { table: 'vendas_consignadas', fields: ['cliente_id','cliente','produto_id','produto','quantidade','valor','status','empresa_id'] },
  vendasConsignadas:   { table: 'vendas_consignadas',  fields: ['cliente_id','cliente','produto_id','produto','quantidade','valor','status','empresa_id'] },
  orcamentos:          { table: 'orcamentos',          fields: ['cliente_nome','itens_json','subtotal','total','status','validade','empresa_id'] },
  devolucoes:          { table: 'devolucoes',          fields: ['venda_id','venda_numero','cliente','motivo','total','status','empresa_id'] },
  promocoes:           { table: 'promocoes',           fields: ['nome','desconto','descricao','data_inicio','data_fim','ativa','empresa_id'] },
  'vendas-promocoes':  { table: 'promocoes',           fields: ['nome','desconto','descricao','data_inicio','data_fim','ativa','empresa_id'] },

  /* ============ COMPRAS / ESTOQUE ============ */
  compras:             { table: 'compras',             fields: ['fornecedor_id','fornecedor','produto_id','produto','quantidade','valor','status','empresa_id'] },
  movimentacoesEstoque:{ table: 'movimentacoes_estoque', fields: ['produto_id','tipo','quantidade','descricao','venda_id','empresa_id'] },
  movimentacoes_estoque:{ table: 'movimentacoes_estoque', fields: ['produto_id','tipo','quantidade','descricao','venda_id','empresa_id'] },

  /* ============ FINANCEIRO ============ */
  contasReceber:       { table: 'contas_receber',      fields: ['cliente_id','cliente','venda_id','descricao','valor','vencimento','status','data_pagamento','empresa_id'] },
  contas_receber:      { table: 'contas_receber',      fields: ['cliente_id','cliente','venda_id','descricao','valor','vencimento','status','data_pagamento','empresa_id'] },
  contasPagar:         { table: 'contas_pagar',        fields: ['fornecedor_id','fornecedor','descricao','valor','vencimento','status','data_pagamento','empresa_id'] },
  contas_pagar:        { table: 'contas_pagar',        fields: ['fornecedor_id','fornecedor','descricao','valor','vencimento','status','data_pagamento','empresa_id'] },
  categoriasFinanceiras:{ table: 'categorias_financeiras', fields: ['nome','tipo','empresa_id'] },
  categorias_financeiras:{ table: 'categorias_financeiras', fields: ['nome','tipo','empresa_id'] },
  planoContas:         { table: 'plano_contas',        fields: ['codigo','nome','tipo','natureza','ativo','empresa_id'] },
  plano_contas:        { table: 'plano_contas',        fields: ['codigo','nome','tipo','natureza','ativo','empresa_id'] },
  extratosBancarios:   { table: 'extratos_bancarios',  fields: ['descricao','valor','tipo','banco','conta','conciliado','empresa_id'] },
  extratos_bancarios:  { table: 'extratos_bancarios',  fields: ['descricao','valor','tipo','banco','conta','conciliado','empresa_id'] },
  conciliacoes:        { table: 'conciliacoes',        fields: ['banco','saldo','status','observacoes','empresa_id'] },
  transacoesBancarias: { table: 'transacoes_bancarias', fields: ['descricao','valor','saldo','categoria','status','referencia','banco','empresa_id'] },
  transacoes_bancarias:{ table: 'transacoes_bancarias', fields: ['descricao','valor','saldo','categoria','status','referencia','banco','empresa_id'] },
  budgets:             { table: 'budgets',             fields: ['categoria','planejado','real','periodo','empresa_id'] },
  forecasts:           { table: 'forecasts',           fields: ['produto','valor','periodo','confianca','empresa_id'] },
  previsoesVendas:     { table: 'previsoes_vendas',    fields: ['produto','valor','periodo','empresa_id'] },
  previsoes_vendas:    { table: 'previsoes_vendas',    fields: ['produto','valor','periodo','empresa_id'] },
  tendencias:          { table: 'tendencias',          fields: ['tema','regiao','periodo','resultados','categoria','empresa_id'] },

  /* ============ FISCAL ============ */
  ivas:                { table: 'ivas',                fields: ['periodo','base','iva','status','empresa_id'] },
  irts:                { table: 'irts',                fields: ['mes','ano','funcionarios','total','status','empresa_id'] },
  documentosFiscais:   { table: 'documentos_fiscais',  fields: ['numero','cliente','valor','tipo','status','empresa_id'] },
  documentos_fiscais:  { table: 'documentos_fiscais',  fields: ['numero','cliente','valor','tipo','status','empresa_id'] },
  integracoesAGT:      { table: 'integracoes_agt',     fields: ['nif','chave','status','empresa_id'] },
  integracoes_agt:     { table: 'integracoes_agt',     fields: ['nif','chave','status','empresa_id'] },

  /* ============ RH ============ */
  funcionarios:        { table: 'funcionarios',        fields: ['nome','cargo','salario','telefone','nif','departamento_id','data_contratacao','ativo','empresa_id'] },
  rhDepartamentos:     { table: 'rh_departamentos',    fields: ['nome','descricao','empresa_id'] },
  rh_departamentos:    { table: 'rh_departamentos',    fields: ['nome','descricao','empresa_id'] },
  departamentos:       { table: 'departamentos',       fields: ['nome','descricao','empresa_id'] },
  folhasPagamento:     { table: 'folhas_pagamento',    fields: ['periodo','funcionarios','total','status','empresa_id'] },
  folhas_pagamento:    { table: 'folhas_pagamento',    fields: ['periodo','funcionarios','total','status','empresa_id'] },
  turnos:              { table: 'turnos',              fields: ['funcionario','data','entrada','saida','empresa_id'] },
  ferias:              { table: 'ferias',              fields: ['funcionario','inicio','fim','dias','status','empresa_id'] },
  vagas:               { table: 'vagas',               fields: ['titulo','departamento','status','empresa_id'] },
  candidatos:          { table: 'candidatos',          fields: ['nome','vaga','status','empresa_id'] },
  desempenhoRH:        { table: 'desempenho_rh',       fields: ['funcionario','nota','comentario','empresa_id'] },
  desempenho_rh:       { table: 'desempenho_rh',       fields: ['funcionario','nota','comentario','empresa_id'] },
  beneficios:          { table: 'beneficios',          fields: ['nome','funcionario','valor','ativo','empresa_id'] },
  planosCarreira:      { table: 'planos_carreira',     fields: ['funcionario','posicao_atual','proximo_passo','previsao','empresa_id'] },
  planos_carreira:     { table: 'planos_carreira',     fields: ['funcionario','posicao_atual','proximo_passo','previsao','empresa_id'] },
  onboarding:          { table: 'onboarding',          fields: ['funcionario','etapa','progresso','status','empresa_id'] },
  pontoDigital:        { table: 'ponto_digital',       fields: ['funcionario','data','entrada','saida','empresa_id'] },
  ponto_digital:       { table: 'ponto_digital',       fields: ['funcionario','data','entrada','saida','empresa_id'] },
  rescisoes:           { table: 'rescisoes',           fields: ['funcionario','data_saida','valor','motivo','empresa_id'] },
  frequencias:         { table: 'frequencias',         fields: ['funcionario','status','obs','horario','empresa_id'] },
  feriasFuncionarios:  { table: 'ferias_funcionarios', fields: ['funcionario','data_inicio','data_fim','dias','status','empresa_id'] },
  ferias_funcionarios: { table: 'ferias_funcionarios', fields: ['funcionario','data_inicio','data_fim','dias','status','empresa_id'] },
  pagamentosFuncionarios:{ table: 'pagamentos_funcionarios', fields: ['funcionario','valor','data_pagamento','empresa_id'] },
  pagamentos_funcionarios:{ table: 'pagamentos_funcionarios', fields: ['funcionario','valor','data_pagamento','empresa_id'] },

  /* ============ PRODUÇÃO ============ */
  producao:            { table: 'producao',            fields: ['codigo','nome','tipo','descricao','status','empresa_id'] },
  ordensProducao:      { table: 'ordens_producao',     fields: ['produto','produto_id','quantidade','quantidade_produzida','prioridade','prazo','status','observacoes','empresa_id'] },
  ordens_producao:     { table: 'ordens_producao',     fields: ['produto','produto_id','quantidade','quantidade_produzida','prioridade','prazo','status','observacoes','empresa_id'] },
  'ordens-producao':   { table: 'ordens_producao',     fields: ['produto','produto_id','quantidade','quantidade_produzida','prioridade','prazo','status','observacoes','empresa_id'] },
  mrp:                 { table: 'mrp',                 fields: ['produto_id','produto','demanda','estoque','em_producao','em_compra','necessidade','empresa_id'] },
  boms:                { table: 'boms',                fields: ['produto_id','produto','material','quantidade','empresa_id'] },
  bom:                 { table: 'boms',                fields: ['produto_id','produto','material','quantidade','empresa_id'] },
  custosProducao:      { table: 'custos_producao',     fields: ['produto','produto_id','material','mao_obra','indireto','quantidade','categoria','observacoes','empresa_id'] },
  custos_producao:     { table: 'custos_producao',     fields: ['produto','produto_id','material','mao_obra','indireto','quantidade','categoria','observacoes','empresa_id'] },
  'custos-producao':   { table: 'custos_producao',     fields: ['produto','produto_id','material','mao_obra','indireto','quantidade','categoria','observacoes','empresa_id'] },
  controleQualidade:   { table: 'controle_qualidade',  fields: ['produto','produto_id','lote','resultado','itens_conformes','itens_nao_conformes','inspetor','observacoes','empresa_id'] },
  controle_qualidade:  { table: 'controle_qualidade',  fields: ['produto','produto_id','lote','resultado','itens_conformes','itens_nao_conformes','inspetor','observacoes','empresa_id'] },
  'controle-qualidade':{ table: 'controle_qualidade',  fields: ['produto','produto_id','lote','resultado','itens_conformes','itens_nao_conformes','inspetor','observacoes','empresa_id'] },
  planosProducao:      { table: 'planos_producao',     fields: ['produto','produto_id','quantidade','periodo','status','empresa_id'] },
  planos_producao:     { table: 'planos_producao',     fields: ['produto','produto_id','quantidade','periodo','status','empresa_id'] },
  'planos-producao':   { table: 'planos_producao',     fields: ['produto','produto_id','quantidade','periodo','status','empresa_id'] },

  /* ============ LOGÍSTICA ============ */
  roteirizacao:        { table: 'roteirizacao',        fields: ['origem','destino','distancia','veiculo','empresa_id'] },
  'logistica-roteirizacao': { table: 'roteirizacao',   fields: ['origem','destino','distancia','veiculo','empresa_id'] },
  etiquetas:           { table: 'etiquetas',           fields: ['codigo','produto','empresa_id'] },
  'logistica-etiquetas':{ table: 'etiquetas',          fields: ['codigo','produto','empresa_id'] },
  armazens:            { table: 'armazens',            fields: ['nome','capacidade','localizacao','empresa_id'] },
  'logistica-armazens':{ table: 'armazens',            fields: ['nome','capacidade','localizacao','empresa_id'] },
  transferencias:      { table: 'transferencias',      fields: ['produto','quantidade','origem','destino','empresa_id'] },
  inventarios:         { table: 'inventarios',         fields: ['produto','quantidade','obs','empresa_id'] },
  lotes:               { table: 'lotes',               fields: ['produto','numero','quantidade','validade','empresa_id'] },
  rastreios:           { table: 'rastreios',           fields: ['codigo','produto','status','ultima_atualizacao','empresa_id'] },
  'logistica-rastreio':{ table: 'rastreios',           fields: ['codigo','produto','status','ultima_atualizacao','empresa_id'] },
  recebimentos:        { table: 'recebimentos',        fields: ['fornecedor','produto','quantidade','status','empresa_id'] },
  pecasEstoque:        { table: 'pecas_estoque',       fields: ['codigo','nome','quantidade','localizacao','empresa_id'] },
  pecas_estoque:       { table: 'pecas_estoque',       fields: ['codigo','nome','quantidade','localizacao','empresa_id'] },

  /* ============ E-COMMERCE ============ */
  ecommerce:           { table: 'ecommerce',           fields: ['produto_id','publicado','destaque','empresa_id'] },
  ecommerceProdutos:   { table: 'ecommerce_produtos',  fields: ['produto_id','publicado','destaque','empresa_id'] },
  ecommerce_produtos:  { table: 'ecommerce_produtos',  fields: ['produto_id','publicado','destaque','empresa_id'] },
  'ecommerce-produtos':{ table: 'ecommerce_produtos',  fields: ['produto_id','publicado','destaque','empresa_id'] },
  ecommerceCarrinhos:  { table: 'ecommerce_carrinhos', fields: ['cliente','itens_json','total','status','empresa_id'] },
  ecommerce_carrinhos: { table: 'ecommerce_carrinhos', fields: ['cliente','itens_json','total','status','empresa_id'] },
  'ecommerce-carrinho':{ table: 'ecommerce_carrinhos', fields: ['cliente','itens_json','total','status','empresa_id'] },
  ecommercePedidos:    { table: 'ecommerce_pedidos',   fields: ['cliente','itens_json','total','status','forma_pagamento','endereco_entrega','empresa_id'] },
  ecommerce_pedidos:   { table: 'ecommerce_pedidos',   fields: ['cliente','itens_json','total','status','forma_pagamento','endereco_entrega','empresa_id'] },
  'ecommerce-pedidos': { table: 'ecommerce_pedidos',   fields: ['cliente','itens_json','total','status','forma_pagamento','endereco_entrega','empresa_id'] },
  pagamentosEcommerce: { table: 'pagamentos_ecommerce', fields: ['pedido_id','valor','forma','status','referencia','empresa_id'] },
  pagamentos_ecommerce:{ table: 'pagamentos_ecommerce', fields: ['pedido_id','valor','forma','status','referencia','empresa_id'] },

  /* ============ PROJETOS ============ */
  projetos:            { table: 'projetos',            fields: ['nome','descricao','status','progresso','prioridade','data_inicio','data_fim','orcamento','custo','empresa_id'] },
  tarefas:             { table: 'tarefas',             fields: ['titulo','descricao','projeto_id','projeto','prioridade','status','prazo','responsavel_id','responsavel','empresa_id'] },
  ganttProjetos:       { table: 'gantt_projetos',      fields: ['atividade','projeto','inicio','fim','progresso','empresa_id'] },
  gantt_projetos:      { table: 'gantt_projetos',      fields: ['atividade','projeto','inicio','fim','progresso','empresa_id'] },
  'projetos-gantt':    { table: 'gantt_projetos',      fields: ['atividade','projeto','inicio','fim','progresso','empresa_id'] },
  timesheets:          { table: 'timesheets',          fields: ['recurso','projeto','horas','data','empresa_id'] },
  tarefasProjetos:     { table: 'tarefas_projetos',    fields: ['projeto_id','titulo','status','responsavel','empresa_id'] },
  tarefas_projetos:    { table: 'tarefas_projetos',    fields: ['projeto_id','titulo','status','responsavel','empresa_id'] },
  membrosProjetos:     { table: 'membros_projetos',    fields: ['projeto_id','usuario_id','funcao','empresa_id'] },
  membros_projetos:    { table: 'membros_projetos',    fields: ['projeto_id','usuario_id','funcao','empresa_id'] },
  atividadesProjetos:  { table: 'atividades_projetos', fields: ['projeto_id','descricao','usuario','empresa_id'] },
  atividades_projetos: { table: 'atividades_projetos', fields: ['projeto_id','descricao','usuario','empresa_id'] },

  /* ============ ATIVOS ============ */
  ativos:              { table: 'ativos',              fields: ['nome','patrimonio','valor','valor_depreciado','depreciacao','vida_util','categoria','localizacao','fornecedor','status','data_aquisicao','empresa_id'] },
  depreciacoes:        { table: 'depreciacoes',        fields: ['ativo_id','valor_anterior','valor_novo','percentual','descricao','empresa_id'] },
  manutencoesAtivos:   { table: 'manutencoes_ativos',  fields: ['ativo_id','ativo','descricao','custo','status','empresa_id'] },
  manutencoes_ativos:  { table: 'manutencoes_ativos',  fields: ['ativo_id','ativo','descricao','custo','status','empresa_id'] },
  garantias:           { table: 'garantias',           fields: ['ativo_id','ativo','inicio','fim','empresa_id'] },

  /* ============ FROTA ============ */
  frotas:              { table: 'frotas',              fields: ['placa','modelo','marca','ano','cor','km_atual','km_proxima_manutencao','motorista','status','observacoes','empresa_id'] },
  motoristas:          { table: 'motoristas',          fields: ['nome','telefone','cnh','empresa_id'] },
  manutencoes:         { table: 'manutencoes',         fields: ['veiculo_id','veiculo','ativo','tipo','descricao','custo','status','empresa_id'] },
  frotaRotas:          { table: 'frota_rotas',         fields: ['origem','destino','distancia','veiculo','empresa_id'] },
  frota_rotas:         { table: 'frota_rotas',         fields: ['origem','destino','distancia','veiculo','empresa_id'] },
  'frota-rotas':       { table: 'frota_rotas',         fields: ['origem','destino','distancia','veiculo','empresa_id'] },
  gpsTracking:         { table: 'gps_tracking',        fields: ['veiculo','lat','lng','ultima_atualizacao','empresa_id'] },
  gps_tracking:        { table: 'gps_tracking',        fields: ['veiculo','lat','lng','ultima_atualizacao','empresa_id'] },
  'frota-gps':         { table: 'gps_tracking',        fields: ['veiculo','lat','lng','ultima_atualizacao','empresa_id'] },
  abastecimentos:      { table: 'abastecimentos',      fields: ['veiculo','litros','custo','combustivel','km','empresa_id'] },
  multas:              { table: 'multas',              fields: ['veiculo','valor','descricao','status','empresa_id'] },

  /* ============ ORDENS DE SERVIÇO ============ */
  ordensServico:       { table: 'ordens_servico',      fields: ['numero','cliente_id','cliente','descricao','servico','tecnico_id','tecnico','prioridade','valor','valor_pago','prazo','status','observacoes','empresa_id'] },
  ordens_servico:      { table: 'ordens_servico',      fields: ['numero','cliente_id','cliente','descricao','servico','tecnico_id','tecnico','prioridade','valor','valor_pago','prazo','status','observacoes','empresa_id'] },
  tecnicos:            { table: 'tecnicos',            fields: ['nome','especialidade','telefone','empresa_id'] },
  ordensManutencao:    { table: 'ordens_manutencao',   fields: ['equipamento','veiculo','descricao','custo','status','empresa_id'] },
  ordens_manutencao:   { table: 'ordens_manutencao',   fields: ['equipamento','veiculo','descricao','custo','status','empresa_id'] },
  'os-manutencao':     { table: 'ordens_manutencao',   fields: ['equipamento','veiculo','descricao','custo','status','empresa_id'] },
  checklistsInspecao:  { table: 'checklists_inspecao', fields: ['item','responsavel','status','empresa_id'] },
  checklists_inspecao: { table: 'checklists_inspecao', fields: ['item','responsavel','status','empresa_id'] },
  'os-checklist':      { table: 'checklists_inspecao', fields: ['item','responsavel','status','empresa_id'] },
  calendarioManutencoes:{ table: 'calendario_manutencoes', fields: ['equipamento','tipo','data','status','empresa_id'] },
  calendario_manutencoes:{ table: 'calendario_manutencoes', fields: ['equipamento','tipo','data','status','empresa_id'] },
  'os-calendario':     { table: 'calendario_manutencoes', fields: ['equipamento','tipo','data','status','empresa_id'] },
  historicoOS:         { table: 'historico_os',        fields: ['os_id','descricao','usuario','empresa_id'] },
  historico_os:        { table: 'historico_os',        fields: ['os_id','descricao','usuario','empresa_id'] },

  /* ============ CONTRATOS / DOCS / TICKETS ============ */
  contratos:           { table: 'contratos',           fields: ['cliente_id','cliente','valor','inicio','fim','status','empresa_id'] },
  documentos:          { table: 'documentos',          fields: ['nome','tipo','conteudo','empresa_id'] },
  assinaturasDigitais: { table: 'assinaturas_digitais', fields: ['nome','imagem','empresa_id'] },
  assinaturas_digitais:{ table: 'assinaturas_digitais', fields: ['nome','imagem','empresa_id'] },
  tickets:             { table: 'tickets',             fields: ['titulo','cliente_id','cliente','descricao','prioridade','status','empresa_id'] },

  /* ============ COMUNICAÇÃO ============ */
  notificacoes:        { table: 'notificacoes',        fields: ['titulo','mensagem','tipo','modulo','lida','usuario_id','empresa_id'] },
  mensagensChat:       { table: 'mensagens_chat',      fields: ['remetente','destinatario','mensagem','lida','empresa_id'] },
  mensagens_chat:      { table: 'mensagens_chat',      fields: ['remetente','destinatario','mensagem','lida','empresa_id'] },
  mensagensWhatsApp:   { table: 'mensagens_whatsapp',  fields: ['para','nome','mensagem','status','tentativas','empresa_id'] },
  mensagens_whatsapp:  { table: 'mensagens_whatsapp',  fields: ['para','nome','mensagem','status','tentativas','empresa_id'] },
  contatosWhatsApp:    { table: 'contatos_whatsapp',   fields: ['nome','numero','empresa','empresa_id'] },
  contatos_whatsapp:   { table: 'contatos_whatsapp',   fields: ['nome','numero','empresa','empresa_id'] },
  templatesWhatsApp:   { table: 'templates_whatsapp',  fields: ['nome','conteudo','empresa_id'] },
  templates_whatsapp:  { table: 'templates_whatsapp',  fields: ['nome','conteudo','empresa_id'] },
  eventosCalendar:     { table: 'eventos_calendar',    fields: ['titulo','inicio','fim','local','descricao','status','cor','categoria','lembrete','empresa_id'] },
  eventos_calendar:    { table: 'eventos_calendar',    fields: ['titulo','inicio','fim','local','descricao','status','cor','categoria','lembrete','empresa_id'] },

  /* ============ CRM ============ */
  leads:               { table: 'leads',               fields: ['nome','telefone','email','origem','status','empresa_id'] },
  automacoes:          { table: 'automacoes',          fields: ['nome','gatilho','acao','ativo','empresa_id'] },
  scoreLeads:          { table: 'score_leads',         fields: ['lead','score','nivel','status','empresa_id'] },
  score_leads:         { table: 'score_leads',         fields: ['lead','score','nivel','status','empresa_id'] },

  /* ============ MARKETING ============ */
  campanhasMarketing:  { table: 'campanhas_marketing', fields: ['nome','canal','orcamento','status','empresa_id'] },
  campanhas_marketing: { table: 'campanhas_marketing', fields: ['nome','canal','orcamento','status','empresa_id'] },
  segmentacoes:        { table: 'segmentacoes',        fields: ['nome','criterio','clientes','empresa_id'] },
  cupons:              { table: 'cupons',              fields: ['codigo','cliente','desconto','tipo','validade','empresa_id'] },
  fidelidade:          { table: 'fidelidade',          fields: ['cliente','pontos','nivel','ativo','empresa_id'] },

  /* ============ AUDITORIA / SEGURANÇA ============ */
  auditoria:           { table: 'auditoria',           fields: ['usuario_id','usuario','acao','modulo','detalhes','ip','empresa_id'] },
  logsSeguranca:       { table: 'logs_seguranca',      fields: ['tipo','descricao','nivel','usuario','ip','empresa_id'] },
  logs_seguranca:      { table: 'logs_seguranca',      fields: ['tipo','descricao','nivel','usuario','ip','empresa_id'] },
  seguranca:           { table: 'seguranca',           fields: ['two_factor','tempo_sessao','tentativas_login','bloqueio_tempo','ips_bloqueados','ips_permitidos','empresa_id'] },

  /* ============ DISPOSITIVOS ============ */
  dispositivos:        { table: 'dispositivos',        fields: ['nome','tipo','conexao','dispositivo_sistema','endereco','porta','padrao','ativo','observacoes','empresa_id'] },
  dispositivosRede:    { table: 'dispositivos_rede',   fields: ['device_id','nome','tipo','ip','ultima_sync'] },
  dispositivos_rede:   { table: 'dispositivos_rede',   fields: ['device_id','nome','tipo','ip','ultima_sync'] },
  syncQueue:           { table: 'sync_queue',          fields: ['entidade','entidade_id','acao','payload','dispositivo','processado'] },
  sync_queue:          { table: 'sync_queue',          fields: ['entidade','entidade_id','acao','payload','dispositivo','processado'] },

  /* ============ E-LEARNING ============ */
  cursos:              { table: 'cursos',              fields: ['nome','descricao','modulos','alunos','status','empresa_id'] },
  certificacoes:       { table: 'certificacoes',       fields: ['aluno','curso','validade','empresa_id'] },
  quizzes:             { table: 'quizzes',             fields: ['titulo','questoes','empresa_id'] },

  /* ============ BACKUPS ============ */
  backups:             { table: 'backups',             fields: ['nome','tamanho','dados','tipo','empresa_id'] },
  backupsAgendados:    { table: 'backups_agendados',   fields: ['frequencia','hora','manter','ativo','empresa_id'] },
  backups_agendados:   { table: 'backups_agendados',   fields: ['frequencia','hora','manter','ativo','empresa_id'] },
  backupsNuvem:        { table: 'backups_nuvem',       fields: ['nome','data','servico','tamanho','empresa_id'] },
  backups_nuvem:       { table: 'backups_nuvem',       fields: ['nome','data','servico','tamanho','empresa_id'] },

  /* ============ MÓDULOS PERSONALIZADOS ============ */
  modulosPersonalizados:{ table: 'modulos_personalizados', fields: ['mod_id','nome','icon','cor','descricao','submodulos_json','ativo','empresa_id'] },
  modulos_personalizados:{ table: 'modulos_personalizados', fields: ['mod_id','nome','icon','cor','descricao','submodulos_json','ativo','empresa_id'] },

  /* ============ MAPAS ============ */
  ddgHistorico:        { table: 'ddg_historico',       fields: ['local','lat','lng','empresa_id'] },
  ddg_historico:       { table: 'ddg_historico',       fields: ['local','lat','lng','empresa_id'] },
  bingHistorico:       { table: 'bing_historico',      fields: ['local','lat','lng','empresa_id'] },
  bing_historico:      { table: 'bing_historico',      fields: ['local','lat','lng','empresa_id'] },

  /* ============ FEEDBACK / MIGRAÇÕES ============ */
  feedbacks:           { table: 'feedbacks',           fields: ['nome','email','avaliacao','comentario','categoria','status','resposta','empresa_id'] },
  migracoes:           { table: 'migracoes',           fields: ['versao','descricao','script','registros','status','empresa_id'] }
};

// ============================================================
// HELPERS INTERNOS
// ============================================================
function buildInsert(table, fields, data) {
  const cols = fields.filter(f => data[f] !== undefined);
  if (!cols.length) return null;
  const vals = cols.map(f => data[f]);
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
  return { sql, vals, cols };
}

function buildUpdate(table, fields, data, id) {
  const cols = fields.filter(f => data[f] !== undefined);
  if (!cols.length) return null;
  const setClause = cols.map(f => `${f} = ?`).join(', ');
  const vals = cols.map(f => data[f]);
  vals.push(id);
  return { sql: `UPDATE ${table} SET ${setClause} WHERE id = ?`, vals };
}

// ============================================================
// REGISTO DE ROTAS
// ============================================================
function registerRoutes(app, db) {
  // ============================================================
  // HEALTH
  // ============================================================
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '15.2',
      storage: 'sqlite-relational',
      stores_mapeados: Object.keys(TABLE_MAP).length,
      tabelas_unicas: new Set(Object.values(TABLE_MAP).map(m => m.table)).size,
      timestamp: new Date().toISOString()
    });
  });

  // ============================================================
  // AUTH
  // ============================================================
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, senha } = req.body || {};
      if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatórios' });
      const user = db.get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', [email]);
      if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }
      let token = null;
      if (jwt) {
        token = jwt.sign({ id: user.id, email: user.email, perfil: user.perfil }, JWT_SECRET, { expiresIn: '7d' });
      }
      res.json({
        token,
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          perfil: user.perfil,
          telefone: user.telefone,
          nif: user.nif,
          avatar: user.avatar
        }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/auth/register', (req, res) => {
    try {
      const { nome, email, senha, perfil, telefone, nif } = req.body || {};
      if (!nome || !email || !senha) return res.status(400).json({ error: 'Dados incompletos' });
      const hash = bcrypt.hashSync(senha, 10);
      const r = db.run(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil, telefone, nif) VALUES (?, ?, ?, ?, ?, ?)',
        [nome, email, hash, perfil || 'operador', telefone || null, nif || null]
      );
      res.status(201).json({ id: r.lastInsertRowid, nome, email, perfil: perfil || 'operador' });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ============================================================
  // CRUD GENÉRICO PARA TODAS AS TABELAS MAPEADAS
  // ============================================================
  Object.keys(TABLE_MAP).forEach(store => {
    const { table, fields } = TABLE_MAP[store];

    // LISTAR
    app.get(`/api/${store}`, (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit) || 5000, 50000);
        const offset = parseInt(req.query.offset) || 0;
        const rows = db.all(`SELECT * FROM ${table} ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset]);
        res.json(rows);
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // CONTAR
    app.get(`/api/${store}/count`, (req, res) => {
      try {
        const row = db.get(`SELECT COUNT(*) as c FROM ${table}`);
        res.json({ count: row ? row.c : 0 });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // BUSCAR POR ID
    app.get(`/api/${store}/:id`, (req, res) => {
      try {
        const row = db.get(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Não encontrado' });
        res.json(row);
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // CRIAR
    app.post(`/api/${store}`, (req, res) => {
      try {
        const data = req.body || {};
        const b = buildInsert(table, fields, data);
        if (!b) return res.status(400).json({ error: 'Nenhum campo válido' });
        const r = db.run(b.sql, b.vals);
        res.status(201).json({ id: r.lastInsertRowid, ...data });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ATUALIZAR
    app.put(`/api/${store}/:id`, (req, res) => {
      try {
        const data = req.body || {};
        const b = buildUpdate(table, fields, data, req.params.id);
        if (!b) return res.json({ id: parseInt(req.params.id) });
        db.run(b.sql, b.vals);
        res.json({ id: parseInt(req.params.id), ...data });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // DELETAR
    app.delete(`/api/${store}/:id`, (req, res) => {
      try {
        db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // BULK (sincronização em lote)
    app.post(`/api/${store}/bulk`, (req, res) => {
      try {
        const items = Array.isArray(req.body) ? req.body : (req.body && Array.isArray(req.body.items) ? req.body.items : []);
        let count = 0, errors = 0;
        for (const item of items) {
          try {
            const b = buildInsert(table, fields, item);
            if (!b) continue;
            db.run(b.sql, b.vals);
            count++;
          } catch (e) { errors++; }
        }
        res.json({ success: true, count, errors });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });

  // ============================================================
  // VENDAS COM ITENS (transacional)
  // ============================================================
  app.post('/api/vendas/completa', (req, res) => {
    try {
      const { itens, ...venda } = req.body;
      const { fields } = TABLE_MAP.vendas;
      const b = buildInsert('vendas', fields, venda);
      if (!b) return res.status(400).json({ error: 'Campos inválidos' });
      const r = db.run(b.sql, b.vals);
      const vendaId = r.lastInsertRowid;
      if (Array.isArray(itens)) {
        for (const it of itens) {
          db.run(
            'INSERT INTO venda_itens (venda_id, produto_id, nome, preco, quantidade, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
            [vendaId, it.id || it.produto_id || null, it.nome, it.preco, it.qty || it.quantidade || 1, it.subtotal]
          );
        }
      }
      res.status(201).json({ id: vendaId, ...venda, itens });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/vendas/:id/itens', (req, res) => {
    try {
      const rows = db.all('SELECT * FROM venda_itens WHERE venda_id = ?', [req.params.id]);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // SINCRONIZAÇÃO ENTRE DISPOSITIVOS
  // ============================================================
  app.post('/api/sync/registrar-dispositivo', (req, res) => {
    try {
      const { device_id, nome, tipo, ip } = req.body || {};
      if (!device_id) return res.status(400).json({ error: 'device_id obrigatório' });
      const existing = db.get('SELECT * FROM dispositivos_rede WHERE device_id = ?', [device_id]);
      if (existing) {
        db.run('UPDATE dispositivos_rede SET ultima_sync = CURRENT_TIMESTAMP, ip = ? WHERE device_id = ?', [ip || existing.ip, device_id]);
      } else {
        db.run(
          'INSERT INTO dispositivos_rede (device_id, nome, tipo, ip, ultima_sync) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
          [device_id, nome || 'Dispositivo', tipo || 'desktop', ip || null]
        );
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/sync/dispositivos', (req, res) => {
    try {
      const rows = db.all('SELECT * FROM dispositivos_rede ORDER BY ultima_sync DESC');
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // ESTATÍSTICAS
  // ============================================================
  app.get('/api/stats', (req, res) => {
    try {
      const tabelasUnicas = new Set(Object.values(TABLE_MAP).map(m => m.table));
      const stats = {};
      for (const table of tabelasUnicas) {
        const row = db.get(`SELECT COUNT(*) as c FROM ${table}`);
        stats[table] = row ? row.c : 0;
      }
      res.json({ stats, total: Object.values(stats).reduce((s, n) => s + n, 0), tabelas: tabelasUnicas.size });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // BACKUP COMPLETO
  // ============================================================
  app.get('/api/backup', (req, res) => {
    try {
      const dump = {};
      const tabelasUnicas = new Set(Object.values(TABLE_MAP).map(m => m.table));
      for (const table of tabelasUnicas) {
        try { dump[table] = db.all(`SELECT * FROM ${table}`); } catch (e) { dump[table] = []; }
      }
      res.setHeader('Content-Disposition', `attachment; filename="kanawa-backup-${Date.now()}.json"`);
      res.json({ versao: '15.2', gerado_em: new Date().toISOString(), dados: dump });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // RESTAURAR BACKUP
  // ============================================================
  app.post('/api/restore', (req, res) => {
    try {
      const dump = (req.body && req.body.dados) || req.body || {};
      let total = 0, erros = 0;
      const tabelasUnicas = new Set(Object.values(TABLE_MAP).map(m => m.table));
      for (const table of tabelasUnicas) {
        if (!Array.isArray(dump[table])) continue;
        const mapping = Object.values(TABLE_MAP).find(m => m.table === table);
        const fields = mapping ? mapping.fields : [];
        for (const item of dump[table]) {
          try {
            const b = buildInsert(table, fields, item);
            if (!b) continue;
            db.run(b.sql, b.vals);
            total++;
          } catch (e) { erros++; }
        }
      }
      res.json({ success: true, total, erros });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ============================================================
  // ENDPOINTS ESPECIAIS ADICIONAIS
  // ============================================================

  // Estatísticas de vendas por período (relatórios)
  app.get('/api/relatorios/vendas', (req, res) => {
    try {
      const { inicio, fim } = req.query;
      let sql = 'SELECT * FROM vendas';
      const params = [];
      if (inicio && fim) { sql += ' WHERE criado_em BETWEEN ? AND ?'; params.push(inicio, fim); }
      sql += ' ORDER BY criado_em DESC';
      const rows = db.all(sql, params);
      const total = rows.reduce((s, v) => s + (v.total || 0), 0);
      const iva = rows.reduce((s, v) => s + (v.iva || 0), 0);
      res.json({ vendas: rows, total, iva, quantidade: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Estatísticas gerais do dashboard
  app.get('/api/relatorios/dashboard', (req, res) => {
    try {
      const produtos = db.get('SELECT COUNT(*) as c FROM produtos') || { c: 0 };
      const clientes = db.get('SELECT COUNT(*) as c FROM clientes') || { c: 0 };
      const vendas = db.get('SELECT COUNT(*) as c FROM vendas') || { c: 0 };
      const totalVendas = db.get('SELECT COALESCE(SUM(total),0) as t FROM vendas') || { t: 0 };
      const receber = db.get('SELECT COALESCE(SUM(valor),0) as t FROM contas_receber WHERE status != "pago"') || { t: 0 };
      const pagar = db.get('SELECT COALESCE(SUM(valor),0) as t FROM contas_pagar WHERE status != "pago"') || { t: 0 };
      const estoqueBaixo = db.get('SELECT COUNT(*) as c FROM produtos WHERE estoque < estoque_min') || { c: 0 };
      res.json({
        produtos: produtos.c, clientes: clientes.c, vendas: vendas.c,
        total_vendas: totalVendas.t, contas_receber: receber.t,
        contas_pagar: pagar.t, estoque_baixo: estoqueBaixo.c
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Lista de todas as tabelas disponíveis
  app.get('/api/schema/tabelas', (req, res) => {
    try {
      const stores = Object.keys(TABLE_MAP);
      const tabelas = Array.from(new Set(Object.values(TABLE_MAP).map(m => m.table)));
      res.json({ stores, tabelas, total_stores: stores.length, total_tabelas: tabelas.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log(`✅ Rotas registradas: ${Object.keys(TABLE_MAP).length} stores → ${new Set(Object.values(TABLE_MAP).map(m => m.table)).size} tabelas SQL`);
}

module.exports = { registerRoutes, TABLE_MAP };