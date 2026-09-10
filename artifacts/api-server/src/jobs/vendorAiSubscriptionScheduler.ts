import cron from "node-cron";
import type { Logger } from "pino";
import { runVendorAiSubscriptionBilling } from "./vendorAiSubscriptionBilling.js";
import { runVendorAiSubscriptionPaymentSync } from "./vendorAiSubscriptionPaymentSync.js";
import { runVendorAiSelfServiceSubscriptionBilling } from "./vendorAiSelfServiceSubscriptionBilling.js";

/**
 * Scheduler unificado de assinaturas VendorAI.
 *
 * O worker de lançamento mantém a cadência histórica; o worker self-service
 * cuida das assinaturas originadas por LP/checkout. Ambos permanecem atrás da
 * mesma feature flag de billing e usam a conta plataforma Asaas.
 */
export function startVendorAiSubscriptionScheduler(log: Logger): void {
  cron.schedule("*/5 * * * *", () => {
    runVendorAiSubscriptionPaymentSync(log).catch((err) => {
      log.error({ err }, "vendorai-subscription-payment-sync: unhandled error");
    });
  });

  cron.schedule("*/15 * * * *", () => {
    runVendorAiSubscriptionBilling(log).catch((err) => {
      log.error({ err }, "vendorai-subscription-billing: unhandled error");
    });
    runVendorAiSelfServiceSubscriptionBilling(log).catch((err) => {
      log.error({ err }, "vendorai-selfservice-billing: unhandled error");
    });
  });

  runVendorAiSubscriptionPaymentSync(log).catch((err) => {
    log.error({ err }, "vendorai-subscription-payment-sync: startup reconciliation failed");
  });
  runVendorAiSubscriptionBilling(log).catch((err) => {
    log.error({ err }, "vendorai-subscription-billing: startup reconciliation failed");
  });
  runVendorAiSelfServiceSubscriptionBilling(log).catch((err) => {
    log.error({ err }, "vendorai-selfservice-billing: startup reconciliation failed");
  });

  log.info("vendorai-subscription-scheduler: active (payment sync 5m, billing launch+self-service 15m)");
}
