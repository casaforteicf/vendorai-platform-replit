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
  process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌  DATABASE_URL or SUPABASE_DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Split a SQL file into individual statements, respecting:
 *   - Dollar-quoted strings: $$ ... $$ and $tag$ ... $tag$
 *   - Single-quoted strings: '...'
 *   - Line comments: -- ...
 *   - Block comments: /* ... *\/
 *
 * Each returned string is a non-empty statement (without the trailing `;`).
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    // ── Line comment ──────────────────────────────────────────────────────────
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const chunk = end === -1 ? sql.slice(i) : sql.slice(i, end + 1);
      buf += chunk;
      i += chunk.length;
      continue;
    }

    // ── Block comment ─────────────────────────────────────────────────────────
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const chunk = end === -1 ? sql.slice(i) : sql.slice(i, end + 2);
      buf += chunk;
      i += chunk.length;
      continue;
    }

    // ── Single-quoted string ──────────────────────────────────────────────────
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; } // escaped ''
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }

    // ── Dollar-quoted string ──────────────────────────────────────────────────
    if (sql[i] === "$") {
      const tagEnd = sql.indexOf("$", i + 1);
      if (tagEnd !== -1) {
        const tag = sql.slice(i, tagEnd + 1); // e.g. "$$" or "$do$"
        if (/^\$[A-Za-z0-9_]*\$$/.test(tag)) {
          const bodyStart = tagEnd + 1;
          const bodyEnd = sql.indexOf(tag, bodyStart);
          if (bodyEnd !== -1) {
            buf += sql.slice(i, bodyEnd + tag.length);
            i = bodyEnd + tag.length;
            continue;
          }
        }
      }
    }

    // ── Statement terminator ──────────────────────────────────────────────────
    if (sql[i] === ";") {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
      i++;
      continue;
    }

    buf += sql[i++];
  }

  // Trailing content without a final semicolon
  const last = buf.trim();
  if (last) statements.push(last);

  return statements.filter((s) => s.replace(/--[^\n]*/g, "").trim().length > 0);
}

interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
  noTransaction: boolean;
}

function readMigrationFiles(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.warn(`  ⚠  Migrations directory not found: ${MIGRATIONS_DIR}`);
    return [];
  }
  return fs
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

    const stmts = splitStatements(content);

    if (f.noTransaction) {
      // Run outside explicit transaction (DDL like ALTER TYPE ... ADD VALUE)
      try {
        for (let si = 0; si < stmts.length; si++) {
          const stmt = stmts[si]!;
          const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
          try {
            await client.query(stmt);
          } catch (stmtErr) {
            const msg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
            throw new Error(`Statement [${si + 1}/${stmts.length}] failed:\n  SQL: ${preview}\n  ERR: ${msg}`);
          }
        }
        await recordMigration(client, f.version, f.name, checksum);
        console.log(`  ✓  ${f.version}  ${f.name}  (${Date.now() - t0}ms) [no-tx]`);
      } catch (err) {
        console.error(`  ✗  ${f.version}  ${f.name}`);
        throw err;
      }
    } else {
      // Wrap in transaction — execute each statement individually so that
      // catalog changes (e.g. CREATE ROLE) are visible to subsequent statements.
      await client.query("BEGIN");
      try {
        for (let si = 0; si < stmts.length; si++) {
          const stmt = stmts[si]!;
          const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
          try {
            await client.query(stmt);
          } catch (stmtErr) {
            const msg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
            throw new Error(`Statement [${si + 1}/${stmts.length}] failed:\n  SQL: ${preview}\n  ERR: ${msg}`);
          }
        }
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
