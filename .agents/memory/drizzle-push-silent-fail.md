---
name: Drizzle push silent "No changes detected"
description: drizzle-kit push reports "No changes detected" even when new columns were added to the schema — apply via executeSql instead.
---

# Drizzle push silent failure

## Rule
`pnpm --filter @workspace/db run push` (and `push-force`) may silently report "No changes detected" even when columns were added to the TypeScript schema. Always verify with `executeSql` after push. If columns are missing, apply the migration directly with `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

**Why:** drizzle-kit may use a stale compiled snapshot of the schema (from `lib/db/dist/`) instead of re-parsing the TypeScript source. The `dist/` folder is not cleared between runs, so incremental changes are invisible to the bundler cache.

**How to apply:**
1. After editing `lib/db/src/schema/*.ts`, run `pnpm --filter @workspace/db run push`.
2. Immediately verify with `executeSql({ sqlQuery: "SELECT column_name FROM information_schema.columns WHERE table_name = '...'" })`.
3. If the new columns are missing, apply directly:
   ```sql
   ALTER TABLE <table>
     ADD COLUMN IF NOT EXISTS <col> <type>,
     ...;
   ```
4. This keeps Drizzle's TypeScript schema as the source of truth for type safety, while applying the actual SQL manually.
