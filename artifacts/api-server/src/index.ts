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
