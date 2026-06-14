---
name: ERP Integration (webhook + inventory sync)
description: Outbound webhook on sale won + inbound inventory sync API with per-tenant API key
---

## How it works

**Outbound webhook:**
- Triggers on `propostas.status → "aceita"` and `deals.etapa → "ganho"`
- Fire-and-forget via `services/erp-webhook.ts → dispatchVendaWebhook()`
- Webhook URL stored in `tenantsTable.webhookEstoqueUrl`

**Inbound inventory sync:**
- `POST /tenants/:tenantId/inventory/sync`
- Accepts `x-api-key` header (tenant `apiKeyEstoque`) OR Bearer JWT
- Registered on `inventorySyncRouter` BEFORE the `authenticate` middleware in routes/index.ts
- Matches by `produtosCatalogoTable.sku` (added `sku` column to produtos_catalogo schema)

**Tenant settings:**
- `GET/PATCH /tenants/:id/integration-settings`
- `POST /tenants/:id/integration-settings/regenerate-key` — generates `vak_<32hex>` key

**Why inventorySyncRouter is separate:**
The main `authenticate` middleware rejects requests without JWT. The sync endpoint needs to accept API-key-only requests, so it must be registered before authenticate.

**DB columns added (run push):**
- `tenants.webhook_estoque_url` (text, nullable)
- `tenants.api_key_estoque` (text, nullable)
- `produtos_catalogo.sku` (text, nullable)

**Frontend:** "Integrações" tab in Configuracoes.tsx (5th tab, grid-cols-5)
