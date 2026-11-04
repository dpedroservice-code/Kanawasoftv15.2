# KanawaSoft v15.4 — teste de vendas, consistência e sincronização

## Arquitetura do fluxo de venda

1. A interface e o cache usam IndexedDB. A fila offline tem índice único por entidade + identificador, para não acumular pedidos repetidos do mesmo registo.
2. A finalização passa por `POST /api/sales/finalize`. No Electron/servidor local, a rota é servida pelo Express. No Netlify Deploy Preview, o mesmo caminho é encaminhado para `/.netlify/functions/sales-finalize`.
3. O gateway valida o bearer token através do Supabase Auth e encaminha a chamada para `public.ks_finalize_sale` com o mesmo JWT do utilizador. Não usa service-role key.
4. A função PostgreSQL valida permissões, empresa, limites de desconto, precisão decimal, pagamento e stock. O decremento de stock é condicional e transacional.
5. A migração `20261104100000_kanawa_v154_atomic_sales_idempotency.sql` adiciona fingerprint de idempotência e grava o registo `ks_records/vendas` na mesma transação que venda, linhas, pagamento, movimentos de stock e evento de utilização.

## Garantias implementadas no código

- Repetir o mesmo identificador e os mesmos dados devolve o resultado original sem novo movimento.
- Reutilizar o identificador com valores ou linhas diferentes é rejeitado.
- Totais, impostos, descontos e valores recebidos têm no máximo duas casas decimais; quantidades têm no máximo três.
- Subtotal e total têm de reconciliar exatamente em unidades monetárias mínimas.
- Uma venda rejeitada pelo servidor restaura o snapshot local anterior, em vez de permanecer apresentada como finalizada.
- Pedidos offline para o mesmo registo são consolidados na fila IndexedDB.
- A venda só é apresentada como confirmada depois de resposta de sucesso do servidor.

## Testes automatizados

O CI executa:
- testes de normalização monetária com unidades inteiras (cêntimos/milésimos);
- testes do gateway autenticado, rejeição de sessão inválida e mapeamento de conflitos para HTTP 409;
- testes de contrato da migração SQL;
- a suite completa `npm test`;
- verificações de sintaxe dos novos endpoints Express e Netlify.

## Passos de teste no Deploy Preview

1. Criar/usar uma conta de teste separada e uma empresa cujo nome legal ou comercial comece por `TESTE`.
2. Entrar no Deploy Preview; contas de empresas sem o prefixo `TESTE` são bloqueadas.
3. Criar um produto de teste com stock 1 e preço conhecido.
4. Abrir duas sessões/caixas da mesma empresa de teste. Tentar vender a última unidade em ambos. Apenas uma venda deve ser confirmada; a outra deve receber stock insuficiente.
5. Reenviar exatamente a mesma venda com o mesmo identificador. Deve continuar a existir uma única venda e um único conjunto de movimentos.
6. Reenviar o mesmo identificador com total ou linhas diferentes. O servidor deve rejeitar o conflito e preservar os valores existentes.
7. Simular perda de rede após envio e voltar a sincronizar. A fila deve repetir o mesmo identificador, sem duplicar venda, pagamento ou movimento.
8. Confirmar o total, desconto, IVA, recebido, troco e saldo de stock no servidor e em ambos os dispositivos.

## Migração e ambiente

A migração SQL está apenas no branch/PR. **Não foi aplicada ao projeto Supabase existente**, porque o preview atualmente reutiliza esse projeto e uma migração de schema altera o banco partilhado, mesmo com dados de teste isolados por empresa. Para provar a nova escrita atómica de `ks_records`, é necessário aplicar esta migração num projeto/branch Supabase de teste separado e configurar o preview para apontar para ele.

Até a migração ser aplicada no ambiente de teste, o gateway continua compatível com a função antiga: a venda normalizada, o stock, os pagamentos e os movimentos são transacionais, mas o espelho `ks_records` usa o caminho legado separado. Não declarar o teste completo de atomicidade do histórico antes de validar a migração no banco de teste.

## Limites de validação

CI e testes unitários não substituem testes reais de concorrência PostgreSQL, perda de rede, dois dispositivos, browser e caixa físico. Não considerar o ERP pronto para produção apenas porque o Deploy Preview compila.
