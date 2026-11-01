# Gestão de utilizadores e permissões — Kanawa Soft

## Objetivo

Cada funcionário tem uma identidade própria no Supabase Auth. O administrador da empresa distribui permissões por funcionário, módulo e operação. Não são utilizadas contas partilhadas.

## Perfis

- **Administrador / Proprietário:** controlo total da empresa. É o único perfil que pode gerir utilizadores, convites e permissões.
- **Gerente:** acesso aos módulos e operações que o administrador selecionar.
- **Operador:** acesso operacional definido pelo administrador.
- **Caixa:** acesso ao PDV, vendas e outros módulos apenas quando autorizados.
- **Contabilista / Consulta:** perfis adicionais que também dependem das permissões atribuídas.

O convite não permite criar outro administrador. A promoção para administrador não está disponível no painel de equipa.

## Ativação de funcionário

1. O administrador abre Utilizadores e Permissões.
2. Cria um convite com nome, email, perfil e permissões.
3. O sistema gera uma chave aleatória de utilização única, válida durante 72 horas. Só o hash da chave fica guardado na base de dados.
4. O funcionário abre o domínio do Kanawa Soft, seleciona Ativar convite de funcionário e introduz o email convidado, a chave e uma palavra-passe própria.
5. O trigger do Supabase valida email, chave, validade e utilização anterior; depois associa a nova conta à empresa com o perfil e as permissões definidos.

O código de convite deve ser enviado por um canal privado. A palavra-passe é criada pelo próprio funcionário e nunca é guardada na tabela local de utilizadores.

## Permissões

As permissões são guardadas em public.ks_company_memberships.permissions, em formato JSON por módulo. As operações suportadas são:

- ver
- criar
- editar
- excluir
- exportar
- importar
- aprovar
- cancelar
- configurar

Os módulos administrativos usuarios, auditoria, config, modulos, licencas e integracoes ficam reservados ao administrador.

## Segurança no servidor

- A tabela de convites tem RLS; leitura e criação estão limitadas a proprietário/administrador.
- A alteração de associação e permissões é protegida por RLS e validação de JSON.
- O acesso a ks_records é filtrado por módulo e operação.
- Produtos, clientes, vendas, itens, pagamentos e movimentos de stock têm políticas próprias.
- A finalização de venda verifica a permissão de PDV/vendas e usa uma função privada para reduzir stock sem conceder ao caixa permissão geral para editar produtos.
- Funcionários suspensos deixam de ter associação ativa e não conseguem carregar contexto de empresa.
- A cache local é limpa ao trocar de utilizador no mesmo dispositivo e sincronizada de acordo com as permissões atuais.

## Limitações conhecidas desta etapa

- O código de convite é entregue manualmente; não há envio automático por email/SMS.
- O convite cria a associação quando o funcionário conclui o registo no Supabase Auth; não cria uma palavra-passe em nome dele.
- A atualização de permissões no dispositivo do funcionário é aplicada na próxima sincronização/renovação da sessão.
- O modo offline não consegue receber uma revogação enquanto o dispositivo estiver sem internet. As operações protegidas no servidor são sempre reavaliadas quando sincronizam.
- A lista de funcionários mostra membros já associados; uma área de gestão de convites pendentes/revogação será uma melhoria posterior.
