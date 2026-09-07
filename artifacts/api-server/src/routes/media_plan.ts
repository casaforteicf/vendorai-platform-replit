import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, contentCalendarItemsTable, mediaPlansTable, type MediaPlanConteudo, type MediaPlanPeriod } from "@workspace/db";
import { generateMediaPlan, MediaPlanError } from "../services/media-plan.js";
import { alignMediaFunctionsInContent, enrichMediaPlanForPeriod } from "../services/media-plan-period.js";
import { MEDIA_FUNCTION_VERSION } from "../services/media-channel-functions.js";

const router: IRouter = Router();

function canAccess(req: import("express").Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const periodDaysSchema = z.number().finite().positive().max(3650);
const flexiblePeriodSchema = z.object({
  inicioEm: z.string().datetime().optional(),
  fimEm: z.string().datetime().nullable().optional(),
  aberto: z.boolean().optional().default(false),
  duracaoValor: z.number().finite().positive().max(3650).optional(),
  duracaoUnidade: z.enum(["horas", "dias"]).optional(),
}).optional();
const budgetSchema = z.object({
  valor: z.number().finite().positive().max(1_000_000_000),
  tipo: z.enum(["total", "diario", "semanal", "mensal"]).default("total"),
  moeda: z.literal("BRL").default("BRL"),
  gestao: z.literal("ia_autonoma").default("ia_autonoma"),
  limiteRigido: z.literal(true).default(true),
}).optional();
const planningConfigSchema = z.object({
  objetivoPrincipal: z.string().trim().max(300).optional().default(""),
  produtoServicoPrioritario: z.string().trim().max(300).optional().default(""),
  publicoPrioritario: z.string().trim().max(500).optional().default(""),
  regiao: z.string().trim().max(250).optional().default(""),
  ofertaPrincipal: z.string().trim().max(500).optional().default(""),
  canaisPreferidos: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
  observacoes: z.string().trim().max(1500).optional().default(""),
});
type PlanningConfig = z.infer<typeof planningConfigSchema>;

const EMPTY_PLANNING_CONFIG: PlanningConfig = {
  objetivoPrincipal: "",
  produtoServicoPrioritario: "",
  publicoPrioritario: "",
  regiao: "",
  ofertaPrincipal: "",
  canaisPreferidos: [],
  observacoes: "",
};

const generateBodySchema = z.object({
  periodoDias: periodDaysSchema.optional().default(30),
  periodo: flexiblePeriodSchema,
  nomeCampanha: z.string().trim().max(200).optional(),
  ofertaCampanha: z.string().trim().max(500).optional(),
  orcamento: budgetSchema,
  configuracao: planningConfigSchema.optional().default(EMPTY_PLANNING_CONFIG),
});

function normalizedChannel(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function operationalDays(periodoDias: number, periodo?: z.infer<typeof flexiblePeriodSchema>): number {
  if (periodo?.duracaoValor && periodo.duracaoUnidade) {
    return Math.max(1, Math.ceil(periodo.duracaoUnidade === "horas" ? periodo.duracaoValor / 24 : periodo.duracaoValor));
  }
  if (periodo?.inicioEm && periodo.fimEm) {
    const start = Date.parse(periodo.inicioEm);
    const end = Date.parse(periodo.fimEm);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(1, Math.ceil((end - start) / 86_400_000));
    }
  }
  return Math.max(1, Math.ceil(periodoDias));
}

function normalizedPeriod(periodo?: z.infer<typeof flexiblePeriodSchema>): MediaPlanPeriod | undefined {
  if (!periodo) return undefined;
  return {
    inicioEm: periodo.inicioEm,
    fimEm: periodo.aberto ? null : periodo.fimEm,
    aberto: Boolean(periodo.aberto),
    duracaoValor: periodo.duracaoValor,
    duracaoUnidade: periodo.duracaoUnidade,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function snapshotValue(snapshot: string, label: string): string {
  const prefix = `${label}:`;
  const line = snapshot.split(/\r?\n/).find((item) => item.trim().startsWith(prefix));
  return line ? line.trim().slice(prefix.length).trim() : "";
}

function derivePlanningContext(contextoUsado: unknown): PlanningConfig {
  const context = asRecord(contextoUsado);
  const snapshot = typeof context.profileSnapshot === "string" ? context.profileSnapshot : "";
  const business = snapshotValue(snapshot, "Negócio");
  const segment = snapshotValue(snapshot, "Segmento");
  const audience = snapshotValue(snapshot, "Público-alvo");
  const region = snapshotValue(snapshot, "Localização");
  const productList = snapshotValue(snapshot, "Produtos/serviços");
  const firstProduct = productList.split(",").map((item) => item.trim()).find(Boolean) ?? "";
  const product = firstProduct || segment;

  return {
    ...EMPTY_PLANNING_CONFIG,
    produtoServicoPrioritario: product,
    publicoPrioritario: audience || (segment ? `Pessoas interessadas em ${segment}` : ""),
    regiao: region,
    ofertaPrincipal: business ? `Falar com ${business}` : "",
  };
}

function readSavedPlanningConfig(contextoUsado: unknown): PlanningConfig {
  const context = asRecord(contextoUsado);
  const parsed = planningConfigSchema.safeParse(context.configuracaoPlanejamento ?? {});
  return parsed.success ? parsed.data : EMPTY_PLANNING_CONFIG;
}

function isGenericCampaignValue(value: string | undefined, kind: "product" | "audience" | "offer"): boolean {
  if (!value?.trim()) return true;
  const normalized = normalizedChannel(value);
  if (kind === "product") {
    return normalized.includes("produto ou servico prioritario") || normalized === "oferta principal" || normalized.includes("oferta prioritaria do negocio");
  }
  if (kind === "audience") {
    return normalized.includes("publico prioritario definido") || normalized.includes("publico prioritario do negocio");
  }
  return normalized.includes("oferta ou proximo passo")
    || normalized.includes("proximo passo comercial claro")
    || normalized.includes("proximo passo comercial definido");
}

function groundCampaignPlaceholders(conteudo: MediaPlanConteudo, contextoUsado: unknown): MediaPlanConteudo {
  if (!conteudo.campanhas?.length) return conteudo;
  const derived = derivePlanningContext(contextoUsado);
  const campanhas = conteudo.campanhas.map((campaign) => ({
    ...campaign,
    produtoServico: isGenericCampaignValue(campaign.produtoServico, "product") && derived.produtoServicoPrioritario
      ? derived.produtoServicoPrioritario
      : campaign.produtoServico,
    publico: isGenericCampaignValue(campaign.publico, "audience") && derived.publicoPrioritario
      ? derived.publicoPrioritario
      : campaign.publico,
    regiao: campaign.regiao || derived.regiao || undefined,
    oferta: isGenericCampaignValue(campaign.oferta, "offer") && derived.ofertaPrincipal
      ? derived.ofertaPrincipal
      : campaign.oferta,
  }));
  return alignMediaFunctionsInContent({ ...conteudo, campanhas });
}

function groundAndApplySavedConfig(conteudo: MediaPlanConteudo, contextoUsado: unknown): MediaPlanConteudo {
  const grounded = groundCampaignPlaceholders(conteudo, contextoUsado);
  return applyPlanningConfigurationToCampaigns(grounded, readSavedPlanningConfig(contextoUsado));
}

function planningConfigLines(config: PlanningConfig): string[] {
  return [
    config.objetivoPrincipal && `Objetivo principal do período: ${config.objetivoPrincipal}`,
    config.produtoServicoPrioritario && `Produto/serviço prioritário: ${config.produtoServicoPrioritario}`,
    config.publicoPrioritario && `Público prioritário: ${config.publicoPrioritario}`,
    config.regiao && `Região/área de atuação: ${config.regiao}`,
    config.ofertaPrincipal && `Oferta/CTA principal: ${config.ofertaPrincipal}`,
    config.canaisPreferidos.length > 0 && `Canais que o usuário pediu para priorizar: ${config.canaisPreferidos.join(", ")}`,
    config.observacoes && `Orientações e restrições adicionais: ${config.observacoes}`,
  ].filter((value): value is string => Boolean(value));
}

function applyPlanningConfigurationToBase(
  conteudo: MediaPlanConteudo,
  config: PlanningConfig,
): MediaPlanConteudo {
  const directions = planningConfigLines(config);
  if (directions.length === 0) return conteudo;

  const existingByChannel = new Map(
    (conteudo.canais ?? []).map((channel) => [normalizedChannel(channel.canal), channel] as const),
  );
  const preferred = config.canaisPreferidos.map((canal) => {
    const existing = existingByChannel.get(normalizedChannel(canal));
    if (existing) return { ...existing, prioridade: "alta" as const };
    return {
      canal,
      prioridade: "alta" as const,
      motivo: "Canal priorizado manualmente na configuração deste planejamento.",
      tiposCampanhaSugeridos: [],
      percentualOrcamento: 0,
    };
  });
  const preferredKeys = new Set(preferred.map((channel) => normalizedChannel(channel.canal)));
  const remaining = (conteudo.canais ?? []).filter((channel) => !preferredKeys.has(normalizedChannel(channel.canal)));

  return {
    ...conteudo,
    diagnostico: `${conteudo.diagnostico}\n\nDiretrizes definidas pelo usuário para este ciclo: ${directions.join(" | ")}`,
    canais: [...preferred, ...remaining],
  };
}

function applyPlanningConfigurationToCampaigns(
  conteudo: MediaPlanConteudo,
  config: PlanningConfig,
): MediaPlanConteudo {
  if (!conteudo.campanhas?.length) return conteudo;

  const campanhas = conteudo.campanhas.map((campaign) => ({
    ...campaign,
    produtoServico: config.produtoServicoPrioritario || campaign.produtoServico,
    publico: config.publicoPrioritario || campaign.publico,
    regiao: config.regiao || campaign.regiao,
    oferta: config.ofertaPrincipal || conteudo.ofertaCampanha || campaign.oferta,
    metaPrincipal: config.objetivoPrincipal
      ? `${config.objetivoPrincipal} · ${campaign.metaPrincipal}`
      : campaign.metaPrincipal,
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
    const diasOperacionais = operationalDays(parsed.data.periodoDias, parsed.data.periodo);
    const configuredBase = applyPlanningConfigurationToBase(plan.conteudo, parsed.data.configuracao);
    const conteudoBase: MediaPlanConteudo = {
      ...configuredBase,
      periodoDias: diasOperacionais,
      periodo: normalizedPeriod(parsed.data.periodo),
      nomeCampanha: parsed.data.nomeCampanha,
      ofertaCampanha: parsed.data.ofertaCampanha,
      orcamento: parsed.data.orcamento,
    };
    const enriched = await enrichMediaPlanForPeriod(tenantId, conteudoBase, diasOperacionais);
    const grounded = groundCampaignPlaceholders(enriched, plan.contextoUsado);
    const conteudo = applyPlanningConfigurationToCampaigns(grounded, parsed.data.configuracao);
    const contextoUsado = {
      ...(plan.contextoUsado ?? {}),
      configuracaoPlanejamento: parsed.data.configuracao,
      configuracaoDerivada: derivePlanningContext(plan.contextoUsado),
      configuracaoResumo: planningConfigLines(parsed.data.configuracao),
      periodoPlanejamento: conteudo.periodo ?? { duracaoValor: diasOperacionais, duracaoUnidade: "dias" },
      orcamentoPlanejamento: conteudo.orcamento ?? null,
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

  if ((latest.conteudo.campanhas?.length ?? 0) > 0) {
    const conteudo = groundAndApplySavedConfig(latest.conteudo, latest.contextoUsado);
    const changed = conteudo.versaoFuncoesMidia !== latest.conteudo.versaoFuncoesMidia
      || JSON.stringify(conteudo) !== JSON.stringify(latest.conteudo);
    if (changed || latest.conteudo.versaoFuncoesMidia !== MEDIA_FUNCTION_VERSION) {
      const [updated] = await db
        .update(mediaPlansTable)
        .set({ conteudo })
        .where(eq(mediaPlansTable.id, latest.id))
        .returning();
      res.json(updated ?? { ...latest, conteudo });
      return;
    }
  }

  res.json(latest);
});

const completeBodySchema = z.object({
  periodoDias: periodDaysSchema.optional(),
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
      const conteudo = groundAndApplySavedConfig(existing.conteudo, existing.contextoUsado);
      const changed = JSON.stringify(conteudo) !== JSON.stringify(existing.conteudo)
        || existing.conteudo.versaoFuncoesMidia !== MEDIA_FUNCTION_VERSION;
      if (!changed) {
        res.json(existing);
        return;
      }
      const [updated] = await db
        .update(mediaPlansTable)
        .set({ conteudo })
        .where(eq(mediaPlansTable.id, existing.id))
        .returning();
      res.json(updated ?? { ...existing, conteudo });
      return;
    }

    const periodoDias = parsed.data.periodoDias ?? existing.conteudo.periodoDias ?? 30;
    const enriched = await enrichMediaPlanForPeriod(tenantId, existing.conteudo, periodoDias);
    const conteudo = groundAndApplySavedConfig(enriched, existing.contextoUsado);
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
    periodo: row.conteudo.periodo ?? null,
    orcamento: row.conteudo.orcamento ?? null,
    campanhas: row.conteudo.campanhas?.length ?? 0,
    statusPlanejamento: row.conteudo.statusPlanejamento ?? "gerado",
  })));
});

export default router;
