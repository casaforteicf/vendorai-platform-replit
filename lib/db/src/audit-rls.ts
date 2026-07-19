#!/usr/bin/env tsx
/**
 * Audits Vendor.ai RLS coverage and the restricted runtime role.
 *
 * Usage:
 *   pnpm --filter @workspace/db audit:rls
 *   pnpm --filter @workspace/db audit:rls:strict
 *   pnpm --filter @workspace/db audit:rls:runtime
 */
import crypto from "crypto";
import pg from "pg";

const { Pool } = pg;

const strict = process.argv.includes("--strict");
const verifyRuntime = process.argv.includes("--runtime");
const APP_ROLE = "vendorai_app";

const adminConnectionString =
  process.env.MIGRATION_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!adminConnectionString) {
  console.error(
    "❌  MIGRATION_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL is required.",
  );
  process.exit(1);
}

interface CoverageRow {
  table_schema: string;
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  table_owner: string;
  has_access_policy: boolean;
  has_guard_policy: boolean;
}

interface RoleRow {
  role_name: string;
  can_login: boolean;
  is_superuser: boolean;
  bypasses_rls: boolean;
  can_create_db: boolean;
  can_create_role: boolean;
}

interface CurrentRoleRow {
  current_role: string;
  bypasses_rls: boolean;
  is_superuser: boolean;
}

const adminPool = new Pool({ connectionString: adminConnectionString, max: 1 });

function marker(value: boolean): string {
  return value ? "✓" : "✗";
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function verifyRuntimeConnection(
  coverage: CoverageRow[],
): Promise<string[]> {
  const runtimeConnectionString = process.env.APP_DATABASE_URL;
  if (!runtimeConnectionString) {
    return ["APP_DATABASE_URL is not configured"];
  }

  const runtimePool = new Pool({ connectionString: runtimeConnectionString, max: 1 });
  const client = await runtimePool.connect();
  const failures: string[] = [];

  try {
    const roleResult = await client.query<CurrentRoleRow>(`
      SELECT
        current_user AS current_role,
        rolbypassrls AS bypasses_rls,
        rolsuper AS is_superuser
      FROM pg_roles
      WHERE rolname = current_user
    `);
    const role = roleResult.rows[0];

    if (role?.current_role !== APP_ROLE) {
      failures.push(
        `APP_DATABASE_URL connects as ${role?.current_role ?? "unknown"}, expected ${APP_ROLE}`,
      );
    }
    if (role?.bypasses_rls) failures.push(`${APP_ROLE} has BYPASSRLS`);
    if (role?.is_superuser) failures.push(`${APP_ROLE} is superuser`);

    await client.query("BEGIN");
    const sentinelTenant = `rls-audit-${crypto.randomUUID()}`;
    await client.query(
      "SELECT app_security.set_tenant_context($1, FALSE)",
      [sentinelTenant],
    );

    for (const row of coverage) {
      const tableName = `${quoteIdentifier(row.table_schema)}.${quoteIdentifier(row.table_name)}`;
      const countResult = await client.query<{ visible_rows: string }>(
        `SELECT COUNT(*)::text AS visible_rows FROM ${tableName}`,
      );
      const visibleRows = Number(countResult.rows[0]?.visible_rows ?? "0");
      if (visibleRows !== 0) {
        failures.push(
          `${row.table_schema}.${row.table_name}: ${visibleRows} row(s) visible under random tenant context`,
        );
      }
    }

    await client.query("ROLLBACK");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Connection may already be unavailable.
    }
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`runtime RLS probe failed: ${message}`);
  } finally {
    client.release();
    await runtimePool.end();
  }

  return failures;
}

async function run(): Promise<void> {
  const client = await adminPool.connect();

  try {
    const coverageResult = await client.query<CoverageRow>(`
      SELECT
        table_schema,
        table_name,
        rls_enabled,
        rls_forced,
        table_owner,
        has_access_policy,
        has_guard_policy
      FROM app_security.rls_coverage
      ORDER BY table_name
    `);

    const appRoleResult = await client.query<RoleRow>(`
      SELECT
        rolname AS role_name,
        rolcanlogin AS can_login,
        rolsuper AS is_superuser,
        rolbypassrls AS bypasses_rls,
        rolcreatedb AS can_create_db,
        rolcreaterole AS can_create_role
      FROM pg_roles
      WHERE rolname = $1
    `, [APP_ROLE]);

    const rows = coverageResult.rows;
    const appRole = appRoleResult.rows[0];
    const missingRls = rows.filter((row) => !row.rls_enabled);
    const missingAccess = rows.filter((row) => !row.has_access_policy);
    const missingGuard = rows.filter((row) => !row.has_guard_policy);
    const notForced = rows.filter((row) => !row.rls_forced);

    console.log("\nVendor.ai RLS Coverage");
    console.log("─".repeat(82));
    console.log(`Tenant-owned tables discovered: ${rows.length}`);
    console.log(
      `Application role: ${appRole?.role_name ?? "missing"} | login: ${appRole?.can_login ? "yes" : "no"} | ` +
        `BYPASSRLS: ${appRole?.bypasses_rls ? "yes" : "no"} | superuser: ${appRole?.is_superuser ? "yes" : "no"}\n`,
    );

    for (const row of rows) {
      console.log(
        `${marker(row.rls_enabled)} RLS  ${marker(row.has_access_policy)} access  ` +
          `${marker(row.has_guard_policy)} guard  ${marker(row.rls_forced)} force  ` +
          `${row.table_schema}.${row.table_name}`,
      );
    }

    console.log("\nSummary");
    console.log("─".repeat(82));
    console.log(`RLS disabled: ${missingRls.length}`);
    console.log(`Access policy missing: ${missingAccess.length}`);
    console.log(`Guard policy missing: ${missingGuard.length}`);
    console.log(`RLS not forced: ${notForced.length} (expected for non-owner app role)`);

    const failures: string[] = [];
    if (!appRole) failures.push(`${APP_ROLE}: role missing`);
    if (appRole?.is_superuser) failures.push(`${APP_ROLE}: must not be superuser`);
    if (appRole?.bypasses_rls) failures.push(`${APP_ROLE}: must not have BYPASSRLS`);
    if (appRole?.can_create_db) failures.push(`${APP_ROLE}: must not create databases`);
    if (appRole?.can_create_role) failures.push(`${APP_ROLE}: must not create roles`);
    failures.push(...missingRls.map((row) => `${row.table_name}: RLS disabled`));
    failures.push(
      ...missingAccess.map((row) => `${row.table_name}: access policy missing`),
    );
    failures.push(
      ...missingGuard.map((row) => `${row.table_name}: guard policy missing`),
    );

    if (verifyRuntime) {
      console.log("\nRuntime probe");
      console.log("─".repeat(82));
      const runtimeFailures = await verifyRuntimeConnection(rows);
      failures.push(...runtimeFailures);
      console.log(
        runtimeFailures.length === 0
          ? "✓ APP_DATABASE_URL is using vendorai_app and random-tenant isolation passed."
          : `✗ Runtime probe found ${runtimeFailures.length} problem(s).`,
      );
    }

    if ((strict || verifyRuntime) && failures.length > 0) {
      console.error("\nRLS audit failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log("\n✓ RLS audit completed.\n");
  } finally {
    client.release();
    await adminPool.end();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ RLS audit failed: ${message}\n`);
  process.exit(1);
});
