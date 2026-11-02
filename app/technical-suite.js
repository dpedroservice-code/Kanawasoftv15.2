/* KanawaSoft v15.4 — Plano Técnica
 * Uses the existing tenant-scoped stores and saveData/cloud sync contract.
 * External payment, AGT certification, FX and carrier integrations remain disabled
 * until a provider is contracted, configured server-side and independently validated.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const escT = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const money = (v) => new Intl.NumberFormat('pt-AO',{style:'currency',currency:'AOA',maximumFractionDigits:2}).format(num(v));
  const uid = () => 'KT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,7).toUpperCase();
  const read = async (store) => (typeof getData === 'function' ? await getData(store) : await DB.getAll(store));
  const write = async (store, row) => {
    if (typeof saveData !== 'function') throw new Error('Camada de persistência Kanawa indisponível.');
    return saveData(store, row);
  };
  const notify = (msg,type) => typeof toast === 'function' ? toast(msg,type || 'info') : alert(msg);
  const stores = { quotes:'orcamentos', products:'produtos', services:'servicos', evaluations:'avaliacoes', reservations:'transferencias', workOrders:'ordensServico', kits:'boms', tracking:'rastreios', staff:'tecnicos', skills:'certificacoes', categories:'categorias', priceTables:'tabelasPrecos', production:'ordensProducao' };
  const state = { tab:'overview', quotes:[], products:[], services:[], evaluations:[], reservations:[], workOrders:[], kits:[], tracking:[], staff:[], skills:[], categories:[], priceTables:[], production:[] };
  const tabs = [
    ['overview','Visão geral','fa-chart-pie'],['quotes','Orçamentos técnicos','fa-file-invoice-dollar'],
    ['products','Produtos técnicos','fa-boxes'],['services','Serviços e equipas','fa-tools'],
    ['evaluations','Diagnósticos e avaliações','fa-clipboard-check'],['stock','Stock e reservas','fa-warehouse'],
    ['production','Kits e produção','fa-industry'],['tracking','Rastreio e entregas','fa-route'],
    ['commercial','Preços e pagamentos','fa-coins'],['people','Técnicos e competências','fa-user-cog']
  ];
  async function load() {
    for (const [k,s] of Object.entries(stores)) state[k] = await read(s).catch(()=>[]);
  }
  function shell() {
    return '<style>'+
      '.kt-wrap{max-width:1500px;margin:auto}.kt-hero{background:linear-gradient(120deg,#123456,#176b55);color:white;border-radius:16px;padding:24px;margin-bottom:18px}.kt-hero h2{font-size:1.45rem;margin:0 0 6px}.kt-hero p{opacity:.85}.kt-tabs{display:flex;gap:7px;overflow:auto;padding:5px 0 14px}.kt-tab{border:1px solid var(--border);background:var(--bg-card);color:var(--text);border-radius:10px;padding:10px 13px;white-space:nowrap;cursor:pointer}.kt-tab.active{background:var(--primary);color:white}.kt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.kt-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:13px;padding:17px}.kt-stat small{color:var(--text-muted);display:block}.kt-stat strong{font-size:1.35rem;display:block;margin-top:8px}.kt-panel{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:15px}.kt-panel h3{margin:0 0 14px}.kt-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.kt-form .full{grid-column:1/-1}.kt-field label{display:block;font-size:.78rem;font-weight:700;margin-bottom:5px}.kt-field input,.kt-field select,.kt-field textarea{width:100%;padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--bg);color:var(--text);font:inherit}.kt-field textarea{min-height:82px}.kt-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.kt-table{overflow:auto}.kt-table table{min-width:720px}.kt-note{border-left:4px solid #d69e2e;background:var(--bg);padding:12px;border-radius:8px;font-size:.84rem;margin:12px 0}.kt-pill{display:inline-block;border-radius:30px;padding:4px 9px;background:var(--bg);font-size:.74rem}.kt-muted{color:var(--text-muted);font-size:.82rem}.kt-cost{display:flex;justify-content:space-between;border-bottom:1px solid var(--border);padding:7px 0}.kt-cost.total{font-weight:800;font-size:1.1rem;border-top:2px solid var(--border);border-bottom:0;margin-top:5px}.kt-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}@media(max-width:650px){.kt-form{grid-template-columns:1fr}.kt-form .full{grid-column:auto}.kt-hero{padding:18px}}'+
      '</style><div class="kt-wrap"><section class="kt-hero"><div style="display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap"><div><div class="kt-pill" style="background:rgba(255,255,255,.16);color:#fff">KANAWA SOFT · v15.4</div><h2>Centro de Operações Técnicas</h2><p>Orçamentação analítica, assistência, peças, equipas, produção e rastreabilidade num único fluxo.</p></div><div style="font-size:2.5rem">⚙️</div></div></section><nav class="kt-tabs">'+tabs.map(t=>'<button class="kt-tab '+(state.tab===t[0]?'active':'')+'" onclick="KanawaTechnical.tab(\''+t[0]+'\')"><i class="fas '+t[2]+'"></i> '+t[1]+'</button>').join('')+'</nav><div id="kt-content">'+bodyForTab()+'</div></div>';
  }
  function stat(label,value,sub) { return '<div class="kt-stat"><small>'+label+'</small><strong>'+value+'</strong><span class="kt-muted">'+(sub||'')+'</span></div>'; }
  function table(headers,rows,empty) { return '<div class="kt-table"><table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.join(''):'<tr><td colspan="'+headers.length+'" class="kt-muted">'+(empty||'Sem registos.')+'</td></tr>')+'</tbody></table></div>'; }
  function bodyForTab() {
    const q=state.quotes,p=state.products,s=state.services,e=state.evaluations,r=state.reservations;
    if(state.tab==='overview') return '<div class="kt-grid">'+stat('Orçamentos técnicos',q.length,'Registados')+stat('Em negociação',q.filter(x=>x.status==='Em negociação').length,'Com reserva lógica')+stat('Ordens de serviço',state.workOrders.length,'Criadas a partir de propostas')+stat('Produtos técnicos',p.length,'Peças, consumíveis e equipamentos')+stat('Avaliações',e.length,'Diagnósticos e feedback')+stat('Serviços',s.length,'Catálogo técnico')+'</div><section class="kt-panel" style="margin-top:16px"><h3>Fluxo recomendado</h3><div class="kt-grid">'+['Diagnóstico / vistoria','Orçamento analítico','Aprovação e adjudicação','Reserva de peças','Ordem de Serviço','Execução e check-in/out','Avaliação do cliente','Fecho e garantia'].map((x,i)=>'<div class="kt-stat"><span class="kt-pill">'+(i+1)+'</span><strong style="font-size:1rem">'+x+'</strong></div>').join('')+'</div><div class="kt-note">A reserva registada nesta interface é uma pré-reserva operacional. A baixa definitiva, o bloqueio concorrente de stock e pagamentos reais exigem validação transacional no servidor. Não se altera o stock físico ao criar uma proposta.</div></section>';
    if(state.tab==='quotes') return quoteForm()+table(['Referência','Cliente','Descrição','Total','Validade','Estado','Ações'],q.slice().reverse().map(x=>'<tr><td>'+escT(x.codigo)+'</td><td>'+escT(x.cliente)+'</td><td>'+escT(x.titulo)+'</td><td>'+money(x.total)+'</td><td>'+escT(x.validadeDias)+' dias</td><td><span class="kt-pill">'+escT(x.status)+'</span></td><td><button class="btn btn-sm btn-primary" onclick="KanawaTechnical.convert('+Number(x.id)+')">Criar OS</button></td></tr>'),'Crie o primeiro orçamento técnico.');
    if(state.tab==='products') return productForm()+table(['Código','Produto','Tipo','Moeda base','Custo base','Garantia','Stock','Compatibilidade'],p.slice().reverse().map(x=>'<tr><td>'+escT(x.codigo||'—')+'</td><td>'+escT(x.nome)+'</td><td>'+escT(x.tipoTecnico||'Produto')+'</td><td>'+escT(x.moedaBase||'AOA')+'</td><td>'+money(x.custoBase||x.custo||0)+'</td><td>'+escT(x.garantiaMeses||0)+' meses</td><td>'+num(x.estoque)+'</td><td>'+escT(x.compatibilidade||'—')+'</td></tr>'),'Cadastre peças e equipamentos.');
    if(state.tab==='services') return serviceForm()+table(['Serviço','Especialidade','Unidade','Custo/h','Preço/h','Duração','SLA','Equipa mínima'],s.slice().reverse().map(x=>'<tr><td>'+escT(x.nome)+'</td><td>'+escT(x.especialidade||'—')+'</td><td>'+escT(x.unidadeCobranca||'Hora')+'</td><td>'+money(x.custoHora||0)+'</td><td>'+money(x.precoHora||x.preco||0)+'</td><td>'+escT(x.duracaoHoras||x.duracao||0)+' h</td><td>'+escT(x.slaHoras||'—')+' h</td><td>'+num(x.equipaMinima||1)+'</td></tr>'),'Cadastre os serviços e requisitos.');
    if(state.tab==='evaluations') return evaluationForm()+table(['Tipo','Cliente','Equipamento','Parecer / Nota','Data','OS'],e.slice().reverse().map(x=>'<tr><td>'+escT(x.tipoAvaliacao||'Diagnóstico')+'</td><td>'+escT(x.cliente||'—')+'</td><td>'+escT(x.equipamento||'—')+'</td><td>'+escT(x.parecer||x.comentario||'—')+'</td><td>'+escT(x.data||x.criado_em||'—')+'</td><td>'+escT(x.ordemServicoId||'—')+'</td></tr>'),'Registe uma vistoria ou avaliação.');
    if(state.tab==='stock') return stockPanel()+table(['Produto','Quantidade reservada','Referência','Estado'],r.slice().reverse().map(x=>'<tr><td>'+escT(x.produtoNome||x.produto_id)+'</td><td>'+num(x.quantidade)+'</td><td>'+escT(x.referencia||'—')+'</td><td>'+escT(x.status||'reservado')+'</td></tr>'),'Sem reservas registadas.');
    if(state.tab==='production') return productionForm()+table(['Ordem','Kit / Produto','Quantidade','Estado','Custo estimado'],state.production.slice().reverse().map(x=>'<tr><td>'+escT(x.codigo||x.id)+'</td><td>'+escT(x.produtoNome||x.nome)+'</td><td>'+num(x.quantidade)+'</td><td>'+escT(x.status||'Planeada')+'</td><td>'+money(x.custoEstimado||0)+'</td></tr>'),'Sem ordens de produção.');
    if(state.tab==='tracking') return trackingForm()+table(['Tracking ID','Tipo','Cliente','Estado','Transportadora','Actualizado'],state.tracking.slice().reverse().map(x=>'<tr><td>'+escT(x.codigo||x.trackingId)+'</td><td>'+escT(x.tipo||'Entrega')+'</td><td>'+escT(x.cliente||'—')+'</td><td>'+escT(x.estado||'Recebido')+'</td><td>'+escT(x.transportadora||'Frota própria')+'</td><td>'+escT(x.atualizadoEm||'—')+'</td></tr>'),'Sem eventos de rastreio.');
    if(state.tab==='commercial') return commercialForm()+table(['Tabela','Segmento','Moeda','Markup','Validade','Estado'],state.priceTables.slice().reverse().map(x=>'<tr><td>'+escT(x.nome)+'</td><td>'+escT(x.segmento||'Balcão')+'</td><td>'+escT(x.moeda||'AOA')+'</td><td>'+num(x.markup)||0+'%</td><td>'+escT(x.validadeAte||'—')+'</td><td>'+((x.ativo===false)?'Inativa':'Activa')+'</td></tr>'),'Configure uma tabela de preços.');
    if(state.tab==='people') return peopleForm()+table(['Técnico','Especialidade','Nível','Certificação','Validade','Estado'],state.staff.slice().reverse().map(x=>'<tr><td>'+escT(x.nome)+'</td><td>'+escT(x.especialidade||'—')+'</td><td>'+escT(x.nivel||'—')+'</td><td>'+escT(x.certificacao||'—')+'</td><td>'+escT(x.validadeCertificacao||'—')+'</td><td>'+escT(x.ativo===false?'Inactivo':'Activo')+'</td></tr>'),'Registe os técnicos e qualificações.');
    return '';
  }
  function field(label,name,type,placeholder,opts,full) {
    let input;
    if(type==='textarea') input='<textarea name="'+name+'" placeholder="'+escT(placeholder||'')+'"></textarea>';
    else if(type==='select') input='<select name="'+name+'">'+(opts||[]).map(o=>'<option value="'+escT(o[0])+'">'+escT(o[1])+'</option>').join('')+'</select>';
    else input='<input name="'+name+'" type="'+(type||'text')+'" placeholder="'+escT(placeholder||'')+'" '+(type==='number'?'min="0" step="any"':'')+'>';
    return '<div class="kt-field '+(full?'full':'')+'"><label>'+label+'</label>'+input+'</div>';
  }
  function form(title,fields,submit,description) { return '<section class="kt-panel"><h3>'+title+'</h3>'+(description?'<p class="kt-muted">'+description+'</p>':'')+'<form class="kt-form" onsubmit="return KanawaTechnical.submit(event,\''+submit+'\')">'+fields.join('')+'<div class="full kt-actions"><button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Guardar</button></div></form></section>'; }
  function quoteForm() {
    return form('Novo orçamento técnico',[
      field('Cliente *','cliente','text','Nome / empresa',null,false),field('Título do serviço / obra *','titulo','text','Instalação CCTV, manutenção...',null,false),
      field('Validade (dias)','validadeDias','number','7',null,false),field('Prazo de execução (dias)','prazoDias','number','3',null,false),
      field('Horas técnicas','horas','number','0',null,false),field('Custo por hora (AOA)','custoHora','number','0',null,false),
      field('Preço/hora cobrado (AOA)','precoHora','number','0',null,false),field('Equipamentos principais (AOA)','equipamentos','number','0',null,false),
      field('Materiais e consumíveis (AOA)','consumiveis','number','0',null,false),field('Deslocação (AOA)','deslocacao','number','0',null,false),
      field('Alimentação / alojamento (AOA)','diarias','number','0',null,false),field('BDI / contingência (%)','bdi','number','0',null,false),
      field('Desconto (AOA)','desconto','number','0',null,false),field('IVA configurado (%)','ivaPercent','number','0',null,false),
      field('Retenção na fonte (%) — se aplicável','retencaoPercent','number','0',null,false),
      field('Estado','status','select','',[['Rascunho','Rascunho'],['Em negociação','Em negociação'],['Aprovado','Aprovado'],['Rejeitado','Rejeitado']],false),
      field('Escopo / memória descritiva','escopo','textarea','Incluído, excluído, método, materiais, premissas e riscos...',null,true),
      field('Plano de pagamento','pagamento','textarea','50% adjudicação + 50% entrega; ou marcos...',null,true),
      field('Observações fiscais / retenção','notaFiscal','textarea','Indicar enquadramento sujeito a validação contabilística...',null,true)
    ],'quote','Composição por mão de obra, equipamentos, consumíveis, despesas indirectas, contingência, impostos configuráveis e retenções informativas.');
  }
  function productForm(){return form('Novo produto / peça técnica',[
    field('Nome *','nome','text','Placa electrónica, cabo...',null,false),field('Código / SKU','codigo','text','SKU',null,false),
    field('Tipo técnico','tipoTecnico','select','',[['Peça de reposição','Peça de reposição'],['Consumível','Consumível'],['Equipamento','Equipamento'],['Kit técnico','Kit técnico']],false),
    field('Moeda do custo base','moedaBase','select','',[['AOA','AOA'],['USD','USD'],['EUR','EUR']],false),
    field('Custo base na moeda','custoBase','number','0',null,false),field('Taxa cambial registada (AOA por unidade)','taxaCambio','number','0',null,false),
    field('Preço venda directa (AOA)','preco','number','0',null,false),field('Preço em orçamento técnico (AOA)','precoTecnico','number','0',null,false),
    field('Garantia fábrica (meses)','garantiaMeses','number','0',null,false),field('Stock mínimo','estoqueMin','number','0',null,false),
    field('Unidade de compra','unidadeCompra','text','Caixa',null,false),field('Factor compra → consumo','fatorConversao','number','1',null,false),
    field('Compatibilidade marca / modelo / série','compatibilidade','text','Marca, modelo, série...',null,true),
    field('Rastreio série / lote','rastreioTipo','select','',[['Nenhum','Não obrigatório'],['Série','Número de série'],['Lote','Lote']],false),
    field('Fornecedor / referência / lead time','fornecedorTecnico','textarea','Fornecedor A — código — dias de entrega...',null,true)
  ],'product','O custo convertido só é calculado quando a taxa é fornecida e fica guardada como fotografia cambial no registo.');}
  function serviceForm(){return form('Novo serviço técnico',[
    field('Nome *','nome','text','Manutenção preventiva...',null,false),field('Especialidade','especialidade','text','Electricidade, CCTV, redes...',null,false),
    field('Unidade de cobrança','unidadeCobranca','select','',[['Hora','Hora'],['Homem-hora','Homem-hora'],['Preço fixo','Preço fixo'],['Deslocação / diagnóstico','Deslocação / diagnóstico']],false),
    field('Custo interno por hora (AOA)','custoHora','number','0',null,false),field('Preço por hora (AOA)','precoHora','number','0',null,false),
    field('Horas padrão','duracaoHoras','number','1',null,false),field('SLA resposta (horas)','slaHoras','number','0',null,false),
    field('Equipa mínima','equipaMinima','number','1',null,false),field('Nível exigido','nivel','select','',[['Júnior','Júnior'],['Pleno','Pleno'],['Sénior','Sénior'],['Engenheiro','Engenheiro']],false),
    field('Artigos / consumíveis obrigatórios','artigosObrigatorios','textarea','Filtro, óleo, conectores...',null,true),
    field('Ferramentas / EPI','ferramentasEpi','textarea','Multímetro, luvas, capacete...',null,true),
    field('Procedimento operacional padrão (POP)','pop','textarea','Passos de segurança, execução e testes...',null,true)
  ],'service','Defina a competência, o SLA, a equipa mínima e o procedimento seguro.');}
  function evaluationForm(){return form('Diagnóstico prévio / avaliação pós-serviço',[
    field('Tipo de avaliação','tipoAvaliacao','select','',[['Diagnóstico prévio','Diagnóstico prévio'],['Satisfação pós-serviço','Satisfação pós-serviço'],['Incidente de garantia','Incidente de garantia']],false),
    field('Cliente','cliente','text','Cliente',null,false),field('Equipamento / modelo','equipamento','text','Equipamento avaliado',null,false),
    field('Tensão medida (V)','tensao','number','0',null,false),field('Nota geral (1–5)','nota','number','5',null,false),
    field('Pontualidade (1–5)','pontualidade','number','5',null,false),field('Organização (1–5)','organizacao','number','5',null,false),
    field('Conhecimento técnico (1–5)','conhecimento','number','5',null,false),field('Qualidade/preço (1–5)','qualidadePreco','number','5',null,false),
    field('Anomalia / checklist / parecer técnico','parecer','textarea','Falha observada, evidências e recomendação...',null,true),
    field('Fotos / evidências (URLs ou referências)','evidencias','textarea','Referências de anexos armazenados em local seguro...',null,true),
    field('Assinatura / conformidade (referência)','assinaturaCliente','text','Referência da assinatura recolhida...',null,false),
    field('Tempo real (horas)','tempoReal','number','0',null,false),field('Peças desperdiçadas / justificativa','refugo','textarea','Quantidade e motivo...',null,true)
  ],'evaluation','Notas inferiores a 3 geram sinalização no painel; a assinatura deve ser recolhida com consentimento e guardada como evidência, não como imagem pública.');}
  function stockPanel(){
    const products=state.products;
    return '<section class="kt-panel"><h3>Pré-reserva de stock por orçamento / OS</h3><form class="kt-form" onsubmit="return KanawaTechnical.submit(event,\'reservation\')">'+
      field('Produto','produtoId','select','',products.map(p=>[String(p.id),p.nome+' — stock '+num(p.estoque)]),false)+
      field('Quantidade','quantidade','number','1',null,false)+field('Referência orçamento / OS','referencia','text','ORC-... / OS-...',null,false)+
      field('Armazém de origem','armazem','text','Central / Oficina / Carrinha',null,false)+
      '<div class="full kt-actions"><button class="btn btn-primary" type="submit">Pré-reservar</button></div></form>'+
      '<div class="kt-note">Pré-reserva informativa no registo operacional. Não reduz o stock físico e não substitui uma transacção atómica no PostgreSQL. Antes de activar vendas concorrentes, deve ser ligada a RPC transaccional e teste de concorrência.</div></section>';
  }
  function productionForm(){return form('Criar kit / ordem de produção',[
    field('Produto / kit *','produtoNome','text','Quadro eléctrico montado...',null,false),field('Quantidade','quantidade','number','1',null,false),
    field('Componentes e quantidades (JSON simples ou lista)','componentes','textarea','1 Caixa metálica; 3 disjuntores; 5m cabo...',null,true),
    field('Tempo de operação (horas)','horas','number','0',null,false),field('Custos indirectos (AOA)','custosIndiretos','number','0',null,false),
    field('Estado','status','select','',[['Planeada','Planeada'],['Aguardar componentes','Aguardar componentes'],['Em execução','Em execução'],['Controlo de qualidade','Controlo de qualidade'],['Finalizada','Finalizada']],false)
  ],'production','A ordem de produção é registada; a baixa de componentes e entrada de produto acabado dependem de integração transaccional de stock.');}
  function trackingForm(){return form('Registar evento de rastreio',[
    field('Código de rastreio','codigo','text','KS-...',null,false),field('Tipo','tipo','select','',[['Entrega','Entrega de peças'],['Assistência','Equipamento em reparação']],false),
    field('Cliente','cliente','text','Cliente',null,false),field('Estado','estado','select','',[['Pedido recebido','Pedido recebido'],['Em separação','Em separação'],['Pronto para envio','Pronto para envio'],['Em trânsito','Em trânsito'],['Em diagnóstico','Em diagnóstico'],['Em reparação','Em reparação'],['Em testes','Em testes'],['Pronto para levantamento','Pronto para levantamento'],['Entregue / Concluído','Entregue / Concluído']],false),
    field('Transportadora / frota','transportadora','text','Frota própria / operador contratado',null,false),field('Link público seguro','linkPublico','text','URL de token aleatório gerado no backend',null,false),
    field('Comprovativo / observações','observacoes','textarea','Assinatura, foto, GPS (apenas com consentimento)...',null,true)
  ],'tracking','Não gerar links públicos previsíveis. O token público e a geolocalização devem ser emitidos/validados no servidor.');}
  function commercialForm(){return form('Tabela de preços e parâmetros comerciais',[
    field('Nome da tabela','nome','text','Contrato manutenção / balcão...',null,false),field('Segmento','segmento','select','',[['Balcão','Balcão / Spot'],['Contrato','Contrato / SLA'],['Revenda','Revenda / Parceiro']],false),
    field('Moeda de referência','moeda','select','',[['AOA','AOA'],['USD','USD'],['EUR','EUR']],false),field('Markup (%)','markup','number','0',null,false),
    field('Adicional nocturno (%)','noturno','number','0',null,false),field('Adicional fim-de-semana (%)','fimSemana','number','0',null,false),
    field('Validade até','validadeAte','date','',null,false),field('Taxa de câmbio usada','taxaCambio','number','0',null,false),
    field('Gateway configurado (apenas nome/status)','gateway','text','Não configurado',null,false),field('Taxa do gateway (%)','taxaGateway','number','0',null,false)
  ],'priceTable','As taxas fiscais e cambiais são parâmetros editáveis, não valores legais presumidos. Segredos de gateway nunca são guardados neste formulário.');}
  function peopleForm(){return form('Registar técnico / competência',[
    field('Nome do técnico','nome','text','Nome completo',null,false),field('Especialidade','especialidade','text','Electricidade, CCTV...',null,false),
    field('Nível','nivel','select','',[['Júnior','Júnior'],['Pleno','Pleno'],['Sénior','Sénior'],['Engenheiro','Engenheiro']],false),
    field('Certificação / licença','certificacao','text','Tipo e entidade emissora',null,false),field('Validade da certificação','validadeCertificacao','date','',null,false),
    field('Competências / equipamentos autorizados','competencias','textarea','Alta tensão, trabalho em altura...',null,true)
  ],'staff','As competências e validades devem ser verificadas pela gerência antes da atribuição de tarefas críticas.');}
  async function submit(ev,kind) {
    ev.preventDefault();
    const f=ev.target, d=Object.fromEntries(new FormData(f).entries());
    try {
      if(kind==='quote') {
        if(!d.cliente.trim()||!d.titulo.trim()) throw new Error('Cliente e título são obrigatórios.');
        if(!window.KanawaTechnicalPricing) throw new Error('Motor de composição analítica não carregado.');
        const costs=window.KanawaTechnicalPricing.calculate({hours:d.horas,hourlyCost:d.custoHora,hourlyPrice:d.precoHora,equipment:d.equipamentos,consumables:d.consumiveis,travel:d.deslocacao,perDiem:d.diarias,bdiPct:d.bdi,discount:d.desconto,ivaPct:d.ivaPercent,retentionPct:d.retencaoPercent});
        const labor=costs.laborRevenue, direct=costs.direct, indirect=costs.indirect, contingency=costs.contingency;
        const discount=costs.discount, taxable=costs.taxBase, tax=costs.iva, retention=costs.retention, total=costs.total;
        const row={id:undefined,codigo:uid(),tipo:'tecnico',cliente:d.cliente.trim(),titulo:d.titulo.trim(),validadeDias:Math.max(1,Math.min(90,Math.floor(num(d.validadeDias)||7))),prazoDias:num(d.prazoDias),horas:num(d.horas),custoMaoObra:costs.laborCost,precoMaoObra:labor,custoInternoEstimado:costs.estimatedInternalCost,margemEstimada:costs.estimatedMargin,equipamentos:num(d.equipamentos),consumiveis:num(d.consumiveis),deslocacao:num(d.deslocacao),diarias:num(d.diarias),bdiPercent:num(d.bdi),contingencia:contingency,desconto:discount,ivaPercent:num(d.ivaPercent),ivaValor:tax,retencaoPercent:num(d.retencaoPercent),retencaoValor:retention,total:Math.max(0,total),escopo:d.escopo,pagamento:d.pagamento,notaFiscal:d.notaFiscal,status:d.status||'Rascunho',criadoEm:new Date().toISOString(),moeda:'AOA'};
        const id=await write(stores.quotes,row); row.id=id; state.quotes.push(row);
        if(row.status==='Em negociação'||row.status==='Aprovado') await reserveQuote(row);
      } else if(kind==='product') {
        if(!d.nome.trim()) throw new Error('O nome do produto é obrigatório.');
        const cost=num(d.custoBase), rate=num(d.taxaCambio);
        const row={...d,custoBase:cost,taxaCambio:rate,custoAOA:d.moedaBase==='AOA'?cost:(rate?cost*rate:null),preco:num(d.preco),precoTecnico:num(d.precoTecnico),estoque:0,estoqueMin:num(d.estoqueMin),garantiaMeses:num(d.garantiaMeses),fatorConversao:Math.max(.000001,num(d.fatorConversao)||1),criadoEm:new Date().toISOString()};
        const id=await write(stores.products,row);row.id=id;state.products.push(row);
      } else if(kind==='service') {
        if(!d.nome.trim()) throw new Error('O nome do serviço é obrigatório.');
        const row={...d,custoHora:num(d.custoHora),precoHora:num(d.precoHora),preco:num(d.precoHora),duracaoHoras:num(d.duracaoHoras),slaHoras:num(d.slaHoras),equipaMinima:Math.max(1,Math.floor(num(d.equipaMinima)||1)),criadoEm:new Date().toISOString()};
        const id=await write(stores.services,row);row.id=id;state.services.push(row);
      } else if(kind==='evaluation') {
        const row={...d,nota:Math.max(1,Math.min(5,Math.floor(num(d.nota)||5))),tipoAvaliacao:d.tipoAvaliacao,data:new Date().toISOString(),alertaGerencia:num(d.nota)<3,criadoEm:new Date().toISOString()};
        const id=await write(stores.evaluations,row);row.id=id;state.evaluations.push(row);
        if(row.alertaGerencia) notify('Avaliação inferior a 3: requer análise da gerência.','warning');
      } else if(kind==='reservation') {
        const p=state.products.find(x=>String(x.id)===String(d.produtoId)); if(!p) throw new Error('Produto não encontrado.');
        const already=state.reservations.filter(x=>String(x.produtoId)===String(p.id)&&x.status==='reservado').reduce((a,x)=>a+num(x.quantidade),0);
        if(num(d.quantidade)<=0||already+num(d.quantidade)>num(p.estoque)) throw new Error('Quantidade superior ao stock disponível (considerando pré-reservas conhecidas).');
        const row={produtoId:p.id,produtoNome:p.nome,quantidade:num(d.quantidade),referencia:d.referencia,armazem:d.armazem,status:'reservado',criadoEm:new Date().toISOString()};
        const id=await write(stores.reservations,row);row.id=id;state.reservations.push(row);
      } else if(kind==='production') {
        if(!d.produtoNome.trim()) throw new Error('Indique o produto ou kit.');
        const row={...d,codigo:uid(),quantidade:Math.max(1,Math.floor(num(d.quantidade)||1)),horas:num(d.horas),custosIndiretos:num(d.custosIndiretos),criadoEm:new Date().toISOString()};
        const id=await write(stores.production,row);row.id=id;state.production.push(row);
      } else if(kind==='tracking') {
        if(!d.codigo.trim()) throw new Error('Código de rastreio obrigatório.');
        const row={...d,trackingId:d.codigo,atualizadoEm:new Date().toISOString(),historico:[{estado:d.estado,data:new Date().toISOString(),observacoes:d.observacoes}]};
        const id=await write(stores.tracking,row);row.id=id;state.tracking.push(row);
      } else if(kind==='priceTable') {
        const row={...d,markup:num(d.markup),noturno:num(d.noturno),fimSemana:num(d.fimSemana),taxaCambio:num(d.taxaCambio),taxaGateway:num(d.taxaGateway),ativo:true,criadoEm:new Date().toISOString()};
        const id=await write(stores.priceTables,row);row.id=id;state.priceTables.push(row);
      } else if(kind==='staff') {
        if(!d.nome.trim()) throw new Error('Nome do técnico obrigatório.');
        const row={...d,ativo:true,criadoEm:new Date().toISOString()};
        const id=await write(stores.staff,row);row.id=id;state.staff.push(row);
      }
      notify('Registo guardado.','success'); await refresh();
    } catch(err) { console.error('[Kanawa Técnica]',err); notify(err.message||'Não foi possível guardar.','error'); }
    return false;
  }
  async function reserveQuote(q) {
    const lines=q.itens||[];
    for(const line of lines) {
      const product=state.products.find(p=>String(p.id)===String(line.produtoId||line.produto_id));
      if(!product) continue;
      const exists=state.reservations.some(r=>r.referencia===q.codigo&&String(r.produtoId)===String(product.id)&&r.status==='reservado');
      if(exists) continue;
      const row={produtoId:product.id,produtoNome:product.nome,quantidade:num(line.quantidade),referencia:q.codigo,status:'reservado',criadoEm:new Date().toISOString()};
      const id=await write(stores.reservations,row);row.id=id;state.reservations.push(row);
    }
  }
  async function convert(id) {
    const q=state.quotes.find(x=>Number(x.id)===Number(id)); if(!q) return notify('Orçamento não encontrado.','error');
    if(q.status!=='Aprovado') return notify('Apenas orçamentos aprovados podem gerar uma Ordem de Serviço.','warning');
    const exists=state.workOrders.some(x=>x.orcamentoId===q.id||x.referenciaOrcamento===q.codigo);
    if(exists) return notify('Já existe uma OS para este orçamento.','warning');
    const row={codigo:'OS-'+uid(),orcamentoId:q.id,referenciaOrcamento:q.codigo,cliente:q.cliente,descricao:q.titulo,escopo:q.escopo,prazoDias:q.prazoDias,status:'Pendente de planeamento',criadoEm:new Date().toISOString(),origem:'orcamento_tecnico'};
    const idOS=await write(stores.workOrders,row);row.id=idOS;state.workOrders.push(row);
    notify('Ordem de Serviço criada a partir do orçamento.','success'); await refresh();
  }
  async function refresh() {
    await load(); const root=$('kt-content'); if(root) root.innerHTML=bodyForTab();
  }
  async function render() { await load(); return shell(); }
  function tab(name) { state.tab=name; const root=$('kt-content'); if(root) root.innerHTML=bodyForTab(); document.querySelectorAll('.kt-tab').forEach(b=>b.classList.toggle('active',b.textContent.toLowerCase().includes(({overview:'visão geral',quotes:'orçamentos',products:'produtos',services:'serviços',evaluations:'diagnósticos',stock:'stock',production:'kits',tracking:'rastreio',commercial:'preços',people:'técnicos'})[name]))); }
  window.KanawaTechnical={render,tab,submit,convert,refresh};
  // The add-on is loaded after the core application; preserve all existing routes.
  const oldOpen=window.openModule;
  if(typeof oldOpen==='function') window.openModule=function(id){if(id==='tecnica'){if(!canManageTechnical()){notify('Acesso reservado à gerência e administração.','error');return;}currentModule='tecnica';document.querySelectorAll('.sidebar-item').forEach(el=>el.classList.toggle('active',el.dataset.id==='tecnica'));const c=$('content');c.innerHTML='<div class="card">A carregar centro técnico…</div>';render().then(html=>{c.innerHTML=html;c.scrollTop=0;}).catch(e=>{c.innerHTML='<div class="card">Falha ao abrir o módulo: '+escT(e.message)+'</div>';});return;}return oldOpen.apply(this,arguments);};
  const canManageTechnical = () => {
    try { const cloudRole=window.KanawaCloud&&window.KanawaCloud.context&&window.KanawaCloud.context.role; const u=JSON.parse(localStorage.getItem('kanawa_user')||'{}'); return ['admin','gerente','owner','manager'].includes(String(cloudRole||u.role||u.perfil||'').toLowerCase()); } catch (_) { return false; }
  };
  const oldSidebar=window.renderSidebar;
  if(typeof oldSidebar==='function') window.renderSidebar=function(){
    oldSidebar.apply(this,arguments);
    const sb=document.getElementById('sidebar');
    if(sb&&canManageTechnical()&&!sb.querySelector('[data-id="tecnica"]')){
      const b=document.createElement('button'); b.className='sidebar-item'; b.dataset.id='tecnica';
      b.innerHTML='<i class="fas fa-tools"></i><span>Plano Técnica</span>';
      b.addEventListener('click',()=>window.openModule('tecnica')); sb.appendChild(b);
    }
  };
  if(typeof window.renderSidebar==='function'&&document.getElementById('sidebar')&&document.getElementById('app')?.classList.contains('active')) window.renderSidebar();
})();