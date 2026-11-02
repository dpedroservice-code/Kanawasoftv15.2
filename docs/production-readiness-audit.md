# Auditoria de prontidão para produção — KanawaSoft v15.3.0

**Data:** 2026-11-02  
**Repositório:** `dpedroservice-code/Kanawasoftv15.2`  
**Supabase:** projeto `jiehrswweoyesbabrpjf` (ativo e saudável)  
**Netlify:** `kanawa-soft` — `https://kanawasoft.shop`

## Correções anteriores confirmadas

- As alterações das PR #7 e #8 foram integradas na branch `main` no commit `c7fde71af78d1cde0396a7c471bfda0b77eb07c2`.
- Migrações de vendas e convites presentes na base de dados.
- Edge Function `ks-invite-member` ativa, versão 3, com JWT obrigatório.
- CI anterior aprovou verificações de sintaxe, Deno check e testes unitários.
- A proteção de palavras-passe comprometidas continua desativada no Supabase Auth.
- O advisor de performance reporta políticas RLS permissivas sobrepostas em algumas tabelas e índices não utilizados; rever sem eliminar índices de forma automática.

## Alterações propostas na PR #9

- Alinhamento da versão do pacote, lockfile, interface, servidor e Electron para 15.3.0.
- Remoção das coordenadas fixas de Luanda do registo GPS.
- Validação de latitude/longitude e identificação dos registos como introduzidos manualmente; coordenadas antigas sem origem comprovada são mostradas como não verificadas.
- Distâncias de rotas opcionais e identificadas como manuais; sem valor, são explicitamente não calculadas.
- Validação dos estados internos de encomendas; a alteração manual não é apresentada como confirmação de pagamento ou transportadora.
- Testes unitários para coordenadas, distâncias e estados de encomenda.

## Bloqueios para produção integral

1. **Mapas/rotas:** não há motor real de geocodificação e roteirização configurado. Falta fornecedor, credenciais/endpoint seguro, mapa, distância, duração e testes reais.
2. **GPS em tempo real:** exige rastreador ou app de campo, ingestão autenticada, atualização e retenção de posições.
3. **Transportadoras:** falta selecionar operador e configurar API/webhooks para estados reais.
4. **Pagamentos:** provedores permanecem desativados/não configurados. Falta gateway compatível com Angola, segredos no backend, callbacks assinados e reconciliação idempotente.
5. **Picking/cross-docking:** faltam transações PostgreSQL para stock, armazéns, lotes, concorrência e auditoria.
6. **E-commerce:** pedidos são registados como pendentes; não há cobrança online nem ciclo completo de cancelamento/devolução/reconciliação.
7. **Auth:** ativar leaked-password protection nas definições do Supabase.
8. **RLS:** rever avisos de políticas permissivas e testar isolamento multiempresa com contas reais por perfil.
9. **Impressão:** testar impressora física A4/térmica e gerar/instalar pacote Electron 15.3.0.
10. **Fiscalidade:** validar regras fiscais e eventual certificação AGT separadamente; não declarar certificação sem confirmação oficial.

## Publicação

A PR #9 passou a CI automatizada. O workflow Netlify terminou com sucesso, mas a etapa de preview foi ignorada porque `NETLIFY_AUTH_TOKEN` não está configurado nos GitHub Actions. Por isso, esta branch ainda não foi publicada no domínio de produção.

A CI verde não comprova integrações externas, impressão física, telemetria, pagamentos reais ou conformidade fiscal.
