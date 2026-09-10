import { Router, type IRouter } from "express";
import { and, desc, eq, like } from "drizzle-orm";
import {
  billingEventsTable,
  db,
  subscriptionsTable,
  insertSubscriptionSchema,
  updateSubscriptionSchema,
} from "@workspace/db";
import { findChargeByExternalReference } from "../lib/asaas.js";

const router: IRouter = Router();

function isPgCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== "object") return false;
  if ("code" in err) return (err as { code: string }).code === code;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function canReadTenant(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.post("/subscriptions", async (req, res) => {
  const parsed = insertSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  try {
    const [subscription] = await db
      .insert(subscriptionsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(subscription);
  } catch (err) {
    if (isPgCode(err, "23505")) {
      res.status(409).json({ error: "This tenant already has a subscription" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:tenantId/subscription", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canReadTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId));

  if (!subscription) {
    res.json({ status: "sem_plano", subscription: null });
    return;
  }

  res.json(subscription);
});

router.get("/tenants/:tenantId/subscription/renewal-state", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canReadTenant before tenant data access
  const tenantId = String(req.params.tenantId);
  if (!canReadTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId))
    .limit(1);

  if (!subscription) {
    res.json({
      hasSubscription: false,
      actionRequired: false,
      accessMode: "normal",
      reason: "no_subscription",
      paymentUrl: null,
    });
    return;
  }

  const [cycle] = await db
    .select()
    .from(billingEventsTable)
    .where(and(
      eq(billingEventsTable.tenantId, tenantId),
      like(billingEventsTable.mes, `subscription:${subscription.id}:%`),
    ))
    .orderBy(desc(billingEventsTable.createdAt))
    .limit(1);

  const now = new Date();
  const dueAt = cycle?.dueDate ?? subscription.proximaCobranca ?? null;
  const dueReached = Boolean(dueAt && dueAt.getTime() <= now.getTime());
  const overdue = subscription.status === "inadimplente" || cycle?.status === "overdue";
  const pendingDue = cycle?.status === "pending" && dueReached;
  const actionRequired = overdue || pendingDue;

  let paymentUrl: string | null = null;
  let paymentStatus: string | null = cycle?.status ?? null;
  if (cycle?.mes && cycle.asaasChargeId && cycle.status !== "paid" && cycle.status !== "cancelled") {
    try {
      const charge = await findChargeByExternalReference(cycle.mes);
      paymentUrl = charge?.invoiceUrl || charge?.bankSlipUrl || null;
      paymentStatus = charge?.status ?? paymentStatus;
    } catch (err) {
      req.log.warn({ err, tenantId, subscriptionId: subscription.id }, "subscription-renewal-state: Asaas lookup failed");
    }
  }

  res.json({
    hasSubscription: true,
    subscriptionId: subscription.id,
    plan: subscription.plano,
    status: subscription.status,
    billingPhase: subscription.billingPhase,
    billingProvider: subscription.billingProvider,
    nextChargeAt: subscription.proximaCobranca,
    dueAt,
    actionRequired,
    accessMode: actionRequired ? "renewal_required" : "normal",
    reason: overdue ? "overdue" : pendingDue ? "payment_due" : "ok",
    billingEventId: cycle?.id ?? null,
    paymentStatus,
    paymentUrl,
  });
});

router.get("/subscriptions/:id", async (req, res) => {
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, String(req.params.id)));

  if (!subscription) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  if (!canReadTenant(req, subscription.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(subscription);
});

router.patch("/subscriptions/:id", async (req, res) => {
  const parsed = updateSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: subscriptionsTable.id, tenantId: subscriptionsTable.tenantId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [subscription] = await db
    .update(subscriptionsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(subscriptionsTable.id, existing.id))
    .returning();

  res.json(subscription);
});

router.delete("/subscriptions/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: subscriptionsTable.id, tenantId: subscriptionsTable.tenantId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(subscriptionsTable).where(eq(subscriptionsTable.id, existing.id));

  res.status(204).send();
});

export default router;
