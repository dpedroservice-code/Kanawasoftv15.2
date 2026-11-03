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
