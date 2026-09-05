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

const periodSchema = z.number().int().min(1).max(3650);
const budgetTypeSchema = z.enum(["total", "diario", "semanal", "mensal"]);
const planningConfigSchema = z.object({
  nomeCampanha: z.string().trim().max(300).optional().default(""),
  ofertaPrincipal: z.string().trim().max(500).optional().default(""),
  inicioEm: z.string().trim().max(80).optional().default(""),
  fimEm: z.string().trim().max(80).optional().default(""),
  semDataFinal: z.boolean().optional().default(false),
  orcamentoValor: z.number().min(0).max(1_000_000_000).optional().default(0),
  orcamentoTipo: budgetTypeSchema.optional().default("total"),
});
type PlanningConfig = z.infer<typeof planningConfigSchema>;

const EMPTY_PLANNING_CONFIG: PlanningConfig = {
  nomeCampanha: "",
  ofertaPrincipal: "",
  inicioEm: "",
  fimEm: "",
  semDataFinal: false,
  orcamentoValor: 0,
  orcamentoTipo: "total",
};

const generateBodySchema = z.object({
  periodoDias: periodSchema.default(30),
  configuracao: planningConfigSchema.optional().default(EMPTY_PLANNING_CONFIG),
});

function normalizedChannel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function validIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function resolvePlanningPeriod(config: PlanningConfig, fallbackDays: number): number {
  const start = validIso(config.inicioEm);
  const end = config.semDataFinal ? null : validIso(config.fimEm);
  if (!start || !end) return Math.min(3650, Math.max(1, fallbackDays));
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return Math.min(3650, Math.max(1, fallbackDays));
  return Math.min(3650, Math.max(1, Math.ceil(diff / 86_400_000)));
}

function planningConfigLines(config: PlanningConfig): string[] {
  return [
    config.nomeCampanha && `Título/tema definido pelo usuário: ${config.nomeCampanha}`,
    config.ofertaPrincipal && `Oferta, promoção ou CTA definido pelo usuário: ${config.ofertaPrincipal}`,
    config.inicioEm && `Início da campanha: ${config.inicioEm}`,
    config.semDataFinal ? "Campanha sem data final definida" : config.fimEm && `Fim da campanha: ${config.fimEm}`,
    config.orcamentoValor > 0 && `Limite financeiro: R$ ${config.orcamentoValor.toFixed(2)} (${config.orcamentoTipo})`,
    "A IA decide canais, públicos, formatos, frequência, horários, testes e distribuição da verba sem ultrapassar o limite financeiro informado.",
  ].filter((value): value is string => Boolean(value));
}

function applyPlanningConfigurationToBase(
  conteudo: MediaPlanConteudo,
  config: PlanningConfig,
  periodoDias: number,
): MediaPlanConteudo {
  const directions = planningConfigLines(config);
  const inicio = validIso(config.inicioEm) ?? undefined;
  const fim = config.semDataFinal ? null : validIso(config.fimEm);
  const orcamento = config.orcamentoValor > 0
    ? {
        valor: config.orcamentoValor,
        tipo: config.orcamentoTipo,
        moeda: "BRL" as const,
        gestao: "ia_autonoma" as const,
        limiteRigido: true as const,
      }
    : undefined;

  return {
    ...conteudo,
    diagnostico: directions.length > 0
      ? `${conteudo.diagnostico}\n\nDiretrizes humanas desta campanha: ${directions.join(" | ")}`
      : conteudo.diagnostico,
    periodoDias,
    periodoInicioEm: inicio,
    periodoFimEm: fim,
    periodoAberto: config.semDataFinal,
    nomeCampanha: config.nomeCampanha || undefined,
    ofertaCampanha: config.ofertaPrincipal || undefined,
    orcamento,
  };
}

function applyPlanningConfigurationToCampaigns(
  conteudo: MediaPlanConteudo,
  config: PlanningConfig,
): MediaPlanConteudo {
  if (!conteudo.campanhas?.length) return conteudo;

  const campanhas = conteudo.campanhas.map((campaign) => ({
    ...campaign,
    nome: config.nomeCampanha ? `${config.nomeCampanha} · ${campaign.nome}` : campaign.nome,
    oferta: config.ofertaPrincipal || campaign.oferta,
  }));

  return alignMediaFunctionsInContent({ ...conteudo, campanhas });
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

  const days = conteudo.periodoDias ?? 30;
  if (days <= 2) return channels.size >= 2 && (hasIntent || hasPaidSocial) && hasDirect;
  if (days <= 7) return channels.size >= 3 && (hasIntent || hasPaidSocial) && (hasDirect || hasOwnedOrOrganic);
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
    const periodoDias = resolvePlanningPeriod(parsed.data.configuracao, parsed.data.periodoDias);
    const { plan } = await generateMediaPlan(tenantId, req.user?.sub ?? null);
    const conteudoBase = applyPlanningConfigurationToBase(plan.conteudo, parsed.data.configuracao, periodoDias);
    const enriched = await enrichMediaPlanForPeriod(tenantId, conteudoBase, periodoDias);
    const conteudo = applyPlanningConfigurationToCampaigns(enriched, parsed.data.configuracao);
    const contextoUsado = {
      ...(plan.contextoUsado ?? {}),
      configuracaoPlanejamento: parsed.data.configuracao,
      configuracaoResumo: planningConfigLines(parsed.data.configuracao),
      autonomiaMidia: {
        canais: true,
        publicos: true,
        formatos: true,
        frequencia: true,
        horarios: true,
        redistribuicaoOrcamento: true,
        limiteFinanceiroRigido: true,
      },
    };
    const [updated] = await db
      .update(mediaPlansTable)
      .set({ conteudo, contextoUsado })
      .where(eq(mediaPlansTable.id, plan.id))
      .returning();
    res.status(201).json(updated ?? { ...plan, conteudo, contextoUsado });
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

// Atualiza, no próprio registro, planos anteriores ou planos que a IA tenha
// deixado incompletos em termos de canais, sem criar um fluxo paralelo.
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
    periodoInicioEm: row.conteudo.periodoInicioEm ?? null,
    periodoFimEm: row.conteudo.periodoFimEm ?? null,
    periodoAberto: row.conteudo.periodoAberto ?? false,
    nomeCampanha: row.conteudo.nomeCampanha ?? null,
    orcamento: row.conteudo.orcamento ?? null,
    campanhas: row.conteudo.campanhas?.length ?? 0,
    statusPlanejamento: row.conteudo.statusPlanejamento ?? "gerado",
  })));
});

export default router;