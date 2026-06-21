import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  leadSpouseConsentTable,
  insertLeadSpouseConsentSchema,
  updateLeadSpouseConsentSchema,
  leadsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/leads/:leadId/spouse-consent", async (req, res) => {
  const leadId = String(req.params["leadId"]);

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  if (req.user?.tenantId !== lead.tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const [consent] = await db
    .select()
    .from(leadSpouseConsentTable)
    .where(eq(leadSpouseConsentTable.leadId, leadId))
    .limit(1);

  if (!consent) {
    return res.status(404).json({ error: "Not found" });
  }

  return res.json(consent);
});

router.post("/leads/:leadId/spouse-consent", async (req, res) => {
  const leadId = String(req.params["leadId"]);

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  if (req.user?.tenantId !== lead.tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const parsed = insertLeadSpouseConsentSchema.safeParse({ ...req.body, tenantId: lead.tenantId, leadId });
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  const [existing] = await db
    .select()
    .from(leadSpouseConsentTable)
    .where(eq(leadSpouseConsentTable.leadId, leadId))
    .limit(1);

  if (existing) {
    return res.status(409).json({ error: "Consent already exists for this lead" });
  }

  const [consent] = await db
    .insert(leadSpouseConsentTable)
    .values({ ...parsed.data, tenantId: lead.tenantId, leadId })
    .returning();

  return res.status(201).json(consent);
});

router.patch("/leads/:leadId/spouse-consent", async (req, res) => {
  const leadId = String(req.params["leadId"]);

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  if (!lead) {
    return res.status(404).json({ error: "Lead not found" });
  }

  if (req.user?.tenantId !== lead.tenantId && req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const parsed = updateLeadSpouseConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.message });
  }

  const [existing] = await db
    .select()
    .from(leadSpouseConsentTable)
    .where(eq(leadSpouseConsentTable.leadId, leadId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(leadSpouseConsentTable)
      .values({
        tenantId: lead.tenantId,
        leadId,
        consentGiven: parsed.data.consentGiven ?? false,
        consentGivenAt: parsed.data.consentGiven ? new Date() : null,
        updatedAt: new Date(),
      })
      .returning();
    return res.status(201).json(created);
  }

  const [updated] = await db
    .update(leadSpouseConsentTable)
    .set({
      ...parsed.data,
      consentGivenAt: parsed.data.consentGiven ? new Date() : existing.consentGivenAt,
      updatedAt: new Date(),
    })
    .where(eq(leadSpouseConsentTable.leadId, leadId))
    .returning();

  return res.json(updated);
});

export default router;
