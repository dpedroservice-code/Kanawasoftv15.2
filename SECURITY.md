# Segurança — Kanawa Soft ERP 15.2

## Regras de configuração

- Nunca versionar `.env`, credenciais, chaves privadas ou tokens.
- Em produção, `JWT_SECRET` deve ser definido no ambiente de execução e não no repositório.
- `CORS_ORIGINS` deve conter apenas origens autorizadas.
- A API exige `Authorization: Bearer <token>` nas rotas protegidas.
- O segredo JWT deve ser rotacionado sempre que tiver sido exposto.

## Nota sobre histórico

A remoção de um `.env` do branch actual não elimina um segredo que já tenha sido publicado no histórico Git. O segredo anteriormente exposto deve ser substituído/rotacionado no ambiente de produção.
