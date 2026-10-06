import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  agentConfigsTable,
  businessProfilesTable,
  contentGenerationsTable,
  db,
  instagramConnectionsTable,
  subscriptionsTable,
  type FeedVariation,
  type ReelsVariation,
  type StoriesVariation,
} from "@workspace/db";
import {
  generateFeedContent,
  generateImagesForContent,
} from "../lib/content-generation.js";
import {
  publishFeedCarousel,
  publishFeedPost,
  publishReelPost,
  publishStoriesPost,
} from "../lib/instagram-publish.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  buildOwnPerformancePromptBlock,
  registerPublishedPost,
} from "./content-performance.js";
import { buildReferencePatternsPromptBlock } from "./content-reference-creators.js";
import { buildGenerationDesignQa } from "./contentCreativeRuntime.js";
import {
  assertMediaAudioRightsForUsage,
  MediaRightsEnforcementError,
} from "./media-rights-enforcement.js";
import {
  assertMediaPublishReady,
  CreativeQualityGateBlockedError,
} from "./media-publish-quality-gate.js";

const PLAN_LIMITS: Record<string, number> = {
  starter: 20,
  growth: 150,
  enterprise: 200,
};

const contentObjectStorage = new ObjectStorageService();

export class SocialPublicationError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "SocialPublicationError";
  }
}

async function ensureDesignQaApproved(params: {
  tenantId: string;
  contentId: string;
  type: string;
  theme: string;
  result: any;
  variation: FeedVariation | StoriesVariation | ReelsVariation;
}) {
  const persisted = params.result?.designQa as { approved?: boolean; overallScore?: number } | undefined;
  if (persisted) {
    if (!persisted.approved) {
      throw new SocialPublicationError(
        `Design QA reprovou esta peça${typeof persisted.overallScore === "number" ? ` (${persisted.overallScore}/100)` : ""}. Corrija os alertas antes de publicar.`,
        409,
      );
    }
    return persisted;
  }

  const [profile] = await db
    .select({ id: businessProfilesTable.id })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, params.tenantId))
    .limit(1);

  const variation = params.variation as any;
  const imageUrls: string[] = Array.isArray(variation.imageUrls)
    ? variation.imageUrls.filter((value: unknown): value is string => typeof value === "string" && Boolean(value))
    : variation.imageUrl ? [variation.imageUrl] : [];
  const videoUrl = typeof variation.videoUrl === "string" ? variation.videoUrl : "";
  const text = [
    params.theme,
    variation.caption,
    variation.text,
    variation.title,
    variation.cta,
    ...(Array.isArray(variation.hashtags) ? variation.hashtags : []),
  ].filter(Boolean).join(" ");
  const hasCta = /fale|saiba|compre|chame|acesse|solicite|agora|cadastre|reserve|peça|peca/i.test(text);
  const hasRequiredMedia = params.type === "reels" ? Boolean(videoUrl) : imageUrls.length > 0;

  const designQa = buildGenerationDesignQa({
    brandScore: profile ? 92 : 76,
    readabilityScore: text.length > 20 ? 90 : 70,
    compositionScore: hasRequiredMedia ? 92 : 58,
    channelFitScore: 90,
    ctaScore: hasCta ? 94 : 70,
    technicalScore: hasRequiredMedia ? 96 : 55,
    warnings: [
      ...(!profile ? ["Perfil da empresa incompleto para validação de marca."] : []),
      ...(!hasCta ? ["CTA pouco explícito na peça."] : []),
      ...(!hasRequiredMedia ? [params.type === "reels" ? "Vídeo ausente para Reel." : "Imagem ausente para publicação social."] : []),
    ],
    recommendations: [
      ...(!hasCta ? ["Reforçar uma chamada para ação coerente com o objetivo comercial."] : []),
      ...(!hasRequiredMedia ? ["Adicionar a mídia obrigatória antes de publicar."] : []),
    ],
  });
  const reviewedAt = new Date().toISOString();
  const nextResult = {
    ...params.result,
    designQa,
    qaReviewedAt: reviewedAt,
    qaApprovedAt: designQa.approved ? reviewedAt : null,
    qaSource: "manual-review" as const,
  };

  await db
    .update(contentGenerationsTable)
    .set({ result: nextResult })
    .where(and(
      eq(contentGenerationsTable.id, params.contentId),
      eq(contentGenerationsTable.tenantId, params.tenantId),
    ));

  if (!designQa.approved) {
    throw new SocialPublicationError(
      `Design QA reprovou esta peça (${designQa.overallScore}/100). Corrija os alertas antes de publicar.`,
      409,
    );
  }

  return designQa;
}

async function resolveInstagramMediaUrl(rawUrl: string): Promise<string> {
  const parsed = new URL(rawUrl, "https://vendorai.local");
  const storagePrefixes = ["/api/storage/objects/", "/storage/objects/"];
  const storagePrefix = storagePrefixes.find((prefix) => parsed.pathname.startsWith(prefix));

  if (storagePrefix) {
    const entityPath = `/objects/${decodeURIComponent(parsed.pathname.slice(storagePrefix.length))}`;
    return contentObjectStorage.getObjectEntitySignedUrl(entityPath, 3600);
  }
  if (parsed.pathname.startsWith("/objects/")) {
    return contentObjectStorage.getObjectEntitySignedUrl(parsed.pathname, 3600);
  }

  if (/^https:\/\//i.test(rawUrl)) return rawUrl;

  const publicBase = (
    process.env["FRONTEND_APP_URL"] ||
    process.env["APP_URL"] ||
    "https://app.appvendorai.com"
  ).replace(/\/$/, "");
  return new URL(rawUrl, `${publicBase}/`).toString();
}

export async function getPublishingCredentials(tenantId: string, connectionId?: string) {
  const [[directConnection], [legacyConfig]] = await Promise.all([
    db
      .select({
        id: instagramConnectionsTable.id,
        accessToken: instagramConnectionsTable.pageAccessToken,
        accountId: instagramConnectionsTable.accountId,
        disconnectedAt: instagramConnectionsTable.disconnectedAt,
        tokenExpiresAt: instagramConnectionsTable.tokenExpiresAt,
      })
      .from(instagramConnectionsTable)
      .where(connectionId
        ? and(eq(instagramConnectionsTable.tenantId, tenantId), eq(instagramConnectionsTable.id, connectionId))
        : eq(instagramConnectionsTable.tenantId, tenantId))
      .limit(1),
    db
      .select({
        accessToken: agentConfigsTable.instagramPageAccessToken,
        accountId: agentConfigsTable.instagramPageId,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1),
  ]);

  const directTokenExpired = Boolean(
    directConnection?.tokenExpiresAt && directConnection.tokenExpiresAt <= new Date(),
  );
  const directPublishReady = Boolean(
    directConnection && !directConnection.disconnectedAt && !directTokenExpired,
  );
  const accessToken = directPublishReady ? directConnection?.accessToken : legacyConfig?.accessToken;
  const accountId = directPublishReady ? directConnection?.accountId : legacyConfig?.accountId;

  if (!accessToken || !accountId) {
    throw new SocialPublicationError(
      directTokenExpired
        ? "A conexão do Instagram expirou. Reconecte a conta em Configurações → Integrações."
        : "Instagram sem credenciais de publicação. Reconecte sua conta profissional em Configurações → Integrações.",
      directTokenExpired ? 401 : 400,
    );
  }

  return { accessToken, accountId, connectionId: directPublishReady ? directConnection?.id : undefined };
}

export async function publishContentGenerationToInstagram(params: {
  tenantId: string;
  contentId: string;
  variationIndex: number;
  captionOverride?: string;
  instagramConnectionId?: string;
  log: Logger;
}): Promise<{ postId: string; contentType: "feed" | "stories" | "reels" }> {
  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(
      eq(contentGenerationsTable.id, params.contentId),
      eq(contentGenerationsTable.tenantId, params.tenantId),
    ))
    .limit(1);

  if (!gen) throw new SocialPublicationError("Conteúdo não encontrado", 404);
  if (!["feed", "stories", "reels"].includes(gen.type)) {
    throw new SocialPublicationError("Este formato ainda não possui publicação automática para Instagram.", 400);
  }

  const variations = Array.isArray(gen.result?.variations) ? gen.result.variations : [];
  const variation = variations[params.variationIndex] as FeedVariation | StoriesVariation | ReelsVariation | undefined;
  if (!variation) {
    throw new SocialPublicationError("Este conteúdo não possui uma variação publicável.", 400);
  }

  await ensureDesignQaApproved({
    tenantId: params.tenantId,
    contentId: gen.id,
    type: gen.type,
    theme: gen.theme,
    result: gen.result,
    variation,
  });

  const variationRecord = variation as unknown as Record<string, unknown>;
  const qualityMediaUrls = [
    ...(Array.isArray(variationRecord.imageUrls) ? variationRecord.imageUrls : []),
    variationRecord.imageUrl,
    variationRecord.videoUrl,
    variationRecord.coverUrl,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  try {
    await assertMediaPublishReady({ tenantId: params.tenantId, mediaUrls: qualityMediaUrls });
  } catch (error) {
    if (error instanceof CreativeQualityGateBlockedError) {
      throw new SocialPublicationError(error.message, error.status);
    }
    throw error;
  }

  const { accessToken, accountId, connectionId } = await getPublishingCredentials(params.tenantId, params.instagramConnectionId);
  let postId: string;
  let captionOuTexto = "";

  if (gen.type === "feed") {
    const feed = variation as FeedVariation;
    const imageUrls = feed.imageUrls?.length ? feed.imageUrls : feed.imageUrl ? [feed.imageUrl] : [];
    if (imageUrls.length === 0) throw new SocialPublicationError("Imagem não disponível para publicar o Feed.", 400);
    if (imageUrls.length > 10) throw new SocialPublicationError("O Feed aceita no máximo 10 imagens por publicação.", 400);
    const publicImageUrls = await Promise.all(imageUrls.map(resolveInstagramMediaUrl));
    const caption = params.captionOverride ?? `${feed.caption}\n\n${(feed.hashtags ?? []).join(" ")}`;
    postId = publicImageUrls.length > 1
      ? await publishFeedCarousel(accountId, accessToken, caption, publicImageUrls, params.log)
      : await publishFeedPost(accountId, accessToken, caption, publicImageUrls[0]!, params.log);
    captionOuTexto = caption;
  } else if (gen.type === "stories") {
    const story = variation as StoriesVariation;
    const imageUrl = story.imageUrl;
    if (!imageUrl) throw new SocialPublicationError("Imagem não disponível para publicar o Story.", 400);
    const publicImageUrl = await resolveInstagramMediaUrl(imageUrl);
    postId = await publishStoriesPost(accountId, accessToken, publicImageUrl, params.log);
    captionOuTexto = story.text;
  } else {
    const reel = variation as ReelsVariation & { videoUrl?: string };
    if (!reel.videoUrl) {
      throw new SocialPublicationError(
        "O Reel precisa ter um vídeo anexado antes da publicação automática. O roteiro pode continuar sendo usado para gerar o anúncio patrocinado.",
        400,
      );
    }
    try {
      await assertMediaAudioRightsForUsage({
        tenantId: params.tenantId,
        mediaUrl: reel.videoUrl,
        usage: "organic",
      });
    } catch (error) {
      if (error instanceof MediaRightsEnforcementError) {
        throw new SocialPublicationError(error.message, error.status);
      }
      throw error;
    }
    const publicVideoUrl = await resolveInstagramMediaUrl(reel.videoUrl);
    const publicCoverUrl = reel.coverUrl ? await resolveInstagramMediaUrl(reel.coverUrl) : undefined;
    const caption = params.captionOverride ?? `${reel.title ?? gen.theme}${reel.cta ? `\n\n${reel.cta}` : ""}`;
    postId = await publishReelPost(
      accountId,
      accessToken,
      caption,
      publicVideoUrl,
      params.log,
      {
        coverUrl: publicCoverUrl,
        thumbOffsetMs: publicCoverUrl ? undefined : reel.thumbOffsetMs,
      },
    );
    captionOuTexto = caption;
  }

  await registerPublishedPost({
    tenantId: params.tenantId,
    contentGenerationId: gen.id,
    variationIndex: params.variationIndex,
    instagramMediaId: postId,
    contentType: gen.type,
    theme: gen.theme,
    captionOuTexto,
    instagramConnectionId: connectionId,
  });

  return { postId, contentType: gen.type as "feed" | "stories" | "reels" };
}

async function getMonthlyContentAllowance(tenantId: string) {
  const [[config], [subscription]] = await Promise.all([
    db
      .select({
        id: agentConfigsTable.id,
        used: agentConfigsTable.contentGenerationsThisMonth,
        resetAt: agentConfigsTable.contentGenerationsResetAt,
      })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId))
      .limit(1),
    db
      .select({ plano: subscriptionsTable.plano })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenantId))
      .limit(1),
  ]);

  if (!config) return { allowed: false, configId: null as string | null, used: 0 };

  const now = new Date();
  const needsReset = !config.resetAt || now.getTime() - config.resetAt.getTime() > 30 * 24 * 60 * 60 * 1000;
  const used = needsReset ? 0 : config.used;
  if (needsReset) {
    await db
      .update(agentConfigsTable)
      .set({ contentGenerationsThisMonth: 0, contentGenerationsResetAt: now })
      .where(eq(agentConfigsTable.id, config.id));
  }

  const limit = PLAN_LIMITS[subscription?.plano ?? "starter"] ?? 20;
  return { allowed: used < limit, configId: config.id, used };
}

export async function createAndPublishAutonomousFeed(params: {
  tenantId: string;
  theme: string;
  log: Logger;
}): Promise<{
  contentGenerationId: string | null;
  published: boolean;
  postId: string | null;
  warning?: string;
}> {
  const allowance = await getMonthlyContentAllowance(params.tenantId);
  if (!allowance.allowed || !allowance.configId) {
    return {
      contentGenerationId: null,
      published: false,
      postId: null,
      warning: "Limite mensal de geração de conteúdo atingido ou configuração de agentes ausente.",
    };
  }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, params.tenantId))
    .limit(1);

  const [ownPerfBlock, referencePatterns] = await Promise.all([
    buildOwnPerformancePromptBlock(params.tenantId),
    buildReferencePatternsPromptBlock(params.tenantId),
  ]);

  const generated = await generateFeedContent(
    profile ?? {},
    params.tenantId,
    params.theme,
    undefined,
    1,
    1,
    undefined,
    undefined,
    "1:1",
    { referencePatterns: ownPerfBlock + referencePatterns },
  );

  const imageUrls = await generateImagesForContent(
    profile ?? {},
    params.tenantId,
    params.theme,
    undefined,
    "feed",
    1,
  );
  const imageUrl = imageUrls[0];
  const variations = generated.result.variations as Array<Record<string, unknown>>;
  if (!variations[0] || !imageUrl) {
    throw new Error("A IA não retornou uma variação completa com imagem para publicação automática.");
  }
  variations[0] = { ...variations[0], imageUrl };

  const first = variations[0] as { caption?: string; hashtags?: string[] };
  const qaText = [first.caption, ...(first.hashtags ?? [])].filter(Boolean).join(" ");
  const designQa = buildGenerationDesignQa({
    brandScore: profile ? 92 : 76,
    readabilityScore: qaText.length > 20 ? 90 : 72,
    compositionScore: imageUrl ? 94 : 60,
    channelFitScore: 92,
    ctaScore: /fale|saiba|compre|chame|acesse|solicite|agora/i.test(qaText) ? 94 : 72,
    technicalScore: imageUrl ? 96 : 60,
    warnings: [
      ...(!profile ? ["Perfil da empresa incompleto para validação de marca."] : []),
      ...(!/fale|saiba|compre|chame|acesse|solicite|agora/i.test(qaText) ? ["CTA pouco explícito na peça automática."] : []),
    ],
    recommendations: [],
  });
  const reviewedAt = new Date().toISOString();

  const [saved] = await db
    .insert(contentGenerationsTable)
    .values({
      tenantId: params.tenantId,
      type: "feed",
      theme: params.theme,
      contentFormat: "feed_square",
      aspectRatio: "1:1",
      result: {
        variations,
        designQa,
        qaReviewedAt: reviewedAt,
        qaApprovedAt: designQa.approved ? reviewedAt : null,
        qaSource: "autopilot",
      } as any,
      tokensUsed: generated.tokensUsed,
    })
    .returning();

  if (!saved) throw new Error("Não foi possível persistir o conteúdo social automático.");

  await db
    .update(agentConfigsTable)
    .set({ contentGenerationsThisMonth: allowance.used + 1 })
    .where(eq(agentConfigsTable.id, allowance.configId));

  if (!designQa.approved) {
    return {
      contentGenerationId: saved.id,
      published: false,
      postId: null,
      warning: `Conteúdo gerado, mas bloqueado pelo Design QA (${designQa.overallScore}/100).`,
    };
  }

  try {
    const published = await publishContentGenerationToInstagram({
      tenantId: params.tenantId,
      contentId: saved.id,
      variationIndex: 0,
      log: params.log,
    });
    return { contentGenerationId: saved.id, published: true, postId: published.postId };
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    params.log.warn(
      { tenantId: params.tenantId, contentGenerationId: saved.id, error: warning },
      "content-autopilot: conteúdo social gerado, mas publicação no Instagram não foi concluída",
    );
    return { contentGenerationId: saved.id, published: false, postId: null, warning };
  }
}
