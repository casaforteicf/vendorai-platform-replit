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
import type { Logger } from "pino";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { leadRegistrationMetadata, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";

const router: IRouter = Router();

type ConsentLead = typeof leadsTable.$inferSelect;

// Creates the spouse referral lead and sends the transparent welcome message
// when the spouse-gift flow is enabled for the tenant. Returns the new spouse
// lead id (or null when no lead was created). Shared by POST and PATCH so the
// first-time consent save triggers the same flow as later updates.
async function handleSpouseConsentGranted(
  lead: ConsentLead,
  now: Date,
  log?: Logger,
): Promise<string | null> {
  const [tenantSettings] = await db
    .select({ enableSpouseGiftFlow: tenantCalendarSettingsTable.enableSpouseGiftFlow })
    .from(tenantCalendarSettingsTable)
    .where(eq(tenantCalendarSettingsTable.tenantId, lead.tenantId))
    .limit(1);

  if (!tenantSettings?.enableSpouseGiftFlow || !lead.conjugeNome) {
    return null;
  }

  const duplicate = await findLeadByDedup(
    lead.tenantId,
    lead.conjugeTelefone ?? null,
    null,
    lead.conjugeNome,
  );

  let spouseLead: typeof leadsTable.$inferSelect | undefined;
  if (duplicate.found) {
    [spouseLead] = await db
      .update(leadsTable)
      .set({
        telefone: duplicate.lead.telefone ?? storePhone(lead.conjugeTelefone),
        email: duplicate.lead.email ?? normalizeLeadEmail(lead.conjugeEmail),
        metadata: leadRegistrationMetadata(duplicate.lead.metadata, {
          entryChannel: "parceiro",
          entrySource: "spouse_referral",
          details: { referrerLeadId: lead.id },
        }),
        updatedAt: now,
      })
      .where(eq(leadsTable.id, duplicate.lead.id))
      .returning();
  } else {
    [spouseLead] = await db
      .insert(leadsTable)
      .values({
        tenantId: lead.tenantId,
        nome: normalizeLeadName(lead.conjugeNome, "Contato indicado"),
        telefone: storePhone(lead.conjugeTelefone),
        email: normalizeLeadEmail(lead.conjugeEmail),
        source: "spouse_referral",
        pipelineExempt: true,
        status: "novo",
        metadata: leadRegistrationMetadata(null, {
          entryChannel: "parceiro",
          entrySource: "spouse_referral",
          details: { referrerLeadId: lead.id },
        }),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  }

  if (!spouseLead) {
    return null;
  }

  // Send transparent welcome message to spouse if phone exists
  if (lead.conjugeTelefone && log) {
    dispatchAgentBackground({
      tenantId: lead.tenantId,
      leadId: spouseLead.id,
      mensagem: `PROATIVO: Mensagem de boas-vindas para cônjuge de ${lead.nome}.`,
      log,
      forcedAgent: "relacionamento",
      scenario: {
        type: "spouse_welcome",
        referrerName: lead.nome,
        spouseName: lead.conjugeNome,
      },
    });
  }

  return spouseLead.id;
}

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

  const now = new Date();
  let spouseLeadId: string | null = null;
  if (parsed.data.consentGiven) {
    spouseLeadId = await handleSpouseConsentGranted(lead, now, req.log);
  }

  const [consent] = await db
    .insert(leadSpouseConsentTable)
    .values({
      ...parsed.data,
      tenantId: lead.tenantId,
      leadId,
      consentStatus: parsed.data.consentGiven ? "given" : parsed.data.consentStatus ?? "pending",
      consentGivenAt: parsed.data.consentGiven ? now : parsed.data.consentGivenAt ?? null,
      ...(spouseLeadId ? { spouseLeadId } : {}),
    })
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

  const now = new Date();

  if (!existing) {
    const spouseLeadId = parsed.data.consentGiven
      ? await handleSpouseConsentGranted(lead, now, req.log)
      : null;

    const [created] = await db
      .insert(leadSpouseConsentTable)
      .values({
        tenantId: lead.tenantId,
        leadId,
        consentStatus: parsed.data.consentGiven ? "given" : "pending",
        consentGiven: parsed.data.consentGiven ?? false,
        consentGivenAt: parsed.data.consentGiven ? now : null,
        ...(spouseLeadId ? { spouseLeadId } : {}),
        updatedAt: now,
      })
      .returning();
    return res.status(201).json(created);
  }

  const updateData: Record<string, unknown> = {
    ...parsed.data,
    consentStatus: parsed.data.consentGiven ? "given" : existing.consentStatus ?? "pending",
    consentGivenAt: parsed.data.consentGiven ? now : existing.consentGivenAt,
    updatedAt: now,
  };

  // If consent was just given and no spouse lead yet, create it
  if (parsed.data.consentGiven && !existing.spouseLeadId) {
    const spouseLeadId = await handleSpouseConsentGranted(lead, now, req.log);
    if (spouseLeadId) {
      updateData["spouseLeadId"] = spouseLeadId;
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
