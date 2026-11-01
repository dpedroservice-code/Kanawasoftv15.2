# Convites de utilizadores — Kanawa Soft

- A criação de membros usa a Supabase Edge Function ks-invite-member.
- A função exige JWT válido, confirma que o chamador é proprietário ou administrador activo da empresa e só aceita os perfis manager, operator, cashier, accountant e viewer.
- A chave service-role é usada apenas no ambiente Edge Function; nunca é enviada ao navegador.
- A associação é criada com estado invited. Um trigger activa o membro apenas quando o utilizador confirma o email de convite.
- O fluxo actual envia convites apenas para endereços que ainda não tenham conta Supabase. Convites para contas já existentes, revogação de convites e suspensão de membros continuam pendentes.
- O URL de confirmação está definido para https://kanawasoft.shop. Se o domínio mudar, actualizar SITE_URL e as Redirect URLs permitidas na configuração Auth do Supabase.
