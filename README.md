# Kanawa Soft ERP

Aplicação web Kanawa Soft. A interface publicada é servida a partir da pasta `app/`.

## Base de dados central

A versão Cloud utiliza Supabase Auth e PostgreSQL:

- Autenticação de utilizadores através de Supabase Auth.
- Registos dos módulos guardados em `public.ks_records`, isolados por empresa através de Row Level Security (RLS).
- Produtos e vendas finalizadas também são refletidos nas tabelas normalizadas, para aplicar regras de stock e quotas.
- Empresas, membros, licenças, instalações e pedidos de demonstração são mantidos nas tabelas `ks_*`.
- Cache IndexedDB e fila local para permitir trabalho temporário sem ligação.
- A primeira autenticação migra os registos locais para a empresa cloud quando ainda não existem registos remotos.

O browser utiliza apenas a publishable key. Nunca colocar `service_role`, secret keys, JWT secrets ou credenciais de servidor no código público.

## Primeiro acesso

1. Abrir o domínio Kanawa Soft.
2. Selecionar **Criar conta e configurar empresa**.
3. Preencher os dados da empresa e do administrador.
4. Confirmar o endereço de email, se o projeto exigir confirmação.
5. No login, introduzir o email e validar o código OTP de 6 dígitos enviado pelo Supabase.
6. Verificar o indicador de ligação e criar um produto de teste.
7. Abrir o mesmo domínio noutro dispositivo, entrar com a mesma conta e confirmar que o produto aparece.

O trigger de onboarding existente cria a empresa, a associação de proprietário e uma licença de avaliação de 14 dias. Os limites e o estado da licença são mantidos no PostgreSQL.

## Publicação Netlify

A configuração em `netlify.toml` publica a pasta `app/`.

A publicação atual do projeto Netlify foi criada por API/manual; a ligação de Git contínuo não está confirmada. Foi incluído `.github/workflows/netlify-deploy.yml` para permitir previews e produção:

1. No Netlify, abrir User settings → Applications → Personal access tokens e criar um token.
2. No GitHub, abrir Settings → Secrets and variables → Actions do repositório `dpedroservice-code/Kanawasoftv15.2`.
3. Criar o secret `NETLIFY_AUTH_TOKEN` e guardar o token diretamente no GitHub. Não o enviar por chat nem o colocar no código.
4. Reexecutar o workflow **Netlify deploy** na branch `feat/kanawa-email-otp-login` para criar um preview; o URL aparece nos logs da execução.
5. Testar o preview antes de integrar a branch na `main`. Só um push na `main` faz o workflow publicar em produção.

Em alternativa, pode-se ligar o repositório diretamente ao projeto Netlify e ativar Deploy Previews. O domínio `kanawasoft.shop` deve permanecer associado ao projeto Netlify existente. Não criar um segundo site nem alterar os registos DNS.

## Limites desta entrega

A ligação cloud e o fluxo de autenticação são a primeira etapa da migração. A gestão completa de utilizadores/equipas, painel institucional D.PEDRO SOLUÇÕES, alertas por email, integração fiscal e motor de rotas de entregas devem ser validados e concluídos nas etapas seguintes. O sistema não deve ser apresentado como certificado pela AGT.

## Modo offline e segurança da sessão (atualização 2026-11-02)

- O IndexedDB é a cache persistente local; fechar o browser não deve apagar os dados. Limpar os dados do site, usar navegação privada ou atingir limites de armazenamento pode removê-los.
- A fila de sincronização conserva operações offline e agrupa atualizações repetidas do mesmo registo. O envio é retomado ao recuperar a ligação, ao regressar ao separador e pelo intervalo automático.
- A sincronização não declara sucesso enquanto existirem operações pendentes. Falhas ao ler o IndexedDB são apresentadas como erro, em vez de serem convertidas silenciosamente numa lista vazia.
- A sessão persistida é validada com `auth.getUser()` quando existe ligação. O contexto em cache só é usado para falhas de rede; erros de autenticação, associação suspensa ou permissões não são contornados.
- O service worker guarda a estrutura da aplicação e recursos estáticos. Chamadas Auth, REST e Functions do Supabase não são colocadas em cache.
- O Netlify já aplica compressão HTTP na CDN; não se deve definir manualmente `Content-Encoding` ou duplicar Gzip/Brotli.
- O ficheiro Android `/.well-known/assetlinks.json` ainda depende da impressão digital SHA-256 do certificado de assinatura da aplicação Android. Não publicar um ficheiro fictício: fornecer a impressão digital real para gerar a associação Trusted Web Activity.

## Pontos de segurança identificados para revisão antes da produção

O Supabase Advisor assinalou duas funções `SECURITY DEFINER` executáveis por utilizadores autenticados: `public.ks_get_map_provider_config()` e `public.ks_list_payment_provider_status()`. A primeira consulta definições de mapa sem filtrar a empresa. Rever a necessidade de acesso público, o escopo por empresa e a política de execução antes de alterar permissões. Também foi sinalizada a proteção de palavras-passe comprometidas desativada. Nenhuma política ou função de produção foi alterada nesta entrega.
