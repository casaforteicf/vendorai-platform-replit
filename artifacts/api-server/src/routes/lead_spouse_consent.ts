import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  leadSpouseConsentTable,
  insertLeadSpouseConsentSchema,
  updateLeadSpouseConsentSchema,
  leadsTable,
  tenantCalendarSettingsTable,
} from "@workspace/db";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";

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
        consentStatus: parsed.data.consentGiven ? "given" : "pending",
        consentGiven: parsed.data.consentGiven ?? false,
        consentGivenAt: parsed.data.consentGiven ? new Date() : null,
        updatedAt: new Date(),
      })
      .returning();
    return res.status(201).json(created);
  }

  const now = new Date();
  const updateData = {
    ...parsed.data,
    consentStatus: parsed.data.consentGiven ? "given" : existing.consentStatus ?? "pending",
    consentGivenAt: parsed.data.consentGiven ? new Date() : existing.consentGivenAt,
    updatedAt: now,
  };

  // If consent was just given and no spouse lead yet, create it
  if (parsed.data.consentGiven && !existing.spouseLeadId) {
    const [tenantSettings] = await db
      .select({ enableSpouseGiftFlow: tenantCalendarSettingsTable.enableSpouseGiftFlow })
      .from(tenantCalendarSettingsTable)
      .where(eq(tenantCalendarSettingsTable.tenantId, lead.tenantId))
      .limit(1);

    if (tenantSettings?.enableSpouseGiftFlow && lead.conjugeNome) {
      const [spouseLead] = await db
        .insert(leadsTable)
        .values({
          tenantId: lead.tenantId,
          nome: lead.conjugeNome,
          telefone: lead.conjugeTelefone ?? null,
          email: lead.conjugeEmail ?? null,
          source: "spouse_referral",
          pipelineExempt: true,
          status: "novo",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (spouseLead) {
        updateData.spouseLeadId = spouseLead.id;
        // Send transparent welcome message to spouse if phone exists
        if (lead.conjugeTelefone && req.log) {
          dispatchAgentBackground({
            tenantId: lead.tenantId,
            leadId: spouseLead.id,
            mensagem: `PROATIVO: Mensagem de boas-vindas para cônjuge de ${lead.nome}.`,
            log: req.log,
            forcedAgent: "relacionamento",
            scenario: {
              type: "spouse_welcome",
              referrerName: lead.nome,
              spouseName: lead.conjugeNome,
            },
          });
        }
      }
    }
  }

  const [updated] = await db
    .update(leadSpouseConsentTable)
    .set(updateData)
    .where(eq(leadSpouseConsentTable.leadId, leadId))
    .returning();

  return res.json(updated);
});

export default router;
