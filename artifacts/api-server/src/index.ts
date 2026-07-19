import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./jobs/scheduler.js";

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
// Schema migrations are managed by the versioned migration runner in lib/db.
// Run: pnpm --filter @workspace/db run migrate
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start background scheduler after server is ready
  startScheduler(logger);
});
