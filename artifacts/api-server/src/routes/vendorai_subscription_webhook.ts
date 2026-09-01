import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  billingEventsTable,
  db,
  dealsTable,
  subscriptionsTable,
} from "@workspace/db";
import { VENDORAI_LAUNCH_CAMPAIGN } from "../lib/commercialOffer.js";

const router: IRouter = Router();

const asaasSubscriptionWebhookBody = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    externalReference: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    status: z.string().optional(),
    value: z.number().optional(),
    netValue: z.number().optional(),
  }),
});

function subscriptionIdFromCycleKey(value: string): string | null {
  if (!value.startsWith("subscription:")) return null;
  const parts = value.split(":");
  return parts.length === 3 && parts[1] ? parts[1] : null;
}

/**
 * Handles only the NEW VendorAI commercial subscription lifecycle.
 * Everything else calls next() and remains under the legacy Asaas webhook.
 *
 * This separation is intentional: the legacy handler can suspend old tenant
 * contracts after its grace rule, while launch subscriptions only become
 * `inadimplente` here. Any access suspension for the new lifecycle must be a
 * separate commercial policy, never an accidental reuse of the legacy rule.
 */
router.post("/webhooks/asaas", async (req, res, next) => {
  const expectedToken = process.env.ASAAS_WEBHOOK_ACCESS_TOKEN;
  if (expectedToken && req.header("asaas-access-token") !== expectedToken) {
    res.status(401).json({ error: "Invalid Asaas webhook token" });
    return;
  }

  const parsed = asaasSubscriptionWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    // Preserve the legacy route's existing validation behavior.
    res.status(422).json({ error: "Invalid payload" });
    return;
  }

  const { event, payment } = parsed.data;
  let billingEvent: typeof billingEventsTable.$inferSelect | undefined;

  if (payment.externalReference?.startsWith("subscription:")) {
    [billingEvent] = await db
      .select()
      .from(billingEventsTable)
      .where(eq(billingEventsTable.mes, payment.externalReference))
      .limit(1);
  } else if (!payment.externalReference) {
    // Recovery for providers/webhook versions that omit externalReference but
    // retain the payment id already persisted on the billing event.
    [billingEvent] = await db
      .select()
      .from(billingEventsTable)
      .where(eq(billingEventsTable.asaasChargeId, payment.id))
      .limit(1);
  } else {
    next();
    return;
  }

  if (!billingEvent?.mes.startsWith("subscription:")) {
    next();
    return;
  }
  const resolvedBillingEvent = billingEvent;

  const subscriptionId = subscriptionIdFromCycleKey(resolvedBillingEvent.mes);
  if (!subscriptionId) {
    req.log.error({ billingEventId: resolvedBillingEvent.id, cycleKey: resolvedBillingEvent.mes }, "vendorai-subscription-webhook: invalid cycle key");
    res.status(200).json({ ok: true, ignored: true, reason: "invalid_subscription_cycle" });
    return;
  }

  const [subscription] = await db
    .select({
      id: subscriptionsTable.id,
      tenantId: subscriptionsTable.tenantId,
      sourceDealId: subscriptionsTable.sourceDealId,
      status: subscriptionsTable.status,
    })
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.id, subscriptionId),
      eq(subscriptionsTable.tenantId, resolvedBillingEvent.tenantId),
      eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN),
    ))
    .limit(1);

  if (!subscription) {
    // Fail safe: this is explicitly a subscription:* event, so never fall
    // through to legacy suspension logic if its subscription cannot be found.
    req.log.error({ billingEventId: resolvedBillingEvent.id, subscriptionId }, "vendorai-subscription-webhook: subscription not found");
    res.status(200).json({ ok: true, ignored: true, reason: "subscription_not_found" });
    return;
  }

  req.log.info({
    event,
    paymentId: payment.id,
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
  }, "vendorai-subscription-webhook: received");

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    await db.transaction(async (tx) => {
      await tx
        .update(billingEventsTable)
        .set({
          asaasChargeId: payment.id,
          status: "paid",
          paidAt: new Date(),
        })
        .where(eq(billingEventsTable.id, resolvedBillingEvent.id));

      if (subscription.sourceDealId) {
        await tx
          .update(dealsTable)
          .set({ chargeStatus: "paid", updatedAt: new Date() })
          .where(eq(dealsTable.id, subscription.sourceDealId));
      }
    });

    // Product/account activation is deliberately reconciled by
    // runVendorAiSubscriptionPaymentSync(), the single canonical lifecycle
    // path that also preserves the exact trial tenant and advances billing.
    res.status(200).json({ ok: true, lifecycle: "subscription", status: "paid" });
    return;
  }

  if (event === "PAYMENT_OVERDUE") {
    // Never downgrade a payment that was already confirmed if provider events
    // arrive out of order.
    if (resolvedBillingEvent.status !== "paid") {
      await db.transaction(async (tx) => {
        await tx
          .update(billingEventsTable)
          .set({ status: "overdue" })
          .where(eq(billingEventsTable.id, resolvedBillingEvent.id));

        await tx
          .update(subscriptionsTable)
          .set({ status: "inadimplente", updatedAt: new Date() })
          .where(eq(subscriptionsTable.id, subscription.id));

        if (subscription.sourceDealId) {
          await tx
            .update(dealsTable)
            .set({ chargeStatus: "overdue", updatedAt: new Date() })
            .where(eq(dealsTable.id, subscription.sourceDealId));
        }
      });
    }

    req.log.warn({
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      paymentId: payment.id,
    }, "vendorai-subscription-webhook: overdue marked without automatic tenant suspension");

    res.status(200).json({ ok: true, lifecycle: "subscription", status: "overdue" });
    return;
  }

  if (event === "PAYMENT_DELETED" || event === "PAYMENT_CANCELLED") {
    if (resolvedBillingEvent.status !== "paid") {
      await db
        .update(billingEventsTable)
        .set({ status: "cancelled" })
        .where(eq(billingEventsTable.id, resolvedBillingEvent.id));
    }
    res.status(200).json({ ok: true, lifecycle: "subscription", status: "cancelled" });
    return;
  }

  // Subscription event recognized, but no state transition is required for
  // this Asaas event type. ACK here so it cannot fall into legacy behavior.
  res.status(200).json({ ok: true, lifecycle: "subscription", ignored: true });
});

export default router;
