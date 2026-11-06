> **Aviso de consolidação — 6 de novembro de 2026**
>
> Este repositório está a ser usado exclusivamente como **fonte de comparação e aproveitamento de código** para a consolidação no repositório oficial [KanawaSoft-1.0](https://github.com/dpedroservice-code/KanawaSoft-1.0). Não iniciar aqui uma linha paralela de funcionalidades nem publicar esta branch como produção durante a revisão.
>
> A auditoria decorre na branch `audit/consolidacao-kanawasoft-1.0`. O código e o histórico existentes são preservados. As funcionalidades deste repositório só serão transferidas depois de comparação de dependências, dados, permissões e testes. A consolidação central e o estado oficial da revisão estão no [Plano Mestre Único](https://github.com/dpedroservice-code/KanawaSoft-1.0/blob/feat/agt-api-foundation/docs/PLANO-MESTRE-KANAWASOFT-1.0.md).
>
> O nome deste repositório ainda não foi alterado; a renomeação administrativa para `KanawaSoft-1.1.0` permanece pendente. A versão declarada no código será normalizada apenas depois da auditoria, para evitar confundir o nome do repositório com a versão real da aplicação.
>
> ---
>
# Kanawa Soft ERP — versão de produção 1.1.0

Aplicação web Kanawa Soft. A interface publicada é servida a partir da pasta \`app/\`.

## Arquitectura e dados

- IndexedDB mantém a cache local e a fila de sincronização.
- Supabase Auth autentica os utilizadores.
- PostgreSQL guarda os dados centrais.
- As tabelas de negócio usam \`company_id\` e Row Level Security (RLS), com verificação de associação e permissões no servidor.
- Cada empresa fica isolada das restantes. O acesso entre empresas só deve existir através de uma associação de filial e permissões explícitas; não se deve confiar apenas em filtros do frontend.
- A arquitectura usa tabelas partilhadas com isolamento por empresa, em vez de criar tabelas físicas ou bases de dados independentes para cada registo. Isso mantém as migrações, backups e regras de segurança consistentes.

## Fluxo de vendas e sincronização

- Leituras comuns usam primeiro a cache local.
- Gravações não críticas entram na fila de sincronização em segundo plano.
- A finalização de uma venda continua a exigir validação transaccional no PostgreSQL.
- A transacção do servidor controla valores, permissões e stock; o espelho histórico é sincronizado depois.
- Não se deve repetir a finalização de uma venda já confirmada.

## Integração AGT

A configuração por empresa fica protegida no Supabase Vault. A interface não guarda palavras-passe nem chaves privadas no IndexedDB ou no armazenamento local do navegador. O botão de teste consulta as séries no serviço oficial da AGT, em homologação ou produção.

O número de validação do software e as chaves devem ser emitidos/registados pelos canais oficiais. A presença de campos ou um teste de autenticação não significa que o Kanawa Soft esteja certificado pela AGT nem que uma factura tenha sido aceite.

## GPS e mapas

O módulo de frota inclui mapa com camada de satélite e mapa de ruas. A localização do Android só é partilhada depois de o utilizador autorizar o acesso à localização. As posições são associadas à empresa autenticada.

## Publicação Netlify

A configuração em \`netlify.toml\` publica a pasta \`app/\`. O domínio \`kanawasoft.shop\` deve permanecer associado ao projecto Netlify existente. Não criar um segundo site nem alterar os registos DNS sem necessidade.

A branch de finalização é \`feat/kanawa-erp-1.1.0-finalization\`. O preview deve ser testado antes de integrar as alterações na branch principal e publicar em produção.

## Testes

Executar \`npm test\` para validar as regras de vendas, validações operacionais e verificações de versão/integração.
