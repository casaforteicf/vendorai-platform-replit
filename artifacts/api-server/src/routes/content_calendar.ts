import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  contentCalendarItemsTable,
  contentGenerationsTable,
  mediaPlansTable,
  mediaProjectsTable,
  socialPublicationsTable,
  usersTable,
  dealsTable,
  leadsTable,
  CONTENT_CALENDAR_STATUS,
  CONTENT_CALENDAR_TIPOS,
} from "@workspace/db";
import { generateContentCalendar, ContentCalendarError } from "../services/content-calendar.js";
import { generationHasFinalVideo, isVideoCalendarType } from "../services/content-final-media.js";
import { selectTenantImageAssetIds } from "../services/media-plan-auto-production.js";
import { startVendorAiPhotoVideo } from "../services/vendorai-photo-video.js";
import { emitMarketingFunnelEvent } from "../services/marketing-funnel-events.js";
import {
  deriveOperationalState,
  derivePieceAction,
  derivePieceMediaState,
  transitionPiece,
  type OperationalStateCode,
} from "@workspace/vendor-brain/media-plan-execution";

const router: IRouter = Router();
const CALENDAR_BATCH_SIZE = 10;

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

/**
 * A aprovação/produção de um lote pode gerar custo real de IA. Por isso essa
 * autorização é mais estrita do que o acesso de leitura ao módulo.
 *
 * Libera somente:
 * - Super Admin;
 * - Tenant Admin;
 * - função Administrador;
 * - usuário do tenant com permissão EXPLÍCITA do módulo `content` (Marketing).
 *
 * Não aplicamos aqui os defaults legados por função: para liberar gasto de IA a
 * permissão de Marketing precisa estar gravada explicitamente quando o usuário
 * não é administrador.
 */
async function canReleaseMarketingBatch(req: import("express").Request, tenantId: string): Promise<boolean> {
  const user = req.user;
  if (!user) return false;
  if (user.platformRole === "super_admin") return true;
  if (user.tenantId !== tenantId) return false;
  if (user.platformRole === "tenant_admin" || user.userFunction === "administrador") return true;

  const [row] = await db
    .select({ permissions: usersTable.permissions })
    .from(usersTable)
    .where(and(eq(usersTable.id, user.id), eq(usersTable.tenantId, tenantId)))
    .limit(1);

  return Array.isArray(row?.permissions) && row.permissions.includes("content");
}

function weeksForPeriod(periodoDias: number): number {
  return Math.max(1, Math.min(53, Math.ceil(Math.max(1, periodoDias) / 7)));
}

async function generateCalendarBatch(input: {
  tenantId: string;
  mediaPlanId: string;
  semanas: number;
  substituirPlanejado: boolean;
  batchSize?: number;
}) {
  const batchSize = Math.max(1, Math.min(CALENDAR_BATCH_SIZE, input.batchSize ?? CALENDAR_BATCH_SIZE));
  const existing = await db
    .select({ id: contentCalendarItemsTable.id, status: contentCalendarItemsTable.status })
    .from(contentCalendarItemsTable)
    .where(
      and(
        eq(contentCalendarItemsTable.tenantId, input.tenantId),
        eq(contentCalendarItemsTable.mediaPlanId, input.mediaPlanId),
      ),
    );

  const pendingCount = existing.filter((item) => item.status === "planejado").length;
  if (!input.substituirPlanejado && pendingCount > 0) {
    throw new ContentCalendarError(
      `Existem ${pendingCount} ações do lote atual aguardando aprovação. Aprove ou recuse esse lote antes de gerar as próximas ${CALENDAR_BATCH_SIZE}.`,
    );
  }

  // Quando reconstruímos um lote em revisão, as ações planejadas atuais serão
  // removidas pelo serviço. Por isso o cursor considera apenas o que já foi
  // decidido (aprovado, recusado, gerado, publicado ou pulado).
  const offset = input.substituirPlanejado
    ? existing.filter((item) => item.status !== "planejado").length
    : existing.length;

  // A geração do calendário em lote é determinística e não precisa gastar IA.
  // O Plano de Mídia já contém a estratégia aprovada; aqui apenas materializamos
  // as próximas ações. Isso elimina uma chamada Anthropic de até 6k tokens por lote.
  const { items: generated } = await generateContentCalendar(
    input.tenantId,
    input.mediaPlanId,
    input.semanas,
    { substituirPlanejado: input.substituirPlanejado, refinarComIa: false },
  );

  const batch = generated.slice(offset, offset + batchSize);
  const keep = new Set(batch.map((item) => item.id));
  const discardIds = generated.filter((item) => !keep.has(item.id)).map((item) => item.id);

  if (discardIds.length > 0) {
    await db
      .delete(contentCalendarItemsTable)
      .where(inArray(contentCalendarItemsTable.id, discardIds));
  }

  return batch;
}

const gerarBodySchema = z.object({
  mediaPlanId: z.string().min(1),
  semanas: z.number().int().min(1).max(53).default(4),
  substituirPlanejado: z.boolean().optional().default(false),
  batchSize: z.number().int().min(1).max(CALENDAR_BATCH_SIZE).optional().default(CALENDAR_BATCH_SIZE),
});

router.post("/tenants/:tenantId/content-calendar/gerar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const parsed = gerarBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  try {
    const items = await generateCalendarBatch({
      tenantId,
      mediaPlanId: parsed.data.mediaPlanId,
      semanas: parsed.data.semanas,
      substituirPlanejado: parsed.data.substituirPlanejado,
      batchSize: parsed.data.batchSize,
    });
    res.status(201).json(items);
  } catch (err) {
    if (err instanceof ContentCalendarError) {
      res.status(409).json({ error: err.message });
      return;
    }
    req.log.error({ err, tenantId }, "content-calendar: falha ao gerar");
    res.status(500).json({ error: "Falha ao gerar o calendário. Tente novamente." });
  }
});

const approveBatchBodySchema = z.object({
  limit: z.number().int().min(1).max(CALENDAR_BATCH_SIZE).optional().default(CALENDAR_BATCH_SIZE),
});

router.post("/tenants/:tenantId/content-calendar/:mediaPlanId/aprovar-lote", async (req, res) => {
  // tenant-audit: reviewed guarded by canAccess and plan tenant ownership check below
  const tenantId = String(req.params.tenantId);
  const mediaPlanId = String(req.params.mediaPlanId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!(await canReleaseMarketingBatch(req, tenantId))) {
    res.status(403).json({
      error: "Somente Administradores, Super Admins ou usuários com permissão explícita de Marketing podem aprovar um lote.",
      code: "MARKETING_BATCH_PERMISSION_REQUIRED",
    });
    return;
  }

  const parsed = approveBatchBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [plan] = await db
    .select({ id: mediaPlansTable.id, tenantId: mediaPlansTable.tenantId, conteudo: mediaPlansTable.conteudo })
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.id, mediaPlanId))
    .limit(1);

  if (!plan || plan.tenantId !== tenantId) {
    res.status(404).json({ error: "Plano de mídia não encontrado" });
    return;
  }
  if (plan.conteudo.statusPlanejamento !== "aprovado") {
    res.status(422).json({ error: "Aprove primeiro a direção do Plano de Mídia antes de liberar um lote para produção." });
    return;
  }

  const pending = await db
    .select({ id: contentCalendarItemsTable.id })
    .from(contentCalendarItemsTable)
    .where(
      and(
        eq(contentCalendarItemsTable.tenantId, tenantId),
        eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId),
        eq(contentCalendarItemsTable.status, "planejado"),
      ),
    )
    .orderBy(asc(contentCalendarItemsTable.dataAgendada), asc(contentCalendarItemsTable.createdAt))
    .limit(parsed.data.limit);

  if (pending.length === 0) {
    res.json({ approved: 0, items: [] });
    return;
  }

  const ids = pending.map((item) => item.id);
  const items = await db
    .update(contentCalendarItemsTable)
    .set({ status: "aprovado", updatedAt: new Date() })
    .where(
      and(
        eq(contentCalendarItemsTable.tenantId, tenantId),
        eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId),
        inArray(contentCalendarItemsTable.id, ids),
        eq(contentCalendarItemsTable.status, "planejado"),
      ),
    )
    .returning();

  res.json({ approved: items.length, items });
});

/**
 * Gate sem consumo de IA. O frontend precisa passar por aqui imediatamente
 * antes de iniciar a materialização de um lote. A resposta limita a produção
 * aos 10 primeiros itens aprovados ainda sem conteúdo gerado.
 */
router.post("/tenants/:tenantId/content-calendar/:mediaPlanId/autorizar-producao-lote", async (req, res) => {
  // tenant-audit: reviewed same-tenant access + explicit paid-Marketing permission gate below
  const tenantId = String(req.params.tenantId);
  const mediaPlanId = String(req.params.mediaPlanId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!(await canReleaseMarketingBatch(req, tenantId))) {
    res.status(403).json({
      authorized: false,
      error: "Somente Administradores, Super Admins ou usuários com permissão explícita de Marketing podem iniciar produção com IA.",
      code: "MARKETING_BATCH_PERMISSION_REQUIRED",
    });
    return;
  }

  const [plan] = await db
    .select({ id: mediaPlansTable.id, tenantId: mediaPlansTable.tenantId, conteudo: mediaPlansTable.conteudo })
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.id, mediaPlanId))
    .limit(1);

  if (!plan || plan.tenantId !== tenantId) {
    res.status(404).json({ authorized: false, error: "Plano de mídia não encontrado" });
    return;
  }
  if (plan.conteudo.statusPlanejamento !== "aprovado") {
    res.status(422).json({ authorized: false, error: "O Plano de Mídia precisa estar aprovado antes da produção." });
    return;
  }

  const items = await db
    .select({ id: contentCalendarItemsTable.id })
    .from(contentCalendarItemsTable)
    .where(
      and(
        eq(contentCalendarItemsTable.tenantId, tenantId),
        eq(contentCalendarItemsTable.mediaPlanId, mediaPlanId),
        eq(contentCalendarItemsTable.status, "aprovado"),
        isNull(contentCalendarItemsTable.contentGenerationId),
      ),
    )
    .orderBy(asc(contentCalendarItemsTable.dataAgendada), asc(contentCalendarItemsTable.createdAt))
    .limit(CALENDAR_BATCH_SIZE);

  res.json({
    authorized: true,
    items: items.length,
    itemIds: items.map((item) => item.id),
    batchSize: CALENDAR_BATCH_SIZE,
  });
});


const VISUAL_REQUIRED_TYPES = new Set(["feed", "stories", "carrossel", "linkedin_post", "meta_ad", "search_ad", "display_ad", "performance_max"]);

function generationHasVisual(result: unknown): boolean {
  const payload = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : {};
  const variations = Array.isArray(payload["variations"]) ? payload["variations"] : [];
  for (const variation of variations) {
    if (!variation || typeof variation !== "object" || Array.isArray(variation)) continue;
    const row = variation as Record<string, unknown>;
    if (typeof row["imageUrl"] === "string" && row["imageUrl"].trim()) return true;
    if (Array.isArray(row["imageUrls"]) && row["imageUrls"].some((url) => typeof url === "string" && url.trim())) return true;
  }
  return false;
}

type PieceRow = {
  id: string;
  tipo: string;
  canal: string;
  temaSugerido: string;
  status: string;
  contentGenerationId: string | null;
  dataAgendada: string | null;
  contentIdPublicado: string | null;
  generationResult: unknown;
  createdAt: string | null;
  updatedAt: string | null;
};

function derivePieceView(
  row: PieceRow,
  publicationStatus: string | null,
  materializationStatus: string | null,
  publishedAt: string | null = null,
) {
  const claim = String(row.contentGenerationId ?? "").startsWith("producing:");
  const hasGeneration = Boolean(row.contentGenerationId) && !claim;
  const isVideo = isVideoCalendarType(row.tipo);
  const hasFinalVideo = generationHasFinalVideo(row.generationResult as { variations?: unknown; automation?: unknown } | null);
  const visualRequired = VISUAL_REQUIRED_TYPES.has(row.tipo);
  const hasVisual = !visualRequired || generationHasVisual(row.generationResult);
  const state = deriveOperationalState({
    calendarStatus: row.status,
    hasGeneration,
    isVideo,
    hasFinalVideo,
    publicationStatus,
    materializationStatus,
    producing: claim,
  });
  const media = derivePieceMediaState({
    calendarStatus: row.status,
    hasGeneration,
    isVideo,
    hasFinalVideo,
    hasVisual,
    publicationStatus,
    materializationStatus,
    producing: claim,
  });
  const action = derivePieceAction(state.code, media);
  const automation = row.generationResult && typeof row.generationResult === "object" && !Array.isArray(row.generationResult)
    ? (row.generationResult as Record<string, unknown>)["automation"]
    : null;
  const failureReason = automation && typeof automation === "object" && !Array.isArray(automation)
    ? (automation as Record<string, unknown>)["error"]
    : null;
  return {
    id: row.id,
    tipo: row.tipo,
    canal: row.canal,
    temaSugerido: row.temaSugerido,
    dataAgendada: row.dataAgendada,
    status: state,
    media,
    action,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt,
    failureReason: typeof failureReason === "string" && failureReason.trim() ? failureReason : null,
  };
}

async function loadPieceContext(tenantId: string, pieceId?: string) {
  const conditions = [eq(contentCalendarItemsTable.tenantId, tenantId)];
  if (pieceId) conditions.push(eq(contentCalendarItemsTable.id, pieceId));
  const rows = await db
    .select({
      id: contentCalendarItemsTable.id,
      tipo: contentCalendarItemsTable.tipo,
      canal: contentCalendarItemsTable.canal,
      temaSugerido: contentCalendarItemsTable.temaSugerido,
      status: contentCalendarItemsTable.status,
      contentGenerationId: contentCalendarItemsTable.contentGenerationId,
      dataAgendada: contentCalendarItemsTable.dataAgendada,
      contentIdPublicado: contentCalendarItemsTable.contentIdPublicado,
      generationResult: contentGenerationsTable.result,
      createdAt: contentCalendarItemsTable.createdAt,
      updatedAt: contentCalendarItemsTable.updatedAt,
      materializationStatus: mediaProjectsTable.context,
    })
    .from(contentCalendarItemsTable)
    .leftJoin(contentGenerationsTable, and(
      eq(contentGenerationsTable.id, contentCalendarItemsTable.contentGenerationId),
      eq(contentGenerationsTable.tenantId, contentCalendarItemsTable.tenantId),
    ))
    .leftJoin(mediaProjectsTable, and(
      eq(mediaProjectsTable.tenantId, contentCalendarItemsTable.tenantId),
      sql`${mediaProjectsTable.context}->>'calendarItemId' = ${contentCalendarItemsTable.id}`,
    ))
    .where(and(...conditions))
    .orderBy(desc(contentCalendarItemsTable.updatedAt))
    .limit(pieceId ? 1 : 200);

  const publications = await db
    .select({
      calendarItemId: sql<string>`${socialPublicationsTable.metadata}->>'calendarItemId'`,
      status: socialPublicationsTable.status,
      publishedAt: socialPublicationsTable.publishedAt,
    })
    .from(socialPublicationsTable)
    .where(eq(socialPublicationsTable.tenantId, tenantId))
    .orderBy(desc(socialPublicationsTable.createdAt))
    .limit(500);
  const publicationByItem = new Map<string, { status: string; publishedAt: string | null }>();
  for (const publication of publications) {
    if (publication.calendarItemId && !publicationByItem.has(publication.calendarItemId)) {
      publicationByItem.set(publication.calendarItemId, {
        status: publication.status,
        publishedAt: publication.publishedAt ? new Date(publication.publishedAt).toISOString() : null,
      });
    }
  }

  return rows.map((row) => {
    const projectContext = row.materializationStatus && typeof row.materializationStatus === "object" && !Array.isArray(row.materializationStatus)
      ? row.materializationStatus as Record<string, unknown>
      : {};
    const materialization = typeof projectContext["materializationStatus"] === "string" ? String(projectContext["materializationStatus"]) : null;
    const publication = publicationByItem.get(row.id);
    return derivePieceView(row as PieceRow, publication?.status ?? null, materialization, publication?.publishedAt ?? null);
  });
}

router.get("/tenants/:tenantId/marketing/attribution", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const rows = await db
    .select({
      campaignId: leadsTable.originCampaignId,
      deals: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${dealsTable.valor}), 0)::text`,
    })
    .from(dealsTable)
    .innerJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .where(and(
      eq(dealsTable.tenantId, tenantId),
      isNotNull(leadsTable.originCampaignId),
      isNotNull(dealsTable.valor),
    ))
    .groupBy(leadsTable.originCampaignId)
    .orderBy(desc(sql`coalesce(sum(${dealsTable.valor}), 0)`))
    .limit(10);
  res.json({
    campaigns: rows.map((row) => ({
      campaignId: row.campaignId,
      deals: Number(row.deals ?? 0),
      total: Number(row.total ?? 0),
    })),
  });
});

router.get("/tenants/:tenantId/marketing/pieces", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const pieces = await loadPieceContext(tenantId);
  res.json({ pieces });
});

const pieceTransitionSchema = z.object({ action: z.enum(["approve", "reject", "release"]) });

router.post("/tenants/:tenantId/marketing/pieces/:id/transition", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const parsed = pieceTransitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: "Ação inválida.", code: "INVALID_PIECE_ACTION" });
    return;
  }

  const [piece] = await loadPieceContext(tenantId, String(req.params.id));
  if (!piece) {
    res.status(404).json({ error: "Peça não encontrada." });
    return;
  }

  const targetByAction: Record<typeof parsed.data.action, OperationalStateCode> = {
    approve: "approved",
    reject: "rejected",
    release: "authorized",
  };
  const target = targetByAction[parsed.data.action];

  if (parsed.data.action !== "reject" && !(await canReleaseMarketingBatch(req, tenantId))) {
    res.status(403).json({
      error: "Permissão de Marketing necessária para liberar ou aprovar esta peça.",
      code: "MARKETING_BATCH_PERMISSION_REQUIRED",
    });
    return;
  }
  if (parsed.data.action === "approve" && piece.media !== "ready") {
    res.status(422).json({
      error: "A mídia final ainda não está pronta. Gere ou monte o vídeo antes de aprovar.",
      code: "MEDIA_NOT_READY",
    });
    return;
  }

  try {
    transitionPiece(piece.status.code, target);
  } catch (error) {
    res.status(422).json({
      error: error instanceof Error ? error.message : "Transição inválida.",
      code: "INVALID_PIECE_TRANSITION",
      from: piece.status.code,
      to: target,
    });
    return;
  }

  const nextStatus = target === "approved" || target === "authorized" ? "aprovado" : target === "rejected" ? "recusado" : null;
  if (!nextStatus) {
    res.status(422).json({ error: "Transição sem status de calendário correspondente.", code: "INVALID_PIECE_TRANSITION" });
    return;
  }
  await db
    .update(contentCalendarItemsTable)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(and(eq(contentCalendarItemsTable.id, piece.id), eq(contentCalendarItemsTable.tenantId, tenantId)));

  emitMarketingFunnelEvent(
    parsed.data.action === "approve" ? "piece.approved" : parsed.data.action === "reject" ? "piece.rejected" : "piece.released",
    {
      tenantId,
      pieceId: piece.id,
      tipo: piece.tipo,
      canal: piece.canal,
      media: piece.media,
    },
  );

  const [updated] = await loadPieceContext(tenantId, piece.id);
  res.json({ piece: updated ?? piece });
});

router.get("/tenants/:tenantId/content-calendar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const conditions = [eq(contentCalendarItemsTable.tenantId, tenantId)];
  const inicio = req.query["inicio"];
  const fim = req.query["fim"];
  if (typeof inicio === "string") conditions.push(gte(contentCalendarItemsTable.dataAgendada, inicio));
  if (typeof fim === "string") conditions.push(lte(contentCalendarItemsTable.dataAgendada, fim));

  let items = await db
    .select()
    .from(contentCalendarItemsTable)
    .where(and(...conditions))
    .orderBy(asc(contentCalendarItemsTable.dataAgendada));

  if (typeof inicio !== "string" && typeof fim !== "string") {
    const [latestPlan] = await db
      .select()
      .from(mediaPlansTable)
      .where(eq(mediaPlansTable.tenantId, tenantId))
      .orderBy(desc(mediaPlansTable.createdAt))
      .limit(1);

    const hasLatestPlanItems = latestPlan
      ? items.some((item) => item.mediaPlanId === latestPlan.id)
      : true;

    if (latestPlan && !hasLatestPlanItems && (latestPlan.conteudo.campanhas?.length ?? 0) > 0) {
      try {
        await generateCalendarBatch({
          tenantId,
          mediaPlanId: latestPlan.id,
          semanas: weeksForPeriod(latestPlan.conteudo.periodoDias ?? 30),
          substituirPlanejado: true,
          batchSize: CALENDAR_BATCH_SIZE,
        });
        items = await db
          .select()
          .from(contentCalendarItemsTable)
          .where(and(...conditions))
          .orderBy(asc(contentCalendarItemsTable.dataAgendada));
      } catch (err) {
        req.log.warn({ err, tenantId, mediaPlanId: latestPlan.id }, "content-calendar: recuperação automática falhou");
      }
    }
  }

  res.json(items);
});

/**
 * Claim atômico de produção para a tela (fila/bridge).
 *
 * O worker já reivindica itens com `auto-producing:<uuid>`; a tela não tinha
 * nada equivalente e duas abas podiam gastar IA duas vezes no mesmo item.
 * A regra aqui é conservadora: só reivindica item aprovado e ainda sem
 * geração. Item que já tem geração retorna `claimed:false` sem erro, porque
 * regeneração é uma decisão editorial do usuário e não deve ser bloqueada.
 */
router.post("/tenants/:tenantId/content-calendar/:id/iniciar-producao", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const itemId = String(req.params.id);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (!(await canReleaseMarketingBatch(req, tenantId))) {
    res.status(403).json({ error: "Permissão de Marketing necessária para produzir este lote.", code: "MARKETING_BATCH_PERMISSION_REQUIRED" });
    return;
  }

  const [item] = await db
    .select({
      id: contentCalendarItemsTable.id,
      tenantId: contentCalendarItemsTable.tenantId,
      status: contentCalendarItemsTable.status,
      tipo: contentCalendarItemsTable.tipo,
      contentGenerationId: contentCalendarItemsTable.contentGenerationId,
    })
    .from(contentCalendarItemsTable)
    .where(and(eq(contentCalendarItemsTable.id, itemId), eq(contentCalendarItemsTable.tenantId, tenantId)))
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Ação do calendário não encontrada." });
    return;
  }
  if (item.status === "processando") {
    res.status(409).json({ error: "Esta ação já está em produção.", code: "PRODUCTION_ALREADY_CLAIMED" });
    return;
  }
  if (item.status !== "aprovado" && item.status !== "gerado") {
    res.status(409).json({ error: "A ação precisa estar aprovada para entrar em produção.", code: "ITEM_NOT_AUTHORIZED" });
    return;
  }
  if (item.contentGenerationId && !item.contentGenerationId.startsWith("producing:")) {
    res.json({ claimed: false, claimId: null, reason: "already-produced" });
    return;
  }
  if (item.contentGenerationId?.startsWith("producing:")) {
    res.status(409).json({ error: "Esta ação já está em produção.", code: "PRODUCTION_ALREADY_CLAIMED" });
    return;
  }

  const claim = `producing:${crypto.randomUUID()}`;
  const [claimed] = await db
    .update(contentCalendarItemsTable)
    .set({ contentGenerationId: claim, updatedAt: new Date() })
    .where(and(
      eq(contentCalendarItemsTable.id, item.id),
      eq(contentCalendarItemsTable.tenantId, tenantId),
      isNull(contentCalendarItemsTable.contentGenerationId),
      inArray(contentCalendarItemsTable.status, ["aprovado", "gerado"]),
    ))
    .returning({ id: contentCalendarItemsTable.id });

  if (!claimed) {
    res.status(409).json({ error: "Outra produção começou para esta ação.", code: "PRODUCTION_ALREADY_CLAIMED" });
    return;
  }
  emitMarketingFunnelEvent("piece.production_requested", {
    tenantId,
    pieceId: item.id,
    tipo: item.tipo,
    media: "pending",
  });
  res.status(201).json({ claimed: true, claimId: claim });
});

const patchBodySchema = z.object({
  status: z.enum(CONTENT_CALENDAR_STATUS).optional(),
  contentGenerationId: z.string().nullable().optional(),
  variationIdx: z.number().int().nullable().optional(),
  contentIdPublicado: z.string().nullable().optional(),
  temaSugerido: z.string().min(1).optional(),
  dataAgendada: z.string().optional(),
  pilar: z.string().min(1).optional(),
  canal: z.string().min(1).optional(),
  tipo: z.enum(CONTENT_CALENDAR_TIPOS).optional(),
});

router.patch("/content-calendar/:id", async (req, res) => {
  const [existing] = await db
    .select({
      id: contentCalendarItemsTable.id,
      tenantId: contentCalendarItemsTable.tenantId,
      status: contentCalendarItemsTable.status,
      tipo: contentCalendarItemsTable.tipo,
      contentGenerationId: contentCalendarItemsTable.contentGenerationId,
    })
    .from(contentCalendarItemsTable)
    .where(eq(contentCalendarItemsTable.id, String(req.params.id)));
  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  if (!canAccess(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = patchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // Evita que um usuário sem autorização contorne o gate de lote marcando um
  // item diretamente como aprovado/gerado pelo endpoint genérico de PATCH.
  const touchesPaidLifecycle = parsed.data.status === "aprovado"
    || parsed.data.status === "gerado"
    || (parsed.data.contentGenerationId !== undefined && parsed.data.contentGenerationId !== null);
  if (touchesPaidLifecycle && !(await canReleaseMarketingBatch(req, existing.tenantId))) {
    res.status(403).json({
      error: "Permissão de Marketing necessária para liberar ou registrar produção deste lote.",
      code: "MARKETING_BATCH_PERMISSION_REQUIRED",
    });
    return;
  }

  // Reels/Shorts só podem ser aprovados com o arquivo final de vídeo. Sem isso
  // o item entrava na fila de publicação e falhava sem aviso claro na tela.
  if (
    parsed.data.status === "aprovado"
    && existing.status !== "aprovado"
    && isVideoCalendarType(existing.tipo)
  ) {
    const [generation] = existing.contentGenerationId
      ? await db
          .select({ result: contentGenerationsTable.result })
          .from(contentGenerationsTable)
          .where(and(
            eq(contentGenerationsTable.id, existing.contentGenerationId),
            eq(contentGenerationsTable.tenantId, existing.tenantId),
          ))
          .limit(1)
      : [];
    if (!generation || !generationHasFinalVideo(generation.result as { variations?: unknown; automation?: unknown } | null)) {
      res.status(422).json({
        error: "Este vídeo ainda não tem arquivo final. Gere ou monte o vídeo antes de aprovar — a publicação falharia sem a mídia.",
        code: "VIDEO_NOT_READY",
      });
      return;
    }
  }

  const [updated] = await db
    .update(contentCalendarItemsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(contentCalendarItemsTable.id, existing.id))
    .returning();
  res.json(updated);
});


/**
 * Monta um vídeo vertical com as fotos do tenant para um item de vídeo do
 * Plano de Mídia. Ação explícita do usuário — não depende de provedor de IA de
 * vídeo nem da varredura automática do worker.
 */
router.post("/tenants/:tenantId/content-calendar/:id/photo-video", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [item] = await db
    .select({
      id: contentCalendarItemsTable.id,
      tipo: contentCalendarItemsTable.tipo,
      temaSugerido: contentCalendarItemsTable.temaSugerido,
      status: contentCalendarItemsTable.status,
      contentGenerationId: contentCalendarItemsTable.contentGenerationId,
    })
    .from(contentCalendarItemsTable)
    .where(and(
      eq(contentCalendarItemsTable.id, String(req.params.id)),
      eq(contentCalendarItemsTable.tenantId, tenantId),
    ))
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }
  if (!isVideoCalendarType(item.tipo)) {
    res.status(422).json({ error: "Este item não é um formato de vídeo." });
    return;
  }
  if (item.contentGenerationId) {
    const [generation] = await db
      .select({ result: contentGenerationsTable.result })
      .from(contentGenerationsTable)
      .where(and(
        eq(contentGenerationsTable.id, item.contentGenerationId),
        eq(contentGenerationsTable.tenantId, tenantId),
      ))
      .limit(1);
    if (generation && generationHasFinalVideo(generation.result as { variations?: unknown; automation?: unknown } | null)) {
      res.status(409).json({ error: "Este vídeo já tem arquivo final." });
      return;
    }
  }

  const assetIds = await selectTenantImageAssetIds(tenantId, 4);
  if (assetIds.length < 2) {
    res.status(422).json({
      error: "Envie pelo menos 2 fotos do negócio para a Biblioteca (fotos com upload/importação) para montar o vídeo.",
    });
    return;
  }

  const job = await startVendorAiPhotoVideo({
    tenantId,
    userId: req.user?.sub ?? null,
    title: `Vídeo do Plano de Mídia · ${item.temaSugerido}`.slice(0, 120),
    assetIds,
    secondsPerImage: 4,
    format: "9:16",
    fit: "cover",
  });

  if (item.contentGenerationId) {
    const [generation] = await db
      .select({ result: contentGenerationsTable.result })
      .from(contentGenerationsTable)
      .where(and(
        eq(contentGenerationsTable.id, item.contentGenerationId),
        eq(contentGenerationsTable.tenantId, tenantId),
      ))
      .limit(1);
    if (generation) {
      const result = (generation.result ?? {}) as Record<string, unknown>;
      const automation = result["automation"] && typeof result["automation"] === "object" && !Array.isArray(result["automation"])
        ? result["automation"] as Record<string, unknown>
        : {};
      await db
        .update(contentGenerationsTable)
        .set({
          result: {
            ...result,
            automation: {
              ...automation,
              status: "video_processing",
              jobId: job.jobId,
              projectId: job.projectId,
              photoFallbackAt: new Date().toISOString(),
              error: null,
              updatedAt: new Date().toISOString(),
            },
          } as any,
        })
        .where(and(
          eq(contentGenerationsTable.id, item.contentGenerationId),
          eq(contentGenerationsTable.tenantId, tenantId),
        ));
    }
  }

  const [planProject] = await db
    .select({ id: mediaProjectsTable.id, context: mediaProjectsTable.context })
    .from(mediaProjectsTable)
    .where(and(
      eq(mediaProjectsTable.tenantId, tenantId),
      sql`${mediaProjectsTable.context}->>'calendarItemId' = ${item.id}`,
    ))
    .limit(1);

  if (planProject) {
    await db
      .update(mediaProjectsTable)
      .set({
        status: "processing",
        updatedAt: new Date(),
        context: {
          ...(planProject.context ?? {}),
          executorProjectId: job.projectId,
          executorJobId: job.jobId,
          materializationStatus: "processing",
          executorDetail: null,
        },
      })
      .where(eq(mediaProjectsTable.id, planProject.id));
  }

  res.status(202).json({
    jobId: job.jobId,
    projectId: job.projectId,
    assetCount: assetIds.length,
  });
});

router.delete("/content-calendar/:id", async (req, res) => {
  const [existing] = await db
    .select({
      id: contentCalendarItemsTable.id,
      tenantId: contentCalendarItemsTable.tenantId,
      status: contentCalendarItemsTable.status,
      tipo: contentCalendarItemsTable.tipo,
      contentGenerationId: contentCalendarItemsTable.contentGenerationId,
    })
    .from(contentCalendarItemsTable)
    .where(eq(contentCalendarItemsTable.id, String(req.params.id)));
  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  if (!canAccess(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  await db.delete(contentCalendarItemsTable).where(eq(contentCalendarItemsTable.id, existing.id));
  res.status(204).send();
});

export default router;
