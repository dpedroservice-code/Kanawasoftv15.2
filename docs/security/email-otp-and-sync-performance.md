# Kanawa Soft — código OTP por e-mail e desempenho

## Autenticação de seis dígitos

O login normal da aplicação usa Supabase Auth por e-mail OTP. O utilizador introduz o e-mail e recebe um código de seis dígitos. O código é validado com `verifyOtp`; só depois é carregado o contexto da empresa e a associação ativa.

- `signInWithOtp({ email, options: { shouldCreateUser: false } })` impede a criação automática de utilizadores durante o login.
- `verifyOtp({ email, token, type: 'email' })` valida o código e cria a sessão.
- Depois da validação, o Kanawa verifica a associação ativa à empresa. Se não existir ou estiver suspensa, termina imediatamente a sessão.
- Convites e criação inicial de conta continuam a usar os fluxos próprios já existentes.
- A interface não revela se um endereço está registado: informa que, se existir uma conta ativa, será enviado um código.

## Configuração obrigatória no painel Supabase

1. Abrir **Authentication → Email Templates → Magic Link**.
2. Alterar o conteúdo para incluir `{{ .Token }}` (não usar apenas `{{ .ConfirmationURL }}`). Exemplo:

```html
<h2>Código de acesso — Kanawa Soft</h2>
<p>Introduza este código na tela de login:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Se não pediu este acesso, ignore esta mensagem.</p>
```

3. Em **Authentication → Providers → Email**, confirmar que o acesso por e-mail está ativo e configurar uma validade curta para OTP (recomendação: 10 minutos).
4. Configurar SMTP próprio para produção. O fornecedor de e-mail integrado do Supabase tem um limite baixo de envio; para acessos frequentes, usar SMTP de domínio/serviço transacional. O código é enviado para a caixa de e-mail do utilizador. Não é enviado através da conta Gmail pessoal dele.
5. Em **Authentication → Bot and Abuse Protection**, ativar CAPTCHA (Cloudflare Turnstile ou hCaptcha) e configurar as chaves do site/projeto antes de considerar a proteção anti-robô completa. O método de pedido já aceita um token CAPTCHA opcional, mas a chave/widget do site ainda precisa de ser configurada e ligada.

## Limites e segurança

- O login não cria utilizadores novos.
- O código é de utilização única e validado pelo Supabase.
- Supabase aplica limites de envio por endereço/IP; a interface não substitui esses limites.
- Nunca guardar o OTP, senha, refresh token ou chave secreta em IndexedDB/localStorage.
- As permissões de módulos continuam a ser aplicadas no PostgreSQL/RLS após o login.

## Otimização de leitura e sincronização

- Leituras repetidas do mesmo módulo reutilizam o IndexedDB durante 12 segundos, com invalidação depois de criar, editar, eliminar ou sincronizar dados.
- A sincronização normal descarrega apenas registos alterados desde o último cursor, com uma sobreposição de 60 segundos para evitar perder alterações com timestamps próximos.
- É feita uma reconciliação completa a cada 15 minutos para detetar também registos eliminados remotamente.
- O cursor é separado por empresa e utilizador para não reutilizar o progresso de sincronização de outra conta.
- O índice `ks_records(company_id, updated_at DESC)` acelera a consulta incremental.

## Testes pendentes antes da produção

- Configurar o template OTP e SMTP no painel Supabase.
- Configurar CAPTCHA e validar o envio/validação com contas reais.
- Testar e-mail inexistente, código incorreto, código expirado, conta suspensa e conta ativa.
- Testar dois utilizadores com permissões diferentes e confirmar que o RLS continua a bloquear módulos não autorizados.
- Confirmar que o deploy de produção corresponde ao commit aprovado.
