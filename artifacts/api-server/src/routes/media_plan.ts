import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, contentCalendarItemsTable, mediaPlansTable, type MediaPlanConteudo } from "@workspace/db";
import { generateMediaPlan, MediaPlanError } from "../services/media-plan.js";
import { enrichMediaPlanForPeriod } from "../services/media-plan-period.js";

const router: IRouter = Router();

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const periodSchema = z.union([z.literal(30), z.literal(60), z.literal(90)]);
const generateBodySchema = z.object({
  periodoDias: periodSchema.default(30),
});

router.post("/tenants/:tenantId/media-plan/gerar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const parsed = generateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  try {
    const { plan } = await generateMediaPlan(tenantId, req.user?.sub ?? null);
    const conteudo = await enrichMediaPlanForPeriod(tenantId, plan.conteudo, parsed.data.periodoDias);
    const [updated] = await db
      .update(mediaPlansTable)
      .set({ conteudo })
      .where(eq(mediaPlansTable.id, plan.id))
      .returning();
    res.status(201).json(updated ?? { ...plan, conteudo });
  } catch (err) {
    if (err instanceof MediaPlanError) {
      res.status(422).json({ error: err.message });
      return;
    }
    req.log.error({ err, tenantId }, "media-plan: falha ao gerar plano");
    res.status(500).json({ error: "Falha ao gerar o plano de mídia. Tente novamente." });
  }
});

router.get("/tenants/:tenantId/media-plan", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const [latest] = await db
    .select()
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.tenantId, tenantId))
    .orderBy(desc(mediaPlansTable.createdAt))
    .limit(1);
  res.json(latest ?? null);
});

// Atualiza, no próprio registro, planos criados antes da estrutura 30/60/90.
// Isso evita obrigar o cliente a descartar o planejamento que já estava salvo
// e corrige o caso visto em produção: "0 campanhas" + calendário só Instagram.
const completeBodySchema = z.object({
  periodoDias: periodSchema.optional(),
});

router.post("/tenants/:tenantId/media-plan/:planId/completar", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const parsed = completeBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.id, String(req.params.planId)))
    .limit(1);
  if (!existing || existing.tenantId !== tenantId) {
    res.status(404).json({ error: "Plano de mídia não encontrado" });
    return;
  }

  if ((existing.conteudo.campanhas?.length ?? 0) > 0) {
    res.json(existing);
    return;
  }

  try {
    const periodoDias = parsed.data.periodoDias ?? existing.conteudo.periodoDias ?? 30;
    const conteudo = await enrichMediaPlanForPeriod(tenantId, existing.conteudo, periodoDias);
    const [updated] = await db
      .update(mediaPlansTable)
      .set({ conteudo })
      .where(eq(mediaPlansTable.id, existing.id))
      .returning();
    res.json(updated ?? { ...existing, conteudo });
  } catch (err) {
    req.log.error({ err, tenantId, planId: existing.id }, "media-plan: falha ao completar plano legado");
    res.status(500).json({ error: "Não foi possível completar este planejamento. Tente novamente." });
  }
});

const patchBodySchema = z.object({
  patch: z.record(z.string(), z.unknown()).optional(),
  aprovar: z.boolean().optional(),
});

router.patch("/tenants/:tenantId/media-plan/:planId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const parsed = patchBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.id, String(req.params.planId)))
    .limit(1);
  if (!existing || existing.tenantId !== tenantId) {
    res.status(404).json({ error: "Plano de mídia não encontrado" });
    return;
  }

  const nextConteudo = {
    ...existing.conteudo,
    ...(parsed.data.patch ?? {}),
  } as MediaPlanConteudo;

  if (parsed.data.aprovar === true) {
    if ((nextConteudo.campanhas?.length ?? 0) === 0) {
      res.status(422).json({ error: "O planejamento precisa ter campanhas antes da aprovação." });
      return;
    }
    nextConteudo.statusPlanejamento = "aprovado";
    nextConteudo.aprovadoEm = new Date().toISOString();
    nextConteudo.versaoPlanejamento = Math.max(1, nextConteudo.versaoPlanejamento ?? 1);
  } else if (parsed.data.patch && nextConteudo.statusPlanejamento === "aprovado") {
    nextConteudo.statusPlanejamento = "em_revisao";
    nextConteudo.aprovadoEm = null;
    nextConteudo.versaoPlanejamento = (nextConteudo.versaoPlanejamento ?? 1) + 1;
  }

  const [updated] = await db
    .update(mediaPlansTable)
    .set({ conteudo: nextConteudo })
    .where(eq(mediaPlansTable.id, existing.id))
    .returning();

  if (parsed.data.aprovar === true) {
    // Aprovar o plano inteiro aprova automaticamente todas as ações que ainda
    // estavam pendentes. Itens recusados continuam recusados e são preservados.
    await db
      .update(contentCalendarItemsTable)
      .set({ status: "aprovado", updatedAt: new Date() })
      .where(
        and(
          eq(contentCalendarItemsTable.tenantId, tenantId),
          eq(contentCalendarItemsTable.mediaPlanId, existing.id),
          eq(contentCalendarItemsTable.status, "planejado"),
        ),
      );
  }

  res.json(updated);
});

router.get("/tenants/:tenantId/media-plan/historico", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const rows = await db
    .select({ id: mediaPlansTable.id, createdAt: mediaPlansTable.createdAt, conteudo: mediaPlansTable.conteudo })
    .from(mediaPlansTable)
    .where(eq(mediaPlansTable.tenantId, tenantId))
    .orderBy(desc(mediaPlansTable.createdAt))
    .limit(20);
  res.json(rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    periodoDias: row.conteudo.periodoDias ?? 30,
    campanhas: row.conteudo.campanhas?.length ?? 0,
    statusPlanejamento: row.conteudo.statusPlanejamento ?? "gerado",
  })));
});

export default router;
