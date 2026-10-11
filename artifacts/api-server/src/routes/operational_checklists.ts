import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ObjectStorageService } from "../lib/objectStorage";
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
  mediaAssetsTable,
  archProjetosTable,
  archConceptProjectsTable,
  type OperationalChecklistItem,
} from "@workspace/db";

const router: IRouter = Router();
const measureStorage = new ObjectStorageService();

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
  // Photos are only attached through the authenticated upload endpoint.
  surveyElements: z.array(z.object({
    id: z.string().uuid(),
    roomName: z.string().trim().min(1).max(120),
    elementType: z.enum(["wall", "door", "window", "column", "beam", "electrical", "plumbing", "gas", "other"]),
    label: z.string().trim().min(1).max(160),
    widthMm: z.number().positive().max(1000000).nullable().optional(),
    heightMm: z.number().positive().max(1000000).nullable().optional(),
    depthMm: z.number().positive().max(1000000).nullable().optional(),
    x1Mm: z.number().min(-1000000).max(1000000).nullable().optional(),
    y1Mm: z.number().min(-1000000).max(1000000).nullable().optional(),
    x2Mm: z.number().min(-1000000).max(1000000).nullable().optional(),
    y2Mm: z.number().min(-1000000).max(1000000).nullable().optional(),
    thicknessMm: z.number().min(50).max(1000).nullable().optional(),
    wallId: z.string().uuid().nullable().optional(),
    offsetMm: z.number().nonnegative().max(1000000).nullable().optional(),
    sillHeightMm: z.number().nonnegative().max(1000000).nullable().optional(),
    sourcePhotoPath: z.string().startsWith("/objects/").max(500).nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
    verified: z.boolean(),
  })).max(200).optional(),
  photoMeasurements: z.array(z.object({
    id: z.string().uuid(),
    start: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    end: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    millimeters: z.number().positive().max(1000000),
    label: z.string().trim().min(1).max(120),
    photoPath: z.string().startsWith("/objects/").max(500).optional(),
    source: z.literal("manual_verified"),
  })).max(100).optional(),
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
  const targetItem = (run.items ?? []).find((item) => item.id === itemId);
  if (parsed.data.surveyElements) {
    const elements = parsed.data.surveyElements;
    for (const opening of elements.filter((element) => element.elementType === "door" || element.elementType === "window")) {
      const wall = elements.find((element) => element.id === opening.wallId && element.elementType === "wall" && element.roomName === opening.roomName);
      if (!wall || !wall.verified || wall.x1Mm == null || wall.y1Mm == null || wall.x2Mm == null || wall.y2Mm == null || opening.offsetMm == null || opening.widthMm == null || opening.heightMm == null) {
        return void res.status(422).json({ error: "Portas e janelas exigem parede verificada e dimensões/posição completas" });
      }
      const length = Math.hypot(wall.x2Mm - wall.x1Mm, wall.y2Mm - wall.y1Mm);
      if (opening.offsetMm + opening.widthMm > length + 0.01) return void res.status(422).json({ error: "Abertura ultrapassa o comprimento da parede" });
      if (opening.elementType === "window" && opening.sillHeightMm == null) return void res.status(422).json({ error: "Informe o peitoril da janela" });
    }
    const openings = elements.filter((e) => e.elementType === "door" || e.elementType === "window");
    for (let i = 0; i < openings.length; i++) for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i], other = openings[j];
      if (a.wallId && a.wallId === other.wallId && a.offsetMm != null && other.offsetMm != null && a.widthMm != null && other.widthMm != null &&
          a.offsetMm < other.offsetMm + other.widthMm && other.offsetMm < a.offsetMm + a.widthMm) {
        const aBottom = a.sillHeightMm ?? 0, bBottom = other.sillHeightMm ?? 0;
        if (aBottom < bBottom + (other.heightMm ?? 0) && bBottom < aBottom + (a.heightMm ?? 0))
          return void res.status(422).json({ error: "Aberturas sobrepostas na mesma parede" });
      }
    }
  }
  if (parsed.data.surveyElements?.some((element) => element.sourcePhotoPath && !targetItem?.fotos?.includes(element.sourcePhotoPath)))
    return void res.status(422).json({ error: "Elemento vinculado a fotografia inexistente neste item" });
  if (parsed.data.photoMeasurements?.some((m) => m.photoPath && !targetItem?.fotos?.includes(m.photoPath)))
    return void res.status(422).json({ error: "Cota vinculada a fotografia inexistente neste item" });
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
    .where(and(
      eq(operationalChecklistRunsTable.id, run.id),
      eq(operationalChecklistRunsTable.tenantId, run.tenantId),
      eq(operationalChecklistRunsTable.status, "em_andamento"),
      eq(operationalChecklistRunsTable.items, run.items ?? []),
    ))
    .returning();
  if (!updated) return void res.status(409).json({
    error: "O checklist foi alterado em outra operação. Atualize antes de salvar novamente.",
    code: "CHECKLIST_CONFLICT",
  });
  res.json(updated);
});

const uploadPhotoSchema = z.object({
  name: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(8).max(11_000_000),
});

router.post("/operational-checklists/runs/:runId/items/:itemId/photos", async (req, res) => {
  const parsed = uploadPhotoSchema.safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(422).json({ error: "Fotografia inválida" });
  const [run] = await db.select().from(operationalChecklistRunsTable)
    .where(eq(operationalChecklistRunsTable.id, String(req.params.runId))).limit(1);
  if (!run) return void res.status(404).json({ error: "Checklist não encontrado" });
  if (!canAccessTenant(req, run.tenantId)) return void res.status(403).json({ error: "Acesso negado" });
  if (run.status === "concluido") return void res.status(409).json({ error: "Checklist concluído" });
  const itemId = String(req.params.itemId);
  const current = (run.items ?? []).find((item) => item.id === itemId);
  if (!current) return void res.status(404).json({ error: "Item não encontrado" });
  if ((current.fotos ?? []).length >= 20) return void res.status(422).json({ error: "Limite de 20 fotografias por item" });
  const { dataBase64, contentType, name } = parsed.data;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0)
    return void res.status(422).json({ error: "Conteúdo Base64 inválido" });
  const buffer = Buffer.from(dataBase64, "base64");
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024)
    return void res.status(413).json({ error: "Fotografia excede 5 MB" });
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isWebp = buffer.toString("ascii",0,4) === "RIFF" && buffer.toString("ascii",8,12) === "WEBP";
  if (!((contentType === "image/jpeg" && isJpeg) || (contentType === "image/png" && isPng) || (contentType === "image/webp" && isWebp)))
    return void res.status(422).json({ error: "Formato real da imagem diferente do declarado" });
  try {
    const storageUrl = await measureStorage.savePrivateBuffer(buffer, contentType, name, run.tenantId);
    const [asset] = await db.insert(mediaAssetsTable).values({
      tenantId: run.tenantId, userId: req.user?.sub ?? null,
      type: "image", role: "source", source: "upload",
      storageUrl, originalFilename: name, mimeType: contentType, fileSize: buffer.length,
      metadata: { origin: "arqdor_measure", leadId: run.leadId, dealId: run.dealId, runId: run.id, itemId, revision: run.revision },
    }).returning();
    let persisted = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const [latest] = await db.select().from(operationalChecklistRunsTable)
        .where(and(eq(operationalChecklistRunsTable.id, run.id), eq(operationalChecklistRunsTable.tenantId, run.tenantId))).limit(1);
      if (!latest || latest.status === "concluido") break;
      const target = (latest.items ?? []).find((item) => item.id === itemId);
      if (!target || (target.fotos ?? []).length >= 20) break;
      const items = (latest.items ?? []).map((item) => item.id === itemId
        ? { ...item, fotos: [...(item.fotos ?? []), storageUrl] } : item);
      const [saved] = await db.update(operationalChecklistRunsTable).set({ items, updatedAt: new Date() })
        .where(and(eq(operationalChecklistRunsTable.id, latest.id),
          eq(operationalChecklistRunsTable.tenantId, latest.tenantId),
          eq(operationalChecklistRunsTable.status, latest.status),
          eq(operationalChecklistRunsTable.items, latest.items ?? []))).returning();
      if (saved) { persisted = true; break; }
    }
    if (!persisted) return void res.status(409).json({
      error: "Não foi possível vincular a foto após alterações simultâneas. Confira o checklist antes de tentar novamente.",
      code: "CHECKLIST_CONFLICT",
    });
    const accessUrl = await measureStorage.getObjectEntitySignedUrl(storageUrl, 300);
    res.status(201).json({ assetId: asset.id, storageUrl, accessUrl });
  } catch (error) {
    req.log.error({ err: error, runId: run.id }, "arqdor-measure: upload failure");
    res.status(500).json({ error: "Falha ao registrar fotografia" });
  }
});

router.get("/operational-checklists/runs/:runId/items/:itemId/photos", async (req, res) => {
  const [run] = await db.select().from(operationalChecklistRunsTable)
    .where(eq(operationalChecklistRunsTable.id, String(req.params.runId))).limit(1);
  if (!run) return void res.status(404).json({ error: "Checklist não encontrado" });
  if (!canAccessTenant(req, run.tenantId)) return void res.status(403).json({ error: "Acesso negado" });
  const item = (run.items ?? []).find((entry) => entry.id === String(req.params.itemId));
  if (!item) return void res.status(404).json({ error: "Item não encontrado" });
  const photos = await Promise.all((item.fotos ?? []).map(async (storageUrl) => ({
    storageUrl, accessUrl: await measureStorage.getObjectEntitySignedUrl(storageUrl, 300),
  })));
  res.json({ photos });
});


const createArqdorDraftSchema = z.object({
  confirmed: z.literal(true),
  title: z.string().trim().min(3).max(180),
});

router.post("/operational-checklists/runs/:runId/create-arqdor-draft", async (req, res) => {
  const parsed = createArqdorDraftSchema.safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(422).json({ error: "Título e confirmação explícita são obrigatórios" });
  const [run] = await db.select().from(operationalChecklistRunsTable)
    .where(eq(operationalChecklistRunsTable.id, String(req.params.runId))).limit(1);
  if (!run) return void res.status(404).json({ error: "Levantamento não encontrado" });
  if (!canAccessTenant(req, run.tenantId)) return void res.status(403).json({ error: "Acesso negado" });
  const ownerId = req.user?.sub;
  if (!ownerId) return void res.status(401).json({ error: "Identificação do responsável obrigatória" });
  const elements = (run.items ?? []).flatMap((item) => item.surveyElements ?? []);
  const walls = elements.filter((element) => element.elementType === "wall");
  const openings = elements.filter((element) => element.elementType === "door" || element.elementType === "window");
  if (!walls.length || [...walls, ...openings].some((element) => !element.verified))
    return void res.status(409).json({ error: "Existem paredes ou aberturas não conferidas" });
  const ids = elements.map((element) => element.id);
  if (new Set(ids).size !== ids.length) return void res.status(409).json({ error: "Identificadores duplicados" });
  const validPoint = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1000000;
  if (walls.some((w) => ![w.x1Mm, w.y1Mm, w.x2Mm, w.y2Mm].every(validPoint) || Math.hypot((w.x2Mm ?? 0)-(w.x1Mm ?? 0), (w.y2Mm ?? 0)-(w.y1Mm ?? 0)) < 10))
    return void res.status(409).json({ error: "Paredes com coordenadas inválidas" });
  const endpoints = walls.flatMap((w) => [{ id:w.id, x:w.x1Mm!, y:w.y1Mm! }, { id:w.id, x:w.x2Mm!, y:w.y2Mm! }]);
  for (const wall of walls) {
    const start = endpoints.some((p) => p.id !== wall.id && Math.hypot(p.x-wall.x1Mm!,p.y-wall.y1Mm!) <= 5);
    const end = endpoints.some((p) => p.id !== wall.id && Math.hypot(p.x-wall.x2Mm!,p.y-wall.y2Mm!) <= 5);
    if (!start || !end) return void res.status(409).json({ error: "Existem extremidades de paredes desconectadas" });
  }
  for (const opening of openings) {
    const parent = walls.find((wall) => wall.id === opening.wallId && wall.roomName === opening.roomName);
    if (!parent || opening.offsetMm == null || opening.widthMm == null || opening.heightMm == null ||
        opening.widthMm <= 0 || opening.heightMm <= 0 || opening.offsetMm < 0 ||
        (opening.elementType === "window" && opening.sillHeightMm == null) ||
        opening.offsetMm + opening.widthMm > Math.hypot(parent.x2Mm!-parent.x1Mm!,parent.y2Mm!-parent.y1Mm!) + 0.01)
      return void res.status(409).json({ error: "Abertura não posicionada ou inválida" });
  }
  for (let i = 0; i < openings.length; i++) for (let j = i+1; j < openings.length; j++) {
    const a = openings[i], other = openings[j];
    if (a.wallId !== other.wallId) continue;
    if (a.offsetMm! < other.offsetMm! + other.widthMm! && other.offsetMm! < a.offsetMm! + a.widthMm! &&
        (a.sillHeightMm ?? 0) < (other.sillHeightMm ?? 0) + other.heightMm! &&
        (other.sillHeightMm ?? 0) < (a.sillHeightMm ?? 0) + a.heightMm!)
      return void res.status(409).json({ error: "Aberturas sobrepostas" });
  }
  const xs = endpoints.map((p) => p.x), ys = endpoints.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const width = (Math.max(...xs)-minX)/1000, depth = (Math.max(...ys)-minY)/1000;
  if (width <= 0 || depth <= 0) return void res.status(409).json({ error: "Planta sem largura ou profundidade" });
  const customWalls = walls.map((w) => ({ id:w.id, floor:0, x1:(w.x1Mm!-minX)/1000, y1:(w.y1Mm!-minY)/1000,
    x2:(w.x2Mm!-minX)/1000, y2:(w.y2Mm!-minY)/1000, thickness:(w.thicknessMm ?? 150)/1000 }));
  const customOpenings = openings.map((o) => ({ id:o.id, floor:0, wallId:o.wallId!, type:o.elementType as "door" | "window",
    offset:o.offsetMm!/1000, width:o.widthMm!/1000, height:o.heightMm!/1000, sillHeight:(o.sillHeightMm ?? 0)/1000 }));
  const [owner] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, ownerId), eq(usersTable.tenantId, run.tenantId))).limit(1);
  if (!owner)
    return void res.status(403).json({ error: "Responsável não pertence ao tenant" });
  try {
    const created = await db.transaction(async (tx) => {
      const sourceMarker = "Arqdor Measure checklist " + run.id + " R" + run.revision;
      // Serialize drafts for the same checklist/revision across concurrent requests.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sourceMarker}))`);
      const [existing] = await tx.select({ id: archProjetosTable.id }).from(archProjetosTable)
        .where(and(eq(archProjetosTable.tenantId, run.tenantId), eq(archProjetosTable.descricao, sourceMarker))).limit(1);
      if (existing) {
        const [linked] = await tx.select({ id: archConceptProjectsTable.id }).from(archConceptProjectsTable)
          .where(and(eq(archConceptProjectsTable.tenantId, run.tenantId), eq(archConceptProjectsTable.archProjetoId, existing.id))).limit(1);
        if (!linked) throw new Error("Rascunho Arqdor anterior não possui conceito vinculado");
        return { project: existing, concept: linked, reused: true };
      }
      const [project] = await tx.insert(archProjetosTable).values({
        tenantId: run.tenantId, leadId: run.leadId, dealId: run.dealId, propostaId: run.propostaId,
        titulo: parsed.data.title, descricao: sourceMarker,
        status: "briefing",
        dossieProjeto: { briefing: "Levantamento técnico de origem: " + run.id + ", revisão " + run.revision },
      }).returning();
      const [concept] = await tx.insert(archConceptProjectsTable).values({
        tenantId: run.tenantId, ownerUserId: ownerId, archProjetoId: project.id,
        title: parsed.data.title, status: "draft",
        lot: { width: Math.max(width,1), depth: Math.max(depth,1) }, rooms: [],
        configuration: { projectScope:"room", floors:1, desiredArea:width*depth, customWalls, customOpenings,
          startSourceChosen:true, terrainDefined:false },
      }).returning();
      return { project, concept, reused: false };
    });
    res.status(created.reused ? 200 : 201).json({ reused: created.reused, archProjetoId:created.project.id, conceptProjectId:created.concept.id,
      status:"draft", sourceRunId:run.id, sourceRevision:run.revision, fabricationReady:false });
  } catch (error) {
    req.log.error({ err:error, runId:run.id }, "arqdor-measure: draft creation failed");
    res.status(500).json({ error: "Falha ao criar rascunho Arqdor" });
  }
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
