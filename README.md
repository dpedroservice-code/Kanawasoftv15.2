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
5. Entrar com o email e a senha criados.
6. Verificar o indicador de ligação e criar um produto de teste.
7. Abrir o mesmo domínio noutro dispositivo, entrar com a mesma conta e confirmar que o produto aparece.

O trigger de onboarding existente cria a empresa, a associação de proprietário e uma licença de avaliação de 14 dias. Os limites e o estado da licença são mantidos no PostgreSQL.


## Utilizadores, perfis e permissões

A gestão de equipa é exclusiva do proprietário/administrador da empresa.

1. Entrar com a conta de administrador e abrir **Utilizadores e Permissões**.
2. Selecionar **Convidar funcionário**, preencher nome e email individual e escolher Gerente, Operador, Caixa, Contabilista ou Consulta.
3. Marcar, por módulo, as operações permitidas: ver, criar, editar, excluir, exportar, importar, aprovar, cancelar e configurar.
4. Gerar o convite e entregar a chave de ativação ao funcionário por um canal privado.
5. O funcionário abre **Ativar convite de funcionário**, informa o mesmo email, a chave e cria a sua própria palavra-passe.
6. O administrador pode alterar permissões ou suspender a conta na lista de utilizadores.

A chave do convite é individual, de utilização única e expira em 72 horas. Não é uma palavra-passe partilhada. Cada funcionário autentica-se com o seu próprio email e palavra-passe. Convites não podem criar outra conta de administrador.

As permissões ficam em ks_company_memberships.permissions e são verificadas por políticas RLS no PostgreSQL. O menu e os formulários também respeitam as permissões, mas a segurança não depende apenas da interface. O acesso às tabelas de produtos, clientes, vendas, pagamentos, movimentos de stock e registos dos módulos é limitado pela base de dados. A finalização de vendas utiliza uma operação controlada para reduzir o stock sem conceder ao caixa permissão para alterar preços.

A cache IndexedDB é separada por utilizador neste dispositivo. Ao sincronizar, o ERP volta a consultar as permissões da sessão; a suspensão do funcionário bloqueia a próxima autenticação e as operações protegidas no servidor.

**Nota:** a ativação do convite cria o utilizador no Supabase Auth e a associação à empresa. O envio do código ao funcionário é feito pelo administrador; ainda não existe envio automático de email/SMS nesta etapa.

## Publicação Netlify

A configuração em `netlify.toml` publica a pasta `app/`.

A publicação atual do projeto Netlify foi criada por API/manual; a ligação de Git contínuo não está confirmada. Foi incluído `.github/workflows/netlify-deploy.yml` para permitir previews e produção:

1. No Netlify, abrir User settings → Applications → Personal access tokens e criar um token.
2. No GitHub, abrir Settings → Secrets and variables → Actions do repositório `dpedroservice-code/Kanawasoftv15.2`.
3. Criar o secret `NETLIFY_AUTH_TOKEN` e guardar o token diretamente no GitHub. Não o enviar por chat nem o colocar no código.
4. Reexecutar o workflow **Netlify deploy** na branch `feat/cloud-postgres-auth-sync` para criar um preview; o URL aparece nos logs da execução.
5. Testar o preview antes de integrar a branch na `main`. Só um push na `main` faz o workflow publicar em produção.

Em alternativa, pode-se ligar o repositório diretamente ao projeto Netlify e ativar Deploy Previews. O domínio `kanawasoft.shop` deve permanecer associado ao projeto Netlify existente. Não criar um segundo site nem alterar os registos DNS.

## Limites desta entrega

A ligação cloud e o fluxo de autenticação são a primeira etapa da migração. A gestão completa de utilizadores/equipas, painel institucional D.PEDRO SOLUÇÕES, alertas por email, integração fiscal e motor de rotas de entregas devem ser validados e concluídos nas etapas seguintes. O sistema não deve ser apresentado como certificado pela AGT.