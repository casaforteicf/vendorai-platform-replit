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
} from "@workspace/db";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";

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
    possivelDuplicata: match.similar ? "true" : "false",
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
        possivelDuplicata: match.similar ? "true" : "false",
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

  if (req.user?.platformRole === "tenant_seller") {
    conditions.push(eq(leadsTable.assignedTo, req.user.sub));
  }

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

  if (req.user?.platformRole === "tenant_seller" && lead.assignedTo !== req.user.sub) {
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

  if (req.user?.platformRole === "tenant_seller" && existing.assignedTo !== req.user.sub) {
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

  if (req.user?.platformRole === "tenant_seller" && existing.assignedTo !== req.user.sub) {
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
        eq(leadsTable.possivelDuplicata, "true")
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
        .where(eq(leadsTable.id, lead.leadSimilarId))
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

  const tenantId = duplicate.tenantId;

  // Transfer all related data
  await db
    .update(conversationsTable)
    .set({ leadId: targetLeadId, updatedAt: new Date() })
    .where(and(eq(conversationsTable.tenantId, tenantId), eq(conversationsTable.leadId, duplicateId)));

  await db
    .update(messagesTable)
    .set({ leadId: targetLeadId })
    .where(and(eq(messagesTable.tenantId, tenantId), eq(messagesTable.leadId, duplicateId)));

  await db
    .update(dealsTable)
    .set({ leadId: targetLeadId, updatedAt: new Date() })
    .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, duplicateId)));

  await db
    .update(propostasTable)
    .set({ leadId: targetLeadId, updatedAt: new Date() })
    .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, duplicateId)));

  await db
    .update(activitiesTable)
    .set({ leadId: targetLeadId, updatedAt: new Date() })
    .where(and(eq(activitiesTable.tenantId, tenantId), eq(activitiesTable.leadId, duplicateId)));

  await db
    .update(customerIntelligenceTable)
    .set({ leadId: targetLeadId, updatedAt: new Date() })
    .where(and(eq(customerIntelligenceTable.tenantId, tenantId), eq(customerIntelligenceTable.leadId, duplicateId)));

  await db
    .update(agentTasksTable)
    .set({ leadId: targetLeadId })
    .where(and(eq(agentTasksTable.tenantId, tenantId), eq(agentTasksTable.leadId, duplicateId)));

  await db
    .update(agentActionsLogTable)
    .set({ leadId: targetLeadId })
    .where(and(eq(agentActionsLogTable.tenantId, tenantId), eq(agentActionsLogTable.leadId, duplicateId)));

  await db
    .update(consentsTable)
    .set({ leadId: targetLeadId })
    .where(and(eq(consentsTable.tenantId, tenantId), eq(consentsTable.leadId, duplicateId)));

  await db
    .update(intelligenceAnalysisLogTable)
    .set({ leadId: targetLeadId })
    .where(and(eq(intelligenceAnalysisLogTable.tenantId, tenantId), eq(intelligenceAnalysisLogTable.leadId, duplicateId)));

  // Delete the duplicate
  await db.delete(leadsTable).where(eq(leadsTable.id, duplicateId));

  res.json({
    success: true,
    targetLeadId,
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

  if (req.user?.platformRole === "tenant_seller" && existing.assignedTo !== req.user.sub) {
    res.status(403).json({ error: "Access denied to this lead" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({ possivelDuplicata: "false", leadSimilarId: null, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId))
    .returning();

  res.json({ success: true, lead });
});

export default router;
