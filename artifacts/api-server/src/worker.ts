import { startScheduler } from "./jobs/scheduler.js";
import { startVendorAiSubscriptionScheduler } from "./jobs/vendorAiSubscriptionScheduler.js";
import { logger } from "./lib/logger.js";

logger.info("worker: iniciando jobs isolados");
startScheduler(logger);
startVendorAiSubscriptionScheduler(logger);
logger.info("worker: scheduler ativo");
