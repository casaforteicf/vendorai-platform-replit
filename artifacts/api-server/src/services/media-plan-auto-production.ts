import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  agentConfigsTable,
  businessProfilesTable,
  contentCalendarItemsTable,
  contentGenerationsTable,
  db,
  mediaJobsTable,
  mediaPlansTable,
  subscriptionsTable,
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

const PLAN_LIMITS: Record<string, number> = {
  starter: 20,
  growth: 150,
  enterprise: 200,
};
const DEFAULT_TIMEZONE = process.env["MARKETING_SCHEDULE_TIMEZONE"] || "America/Sao_Paulo";
const PRODUCTION_LEAD_HOURS = Math.max(1, Number(process.env["MARKETING_PRODUCTION_LEAD_HOURS"] || 24));
const MAX_ITEMS_PER_TICK = 8;
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
  const name = normalize(pilar.split(" · ")[0] || "");
  return content.campanhas?.find((campaign) => normalize(campaign.nome) === name) ?? null;
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
  const limit = PLAN_LIMITS[subscription?.plano ?? "starter"] ?? 20;
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

  const [profile] = await db.select().from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, input.tenantId)).limit(1);
  const strategy = {
    postObjective: input.campaign.objetivo,
    desiredCta: input.campaign.oferta,
    // Automated media-plan production must not import examples from unrelated
    // campaigns/products. Keep the generation bounded to the validated campaign.
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
    generated = await generateStoriesContent(profile ?? {}, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, 1, undefined, undefined, aspectRatio, strategy);
  } else if (input.tipo === "linkedin_post") {
    storedType = "linkedin";
    generated = await generateLinkedInContent(profile ?? {}, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, undefined, strategy);
  } else if (input.tipo === "youtube_video") {
    storedType = "youtube";
    aspectRatio = "16:9";
    generated = await generateYouTubeScript(profile ?? {}, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, undefined, strategy);
  } else if (VIDEO_AUTO_TYPES.has(input.tipo)) {
    storedType = input.tipo === "youtube_short" ? "youtube" : "reels";
    contentFormat = "reels";
    aspectRatio = "9:16";
    generated = await generateReelsScript(profile ?? {}, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, undefined, strategy);
  } else {
    storedType = "feed";
    contentFormat = "feed_square";
    aspectRatio = "1:1";
    generated = await generateFeedContent(profile ?? {}, input.tenantId, input.theme, input.campaign.produtoServico || undefined, 1, input.tipo === "carrossel" ? 4 : 1, undefined, undefined, aspectRatio, strategy);
  }

  const result = generated.result as GenerationResultRecord;
  const variations = Array.isArray(result.variations) ? result.variations : [];
  if (!variations[0]) throw new Error("content_generation_empty_variation");

  if (input.tipo === "feed" || input.tipo === "carrossel" || input.tipo === "stories") {
    const imageCount = input.tipo === "carrossel" ? 4 : 1;
    const imageType = input.tipo === "stories" ? "stories" : "feed";
    const imageUrls = await generateImagesForContent(
      profile ?? {},
      input.tenantId,
      input.theme,
      input.campaign.produtoServico || undefined,
      imageType,
      imageCount,
    );
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
        calendarItemId: input.calendarItemId,
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
      duration: longVideo ? 30 : 16,
      generationMode: "ai_only",
      mediaInputs: [],
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

  let produced = 0;
  let attempted = 0;
  for (const row of rows) {
    if (attempted >= MAX_ITEMS_PER_TICK) break;
    if (!row.mediaPlanId || !AUTO_TYPES.has(row.tipo) || !providerSupported(row.canal)) continue;
    const content = row.planContent as PlanContent;
    if (!shouldProduce(row.dataAgendada, content.publicacaoOrganica, now)) continue;
    const campaign = campaignForItem(content, row.pilar);
    if (!campaign) continue;

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
    attempted += 1;

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
        status: "gerado",
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
    generationId: contentCalendarItemsTable.contentGenerationId,
    result: contentGenerationsTable.result,
  }).from(contentCalendarItemsTable)
    .innerJoin(contentGenerationsTable, and(
      eq(contentGenerationsTable.id, contentCalendarItemsTable.contentGenerationId),
      eq(contentGenerationsTable.tenantId, contentCalendarItemsTable.tenantId),
    ))
    .where(and(
      eq(contentCalendarItemsTable.status, "gerado"),
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
    const jobId = typeof automation.jobId === "string" ? automation.jobId : "";
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
      reconciled += 1;
      logger.info({ tenantId: row.tenantId, calendarItemId: row.id, generationId: row.generationId, jobId, type: row.tipo }, "Vídeo automático do Plano de Mídia recebeu o arquivo final");
    } else if (job.status === "error") {
      await db.update(contentGenerationsTable).set({
        result: {
          ...result,
          automation: {
            ...automation,
            status: "video_failed",
            contentType: row.tipo,
            error: job.error ?? "Falha no Media Engine",
            updatedAt: new Date().toISOString(),
          },
        } as any,
      }).where(and(eq(contentGenerationsTable.id, row.generationId), eq(contentGenerationsTable.tenantId, row.tenantId)));
    }
  }
  return reconciled;
}
