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
import { commerceCheckoutRouter, provisionCheckout } from "./commerce_checkout.js";

const router: IRouter = Router();

// Public self-service acquisition routes. This router is mounted directly in
// app.ts before the protected API router, so LP checkout works without login.
router.use(commerceCheckoutRouter);

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

function checkoutIdFromReference(value: string | null | undefined): string | null {
  if (!value?.startsWith("checkout:")) return null;
  const id = value.slice("checkout:".length).trim();
  return id || null;
}

function canManageTenant(req: Parameters<IRouter["use"]>[0] extends never ? never : any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

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
    .select({ id: billingEventsTable.id, asaasChargeId: billingEventsTable.asaasChargeId, status: billingEventsTable.status })
    .from(billingEventsTable)
    .where(and(
      eq(billingEventsTable.tenantId, subscription.tenantId),
      like(billingEventsTable.mes, `subscription:${subscription.id}:%`),
      inArray(billingEventsTable.status, ["pending", "overdue"]),
    ));

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

router.post("/webhooks/asaas", async (req, res, next) => {
  const expectedToken = process.env.ASAAS_WEBHOOK_ACCESS_TOKEN;
  if (expectedToken && req.header("asaas-access-token") !== expectedToken) {
    res.status(401).json({ error: "Invalid Asaas webhook token" });
    return;
  }

  const parsed = asaasSubscriptionWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Invalid payload" });
    return;
  }

  const { event, payment } = parsed.data;
  const checkoutId = checkoutIdFromReference(payment.externalReference);
  if (checkoutId) {
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      try {
        const result = await provisionCheckout(checkoutId, payment.id);
        res.status(200).json({ ok: true, lifecycle: "commerce_checkout", status: "provisioned", ...result });
      } catch (err) {
        req.log.error({ err, checkoutId, paymentId: payment.id }, "commerce checkout: provisioning failed after payment");
        // ACK keeps Asaas from retry-storming. Session remains failed/recoverable
        // and payment is never lost; ops can reconcile by checkout id.
        res.status(200).json({ ok: true, lifecycle: "commerce_checkout", status: "provisioning_failed" });
      }
      return;
    }
    if (event === "PAYMENT_DELETED" || event === "PAYMENT_CANCELLED") {
      const { commerceCheckoutSessionsTable } = await import("@workspace/db");
      await db.update(commerceCheckoutSessionsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(commerceCheckoutSessionsTable.id, checkoutId));
      res.status(200).json({ ok: true, lifecycle: "commerce_checkout", status: "cancelled" });
      return;
    }
    res.status(200).json({ ok: true, lifecycle: "commerce_checkout", ignored: true });
    return;
  }

  let billingEvent: typeof billingEventsTable.$inferSelect | undefined;
  if (payment.externalReference?.startsWith("subscription:")) {
    [billingEvent] = await db
      .select()
      .from(billingEventsTable)
      .where(eq(billingEventsTable.mes, payment.externalReference))
      .limit(1);
  } else if (!payment.externalReference) {
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
    .select({ id: subscriptionsTable.id, tenantId: subscriptionsTable.tenantId, sourceDealId: subscriptionsTable.sourceDealId, status: subscriptionsTable.status })
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.id, subscriptionId),
      eq(subscriptionsTable.tenantId, resolvedBillingEvent.tenantId),
      eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN),
    ))
    .limit(1);

  if (!subscription) {
    req.log.error({ billingEventId: resolvedBillingEvent.id, subscriptionId }, "vendorai-subscription-webhook: subscription not found");
    res.status(200).json({ ok: true, ignored: true, reason: "subscription_not_found" });
    return;
  }

  req.log.info({ event, paymentId: payment.id, subscriptionId: subscription.id, tenantId: subscription.tenantId }, "vendorai-subscription-webhook: received");

  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    await db.transaction(async (tx) => {
      await tx.update(billingEventsTable).set({ asaasChargeId: payment.id, status: "paid", paidAt: new Date() }).where(eq(billingEventsTable.id, resolvedBillingEvent.id));
      if (subscription.sourceDealId) {
        await tx.update(dealsTable).set({ chargeStatus: "paid", updatedAt: new Date() }).where(eq(dealsTable.id, subscription.sourceDealId));
      }
    });
    res.status(200).json({ ok: true, lifecycle: "subscription", status: "paid" });
    return;
  }

  if (event === "PAYMENT_OVERDUE") {
    if (resolvedBillingEvent.status !== "paid") {
      await db.transaction(async (tx) => {
        await tx.update(billingEventsTable).set({ status: "overdue" }).where(eq(billingEventsTable.id, resolvedBillingEvent.id));
        await tx.update(subscriptionsTable).set({ status: "inadimplente", updatedAt: new Date() }).where(eq(subscriptionsTable.id, subscription.id));
        if (subscription.sourceDealId) {
          await tx.update(dealsTable).set({ chargeStatus: "overdue", updatedAt: new Date() }).where(eq(dealsTable.id, subscription.sourceDealId));
        }
      });
    }
    req.log.warn({ subscriptionId: subscription.id, tenantId: subscription.tenantId, paymentId: payment.id }, "vendorai-subscription-webhook: overdue marked without automatic tenant suspension");
    res.status(200).json({ ok: true, lifecycle: "subscription", status: "overdue" });
    return;
  }

  if (event === "PAYMENT_DELETED" || event === "PAYMENT_CANCELLED") {
    if (resolvedBillingEvent.status !== "paid") {
      await db.update(billingEventsTable).set({ status: "cancelled" }).where(eq(billingEventsTable.id, resolvedBillingEvent.id));
    }
    res.status(200).json({ ok: true, lifecycle: "subscription", status: "cancelled" });
    return;
  }

  res.status(200).json({ ok: true, lifecycle: "subscription", ignored: true });
});

export default router;