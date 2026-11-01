# Normalização de vendas e stock

- Produtos e clientes passam a ter tabelas próprias por empresa (ks_products, ks_customers).
- As vendas finalizadas do PDV usam a função transaccional ks_finalize_sale: grava venda, linhas, movimento de stock e pagamento na mesma transacção PostgreSQL.
- A operação é idempotente pelo identificador externo da venda, para que uma repetição da fila offline não desconte stock duas vezes.
- O stock da tabela normalizada é a fonte autoritativa durante a hidratação; a sincronização do cadastro do produto não substitui a quantidade existente, evitando sobrescrever stock por dados locais antigos.
- Vendas offline entram numa fila de finalização e só ficam confirmadas na nuvem quando a operação transaccional for aceite.
- Ainda falta ligar ajustes manuais, compras, devoluções, inventário físico e outras rotinas de stock às funções transaccionais; o JSONB ks_records continua a servir os restantes módulos.
