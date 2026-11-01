# Kanawa Soft v15.2 — Segurança, empresas e preparação AGT

## Estado desta entrega
- Autenticação cloud: Supabase Auth, sem conta administrativa padrão no formulário público.
- Cadastro inicial: cria conta de utilizador e empresa no mesmo fluxo de onboarding.
- NIF: opcional no cadastro inicial; a empresa pode completar os dados fiscais mais tarde.
- Isolamento cloud: perfis, empresas, associações e registos ERP em `ks_records`, com Row Level Security por empresa e permissões de escrita/eliminação baseadas no papel do membro.
- Sincronização: os módulos elegíveis são sincronizados para Supabase; IndexedDB local é separado por ID da empresa.
- Credenciais padrão: a criação automática do administrador foi removida; a conta antiga só é desactivada automaticamente se ainda usar a senha pública `admin123`.
- Estado fiscal: separado da existência da empresa (not_configured, in_preparation, sandbox, submitted, certified, rejected).
- A certificação AGT não é automática nem garantida por esta alteração.

## Configuração e teste
1. Confirmar no Supabase Auth que o URL de redirecionamento inclui https://kanawasoft.shop/**.
2. Confirmar o método de confirmação de email configurado no projecto.
3. Publicar o commit da branch de trabalho num deploy de pré-visualização antes de produção.
4. Abrir a página, escolher Criar empresa e conta, preencher o nome da empresa e o responsável, criar uma senha forte e concluir.
5. Se a confirmação de email estiver activa, confirmar o email antes de entrar.
6. Entrar com a conta criada; verificar se o nome da empresa aparece no cabeçalho.
7. Testar uma conta diferente e confirmar que não consegue ler os dados da primeira empresa.
8. Testar logout e recarregar a página: a sessão deve ser restaurada pelo Supabase, nunca por uma flag local.

A chave usada no navegador é uma chave publishable/anon, própria para exposição pública com RLS. Nunca colocar a chave service_role, uma chave secreta ou a chave privada AGT no browser ou no repositório.

## Limitações conhecidas que impedem declarar o ERP pronto para produção
- Os registos elegíveis dos módulos são guardados em `ks_records` como JSONB, não em 135 tabelas PostgreSQL normalizadas. É uma camada de sincronização multiempresa, não substitui ainda a modelação relacional/validação de domínio de cada módulo.
- Dados sensíveis e configurações (utilizadores, integrações AGT, credenciais, sessões, backups e logs de segurança) são deliberadamente excluídos da sincronização genérica; necessitam de fluxos próprios.
- Imagens de registos elegíveis são enviadas para o bucket privado `ks-company-media` (limite 5 MB; JPEG, PNG, WebP e GIF), com pastas por empresa, permissões RLS por papel e URLs assinados temporários. A cópia data URL local é mantida para uso offline. O logótipo da empresa ainda precisa de um fluxo de armazenamento próprio.
- O backend Express/SQLite antigo continua separado do modo cloud; a sincronização legada foi desactivada no cliente quando Supabase está activo para evitar misturar dados entre empresas.
- As operações CRUD antigas do Express não devem ser expostas directamente à Internet: ainda precisam de autenticação obrigatória, autorização por empresa e testes de isolamento. O servidor actual escuta em `127.0.0.1` para uso local/desktop.
- Ainda falta convite/gestão de membros e troca de empresa no mesmo utilizador. A recuperação de senha foi adicionada ao ecrã, mas precisa de validação do redirect/email no ambiente real; MFA e revisão de sessões continuam pendentes.
- Ainda faltam testes reais no browser, dispositivos móveis, fluxos completos de vendas/stock/PDV, concorrência, limites de tamanho, recuperação de falhas de rede e backup/restauro cloud.
- A integração da loja, webhooks de stock/encomendas e API pública ainda exige backend real, contrato de API e testes ponta a ponta.
- Não executar restauro ou migração de dados em produção sem backup e plano de reversão.


## AGT signing readiness implemented in this branch

The repository now contains a standalone Node.js RS256 JWS utility at `server/agt/jws.js` and a local key-pair generator at `scripts/agt/generate-software-keypair.js`.

- Generates a 4096-bit RSA pair locally; AGT documentation requires at least 2048 bits and recommends 4096.
- Writes the private key outside the repository by default, with restrictive file permissions where supported; refuses to overwrite existing key files.
- Never prints the private key. The public key path is shown for submission through the producer portal.
- Signs the complete JSON payload using RS256 and compact JWS, and includes local verification support for regression tests.
- Requires a real `softwareValidationNumber`; the application must not invent one. The number is only populated after the AGT assigns/approves it.
- The current implementation is a signing primitive, not a complete AGT connector. It is not yet wired to production invoices or homologation endpoints, and no private key was generated in this repository environment.

Before generating a production key, the software producer must control the machine and backup process. Store the private key securely, restrict access, keep it out of Git, and rotate/revoke it through the AGT portal if compromised.

Official technical references:
- AGT Partner Portal and current Schema 2 notice: https://portaldoparceiro.minfin.gov.ao/
- AGT key management: https://portaldoparceiro.minfin.gov.ao/doc-agt/doc-agt/2/gestao.html
- AGT JWS structure and RS256: https://portaldoparceiro.minfin.gov.ao/doc-agt/doc-agt/2/estrutura.html
- AGT software/series service requirements: https://portaldoparceiro.minfin.gov.ao/doc-agt/doc-agt/2/servicos/servicos_solicitar_criacao.html

## Preparação para certificação AGT
A certificação deve ser solicitada pelo produtor de software no Portal do Parceiro. O software deve implementar e demonstrar, entre outros requisitos aplicáveis:
- Modelo técnico e Schema 2 em vigor, formatos e validações de documentos;
- geração de assinaturas JWS/RS256 e cadeia de assinatura de software/documento;
- geração local de par RSA de pelo menos 2048 bits para assinatura do software; a chave privada fica sob controlo do produtor e nunca é enviada à AGT;
- submissão da chave pública e dos dados do produto no Portal do Parceiro;
- testes de integração no ambiente de homologação, tratamento dos códigos de erro e evidência de resultados;
- numeração/séries, integridade, arquivo e rastreabilidade dos documentos.

O campo softwareValidationNumber só deve ser preenchido com o número atribuído após aprovação. Não inventar número de certificação, não emitir documentos como certificados e não apresentar o Kanawa Soft como certificado enquanto a AGT não deferir o processo.

### Fontes oficiais consultadas
- Portal do Parceiro AGT: https://portaldoparceiro.minfin.gov.ao/
- Gestão de certificados e chaves: https://portaldoparceiro.minfin.gov.ao/doc-agt/doc-agt/2/gestao.html
- Registo de factura e assinatura de software: https://portaldoparceiro.minfin.gov.ao/doc-agt/doc-agt/2/servicos/servicos_solicitar_registo.html
- Guia rápido do Portal do Parceiro: https://portaldocontribuinte.minfin.gov.ao/pdfs/guia-rapido/facturacao-electronica/guia-rapido-de-facturacao-electronica-portal-do-parceiro.pdf