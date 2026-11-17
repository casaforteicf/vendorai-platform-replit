# Registro Mestre — CRM-TRANSFER-JUSTIFICATIVA (issue #3731)

**Data de atualização:** 2026-11-17
**Branch:** `agent/move-lead-justification-a871f05ef25a`
**Issue:** https://github.com/casaforteicf/vendorai-platform-replit/issues/3731
**PR:** preenchido na abertura do PR

## Objetivo e escopo

O operador pediu que a justificativa da movimentação deixasse de ser obrigatória ao mover um lead para outra pipeline, tanto no frontend (validação de campo) quanto no backend (checagem da rota de mover pipeline), para permitir mover o lead sem preencher o campo.

Escopo autorizado: remover a obrigatoriedade da justificativa na movimentação de lead entre pipelines, mantendo o registro no histórico quando o campo for informado.

## Alterações

- `artifacts/api-server/src/routes/deals.ts`
  - `transferDealPipelineSchema`: `justificativa` passa de `min(5)` obrigatório para `max(2000)` opcional.
  - A rota normaliza a justificativa ausente/vazia para `null` e mantém o histórico: metadata dos cards, descrição do card de destino e jornada do negócio.
  - Sem justificativa, a jornada registra "Movimentação registrada sem justificativa." e o card de destino preserva a descrição existente, em vez de gravar texto vazio.
- `artifacts/frontend/src/pages/LeadWorkspace.tsx`
  - Remove a exigência de justificativa do guard e do `disabled` do botão "Confirmar movimentação".
  - Rótulo e texto auxiliar indicam que o campo é opcional; o toast de sucesso só cita justificativa quando ela foi informada.
- `artifacts/frontend/src/pages/Deals.tsx`
  - Mesma remoção de obrigatoriedade no diálogo "Mover para outra pipeline" do negócio.
- `artifacts/api-server/src/__tests__/transfer-pipeline-optional-justification.test.ts`
  - Teste de rota cobrindo movimentação sem justificativa, com justificativa vazia e com justificativa informada.

## Validação

| Verificação | Resultado |
|---|---|
| `vitest run src/__tests__/transfer-pipeline-optional-justification.test.ts` | 3 testes aprovados |
| `tsc -p tsconfig.launch-ci.json --noEmit` (api-server) | EXIT 0 |
| `node ./build.mjs` (api-server) | EXIT 0 |
| `vite build` (frontend, gate do deploy) | EXIT 0 |
| Captura visual da tela (antes/depois) | Aprovada, mesma pipeline/etapa, viewport 1440x1000, tema claro, justificativa vazia |

O `tsc` do frontend ainda reporta erros preexistentes em linhas não alteradas por esta entrega (por exemplo, estados de budget ausentes em `Deals.tsx` e páginas sem `toast` importado). Nenhum erro novo aparece nas linhas modificadas; o `vite build` do frontend, usado pelo deploy, passou.

Captura feita com a aplicação local (Vite dev) consumindo a API em modo somente leitura, sem executar a movimentação. O nome do responsável foi mascarado nas imagens por se tratar de repositório público.

## Evidência visual

- Antes (base `main` @ `cd63f0955`): campo "Justificativa da movimentação *" e botão "Confirmar movimentação" desabilitado com o campo vazio.
  `docs/entregas/assets/crm-transfer-justificativa/antes-justificativa-obrigatoria.png`
- Depois (branch): campo "Justificativa da movimentação (opcional)" e botão habilitado com o campo vazio.
  `docs/entregas/assets/crm-transfer-justificativa/depois-justificativa-opcional.png`

## Estágios

| Estágio | Situação |
|---|---|
| Implementado no GitHub | Sim, commit `aee898363` |
| Validado tecnicamente (testes, tsc e build do api-server) | Sim |
| Homologado | Pendente de revisão/merge e do fluxo de homologação aprovado |
| Aprovado / publicado | Pendente |

## Pendências

- Revisão humana e merge do PR; homologação e publicação seguem o processo aprovado após o merge.
