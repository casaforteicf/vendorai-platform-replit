import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, leadsTable, insertLeadSchema, updateLeadSchema } from "@workspace/db";

const router: IRouter = Router();

router.get("/leads", async (req, res) => {
  const leads = await db
    .select()
    .from(leadsTable)
    .orderBy(leadsTable.createdAt);
  res.json(leads);
});

router.post("/leads", async (req, res) => {
  const parsed = insertLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [lead] = await db.insert(leadsTable).values(parsed.data).returning();
  res.status(201).json(lead);
});

router.get("/tenants/:tenantId/leads", async (req, res) => {
  const leads = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.tenantId, req.params.tenantId))
    .orderBy(leadsTable.createdAt);
  res.json(leads);
});

router.get("/leads/:id", async (req, res) => {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.json(lead);
});

router.patch("/leads/:id", async (req, res) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId })
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(leadsTable.id, existing.id))
    .returning();

  res.json(lead);
});

router.delete("/leads/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId })
    .from(leadsTable)
    .where(eq(leadsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(leadsTable).where(eq(leadsTable.id, existing.id));

  res.status(204).send();
});

export default router;
