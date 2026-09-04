import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
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

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function weeksForPeriod(periodoDias: number): number {
  if (periodoDias >= 90) return 13;
  if (periodoDias >= 60) return 8;
  return 4;
}

const gerarBodySchema = z.object({
  mediaPlanId: z.string().min(1),
  semanas: z.number().int().min(1).max(13).default(4),
  substituirPlanejado: z.boolean().optional().default(false),
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
    const { items } = await generateContentCalendar(
      tenantId,
      parsed.data.mediaPlanId,
      parsed.data.semanas,
      { substituirPlanejado: parsed.data.substituirPlanejado },
    );
    res.status(201).json(items);
  } catch (err) {
    if (err instanceof ContentCalendarError) {
      res.status(422).json({ error: err.message });
      return;
    }
    req.log.error({ err, tenantId }, "content-calendar: falha ao gerar");
    res.status(500).json({ error: "Falha ao gerar o calendário. Tente novamente." });
  }
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

  // Recuperação automática do fluxo do Planejador: se o plano mais recente
  // já possui campanhas, mas nenhuma linha do calendário foi persistida,
  // distribui as ações de forma determinística. Isso cobre falhas/timeout da
  // segunda etapa sem exigir que o usuário gere todo o plano novamente.
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
        await generateContentCalendar(
          tenantId,
          latestPlan.id,
          weeksForPeriod(latestPlan.conteudo.periodoDias ?? 30),
          { substituirPlanejado: true, refinarComIa: false },
        );
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
