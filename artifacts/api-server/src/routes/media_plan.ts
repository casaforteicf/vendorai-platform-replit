import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, contentCalendarItemsTable, mediaPlansTable, type MediaPlanConteudo } from "@workspace/db";
import { generateMediaPlan, MediaPlanError } from "../services/media-plan.js";
import { alignMediaFunctionsInContent, enrichMediaPlanForPeriod } from "../services/media-plan-period.js";
import { MEDIA_FUNCTION_VERSION } from "../services/media-channel-functions.js";

const router: IRouter = Router();

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const periodSchema = z.union([z.literal(30), z.literal(60), z.literal(90)]);
const generateBodySchema = z.object({
  periodoDias: periodSchema.default(30),
});

function normalizedChannel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function hasRequiredMultichannelCoverage(conteudo: MediaPlanConteudo): boolean {
  const campaigns = conteudo.campanhas ?? [];
  if (campaigns.length === 0) return false;
  const channels = new Set(campaigns.flatMap((campaign) => campaign.canais.map((channel) => normalizedChannel(channel.canal))));
  const values = Array.from(channels);
  const hasIntent = values.some((channel) => channel.includes("google") || channel.includes("search") || channel.includes("pesquisa"));
  const hasPaidSocial = values.some((channel) => channel.includes("meta ads") || channel.includes("facebook ads"));
  const hasDirect = values.some((channel) => channel.includes("whatsapp") || channel.includes("email") || channel.includes("e-mail"));
  const hasOwnedOrOrganic = values.some((channel) => channel.includes("instagram") || channel.includes("landing") || channel.includes("site") || channel.includes("blog") || channel.includes("seo"));
  return channels.size >= 4 && hasIntent && hasPaidSocial && hasDirect && hasOwnedOrOrganic;
}

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

  if (!latest) {
    res.json(null);
    return;
  }

  // Adequa planos já salvos sem replanejar campanhas, trocar mensagens ou
  // mexer no status de aprovação. Só corrige a função operacional de cada mídia.
  if ((latest.conteudo.campanhas?.length ?? 0) > 0 && latest.conteudo.versaoFuncoesMidia !== MEDIA_FUNCTION_VERSION) {
    const conteudo = alignMediaFunctionsInContent(latest.conteudo);
    const [updated] = await db
      .update(mediaPlansTable)
      .set({ conteudo })
      .where(eq(mediaPlansTable.id, latest.id))
      .returning();
    res.json(updated ?? { ...latest, conteudo });
    return;
  }

  res.json(latest);
});

// Atualiza, no próprio registro, planos criados antes da estrutura 30/60/90
// ou planos que a IA tenha deixado incompletos em termos de canais. Se o plano
// já for multicanal, apenas adequa as funções oficiais sem replanejar a estratégia.
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

  try {
    if (hasRequiredMultichannelCoverage(existing.conteudo)) {
      if (existing.conteudo.versaoFuncoesMidia === MEDIA_FUNCTION_VERSION) {
        res.json(existing);
        return;
      }
      const conteudo = alignMediaFunctionsInContent(existing.conteudo);
      const [updated] = await db
        .update(mediaPlansTable)
        .set({ conteudo })
        .where(eq(mediaPlansTable.id, existing.id))
        .returning();
      res.json(updated ?? { ...existing, conteudo });
      return;
    }

    const periodoDias = parsed.data.periodoDias ?? existing.conteudo.periodoDias ?? 30;
    const conteudo = await enrichMediaPlanForPeriod(tenantId, existing.conteudo, periodoDias);
    const [updated] = await db
      .update(mediaPlansTable)
      .set({ conteudo })
      .where(eq(mediaPlansTable.id, existing.id))
      .returning();
    res.json(updated ?? { ...existing, conteudo });
  } catch (err) {
    req.log.error({ err, tenantId, planId: existing.id }, "media-plan: falha ao completar plano legado/incompleto");
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

  let nextConteudo = {
    ...existing.conteudo,
    ...(parsed.data.patch ?? {}),
  } as MediaPlanConteudo;
  nextConteudo = alignMediaFunctionsInContent(nextConteudo);

  if (parsed.data.aprovar === true) {
    if (!hasRequiredMultichannelCoverage(nextConteudo)) {
      res.status(422).json({ error: "O planejamento precisa estar completo em campanhas e canais antes da aprovação." });
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
