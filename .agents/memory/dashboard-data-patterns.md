---
name: Dashboard data-fetch patterns
description: Two different ways Dashboard.tsx fetches server data — raw fetch vs generated hooks. Know which to extend.
---

`artifacts/frontend/src/pages/dashboard/Dashboard.tsx` mixes two data-fetch patterns:

1. **Main KPI payload** (`vendas`, `negociacao`, `pipeline`, `riscoPerda`, `ia`, `atividade`, `alertas`): fetched with a raw `fetch(`${getBase()}/api/dashboard`)` call on a manual `setInterval` (60s), hitting the `authenticate`-based `GET /dashboard` route (uses `req.user.tenantId`, not a path param). This predates the OpenAPI/Orval contract-first convention for this file.
2. **Newer sub-features** (e.g. "Agentes em Execução" table): use the contract-first flow — OpenAPI path `GET /tenants/:tenantId/dashboard/<feature>` → Orval-generated `useGet<Feature>` hook, called with `tenantId` from `useAuth()` and an explicit `queryKey: getGet<Feature>QueryKey(tenantId)` (required when passing custom `query` options like `refetchInterval`) plus `enabled: !!tenantId`.

**Why:** the raw-fetch section was never migrated to the generated-hooks pattern; don't assume the whole file follows one convention.
**How to apply:** when adding a new dashboard sub-table/widget, prefer pattern 2 (OpenAPI spec + codegen + generated hook with polling via `refetchInterval`) — it's the current project convention — rather than extending the legacy raw-fetch payload.
