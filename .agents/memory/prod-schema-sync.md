---
name: Deterministic prod schema sync + post-migration connection lag
description: How to recover from schema drift between Drizzle code and the production Supabase DB, and why prod keeps erroring briefly after the fix.
---

# Production schema drift recovery

## Rule
When production throws `column/relation "x" does not exist` (schema drift between the Drizzle schema and the live Supabase DB), do NOT rely on `drizzle-kit push` (it silent-fails — see drizzle-push-silent-fail.md). Instead generate idempotent DDL deterministically:

1. Import `* as schema` from `lib/db/src/schema/index.ts` and enumerate every table with Drizzle's `getTableConfig`.
2. Diff each table/column against the live DB's `information_schema` (tables + columns) and each enum against `pg_type`.
3. Emit idempotent DDL only for what's missing: `DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object THEN null; END $$;` for enums, `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
4. Run dry-run first, then `--apply`.

**Why:** push is unreliable here and a hand-written ALTER list misses tables/enums. Enumerating the schema object catches everything in one pass and is safe to re-run.

**How to apply (connection):**
- Run as a `.cjs`/`.mts` script via `node` in bash (NOT code_execution — that sandbox hits Replit's internal Postgres, not Supabase, and lacks `process.env`).
- Use `pg` with `SUPABASE_DATABASE_URL` and `ssl:{rejectUnauthorized:false}`. The pooler host is `aws-1-sa-east-1.pooler.supabase.com:6543` (transaction pooler).
- `defaultClause` must branch on `col.getSQLType()`: uuid → `gen_random_uuid()`, timestamp → `now()`. A blanket `now()` default breaks uuid PKs.
- Dev and prod share the SAME Supabase DB, so applying once fixes both. Confirm with an `information_schema` query before considering it done.

## Post-migration connection lag (do not panic)
After the DDL is applied and verified at the DB level, the long-running PRODUCTION deployment process keeps logging `column does not exist` for a few minutes (observed ~3–4 min, including scheduler/churn-check jobs). The errors stop on their own once the pooled connections to the Supabase transaction pooler recycle and re-parse against the new schema. No redeploy is strictly required — verify the errors have ceased by fetching deployment logs with an `after_timestamp` a few minutes later. If you need it cleared immediately, republish/restart the deployment to drop stale connections.
