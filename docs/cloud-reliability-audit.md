# Auditoria e melhorias de infraestrutura — Kanawa Soft

Data: 2026-11-02

## Estado confirmado

- Supabase APP: projeto `jiehrswweoyesbabrpjf`, estado `ACTIVE_HEALTHY`, PostgreSQL 17.6.
- Netlify: site `kanawa-soft`, domínio primário `https://kanawasoft.shop`, último deploy publicado marcado como `ready`.
- O repositório já tinha IndexedDB, fila `_sync_queue`, cache cloud e sincronização pull/push. A implementação reforça o que existe em vez de substituir o modelo de dados.
- A branch base inclui a implementação de login por OTP no PR #5. Esta branch acrescenta melhorias de resiliência sem integrar na produção.

## Alterações desta branch

1. Validar a sessão Supabase no servidor com `auth.getUser()`; usar o contexto local apenas em falhas de rede, nunca para contornar rejeições de autenticação ou associação.
2. Confirmar a sessão e a associação ativa antes de marcar a API como online.
3. Agrupar atualizações pendentes do mesmo registo, preservar a fila de operações e alertar quando a fila não puder ser guardada.
4. Retomar sincronização em eventos `online`, `pageshow`, regresso ao separador e intervalo de 60 segundos; impedir execuções concorrentes.
5. Não apresentar uma sincronização como concluída se ainda existirem operações pendentes.
6. Não converter falhas de leitura do IndexedDB silenciosamente numa lista vazia.
7. Adicionar service worker para cache do shell PWA e recursos estáticos; as chamadas Auth/REST/Storage/Functions não são armazenadas em cache.
8. Definir revalidação do service worker/manifesto e cache de recursos estáticos no Netlify.

## Pendências antes da produção

- Configurar o template Magic Link do Supabase para apresentar `{{ .Token }}` e testar o OTP no preview.
- Executar testes de login, sessão revogada, membro suspenso, offline/online, conflito de dados, falha de IndexedDB e fila com vendas.
- Revisar as duas funções `SECURITY DEFINER` reportadas pelo Supabase Advisor e a proteção contra palavras-passe comprometidas. Não foram alteradas diretamente no banco.
- Obter a impressão digital SHA-256 do certificado Android para criar `app/.well-known/assetlinks.json`. O package ID identificado no Electron é `com.kanawasoft.erp`, mas a assinatura TWA deve ser confirmada com o certificado Android realmente utilizado.
- O Netlify deve receber o secret `NETLIFY_AUTH_TOKEN` no GitHub Actions para executar o preview. Não colocar o token no repositório ou no chat.
- A compressão Brotli/Gzip é servida automaticamente pela CDN Netlify; não definir manualmente `Content-Encoding`.

## Segurança e dados

Nenhuma chave service-role foi adicionada ao browser. Nenhuma tabela, política RLS ou função de produção foi modificada nesta branch. Nenhuma publicação de produção foi iniciada.
