---
name: OpenAPI enums must mirror DB pgEnum value lists
description: Adding a new value to a Drizzle pgEnum (e.g. deal_etapa) also requires adding it to the matching OpenAPI enum schema, or generated frontend types reject it.
---

When a Drizzle `pgEnum` column (e.g. `dealEtapaEnum` / `deal_etapa`) gets a new value, the corresponding OpenAPI schema enum (e.g. `DealEtapa`) is a **separate, hand-maintained list** — it does not derive from the DB schema. If only the DB enum is updated, `pnpm --filter @workspace/frontend run typecheck` fails with TS2322/TS2353 wherever the new value is used, because the Orval-generated TS union type still lacks it.

**Why:** the two are independently authored (Drizzle schema in `lib/db`, OpenAPI spec in `lib/api-spec/openapi.yaml`) with no shared source of truth or lint check connecting them.

**How to apply:** whenever adding a new enum value to a DB column that's also exposed via the API (kanban stage enums, status enums, etc.), update both:
1. The Drizzle `pgEnum(...)` array in `lib/db/src/schema/*.ts`.
2. The matching `enum: [...]` list in `lib/api-spec/openapi.yaml`.

Then re-run `pnpm --filter @workspace/api-spec run codegen` before typechecking the frontend. For live DBs (not fresh `push`), extend the enum with `ALTER TYPE <enum_name> ADD VALUE IF NOT EXISTS '<value>'` in a startup-migration `try` block (same pattern as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
