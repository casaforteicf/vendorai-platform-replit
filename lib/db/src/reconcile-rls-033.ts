#!/usr/bin/env tsx
import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pg;
const apply = process.argv.includes("--apply");
const expected = process.argv.find(a => a.startsWith("--expected-checksum="))?.split("=")[1];
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations/033_rls_support_tables.sql");
const checksum = crypto.createHash("sha256").update(fs.readFileSync(file, "utf8")).digest("hex");
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Database URL is required.");
const pool = new Pool({ connectionString: url, max: 1 });
const tables = ["notification_logs","poe_opportunities","poe_quotation_requests","vcn_companies","vep_companies"];

async function run() {
  const client = await pool.connect();
  let tx = false;
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", ["7767366262"]);
    const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='vendorai_schema_migrations'`);
    const current = new Set(cols.rows.map(r => r.column_name)).has("migration_id");
    const selectSql = current
      ? "SELECT filename AS name, checksum_sha256 AS checksum FROM vendorai_schema_migrations WHERE migration_id='033'"
      : "SELECT name, checksum FROM vendorai_schema_migrations WHERE version='033'";
    const record = (await client.query(selectSql)).rows[0];
    if (!record) throw new Error("Migration 033 is not recorded.");
    if (record.checksum === checksum) {
      console.log("✓ Migration 033 already matches the canonical checksum.");
      return;
    }
    const expectedName = current ? "033_rls_support_tables.sql" : "rls support tables";
    if (record.name.toLowerCase() !== expectedName) throw new Error(`Unexpected migration 033 name: ${record.name}`);
    const coverage = await client.query(`
      SELECT c.relname, c.relrowsecurity,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='vendorai_tenant_access') access,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='vendorai_tenant_guard') guard,
        EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='tenant_isolation') legacy
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind IN ('r','p')`, [tables]);
    if (coverage.rows.length !== tables.length || coverage.rows.some(r => !r.relrowsecurity || !r.access || !r.guard || r.legacy)) {
      throw new Error("Support-table canonical RLS validation failed.");
    }
    console.log(`Migration 033 reconciliation preview: ${record.checksum} -> ${checksum}; 5/5 support tables validated.`);
    if (!apply) {
      console.log("Read-only preview complete.");
      return;
    }
    if (!expected || expected !== record.checksum) throw new Error("Expected checksum does not match the stored checksum.");
    await client.query("BEGIN"); tx = true;
    const updateSql = current
      ? "UPDATE vendorai_schema_migrations SET checksum_sha256=$1 WHERE migration_id='033' AND filename=$2 AND checksum_sha256=$3"
      : "UPDATE vendorai_schema_migrations SET checksum=$1 WHERE version='033' AND name=$2 AND checksum=$3";
    const updated = await client.query(updateSql, [checksum, record.name, record.checksum]);
    if (updated.rowCount !== 1) throw new Error("Migration 033 record changed; aborted.");
    await client.query("COMMIT"); tx = false;
    console.log("✓ Migration 033 history reconciled; schema and application data unchanged.");
  } catch (e) {
    if (tx) await client.query("ROLLBACK");
    throw e;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock($1::bigint)", ["7767366262"]); } catch {}
    client.release(); await pool.end();
  }
}
run().catch(e => { console.error(`✗ Migration 033 reconciliation failed: ${e.message}`); process.exit(1); });
