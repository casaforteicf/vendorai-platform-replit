# MKT-P2-REVIEW-ROUTE — Revisão por peça em rota própria (Fase 2)

Data: 2026-11-27
Branch: `feat/mkt-review-route` (base `main` @ e47d7ba7e)

## Objetivo
Tirar a revisão do material de dentro do Estúdio de Vídeo (mesma URL) e dar a cada peça
um endereço próprio, preservando o contexto ao atualizar/voltar.

## Entregue
- **Rota `/marketing/revisao/:id`** (protegida) com `pages/marketing/ReviewPage.tsx`:
  - resolve o tenant, carrega peça (`content-calendar`), plano (`media-plan`) e mídias
    (`media/assets`), monta o contexto e renderiza `MediaPlanReviewWorkspace`;
  - atualizar a página mantém a peça (não cai no Estúdio);
  - estados de carregamento, peça inexistente e erro com CTA de volta à fila.
- **Fila**: botão **“Revisar material”** em peças de vídeo em revisão, abrindo a nova rota.
- `AppLegacy`: rota registrada com `ProtectedRoute`.

## Validação
- Frontend build: **EXIT 0** (bundle budget ok).
- Testes: vendor-brain **40/40**; funil **7/7**.
- Bundle contém `marketing/revisao` e “Revisar material”.
- `tsc` do frontend: bloqueado por pendências **pré-existentes** (libs sem `tsc --build`
  por erro em `arqdor-concept-adapter.test.ts`; `TS7006` em `AppLegacy`), sem erro novo
  em `ReviewPage`.

## Próximos passos
- Produtor único (UI apenas pede produção).
- Deep link do Estúdio para a revisão quando houver peça selecionada.
- Resultados com atribuição.
