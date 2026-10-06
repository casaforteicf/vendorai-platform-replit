import { startScheduler } from "./jobs/scheduler.js";
import { startVendorAiSubscriptionScheduler } from "./jobs/vendorAiSubscriptionScheduler.js";
import { logger } from "./lib/logger.js";
import { startEmailInboxWorker } from "./services/email-inbox-worker.js";
import { startIntegrationTokenGuardian } from "./services/integration-token-guardian.js";

logger.info("worker: iniciando jobs isolados");
startScheduler(logger);
startVendorAiSubscriptionScheduler(logger);
startEmailInboxWorker(logger);
startIntegrationTokenGuardian(logger);
logger.info("worker: scheduler ativo");
