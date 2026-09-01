import { Router, type IRouter } from "express";
import { and, eq, inArray, like } from "drizzle-orm";
import { z } from "zod";
import {
  billingEventsTable,
  db,
  dealsTable,
  plansTable,
  subscriptionsTable,
  tenantsTable,
} from "@workspace/db";
import { deleteCharge } from "../lib/asaas.js";
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

function canManageTenant(req: Parameters<IRouter["use"]>[0] extends never ? never : any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

/**
 * Annual upgrade is an explicit commercial choice. It never interrupts the
 * R$497/R$990 promotional cycles: tenant.billingCycle becomes annual now, but
 * the billing worker only applies it after the subscription reaches regular.
 * The annual price snapshot is taken only when the first annual charge is
 * actually generated, preserving the catalog price governing that transition.
 */
router.post("/subscriptions/:id/annual-upgrade", async (req, res) => {
  const subscriptionId = String(req.params.id);
  const [subscription] = await db
    .select({
      id: subscriptionsTable.id,
      tenantId: subscriptionsTable.tenantId,
      plano: subscriptionsTable.plano,
      status: subscriptionsTable.status,
      campaignCode: subscriptionsTable.campaignCode,
      billingPhase: subscriptionsTable.billingPhase,
      proximaCobranca: subscriptionsTable.proximaCobranca,
      billingCycle: tenantsTable.billingCycle,
    })
    .from(subscriptionsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, subscriptionsTable.tenantId))
    .where(eq(subscriptionsTable.id, subscriptionId))
    .limit(1);

  if (!subscription || subscription.campaignCode !== VENDORAI_LAUNCH_CAMPAIGN) {
    res.status(404).json({ error: "VendorAI launch subscription not found" });
    return;
  }
  if (!canManageTenant(req, subscription.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!["trial", "ativa"].includes(subscription.status)) {
    res.status(409).json({ error: "Only trial or active subscriptions can request annual billing" });
    return;
  }

  const [plan] = await db
    .select({ monthlyPriceAnnualCents: plansTable.monthlyPriceAnnualCents })
    .from(plansTable)
    .where(eq(plansTable.slug, subscription.plano))
    .limit(1);
  const annualMonthlyCents = Number(plan?.monthlyPriceAnnualCents ?? 0);
  if (!(annualMonthlyCents > 0)) {
    res.status(409).json({ error: "This plan has no annual price configured" });
    return;
  }

  if (subscription.billingCycle !== "annual") {
    await db
      .update(tenantsTable)
      .set({ billingCycle: "annual", updatedAt: new Date() })
      .where(eq(tenantsTable.id, subscription.tenantId));
  }

  const monthlyEquivalent = annualMonthlyCents / 100;
  res.json({
    ok: true,
    subscriptionId: subscription.id,
    billingCycle: "annual",
    annualMonthlyEquivalent: monthlyEquivalent.toFixed(2),
    annualTotal: (monthlyEquivalent * 12).toFixed(2),
    appliesWhen: subscription.billingPhase === "regular"
      ? "next_unissued_regular_cycle"
      : "regular_phase_after_promotions",
    nextLogicalChargeAt: subscription.proximaCobranca,
  });
});

/**
 * Launch subscriptions are never physically deleted. We first remove unpaid
 * Asaas charges from the active collection flow, then mark local cycles and the
 * subscription cancelled. Paid events remain immutable financial history and
 * the commercial lifecycle emits churn from this logical cancellation.
 */
router.delete("/subscriptions/:id", async (req, res, next) => {
  const subscriptionId = String(req.params.id);
  const [subscription] = await db
    .select({
      id: subscriptionsTable.id,
      tenantId: subscriptionsTable.tenantId,
      campaignCode: subscriptionsTable.campaignCode,
      status: subscriptionsTable.status,
    })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, subscriptionId))
    .limit(1);

  if (!subscription || subscription.campaignCode !== VENDORAI_LAUNCH_CAMPAIGN) {
    next();
    return;
  }
  if (!canManageTenant(req, subscription.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (subscription.status === "cancelada") {
    res.json({ ok: true, subscriptionId: subscription.id, status: "cancelada", alreadyCancelled: true });
    return;
  }

  const activeCycles = await db
    .select({
      id: billingEventsTable.id,
      asaasChargeId: billingEventsTable.asaasChargeId,
      status: billingEventsTable.status,
    })
    .from(billingEventsTable)
    .where(and(
      eq(billingEventsTable.tenantId, subscription.tenantId),
      like(billingEventsTable.mes, `subscription:${subscription.id}:%`),
      inArray(billingEventsTable.status, ["pending", "overdue"]),
    ));

  // Delete remote unpaid charges first. If Asaas rejects any removal (for
  // example because it was paid concurrently), keep the subscription active
  // locally so reconciliation can converge instead of producing split-brain.
  try {
    for (const cycle of activeCycles) {
      if (!cycle.asaasChargeId) continue;
      const result = await deleteCharge(cycle.asaasChargeId);
      if (!result.deleted) throw new Error(`Asaas did not delete charge ${cycle.asaasChargeId}`);
    }
  } catch (err) {
    req.log.error({ err, subscriptionId }, "vendorai-subscription: Asaas charge cancellation failed");
    res.status(502).json({ error: "Could not cancel active Asaas charge; subscription was not cancelled" });
    return;
  }

  await db.transaction(async (tx) => {
    if (activeCycles.length > 0) {
      await tx
        .update(billingEventsTable)
        .set({ status: "cancelled" })
        .where(and(
          eq(billingEventsTable.tenantId, subscription.tenantId),
          like(billingEventsTable.mes, `subscription:${subscription.id}:%`),
          inArray(billingEventsTable.status, ["pending", "overdue"]),
        ));
    }

    await tx
      .update(subscriptionsTable)
      .set({ status: "cancelada", proximaCobranca: null, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, subscription.id));
  });

  res.json({ ok: true, subscriptionId: subscription.id, status: "cancelada" });
});

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

  const cycleKey = billingEvent?.mes;
  if (!billingEvent || !cycleKey || !cycleKey.startsWith("subscription:")) {
    next();
    return;
  }
  const resolvedBillingEvent = billingEvent;

  const subscriptionId = subscriptionIdFromCycleKey(cycleKey);
  if (!subscriptionId) {
    req.log.error({ billingEventId: resolvedBillingEvent.id, cycleKey }, "vendorai-subscription-webhook: invalid cycle key");
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
