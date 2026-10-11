# MULTI-04.5 — Integridade da idempotência

No fluxo de restauração revisada, a mesma chave de operação só pode ser reutilizada para exatamente o mesmo pedido, inclusive usuário, versão base e geometria. Alterar o conteúdo mantendo a mesma chave agora retorna conflito `RESTORE_OPERATION_REUSED` (HTTP 409), em vez de declarar uma restauração anterior como válida.

A tabela de auditoria preparada em `20261011_arch_concept_restore_audit.sql` ganhou `request_fingerprint`. Essa migração não foi executada. Como a tabela é nova e ainda não foi aplicada, a mudança foi realizada na própria migração pendente.

Esta verificação não substitui autorização nem CAS. Não registrar a rota enquanto não estiverem concluídos os testes de concorrência em PostgreSQL isolado, rollback de transação, autorização de usuário e validação do payload. A aplicação ainda precisa de confirmação final no editor e isolamento dos acessos convidados.

Status: commits no PR #3487 (draft), sem execução de testes, deploy, merge ou migração no banco oficial.
