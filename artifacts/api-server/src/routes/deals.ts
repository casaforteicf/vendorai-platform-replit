import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, dealsTable, insertDealSchema, updateDealSchema } from "@workspace/db";

const router: IRouter = Router();

router.post("/deals", async (req, res) => {
  const parsed = insertDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [deal] = await db.insert(dealsTable).values(parsed.data).returning();
  res.status(201).json(deal);
});

router.get("/tenants/:tenantId/deals", async (req, res) => {
  const deals = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.tenantId, String(req.params.tenantId)))
    .orderBy(dealsTable.createdAt);
  res.json(deals);
});

router.get("/deals/:id", async (req, res) => {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  res.json(deal);
});

router.patch("/deals/:id", async (req, res) => {
  const parsed = updateDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [deal] = await db
    .update(dealsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(dealsTable.id, String(req.params.id)))
    .returning();

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  res.json(deal);
});

router.delete("/deals/:id", async (req, res) => {
  const [deleted] = await db
    .delete(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)))
    .returning({ id: dealsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  res.status(204).send();
});

export default router;
