# Kanawa Soft — Plataforma SaaS global

## Estado da implementação
Este documento descreve o que foi adicionado ao Kanawa Soft v15.2 no projecto de endurecimento SaaS. A aplicação continua baseada em JavaScript, Node.js/Express, IndexedDB, Supabase/PostgreSQL e Netlify. Os módulos ERP existentes foram preservados.

## Licenciamento automático
- O registo de uma empresa cria automaticamente uma licença Starter de demonstração por 14 dias, com tolerância adicional de 5 dias.
- O código da licença é gerado na base de dados no formato KS-..., sem necessidade de o administrador inventar códigos.
- O administrador da plataforma pode emitir uma licença, seleccionar o plano, definir o estado e a duração no módulo **Admin SaaS**.
- O catálogo canónico de planos é `ks_saas_plans`; as subscrições são registadas em `ks_subscriptions`; os códigos/validade de produto ficam em `ks_company_licenses`.
- Os critérios de licenciamento combinam número de utilizadores, número de facturas por mês, volume de facturação mensal (USD quando existe taxa de câmbio) e armazenamento.
- Após expirar a licença e terminar a tolerância, o ERP passa para modo de leitura. As políticas RLS bloqueiam as operações de escrita na nuvem e o IndexedDB aplica a mesma restrição à interface local.

## Como criar uma licença no ERP
1. Entrar com a conta que está registada como administrador da plataforma.
2. Abrir **Admin SaaS**.
3. Seleccionar a empresa e o plano Starter, Professional ou Enterprise.
4. Escolher estado e duração.
5. Clicar em **Gerar licença automaticamente**.
6. O ERP gera o código, guarda a validade e cria a subscrição correspondente. Copiar o código a partir da tabela para entregar ao cliente.

A licença de demonstração é criada automaticamente durante o registo da empresa. Não é necessário criar uma segunda licença para iniciar o teste.

## Métricas do administrador
- **Empresas clientes:** empresas registadas no Kanawa.
- **Pessoas/utilizadores:** membros activos das empresas.
- **Instalações activas:** navegadores ou dispositivos que abriram o ERP com uma sessão válida.
- **Precisam instalar:** membros activos sem uma instalação registada.
- **Demos pendentes:** pedidos de demonstração novos ou agendados.
- **Licenças a vencer:** licenças com vencimento nos próximos sete dias.

A contagem de instalações utiliza um identificador aleatório guardado localmente por empresa. Não recolhe fingerprint biométrico nem dados sensíveis do dispositivo.

## Alertas e ligação futura ao site institucional
Os avisos de licença são criados em `ks_platform_notifications`, numa caixa de saída (outbox) do Supabase. O módulo Admin SaaS permite acompanhar e marcar os alertas. A integração com `dpedrosolucoes.shop` ainda não foi activada: a fase seguinte deve criar um endpoint autenticado, assinatura HMAC, fila de tentativas, confirmação de entrega e regras de minimização de dados. O ERP não envia dados para o site institucional nesta fase.

## Métodos de pagamento
O catálogo inclui:
- Transferência manual e transferência bancária internacional
- Multicaixa Express
- Unitel Money
- PayPal
- Stripe
- Paddle

A existência no catálogo não significa que o gateway esteja operacional. Stripe, PayPal, Paddle, Multicaixa Express e Unitel Money exigem contrato/conta de comerciante, credenciais privadas, webhooks e testes sandbox. As chaves devem ficar em Supabase Edge Function Secrets ou num backend seguro, nunca no JavaScript público.

## Globalização e localização
Cada empresa pode configurar idioma/região, moeda ISO 4217, fuso horário IANA e formato de data. Os formatadores de moeda, número e data usam a configuração da empresa. As tabelas `ks_tax_rules` e `ks_exchange_rates` guardam regras fiscais e câmbios por empresa.

O motor fiscal está preparado para regras por país, mas a tradução de todos os textos fixos e a substituição de cada cálculo fiscal legado exigem uma revisão módulo a módulo. As regras fiscais devem ser validadas por contabilista/localidade antes de utilização legal. As regras específicas de Angola e a preparação AGT não devem ser desactivadas por uma mudança de idioma.

## Mapas, rotas e entregas
A logística utiliza:
- Photon para pesquisar moradas e converter texto em coordenadas.
- OSRM para calcular percurso rodoviário, distância e duração estimada.
- Leaflet e OpenStreetMap para desenhar o percurso e os pontos no mapa.
- Registo local da rota, veículo/motorista e referência da entrega.

Os endpoints públicos são adequados a demonstração e testes, não oferecem SLA e podem impor limites. Para produção comercial com muitos clientes, configurar serviço próprio ou fornecedor comercial com contrato, limites, cache, monitorização e política de privacidade. O cálculo de rotas requer ligação à internet.

## Administração inicial da plataforma
A migração atribui o papel de administrador ao endereço `dpedroservice@gmail.com` se esse utilizador já existir, ou quando for criado no Supabase Auth. Se a conta usada pelo proprietário da D.Pedro Soluções for outra, o respectivo utilizador precisa de ser adicionado a `ks_platform_admins` por uma operação administrativa segura antes de o módulo Admin SaaS aparecer.

## O que ainda não deve ser anunciado como concluído
- A API do site institucional ainda não está conectada.
- Os gateways de pagamento ainda não processam cobranças automáticas.
- O formulário público de pedidos de demo e a sua protecção anti-spam ainda precisam de uma Edge Function.
- A cobertura de tradução integral de todos os textos da aplicação ainda é progressiva.
- O engine fiscal configurável ainda precisa de ser ligado e validado em todos os módulos fiscais por país.
- A gestão de instalações é telemetria de sessão; não prova instalação offline que nunca tenha iniciado sessão.
- A aplicação ainda precisa de testes E2E reais de login, criação de empresa, venda, stock, expiração, renovação, instalações e rotas antes de ser declarada pronta para produção.
