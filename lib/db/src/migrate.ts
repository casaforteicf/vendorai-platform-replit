#!/usr/bin/env tsx
/**
 * VendorAI versioned SQL migration runner (CLI)
 *
 * Usage:
 *   pnpm --filter @workspace/db run migrate            — apply pending migrations
 *   pnpm --filter @workspace/db run migrate:status     — show applied / pending status
 *   pnpm --filter @workspace/db run migrate:dry-run    — list pending without applying
 *
 * O motor de leitura/aplicação de migrations vive em apply-migrations.ts
 * e é compartilhado com a API (que também aplica pendências no boot, ver
 * artifacts/api-server/src/index.ts) — este arquivo é só a casca de CLI.
 */
import pg from "pg";
import {
  readMigrationFiles,
  ensureControlTable,
  getApplied,
  applyPendingMigrations,
} from "./apply-migrations.js";

const { Pool } = pg;

const command = process.argv[2] ?? "up";

const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "❌  APP_DATABASE_URL, MIGRATION_DATABASE_URL, SUPABASE_DATABASE_URL or DATABASE_URL is required.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

async function cmdStatus(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureControlTable(client);
    const files = readMigrationFiles();
    const applied = await getApplied(client);

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
    console.log(`\n  Applied: ${applied.size}  |  Pending: ${pending.length}\n`);
  } finally {
    client.release();
  }
}

async function cmdDryRun(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureControlTable(client);
    const files = readMigrationFiles();
    const applied = await getApplied(client);

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
  } finally {
    client.release();
  }
}

async function cmdUp(): Promise<void> {
  const result = await applyPendingMigrations(pool, { logger: console });
  if (result.applied.length === 0) {
    console.log("  ✓  All migrations are up to date.");
  } else {
    console.log(`\n  All ${result.applied.length} migration(s) applied successfully.\n`);
  }
}

async function run(): Promise<void> {
  try {
    switch (command) {
      case "status":
        await cmdStatus();
        break;
      case "dry-run":
        await cmdDryRun();
        break;
      case "up":
      default:
        await cmdUp();
        break;
    }
  } finally {
    await pool.end();
  }
}

run().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  ✗  Migration failed: ${msg}\n`);
  process.exit(1);
});
