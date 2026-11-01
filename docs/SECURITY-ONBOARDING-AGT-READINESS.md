# Kanawa Soft v15.2 — Segurança, empresas e preparação AGT

## Estado desta entrega
- Autenticação cloud: Supabase Auth, sem conta administrativa padrão no formulário público.
- Cadastro inicial: cria conta de utilizador e empresa no mesmo fluxo de onboarding.
- NIF: opcional no cadastro inicial; a empresa pode completar os dados fiscais mais tarde.
- Isolamento inicial: perfis, empresas e associações utilizador/empresa com Row Level Security.
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
- O ERP legado ainda mantém armazenamento local/SQLite e módulos antigos; esta migração não converte as 135 tabelas operacionais para PostgreSQL.
- As operações CRUD antigas do Express precisam de autenticação obrigatória, autorização por empresa e testes de isolamento antes de expor o backend à Internet.
- Ainda falta convite/gestão de membros, troca entre várias empresas, recuperação de palavra-passe, MFA e revisão de sessões.
- A integração da loja, webhooks de stock/encomendas e API pública ainda exige backend real, contrato de API e testes ponta a ponta.
- Não executar restauro ou migração de dados em produção sem backup e plano de reversão.

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