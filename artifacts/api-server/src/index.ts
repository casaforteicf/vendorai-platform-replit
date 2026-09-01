import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./jobs/scheduler.js";
import { runCommercialLifecycleSync } from "./jobs/commercialLifecycleSync.js";
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

// ─── Boot sequence ────────────────────────────────────────────────────────────
//
// O Railway sobe a API (CMD do Dockerfile) sem garantir que
// `pnpm --filter @workspace/db run migrate` já rodou antes — então um
// deploy recém-publicado pode ter a API no ar antes de migrations recentes
// (ex: colunas de journey do lead_briefings, normalização do Scout) terem
// sido aplicadas no banco. Rotas que dependem delas quebrariam.
//
// Em vez de duplicar DDL de migrations específicas aqui dentro (o que já
// gerou drift no passado — alguém corrigia a migration e esquecia de
// atualizar a cópia), a API aplica TODAS as migrations pendentes no boot
// usando o mesmo motor do CLI (lib/db/src/apply-migrations.ts), direto dos
// arquivos em lib/db/migrations. É seguro rodar em toda subida: cada
// migration só aplica uma vez (controle em vendorai_schema_migrations) e um
// advisory lock evita corrida entre réplicas subindo ao mesmo tempo.
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

    // Start background scheduler after server is ready
    startScheduler(logger);

    // Marketing lifecycle: converge estados reais do CRM em eventos first-party
    // (trial_activated / sale_closed). Dedupe no banco torna seguro rodar no
    // boot e repetir periodicamente, inclusive com mais de uma réplica da API.
    const syncCommercialLifecycle = () => {
      runCommercialLifecycleSync(logger).catch((syncErr) => {
        logger.error({ err: syncErr }, "commercial-lifecycle: unhandled sync error");
      });
    };
    syncCommercialLifecycle();
    setInterval(syncCommercialLifecycle, 10 * 60 * 1000).unref();
  });
}

start().catch((err) => {
  logger.error({ err }, "API startup failed");
  process.exit(1);
});
