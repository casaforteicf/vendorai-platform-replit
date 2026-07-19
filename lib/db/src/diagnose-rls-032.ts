#!/usr/bin/env tsx
/**
 * Read-only diagnostic for the divergent migration 032 implementations.
 *
 * This command never creates, updates or deletes database objects or rows. It
 * reports the migration-control record, the vendorai_app role attributes, RLS
 * policy coverage and the presence of the five support tables reconciled by
 * migration 033.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

const CONTROL_TABLE = "vendorai_schema_migrations";
const MIGRATION_VERSION = "032";
const FOUNDATION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations/032_rls_foundation.sql",
);

const SUPPORT_TABLES = [
  "notification_logs",
  "poe_opportunities",
  "poe_quotation_requests",
  "vcn_companies",
  "vep_companies",
] as const;

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

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

if (!fs.existsSync(FOUNDATION_PATH)) {
  console.error(`❌  Canonical migration not found: ${FOUNDATION_PATH}`);
  process.exit(1);
}

const foundationChecksum = sha256(fs.readFileSync(FOUNDATION_PATH, "utf8"));
const pool = new Pool({ connectionString, max: 1 });

interface MigrationRecord {
  name: string | null;
  checksum: string | null;
  applied_at: Date | string | null;
}

interface RoleStatus {
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolinherit: boolean;
}

interface CoverageRow {
  tenant_tables: string;
  rls_enabled: string;
  legacy_policies: string;
  access_policies: string;
  guard_policies: string;
}

async function run(): Promise<void> {
  const client = await pool.connect();

  try {
    const tableResult = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass($1) AS table_name",
      [CONTROL_TABLE],
    );

    let migrationRecord: MigrationRecord | null = null;

    if (tableResult.rows[0]?.table_name) {
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
        const result = await client.query<MigrationRecord>(
          `SELECT filename AS name,
                  checksum_sha256 AS checksum,
                  applied_at
             FROM ${CONTROL_TABLE}
            WHERE migration_id = $1`,
          [MIGRATION_VERSION],
        );
        migrationRecord = result.rows[0] ?? null;
      } else if (
        columns.has("version") &&
        columns.has("name") &&
        columns.has("checksum")
      ) {
        const result = await client.query<MigrationRecord>(
          `SELECT name, checksum, applied_at
             FROM ${CONTROL_TABLE}
            WHERE version = $1`,
          [MIGRATION_VERSION],
        );
        migrationRecord = result.rows[0] ?? null;
      } else {
        throw new Error(`Unsupported ${CONTROL_TABLE} schema.`);
      }
    }

    const roleResult = await client.query<RoleStatus>(
      `SELECT rolcanlogin, rolsuper, rolbypassrls, rolinherit
         FROM pg_roles
        WHERE rolname = 'vendorai_app'`,
    );
    const role = roleResult.rows[0] ?? null;

    const coverageResult = await client.query<CoverageRow>(`
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
        COUNT(*) FILTER (WHERE relrowsecurity)::text AS rls_enabled,
        COUNT(*) FILTER (WHERE pol.polname = 'tenant_isolation')::text AS legacy_policies,
        COUNT(*) FILTER (WHERE pol.polname = 'vendorai_tenant_access')::text AS access_policies,
        COUNT(*) FILTER (WHERE pol.polname = 'vendorai_tenant_guard')::text AS guard_policies
      FROM tenant_tables AS tbl
      LEFT JOIN pg_policy AS pol ON pol.polrelid = tbl.oid
    `);
    const coverage = coverageResult.rows[0]!;

    const supportResult = await client.query<{
      table_name: string;
      exists: boolean;
      rls_enabled: boolean | null;
    }>(
      `SELECT requested.table_name,
              cls.oid IS NOT NULL AS exists,
              cls.relrowsecurity AS rls_enabled
         FROM unnest($1::text[]) AS requested(table_name)
         LEFT JOIN pg_namespace AS ns ON ns.nspname = 'public'
         LEFT JOIN pg_class AS cls
           ON cls.relnamespace = ns.oid
          AND cls.relname = requested.table_name
          AND cls.relkind IN ('r', 'p')
        ORDER BY requested.table_name`,
      [SUPPORT_TABLES],
    );

    let classification:
      | "not_applied"
      | "foundation_applied"
      | "alternate_likely"
      | "unknown_checksum";

    if (!migrationRecord) {
      classification = "not_applied";
    } else if (migrationRecord.checksum === foundationChecksum) {
      classification = "foundation_applied";
    } else if (
      migrationRecord.name?.toLowerCase().includes("tenant isolation") ||
      Number(coverage.legacy_policies) > 0 ||
      role?.rolcanlogin === true
    ) {
      classification = "alternate_likely";
    } else {
      classification = "unknown_checksum";
    }

    console.log("\nVendor.ai — diagnóstico somente-leitura da migration 032\n");
    console.log(`Classificação: ${classification}`);
    console.log(`Checksum local 032_foundation: ${foundationChecksum}`);
    console.log(
      `Registro no banco: ${migrationRecord ? `${migrationRecord.name ?? "(sem nome)"} | ${migrationRecord.checksum ?? "(sem checksum)"} | ${migrationRecord.applied_at ?? "(sem data)"}` : "não encontrado"}`,
    );
    console.log(
      `Role vendorai_app: ${role ? `LOGIN=${role.rolcanlogin} SUPERUSER=${role.rolsuper} BYPASSRLS=${role.rolbypassrls} INHERIT=${role.rolinherit}` : "não encontrada"}`,
    );
    console.log(
      `Cobertura: tenant_tables=${coverage.tenant_tables} rls_enabled=${coverage.rls_enabled} legacy=${coverage.legacy_policies} access=${coverage.access_policies} guard=${coverage.guard_policies}`,
    );
    console.log("Tabelas auxiliares:");
    for (const table of supportResult.rows) {
      console.log(
        `  - ${table.table_name}: exists=${table.exists} rls=${table.rls_enabled ?? false}`,
      );
    }

    console.log("\nPróxima ação recomendada:");
    switch (classification) {
      case "not_applied":
        console.log(
          "  Validar e aplicar primeiro a 032_rls_foundation; depois aplicar a 033.",
        );
        break;
      case "foundation_applied":
        console.log(
          "  A migration canônica está registrada; validar a 033 em staging antes do merge/deploy.",
        );
        break;
      case "alternate_likely":
        console.log(
          "  Não executar migrate. Preparar reconciliação explícita do histórico e das políticas.",
        );
        break;
      case "unknown_checksum":
        console.log(
          "  Não executar migrate. O checksum 032 é desconhecido e precisa de auditoria manual.",
        );
        break;
    }
    console.log("");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ Diagnóstico RLS 032 falhou: ${message}\n`);
  process.exit(1);
});
