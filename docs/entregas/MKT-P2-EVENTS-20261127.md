# MKT-P2-EVENTS — Eventos de funil e restauração dos endpoints (Fase 2)

Data: 2026-11-27
Branch: `feat/mkt-funnel-events` (base `main` @ 50a53e9d7)

## Achado
O merge do #3779 levou **somente o contrato** (1 commit). Os endpoints
`GET /marketing/pieces` e `POST /marketing/pieces/:id/transition` **não estavam na main**.
Este PR os **restaura** (cherry-pick do commit `7baf850cf`) junto com os eventos.

## Entregue

### 1. Endpoints restaurados
- `GET /api/tenants/:tenantId/marketing/pieces`
- `POST /api/tenants/:tenantId/marketing/pieces/:id/transition` (`approve|reject|release`)
  com validação de transição, mídia (`MEDIA_NOT_READY`) e permissão.

### 2. Eventos de funil (log estruturado, formato estável)
`services/marketing-funnel-events.ts` → `emitMarketingFunnelEvent`:

| Evento | Onde |
|---|---|
| `piece.released` / `piece.approved` / `piece.rejected` | endpoint de transição |
| `piece.production_requested` | claim (`iniciar-producao`) |
| `publication.published` | dispatcher, após provedor |
| `publication.failed` | dispatcher, com `reasonCode` |

Payload: `tenantId`, `pieceId`, `publicationId`, `tipo`, `canal`, `provider`, `media`,
`reasonCode`, `ts` e `event` (prefixo `marketing.`).

### 3. Por que log e não tabela
Sem migração nova nesta etapa (migrations do ALINHA-01 ainda pendentes de aplicação).
O formato estável permite ligar um painel/ETL depois sem mudar os emissores.

## Validação
- `node build.mjs` (API): **EXIT 0**.
- Sem mudança de schema/migração.

## Próximos passos
- `piece.production_completed` / `production_failed` no worker de produção.
- Painel “Diagnóstico do Marketing” (funil, tempos, top motivos).
- Atribuição em Resultados.
