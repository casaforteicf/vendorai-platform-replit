# MKT-P2-ATTRIBUTION — Eventos de produção e atribuição por campanha (Fase 2)

Data: 2026-11-27
Branch: `feat/mkt-attribution` (base `main` @ da9289bc4)

## Entregue

### 1. Eventos de conclusão/falha no worker
- `piece.production_completed` quando o vídeo automático recebe o arquivo final
  (mesmo ponto que promove `processando → gerado`).
- `piece.production_failed` quando o job falha (com `reasonCode: video_failed`).
- Usa o emissor `marketing-funnel-events.ts` (mesmo formato do #3788).

### 2. Atribuição por campanha em Resultados
- `MarketingResultsSummary` passa a carregar o calendário e agrupar por campanha
  (nome derivado do pilar):
  - **publicados**, **na fila** e **última data** por campanha;
  - tabela “Publicações por campanha” (até 6 campanhas, ordenada por publicados);
  - fonte fora do ar não zera os demais indicadores (allSettled).

## Validação
- `node build.mjs` (API): **EXIT 0**.
- Frontend build: **EXIT 0** (bundle budget ok).
- Testes: vendor-brain **40/40**; funil **7/7**.
- Bundle contém “Publicações por campanha”.

## Limites
- Atribuição é **peça → campanha** (não ainda lead/negócio fechado por campanha).
- Depende do emissor do #3788 (mesmo arquivo, conteúdo idêntico).

## Próximos passos
- Atribuição campanha → negócio (CRM) quando houver vínculo por campanha.
- Painel “Diagnóstico do Marketing” com funil e tempos.
