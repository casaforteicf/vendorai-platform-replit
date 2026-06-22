---
name: Prospector feature & pgvector
description: How the Prospector endpoints/tables were built, pgvector enablement, and the safe migration path used.
---

# Prospector + pgvector

- **pgvector is now enabled in Supabase** (`CREATE EXTENSION IF NOT EXISTS vector`). Drizzle 0.45 exposes `vector("col", { dimensions: 1536 })` from `drizzle-orm/pg-core`; `typecheck:libs` covers it and drizzle-zod handles the column. No need to re-enable the extension.

- **Migration path for new tables = surgical raw DDL via `pg` against `SUPABASE_DATABASE_URL`**, NOT `drizzle-kit push`.
  **Why:** a full push prompts to *truncate `tenant_domains`* (unique-constraint drift) — running push (even `--force`) risks wiping that table's data. Apply only the new tables' `CREATE TABLE IF NOT EXISTS` directly. Run the script from inside `lib/db/` so Node ESM resolves the `pg` package.

- **Prospector endpoints route through the existing aiGateway only** (`callOpenAI` from `lib/ai-gateway.js`), never the OpenAI SDK directly. A 402 "AI quota exhausted ($0 plan)" from these endpoints is the gateway enforcing the tenant's budget — not a bug. enrich degrades gracefully (saves Google Places data, leaves AI-derived arrays empty) when the gateway rejects; generate-message hard-fails 402.

- **Google Places uses the *New* Places API** (`POST https://places.googleapis.com/v1/places:searchText`, header `X-Goog-Api-Key` + `X-Goog-FieldMask`) with secret `GOOGLE_PLACES_API_KEY`. The OAuth `GOOGLE_CLIENT_ID/SECRET` do NOT work for Places — a separate API key is required.

- **Multi-tenant rule for optional `leadId` inputs:** any endpoint that accepts a `leadId` and writes it must verify the lead belongs to the resolved tenant before persisting, else cross-tenant linkage is possible. Pattern: `select` lead `where id = leadId AND tenant_id = tenantId`; 404 if absent.
