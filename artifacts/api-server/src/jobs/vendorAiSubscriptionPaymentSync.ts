import { and, desc, eq, like } from "drizzle-orm";
import type { Logger } from "pino";
import {
  billingEventsTable,
  db,
  dealsTable,
  subscriptionsTable,
} from "@workspace/db";
import { VENDORAI_LAUNCH_CAMPAIGN } from "../lib/commercialOffer.js";
import { addCalendarMonth } from "../lib/vendorai-subscription-lifecycle.js";
import { ensureTenantPlanAndCommission } from "../lib/deal-closure-commission.js";

const MAX_SUBSCRIPTIONS_PER_RUN = 200;

function logicalDueFromCycleKey(value: string | null): Date | null {
  if (!value?.startsWith("subscription:")) return null;
  const parts = value.split(":");
  const raw = parts[2];
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reconciles the Asaas webhook result (billing_events) with subscriptions.
 * The webhook remains the financial source of truth; this job only advances
 * product state after the persisted event is paid/overdue.
 */
export async function runVendorAiSubscriptionPaymentSync(log: Logger): Promise<void> {
  const subscriptions = await db
    .select({
      id: subscriptionsTable.id,
      tenantId: subscriptionsTable.tenantId,
      status: subscriptionsTable.status,
      sourceDealId: subscriptionsTable.sourceDealId,
      proximaCobranca: subscriptionsTable.proximaCobranca,
    })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN))
    .limit(MAX_SUBSCRIPTIONS_PER_RUN);

  let activated = 0;
  let overdue = 0;

  for (const sub of subscriptions) {
    if (sub.status === "cancelada") continue;

    try {
      const [event] = await db
        .select()
        .from(billingEventsTable)
        .where(and(
          eq(billingEventsTable.tenantId, sub.tenantId),
          like(billingEventsTable.mes, `subscription:${sub.id}:%`),
        ))
        .orderBy(desc(billingEventsTable.createdAt))
        .limit(1);
      if (!event) continue;

      if (event.status === "overdue") {
        if (sub.status !== "inadimplente") {
          await db.update(subscriptionsTable).set({
            status: "inadimplente",
            updatedAt: new Date(),
          }).where(eq(subscriptionsTable.id, sub.id));
          overdue++;
        }
        continue;
      }

      if (event.status !== "paid") continue;

      const logicalDue = logicalDueFromCycleKey(event.mes) ?? event.dueDate;
      if (!logicalDue) {
        log.error({ subscriptionId: sub.id, billingEventId: event.id }, "vendorai-subscription-payment-sync: ciclo sem data lógica");
        continue;
      }

      const paidAt = event.paidAt ?? new Date();
      const anchor = paidAt > logicalDue ? paidAt : logicalDue;
      const computedNextDue = addCalendarMonth(anchor);
      const shouldAdvance = !sub.proximaCobranca || sub.proximaCobranca.getTime() <= logicalDue.getTime();
      const needsProductActivation = sub.status !== "ativa";

      // Product activation comes first. If it fails, the subscription remains
      // trial/inadimplente and the next sync retries instead of falsely marking
      // financial activation as complete.
      if (sub.sourceDealId && needsProductActivation) {
        await db.update(dealsTable).set({
          chargeStatus: "paid",
          updatedAt: new Date(),
        }).where(eq(dealsTable.id, sub.sourceDealId));
        await ensureTenantPlanAndCommission(sub.sourceDealId, log, { activateTrial: true });
      }

      if (needsProductActivation || shouldAdvance) {
        await db.update(subscriptionsTable).set({
          status: "ativa",
          ...(shouldAdvance ? { proximaCobranca: computedNextDue } : {}),
          updatedAt: new Date(),
        }).where(eq(subscriptionsTable.id, sub.id));
      }

      if (needsProductActivation) activated++;
    } catch (err) {
      log.error({ err, subscriptionId: sub.id, tenantId: sub.tenantId }, "vendorai-subscription-payment-sync: failed");
    }
  }

  if (activated > 0 || overdue > 0) {
    log.info({ activated, overdue }, "vendorai-subscription-payment-sync: complete");
  }
}
