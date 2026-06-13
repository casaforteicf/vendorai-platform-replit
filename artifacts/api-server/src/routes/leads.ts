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

  const [lead] = await db
    .update(leadsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(leadsTable.id, req.params.id))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.json(lead);
});

router.delete("/leads/:id", async (req, res) => {
  const [deleted] = await db
    .delete(leadsTable)
    .where(eq(leadsTable.id, req.params.id))
    .returning({ id: leadsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.status(204).send();
});

export default router;
