---
name: Per-tenant Asaas billing
description: Business model and fallback pattern for tenant-level Asaas configuration (vs global env key)
---

Each tenant has (or may not yet have) its own Asaas account/API key, stored encrypted in `tenants.asaasApiKey` (AES-256-GCM via `lib/crypto.ts`, same pattern as `openaiApiKeyEncrypted`). The platform-level `ASAAS_API_KEY` env var is a separate concern — it's only for platform-billed flows (tenant paying the SaaS itself), never for tenant-to-customer charges.

**Why:** the business model is "one Asaas account per tenant" for collecting from their own end customers. A tenant not having configured Asaas yet is a normal, expected state during onboarding — not a misconfiguration or error condition.

**How to apply:**
- `isAsaasConfigured(tenantId?)` is async. With a `tenantId`, it checks that tenant's own decrypted key; without one, it falls back to the global env key (platform-billed flows only).
- All Asaas request functions (`createCharge`, `createOrGetCustomer`, `createSubaccount`, `getPixQrCode`) accept an optional `apiKey` param — always pass the tenant's own decrypted key (via `getTenantAsaasApiKey(tenantId)`) for tenant-to-customer billing, never rely on the function silently falling back to the global env key in that context.
- When a tenant lacks a valid Asaas key at deal-won time, don't error out — set `deal.cobrancaTipo = "manual"`, create an `agent_task` (`actionType: "cobranca_manual"`, reuse `agentName: "closer"` since this isn't a conversational-agent toggle) visible to the finance function, and post a `notificationsTable` entry (`category: "billing"`). This mirrors the existing `aprovacao_fechamento` human-approval task pattern in `confirm_closure.ts`.
