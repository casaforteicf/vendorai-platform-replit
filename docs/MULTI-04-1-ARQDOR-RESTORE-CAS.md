# MULTI-04.1 — Atualização condicional para recuperação do Arqdor

**Situação: primitiva backend criada, sem endpoint público e sem uso em produção.** PR #3487.

Arquivo: `artifacts/api-server/src/lib/arqdor-recovery-cas.ts`.

## Implementado
- Atualização SQL atômica que só grava geometria (`rooms` e `openingOverrides`) se **projeto, tenant, titular, status draft e revisão updatedAt** corresponderem simultaneamente.
- Se o registro mudou entre leitura e escrita, a operação falha como `conflict` sem sobrescrever projeto atual.
- Uma revisão updatedAt diferente é gerada após a gravação.
- Não altera `configuration` nem campos gerenciados por upload, compartilhamento ou aprovação; não altera o autosave tradicional.

## Bloqueios antes de ativar
- Guardar snapshot anterior de forma **durável**, com trilha de auditoria e idempotência antes de chamar a primitiva.
- Criar rota autenticada com validação Zod de cada payload (nunca gravar JSON arbitrário da importação), limite de tamanho e verificação de titularidade; manter isolamento do acesso público convidado.
- Revisar se updatedAt é monotônico em todos os salvamentos legados, incluindo precisão do PostgreSQL.
- Confirmar comportamento de alteração concorrente em duas sessões reais no PostgreSQL; não basta mock.
- Criar endpoint de leitura de revisão fresca, preferencialmente ETag/If-Match, e tratar HTTP 409 para conflito.
- Vincular editor autenticado ao painel e confirmar restauro em duas etapas; qualquer conflito exige revisão manual.
- Executar typecheck, testes de banco isolado e regressões antes de merge.

**Não houve SQL executado no banco oficial nem deploy.**
