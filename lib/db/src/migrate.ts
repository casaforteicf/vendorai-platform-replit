#!/usr/bin/env tsx
/**
 * VendorAI versioned SQL migration runner
 *
 * Usage:
 *   pnpm --filter @workspace/db run migrate            — apply pending migrations
 *   pnpm --filter @workspace/db run migrate:status     — show applied / pending status
 *   pnpm --filter @workspace/db run migrate:dry-run    — list pending without applying
 *
 * Control table : vendorai_schema_migrations
 * Advisory lock : pg_advisory_lock(7767366262)  — prevents concurrent runs
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const { Pool } = pg;

// ─── Config ──────────────────────────────────────────────────────────────────

const command = process.argv[2] ?? "up";
const ADVISORY_LOCK_KEY = "7767366262"; // stable int8 for vendorai migrations
const CONTROL_TABLE = "vendorai_schema_migrations";
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
  noTransaction: boolean;
}

function assertUniqueMigrationVersions(files: MigrationFile[]): void {
  const filesByVersion = new Map<string, string[]>();

  for (const file of files) {
    const filenames = filesByVersion.get(file.version) ?? [];
    filenames.push(path.basename(file.filePath));
    filesByVersion.set(file.version, filenames);
  }

  const duplicates = [...filesByVersion.entries()].filter(
    ([, filenames]) => filenames.length > 1,
  );

  if (duplicates.length === 0) return;

  const details = duplicates
    .map(([version, filenames]) => `  ${version}: ${filenames.join(", ")}`)
    .join("\n");

  throw new Error(
    `Duplicate migration version(s) detected:\n${details}\n` +
      "Each numeric migration version must be unique. Resolve the filename conflict before running migrations.",
  );
}

function readMigrationFiles(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn(`  ⚠  Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => {
      const match = /^(\d+)_(.+)\.sql$/.exec(f);
      if (!match) return [];
      const filePath = path.join(MIGRATIONS_DIR, f);
      const content = fs.readFileSync(filePath, "utf8");
      return [
        {
          version: match[1]!,
          name: match[2]!.replace(/_/g, " "),
          filePath,
          noTransaction: content.startsWith("-- no-transaction"),
        },
      ];
    });

  assertUniqueMigrationVersions(files);
  return files;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function ensureControlTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${CONTROL_TABLE} (
      version     TEXT        NOT NULL PRIMARY KEY,
      name        TEXT        NOT NULL,
      checksum    TEXT        NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function acquireLock(client: pg.PoolClient): Promise<void> {
  await client.query(`SELECT pg_advisory_lock($1::bigint)`, [
    ADVISORY_LOCK_KEY,
  ]);
}

async function releaseLock(client: pg.PoolClient): Promise<void> {
  await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [
    ADVISORY_LOCK_KEY,
  ]);
}

async function getApplied(
  client: pg.PoolClient,
): Promise<Map<string, string>> {
  const res = await client.query<{ version: string; checksum: string }>(
    `SELECT version, checksum FROM ${CONTROL_TABLE} ORDER BY version`,
  );
  return new Map(res.rows.map((r) => [r.version, r.checksum]));
}

async function recordMigration(
  client: pg.PoolClient,
  version: string,
  name: string,
  checksum: string,
): Promise<void> {
  await client.query(
    `INSERT INTO ${CONTROL_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
    [version, name, checksum],
  );
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdStatus(
  client: pg.PoolClient,
  files: MigrationFile[],
  applied: Map<string, string>,
): Promise<void> {
  const hr = "─".repeat(60);
  console.log(`\n  VendorAI Migration Status\n  ${hr}`);
  if (files.length === 0) {
    console.log("  (no migration files found)");
  }
  for (const f of files) {
    const ok = applied.has(f.version);
    const marker = ok ? "✓" : "○";
    console.log(`  ${marker}  ${f.version}  ${f.name}`);
  }
  const pending = files.filter((f) => !applied.has(f.version));
  console.log(
    `\n  Applied: ${applied.size}  |  Pending: ${pending.length}\n`,
  );
}

async function cmdDryRun(
  files: MigrationFile[],
  applied: Map<string, string>,
): Promise<void> {
  const pending = files.filter((f) => !applied.has(f.version));
  if (pending.length === 0) {
    console.log("  ✓  All migrations are up to date. Nothing to apply.");
    return;
  }
  console.log(`\n  Pending migrations (dry-run — nothing applied):\n`);
  for (const f of pending) {
    const flag = f.noTransaction ? " [no-transaction]" : "";
    console.log(`  ○  ${f.version}  ${f.name}${flag}`);
  }
  console.log("");
}

async function cmdUp(
  client: pg.PoolClient,
  files: MigrationFile[],
  applied: Map<string, string>,
): Promise<void> {
  // Validate checksums for already-applied migrations
  for (const f of files) {
    if (!applied.has(f.version)) continue;
    const content = fs.readFileSync(f.filePath, "utf8");
    const checksum = sha256(content);
    const stored = applied.get(f.version)!;
    if (stored !== checksum) {
      throw new Error(
        `Checksum mismatch for migration ${f.version} ("${f.name}").\n` +
          `  Stored : ${stored}\n` +
          `  Current: ${checksum}\n` +
          `  Migration file was modified after being applied. This is not allowed.`,
      );
    }
  }

  const pending = files.filter((f) => !applied.has(f.version));
  if (pending.length === 0) {
    console.log("  ✓  All migrations are up to date.");
    return;
  }

  console.log(`\n  Running ${pending.length} pending migration(s)...\n`);

  for (const f of pending) {
    const content = fs.readFileSync(f.filePath, "utf8");
    const checksum = sha256(content);
    const t0 = Date.now();

    if (f.noTransaction) {
      // Run outside explicit transaction (DDL like ALTER TYPE ... ADD VALUE)
      try {
        await client.query(content);
        await recordMigration(client, f.version, f.name, checksum);
        console.log(`  ✓  ${f.version}  ${f.name}  (${Date.now() - t0}ms) [no-tx]`);
      } catch (err) {
        console.error(`  ✗  ${f.version}  ${f.name}`);
        throw err;
      }
    } else {
      // Wrap in transaction
      await client.query("BEGIN");
      try {
        await client.query(content);
        await recordMigration(client, f.version, f.name, checksum);
        await client.query("COMMIT");
        console.log(`  ✓  ${f.version}  ${f.name}  (${Date.now() - t0}ms)`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  ✗  ${f.version}  ${f.name}`);
        throw err;
      }
    }
  }

  console.log("\n  All migrations applied successfully.\n");
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureControlTable(client);
    await acquireLock(client);

    const files = readMigrationFiles();
    const applied = await getApplied(client);

    switch (command) {
      case "status":
        await cmdStatus(client, files, applied);
        break;
      case "dry-run":
        await cmdDryRun(files, applied);
        break;
      case "up":
      default:
        await cmdUp(client, files, applied);
        break;
    }
  } finally {
    try {
      await releaseLock(client);
    } catch {
      // ignore — connection may already be gone
    }
    client.release();
    await pool.end();
  }
}

run().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  ✗  Migration failed: ${msg}\n`);
  process.exit(1);
});
