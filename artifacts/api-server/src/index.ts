import app from "./app";
import { logger } from "./lib/logger";
import { getServerRuntimeSnapshot, startServerRuntimeSentinel } from "./lib/dev-agent-server-runtime.js";
import { getMainGovernanceSnapshot, startMainGovernanceGuard } from "./lib/dev-agent-main-governance.js";
import { authenticate, requireRole } from "./middlewares/auth.js";
import { startScheduler } from "./jobs/scheduler.js";
import { runCommercialLifecycleSync } from "./jobs/commercialLifecycleSync.js";
import { runBehaviorIntentSync } from "./jobs/behaviorIntentSync.js";
import { runTrialJourney } from "./jobs/trialJourney.js";
import { runVendorAiSubscriptionBilling } from "./jobs/vendorAiSubscriptionBilling.js";
import { runVendorAiSubscriptionPaymentSync } from "./jobs/vendorAiSubscriptionPaymentSync.js";
import { runServerConversionSync } from "./jobs/serverConversionSync.js";
import { runGoogleDataManagerConversionSync } from "./jobs/googleDataManagerConversionSync.js";
import { runMarketingBudgetAutopilot } from "./jobs/marketingBudgetAutopilot.js";
import { startMediaVideoBatchRunner } from "./services/media-video-batch.js";
import { startMediaVideoGenerateRunner } from "./services/media-video-generate.js";
import { startDevAgentSupportHandoff } from "./services/dev-agent-support-handoff.js";
import { startVieIntelligenceCycle } from "./services/vie-intelligence-cycle.js";
import { startProductionSentinel } from "./routes/dev_agent_operational_context.js";
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
    startMediaVideoBatchRunner(logger);
    startMediaVideoGenerateRunner(logger);
    startProductionSentinel(logger);
    startMainGovernanceGuard(logger);
    startServerRuntimeSentinel(logger);
    startDevAgentSupportHandoff(logger);
    startVieIntelligenceCycle(logger);

    // Lifecycle de aquisição, trial e assinatura: primeiro reconcilia sinais
    // financeiros já persistidos, depois converge CRM/assinatura e só então
    // gera novas cobranças vencidas. Isso garante que um pagamento recebido
    // nunca espere uma nova rodada de cobrança para reativar o cliente.
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

    // Marketing IA nível 3/4: roda em ciclo conservador de 6h. O próprio job
    // exige política server-side, evidência suficiente, teto humano e cooldown.
    // Executa depois do startup para não bloquear a subida da API.
    const syncMarketingBudgetAutopilot = async () => {
      try {
        await runMarketingBudgetAutopilot(logger);
      } catch (syncErr) {
        logger.error({ err: syncErr }, "marketing-budget-autopilot: unhandled sync error");
      }
    };
    setTimeout(() => { void syncMarketingBudgetAutopilot(); }, 2 * 60 * 1000).unref();
    setInterval(() => { void syncMarketingBudgetAutopilot(); }, 6 * 60 * 60 * 1000).unref();
  });
}

start().catch((err) => {
  logger.error({ err }, "API startup failed");
  process.exit(1);
});