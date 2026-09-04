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
  // Recover paid/overdue webhook events quickly so activation and next due date
  // do not depend on the much larger general scheduler cadence.
  cron.schedule("*/5 * * * *", () => {
    runVendorAiSubscriptionPaymentSync(log).catch((err) => {
      log.error({ err }, "vendorai-subscription-payment-sync: unhandled error");
    });
  });

  // Reconcile due launch subscriptions frequently. The billing worker owns
  // idempotency through the stable subscription:<id>:<logical-date> cycle key
  // and Asaas externalReference recovery, so repeated runs cannot create a new
  // logical cycle simply because a worker restarted.
  cron.schedule("*/15 * * * *", () => {
    runVendorAiSubscriptionBilling(log).catch((err) => {
      log.error({ err }, "vendorai-subscription-billing: unhandled error");
    });
  });

  // Run one reconciliation pass at boot. Billing itself remains feature-flagged
  // and therefore cannot start charging merely because this scheduler is wired.
  runVendorAiSubscriptionPaymentSync(log).catch((err) => {
    log.error({ err }, "vendorai-subscription-payment-sync: startup reconciliation failed");
  });
  runVendorAiSubscriptionBilling(log).catch((err) => {
    log.error({ err }, "vendorai-subscription-billing: startup reconciliation failed");
  });

  log.info("vendorai-subscription-scheduler: active (payment sync 5m, billing 15m)");
}
