import cron from "node-cron";
import type { Logger } from "pino";
import { runVendorAiSubscriptionBilling } from "./vendorAiSubscriptionBilling.js";
import { runVendorAiSubscriptionPaymentSync } from "./vendorAiSubscriptionPaymentSync.js";

/**
 * Starts only the VendorAI launch-subscription lifecycle jobs.
 *
 * Billing stays fail-closed behind VENDORAI_SUBSCRIPTION_BILLING_ENABLED inside
 * runVendorAiSubscriptionBilling(). Payment reconciliation is safe to run even
 * while charge creation is disabled because it only reflects persisted Asaas
 * webhook state into the subscription/product lifecycle.
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
  });

  runVendorAiSubscriptionPaymentSync(log).catch((err) => {
    log.error({ err }, "vendorai-subscription-payment-sync: startup reconciliation failed");
  });
  runVendorAiSubscriptionBilling(log).catch((err) => {
    log.error({ err }, "vendorai-subscription-billing: startup reconciliation failed");
  });

  log.info("vendorai-subscription-scheduler: active (payment sync 5m, billing 15m)");
}
