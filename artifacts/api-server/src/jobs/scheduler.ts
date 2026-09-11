import type { Logger } from "pino";
import { startScheduler as startLegacyScheduler } from "./schedulerLegacy.js";
import { startCommercialCampaignScheduler } from "./commercialCampaignScheduler.js";
import { startVisitorIdentityStitchingScheduler } from "./visitorIdentityStitching.js";

/**
 * Scheduler composto.
 *
 * - Visitor stitching une sessões first-party recorrentes ao lead depois da identificação.
 * - Campanhas comerciais rodam à :14 e resolvem leadIds/audiências comportamentais.
 * - Scheduler legado continua à :15 para filtros clássicos de Customer Intelligence
 *   e todos os demais jobs existentes.
 */
export function startScheduler(log: Logger): void {
  startVisitorIdentityStitchingScheduler(log);
  startCommercialCampaignScheduler(log);
  startLegacyScheduler(log);
}
