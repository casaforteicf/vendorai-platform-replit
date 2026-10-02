import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  dealsTable,
  leadsTable,
  propostasTable,
  tenantsTable,
  usersTable,
  activitiesTable,
  operationalChecklistTemplatesTable,
  operationalChecklistRunsTable,
  type OperationalChecklistItem,
} from "@workspace/db";

const router: IRouter = Router();

function canAccessTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function buildChecklistItems(rawItems: unknown[]): OperationalChecklistItem[] {
  return rawItems.map((raw, index) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const snapshot = (item.sourceSnapshot && typeof item.sourceSnapshot === "object"
      ? item.sourceSnapshot
      : {}) as Record<string, unknown>;
    const pricingConfig = (snapshot.pricingConfig && typeof snapshot.pricingConfig === "object"
      ? snapshot.pricingConfig
      : {}) as Record<string, unknown>;
    const merged = { ...pricingConfig, ...item };
    const largura = pickNumber(merged, ["largura", "width", "larguraMm", "largura_mm"]);
    const altura = pickNumber(merged, ["altura", "height", "alturaMm", "altura_mm"]);
    const sku = typeof item.sku === "string" ? item.sku : typeof snapshot.sku === "string" ? snapshot.sku : null;
    const nome = typeof item.nome === "string" ? item.nome : "Item " + (index + 1);
    const descricao = typeof item.descricao === "string" && item.descricao.trim()
      ? item.descricao
      : typeof snapshot.descricao === "string" && snapshot.descricao.trim()
        ? snapshot.descricao
        : nome;
    const imagemUrl = typeof snapshot.imagemUrl === "string"
      ? snapshot.imagemUrl
      : Array.isArray(snapshot.imagens) && typeof snapshot.imagens[0] === "string"
        ? snapshot.imagens[0]
        : null;

    return {
      id: crypto.randomUUID(),
      sourceItemIndex: index,
      codigo: sku,
      tipo: nome,
      descricao,
      quantidade: typeof item.quantidade === "number" ? item.quantidade : 1,
      larguraOriginal: largura,
      alturaOriginal: altura,
      larguraConferida: null,
      alturaConferida: null,
      diferencaLargura: null,
      diferencaAltura: null,
      unidadeMedida: typeof item.unidade === "string" ? item.unidade : "mm",
      localizacao: typeof merged.localizacao === "string" ? merged.localizacao : null,
      observacao: null,
      atributosTecnicos: pricingConfig,
      imagemUrl,
      fotos: [],
      status: "nao_conferido",
      conferidoPor: null,
      conferidoEm: null,
    };
  });
}

async function getDealContext(dealId: string) {
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
  if (!deal) return null;
  const [lead, tenant, assigned] = await Promise.all([
    deal.leadId
      ? db.select().from(leadsTable).where(eq(leadsTable.id, deal.leadId)).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, deal.tenantId)).limit(1).then((rows) => rows[0] ?? null),
    deal.assignedTo
      ? db.select({ id: usersTable.id, nome: usersTable.nome, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, deal.assignedTo)).limit(1).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);
  const [proposal] = await db.select().from(propostasTable)
    .where(and(eq(propostasTable.tenantId, deal.tenantId), eq(propostasTable.dealId, deal.id)))
    .orderBy(desc(propostasTable.acceptedAt), desc(propostasTable.updatedAt))
    .limit(1);
  return { deal, lead, tenant, assigned, proposal: proposal ?? null };
}

router.get("/operational-checklists/deals/:dealId/current", async (req, res) => {
  const context = await getDealContext(String(req.params.dealId));
  if (!context) return void res.status(404).json({ error: "Negócio não encontrado" });
  if (!canAccessTenant(req, context.deal.tenantId)) return void res.status(403).json({ error: "Acesso negado" });

  const [run] = await db.select().from(operationalChecklistRunsTable)
    .where(and(
      eq(operationalChecklistRunsTable.tenantId, context.deal.tenantId),
      eq(operationalChecklistRunsTable.dealId, context.deal.id),
    ))
    .orderBy(desc(operationalChecklistRunsTable.revision), desc(operationalChecklistRunsTable.createdAt))
    .limit(1);

  res.json({ run: run ?? null, context: {
    deal: context.deal,
    lead: context.lead,
    tenant: context.tenant,
    assigned: context.assigned,
    propostaId: context.proposal?.id ?? null,
  }});
});

const startSchema = z.object({
  stageKey: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

router.post("/operational-checklists/deals/:dealId/start", async (req, res) => {
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });

  const context = await getDealContext(String(req.params.dealId));
  if (!context) return void res.status(404).json({ error: "Negócio não encontrado" });
  if (!canAccessTenant(req, context.deal.tenantId)) return void res.status(403).json({ error: "Acesso negado" });
  if (!context.proposal) {
    return void res.status(409).json({
      error: "Nenhum pedido/orçamento vinculado foi encontrado para este negócio.",
      code: "CHECKLIST_SOURCE_NOT_FOUND",
    });
  }

  const stageKey = parsed.data.stageKey ?? context.deal.etapa ?? "conferencia_medidas";
  let [template] = await db.select().from(operationalChecklistTemplatesTable)
    .where(and(
      eq(operationalChecklistTemplatesTable.tenantId, context.deal.tenantId),
      eq(operationalChecklistTemplatesTable.stageKey, stageKey),
      eq(operationalChecklistTemplatesTable.active, true),
    ))
    .limit(1);

  if (!template) {
    [template] = await db.insert(operationalChecklistTemplatesTable).values({
      tenantId: context.deal.tenantId,
      name: parsed.data.name ?? "Conferência de Medidas",
      key: "conferencia_medidas_" + stageKey,
      stageKey,
      sourceType: "proposal",
      toleranceMm: 3,
      requirePhotos: false,
      blockOnDivergence: true,
    }).returning();
  }

  const [latest] = await db.select({ revision: operationalChecklistRunsTable.revision })
    .from(operationalChecklistRunsTable)
    .where(and(
      eq(operationalChecklistRunsTable.tenantId, context.deal.tenantId),
      eq(operationalChecklistRunsTable.dealId, context.deal.id),
    ))
    .orderBy(desc(operationalChecklistRunsTable.revision))
    .limit(1);

  const items = buildChecklistItems(Array.isArray(context.proposal.itens) ? context.proposal.itens : []);
  const [run] = await db.insert(operationalChecklistRunsTable).values({
    tenantId: context.deal.tenantId,
    templateId: template?.id ?? null,
    dealId: context.deal.id,
    leadId: context.deal.leadId,
    propostaId: context.proposal.id,
    stageKey,
    name: template?.name ?? parsed.data.name ?? "Conferência de Medidas",
    revision: (latest?.revision ?? 0) + 1,
    toleranceMm: template?.toleranceMm ?? 3,
    blockOnDivergence: template?.blockOnDivergence ?? true,
    createdBy: req.user?.sub ?? null,
    headerSnapshot: {
      empresa: context.tenant?.name ?? null,
      cliente: context.lead?.empresa || context.lead?.nome || null,
      contato: context.lead?.nome ?? null,
      endereco: context.lead?.endereco ?? null,
      pedido: context.proposal.numero || context.proposal.titulo,
      obra: context.deal.titulo,
      representante: context.assigned?.nome ?? context.assigned?.email ?? null,
      geradoEm: new Date().toISOString(),
    },
    items,
  }).returning();

  if (context.deal.leadId) {
    await db.insert(activitiesTable).values({
      tenantId: context.deal.tenantId,
      leadId: context.deal.leadId,
      dealId: context.deal.id,
      tipo: "tarefa",
      titulo: "Conferência de medidas iniciada",
      descricao: `Checklist ${run.name} R${run.revision} criado automaticamente a partir do pedido/orçamento vinculado.`,
      status: "concluida",
      concluidaEm: new Date(),
      responsavelId: req.user?.sub ?? context.deal.assignedTo ?? null,
    });
  }

  res.status(201).json(run);
});

const updateItemSchema = z.object({
  larguraConferida: z.number().nonnegative().nullable().optional(),
  alturaConferida: z.number().nonnegative().nullable().optional(),
  localizacao: z.string().max(500).nullable().optional(),
  observacao: z.string().max(3000).nullable().optional(),
  fotos: z.array(z.string().min(1)).max(20).optional(),
  status: z.enum(["nao_conferido", "conferido", "divergente", "nao_executado", "resolvido"]).optional(),
});

router.patch("/operational-checklists/runs/:runId/items/:itemId", async (req, res) => {
  const parsed = updateItemSchema.safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(422).json({ error: parsed.error.message });
  const [run] = await db.select().from(operationalChecklistRunsTable)
    .where(eq(operationalChecklistRunsTable.id, String(req.params.runId))).limit(1);
  if (!run) return void res.status(404).json({ error: "Checklist não encontrado" });
  if (!canAccessTenant(req, run.tenantId)) return void res.status(403).json({ error: "Acesso negado" });
  if (run.status === "concluido") return void res.status(409).json({ error: "Checklist concluído não pode ser alterado" });

  const itemId = String(req.params.itemId);
  let found = false;
  const items = (run.items ?? []).map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    const next = { ...item, ...parsed.data };
    next.diferencaLargura = next.larguraOriginal != null && next.larguraConferida != null
      ? next.larguraConferida - next.larguraOriginal : null;
    next.diferencaAltura = next.alturaOriginal != null && next.alturaConferida != null
      ? next.alturaConferida - next.alturaOriginal : null;
    const maxDelta = Math.max(Math.abs(next.diferencaLargura ?? 0), Math.abs(next.diferencaAltura ?? 0));
    if (parsed.data.status === undefined && next.larguraConferida != null && next.alturaConferida != null) {
      next.status = maxDelta > run.toleranceMm ? "divergente" : "conferido";
    }
    next.conferidoPor = req.user?.sub ?? null;
    next.conferidoEm = new Date().toISOString();
    return next;
  });
  if (!found) return void res.status(404).json({ error: "Item não encontrado" });

  const [updated] = await db.update(operationalChecklistRunsTable)
    .set({ items, updatedAt: new Date() })
    .where(eq(operationalChecklistRunsTable.id, run.id))
    .returning();
  res.json(updated);
});

router.post("/operational-checklists/runs/:runId/complete", async (req, res) => {
  const [run] = await db.select().from(operationalChecklistRunsTable)
    .where(eq(operationalChecklistRunsTable.id, String(req.params.runId))).limit(1);
  if (!run) return void res.status(404).json({ error: "Checklist não encontrado" });
  if (!canAccessTenant(req, run.tenantId)) return void res.status(403).json({ error: "Acesso negado" });

  const pending = (run.items ?? []).filter((item) => item.status === "nao_conferido");
  const divergent = (run.items ?? []).filter((item) => item.status === "divergente");
  if (pending.length > 0 || (run.blockOnDivergence && divergent.length > 0)) {
    return void res.status(409).json({
      error: "Existem itens pendentes ou divergências não resolvidas.",
      code: "CHECKLIST_NOT_READY",
      pending: pending.length,
      divergent: divergent.length,
    });
  }

  const [updated] = await db.update(operationalChecklistRunsTable).set({
    status: "concluido",
    completedBy: req.user?.sub ?? null,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(operationalChecklistRunsTable.id, run.id)).returning();

  if (run.leadId) {
    await db.insert(activitiesTable).values({
      tenantId: run.tenantId,
      leadId: run.leadId,
      dealId: run.dealId,
      tipo: "tarefa",
      titulo: "Conferência de medidas concluída",
      descricao: `${run.name} R${run.revision} concluído sem pendências bloqueantes.`,
      status: "concluida",
      concluidaEm: new Date(),
      responsavelId: req.user?.sub ?? null,
    });
  }
  res.json(updated);
});

export default router;