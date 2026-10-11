# MULTI-04.10 — Fila de autosave e bloqueio persistente de conflitos

PR #3487, código em branch, flag `VITE_MULTI04_REVISION_AUTOSAVE` desligada por padrão.

Mudanças em `ConceptPlanner.tsx`:
- Salva alterações na ordem de uma fila de Promises quando o modo condicional estiver habilitado.
- Recupera a revisão `updatedAt` da resposta antes da próxima gravação e envia `If-Match`.
- Uma resposta HTTP 409 bloqueia novos envios da fila, inclusive os que já aguardavam; a revisão deve ser reaberta pelo usuário antes de continuar.
- Não ativa o fluxo para acessos públicos `guestMode` nem altera o autosave legado enquanto a flag estiver desligada.

Ainda necessário antes da ativação: testar editor real com alterações concorrentes, criação simultânea, navegação/recarregamento, falha/retry, atualização de campos via outros endpoints, preservação do estado local e controle de permissões. Em especial, a proteção é opcional no backend e outros writers ainda não participam integralmente do contrato de revisão. Testes CI/typecheck não foram executados. Não há merge ou deploy.
