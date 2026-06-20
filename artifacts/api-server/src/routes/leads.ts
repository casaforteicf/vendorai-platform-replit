import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  leadsTable,
  insertLeadSchema,
  updateLeadSchema,
  conversationsTable,
  messagesTable,
  dealsTable,
  propostasTable,
  activitiesTable,
  customerIntelligenceTable,
  agentTasksTable,
  agentActionsLogTable,
  consentsTable,
  intelligenceAnalysisLogTable,
  leadBriefingsTable,
  insertLeadBriefingSchema,
} from "@workspace/db";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { buildUserFunctionFilter, requireAdminOrUserFunction, type UserFunction } from "../middlewares/auth.js";

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

  const data = parsed.data;

  // Dedup check
  const match = await findLeadByDedup(data.tenantId, data.telefone ?? null, data.documento ?? null, data.nome);

  if (match.found) {
    res.status(409).json({
      error: "Lead already exists",
      isDuplicate: true,
      lead: match.lead,
      matchBy: match.matchBy,
    });
    return;
  }

  const [lead] = await db.insert(leadsTable).values({
    ...data,
    telefone: storePhone(data.telefone),
    documento: data.documento ? data.documento.replace(/\D/g, "") : data.documento,
    possivelDuplicata: match.similar ? true : false,
    leadSimilarId: match.similar?.id ?? null,
  }).returning();
  res.status(201).json(lead);
});

const importLeadRowSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  telefone: z.string().optional().nullable(),
  documento: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
});

const importLeadsBodySchema = z.object({
  leads: z.array(importLeadRowSchema).min(1).max(500),
});

router.post("/tenants/:tenantId/leads/import", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = importLeadsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { leads } = parsed.data;
  let imported = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < leads.length; i++) {
    const row = leads[i]!;
    try {
      const match = await findLeadByDedup(tenantId, row.telefone, row.documento, row.nome);
      if (match.found) {
        // Skip duplicate — log as warning but don't count as error
        errors.push({ row: i + 1, message: `Duplicate: matched by ${match.matchBy} to lead ${match.lead.id}` });
        continue;
      }
      await db.insert(leadsTable).values({
        tenantId,
        nome: row.nome,
        telefone: storePhone(row.telefone),
        documento: row.documento ? row.documento.replace(/\D/g, "") : null,
        email: row.email || null,
        endereco: row.endereco || null,
        instagramHandle: row.instagram || null,
        possivelDuplicata: match.similar ? true : false,
        leadSimilarId: match.similar?.id ?? null,
      });
      imported++;
    } catch (err) {
      errors.push({ row: i + 1, message: String(err) });
    }
  }

  res.json({ imported, errors });
});

router.get("/tenants/:tenantId/leads", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const conditions = [eq(leadsTable.tenantId, tenantId)];
  conditions.push(...buildUserFunctionFilter(req, leadsTable));

  const leads = await db
    .select()
    .from(leadsTable)
    .where(and(...conditions))
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

  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && userFn === "vendedor" && lead.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
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
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
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

  const isAdmin2 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn2 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin2 && userFn2 === "vendedor" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
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
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
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

  const isAdmin3 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn3 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin3 && userFn3 === "vendedor" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  await db.delete(leadsTable).where(eq(leadsTable.id, existing.id));

  res.status(204).send();
});

// ── GET /tenants/:tenantId/leads/duplicates ─────────────────────────────────
// List leads flagged as "possible duplicates" for this tenant.
router.get("/tenants/:tenantId/leads/duplicates", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const flagged = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.tenantId, tenantId),
        eq(leadsTable.possivelDuplicata, true)
      )
    )
    .orderBy(leadsTable.createdAt);

  // Load similar lead for each
  const withSimilar = await Promise.all(
    flagged.map(async (lead) => {
      if (!lead.leadSimilarId) return { lead, similar: null };
      const [similar] = await db
        .select()
        .from(leadsTable)
        .where(and(eq(leadsTable.id, lead.leadSimilarId), eq(leadsTable.tenantId, tenantId)))
        .limit(1);
      return { lead, similar: similar ?? null };
    })
  );

  res.json(withSimilar);
});

// ── POST /leads/:id/merge ─────────────────────────────────────────────────
// Merge a duplicate lead into the target lead. All related data (conversations,
// messages, deals, propostas, activities, intelligence, tasks, logs, consents)
// is transferred to the target lead. The duplicate lead is then deleted.
const mergeLeadSchema = z.object({
  targetLeadId: z.string().uuid(),
});

router.post("/leads/:id/merge", async (req, res) => {
  const duplicateId = String(req.params.id);
  const parsed = mergeLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { targetLeadId } = parsed.data;

  if (duplicateId === targetLeadId) {
    res.status(422).json({ error: "Cannot merge a lead into itself" });
    return;
  }

  // Load both leads and verify same tenant + auth
  const [duplicate] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, duplicateId));
  const [target] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, targetLeadId));

  if (!duplicate || !target) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (duplicate.tenantId !== target.tenantId) {
    res.status(422).json({ error: "Leads belong to different tenants" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== duplicate.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  // Tenant sellers may only merge leads that are assigned to them
  const isAdminMerge = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFnMerge = req.user?.userFunction as UserFunction | undefined;
  if (!isAdminMerge && userFnMerge === "vendedor") {
    if (duplicate.assignedTo !== req.user?.sub || target.assignedTo !== req.user?.sub) {
      res.status(403).json({ error: "Access denied: seller can only merge leads assigned to them" });
      return;
    }
  }

  const tenantId = duplicate.tenantId;

    // Transfer all related data atomically
  const [mergedLead] = await db.transaction(async (tx) => {
    await tx
      .update(conversationsTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(conversationsTable.tenantId, tenantId), eq(conversationsTable.leadId, duplicateId)));

    await tx
      .update(messagesTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(messagesTable.tenantId, tenantId), eq(messagesTable.leadId, duplicateId)));

    await tx
      .update(dealsTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, duplicateId)));

    await tx
      .update(propostasTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, duplicateId)));

    await tx
      .update(activitiesTable)
      .set({ leadId: targetLeadId, updatedAt: new Date() })
      .where(and(eq(activitiesTable.tenantId, tenantId), eq(activitiesTable.leadId, duplicateId)));

    // customerIntelligenceTable.leadId is unique(): one row per lead.
    // If both leads have rows, we must delete the duplicate row before any
    // update to avoid a unique-constraint violation.
    const [targetIntel] = await tx
      .select({ id: customerIntelligenceTable.id })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tenantId), eq(customerIntelligenceTable.leadId, targetLeadId)))
      .limit(1);
    const [dupIntel] = await tx
      .select({ id: customerIntelligenceTable.id })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tenantId), eq(customerIntelligenceTable.leadId, duplicateId)))
      .limit(1);
    if (dupIntel) {
      if (targetIntel) {
        // Target already has intel — delete duplicate row and keep target.
        await tx
          .delete(customerIntelligenceTable)
          .where(eq(customerIntelligenceTable.id, dupIntel.id));
      } else {
        // Target has no intel — reassign duplicate row to target.
        await tx
          .update(customerIntelligenceTable)
          .set({ leadId: targetLeadId, updatedAt: new Date() })
          .where(eq(customerIntelligenceTable.id, dupIntel.id));
      }
    }

    await tx
      .update(agentTasksTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.leadId, duplicateId)));

    await tx
      .update(agentActionsLogTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(agentActionsLogTable.tenantId, tenantId), eq(agentActionsLogTable.leadId, duplicateId)));

    await tx
      .update(consentsTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(consentsTable.tenantId, tenantId), eq(consentsTable.leadId, duplicateId)));

    await tx
      .update(intelligenceAnalysisLogTable)
      .set({ leadId: targetLeadId })
      .where(and(eq(intelligenceAnalysisLogTable.tenantId, tenantId), eq(intelligenceAnalysisLogTable.leadId, duplicateId)));

    // Delete the duplicate
    await tx.delete(leadsTable).where(eq(leadsTable.id, duplicateId));

    // Return the merged (target) lead
    return tx.select().from(leadsTable).where(eq(leadsTable.id, targetLeadId)).limit(1);
  });

  res.json({
    success: true,
    lead: mergedLead,
    duplicateId,
    transferredTables: [
      "conversations",
      "messages",
      "deals",
      "propostas",
      "activities",
      "customer_intelligence",
      "agent_tasks",
      "agent_actions_log",
      "consents",
      "intelligence_analysis_log",
    ],
  });
});

// ── POST /leads/:id/dismiss-duplicate ─────────────────────────────────
// Remove the duplicate flag from a lead (user decided to keep them separate).
router.post("/leads/:id/dismiss-duplicate", async (req, res) => {
  const leadId = String(req.params.id);

  const [existing] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin4 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn4 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin4 && userFn4 === "vendedor" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({ possivelDuplicata: false, leadSimilarId: null, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId))
    .returning();

  res.json({ success: true, lead });
});

// ── GET /tenants/:tenantId/lead-briefings ─────────────────────────────────
router.get("/tenants/:tenantId/lead-briefings", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const briefings = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.tenantId, tenantId));

  res.json(briefings);
});

// ── GET /leads/:leadId/briefing ────────────────────────────────────────────
router.get("/leads/:leadId/briefing", async (req, res) => {
  const leadId = String(req.params.leadId);

  const [lead] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && userFn === "vendedor" && lead.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const [briefing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.leadId, leadId));

  res.json(briefing ?? null);
});

// ── PUT /leads/:leadId/briefing ────────────────────────────────────────────
// Upsert: create if not exists, update if exists
router.put("/leads/:leadId/briefing", async (req, res) => {
  const leadId = String(req.params.leadId);

  const [lead] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(eq(leadsTable.id, leadId));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && lead.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && userFn === "vendedor" && lead.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const parsed = insertLeadBriefingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const tenantId = lead.tenantId;
  const approachedBy = data.approachedBy ?? req.user?.sub ?? null;

  const [existing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(eq(leadBriefingsTable.leadId, leadId));

  if (existing) {
    const [updated] = await db
      .update(leadBriefingsTable)
      .set({
        channelsUsed: data.channelsUsed ?? existing.channelsUsed,
        contactType: data.contactType ?? existing.contactType,
        approachedBy: approachedBy ?? existing.approachedBy,
        contactDate: data.contactDate ?? existing.contactDate,
        situationAnswers: data.situationAnswers ?? existing.situationAnswers,
        problemAnswers: data.problemAnswers ?? existing.problemAnswers,
        problemMinimized: data.problemMinimized ?? existing.problemMinimized,
        implicationAnswers: data.implicationAnswers ?? existing.implicationAnswers,
        implicationEstimatedValue: data.implicationEstimatedValue ?? existing.implicationEstimatedValue,
        needAnswers: data.needAnswers ?? existing.needAnswers,
        needThermometer: data.needThermometer ?? existing.needThermometer,
        objections: data.objections ?? existing.objections,
        prospectSize: data.prospectSize ?? existing.prospectSize,
        presentationSent: data.presentationSent ?? existing.presentationSent,
        presentationSentDate: data.presentationSentDate ?? existing.presentationSentDate,
        presentationLink: data.presentationLink ?? existing.presentationLink,
        nextStepType: data.nextStepType ?? existing.nextStepType,
        nextStepDate: data.nextStepDate ?? existing.nextStepDate,
        freeNotes: data.freeNotes ?? existing.freeNotes,
        updatedAt: new Date(),
      })
      .where(eq(leadBriefingsTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(leadBriefingsTable)
      .values({
        tenantId,
        leadId,
        channelsUsed: data.channelsUsed,
        contactType: data.contactType,
        approachedBy,
        contactDate: data.contactDate,
        situationAnswers: data.situationAnswers,
        problemAnswers: data.problemAnswers,
        problemMinimized: data.problemMinimized,
        implicationAnswers: data.implicationAnswers,
        implicationEstimatedValue: data.implicationEstimatedValue,
        needAnswers: data.needAnswers,
        needThermometer: data.needThermometer,
        objections: data.objections,
        prospectSize: data.prospectSize,
        presentationSent: data.presentationSent,
        presentationSentDate: data.presentationSentDate,
        presentationLink: data.presentationLink,
        nextStepType: data.nextStepType,
        nextStepDate: data.nextStepDate,
        freeNotes: data.freeNotes,
      })
      .returning();
    res.status(201).json(created);
  }
});

export default router;
