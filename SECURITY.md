# Segurança — Kanawa Soft ERP 15.2

- Nunca versionar `.env`, credenciais, chaves privadas ou tokens.
- Em produção, `JWT_SECRET` deve ser definido no ambiente de execução e não no repositório.
- `CORS_ORIGINS` deve conter apenas origens autorizadas.
- A API exige `Authorization: Bearer <token>` nas rotas protegidas.
- Segredos anteriormente expostos devem ser rotacionados.
