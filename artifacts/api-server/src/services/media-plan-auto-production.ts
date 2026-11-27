import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  agentConfigsTable,
  businessProfilesTable,
  contentCalendarItemsTable,
  contentGenerationsTable,
  db,
  mediaAssetsTable,
  mediaJobsTable,
  mediaPlansTable,
  mediaProjectsTable,
  subscriptionsTable,
  tenantsTable,
} from "@workspace/db";
import {
  generateFeedContent,
  generateImagesForContent,
  generateLinkedInContent,
  generateReelsScript,
  generateStoriesContent,
  generateYouTubeScript,
} from "../lib/content-generation.js";
import { logger } from "../lib/logger.js";
import { createVendorAiMediaGenerationJob } from "./vendorai-media-engine.js";
import { mediaProviderAvailable } from "./media-provider-router.js";
import { startVendorAiPhotoVideo } from "./vendorai-photo-video.js";
import {
  automaticProductionLimit,
  DEFAULT_AUTOMATIC_MONTHLY_LIMIT,
  planAllowsAutomaticProduction,
} from "./media-plan-auto-production-policy.js";
import {
  findCampaignForItem,
  resolveVideoDurationSeconds,
  selectRoundRobinByTenant,
} from "@workspace/vendor-brain/media-plan-execution";
import { emitMarketingFunnelEvent } from "./marketing-funnel-events.js";

const PLAN_LIMITS: Record<string, number> = {
  starter: 20,
  growth: 150,
  enterprise: 200,
};
const DEFAULT_TIMEZONE = process.env["MARKETING_SCHEDULE_TIMEZONE"] || "America/Sao_Paulo";
const PRODUCTION_LEAD_HOURS = Math.max(1, Number(process.env["MARKETING_PRODUCTION_LEAD_HOURS"] || 24));
const MAX_ITEMS_PER_TICK = 8;
// Teto por tenant no mesmo ciclo: sem isso, o backlog antigo de um tenant
// consome todas as vagas e os demais nunca produzem.
const MAX_ITEMS_PER_TENANT_PER_TICK = Math.max(
  1,
  Number(process.env["MARKETING_MAX_ITEMS_PER_TENANT_TICK"] || 2),
);
const AUTO_PRODUCTION_FOR_ALL_PLANS =
  process.env["MARKETING_AUTO_PRODUCTION_ENABLED"] === "true";
const AUTO_PRODUCTION_MONTHLY_LIMIT = Math.max(
  1,
  Number(process.env["MARKETING_AUTO_PRODUCTION_MONTHLY_LIMIT"] || DEFAULT_AUTOMATIC_MONTHLY_LIMIT),
);
const BILLING_CIRCUIT_MS = Math.max(
  5 * 60_000,
  Number(process.env["MARKETING_AI_BILLING_COOLDOWN_MS"] || 60 * 60_000),
);
const VIDEO_AUTO_TYPES = new Set(["reels", "tiktok", "youtube_short", "youtube_video"]);
const AUTO_TYPES = new Set(["feed", "stories", "carrossel", "linkedin_post", ...VIDEO_AUTO_TYPES]);

// In-memory circuit breaker. A restart clears it, but the first provider billing
// failure opens it again before the worker can fan out into more paid retries.
let aiBillingCircuitOpenUntil = 0;

type Campaign = {
  id: string;
  nome: string;
  objetivo: string;
  produtoServico: string;
  publico: string;
  regiao?: string;
  oferta: string;
  mensagemCentral: string;
  regraComunicacaoGeografica?: string;
  kpiPrincipal?: string;
  metaPrincipal?: string;
  canais?: Array<{ canal: string; funcao?: string; kpiPrincipal?: string }>;
};

type PlanContent = {
  statusPlanejamento?: string;
  publicacaoOrganica?: { modo?: string; horario?: string; timezone?: string };
  campanhas?: Campaign[];
};

type GenerationResultRecord = {
  variations?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function validTimezone(value: unknown) {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function localDate(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function shiftIsoDate(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shouldProduce(dateIso: string, settings: PlanContent["publicacaoOrganica"], now = new Date()) {
  const timezone = validTimezone(settings?.timezone);
  const leadDays = Math.max(1, Math.ceil(PRODUCTION_LEAD_HOURS / 24));
  return localDate(timezone, now) >= shiftIsoDate(dateIso, -leadDays);
}

function providerSupported(canal: string) {
  const channel = normalize(canal);
  return channel.includes("instagram")
    || channel.includes("facebook")
    || channel.includes("linkedin")
    || channel.includes("tiktok")
    || channel.includes("youtube");
}

function campaignForItem(content: PlanContent, pilar: string) {
  // Contrato único (vendor-brain): casa pelo nome normalizado e NUNCA cai
  // para outra campanha. Item sem campanha é pulado e registrado no log,
  // em vez de ser produzido com o briefing errado.
  return findCampaignForItem(content.campanhas ?? [], { pilar, id: "" });
}

function aiVideoProviderReady() {
  return mediaProviderAvailable("google-vertex", "video_standard")
    || mediaProviderAvailable("replicate", "video_standard");
}

/**
 * Fotos reais do tenant para o fallback de vídeo (quando não há provedor de IA
 * de vídeo configurado). Prioriza uploads/importadas mais recentes.
 */
export async function selectTenantImageAssetIds(tenantId: string, limit = 4): Promise<string[]> {
  const rows = await db.select({ id: mediaAssetsTable.id })
    .from(mediaAssetsTable)
    .where(and(
      eq(mediaAssetsTable.tenantId, tenantId),
      eq(mediaAssetsTable.type, "image"),
      inArray(mediaAssetsTable.source, ["upload", "imported"]),
    ))
    .orderBy(desc(mediaAssetsTable.createdAt))
    .limit(Math.max(limit * 4, 12));
  return rows.slice(0, limit).map((row) => row.id);
}

function directionText(campaign: Campaign, item: { temaSugerido: string; canal: string; tipo: string; pilar: string }) {
  const channel = campaign.canais?.find((entry) => normalize(entry.canal) === normalize(item.canal));
  return [
    item.temaSugerido,
    `Campanha: ${campaign.nome}`,
    `Objetivo: ${campaign.objetivo}`,
    `Produto/serviço: ${campaign.produtoServico}`,
    `Público: ${campaign.publico}`,
    campaign.oferta ? `Oferta/CTA: ${campaign.oferta}` : "",
    campaign.mensagemCentral ? `Mensagem central: ${campaign.mensagemCentral}` : "",
    `Canal: ${item.canal}`,
    `Formato: ${item.tipo.replaceAll("_", " ")}`,
    channel?.funcao ? `Função desta mídia: ${channel.funcao}` : "",
    campaign.regiao ? `Região: ${campaign.regiao}` : "",
    campaign.regraComunicacaoGeografica ? `Regra geográfica: ${campaign.regraComunicacaoGeografica}` : "",
    `Pilar: ${item.pilar}`,
  ].filter(Boolean).join("\n");
}

function gatewayStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : Number(value || 0);
}

async function monthlyAllowance(tenantId: string) {
  const [[config], [subscription]] = await Promise.all([
    db.select({
      id: agentConfigsTable.id,
      used: agentConfigsTable.contentGenerationsThisMonth,
      resetAt: agentConfigsTable.contentGenerationsResetAt,
    }).from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId)).limit(1),
    db.select({ plano: subscriptionsTable.plano })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenantId))
      .limit(1),
  ]);
  if (!config) return { allowed: false, configId: null as string | null, used: 0, limit: 0 };
  const now = new Date();
  const needsReset = !config.resetAt || now.getTime() - config.resetAt.getTime() > 30 * 24 * 60 * 60 * 1000;
  const used = needsReset ? 0 : config.used;
  if (needsReset) {
    await db.update(agentConfigsTable)
      .set({ contentGenerationsThisMonth: 0, contentGenerationsResetAt: now })
      .where(eq(agentConfigsTable.id, config.id));
  }
  const planLimit = PLAN_LIMITS[subscription?.plano ?? "starter"] ?? 20;
  const limit = automaticProductionLimit(planLimit, AUTO_PRODUCTION_MONTHLY_LIMIT);
  return { allowed: used < limit, configId: config.id, used, limit };
}

async function generateDraft(input: {
  tenantId: string;
  tipo: string;
  theme: string;
  campaign: Campaign;
  calendarItemId: string;
}) {
  const allowance = await monthlyAllowance(input.tenantId);
  if (!allowance.allowed || !allowance.configId) {
    throw new Error(`content_generation_limit:${allowance.used}/${allowance.limit}`);
  }

  const [[profile], [tenantIdentity]] = await Promise.all([
    db.select().from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, input.tenantId)).limit(1),
    db.select({ name: tenantsTable.name, nomeEmpresa: tenantsTable.nomeEmpresa })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, input.tenantId))
      .limit(1),
  ]);
  const brandName = profile?.nomeFantasia?.trim()
    || tenantIdentity?.nomeEmpresa?.trim()
    || tenantIdentity?.name?.trim()
    || "";
  const generationProfile = {
    ...(profile ?? {}),
    ...(brandName ? { nomeFantasia: brandName } : {}),
  };
  const strategy = {
    postObjective: input.campaign.objetivo,
    desiredCta: input.campaign.oferta,
    referencePatterns: [
      `Campanha validada: ${input.campaign.nome}`,
      `Produto/serviço validado: ${input.campaign.produtoServico}`,
      `Público validado: ${input.campaign.publico}`,
      `Mensagem central validada: ${input.campaign.mensagemCentral}`,
    ].join("\n"),
  };

  let generated: { result: { variations: unknown[] }; tokensUsed: number };
  let storedType = "feed";
  let contentFormat: "feed_square" | "feed_portrait" | "stories" | "reels" | null = null;
  let aspectRatio: string | null = null;

  if (input.tipo === "stories") {
    storedType = "stories";
    contentFormat = "stories";
    aspectRatio = "9:16";
    generated = await generateStoriesContent(generationProfile, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, 1, undefined, undefined, aspectRatio, strategy);
  } else if (input.tipo === "linkedin_post") {
    storedType = "linkedin";
    generated = await generateLinkedInContent(generationProfile, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, undefined, strategy);
  } else if (input.tipo === "youtube_video") {
    storedType = "youtube";
    aspectRatio = "16:9";
    generated = await generateYouTubeScript(generationProfile, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, undefined, strategy);
  } else if (VIDEO_AUTO_TYPES.has(input.tipo)) {
    storedType = input.tipo === "youtube_short" ? "youtube" : "reels";
    contentFormat = "reels";
    aspectRatio = "9:16";
    generated = await generateReelsScript(generationProfile, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, undefined, strategy);
  } else {
    storedType = "feed";
    contentFormat = "feed_square";
    aspectRatio = "1:1";
    generated = await generateFeedContent(generationProfile, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, input.tipo === "carrossel" ? 4 : 1, undefined, undefined, aspectRatio, strategy);
  }

  const result = generated.result as GenerationResultRecord;
  const variations = Array.isArray(result.variations) ? result.variations : [];
  if (!variations[0]) throw new Error("content_generation_empty_variation");

  if (input.tipo === "feed" || input.tipo === "carrossel" || input.tipo === "stories") {
    const imageCount = input.tipo === "carrossel" ? 4 : 1;
    const imageType = input.tipo === "stories" ? "stories" : "feed";
    let imageUrls: string[] = [];
    try {
      imageUrls = await generateImagesForContent(
        generationProfile,
        input.tenantId,
        input.theme.split("\n")[0] || input.theme,
        input.campaign.produtoServico || undefined,
        imageType,
        imageCount,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          tenantName: tenantIdentity?.nomeEmpresa?.trim() || tenantIdentity?.name?.trim() || null,
          brandName,
          productName: input.campaign.produtoServico || null,
          theme: input.theme.split("\n")[0] || input.theme,
          vertical: profile?.vertical ?? null,
          audience: input.campaign.publico,
          region: input.campaign.regiao ?? null,
          offer: input.campaign.oferta,
          message: input.campaign.mensagemCentral,
          campaignName: input.campaign.nome,
        },
      );
    } catch (imageError) {
      // Sem provedor/créditos de imagem: usa fotos reais da Biblioteca em vez
      // de falhar a produção inteira ou inventar uma imagem genérica.
      const fallbackRows = await db
        .select({ storageUrl: mediaAssetsTable.storageUrl })
        .from(mediaAssetsTable)
        .where(and(
          eq(mediaAssetsTable.tenantId, input.tenantId),
          eq(mediaAssetsTable.type, "image"),
          inArray(mediaAssetsTable.source, ["upload", "imported"]),
        ))
        .orderBy(desc(mediaAssetsTable.createdAt))
        .limit(imageCount);
      imageUrls = fallbackRows.map((row) => row.storageUrl.startsWith("/api/storage") ? row.storageUrl : `/api/storage${row.storageUrl}`);
      if (imageUrls.length === 0) throw imageError;
      logger.warn({ error: imageError, tenantId: input.tenantId, calendarItemId: input.calendarItemId }, "Plano de Mídia: IA de imagem indisponível; usando fotos reais da Biblioteca");
    }
    if (imageUrls.length === 0) throw new Error("content_generation_missing_image");
    variations[0] = {
      ...variations[0],
      imageUrl: imageUrls[0],
      ...(imageUrls.length > 1 ? { imageUrls } : {}),
    };
  }

  const [saved] = await db.insert(contentGenerationsTable).values({
    tenantId: input.tenantId,
    type: storedType,
    productName: input.campaign.produtoServico || null,
    theme: input.theme,
    contentFormat,
    aspectRatio,
    result: {
      ...result,
      variations,
      contextAudit: {
        source: "validated-media-plan-worker",
        tenantId: input.tenantId,
        campaignId: input.campaign.id,
        campaignName: input.campaign.nome,
        productName: input.campaign.produtoServico,
        allowedSources: ["business_profile", "validated_media_plan_campaign"],
        blockedBroadSources: ["own_performance_examples", "reference_creators"],
        validatedAt: new Date().toISOString(),
      },
      automation: {
        source: "media-plan",
        calendarItemId: input.calendarItemId,
        producedBy: "backend-worker",
        producedAt: new Date().toISOString(),
        status: VIDEO_AUTO_TYPES.has(input.tipo) ? "script_ready" : "draft_ready",
        contentType: input.tipo,
      },
    } as any,
    tokensUsed: generated.tokensUsed,
  }).returning();
  if (!saved) throw new Error("content_generation_persist_failed");

  await db.update(agentConfigsTable)
    .set({ contentGenerationsThisMonth: allowance.used + 1 })
    .where(eq(agentConfigsTable.id, allowance.configId));

  return saved;
}

async function startAutomatedVideo(input: {
  tenantId: string;
  generationId: string;
  calendarItemId: string;
  theme: string;
  tipo: string;
  campaign: Campaign;
  result: GenerationResultRecord;
}) {
  const variation = input.result.variations?.[0] ?? {};
  const scenes = Array.isArray(variation.scenes) ? variation.scenes : [];
  const script = scenes.map((scene, index) => {
    const row = scene && typeof scene === "object" && !Array.isArray(scene) ? scene as Record<string, unknown> : {};
    return `Cena ${index + 1}: ${String(row.visual ?? "")} | Fala: ${String(row.fala ?? "")} | Duração: ${String(row.duracao ?? "")}`;
  }).join("\n");
  const prompt = [
    input.theme,
    `Campanha: ${input.campaign.nome}`,
    `Mensagem central: ${input.campaign.mensagemCentral}`,
    script,
    typeof variation.cta === "string" ? `CTA: ${variation.cta}` : "",
  ].filter(Boolean).join("\n\n");

  const longVideo = input.tipo === "youtube_video";
  const mediaAssetIds = await selectTenantImageAssetIds(input.tenantId, 4);
  const job = await createVendorAiMediaGenerationJob({
    tenantId: input.tenantId,
    userId: null,
    title: `${input.campaign.nome} · ${input.theme}`.slice(0, 120),
    operation: "video_generate",
    context: {
      prompt: prompt.slice(0, 4000),
      style: longVideo
        ? "cinematic, premium, photorealistic, polished commercial production"
        : "dynamic social media reel, energetic camera language, punchy modern composition",
      aspectRatio: longVideo ? "landscape" : "portrait",
      duration: resolveVideoDurationSeconds(input.tipo),
      generationMode: "ai_only",
      mediaInputs: mediaAssetIds.map((assetId) => ({ assetId, type: "image", role: "auto" })),
      effects: {
        preset: longVideo ? "cinematic" : "social",
        intensity: longVideo ? "soft" : "medium",
        transition: longVideo ? "smooth" : "whip",
        motion: longVideo ? "ken_burns" : "punch",
        color: longVideo ? "cinematic" : "vibrant",
        grain: longVideo,
        vignette: false,
        sharpen: true,
        beatSync: !longVideo,
        bpm: longVideo ? 105 : 128,
        sfx: longVideo ? "none" : "whoosh",
      },
      source: "media-plan",
      calendarItemId: input.calendarItemId,
      contentGenerationId: input.generationId,
      contentType: input.tipo,
      materializationStatus: "processing",
      executorKind: "video",
    },
  });

  const [current] = await db.select({ result: contentGenerationsTable.result })
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, input.generationId), eq(contentGenerationsTable.tenantId, input.tenantId)))
    .limit(1);
  const next = (current?.result ?? input.result) as GenerationResultRecord;
  await db.update(contentGenerationsTable).set({
    result: {
      ...next,
      automation: {
        ...((next.automation && typeof next.automation === "object" && !Array.isArray(next.automation)) ? next.automation as Record<string, unknown> : {}),
        status: "video_processing",
        contentType: input.tipo,
        projectId: job.projectId,
        jobId: job.jobId,
        updatedAt: new Date().toISOString(),
      },
    } as any,
  }).where(and(eq(contentGenerationsTable.id, input.generationId), eq(contentGenerationsTable.tenantId, input.tenantId)));
}

export async function produceUpcomingMediaPlanOrganicContent(now = new Date()) {
  if (Date.now() < aiBillingCircuitOpenUntil) {
    logger.warn(
      { openUntil: new Date(aiBillingCircuitOpenUntil).toISOString() },
      "Produção automática do Plano de Mídia pausada pelo circuit breaker de cobrança",
    );
    return 0;
  }

  const rows = await db.select({
    id: contentCalendarItemsTable.id,
    tenantId: contentCalendarItemsTable.tenantId,
    mediaPlanId: contentCalendarItemsTable.mediaPlanId,
    dataAgendada: contentCalendarItemsTable.dataAgendada,
    pilar: contentCalendarItemsTable.pilar,
    temaSugerido: contentCalendarItemsTable.temaSugerido,
    tipo: contentCalendarItemsTable.tipo,
    canal: contentCalendarItemsTable.canal,
    planContent: mediaPlansTable.conteudo,
  }).from(contentCalendarItemsTable)
    .innerJoin(mediaPlansTable, and(
      eq(mediaPlansTable.id, contentCalendarItemsTable.mediaPlanId),
      eq(mediaPlansTable.tenantId, contentCalendarItemsTable.tenantId),
    ))
    .where(and(
      eq(contentCalendarItemsTable.status, "aprovado"),
      isNull(contentCalendarItemsTable.contentGenerationId),
      isNull(contentCalendarItemsTable.variationIdx),
      sql`${mediaPlansTable.conteudo}->>'statusPlanejamento' = 'aprovado'`,
    ))
    .orderBy(asc(contentCalendarItemsTable.dataAgendada))
    .limit(MAX_ITEMS_PER_TICK * 4);

  // Filtro barato -> lote justo entre tenants -> claim atômico por item.
  const candidates = rows.flatMap((row) => {
    if (!row.mediaPlanId || !AUTO_TYPES.has(row.tipo) || !providerSupported(row.canal)) return [];
    const content = row.planContent as PlanContent;
    if (!planAllowsAutomaticProduction(content.publicacaoOrganica, AUTO_PRODUCTION_FOR_ALL_PLANS)) return [];
    if (!shouldProduce(row.dataAgendada, content.publicacaoOrganica, now)) return [];
    const campaign = campaignForItem(content, row.pilar);
    if (!campaign) return [];
    return [{ row, content, campaign }];
  });
  const batch = selectRoundRobinByTenant(
    candidates,
    (candidate) => candidate.row.tenantId,
    MAX_ITEMS_PER_TENANT_PER_TICK,
    MAX_ITEMS_PER_TICK,
  );

  let produced = 0;
  for (const { row, content, campaign } of batch) {
    const claim = `auto-producing:${crypto.randomUUID()}`;
    const [claimed] = await db.update(contentCalendarItemsTable).set({
      contentGenerationId: claim,
      updatedAt: new Date(),
    }).where(and(
      eq(contentCalendarItemsTable.id, row.id),
      eq(contentCalendarItemsTable.tenantId, row.tenantId),
      eq(contentCalendarItemsTable.status, "aprovado"),
      isNull(contentCalendarItemsTable.contentGenerationId),
      isNull(contentCalendarItemsTable.variationIdx),
    )).returning({ id: contentCalendarItemsTable.id });
    if (!claimed) continue;

    try {
      const theme = directionText(campaign, row);
      const generation = await generateDraft({
        tenantId: row.tenantId,
        tipo: row.tipo,
        theme,
        campaign,
        calendarItemId: row.id,
      });
      await db.update(contentCalendarItemsTable).set({
        // Vídeo só vira "gerado" quando o arquivo final existir. Até lá o item
        // fica em "processando" e a publicação não o considera.
        status: VIDEO_AUTO_TYPES.has(row.tipo) ? "processando" : "gerado",
        contentGenerationId: generation.id,
        variationIdx: 0,
        updatedAt: new Date(),
      }).where(and(
        eq(contentCalendarItemsTable.id, row.id),
        eq(contentCalendarItemsTable.contentGenerationId, claim),
      ));

      if (VIDEO_AUTO_TYPES.has(row.tipo)) {
        await startAutomatedVideo({
          tenantId: row.tenantId,
          generationId: generation.id,
          calendarItemId: row.id,
          theme: row.temaSugerido,
          tipo: row.tipo,
          campaign,
          result: generation.result as GenerationResultRecord,
        });
      }
      produced += 1;
      logger.info({ tenantId: row.tenantId, calendarItemId: row.id, type: row.tipo, generationId: generation.id }, "Plano de Mídia produziu conteúdo orgânico no backend");
    } catch (error) {
      const status = gatewayStatus(error);
      await db.update(contentCalendarItemsTable).set({
        // Falhou: devolve o item ao estado autorizado para permitir retry.
        status: "aprovado",
        contentGenerationId: null,
        // -1 is a persistent automatic-failure marker. Manual generation can
        // still retry this item and will restore variationIdx=0 on success.
        variationIdx: -1,
        updatedAt: new Date(),
      }).where(and(
        eq(contentCalendarItemsTable.id, row.id),
        eq(contentCalendarItemsTable.contentGenerationId, claim),
      )).catch(() => undefined);
      logger.warn({ error, status, tenantId: row.tenantId, calendarItemId: row.id, type: row.tipo }, "Produção automática do Plano de Mídia falhou");

      if (status === 402 || status === 429) {
        aiBillingCircuitOpenUntil = Date.now() + BILLING_CIRCUIT_MS;
        logger.error(
          {
            status,
            tenantId: row.tenantId,
            calendarItemId: row.id,
            openUntil: new Date(aiBillingCircuitOpenUntil).toISOString(),
          },
          "Circuit breaker abriu: produção automática de IA pausada após erro de cobrança/quota",
        );
        break;
      }
    }
  }
  return produced;
}

export async function reconcileAutomatedReelVideos() {
  const rows = await db.select({
    id: contentCalendarItemsTable.id,
    tenantId: contentCalendarItemsTable.tenantId,
    tipo: contentCalendarItemsTable.tipo,
    status: contentCalendarItemsTable.status,
    generationId: contentCalendarItemsTable.contentGenerationId,
    result: contentGenerationsTable.result,
  }).from(contentCalendarItemsTable)
    .innerJoin(contentGenerationsTable, and(
      eq(contentGenerationsTable.id, contentCalendarItemsTable.contentGenerationId),
      eq(contentGenerationsTable.tenantId, contentCalendarItemsTable.tenantId),
    ))
    .where(and(
      // "aprovado" inclui o caso em que o usuário aprovou antes de existir o
      // arquivo final (comportamento antigo da tela de revisão). Esses itens
      // também precisam ser curados para não travar a publicação.
      inArray(contentCalendarItemsTable.status, ["gerado", "aprovado", "processando"]),
      inArray(contentCalendarItemsTable.tipo, [...VIDEO_AUTO_TYPES]),
      isNotNull(contentCalendarItemsTable.contentGenerationId),
      isNull(contentCalendarItemsTable.contentIdPublicado),
    ))
    .limit(30);

  let reconciled = 0;
  for (const row of rows) {
    if (!row.generationId) continue;
    const result = row.result as GenerationResultRecord;
    const automation = result.automation && typeof result.automation === "object" && !Array.isArray(result.automation)
      ? result.automation as Record<string, unknown>
      : {};
    let jobId = typeof automation.jobId === "string" ? automation.jobId : "";
    if (!jobId && automation.status !== "video_ready") {
      // Vídeo iniciado pela tela grava o job no projeto (media_projects), não
      // na geração. Sem este fallback o item ficaria "processando" para sempre.
      const [planProject] = await db
        .select({ context: mediaProjectsTable.context })
        .from(mediaProjectsTable)
        .where(and(
          eq(mediaProjectsTable.tenantId, row.tenantId),
          sql`${mediaProjectsTable.context}->>'calendarItemId' = ${row.id}`,
        ))
        .limit(1);
      const projectContext = planProject?.context;
      if (projectContext && typeof projectContext === "object" && !Array.isArray(projectContext)) {
        const candidate = (projectContext as Record<string, unknown>)["executorJobId"];
        if (typeof candidate === "string" && candidate.trim()) jobId = candidate.trim();
      }
    }
    if (!jobId || automation.status === "video_ready") continue;

    const [job] = await db.select({ status: mediaJobsTable.status, output: mediaJobsTable.output, error: mediaJobsTable.error })
      .from(mediaJobsTable)
      .where(and(eq(mediaJobsTable.id, jobId), eq(mediaJobsTable.tenantId, row.tenantId)))
      .limit(1);
    if (!job) continue;

    if (job.status === "done") {
      const output = job.output && typeof job.output === "object" && !Array.isArray(job.output) ? job.output as Record<string, unknown> : {};
      const videoUrl = typeof output.videoUrl === "string" && output.videoUrl.trim() ? output.videoUrl : "";
      if (!videoUrl) continue;
      const variations = Array.isArray(result.variations) ? [...result.variations] : [];
      const first = variations[0] ?? {};
      variations[0] = { ...first, videoUrl };
      await db.update(contentGenerationsTable).set({
        result: {
          ...result,
          variations,
          automation: {
            ...automation,
            status: "video_ready",
            contentType: row.tipo,
            videoUrl,
            videoAssetId: typeof output.videoAssetId === "string" ? output.videoAssetId : null,
            updatedAt: new Date().toISOString(),
          },
        } as any,
      }).where(and(eq(contentGenerationsTable.id, row.generationId), eq(contentGenerationsTable.tenantId, row.tenantId)));
      const [planProject] = await db.select({ id: mediaProjectsTable.id, context: mediaProjectsTable.context })
        .from(mediaProjectsTable)
        .where(and(
          eq(mediaProjectsTable.tenantId, row.tenantId),
          sql`${mediaProjectsTable.context}->>'calendarItemId' = ${row.id}`,
        ))
        .limit(1);
      if (planProject) {
        await db.update(mediaProjectsTable)
          .set({
            status: "ready",
            updatedAt: new Date(),
            context: {
              ...(planProject.context ?? {}),
              executorOutputUrl: videoUrl,
              executorJobId: jobId,
              materializationStatus: "ready",
            },
          })
          .where(eq(mediaProjectsTable.id, planProject.id))
          .catch(() => undefined);
      }
      if (row.status === "processando") {
        await db.update(contentCalendarItemsTable)
          .set({ status: "gerado", updatedAt: new Date() })
          .where(and(
            eq(contentCalendarItemsTable.id, row.id),
            eq(contentCalendarItemsTable.tenantId, row.tenantId),
            eq(contentCalendarItemsTable.status, "processando"),
          ));
      }
      reconciled += 1;
      emitMarketingFunnelEvent("piece.production_completed", {
        tenantId: row.tenantId,
        pieceId: row.id,
        tipo: row.tipo,
        media: "ready",
      });
      logger.info({ tenantId: row.tenantId, calendarItemId: row.id, generationId: row.generationId, jobId, type: row.tipo }, "Vídeo automático do Plano de Mídia recebeu o arquivo final");
    } else if (job.status === "error") {
      if (!aiVideoProviderReady() && !automation["photoFallbackAt"]) {
        const assetIds = await selectTenantImageAssetIds(row.tenantId, 4);
        if (assetIds.length >= 2) {
          try {
            const fallback = await startVendorAiPhotoVideo({
              tenantId: row.tenantId,
              userId: null,
              title: `Vídeo do Plano de Mídia · ${row.tipo}`.slice(0, 120),
              assetIds,
              secondsPerImage: 4,
              format: "9:16",
              fit: "cover",
            });
            await db.update(contentGenerationsTable).set({
              result: {
                ...result,
                automation: {
                  ...automation,
                  status: "video_processing",
                  jobId: fallback.jobId,
                  projectId: fallback.projectId,
                  photoFallbackAt: new Date().toISOString(),
                  error: null,
                  updatedAt: new Date().toISOString(),
                },
              } as any,
            }).where(and(eq(contentGenerationsTable.id, row.generationId), eq(contentGenerationsTable.tenantId, row.tenantId)));
            logger.info({ tenantId: row.tenantId, calendarItemId: row.id, jobId: fallback.jobId }, "Plano de Mídia: vídeo remontado com as fotos do tenant (sem provedor de IA de vídeo)");
            continue;
          } catch (fallbackError) {
            logger.warn({ error: fallbackError, tenantId: row.tenantId, calendarItemId: row.id }, "Falha no fallback de vídeo por fotos");
          }
        }
      }
      await db.update(contentGenerationsTable).set({
        result: {
          ...result,
          automation: {
            ...automation,
            status: "video_failed",
            contentType: row.tipo,
            error: !aiVideoProviderReady()
              ? "Sem provedor de vídeo de IA e menos de 2 fotos na Biblioteca: envie fotos do negócio para montar o Reel automaticamente."
              : (job.error ?? "Falha no Media Engine"),
            updatedAt: new Date().toISOString(),
          },
        } as any,
      }).where(and(eq(contentGenerationsTable.id, row.generationId), eq(contentGenerationsTable.tenantId, row.tenantId)));
      if (row.status === "processando") {
        await db.update(contentCalendarItemsTable)
          .set({ status: "aprovado", updatedAt: new Date() })
          .where(and(
            eq(contentCalendarItemsTable.id, row.id),
            eq(contentCalendarItemsTable.tenantId, row.tenantId),
            eq(contentCalendarItemsTable.status, "processando"),
          ));
      }
      emitMarketingFunnelEvent("piece.production_failed", {
        tenantId: row.tenantId,
        pieceId: row.id,
        tipo: row.tipo,
        media: "failed",
        reasonCode: "video_failed",
      });
    }
  }
  return reconciled;
}

/**
 * Libera claims de produção que ficaram presos (aba fechada, processo
 * reiniciado, job travado). Sem isso, um item com claim antigo nunca mais é
 * produzido nem aparece como pendente.
 */
export async function releaseStaleProductionClaims(now = new Date(), olderThanMs = 30 * 60_000) {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const released = await db.update(contentCalendarItemsTable)
    .set({ contentGenerationId: null, updatedAt: now })
    .where(and(
      inArray(contentCalendarItemsTable.status, ["aprovado", "gerado", "processando"]),
      sql`(${contentCalendarItemsTable.contentGenerationId} LIKE 'producing:%' OR ${contentCalendarItemsTable.contentGenerationId} LIKE 'auto-producing:%')`,
      lt(contentCalendarItemsTable.updatedAt, cutoff),
    ))
    .returning({ id: contentCalendarItemsTable.id });
  if (released.length > 0) {
    logger.warn({ count: released.length }, "Claims de produção do Plano de Mídia liberados por inatividade");
  }
  return released.length;
}
