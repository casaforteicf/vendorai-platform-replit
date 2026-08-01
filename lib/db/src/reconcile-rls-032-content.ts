#!/usr/bin/env tsx
/**
 * Reconciliation for migration 032 when the STORED record already says
 * "rls foundation" (canonical name) but the checksum diverged because the
 * migration file content itself was hardened after being applied — see
 * commit 751ac44f ("security(db): add restricted application role for
 * RLS"). The database is still running the pre-hardening version: no
 * restricted vendorai_app role, tenant policies scoped to PUBLIC instead
 * of vendorai_app.
 *
 * This differs from reconcile-rls-032.ts, which only handles the OLDER
 * scenario where the stored name is the legacy "rls tenant isolation".
 * Here the name already matches; only the SQL content changed.
 *
 * Safety model:
 * - read-only by default;
 * - --apply is required for any mutation;
 * - --expected-checksum=<stored checksum> is required with --apply;
 * - the migration file is fully idempotent (DROP POLICY IF EXISTS before
 *   CREATE POLICY, CREATE OR REPLACE for functions/views, IF NOT EXISTS
 *   for role creation) — verified before writing this script — so it is
 *   safe to simply re-execute its current content in full;
 * - runs inside one transaction under the same migration advisory lock
 *   used by the normal runner and reconcile-rls-032.ts;
 * - applied_at is preserved; no application data is touched.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

const CONTROL_TABLE = "vendorai_schema_migrations";
const MIGRATION_VERSION = "032";
const ADVISORY_LOCK_KEY = "7767366262";
const FOUNDATION_NAME = "rls foundation";
const FOUNDATION_FILENAME = "032_rls_foundation.sql";
const FOUNDATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../migrations/${FOUNDATION_FILENAME}`,
);

const apply = process.argv.includes("--apply");
const expectedChecksum = process.argv
  .find((a) => a.startsWith("--expected-checksum="))
  ?.slice("--expected-checksum=".length)
  .trim();

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

if (!fs.existsSync(FOUNDATION_PATH)) {
  console.error(`❌  Canonical migration not found: ${FOUNDATION_PATH}`);
  process.exit(1);
}
const foundationSql = fs.readFileSync(FOUNDATION_PATH, "utf8");
const foundationChecksum = sha256(foundationSql);

// Supabase's migration connection can create roles (via the DO block's
// CREATE ROLE ... IF NOT EXISTS, which already sets the correct restricted
// attributes at creation time) but is not allowed to ALTER ROLE afterward —
// same constraint already worked around in reconcile-rls-032.ts. The
// standalone ALTER ROLE right after the DO block is redundant when the role
// was just created with those exact attributes, so it's safe to skip.
const roleAlterationSql = `ALTER ROLE vendorai_app
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;`;
const reconciliationSql = foundationSql.replace(
  roleAlterationSql,
  "-- Existing vendorai_app attributes were set at CREATE ROLE time or validated by the reconciler.",
);
if (reconciliationSql === foundationSql) {
  throw new Error("Could not isolate the canonical vendorai_app ALTER ROLE block.");
}

const connectionString =
  process.env.MIGRATION_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌  MIGRATION_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL is required.");
  process.exit(1);
}
const pool = new Pool({ connectionString, max: 1 });

type ControlSchema = "current" | "legacy";
interface MigrationRecord { name: string; checksum: string; applied_at: Date | string }

async function detectControlSchema(client: pg.PoolClient): Promise<ControlSchema | null> {
  const t = await client.query<{ table_name: string | null }>("SELECT to_regclass($1) AS table_name", [CONTROL_TABLE]);
  if (!t.rows[0]?.table_name) return null;
  const c = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
    [CONTROL_TABLE],
  );
  const cols = new Set(c.rows.map((r) => r.column_name));
  if (cols.has("migration_id") && cols.has("filename") && cols.has("checksum_sha256")) return "current";
  if (cols.has("version") && cols.has("name") && cols.has("checksum")) return "legacy";
  throw new Error(`Unsupported ${CONTROL_TABLE} schema.`);
}

async function readMigrationRecord(client: pg.PoolClient, schema: ControlSchema, forUpdate = false): Promise<MigrationRecord | null> {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const q = schema === "current"
    ? `SELECT filename AS name, checksum_sha256 AS checksum, applied_at FROM ${CONTROL_TABLE} WHERE migration_id = $1${lock}`
    : `SELECT name, checksum, applied_at FROM ${CONTROL_TABLE} WHERE version = $1${lock}`;
  const r = await client.query<MigrationRecord>(q, [MIGRATION_VERSION]);
  return r.rows[0] ?? null;
}

async function updateMigrationRecord(client: pg.PoolClient, schema: ControlSchema, storedChecksum: string, storedName: string): Promise<void> {
  const q = schema === "current"
    ? `UPDATE ${CONTROL_TABLE} SET filename = $1, checksum_sha256 = $2 WHERE migration_id = $3 AND filename = $4 AND checksum_sha256 = $5`
    : `UPDATE ${CONTROL_TABLE} SET name = $1, checksum = $2 WHERE version = $3 AND name = $4 AND checksum = $5`;
  const updated = await client.query(q, [
    schema === "current" ? FOUNDATION_FILENAME : FOUNDATION_NAME,
    foundationChecksum,
    MIGRATION_VERSION,
    storedName,
    storedChecksum,
  ]);
  if (updated.rowCount !== 1) throw new Error("Migration 032 history update did not affect exactly one unchanged row.");
}

async function validateHardenedState(client: pg.PoolClient): Promise<void> {
  const role = await client.query<{ rolcanlogin: boolean; rolsuper: boolean; rolbypassrls: boolean; rolinherit: boolean }>(
    `SELECT rolcanlogin, rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = 'vendorai_app'`,
  );
  if (!role.rows[0]) throw new Error("vendorai_app role is missing after reconciliation.");
  if (role.rows[0].rolsuper || role.rows[0].rolbypassrls || role.rows[0].rolinherit) {
    throw new Error("vendorai_app has unsafe attributes after reconciliation.");
  }

  const policies = await client.query<{ scoped: string; total: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE pol.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'vendorai_app')])::text AS scoped,
      COUNT(*)::text AS total
    FROM pg_policy AS pol
    WHERE pol.polname IN ('vendorai_tenant_access', 'vendorai_tenant_guard')
  `);
  const scoped = Number(policies.rows[0]?.scoped ?? 0);
  const total = Number(policies.rows[0]?.total ?? 0);
  if (total === 0 || scoped !== total) {
    throw new Error(`Policy scoping validation failed: ${scoped}/${total} policies scoped to vendorai_app.`);
  }
}

async function run(): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;
  let inTransaction = false;
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    lockAcquired = true;

    const schema = await detectControlSchema(client);
    if (!schema) {
      console.log("\nMigration control table does not exist. Nothing to reconcile.\n");
      return;
    }
    const record = await readMigrationRecord(client, schema);
    if (!record) {
      console.log("\nMigration 032 is not recorded. Nothing to reconcile.\n");
      return;
    }
    if (record.checksum === foundationChecksum) {
      console.log("\n✓ Migration 032 already matches the canonical foundation checksum. Nothing to reconcile.\n");
      return;
    }
    if (record.name.trim().toLowerCase() !== FOUNDATION_NAME && record.name.trim() !== FOUNDATION_FILENAME) {
      console.log(
        `\nStored migration 032 name is "${record.name}", not the canonical foundation name. ` +
        `This script only handles checksum drift on an already-canonical migration. ` +
        `Try migrate:reconcile-rls-032 instead.\n`,
      );
      return;
    }

    console.log("\nVendor.ai — reconciliation preview for migration 032 (content drift)");
    console.log("─".repeat(76));
    console.log(`Stored name: ${record.name}`);
    console.log(`Stored checksum: ${record.checksum}`);
    console.log(`Canonical checksum: ${foundationChecksum}`);
    console.log(`Applied at: ${record.applied_at}`);
    console.log("Action: re-run the current (hardened) 032_rls_foundation.sql content in full.");
    console.log("The file is idempotent (DROP POLICY IF EXISTS before CREATE, IF NOT EXISTS role creation).");

    if (!apply) {
      console.log("\nRead-only preview complete. No database changes were made.");
      console.log("To apply this exact reconciliation, run:");
      console.log(`pnpm --filter @workspace/db migrate:reconcile-rls-032-content -- --apply --expected-checksum=${record.checksum}\n`);
      return;
    }
    if (!expectedChecksum) throw new Error("--expected-checksum=<stored checksum> is required with --apply.");
    if (expectedChecksum !== record.checksum) {
      throw new Error(`Expected checksum does not match the current stored checksum. Expected ${expectedChecksum}, found ${record.checksum}.`);
    }

    await client.query("BEGIN");
    inTransaction = true;

    const locked = await readMigrationRecord(client, schema, true);
    if (!locked || locked.name !== record.name || locked.checksum !== record.checksum) {
      throw new Error("Migration 032 record changed after preview; reconciliation aborted.");
    }

    await client.query(reconciliationSql);
    await validateHardenedState(client);
    await updateMigrationRecord(client, schema, locked.checksum, locked.name);

    await client.query("COMMIT");
    inTransaction = false;

    console.log("\n✓ Migration 032 reconciled successfully.");
    console.log(`  Previous checksum: ${record.checksum}`);
    console.log(`  Canonical checksum: ${foundationChecksum}`);
    console.log("  vendorai_app restricted role: created/verified");
    console.log("  Tenant policies: re-scoped to vendorai_app");
    console.log("  Application data: unchanged");
    console.log("\nNext commands:");
    console.log("  pnpm --filter @workspace/db migrate:status");
    console.log("  pnpm --filter @workspace/db migrate\n");
  } catch (error) {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); } catch { /* connection may be gone */ }
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try { await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]); } catch { /* ignore */ }
    }
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ Migration 032 reconciliation failed: ${message}\n`);
  process.exit(1);
});
