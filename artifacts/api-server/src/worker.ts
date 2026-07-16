import { startScheduler } from "./jobs/scheduler.js";
import { logger } from "./lib/logger.js";

logger.info("worker: iniciando jobs isolados");
startScheduler();
logger.info("worker: scheduler ativo");
