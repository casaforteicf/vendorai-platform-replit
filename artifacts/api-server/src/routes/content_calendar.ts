import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  contentCalendarItemsTable,
  mediaPlansTable,
  CONTENT_CALENDAR_STATUS,
  CONTENT_CALENDAR_TIPOS,
} from "@workspace/db";
import { generateContentCalendar, ContentCalendarError } from "../services/content-calendar.js";

const router: IRouter = Router();
const CALENDAR_BATCH_SIZE = 10;

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
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
  const tenantId = String(req.params.tenantId);
  const mediaPlanId = String(req.params.mediaPlanId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
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
    .select({ id: contentCalendarItemsTable.id, tenantId: contentCalendarItemsTable.tenantId })
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
  const [updated] = await db
    .update(contentCalendarItemsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(contentCalendarItemsTable.id, existing.id))
    .returning();
  res.json(updated);
});

router.delete("/content-calendar/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: contentCalendarItemsTable.id, tenantId: contentCalendarItemsTable.tenantId })
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
