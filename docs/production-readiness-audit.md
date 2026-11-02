# Auditoria de prontidão para produção — KanawaSoft v15.2

**Data da verificação:** 2026-11-02  
**Repositório auditado:** `dpedroservice-code/Kanawasoftv15.2`  
**Base de dados:** projeto Supabase ligado ao KanawaSoft  
**Objetivo:** distinguir funcionalidades implementadas, integrações reais, simulações e bloqueios de produção.

## Resumo executivo

A aplicação contém 94 módulos no menu e funções de renderização para os módulos verificados. Isso não significa que todas as operações tenham uma API real ou estejam prontas para produção. A auditoria encontrou módulos que apresentavam mensagens de sucesso sem executar a operação, permissões de equipa não ligadas ao contrato do servidor e uma falha na validação de pagamentos do PDV.

As correções foram preparadas em branches e pull requests. **Não foi alterada a branch `main`, não foi aplicada nenhuma migração à base de dados e não foi publicado nenhum deploy de produção.**

## Achados confirmados

| Área | Estado observado | Risco | Tratamento preparado |
|---|---|---|---|
| PDV / vendas | O PDV podia enviar troco negativo quando o valor recebido estava vazio; o RPC validava antes de normalizar o pagamento | Venda rejeitada ou estado inconsistente | PR #7: arredondamento monetário, validação de pagamento, cálculo de troco, reconciliação de artigos e limites de desconto no servidor |
| Permissões | O contexto cloud não carregava `permissions`; papéis desconhecidos eram apresentados como operador | Interface podia mostrar ações que o servidor recusaria | PR #8: permissões por módulo/ação e falha segura |
| Gestão de utilizadores | O ecrã criava registos locais e guardava senhas no IndexedDB, sem criar uma conta de equipa real | Credenciais locais e falsa gestão de utilizadores | PR #8: convites por email através de Supabase Auth e RPC de convite |
| Alteração de senha | A rotina anterior atualizava o registo local e apresentava sucesso, sem alterar a senha de Auth | Utilizador acreditava que a senha tinha sido alterada | PR #8: reautenticação e alteração através de Supabase Auth |
| RLS | A consulta ao catálogo de tabelas públicas não encontrou tabelas sem RLS | Positivo, mas não prova que todas as políticas estejam corretas | Continuar a rever políticas e testes por papel |
| Funções privilegiadas | Foram encontrados dois RPCs públicos `SECURITY DEFINER` sinalizados pelo Advisor | Possível leitura fora do âmbito de empresa | PR #8: funções invoker e políticas RLS por empresa/administrador |
| Proteção de senhas | O Advisor indica proteção contra senhas comprometidas desativada | Menor proteção contra senhas expostas | Requer ativação em Auth → Password Security no painel Supabase |
| Pagamentos online | Os sete provedores consultados estavam desativados ou não configurados: Multicaixa Express, Unitel Money, Stripe, PayPal, Paddle e transferências | Checkout não pode cobrar clientes | PR #8: mostrar o estado real do servidor e deixar de apresentar testes/configurações fictícios |
| Mapas e rotas | A tabela de configuração de mapas não tinha registos; a roteirização guardava origem/destino/distância manualmente | Não há cálculo de rota real configurado | Pendente: configurar fornecedor, geocodificação, rotas e mapa |
| Rastreio | A rotina anterior criava um estado “em trânsito” sem consultar transportadora | Estado de encomenda falso | PR #8: não inventar estado; informar que não há integração externa |
| Picking / cross-docking | Os botões apresentavam sucesso sem executar transação de stock | Inventário poderia ser interpretado como movimentado sem o ser | PR #8: bloquear mensagens de sucesso até existir integração transacional |
| E-commerce | O checkout criava apenas um pedido pendente; não processava pagamento | Não é checkout online completo | PR #8: indicar explicitamente que o pedido fica pendente e não há cobrança |

## Estado dos pull requests

- **PR #7 — PDV:** correção do contrato de venda, precisão monetária, troco, pagamento insuficiente, reconciliação de artigos e limites de desconto no PostgreSQL. CI executada com sucesso.
- **PR #8 — RBAC e integrações:** permissões por módulo, gestão real de equipa, alteração de senha por Supabase Auth, convite com permissões, proteção dos RPCs e remoção de falsas mensagens de sucesso. CI executada com sucesso na revisão verificada; os últimos commits devem concluir a respetiva execução antes de merge.

## Integrações ainda não prontas

1. **Mapas:** escolher/configurar fornecedor e endpoints reais; adicionar geocodificação, cálculo de distância/duração e visualização cartográfica.
2. **Transportadoras:** escolher API e credenciais para obter estados reais de expedição.
3. **Pagamentos:** contratar/configurar o provedor adequado a Angola, manter segredos no backend e implementar callbacks/webhooks idempotentes.
4. **Stock/logística:** implementar picking, cross-docking, transferências e expedição através de transações atómicas no servidor.
5. **E-commerce:** ligar checkout, pagamento, confirmação, cancelamento, devolução e reconciliação de pedidos.
6. **RBAC:** testar contas reais de administrador, gerente, operador, caixa, contabilista e visualizador; verificar também chamadas diretas aos RPCs, não apenas a visibilidade dos menus.

## Critério para declarar produção

Não declarar o sistema pronto enquanto as migrações não forem aplicadas e verificadas, a Edge Function não estiver implantada, os provedores necessários não estiverem configurados e os fluxos críticos não passarem testes de ponta a ponta. A existência de um módulo no menu, de um botão ou de uma mensagem de sucesso não é prova de integração funcional.

**Nota:** esta auditoria não atribui nem afirma certificação AGT. Qualquer integração fiscal ou certificação deve ser validada separadamente.
