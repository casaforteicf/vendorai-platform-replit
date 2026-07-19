#!/usr/bin/env tsx
/**
 * Audits RLS coverage for Vendor.ai tenant-owned tables.
 *
 * Usage:
 *   pnpm --filter @workspace/db audit:rls
 *   pnpm --filter @workspace/db audit:rls:strict
 *   pnpm --filter @workspace/db audit:rls:force-ready
 */
import pg from "pg";

const { Pool } = pg;

const strict = process.argv.includes("--strict");
const requireForce = process.argv.includes("--require-force");

const connectionString =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌  DATABASE_URL or SUPABASE_DATABASE_URL is required.");
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
  current_role: string;
  bypass_rls: boolean;
  superuser: boolean;
}

const pool = new Pool({ connectionString, max: 1 });

function marker(value: boolean): string {
  return value ? "✓" : "✗";
}

async function run(): Promise<void> {
  const client = await pool.connect();

  try {
    const roleResult = await client.query<RoleRow>(`
      SELECT
        current_user AS current_role,
        rolbypassrls AS bypass_rls,
        rolsuper AS superuser
      FROM pg_roles
      WHERE rolname = current_user
    `);

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

    const role = roleResult.rows[0];
    const rows = coverageResult.rows;

    const missingRls = rows.filter((row) => !row.rls_enabled);
    const missingAccess = rows.filter((row) => !row.has_access_policy);
    const missingGuard = rows.filter((row) => !row.has_guard_policy);
    const notForced = rows.filter((row) => !row.rls_forced);
    const ownedByCurrentRole = rows.filter(
      (row) => row.table_owner === role?.current_role,
    );

    console.log("\nVendor.ai RLS Coverage");
    console.log("─".repeat(78));
    console.log(`Connection role: ${role?.current_role ?? "unknown"}`);
    console.log(
      `Role bypasses RLS: ${role?.bypass_rls ? "yes" : "no"} | superuser: ${role?.superuser ? "yes" : "no"}`,
    );
    console.log(`Tenant-owned tables discovered: ${rows.length}\n`);

    for (const row of rows) {
      console.log(
        `${marker(row.rls_enabled)} RLS  ${marker(row.has_access_policy)} access  ${marker(row.has_guard_policy)} guard  ${marker(row.rls_forced)} force  ${row.table_schema}.${row.table_name}`,
      );
    }

    console.log("\nSummary");
    console.log("─".repeat(78));
    console.log(`RLS disabled: ${missingRls.length}`);
    console.log(`Access policy missing: ${missingAccess.length}`);
    console.log(`Guard policy missing: ${missingGuard.length}`);
    console.log(`RLS not forced: ${notForced.length}`);
    console.log(`Tables owned by connection role: ${ownedByCurrentRole.length}`);

    if (
      role?.bypass_rls ||
      role?.superuser ||
      ownedByCurrentRole.length > 0
    ) {
      console.log(
        "\n⚠  The current connection can bypass some or all RLS policies. " +
          "FORCE RLS must not be enabled until the API sets transaction-local tenant context.",
      );
    }

    const strictFailures = [
      ...missingRls.map((row) => `${row.table_name}: RLS disabled`),
      ...missingAccess.map((row) => `${row.table_name}: access policy missing`),
      ...missingGuard.map((row) => `${row.table_name}: guard policy missing`),
      ...(requireForce
        ? notForced.map((row) => `${row.table_name}: RLS not forced`)
        : []),
    ];

    if (strict && strictFailures.length > 0) {
      console.error("\nStrict audit failed:");
      for (const failure of strictFailures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("\n✓ RLS audit completed.\n");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ RLS audit failed: ${message}\n`);
  process.exit(1);
});
