import { Router, type IRouter } from "express";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";
import { db, contentCalendarItemsTable, CONTENT_CALENDAR_STATUS } from "@workspace/db";
import { generateContentCalendar, ContentCalendarError } from "../services/content-calendar.js";

const router: IRouter = Router();

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const gerarBodySchema = z.object({
  mediaPlanId: z.string().min(1),
  semanas: z.number().int().min(1).max(8).default(2),
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
    const { items } = await generateContentCalendar(tenantId, parsed.data.mediaPlanId, parsed.data.semanas);
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

  const items = await db
    .select()
    .from(contentCalendarItemsTable)
    .where(and(...conditions))
    .orderBy(asc(contentCalendarItemsTable.dataAgendada));
  res.json(items);
});

const patchBodySchema = z.object({
  status: z.enum(CONTENT_CALENDAR_STATUS).optional(),
  contentGenerationId: z.string().nullable().optional(),
  variationIdx: z.number().int().nullable().optional(),
  contentIdPublicado: z.string().nullable().optional(),
  temaSugerido: z.string().optional(),
  dataAgendada: z.string().optional(),
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
