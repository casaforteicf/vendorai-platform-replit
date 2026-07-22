#!/usr/bin/env tsx
/**
 * Controlled reconciliation for the divergent migration 032 implementations.
 *
 * Background:
 * - some databases applied 032_rls_tenant_isolation.sql;
 * - the canonical repository now contains 032_rls_foundation.sql;
 * - both files use version 032, so the normal runner correctly refuses the
 *   checksum mismatch before migration 033 can run.
 *
 * Safety model:
 * - read-only by default;
 * - --apply is required for any mutation;
 * - --expected-checksum=<stored checksum> is required with --apply;
 * - the stored migration name and database structure must match the exact
 *   legacy RLS shape before reconciliation is allowed;
 * - foundation SQL, legacy-policy removal, validation and checksum update run
 *   in one transaction under the migration advisory lock;
 * - the existing vendorai_app LOGIN state is restored inside that transaction,
 *   preserving its password and avoiding an application connection outage;
 * - applied_at is preserved and no application data is changed.
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
const CANONICAL_LEGACY_NAME = "rls tenant isolation";
const CANONICAL_LEGACY_FILENAME = "032_rls_tenant_isolation.sql";
const FOUNDATION_NAME = "rls foundation";
const FOUNDATION_FILENAME = "032_rls_foundation.sql";
const FOUNDATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  `../migrations/${FOUNDATION_FILENAME}`,
);
const SUPPORT_TABLES = [
  "notification_logs",
  "poe_opportunities",
  "poe_quotation_requests",
  "vcn_companies",
  "vep_companies",
] as const;

const apply = process.argv.includes("--apply");
const expectedChecksum = process.argv
  .find((argument) => argument.startsWith("--expected-checksum="))
  ?.slice("--expected-checksum=".length)
  .trim();

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function asNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

if (!fs.existsSync(FOUNDATION_PATH)) {
  console.error(`❌  Canonical migration not found: ${FOUNDATION_PATH}`);
  process.exit(1);
}

const foundationSql = fs.readFileSync(FOUNDATION_PATH, "utf8");
const foundationChecksum = sha256(foundationSql);

const connectionString =
  process.env.MIGRATION_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "❌  MIGRATION_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL is required.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

type ControlSchema = "current" | "legacy";

interface MigrationRecord {
  name: string;
  checksum: string;
  applied_at: Date | string;
}

interface RoleStatus {
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolinherit: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
}

interface CoverageStatus {
  tenant_tables: string;
  rls_enabled: string;
  legacy_policies: string;
  access_policies: string;
  guard_policies: string;
}

interface FunctionStatus {
  current_tenant_id: string | null;
  is_super_admin: string | null;
  set_tenant_context: string | null;
}

async function detectControlSchema(
  client: pg.PoolClient,
): Promise<ControlSchema | null> {
  const tableResult = await client.query<{ table_name: string | null }>(
    "SELECT to_regclass($1) AS table_name",
    [CONTROL_TABLE],
  );

  if (!tableResult.rows[0]?.table_name) return null;

  const columnsResult = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1`,
    [CONTROL_TABLE],
  );
  const columns = new Set(columnsResult.rows.map((row) => row.column_name));

  if (
    columns.has("migration_id") &&
    columns.has("filename") &&
    columns.has("checksum_sha256")
  ) {
    return "current";
  }

  if (
    columns.has("version") &&
    columns.has("name") &&
    columns.has("checksum")
  ) {
    return "legacy";
  }

  throw new Error(`Unsupported ${CONTROL_TABLE} schema.`);
}

async function readMigrationRecord(
  client: pg.PoolClient,
  schema: ControlSchema,
  forUpdate = false,
): Promise<MigrationRecord | null> {
  const lockClause = forUpdate ? " FOR UPDATE" : "";
  const query =
    schema === "current"
      ? `SELECT filename AS name,
                checksum_sha256 AS checksum,
                applied_at
           FROM ${CONTROL_TABLE}
          WHERE migration_id = $1${lockClause}`
      : `SELECT name, checksum, applied_at
           FROM ${CONTROL_TABLE}
          WHERE version = $1${lockClause}`;

  const result = await client.query<MigrationRecord>(query, [MIGRATION_VERSION]);
  return result.rows[0] ?? null;
}

async function readRoleStatus(
  client: pg.PoolClient,
): Promise<RoleStatus | null> {
  const result = await client.query<RoleStatus>(`
    SELECT rolcanlogin,
           rolsuper,
           rolbypassrls,
           rolinherit,
           rolcreatedb,
           rolcreaterole
      FROM pg_roles
     WHERE rolname = 'vendorai_app'
  `);
  return result.rows[0] ?? null;
}

async function readCoverageStatus(
  client: pg.PoolClient,
): Promise<CoverageStatus> {
  const result = await client.query<CoverageStatus>(`
    WITH tenant_tables AS (
      SELECT DISTINCT cls.oid, cls.relrowsecurity
        FROM pg_class AS cls
        JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
        JOIN pg_attribute AS attr ON attr.attrelid = cls.oid
       WHERE ns.nspname = 'public'
         AND cls.relkind IN ('r', 'p')
         AND attr.attnum > 0
         AND NOT attr.attisdropped
         AND attr.attname IN ('tenant_id', 'tenantId')
    )
    SELECT
      COUNT(*)::text AS tenant_tables,
      COUNT(*) FILTER (WHERE tbl.relrowsecurity)::text AS rls_enabled,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
            FROM pg_policy AS pol
           WHERE pol.polrelid = tbl.oid
             AND pol.polname = 'tenant_isolation'
        )
      )::text AS legacy_policies,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
            FROM pg_policy AS pol
           WHERE pol.polrelid = tbl.oid
             AND pol.polname = 'vendorai_tenant_access'
        )
      )::text AS access_policies,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
            FROM pg_policy AS pol
           WHERE pol.polrelid = tbl.oid
             AND pol.polname = 'vendorai_tenant_guard'
        )
      )::text AS guard_policies
    FROM tenant_tables AS tbl
  `);

  return result.rows[0]!;
}

async function countSupportTables(client: pg.PoolClient): Promise<number> {
  const result = await client.query<{ table_count: string }>(
    `SELECT COUNT(*)::text AS table_count
       FROM unnest($1::text[]) AS requested(table_name)
      WHERE to_regclass('public.' || requested.table_name) IS NOT NULL`,
    [SUPPORT_TABLES],
  );
  return asNumber(result.rows[0]?.table_count);
}

function assertLegacyState(
  schema: ControlSchema,
  record: MigrationRecord,
  role: RoleStatus | null,
  coverage: CoverageStatus,
  supportTableCount: number,
): void {
  const expectedName =
    schema === "current" ? CANONICAL_LEGACY_FILENAME : CANONICAL_LEGACY_NAME;

  if (record.name.trim().toLowerCase() !== expectedName) {
    throw new Error(
      `Migration 032 name is unexpected: ${record.name}. Expected ${expectedName}.`,
    );
  }

  if (!record.checksum || !/^[a-f0-9]{64}$/i.test(record.checksum)) {
    throw new Error("Migration 032 stored checksum is missing or malformed.");
  }

  if (!role) throw new Error("Legacy vendorai_app role was not found.");
  if (!role.rolcanlogin) {
    throw new Error("vendorai_app is already NOLOGIN; legacy state is not exact.");
  }
  if (role.rolsuper || role.rolbypassrls) {
    throw new Error("vendorai_app has unsafe SUPERUSER or BYPASSRLS attributes.");
  }
  if (role.rolinherit || role.rolcreatedb || role.rolcreaterole) {
    throw new Error(
      "vendorai_app attributes do not match the expected legacy restricted role.",
    );
  }

  const tenantTables = asNumber(coverage.tenant_tables);
  const rlsEnabled = asNumber(coverage.rls_enabled);
  const legacyPolicies = asNumber(coverage.legacy_policies);
  const accessPolicies = asNumber(coverage.access_policies);
  const guardPolicies = asNumber(coverage.guard_policies);

  if (tenantTables === 0) {
    throw new Error("No tenant-owned tables were discovered.");
  }
  // Tables may have been added after the alternate 032 was applied. Accept
  // that known mixed legacy shape only when at least one original policy is
  // present and no canonical policy exists yet. The transaction below applies
  // the foundation to every current tenant table and validates full coverage
  // before committing.
  if (
    legacyPolicies === 0 ||
    legacyPolicies > rlsEnabled ||
    rlsEnabled > tenantTables
  ) {
    throw new Error(
      `Legacy RLS coverage is not reconcilable: tables=${tenantTables}, rls=${rlsEnabled}, tenant_isolation=${legacyPolicies}.`,
    );
  }
  if (accessPolicies !== 0 || guardPolicies !== 0) {
    throw new Error(
      `Canonical policies already exist partially: access=${accessPolicies}, guard=${guardPolicies}.`,
    );
  }
  if (supportTableCount !== SUPPORT_TABLES.length) {
    throw new Error(
      `Expected ${SUPPORT_TABLES.length} legacy support tables, found ${supportTableCount}.`,
    );
  }
}

async function dropLegacyPolicies(client: pg.PoolClient): Promise<void> {
  const result = await client.query<{ table_schema: string; table_name: string }>(`
    SELECT ns.nspname AS table_schema, cls.relname AS table_name
      FROM pg_policy AS pol
      JOIN pg_class AS cls ON cls.oid = pol.polrelid
      JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
     WHERE ns.nspname = 'public'
       AND pol.polname = 'tenant_isolation'
     ORDER BY cls.relname
  `);

  for (const row of result.rows) {
    const qualifiedTable = `${quoteIdentifier(row.table_schema)}.${quoteIdentifier(row.table_name)}`;
    await client.query(
      `DROP POLICY IF EXISTS ${quoteIdentifier("tenant_isolation")} ON ${qualifiedTable}`,
    );
  }
}

async function validateCanonicalState(
  client: pg.PoolClient,
  expectedCanLogin: boolean,
): Promise<void> {
  const role = await readRoleStatus(client);
  if (!role) throw new Error("vendorai_app role is missing after reconciliation.");
  if (
    role.rolcanlogin !== expectedCanLogin ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolinherit ||
    role.rolcreatedb ||
    role.rolcreaterole
  ) {
    throw new Error(
      `vendorai_app restricted-role validation failed; expected LOGIN=${expectedCanLogin}.`,
    );
  }

  const coverage = await readCoverageStatus(client);
  const tenantTables = asNumber(coverage.tenant_tables);
  const rlsEnabled = asNumber(coverage.rls_enabled);
  const legacyPolicies = asNumber(coverage.legacy_policies);
  const accessPolicies = asNumber(coverage.access_policies);
  const guardPolicies = asNumber(coverage.guard_policies);

  if (
    tenantTables === 0 ||
    rlsEnabled !== tenantTables ||
    accessPolicies !== tenantTables ||
    guardPolicies !== tenantTables ||
    legacyPolicies !== 0
  ) {
    throw new Error(
      `Canonical coverage validation failed: tables=${tenantTables}, rls=${rlsEnabled}, access=${accessPolicies}, guard=${guardPolicies}, legacy=${legacyPolicies}.`,
    );
  }

  const functionsResult = await client.query<FunctionStatus>(`
    SELECT
      to_regprocedure('app_security.current_tenant_id()')::text AS current_tenant_id,
      to_regprocedure('app_security.is_super_admin()')::text AS is_super_admin,
      to_regprocedure('app_security.set_tenant_context(text,boolean)')::text AS set_tenant_context
  `);
  const functions = functionsResult.rows[0]!;
  if (
    !functions.current_tenant_id ||
    !functions.is_super_admin ||
    !functions.set_tenant_context
  ) {
    throw new Error("Canonical app_security functions are incomplete.");
  }
}

async function updateMigrationRecord(
  client: pg.PoolClient,
  schema: ControlSchema,
  storedChecksum: string,
  storedName: string,
): Promise<void> {
  const query =
    schema === "current"
      ? `UPDATE ${CONTROL_TABLE}
            SET filename = $1,
                checksum_sha256 = $2
          WHERE migration_id = $3
            AND filename = $4
            AND checksum_sha256 = $5`
      : `UPDATE ${CONTROL_TABLE}
            SET name = $1,
                checksum = $2
          WHERE version = $3
            AND name = $4
            AND checksum = $5`;

  const updated = await client.query(query, [
    schema === "current" ? FOUNDATION_FILENAME : FOUNDATION_NAME,
    foundationChecksum,
    MIGRATION_VERSION,
    storedName,
    storedChecksum,
  ]);

  if (updated.rowCount !== 1) {
    throw new Error(
      "Migration 032 history update did not affect exactly one unchanged row.",
    );
  }
}

async function run(): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;
  let inTransaction = false;

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [
      ADVISORY_LOCK_KEY,
    ]);
    lockAcquired = true;

    const schema = await detectControlSchema(client);
    if (!schema) {
      console.log(
        "\nMigration control table does not exist. Nothing to reconcile; run the normal migration flow.\n",
      );
      return;
    }

    const record = await readMigrationRecord(client, schema);
    if (!record) {
      console.log(
        "\nMigration 032 is not recorded. Nothing to reconcile; the normal runner may apply the canonical 032.\n",
      );
      return;
    }

    if (record.checksum === foundationChecksum) {
      console.log(
        "\n✓ Migration 032 already matches the canonical foundation checksum. Nothing to reconcile.\n",
      );
      return;
    }

    const role = await readRoleStatus(client);
    const coverage = await readCoverageStatus(client);
    const supportTableCount = await countSupportTables(client);
    assertLegacyState(schema, record, role, coverage, supportTableCount);

    console.log("\nVendor.ai — reconciliation preview for migration 032");
    console.log("─".repeat(76));
    console.log(`Stored name: ${record.name}`);
    console.log(`Stored checksum: ${record.checksum}`);
    console.log(`Canonical checksum: ${foundationChecksum}`);
    console.log(`Applied at: ${record.applied_at}`);
    console.log(
      `Legacy coverage: tables=${coverage.tenant_tables}, rls=${coverage.rls_enabled}, tenant_isolation=${coverage.legacy_policies}`,
    );
    console.log(
      `Support tables: ${supportTableCount}/${SUPPORT_TABLES.length}`,
    );
    console.log("Application role LOGIN: will be preserved");

    if (!apply) {
      console.log(
        "\nRead-only preview complete. No database changes were made.",
      );
      console.log("To apply this exact reconciliation, run:");
      console.log(
        `pnpm --filter @workspace/db migrate:reconcile-rls-032 -- --apply --expected-checksum=${record.checksum}\n`,
      );
      return;
    }

    if (!expectedChecksum) {
      throw new Error(
        "--expected-checksum=<stored checksum> is required with --apply.",
      );
    }
    if (expectedChecksum !== record.checksum) {
      throw new Error(
        `Expected checksum does not match the current stored checksum. Expected ${expectedChecksum}, found ${record.checksum}.`,
      );
    }

    await client.query("BEGIN");
    inTransaction = true;

    const lockedRecord = await readMigrationRecord(client, schema, true);
    if (
      !lockedRecord ||
      lockedRecord.name !== record.name ||
      lockedRecord.checksum !== record.checksum
    ) {
      throw new Error(
        "Migration 032 record changed after preview; reconciliation aborted.",
      );
    }

    const lockedRole = await readRoleStatus(client);
    const lockedCoverage = await readCoverageStatus(client);
    const lockedSupportTableCount = await countSupportTables(client);
    assertLegacyState(
      schema,
      lockedRecord,
      lockedRole,
      lockedCoverage,
      lockedSupportTableCount,
    );

    const preserveCanLogin = lockedRole!.rolcanlogin;

    await client.query(foundationSql);
    await dropLegacyPolicies(client);

    if (preserveCanLogin) {
      await client.query("ALTER ROLE vendorai_app LOGIN");
    }

    await validateCanonicalState(client, preserveCanLogin);
    await updateMigrationRecord(
      client,
      schema,
      lockedRecord.checksum,
      lockedRecord.name,
    );

    await client.query("COMMIT");
    inTransaction = false;

    console.log("\n✓ Migration 032 reconciled successfully.");
    console.log(`  Previous checksum: ${record.checksum}`);
    console.log(`  Canonical checksum: ${foundationChecksum}`);
    console.log("  Legacy tenant_isolation policies: removed");
    console.log("  Canonical access/guard policies: validated");
    console.log("  Application role LOGIN: preserved");
    console.log("  Application data: unchanged");
    console.log("\nNext commands:");
    console.log("  pnpm --filter @workspace/db migrate:dry-run");
    console.log("  pnpm --filter @workspace/db migrate");
    console.log("  pnpm --filter @workspace/db migrate:status");
    console.log("  pnpm --filter @workspace/db audit:rls:strict\n");
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The connection may already be unavailable.
      }
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [
          ADVISORY_LOCK_KEY,
        ]);
      } catch {
        // The connection may already be unavailable.
      }
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
