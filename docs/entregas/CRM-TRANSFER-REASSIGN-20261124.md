# CRM-TRANSFER-REASSIGN-20261124 — 403 ao mover negócio de pipeline

Atualização: 2026-11-24. Branch: `fix/crm-admin-reassign`.
Base: `262ea9097` (`deploy-main` / produção).

## Diagnóstico

Sintoma: ao confirmar a movimentação de pipeline no Lead Workspace, o
usuário recebia `Erro ao avançar — Apenas o administrador pode reatribuir o
negócio.` (HTTP 403).

Origem exata: a mensagem só existe em `PATCH /deals/:id`, no guard de
reatribuição (`artifacts/api-server/src/routes/deals.ts`). O botão do rodapé
do diálogo continuava sendo `Confirmar e avançar` mesmo com o painel
`Mover para outra pipeline` aberto; ao clicar nele, o frontend chamava
`advance()` (PATCH), não `transferPipeline()`. O PATCH levava `handoff`
com um responsável diferente do dono atual e caía no guard.

Duas causas contribuíam:

1. **CTAs concorrentes no mesmo diálogo**: o painel de transferência tinha
   `Confirmar movimentação`, mas o rodapé fixo ainda executava o avanço
   normal. O usuário clicava no CTA principal do rodapé e o servidor
   interpretava como avanço com reatribuição.
2. **Definições divergentes de administrador**: o PATCH e o
   `transfer-pipeline` usavam apenas `platformRole` (`super_admin` /
   `tenant_admin`), enquanto o restante do CRM (`requireRole`,
   `isConfigurationAdmin`, carteira de leads) usa a regra compartilhada
   `seesWholeTenantWallet`, que também considera a função
   `"administrador"`. Um usuário com essa função era barrado na
   reatribuição mesmo enxergando e operando toda a carteira.
3. **Primeira atribuição tratada como reatribuição**: negócio sem
   responsável (`assignedTo = null`) não podia ser assumido pelo próprio
   usuário ao mover/avançar; o guard comparava `null` com o novo dono e
   devolvia 403.

Não houve consulta ao banco de produção; o diagnóstico é integralmente de
código e dos fluxos do Lead Workspace.

## Correção

- `artifacts/api-server/src/lib/crm-deal-permissions.ts` (novo):
  `canChangeDealOwner()` — fonte única da regra. Admin do CRM
  (`super_admin`, `tenant_admin` ou função `"administrador"`) reatribui;
  demais mantêm o dono atual ou assumem um negócio sem responsável.
- `artifacts/api-server/src/routes/deals.ts`:
  - PATCH de avanço e `transfer-pipeline` usam `seesWholeTenantWallet` e
    `canChangeDealOwner`;
  - a checagem de vendedor/entrega não bloqueia mais um negócio **sem**
    responsável (permite a primeira atribuição pelo próprio usuário).
- `artifacts/frontend/src/pages/LeadWorkspace.tsx`:
  - `canEditOwner` passa a incluir a função `"administrador"`;
  - com o painel de transferência aberto, o CTA do rodapé vira
    `Confirmar movimentação` e chama `transferPipeline()` (elimina o
    avanço acidental);
  - selects de responsável (avanço e transferência) só oferecem opções
    permitidas pelo backend; texto explica a regra para não-admin;
  - o responsável atual é preservado no avanço de não-admin, em vez de o
    formulário pré-selecionar outra pessoa e provocar 403.

## Evidência de execução

Ambiente: worktree isolado `.worktrees/crm-admin-reassign` sobre
`deploy-main`; dependências do checkout principal linkadas apenas para
execução local. Nenhum container, deploy ou produção foi tocado.

- `vitest run src/lib/crm-deal-permissions.test.ts` — 4/4 passaram.
- `vitest run src/__tests__/deal-transfer-reassignment.test.ts` — 4/4
  passaram (função administrador reatribui; vendedor assume negócio sem
  dono; vendedor não reatribui negócio já atribuído; vendedor não move
  negócio de outro).
- `vitest run src/lib/crm-visibility.test.ts src/routes/crm-visibility.contract.test.ts ...`
  — 13/13 passaram.
- `tsc -p tsconfig.launch-ci.json --noEmit` — exit 0.
- `node ./build.mjs` — exit 0.
- `vite build --config vite.config.ts` — exit 0 (frontend).
- `tsc -p artifacts/frontend/tsconfig.json --noEmit` — falha pré-existente
  em vários componentes (o projeto não usa esse gate); em
  `LeadWorkspace.tsx` permanecem apenas os 4 erros já presentes na base,
  nenhum introduzido por esta correção.

## Estado e limites

Implementado e validado tecnicamente. Homologação funcional com API/banco
e aprovação de release pendentes. **Sem merge, publicação ou alteração de
produção.** Próximo passo: revisão do PR, testes em homologação e
promoção conforme o processo de release.

Observação de produto: a regra continua impedindo que um vendedor troque
o responsável de um negócio já atribuído a outra pessoa (ação
administrativa). O que muda é que a função `"administrador"` passa a ser
reconhecida e que a primeira atribuição/assunção de negócio sem dono é
permitida.
