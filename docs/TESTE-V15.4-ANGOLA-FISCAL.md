# Guia de teste — KanawaSoft v15.4 / Fiscal Angola

> Ambiente: apenas empresa e dados fictícios. Não usar para emitir documentos fiscais reais.

## Estado do teste
- CI GitHub Actions: aprovado no commit inicial desta entrega.
- Preview Netlify específico da PR #11: ainda não apareceu na lista de deploys; não usar o Preview da PR #10 como se incluísse estas alterações.

## Cenários POS

1. Entrar numa empresa de teste e abrir o POS.
2. Adicionar um artigo de teste com preço de 100.000 AOA e quantidade 1.
3. Selecionar **Regime Geral (IVA 14%)**.
   - Esperado: base 100.000 AOA, IVA 14.000 AOA, total 114.000 AOA.
4. Selecionar **Simplificado (7%)**.
   - Esperado: base 100.000 AOA, IVA 7.000 AOA, total 107.000 AOA.
5. Selecionar **Isento** sem preencher o fundamento legal.
   - Esperado: alerta visível e botão de finalizar não conclui a venda.
6. Preencher um fundamento de teste com pelo menos cinco caracteres.
   - Esperado: IVA zero; o registo continua a ser apenas um documento comercial de teste.
7. Voltar ao Regime Geral e desmarcar **Aplicar IVA**.
   - Esperado: operação bloqueada; não deve ser possível retirar IVA manualmente num regime tributável.
8. Finalizar uma venda de teste com pagamento suficiente.
   - Esperado: a venda segue o fluxo normal de gravação; o documento impresso identifica claramente que não é certificado pela AGT e não apresenta pseudo-hash.
9. No módulo Fiscal, tentar exportar SAF-T AO.
   - Esperado: aviso de bloqueio. O sistema não deve descarregar JSON com extensão XML nem fingir que gerou SAF-T oficial.

## Cenários automatizados
O teste `tests/angola-tax.test.mjs` valida:
- IVA geral e simplificado;
- isenção com fundamento obrigatório;
- bloqueio de desativação manual do IVA;
- classificação de FT, FR, FS, ND, NC e FP (FP não fiscal);
- retenção opcional apenas em serviços e com fundamento legal;
- rejeição de valores/regimes inválidos.

## Fora do âmbito desta entrega
Ainda não testar nem usar como função legal: SAF-T AO XML, certificação/homologação AGT, documentos fiscais oficiais, escalões completos de IRT, INSS, guias oficiais, conciliação bancária e fecho cego de caixa. Estes módulos exigem implementação e validação próprias.

## Cenários Stock e Inventário — primeira entrega

1. Abrir **Stock e Inventário** com uma empresa de teste.
2. Selecionar um produto com saldo 10 e mínimo 3.
3. Registar uma entrada de 5 unidades com motivo/documento.
   - Esperado: saldo 15; movimento com saldo anterior 10, quantidade 5, saldo final 15 e operador.
4. Registar uma saída de 4 unidades.
   - Esperado: saldo 11; movimento com saldo anterior 15 e saldo final 11.
5. Tentar uma saída de 12 unidades quando existem 11.
   - Esperado: bloqueio, sem alteração do produto e sem movimento criado.
6. Fazer uma contagem física de 8 unidades.
   - Esperado: saldo final 8 e movimento de ajuste com diferença calculada.
7. Tentar quantidade zero ou negativa numa entrada/saída.
   - Esperado: operação bloqueada.
8. Abrir o sistema sem rede, registar um movimento e voltar a ligar.
   - Esperado: produto e movimento ficam na fila local para sincronização; confirmar a fila antes de declarar sincronização concluída.
9. No PDV, finalizar uma venda de teste.
   - Esperado: o stock segue o RPC transacional existente quando online; o livro local regista um movimento por artigo, com referência da venda.

## Limites desta primeira entrega de stock

- Movimentos locais são gravados em conjunto com o saldo do produto numa transação IndexedDB.
- A sincronização para PostgreSQL é feita pela fila existente, em duas operações ordenadas; não é ainda uma transação SQL única entre saldo e livro de movimentos.
- O stock normalizado cloud continua a usar o saldo agregado por produto. Armazéns múltiplos com saldos independentes, transferências inter-armazéns, custo médio ponderado, lotes/validades e inventário cíclico ainda não estão implementados nesta entrega.
- O teste automatizado cobre o motor de movimentos; não substitui um teste de concorrência com duas caixas ligadas ao mesmo produto nem um ensaio num dispositivo móvel.
