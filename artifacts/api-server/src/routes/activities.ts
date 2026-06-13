import { Router, type IRouter } from "express";
import { and, eq, lt, isNotNull } from "drizzle-orm";
import {
  db,
  activitiesTable,
  insertActivitySchema,
  updateActivitySchema,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/activities", async (req, res) => {
  const parsed = insertActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(activity);
});

router.get("/tenants/:tenantId/activities", async (req, res) => {
  const { leadId, dealId, status } = req.query as Record<string, string | undefined>;

  const conditions = [eq(activitiesTable.tenantId, String(req.params.tenantId))];
  if (leadId) conditions.push(eq(activitiesTable.leadId, leadId));
  if (dealId) conditions.push(eq(activitiesTable.dealId, dealId));
  if (status)
    conditions.push(
      eq(activitiesTable.status, status as typeof activitiesTable.status._.data)
    );

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(and(...conditions))
    .orderBy(activitiesTable.dataVencimento, activitiesTable.createdAt);

  res.json(activities);
});

router.get("/tenants/:tenantId/activities/overdue", async (req, res) => {
  const activities = await db
    .select()
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.tenantId, String(req.params.tenantId)),
        eq(activitiesTable.status, "pendente"),
        isNotNull(activitiesTable.dataVencimento),
        lt(activitiesTable.dataVencimento, new Date())
      )
    )
    .orderBy(activitiesTable.dataVencimento);

  res.json(activities);
});

router.get("/activities/:id", async (req, res) => {
  const [activity] = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.id, String(req.params.id)));

  if (!activity) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && activity.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(activity);
});

router.patch("/activities/:id", async (req, res) => {
  const parsed = updateActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: activitiesTable.id, tenantId: activitiesTable.tenantId })
    .from(activitiesTable)
    .where(eq(activitiesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const data = { ...parsed.data, updatedAt: new Date() };

  // Auto-set concluidaEm when status transitions to "concluida"
  if (parsed.data.status === "concluida" && !parsed.data.concluidaEm) {
    data.concluidaEm = new Date();
  }

  const [activity] = await db
    .update(activitiesTable)
    .set(data)
    .where(eq(activitiesTable.id, existing.id))
    .returning();

  res.json(activity);
});

router.delete("/activities/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: activitiesTable.id, tenantId: activitiesTable.tenantId })
    .from(activitiesTable)
    .where(eq(activitiesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(activitiesTable).where(eq(activitiesTable.id, existing.id));

  res.status(204).send();
});

export default router;
