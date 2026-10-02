import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  installationChecklistTemplatesTable,
  installationVisitsTable,
  installationChecklistItemsTable,
  installationOccurrencesTable,
  insertInstallationTemplateSchema,
  updateInstallationTemplateSchema,
  updateInstallationVisitSchema,
  updateInstallationChecklistItemSchema,
  workCardsTable,
  workCardAttachmentsTable,
  tenantsTable,
  leadsTable,
  dealsTable,
  usersTable,
  activitiesTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  generateInstallationAcceptancePdf,
  type InstallationAcceptanceSnapshot,
} from "../lib/pdf-installation-acceptance.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";

const router: IRouter = Router();

const DONE_STATUSES = new Set(["installed", "verified", "instalado", "conferido"]);
const EXCEPTION_STATUSES = new Set([
  "instalado_com_ressalva",
  "nao_instalado",
  "peca_faltante",
  "produto_avariado",
  "divergencia_medida",
  "necessita_retorno",
]);

function canAccessTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function isAdmin(req: any) {
  return req.user?.platformRole === "super_admin"
    || req.user?.platformRole === "tenant_admin"
    || req.user?.userFunction === "administrador";
}

function canAccessCard(req: any, card: typeof workCardsTable.$inferSelect) {
  if (!canAccessTenant(req, card.tenantId)) return false;
  if (isAdmin(req) || req.user?.actorType === "ai" || req.user?.actorType === "system") return true;
  if (!card.responsavelId) return true;
  return card.responsavelId === req.user?.sub;
}

function normalizeItemKey(source: Record<string, unknown>, index: number) {
  return String(
    source.produtoId
      || source.productId
      || source.sku
      || source.codigo
      || source.nome
      || source.name
      || `item_${index + 1}`,
  ).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 100);
}

function installationAttributes(source: Record<string, unknown>) {
  const hidden = new Set([
    "nome", "name", "descricao", "produto", "quantidade", "quantity", "qtd",
    "produtoId", "productId", "sku", "propostaItemIndex", "quantidadePedido",
    "preco", "precoUnitario", "valor", "valorUnitario", "subtotal", "total", "custo",
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) =>
      !hidden.has(key) && value !== null && value !== undefined && value !== ""
    ),
  );
}

function sourceItemProductId(source: Record<string, unknown>) {
  const value = source.produtoId || source.productId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceItemCategory(source: Record<string, unknown>) {
  const value = source.categoryKey || source.categoria || source.category;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function templateScore(
  template: typeof installationChecklistTemplatesTable.$inferSelect,
  source: Record<string, unknown>,
  metadata: Record<string, unknown>,
) {
  const productId = sourceItemProductId(source);
  const category = sourceItemCategory(source);
  const segment = String(source.segmentKey || metadata.segmentKey || metadata.segmento || "").trim() || null;
  const niche = String(source.nicheKey || metadata.nicheKey || metadata.nicho || "").trim() || null;
  let score = 0;
  if (template.productId) score += template.productId === productId ? 100 : -1000;
  if (template.categoryKey) score += template.categoryKey === category ? 40 : -100;
  if (template.nicheKey) score += template.nicheKey === niche ? 20 : -50;
  if (template.segmentKey) score += template.segmentKey === segment ? 10 : -25;
  if (!template.productId && !template.categoryKey && !template.nicheKey && !template.segmentKey) score += 1;
  return score;
}

async function loadCard(cardId: string) {
  const [card] = await db.select().from(workCardsTable)
    .where(eq(workCardsTable.id, cardId))
    .limit(1);
  return card ?? null;
}

async function ensureVisit(card: typeof workCardsTable.$inferSelect) {
  const [existing] = await db.select().from(installationVisitsTable)
    .where(and(
      eq(installationVisitsTable.tenantId, card.tenantId),
      eq(installationVisitsTable.workCardId, card.id),
    ))
    .orderBy(desc(installationVisitsTable.visitNumber))
    .limit(1);
  if (existing) return existing;

  const metadata = (card.metadata ?? {}) as Record<string, unknown>;
  const sourceItems = Array.isArray(metadata.itens)
    ? metadata.itens as Array<Record<string, unknown>>
    : [];

  const [visit] = await db.insert(installationVisitsTable).values({
    tenantId: card.tenantId,
    workCardId: card.id,
    visitNumber: 1,
    status: card.etapa === "instalacao_em_andamento" ? "in_progress" : "scheduled",
    startedAt: card.etapa === "instalacao_em_andamento" ? new Date() : null,
    responsibleId: card.responsavelId,
    teamUserIds: card.responsavelId ? [card.responsavelId] : [],
    metadata: { generatedFrom: "work_card", cardCode: card.codigo },
  }).returning();

  if (!sourceItems.length) return visit;

  const templates = await db.select().from(installationChecklistTemplatesTable)
    .where(and(
      eq(installationChecklistTemplatesTable.tenantId, card.tenantId),
      eq(installationChecklistTemplatesTable.active, true),
    ));

  const rows: Array<typeof installationChecklistItemsTable.$inferInsert> = [];
  sourceItems.forEach((source, sourceIndex) => {
    const ranked = templates
      .map((template) => ({ template, score: templateScore(template, source, metadata) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score);
    const template = ranked[0]?.template;
    const rules = template?.rules ?? {};
    const checks = template?.checks?.length
      ? template.checks
      : [
          { key: "execution", label: "Instalação/execução conforme pedido", required: true, completed: false },
          { key: "final_check", label: "Conferência final", required: true, completed: false },
        ];

    const rawQty = Number(source.quantidade ?? source.quantity ?? source.qtd ?? 1);
    const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.max(1, Math.floor(rawQty)) : 1;
    const expand = rules.expandQuantity === true && quantity <= 200;
    const units = expand ? quantity : 1;

    for (let unit = 0; unit < units; unit += 1) {
      rows.push({
        tenantId: card.tenantId,
        visitId: visit.id,
        workCardId: card.id,
        sourceItemKey: normalizeItemKey(source, sourceIndex),
        sourceItemIndex: sourceIndex,
        unitIndex: expand ? unit + 1 : null,
        productId: sourceItemProductId(source),
        sku: typeof source.sku === "string" ? source.sku : null,
        productName: String(source.nome || source.name || source.descricao || source.produto || "Item"),
        quantity: expand ? 1 : quantity,
        location: String(source.localizacao || source.location || source.ambiente || "").trim() || null,
        attributes: installationAttributes(source),
        checks,
        status: "pending",
        evidenceRequired: rules.evidenceRequired === true,
        required: rules.required !== false,
      });
    }
  });

  if (rows.length) await db.insert(installationChecklistItemsTable).values(rows);
  return visit;
}

async function installationReady(card: typeof workCardsTable.$inferSelect) {
  const [visit] = await db.select().from(installationVisitsTable)
    .where(and(
      eq(installationVisitsTable.tenantId, card.tenantId),
      eq(installationVisitsTable.workCardId, card.id),
    ))
    .orderBy(desc(installationVisitsTable.visitNumber))
    .limit(1);
  if (!visit) return false;

  const [items, occurrences, attachments] = await Promise.all([
    db.select().from(installationChecklistItemsTable).where(and(
      eq(installationChecklistItemsTable.tenantId, card.tenantId),
      eq(installationChecklistItemsTable.visitId, visit.id),
    )),
    db.select().from(installationOccurrencesTable).where(and(
      eq(installationOccurrencesTable.tenantId, card.tenantId),
      eq(installationOccurrencesTable.workCardId, card.id),
    )),
    db.select().from(workCardAttachmentsTable).where(and(
      eq(workCardAttachmentsTable.tenantId, card.tenantId),
      eq(workCardAttachmentsTable.workCardId, card.id),
    )),
  ]);

  if (!items.length) return false;
  if (occurrences.some((row) => row.status === "open" || row.status === "in_progress")) return false;

  const evidenceItemIds = new Set(
    attachments
      .map((attachment) => {
        const metadata = attachment.metadata as Record<string, unknown> | null;
        return typeof metadata?.installationChecklistItemId === "string"
          ? metadata.installationChecklistItemId
          : null;
      })
      .filter((value): value is string => Boolean(value)),
  );

  return items.filter((item) => item.required).every((item) => {
    if (!DONE_STATUSES.has(item.status)) return false;
    if (item.evidenceRequired && !evidenceItemIds.has(item.id)) return false;
    const checks = Array.isArray(item.checks) ? item.checks as Array<Record<string, unknown>> : [];
    return checks
      .filter((check) => check.required !== false)
      .every((check) => check.completed === true);
  });
}

async function syncInstallationGate(card: typeof workCardsTable.$inferSelect) {
  const ready = await installationReady(card);
  const metadata = (card.metadata ?? {}) as Record<string, unknown>;
  const stageGates = metadata.stageGates && typeof metadata.stageGates === "object"
    ? { ...(metadata.stageGates as Record<string, unknown>) }
    : {};

  stageGates.checklist_instalacao = ready
    ? {
        completed: true,
        completedAt: new Date().toISOString(),
        stage: "instalacao_em_andamento",
        source: "structured_installation_checklist",
      }
    : {
        completed: false,
        completedAt: null,
        stage: "instalacao_em_andamento",
        source: "structured_installation_checklist",
      };

  await db.update(workCardsTable).set({
    metadata: { ...metadata, stageGates },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id));

  return ready;
}

async function signatureData(storage: ObjectStorageService, url: string) {
  const objectPath = url.startsWith("/api/storage/")
    ? url.slice("/api/storage".length)
    : url;
  if (!objectPath.startsWith("/objects/")) {
    return { dataUrl: url, digest: createHash("sha256").update(url).digest("hex") };
  }
  const file = await storage.getObjectEntityFile(objectPath);
  const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  const contentType = metadata.contentType || "image/png";
  return {
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
    digest: createHash("sha256").update(buffer).digest("hex"),
  };
}

router.get("/tenants/:tenantId/installation-metrics", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [visits, items, occurrences] = await Promise.all([
    db.select().from(installationVisitsTable).where(eq(installationVisitsTable.tenantId, tenantId)),
    db.select().from(installationChecklistItemsTable).where(eq(installationChecklistItemsTable.tenantId, tenantId)),
    db.select().from(installationOccurrencesTable).where(eq(installationOccurrencesTable.tenantId, tenantId)),
  ]);

  const cards = new Map<string, { visits: number; accepted: boolean }>();
  for (const visit of visits) {
    const current = cards.get(visit.workCardId) ?? { visits: 0, accepted: false };
    current.visits = Math.max(current.visits, visit.visitNumber);
    current.accepted ||= visit.customerAcceptanceStatus === "accepted";
    cards.set(visit.workCardId, current);
  }

  const occurrenceTypes: Record<string, number> = {};
  for (const occurrence of occurrences) {
    occurrenceTypes[occurrence.type] = (occurrenceTypes[occurrence.type] ?? 0) + 1;
  }
  const doneItems = items.filter((item) => DONE_STATUSES.has(item.status)).length;

  res.json({
    installations: cards.size,
    accepted: Array.from(cards.values()).filter((value) => value.accepted).length,
    firstVisitAccepted: Array.from(cards.values()).filter((value) => value.accepted && value.visits === 1).length,
    returns: Array.from(cards.values()).filter((value) => value.visits > 1).length,
    visits: visits.length,
    checklistItems: items.length,
    completedChecklistItems: doneItems,
    completionRate: items.length ? Number(((doneItems / items.length) * 100).toFixed(1)) : 0,
    occurrences: occurrences.length,
    openOccurrences: occurrences.filter((row) => row.status === "open" || row.status === "in_progress").length,
    occurrenceTypes,
  });
});

router.get("/tenants/:tenantId/installation-templates", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const rows = await db.select().from(installationChecklistTemplatesTable)
    .where(eq(installationChecklistTemplatesTable.tenantId, tenantId))
    .orderBy(desc(installationChecklistTemplatesTable.updatedAt));
  res.json(rows);
});

router.post("/tenants/:tenantId/installation-templates", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId) || !isAdmin(req)) {
    res.status(403).json({ error: "Apenas administradores podem configurar templates." });
    return;
  }
  const parsed = insertInstallationTemplateSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  const [row] = await db.insert(installationChecklistTemplatesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/tenants/:tenantId/installation-templates/:templateId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId) || !isAdmin(req)) {
    res.status(403).json({ error: "Apenas administradores podem configurar templates." });
    return;
  }
  const parsed = updateInstallationTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  const [row] = await db.update(installationChecklistTemplatesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(
      eq(installationChecklistTemplatesTable.id, String(req.params.templateId)),
      eq(installationChecklistTemplatesTable.tenantId, tenantId),
    ))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Template não encontrado" });
    return;
  }
  res.json(row);
});

router.get("/work-cards/:id/installation", async (req, res) => {
  const card = await loadCard(String(req.params.id));
  if (!card) {
    res.status(404).json({ error: "Card operacional não encontrado" });
    return;
  }
  if (!canAccessCard(req, card)) {
    res.status(403).json({ error: "Access denied to this work card" });
    return;
  }
  if (card.pipeline !== "execucao") {
    res.status(422).json({ error: "Instalação disponível apenas na pipeline de execução" });
    return;
  }
  if (!["instalacao_a_iniciar", "instalacao_em_andamento", "instalacao_finalizada", "entrega_obra", "pos_venda"].includes(card.etapa)) {
    res.status(409).json({
      error: "INSTALLATION_NOT_STARTED",
      message: "O checklist detalhado é criado quando o pedido entra na etapa de instalação.",
    });
    return;
  }

  const currentVisit = await ensureVisit(card);
  const [visits, items, occurrences] = await Promise.all([
    db.select().from(installationVisitsTable).where(and(
      eq(installationVisitsTable.tenantId, card.tenantId),
      eq(installationVisitsTable.workCardId, card.id),
    )).orderBy(installationVisitsTable.visitNumber),
    db.select().from(installationChecklistItemsTable).where(and(
      eq(installationChecklistItemsTable.tenantId, card.tenantId),
      eq(installationChecklistItemsTable.workCardId, card.id),
    )).orderBy(installationChecklistItemsTable.sourceItemIndex, installationChecklistItemsTable.unitIndex),
    db.select().from(installationOccurrencesTable).where(and(
      eq(installationOccurrencesTable.tenantId, card.tenantId),
      eq(installationOccurrencesTable.workCardId, card.id),
    )).orderBy(desc(installationOccurrencesTable.createdAt)),
  ]);

  res.json({
    currentVisitId: currentVisit.id,
    ready: await installationReady(card),
    visits,
    items,
    occurrences,
  });
});

router.post("/work-cards/:id/installation/visits", async (req, res) => {
  const card = await loadCard(String(req.params.id));
  if (!card) {
    res.status(404).json({ error: "Card operacional não encontrado" });
    return;
  }
  if (!canAccessCard(req, card)) {
    res.status(403).json({ error: "Access denied to this work card" });
    return;
  }

  const visits = await db.select().from(installationVisitsTable)
    .where(and(
      eq(installationVisitsTable.tenantId, card.tenantId),
      eq(installationVisitsTable.workCardId, card.id),
    ))
    .orderBy(desc(installationVisitsTable.visitNumber));

  const [visit] = await db.insert(installationVisitsTable).values({
    tenantId: card.tenantId,
    workCardId: card.id,
    visitNumber: (visits[0]?.visitNumber ?? 0) + 1,
    status: "scheduled",
    scheduledAt: req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null,
    responsibleId: req.body?.responsibleId || card.responsavelId,
    teamUserIds: Array.isArray(req.body?.teamUserIds)
      ? req.body.teamUserIds
      : card.responsavelId ? [card.responsavelId] : [],
    notes: typeof req.body?.notes === "string" ? req.body.notes : null,
    metadata: { reason: req.body?.reason || "return_or_additional_visit" },
  }).returning();

  const previousVisit = visits[0];
  if (previousVisit) {
    const previousItems = await db.select().from(installationChecklistItemsTable)
      .where(and(
        eq(installationChecklistItemsTable.tenantId, card.tenantId),
        eq(installationChecklistItemsTable.visitId, previousVisit.id),
      ));
    const pending = previousItems.filter((item) => !DONE_STATUSES.has(item.status));
    if (pending.length) {
      await db.insert(installationChecklistItemsTable).values(pending.map((item) => ({
        tenantId: item.tenantId,
        visitId: visit.id,
        workCardId: item.workCardId,
        sourceItemKey: item.sourceItemKey,
        sourceItemIndex: item.sourceItemIndex,
        unitIndex: item.unitIndex,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        location: item.location,
        attributes: item.attributes,
        checks: item.checks,
        status: "pending",
        observation: item.observation,
        evidenceRequired: item.evidenceRequired,
        required: item.required,
      })));
    }
  }

  await syncInstallationGate(card);
  res.status(201).json(visit);
});

router.patch("/installation-visits/:visitId", async (req, res) => {
  const [visit] = await db.select().from(installationVisitsTable)
    .where(eq(installationVisitsTable.id, String(req.params.visitId)))
    .limit(1);
  if (!visit) {
    res.status(404).json({ error: "Visita não encontrada" });
    return;
  }
  if (!canAccessTenant(req, visit.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (visit.customerAcceptanceStatus === "accepted") {
    res.status(409).json({
      error: "INSTALLATION_ACCEPTANCE_IMMUTABLE",
      message: "Visita com aceite concluído não pode mais ser alterada.",
    });
    return;
  }
  const parsed = updateInstallationVisitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  const [row] = await db.update(installationVisitsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(installationVisitsTable.id, visit.id))
    .returning();
  res.json(row);
});

router.patch("/installation-checklist-items/:itemId", async (req, res) => {
  const [item] = await db.select().from(installationChecklistItemsTable)
    .where(eq(installationChecklistItemsTable.id, String(req.params.itemId)))
    .limit(1);
  if (!item) {
    res.status(404).json({ error: "Item do checklist não encontrado" });
    return;
  }
  if (!canAccessTenant(req, item.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = updateInstallationChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  const status = parsed.data.status ?? item.status;
  const done = DONE_STATUSES.has(status);
  const [row] = await db.update(installationChecklistItemsTable).set({
    ...parsed.data,
    ...(done ? {
      completedAt: parsed.data.completedAt ?? new Date(),
      completedBy: parsed.data.completedBy ?? req.user?.sub ?? null,
    } : {}),
    updatedAt: new Date(),
  }).where(eq(installationChecklistItemsTable.id, item.id)).returning();

  if (EXCEPTION_STATUSES.has(status)) {
    const [openOccurrence] = await db.select().from(installationOccurrencesTable)
      .where(and(
        eq(installationOccurrencesTable.tenantId, item.tenantId),
        eq(installationOccurrencesTable.checklistItemId, item.id),
        eq(installationOccurrencesTable.status, "open"),
      ))
      .limit(1);
    if (!openOccurrence) {
      await db.insert(installationOccurrencesTable).values({
        tenantId: item.tenantId,
        workCardId: item.workCardId,
        visitId: item.visitId,
        checklistItemId: item.id,
        type: status,
        status: "open",
        description: parsed.data.observation || item.observation || `Ocorrência gerada automaticamente para ${item.productName}.`,
        responsibleId: req.user?.sub ?? null,
        metadata: { source: "installation_checklist", automatic: true },
      });
    }
  }

  const card = await loadCard(item.workCardId);
  if (card) await syncInstallationGate(card);
  res.json(row);
});

router.patch("/installation-occurrences/:occurrenceId", async (req, res) => {
  const [occurrence] = await db.select().from(installationOccurrencesTable)
    .where(eq(installationOccurrencesTable.id, String(req.params.occurrenceId)))
    .limit(1);
  if (!occurrence) {
    res.status(404).json({ error: "Ocorrência não encontrada" });
    return;
  }
  if (!canAccessTenant(req, occurrence.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const schema = z.object({
    status: z.enum(["open", "in_progress", "resolved", "cancelled"]).optional(),
    description: z.string().max(10000).optional(),
    responsibleId: z.string().nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    resolution: z.string().max(10000).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  const [row] = await db.update(installationOccurrencesTable).set({
    ...parsed.data,
    resolvedAt: parsed.data.status === "resolved" ? new Date() : occurrence.resolvedAt,
    updatedAt: new Date(),
  }).where(eq(installationOccurrencesTable.id, occurrence.id)).returning();

  const card = await loadCard(occurrence.workCardId);
  if (card) await syncInstallationGate(card);
  res.json(row);
});

const acceptanceSchema = z.object({
  receiverName: z.string().trim().min(2).max(200),
  receiverDocument: z.string().trim().max(100).nullable().optional(),
  receiverRelationship: z.string().trim().max(120).nullable().optional(),
  customerSignatureUrl: z.string().trim().min(1),
  companySignatureUrl: z.string().trim().min(1),
});

router.post("/installation-visits/:visitId/accept", async (req, res) => {
  const parsed = acceptanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  const [visit] = await db.select().from(installationVisitsTable)
    .where(eq(installationVisitsTable.id, String(req.params.visitId)))
    .limit(1);
  if (!visit) {
    res.status(404).json({ error: "Visita não encontrada" });
    return;
  }
  if (!canAccessTenant(req, visit.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (visit.customerAcceptanceStatus === "accepted") {
    res.status(409).json({
      error: "INSTALLATION_ACCEPTANCE_IMMUTABLE",
      message: "Este aceite já foi concluído e não pode ser alterado.",
    });
    return;
  }

  const card = await loadCard(visit.workCardId);
  if (!card) {
    res.status(404).json({ error: "Card operacional não encontrado" });
    return;
  }
  if (!canAccessCard(req, card)) {
    res.status(403).json({ error: "Access denied to this work card" });
    return;
  }
  if (!["instalacao_finalizada", "entrega_obra", "pos_venda", "concluido"].includes(card.etapa)) {
    res.status(409).json({
      error: "INSTALLATION_NOT_TECHNICALLY_FINALIZED",
      message: "Finalize tecnicamente a instalação antes de registrar o aceite do cliente.",
    });
    return;
  }
  if (!(await installationReady(card))) {
    res.status(409).json({
      error: "INSTALLATION_NOT_READY_FOR_ACCEPTANCE",
      message: "Finalize itens, verificações, evidências obrigatórias e ocorrências antes do aceite.",
    });
    return;
  }

  const [tenant, lead, deal, responsible, items, templates] = await Promise.all([
    db.select({ name: tenantsTable.name }).from(tenantsTable)
      .where(eq(tenantsTable.id, card.tenantId)).limit(1).then((rows) => rows[0] ?? null),
    card.leadId
      ? db.select({ nome: leadsTable.nome, empresa: leadsTable.empresa, telefone: leadsTable.telefone })
          .from(leadsTable).where(eq(leadsTable.id, card.leadId)).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    card.dealId
      ? db.select({ titulo: dealsTable.titulo }).from(dealsTable)
          .where(eq(dealsTable.id, card.dealId)).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    card.responsavelId
      ? db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable)
          .where(eq(usersTable.id, card.responsavelId)).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db.select().from(installationChecklistItemsTable).where(and(
      eq(installationChecklistItemsTable.tenantId, card.tenantId),
      eq(installationChecklistItemsTable.visitId, visit.id),
    )).orderBy(installationChecklistItemsTable.sourceItemIndex, installationChecklistItemsTable.unitIndex),
    db.select().from(installationChecklistTemplatesTable).where(and(
      eq(installationChecklistTemplatesTable.tenantId, card.tenantId),
      eq(installationChecklistTemplatesTable.active, true),
    )),
  ]);

  const documentUrls = new Set<string>();
  for (const item of items) {
    const source: Record<string, unknown> = {
      ...(item.attributes ?? {}),
      produtoId: item.productId,
      sku: item.sku,
    };
    const ranked = templates
      .map((template) => ({ template, score: templateScore(template, source, card.metadata ?? {}) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score);
    const rules = ranked[0]?.template.rules ?? {};
    for (const candidate of [
      ...(Array.isArray(rules.manualUrls) ? rules.manualUrls : []),
      ...(Array.isArray(rules.warrantyUrls) ? rules.warrantyUrls : []),
    ]) {
      if (typeof candidate === "string" && candidate.trim()) documentUrls.add(candidate.trim());
    }
  }

  const acceptedAt = new Date().toISOString();
  const snapshotWithoutHash = {
    acceptedAt,
    tenantName: tenant?.name || "Empresa",
    cardCode: card.codigo,
    cardTitle: card.titulo,
    customerName: lead?.empresa || lead?.nome || "Cliente",
    orderTitle: deal?.titulo || card.titulo,
    receiverName: parsed.data.receiverName,
    receiverDocument: parsed.data.receiverDocument ?? null,
    receiverRelationship: parsed.data.receiverRelationship ?? null,
    customerSignatureUrl: parsed.data.customerSignatureUrl,
    companySignatureUrl: parsed.data.companySignatureUrl,
    responsibleName: responsible?.name || responsible?.email || null,
    visitNumber: visit.visitNumber,
    documents: Array.from(documentUrls),
    items: items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitIndex: item.unitIndex,
      location: item.location,
      status: item.status,
      observation: item.observation,
      attributes: item.attributes,
    })),
  };

  const storage = new ObjectStorageService();
  const [customerSignature, companySignature] = await Promise.all([
    signatureData(storage, parsed.data.customerSignatureUrl),
    signatureData(storage, parsed.data.companySignatureUrl),
  ]);
  const hash = createHash("sha256")
    .update(JSON.stringify(snapshotWithoutHash))
    .update(customerSignature.digest)
    .update(companySignature.digest)
    .digest("hex");

  const snapshot: InstallationAcceptanceSnapshot = { hash, ...snapshotWithoutHash };
  const pdf = await generateInstallationAcceptancePdf({
    ...snapshot,
    customerSignatureUrl: customerSignature.dataUrl,
    companySignatureUrl: companySignature.dataUrl,
  });
  const objectPath = await storage.savePrivateBuffer(
    pdf,
    "application/pdf",
    `termo-instalacao-${card.codigo}.pdf`,
  );
  const servedUrl = `/api/storage${objectPath}`;

  const [attachment] = await db.insert(workCardAttachmentsTable).values({
    tenantId: card.tenantId,
    workCardId: card.id,
    leadId: card.leadId,
    criadoPor: req.user?.sub ?? null,
    origem: "installation_acceptance",
    nome: `Termo de Instalação e Aceite - ${card.codigo}.pdf`,
    url: servedUrl,
    mimeType: "application/pdf",
    tamanho: pdf.byteLength,
    descricao: "Documento final imutável de instalação e aceite.",
    metadata: {
      immutable: true,
      installationVisitId: visit.id,
      acceptanceHash: hash,
      acceptedAt,
    },
  }).returning();

  const [updatedVisit] = await db.update(installationVisitsTable).set({
    receiverName: parsed.data.receiverName,
    receiverDocument: parsed.data.receiverDocument ?? null,
    receiverRelationship: parsed.data.receiverRelationship ?? null,
    customerAcceptanceStatus: "accepted",
    customerSignatureUrl: parsed.data.customerSignatureUrl,
    companySignatureUrl: parsed.data.companySignatureUrl,
    endedAt: visit.endedAt ?? new Date(),
    status: "completed",
    metadata: {
      ...(visit.metadata ?? {}),
      acceptanceSnapshot: snapshot,
      acceptanceHash: hash,
      acceptedAt,
      acceptedBy: req.user?.sub ?? null,
      acceptanceDocumentAttachmentId: attachment.id,
      acceptanceDocumentUrl: attachment.url,
    },
    updatedAt: new Date(),
  }).where(eq(installationVisitsTable.id, visit.id)).returning();

  const metadata = (card.metadata ?? {}) as Record<string, unknown>;
  const stageGates = metadata.stageGates && typeof metadata.stageGates === "object"
    ? { ...(metadata.stageGates as Record<string, unknown>) }
    : {};
  stageGates.vistoria_aceite = {
    completed: true,
    completedAt: acceptedAt,
    completedBy: req.user?.sub ?? null,
    source: "installation_acceptance",
    acceptanceHash: hash,
    attachmentId: attachment.id,
  };
  await db.update(workCardsTable).set({
    metadata: { ...metadata, stageGates },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id));

  if (card.leadId) {
    await db.insert(activitiesTable).values({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: "tarefa",
      titulo: `${card.codigo}: termo de instalação e aceite concluído`,
      descricao: `Aceite registrado por ${parsed.data.receiverName}. Integridade: ${hash}.`,
      status: "concluida",
      concluidaEm: new Date(),
      responsavelId: card.responsavelId,
    });
  }

  if (lead?.telefone) {
    const docs = Array.from(documentUrls);
    const message = [
      `Olá ${lead.nome || lead.empresa || ""}. A instalação foi concluída e o termo de aceite foi registrado.`,
      `Documento: ${servedUrl}`,
      docs.length ? `Manuais/garantias: ${docs.join(" | ")}` : null,
    ].filter(Boolean).join("\n");
    sendDirectWhatsAppMessage(card.tenantId, lead.telefone, message, req.log)
      .catch((error) => req.log.warn({ error, workCardId: card.id }, "installation acceptance delivery failed"));
  }

  res.json({
    visit: updatedVisit,
    acceptanceHash: hash,
    document: attachment,
    manualsAndWarranties: Array.from(documentUrls),
  });
});

export default router;
