# MKT-P2-DIAGNOSTICS — Painel de diagnóstico do funil (Fase 2)

Data: 2026-11-27
Branch: `feat/mkt-diagnostics-panel` (base: `feat/mkt-funnel-events` / PR #3788)

## Objetivo
Transformar os estados e eventos do funil em leitura operacional: onde as peças estão
paradas, quantas falharam e quantas aguardam mídia.

## Entregue
- Novo `MarketingDiagnosticsPanel` na aba **Resultados**:
  - funil com 7 etapas (Planejado → Publicado), contagem e barra de proporção;
  - contadores de **falhas** e **aguardando mídia**;
  - lista das 5 peças com falha (tema, tipo, canal, estado e mídia);
  - atualização manual (`Atualizar`) e estados de carregamento/erro.
- Consome `GET /api/tenants/:tenantId/marketing/pieces` (restaurado no #3788).

## Dependência
Este PR é **stacked** no #3788 (endpoints + eventos). Mergear o #3788 primeiro;
o base deste PR é `feat/mkt-funnel-events`.

## Validação
- Frontend build: **EXIT 0** (bundle budget ok).
- “Diagnóstico do Marketing” presente no chunk `ContentHub`.

## Próximos passos
- Tempo médio por etapa (usa timestamps do calendário/projeto).
- Top motivos de falha agregados por `reasonCode`.
