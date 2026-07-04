import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./jobs/scheduler.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Idempotent startup migrations ───────────────────────────────────────────
async function runStartupMigrations() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_specifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        projeto_id TEXT NOT NULL,
        render_id TEXT,
        render_image_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        items_count INTEGER DEFAULT 0,
        specified_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_spec_items (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        specification_id TEXT NOT NULL REFERENCES arch_specifications(id) ON DELETE CASCADE,
        categoria TEXT NOT NULL,
        descricao TEXT NOT NULL,
        quantidade INTEGER DEFAULT 1,
        confianca NUMERIC(3,2) DEFAULT 0.80,
        status TEXT NOT NULL DEFAULT 'pendente',
        catalogo_item_id TEXT,
        override_nome TEXT,
        override_fornecedor TEXT,
        override_preco NUMERIC(10,2),
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_specs_projeto    ON arch_specifications(projeto_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_specs_tenant     ON arch_specifications(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_spec_items_spec  ON arch_spec_items(specification_id)`);
    logger.info("startup migrations: arch_specifications OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_specifications skipped (may already exist)");
  }
}

// ─── Boot sequence ────────────────────────────────────────────────────────────
runStartupMigrations().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start background scheduler after server is ready
    startScheduler(logger);
  });
}).catch((err) => {
  logger.error({ err }, "Failed to run startup migrations");
  process.exit(1);
});
