import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, funisTable, insertFunilSchema, updateFunilSchema } from "@workspace/db";

const router: IRouter = Router();

router.post("/funis", async (req, res) => {
  const parsed = insertFunilSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [funil] = await db.insert(funisTable).values(parsed.data).returning();
  res.status(201).json(funil);
});

router.get("/tenants/:tenantId/funis", async (req, res) => {
  const funis = await db
    .select()
    .from(funisTable)
    .where(eq(funisTable.tenantId, String(req.params.tenantId)))
    .orderBy(funisTable.createdAt);
  res.json(funis);
});

router.get("/funis/:id", async (req, res) => {
  const [funil] = await db
    .select()
    .from(funisTable)
    .where(eq(funisTable.id, String(req.params.id)));

  if (!funil) {
    res.status(404).json({ error: "Funil not found" });
    return;
  }

  res.json(funil);
});

router.patch("/funis/:id", async (req, res) => {
  const parsed = updateFunilSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [funil] = await db
    .update(funisTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(funisTable.id, String(req.params.id)))
    .returning();

  if (!funil) {
    res.status(404).json({ error: "Funil not found" });
    return;
  }

  res.json(funil);
});

router.delete("/funis/:id", async (req, res) => {
  const [deleted] = await db
    .delete(funisTable)
    .where(eq(funisTable.id, String(req.params.id)))
    .returning({ id: funisTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Funil not found" });
    return;
  }

  res.status(204).send();
});

export default router;
