import app from "./app";
import { logger } from "./lib/logger";
import { getServerRuntimeSnapshot, startServerRuntimeSentinel } from "./lib/dev-agent-server-runtime.js";
import { getMainGovernanceSnapshot, startMainGovernanceGuard } from "./lib/dev-agent-main-governance.js";
import { authenticate, requireRole } from "./middlewares/auth.js";
import { startScheduler } from "./jobs/scheduler.js";
import { startMetaCustomAudienceReconcileScheduler } from "./jobs/metaCustomAudienceReconcile.js";
import { runCommercialLifecycleSync } from "./jobs/commercialLifecycleSync.js";
import { runBehaviorIntentSync } from "./jobs/behaviorIntentSync.js";
import { runTrialJourney } from "./jobs/trialJourney.js";
import { runVendorAiSubscriptionBilling } from "./jobs/vendorAiSubscriptionBilling.js";
import { runVendorAiSubscriptionPaymentSync } from "./jobs/vendorAiSubscriptionPaymentSync.js";
import { runServerConversionSync } from "./jobs/serverConversionSync.js";
import { runGoogleDataManagerConversionSync } from "./jobs/googleDataManagerConversionSync.js";
import { runMarketingBudgetAutopilot } from "./jobs/marketingBudgetAutopilot.js";
import { runFinanceIntegrationHealthCycle } from "./jobs/financeIntegrationHealthCycle.js";
import { getCheckoutFunnelMetrics, runCheckoutAbandonmentRecovery } from "./jobs/checkoutAbandonmentRecovery.js";
import { getAcquisitionInvestmentIntelligence } from "./services/acquisitionInvestmentIntelligence.js";
import acquisitionOrchestratorRouter from "./routes/acquisition_orchestrator.js";
import { runCampaignAbWinnerCycle } from "./services/campaignAbWinnerRuntime.js";
import { startMediaVideoBatchRunner } from "./services/media-video-batch.js";
import { startArchConceptRenderRunner } from "./services/arch-concept-render-runner.js";
import { startMediaVideoGenerateRunner } from "./services/media-video-generate.js";
import { startDevAgentSupportHandoff } from "./services/dev-agent-support-handoff.js";
import { startVieIntelligenceCycle } from "./services/vie-intelligence-cycle.js";
import { startContinuousAuditAgent } from "./services/continuous-audit-agent.js";
import { startProductionSentinel } from "./routes/dev_agent_operational_context.js";
import { applyPendingMigrations, pool } from "@workspace/db";

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

app.use(acquisitionOrchestratorRouter);

app.get(
  "/api/support/dev/server-runtime",
  authenticate,
  requireRole("super_admin"),
  (_req, res) => {
    res.json({ success: true, serverRuntime: getServerRuntimeSnapshot(12) });
  },
);

app.get(
  "/api/support/dev/main-governance",
  authenticate,
  requireRole("super_admin"),
  (_req, res) => {
    res.json({ success: true, mainGovernance: getMainGovernanceSnapshot() });
  },
);

app.get(
  "/api/admin/commerce/checkout-funnel",
  authenticate,
  requireRole("super_admin"),
  async (_req, res, next) => {
    try {
      res.json({ groups: await getCheckoutFunnelMetrics() });
    } catch (err) {
      next(err);
    }
  },
);

app.get(
  "/api/admin/commerce/investment-intelligence",
  authenticate,
  requireRole("super_admin"),
  async (_req, res, next) => {
    try {
      res.json(await getAcquisitionInvestmentIntelligence());
    } catch (err) {
      next(err);
    }
  },
);

function isDuplicateMigrationCatalogError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("Duplicate migration version(s) detected");
}

async function runStartupMigrations(): Promise<boolean> {
  try {
    const roleResult = await pool.query<{ current_user: string }>("select current_user");
    const currentRole = roleResult.rows[0]?.current_user;

    if (currentRole === "vendorai_app") {
      await pool.query("select 1");
      logger.info(
        "startup migrations: runtime restrito vendorai_app detectado; migrations ficam a cargo do pipeline privilegiado",
      );
      return true;
    }

    const result = await applyPendingMigrations(logger);
    if (result.applied.length > 0) {
      logger.info(
        { migrations: result.applied.map((m) => m.version) },
        "startup migrations: aplicadas com sucesso",
      );
    }
    return true;
  } catch (err) {
    if (isDuplicateMigrationCatalogError(err)) {
      logger.warn(
        { err },
        "startup migrations: catálogo contém versões duplicadas; pulando auto-migration e validando conectividade do banco",
      );
      try {
        await pool.query("select 1");
        logger.info("startup migrations: banco acessível; workers serão iniciados apesar do conflito de numeração das migrations");
        return true;
      } catch (databaseErr) {
        logger.error(
          { err: databaseErr },
          "startup migrations: catálogo duplicado e banco indisponível; API continuará em modo degradado",
        );
        return false;
      }
    }

    logger.error(
      { err },
      "startup migrations: falha ao aplicar migrations; API continuará em modo degradado sem workers dependentes do banco",
    );
    return false;
  }
}

async function start() {
  const databaseReady = await runStartupMigrations();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, databaseReady }, "Server listening");

    startProductionSentinel(logger);
    startMainGovernanceGuard(logger);
    startServerRuntimeSentinel(logger);

    // O auditor inicia mesmo em modo degradado para detectar falhas de schema/runtime.
    startContinuousAuditAgent(logger);

    if (!databaseReady) {
      logger.warn(
        "Database/schema startup validation failed; schedulers, social workers and lifecycle jobs were not started. Review migration and database logs before redeploying.",
      );
      return;
    }

    startScheduler(logger);
    startMetaCustomAudienceReconcileScheduler(logger);
    startMediaVideoBatchRunner(logger);
    startMediaVideoGenerateRunner(logger);
    startArchConceptRenderRunner(logger);
    startDevAgentSupportHandoff(logger);
    startVieIntelligenceCycle(logger);

    const syncMarketingLifecycle = async () => {
      try {
        await runVendorAiSubscriptionPaymentSync(logger);
        await runCommercialLifecycleSync(logger);
        await runVendorAiSubscriptionBilling(logger);
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

    const syncCheckoutRecovery = async () => {
      try {
        await runCheckoutAbandonmentRecovery(logger);
      } catch (syncErr) {
        logger.error({ err: syncErr }, "checkout-recovery: unhandled sync error");
      }
    };
    setTimeout(() => { void syncCheckoutRecovery(); }, 60 * 1000).unref();
    setInterval(() => { void syncCheckoutRecovery(); }, 10 * 60 * 1000).unref();

    const syncFinanceIntegrationHealth = async () => {
      try {
        await runFinanceIntegrationHealthCycle(logger);
      } catch (syncErr) {
        logger.error({ err: syncErr }, "finance-integration-health-cycle: unhandled error");
      }
    };
    setTimeout(() => { void syncFinanceIntegrationHealth(); }, 3 * 60 * 1000).unref();
    setInterval(() => { void syncFinanceIntegrationHealth(); }, 6 * 60 * 60 * 1000).unref();

    const syncMarketingBudgetAutopilot = async () => {
      try {
        await runMarketingBudgetAutopilot(logger);
      } catch (syncErr) {
        logger.error({ err: syncErr }, "marketing-budget-autopilot: unhandled sync error");
      }
    };
    setTimeout(() => { void syncMarketingBudgetAutopilot(); }, 2 * 60 * 1000).unref();
    setInterval(() => { void syncMarketingBudgetAutopilot(); }, 6 * 60 * 60 * 1000).unref();

    const syncCampaignAbWinner = async () => {
      try {
        await runCampaignAbWinnerCycle(logger);
      } catch (syncErr) {
        logger.error({ err: syncErr }, "marketing-ab-winner-runtime: unhandled sync error");
      }
    };
    setTimeout(() => { void syncCampaignAbWinner(); }, 2 * 60 * 1000).unref();
    setInterval(() => { void syncCampaignAbWinner(); }, 60 * 60 * 1000).unref();
  });
}

start().catch((err) => {
  const startupError =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { message: String(err) };
  logger.error({ startupError }, "API startup failed");
  console.error("API startup failed:", startupError);
  process.exit(1);
});
