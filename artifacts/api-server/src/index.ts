import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./jobs/scheduler.js";
import { runCommercialLifecycleSync } from "./jobs/commercialLifecycleSync.js";
import { runBehaviorIntentSync } from "./jobs/behaviorIntentSync.js";
import { runTrialJourney } from "./jobs/trialJourney.js";
import { runServerConversionSync } from "./jobs/serverConversionSync.js";
import { runGoogleDataManagerConversionSync } from "./jobs/googleDataManagerConversionSync.js";
import { applyPendingMigrations } from "@workspace/db";

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

async function runStartupMigrations() {
  const result = await applyPendingMigrations(logger);
  if (result.applied.length > 0) {
    logger.info(
      { migrations: result.applied.map((m) => m.version) },
      "startup migrations: aplicadas com sucesso",
    );
  }
}

async function start() {
  await runStartupMigrations();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startScheduler(logger);

    // Lifecycle de aquisição e trial: converge CRM, comportamento first-party,
    // calcula Activation Score/jornada dos 5 dias e depois encaminha apenas os
    // eventos elegíveis às plataformas. Cada etapa é idempotente no banco.
    const syncMarketingLifecycle = async () => {
      try {
        await runCommercialLifecycleSync(logger);
        await runBehaviorIntentSync(logger);
        await runTrialJourney(logger);
        await runServerConversionSync(logger);
        await runGoogleDataManagerConversionSync(logger);
      } catch (syncErr) {
        logger.error({ err: syncErr }, "marketing-lifecycle: unhandled sync error");
      }
    };
    void syncMarketingLifecycle();
    setInterval(() => { void syncMarketingLifecycle(); }, 10 * 60 * 1000).unref();
  });
}

start().catch((err) => {
  logger.error({ err }, "API startup failed");
  process.exit(1);
});
