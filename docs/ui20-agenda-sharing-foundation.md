# Agenda — Fundação para permissões individuais

## Entregue neste lote
- Colunas `owner_user_id` (opcional) e `sharing_mode` (`private`, `team`, `tenant`, padrão `private`) no schema e migração 530.
- A migração não atribui proprietários e não libera calendários antigos automaticamente.
- Os campos são excluídos do create/update genérico para impedir que um usuário altere a titularidade/compartilhamento via endpoints atuais.

## NÃO concluído
- Não aplicar a migração em produção até homologação.
- Criar operação administrativa auditada para atribuir proprietário e conceder/revogar acesso.
- Definir tabela explícita de integrantes autorizados para o modo `team`; o enum **não** concede acesso sozinho.
- Verificação centralizada para leitura de agenda/slots, operações CRUD, Google Calendar e Scheduler.
- Os bloqueios provisórios do Google Meet para não administradores permanecem em vigor.
- Revisar consultas de Agenda existentes, testar Drizzle, SQL, frontend, API e isolamento multi-tenant.

**Apenas fundação de schema; sem nova autorização em funcionamento.**
