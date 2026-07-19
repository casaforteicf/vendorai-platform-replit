#!/usr/bin/env tsx
/**
 * One-time compatibility bridge for migration 025.
 *
 * The first version of migration 025 contained integration credentials in
 * plaintext. The migration file was redacted, but databases that already
 * applied the original file still store its previous checksum. This script
 * updates only that known checksum pair without re-executing SQL.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;

const CONTROL_TABLE = "vendorai_schema_migrations";
const MIGRATION_VERSION = "025";
const ADVISORY_LOCK_KEY = "7767366262";
const ORIGINAL_CHECKSUM =
  "b739d23e896c8b0b98633d23f439d0a9c80cb0efd7a92f7673bd2db92f5d56dd";
const REDACTED_CHECKSUM =
  "06ad5e0cd41f4a0488236e6c9a2dcf63644bf59b74fec15c8534bb7f17fbadfb";

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations/025_institucional_tenant_seed.sql",
);

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

const currentChecksum = sha256(fs.readFileSync(migrationPath, "utf8"));
if (currentChecksum !== REDACTED_CHECKSUM) {
  throw new Error(
    "Migration 025 content does not match the approved redacted checksum.",
  );
}

const connectionString =
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌  DATABASE_URL or SUPABASE_DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

async function run(): Promise<void> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [
      ADVISORY_LOCK_KEY,
    ]);
    lockAcquired = true;

    const tableResult = await client.query<{ table_name: string | null }>(
      "SELECT to_regclass($1) AS table_name",
      [CONTROL_TABLE],
    );

    if (!tableResult.rows[0]?.table_name) {
      return;
    }

    const columnsResult = await client.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1`,
      [CONTROL_TABLE],
    );
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));

    const usesCurrentSchema =
      columns.has("migration_id") && columns.has("checksum_sha256");
    const usesLegacySchema = columns.has("version") && columns.has("checksum");

    if (!usesCurrentSchema && !usesLegacySchema) {
      throw new Error(
        `Unsupported ${CONTROL_TABLE} schema; checksum reconciliation aborted.`,
      );
    }

    const selectSql = usesCurrentSchema
      ? `SELECT checksum_sha256 AS checksum
           FROM ${CONTROL_TABLE}
          WHERE migration_id = $1`
      : `SELECT checksum AS checksum
           FROM ${CONTROL_TABLE}
          WHERE version = $1`;

    const applied = await client.query<{ checksum: string }>(selectSql, [
      MIGRATION_VERSION,
    ]);
    const storedChecksum = applied.rows[0]?.checksum;

    if (!storedChecksum || storedChecksum === REDACTED_CHECKSUM) {
      return;
    }

    if (storedChecksum !== ORIGINAL_CHECKSUM) {
      throw new Error(
        "Migration 025 has an unexpected stored checksum; refusing automatic reconciliation.",
      );
    }

    const updateSql = usesCurrentSchema
      ? `UPDATE ${CONTROL_TABLE}
            SET checksum_sha256 = $1
          WHERE migration_id = $2
            AND checksum_sha256 = $3`
      : `UPDATE ${CONTROL_TABLE}
            SET checksum = $1
          WHERE version = $2
            AND checksum = $3`;

    const updated = await client.query(updateSql, [
      REDACTED_CHECKSUM,
      MIGRATION_VERSION,
      ORIGINAL_CHECKSUM,
    ]);

    if (updated.rowCount !== 1) {
      throw new Error(
        "Migration 025 checksum reconciliation did not update exactly one row.",
      );
    }

    console.log(
      "  ✓  Migration 025 checksum reconciled after credential redaction.",
    );
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
  console.error(`\n  ✗  Credential-redaction reconciliation failed: ${message}\n`);
  process.exit(1);
});
