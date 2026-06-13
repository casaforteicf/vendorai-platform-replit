import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  subscriptionsTable,
  insertSubscriptionSchema,
  updateSubscriptionSchema,
} from "@workspace/db";

const router: IRouter = Router();

function isPgCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== "object") return false;
  if ("code" in err) return (err as { code: string }).code === code;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
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
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, String(req.params.tenantId)));

  if (!subscription) {
    res.status(404).json({ error: "Subscription not found for this tenant" });
    return;
  }

  res.json(subscription);
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
