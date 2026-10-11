# MULTI-04.8 — Proteção incremental de autosave por revisão

PR #3487 (draft).

## Criado
- O PATCH existente `/arch/concept-projects/:id` aceita cabeçalho opcional `If-Match` com a revisão `updatedAt`; faz comparação no WHERE do UPDATE e retorna HTTP 409 / `PROJECT_REVISION_CONFLICT` quando a revisão remota mudou.
- `artifacts/frontend/src/lib/arqdorRevisionAutosave.ts`: adaptador com revisão obrigatória. Retorna estados `saved`, `conflict`, `unauthorized`, sem retry automático.
- `artifacts/frontend/src/lib/arqdorRevisionAutosave.test.ts`: contrato para revisão enviada, bloqueio de conflito e rejeição sem revisão.

## Ainda bloqueado
- Autosave do editor legado não foi alterado: chamadas sem If-Match continuam aceitas, compatibilidade preservada, **portanto ainda podem sobrepor gravações recentes**. Não habilitar restauração enquanto esse fluxo não estiver totalmente versionado.
- O novo transporte não está conectado ao editor. Precisa capturar a revisão exata retornada pela API a cada salvamento e tratar 409 com aviso/recarga/mesclagem, mantendo edições locais.
- Auditoria transacional não foi homologada; testes SQL isolados e Vitest ainda não executados.
- A rota de restauração está desativada e não foi registrada.
- Validar preservação de `configuration` em alterações simultâneas: merges server-owned do código legado ocorrem antes do UPDATE e necessitam transação ou abordagem atômica.
- Confirmar precisão timestamps e compilação TypeScript no CI antes de qualquer merge ou deploy.
