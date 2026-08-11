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

// ─── Boot sequence ────────────────────────────────────────────────────────────
async function runStartupMigrations() {
  try {
    await db.execute(sql`
      ALTER TABLE lead_briefings
        ADD COLUMN IF NOT EXISTS journey_stage text DEFAULT 'abordagem',
        ADD COLUMN IF NOT EXISTS journey_checklist jsonb DEFAULT '{}'::jsonb
    `);
    logger.info("startup migrations: lead service journey OK");

    // Imported Scout findings used to arrive as "em_negociacao" even when
    // no proposal or deal existed. Keep negotiation reserved for records
    // that actually have a commercial document/process attached.
    // A aplicação pode entrar no ar antes das migrations 059/078 em um
    // deploy recém-publicado. Referenciar uma coluna ainda ausente aqui
    // derrubava toda a API. Normalize somente quando o schema estiver pronto.
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.scout_oportunidades') IS NOT NULL
          AND (SELECT count(*) = 5 FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'scout_oportunidades'
                 AND column_name IN ('pipeline_stage', 'approved_by', 'approved_at', 'proposta_id', 'deal_id'))
        THEN
          UPDATE scout_oportunidades
          SET status = 'pendente',
              pipeline_stage = 'identificada',
              approved_by = NULL,
              approved_at = NULL
          WHERE status = 'em_negociacao'
            AND proposta_id IS NULL
            AND deal_id IS NULL;
        END IF;
      END $$
    `);
    logger.info("startup migrations: normalized Scout negotiation statuses OK");
  } catch (err) {
    logger.error({ err }, "startup migrations: lead service journey failed");
    throw err;
  }
}

async function start() {
  // Apply the idempotent compatibility DDL before routes start selecting the
  // new columns. The versioned SQL migration remains the schema history.
  await runStartupMigrations();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start background scheduler after server is ready
    startScheduler(logger);
  });
}

start().catch((err) => {
  logger.error({ err }, "API startup failed");
  process.exit(1);
});
