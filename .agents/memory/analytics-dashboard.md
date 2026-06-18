---
name: Analytics Dashboard
description: Módulo de métricas de IA (performance de agentes, conversão por canal, customer intelligence)
---

## APIs
- `GET /tenants/:tenantId/analytics/agents` — agent performance, actions, tasks, messages, conversions
- `GET /tenants/:tenantId/analytics/channels` — leads/deals/messages by channel, response time
- `GET /tenants/:tenantId/analytics/intelligence` — churn, journey, behavior score, intent

## Frontend
- Rota `/analytics` (protegida)
- 3 tabs: Agentes, Canais, Inteligência
- Usa Recharts (BarChart, PieChart) + React Query hooks auto-gerados

## Decisions
- Analytics rotas usam `count(*) filter` para evitar múltiplos JOINs
- Todos os endpoints scopam por tenantId com `canAccess()` guard
- Período fixo: últimos 30 dias (pode ser parametrizado futuramente)

**Why:** customer_intelligence e agent_actions_log já existiam mas não tinham dashboard consolidado.
**How to apply:** Adicionar novas queries no analytics.ts, registrar no router, adicionar schemas no OpenAPI, regenerar codegen.
