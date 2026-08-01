#!/usr/bin/env tsx
/**
 * Generic reconciliation for "content drift" migrations — cases where a
 * migration was applied to the database, then its .sql file was edited
 * afterward (bug fix, security hardening, etc.), so the stored checksum no
 * longer matches. The normal runner correctly refuses to proceed past this
 * (see migrate.ts) until it's reconciled.
 *
 * Usage:
 *   pnpm --filter @workspace/db migrate:reconcile-content -- --version=034
 *   pnpm --filter @workspace/db migrate:reconcile-content -- --version=034 --apply --expected-checksum=<stored>
 *
 * Safety model (same as reconcile-rls-032.ts / reconcile-rls-032-content.ts):
 * - read-only by default;
 * - --apply requires --expected-checksum=<the exact stored checksum from
 *   the preview run>, so a stale/wrong reconciliation can't silently apply;
 * - re-executes the CURRENT file content in full, inside one transaction
 *   under the shared migration advisory lock — only safe because these
 *   migrations are written idempotently (CREATE TABLE/INDEX IF NOT EXISTS,
 *   DROP POLICY IF EXISTS before CREATE POLICY, etc.) — verify that before
 *   using this for a given migration;
 * - any standalone `ALTER ROLE ...;` statement is stripped before running,
 *   because Supabase's migration connection can create roles but is not
 *   allowed to alter their attributes afterward (same constraint already
 *   hit and worked around for migration 032);
 * - applied_at is preserved; no application data is touched.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

const CONTROL_TABLE = "vendorai_schema_migrations";
const ADVISORY_LOCK_KEY = "7767366262";
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

const apply = process.argv.includes("--apply");
const version = process.argv.find((a) => a.startsWith("--version="))?.slice("--version=".length).trim();
const expectedChecksum = process.argv.find((a) => a.startsWith("--expected-checksum="))?.slice("--expected-checksum=".length).trim();

if (!version || !/^\d+$/.test(version)) {
  console.error("❌  --version=<migration number, e.g. 034> is required.");
  process.exit(1);
}

const paddedVersion = version.padStart(3, "0");
const matchingFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.startsWith(`${paddedVersion}_`) && f.endsWith(".sql"));
if (matchingFiles.length !== 1) {
  console.error(`❌  Expected exactly one migration file starting with "${paddedVersion}_", found ${matchingFiles.length}.`);
  process.exit(1);
}
const filename = matchingFiles[0]!;
const filePath = path.join(MIGRATIONS_DIR, filename);

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

const fileSql = fs.readFileSync(filePath, "utf8");
const fileChecksum = sha256(fileSql);

// Supabase's migration role can create roles but not alter them afterward.
const alterRoleRegex = /^ALTER ROLE[^;]*;\s*$/gim;
const executableSql = fileSql.replace(
  alterRoleRegex,
  "-- ALTER ROLE statement skipped by the reconciler (Supabase migration connection cannot ALTER ROLE).",
);

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
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
  const r = await client.query<MigrationRecord>(q, [paddedVersion]);
  return r.rows[0] ?? null;
}

async function updateMigrationRecord(client: pg.PoolClient, schema: ControlSchema, storedChecksum: string, storedName: string): Promise<void> {
  const q = schema === "current"
    ? `UPDATE ${CONTROL_TABLE} SET checksum_sha256 = $1 WHERE migration_id = $2 AND filename = $3 AND checksum_sha256 = $4`
    : `UPDATE ${CONTROL_TABLE} SET checksum = $1 WHERE version = $2 AND name = $3 AND checksum = $4`;
  const updated = await client.query(q, [fileChecksum, paddedVersion, storedName, storedChecksum]);
  if (updated.rowCount !== 1) throw new Error(`Migration ${paddedVersion} history update did not affect exactly one unchanged row.`);
}

async function run(): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;
  let inTransaction = false;
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    lockAcquired = true;

    const schema = await detectControlSchema(client);
    if (!schema) { console.log("\nMigration control table does not exist. Nothing to reconcile.\n"); return; }
    const record = await readMigrationRecord(client, schema);
    if (!record) { console.log(`\nMigration ${paddedVersion} is not recorded. Nothing to reconcile.\n`); return; }
    if (record.checksum === fileChecksum) {
      console.log(`\n✓ Migration ${paddedVersion} already matches the canonical checksum. Nothing to reconcile.\n`);
      return;
    }

    console.log(`\nVendor.ai — reconciliation preview for migration ${paddedVersion} (${filename})`);
    console.log("─".repeat(76));
    console.log(`Stored name: ${record.name}`);
    console.log(`Stored checksum: ${record.checksum}`);
    console.log(`Canonical checksum: ${fileChecksum}`);
    console.log(`Applied at: ${record.applied_at}`);
    console.log("Action: re-run the current file content in full (assumed idempotent — verify before applying).");

    if (!apply) {
      console.log("\nRead-only preview complete. No database changes were made.");
      console.log("To apply this exact reconciliation, run:");
      console.log(`pnpm --filter @workspace/db migrate:reconcile-content -- --version=${version} --apply --expected-checksum=${record.checksum}\n`);
      return;
    }
    if (!expectedChecksum) throw new Error("--expected-checksum=<stored checksum> is required with --apply.");
    if (expectedChecksum !== record.checksum) {
      throw new Error(`Expected checksum does not match the current stored checksum. Expected ${expectedChecksum}, found ${record.checksum}.`);
    }

    await client.query("BEGIN");
    inTransaction = true;

    const locked = await readMigrationRecord(client, schema, true);
    if (!locked || locked.checksum !== record.checksum) {
      throw new Error(`Migration ${paddedVersion} record changed after preview; reconciliation aborted.`);
    }

    await client.query(executableSql);
    await updateMigrationRecord(client, schema, locked.checksum, locked.name);

    await client.query("COMMIT");
    inTransaction = false;

    console.log(`\n✓ Migration ${paddedVersion} reconciled successfully.`);
    console.log(`  Previous checksum: ${record.checksum}`);
    console.log(`  Canonical checksum: ${fileChecksum}`);
    console.log("  Application data: unchanged\n");
  } catch (error) {
    if (inTransaction) { try { await client.query("ROLLBACK"); } catch { /* ignore */ } }
    throw error;
  } finally {
    if (lockAcquired) { try { await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]); } catch { /* ignore */ } }
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ Migration ${paddedVersion} reconciliation failed: ${message}\n`);
  process.exit(1);
});
