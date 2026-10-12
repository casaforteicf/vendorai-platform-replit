# MULTI-04.18 — Gate de revisão obrigatório no backend

A rota PATCH de pré-projetos agora rejeita chamadas sem If-Match (HTTP 428 PROJECT_REVISION_REQUIRED) **quando ARQDOR_RESTORE_ENABLED=true**. Com a flag desligada, o fluxo legado mantém seu comportamento atual.

Essa mudança é um gate de proteção e não constitui habilitação da restauração. **Não ativar a flag** até que todos os escritores de projeto estejam auditados: importações, render, compartilhamento e salvamento automático legado podem fazer chamadas sem revisão. Habilitar prematuramente causará incompatibilidade.

Pendências: integração de todas as rotas de escrita com CAS, testes de precisão de timestamp PostgreSQL, fluxo de conflito e backup no editor, revisão de autorização, testes de CI e banco isolado. Sem merge nem deploy.
