import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, billingEventsTable } from "@workspace/db";

const router: IRouter = Router();

// GET /tenants/:tenantId/billing-events — list billing events for a tenant
// Super_admin can access any tenant; tenant users can only access their own.
router.get("/tenants/:tenantId/billing-events", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const events = await db
    .select()
    .from(billingEventsTable)
    .where(eq(billingEventsTable.tenantId, tenantId))
    .orderBy(desc(billingEventsTable.createdAt));

  res.json(events);
});

// PATCH /billing-events/:id — super_admin only: manually update status (e.g. mark paid, cancel)
router.patch("/billing-events/:id", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    res.status(403).json({ error: "Super admin only" });
    return;
  }

  const id = String(req.params["id"]);

  const [existing] = await db
    .select({ id: billingEventsTable.id })
    .from(billingEventsTable)
    .where(eq(billingEventsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Billing event not found" });
    return;
  }

  const { status, paidAt } = req.body as { status?: string; paidAt?: string };
  const updates: Record<string, unknown> = {};
  if (status) updates["status"] = status;
  if (paidAt) updates["paidAt"] = new Date(paidAt);

  const [updated] = await db
    .update(billingEventsTable)
    .set(updates)
    .where(eq(billingEventsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
