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

## Evolução (mesma branch)
- **Tempo médio até publicar** (criação → publicação) calculado no painel.
- **Top motivos de falha** agregados (motivo do automation ou “mídia final não gerada”).
- `GET /marketing/pieces` passou a devolver `createdAt`, `publishedAt` e `failureReason`.
- **Atribuição campanha → negócio**: já existe na main (`MarketingAttributionPanel` +
  `GET /marketing/attribution` em `media_plan.ts`, com leads/ganhos/ROAS por campanha do plano).
  Este PR **não duplica** a rota nem o painel; apenas consome o que já existe.

## Observação de merge
O PR original (#3792) foi mergeado na branch-base `feat/mkt-funnel-events`, que já havia sido
mergeada — o conteúdo não chegou à main. Este PR reaplica o painel sobre a main atual.
