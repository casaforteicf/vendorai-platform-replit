import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, consentsTable, insertConsentSchema } from "@workspace/db";

const router: IRouter = Router();

router.get("/consents", async (req, res) => {
  const consents = await db
    .select()
    .from(consentsTable)
    .orderBy(consentsTable.createdAt);
  res.json(consents);
});

router.post("/consents", async (req, res) => {
  const parsed = insertConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [consent] = await db
    .insert(consentsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(consent);
});

router.get("/tenants/:tenantId/consents", async (req, res) => {
  const consents = await db
    .select()
    .from(consentsTable)
    .where(eq(consentsTable.tenantId, req.params.tenantId))
    .orderBy(consentsTable.createdAt);
  res.json(consents);
});

router.get("/leads/:leadId/consents", async (req, res) => {
  const consents = await db
    .select()
    .from(consentsTable)
    .where(eq(consentsTable.leadId, req.params.leadId))
    .orderBy(consentsTable.createdAt);
  res.json(consents);
});

router.get("/consents/:id", async (req, res) => {
  const [consent] = await db
    .select()
    .from(consentsTable)
    .where(eq(consentsTable.id, req.params.id));

  if (!consent) {
    res.status(404).json({ error: "Consent not found" });
    return;
  }

  res.json(consent);
});

router.delete("/consents/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: consentsTable.id, tenantId: consentsTable.tenantId })
    .from(consentsTable)
    .where(eq(consentsTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Consent not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(consentsTable).where(eq(consentsTable.id, existing.id));

  res.status(204).send();
});

export default router;
