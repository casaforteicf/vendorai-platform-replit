import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  contentGenerationsTable,
  contentStudioUploadsTable,
  contentLibraryTable,
  agentConfigsTable,
  businessProfilesTable,
  produtosCatalogoTable,
  varejoProdutoTable,
  supermercadoProdutoTable,
  insumosTable,
  subscriptionsTable,
  tenantsTable,
  mediaPlansTable,
  contentCalendarItemsTable,
} from "@workspace/db";
import {
  generateFeedContent,
  generateStoriesContent,
  generateReelsScript,
  generateLinkedInContent,
  generateYouTubeScript,
  generateImagesForContent,
  generateImagesWithReference,
  generateContentStrategy,
  describeImage,
  improveVariationText,
} from "../lib/content-generation.js";
import { InstagramApiError, listRecentMedia } from "../lib/instagram-publish.js";
import { buildReferencePatternsPromptBlock } from "../services/content-reference-creators.js";
import { publishContentGenerationToInstagram, getPublishingCredentials, SocialPublicationError } from "../services/contentSocialPublisher.js";
import { buildOwnPerformancePromptBlock } from "../services/content-performance.js";
import { resolveContentContext } from "../services/contentContextLibrary.js";
import { applyBrandFrame, generateHighlightCover } from "../services/brandFrame.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  normalizeInstagramCoverSource,
  renderInstagramProfileCover,
} from "../services/instagram-cover.js";

const router: IRouter = Router();

const PLAN_LIMITS: Record<string, number> = {
  starter: 20,
  growth: 150,
  enterprise: 200,
};

const generateBodySchema = z.object({
  type: z.enum(["feed", "stories", "reels", "linkedin", "youtube", "tiktok"]),
  theme: z.string().min(3, "Descreva o tema (mín. 3 caracteres)"),
  productId: z.string().optional().nullable(),
  productSource: z.enum(["catalog", "varejo", "supermercado", "insumo"]).optional().default("catalog"),
  variations: z.coerce.number().int().min(1).max(3).default(1),
  imageCount: z.coerce.number().int().min(1).max(10).default(2),
  imageUrls: z.array(z.string()).optional().default([]),
  contentFormat: z.enum(["feed_square", "feed_portrait", "stories", "reels"]).optional().nullable(),
  aspectRatio: z.string().optional().nullable(),
  // Fotos do cliente marcadas como "Material" — vão direto como imageUrls do carrossel
  postMaterialUrls: z.array(z.string()).optional().default([]),
  // Campos estratégicos — Passo 2
  customerPain: z.string().optional().nullable(),
  postObjective: z.string().optional().nullable(),
  voiceTone: z.string().optional().nullable(),
  desiredCta: z.string().optional().nullable(),
});

function normalizeCampaignLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

async function plannerContextIsValid(input: {
  tenantId: string;
  mediaPlanId: string;
  campaignId: string;
  calendarItemId: string;
}) {
  const [[plan], [calendarItem]] = await Promise.all([
    db
      .select({ conteudo: mediaPlansTable.conteudo })
      .from(mediaPlansTable)
      .where(and(eq(mediaPlansTable.id, input.mediaPlanId), eq(mediaPlansTable.tenantId, input.tenantId)))
      .limit(1),
    db
      .select({ mediaPlanId: contentCalendarItemsTable.mediaPlanId, pilar: contentCalendarItemsTable.pilar })
      .from(contentCalendarItemsTable)
      .where(and(eq(contentCalendarItemsTable.id, input.calendarItemId), eq(contentCalendarItemsTable.tenantId, input.tenantId)))
      .limit(1),
  ]);

  const campaigns = Array.isArray((plan?.conteudo as { campanhas?: unknown[] } | null)?.campanhas)
    ? ((plan?.conteudo as { campanhas?: Array<{ id?: string; nome?: string }> }).campanhas ?? [])
    : [];
  const campaign = campaigns.find((entry) => entry.id === input.campaignId);
  const calendarCampaignName = String(calendarItem?.pilar ?? "").split(" · ")[0]?.trim() ?? "";

  return Boolean(
    plan &&
    calendarItem &&
    calendarItem.mediaPlanId === input.mediaPlanId &&
    campaign?.nome &&
    normalizeCampaignLabel(calendarCampaignName) === normalizeCampaignLabel(campaign.nome),
  );
}

async function getMonthlyUsage(
  tenantId: string
): Promise<{ used: number; limit: number; configId: string | null }> {
  const [config] = await db
    .select({
      id: agentConfigsTable.id,
      tenantId: agentConfigsTable.tenantId,
      contentGenerationsThisMonth: agentConfigsTable.contentGenerationsThisMonth,
      contentGenerationsResetAt: agentConfigsTable.contentGenerationsResetAt,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!config) return { used: 0, limit: 20, configId: null };

  const [sub] = await db
    .select({ plano: subscriptionsTable.plano })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId));

  const plan = sub?.plano ?? "starter";
  const limit = PLAN_LIMITS[plan] ?? 20;

  const now = new Date();
  const resetAt = config.contentGenerationsResetAt;
  const needsReset =
    !resetAt ||
    now.getTime() - resetAt.getTime() > 30 * 24 * 60 * 60 * 1000;

  if (needsReset) {
    await db
      .update(agentConfigsTable)
      .set({ contentGenerationsThisMonth: 0, contentGenerationsResetAt: now })
      .where(eq(agentConfigsTable.tenantId, tenantId));
    return { used: 0, limit, configId: config.id };
  }

  return { used: config.contentGenerationsThisMonth, limit, configId: config.id };
}

router.post("/tenants/:tenantId/content/generate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = generateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { type, theme, productId, productSource, variations, imageCount, imageUrls: referenceImageUrls, contentFormat, aspectRatio, postMaterialUrls, customerPain, postObjective, voiceTone, desiredCta } = parsed.data;

  const { used, limit, configId } = await getMonthlyUsage(tenantId);
  if (used >= limit) {
    res.status(402).json({
      error: `Limite mensal de ${limit} gerações atingido. Upgrade de plano para gerar mais conteúdo.`,
      monthlyUsed: used,
      monthlyLimit: limit,
    });
    return;
  }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  let productName: string | undefined;
  let productExtra: string | undefined;
  if (productId) {
    const src = productSource ?? "catalog";
    if (src === "varejo") {
      const [p] = await db
        .select({ nome: varejoProdutoTable.nome, categoria: varejoProdutoTable.categoria, genero: varejoProdutoTable.genero })
        .from(varejoProdutoTable)
        .where(and(eq(varejoProdutoTable.id, productId), eq(varejoProdutoTable.tenantId, tenantId)));
      if (p) {
        productName = p.nome;
        const extras: string[] = [];
        if (p.categoria) extras.push(`Categoria: ${p.categoria}`);
        if (p.genero) extras.push(`Gênero: ${p.genero}`);
        if (extras.length) productExtra = extras.join(" | ");
      }
    } else if (src === "supermercado") {
      const [p] = await db
        .select({ nome: supermercadoProdutoTable.nome, categoria: supermercadoProdutoTable.categoria })
        .from(supermercadoProdutoTable)
        .where(and(eq(supermercadoProdutoTable.id, productId), eq(supermercadoProdutoTable.tenantId, tenantId)));
      if (p) {
        productName = p.nome;
        if (p.categoria) productExtra = `Categoria: ${p.categoria}`;
      }
    } else if (src === "insumo") {
      const [p] = await db
        .select({ nome: insumosTable.nome, categoria: insumosTable.categoria, unidade: insumosTable.unidade })
        .from(insumosTable)
        .where(and(eq(insumosTable.id, productId), eq(insumosTable.tenantId, tenantId)));
      if (p) {
        productName = p.nome;
        const extras: string[] = [];
        if (p.categoria) extras.push(`Categoria: ${p.categoria}`);
        if (p.unidade) extras.push(`Unidade: ${p.unidade}`);
        if (extras.length) productExtra = extras.join(" | ");
      }
    } else {
      const [p] = await db
        .select({ nome: produtosCatalogoTable.nome })
        .from(produtosCatalogoTable)
        .where(and(eq(produtosCatalogoTable.id, productId), eq(produtosCatalogoTable.tenantId, tenantId)));
      productName = p?.nome;
    }
  }

  const [ownPerfBlock, refCreatorsBlock, libraryContext] = await Promise.all([
    buildOwnPerformancePromptBlock(tenantId),
    buildReferencePatternsPromptBlock(tenantId),
    resolveContentContext({
      tenantId,
      query: [theme, productName, customerPain, postObjective].filter(Boolean).join(" "),
      productIds: productId && productSource === "catalog" ? [productId] : [],
      limit: 8,
    }),
  ]);
  const strategy = {
    customerPain: customerPain ?? undefined,
    postObjective: postObjective ?? undefined,
    voiceTone: voiceTone ?? undefined,
    desiredCta: desiredCta ?? undefined,
    referencePatterns: [libraryContext.promptBlock, ownPerfBlock, refCreatorsBlock].filter(Boolean).join("\n\n"),
  };

  let result: { result: { variations: unknown[] }; tokensUsed: number };
  try {
    if (type === "feed") {
      result = await generateFeedContent(profile ?? {}, tenantId, theme, productName, variations, imageCount, productExtra, referenceImageUrls.length > 0 ? referenceImageUrls : undefined, aspectRatio ?? undefined, strategy);
    } else if (type === "stories") {
      result = await generateStoriesContent(profile ?? {}, tenantId, theme, productName, variations, imageCount, productExtra, referenceImageUrls.length > 0 ? referenceImageUrls : undefined, aspectRatio ?? undefined, strategy);
    } else if (type === "linkedin") {
      result = await generateLinkedInContent(profile ?? {}, tenantId, theme, productName, variations, productExtra, strategy);
    } else if (type === "youtube") {
      result = await generateYouTubeScript(profile ?? {}, tenantId, theme, productName, variations, productExtra, strategy);
    } else {
      result = await generateReelsScript(profile ?? {}, tenantId, theme, productName, variations, productExtra, strategy);
    }
  } catch (err) {
    req.log.error({ err }, "content generation failed");
    res.status(500).json({ error: "Falha na geração de conteúdo. Tente novamente." });
    return;
  }

  // Se o cliente enviou fotos como "Material", injeta direto nas variações (sem gerar via IA)
  if (postMaterialUrls && postMaterialUrls.length > 0) {
    const varArray = result.result.variations as Array<Record<string, unknown>>;
    for (const v of varArray) {
      v["imageUrls"] = postMaterialUrls;
      v["imageUrl"] = postMaterialUrls[0] ?? null;
    }
  }

  const finalResult = result.result;

  let saved: typeof contentGenerationsTable.$inferSelect | undefined;
  try {
    const [row] = await db
      .insert(contentGenerationsTable)
      .values({
        tenantId,
        type,
        productId: productId ?? null,
        productName: productName ?? null,
        theme,
        contentFormat: contentFormat ?? null,
        aspectRatio: aspectRatio ?? null,
        result: finalResult as { variations: [] },
        tokensUsed: result.tokensUsed,
      })
      .returning();
    saved = row;

    if (configId) {
      await db
        .update(agentConfigsTable)
        .set({ contentGenerationsThisMonth: used + 1 })
        .where(eq(agentConfigsTable.id, configId));
    }
  } catch (dbErr) {
    req.log.error({ err: dbErr }, "content: failed to persist generation — returning result without saving");
  }

  res.json(saved
    ? { ...saved, contextSources: libraryContext.sources }
    : { id: null, tenantId, type, theme, result: finalResult, tokensUsed: result.tokensUsed, contextSources: libraryContext.sources });
});

const strategyBodySchema = z.object({
  command: z.string().min(3, "Descreva o comando (mín. 3 caracteres)"),
  contentType: z.enum(["feed", "stories", "reels", "linkedin", "youtube", "tiktok"]).default("feed"),
  variations: z.coerce.number().int().min(1).max(5).default(3),
});

router.post("/tenants/:tenantId/content/strategy", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = strategyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { command, contentType, variations } = parsed.data;

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  try {
    const [ownPerfBlock, refCreatorsBlock, libraryContext] = await Promise.all([
      buildOwnPerformancePromptBlock(tenantId),
      buildReferencePatternsPromptBlock(tenantId),
      resolveContentContext({ tenantId, query: command, limit: 8 }),
    ]);
    const { strategy } = await generateContentStrategy(
      profile ?? {},
      tenantId,
      command,
      contentType,
      variations,
      [libraryContext.promptBlock, ownPerfBlock, refCreatorsBlock].filter(Boolean).join("\n\n"),
    );
    res.json({ ...strategy, contextSources: libraryContext.sources });
  } catch (err) {
    req.log.error({ err }, "content strategy generation failed");
    res.status(500).json({ error: "Falha na geração de estratégia. Tente novamente." });
  }
});

router.get("/tenants/:tenantId/content", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [items, usage] = await Promise.all([
    db
      .select()
      .from(contentGenerationsTable)
      .where(eq(contentGenerationsTable.tenantId, tenantId))
      .orderBy(desc(contentGenerationsTable.createdAt))
      .limit(50),
    getMonthlyUsage(tenantId),
  ]);

  res.json({
    items,
    monthlyUsed: usage.used,
    monthlyLimit: usage.limit,
  });
});

const publishBodySchema = z.object({
  variationIndex: z.number().int().min(0),
  captionOverride: z.string().optional(),
  instagramConnectionId: z.string().min(1).optional(),
});
const patchMediaBodySchema = z.object({
  objectPath: z.string().min(1),
  field: z.enum(["imageUrl", "videoUrl", "coverUrl"]).default("imageUrl"),
  append: z.boolean().optional().default(false),
});
const reelCoverBodySchema = z.object({
  thumbOffsetMs: z.number().int().min(0).max(3_600_000),
});
const reelCoverCropBodySchema = z.object({
  zoom: z.coerce.number().min(1).max(3),
  x: z.coerce.number().min(-1).max(1),
  y: z.coerce.number().min(-1).max(1),
});
const reelCoverGenerateBodySchema = z.object({
  instructions: z.string().trim().max(500).optional(),
});
const feedCoverBodySchema = z.object({
  imageIndex: z.number().int().min(0).max(9),
});

// POST .../variations/:idx/generate-image — gera imagem via IA e salva na variação
router.post("/tenants/:tenantId/content/:contentId/variations/:idx/generate-image", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
  if (gen.type === "reels") { res.status(400).json({ error: "Reels não suportam geração de imagem" }); return; }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const format = gen.type === "stories" ? "stories" : "feed";
  const referenceImageUrl: string | undefined = typeof req.body?.referenceImageUrl === "string" ? req.body.referenceImageUrl : undefined;

  let imageUrl: string | undefined;
  try {
    if (referenceImageUrl) {
      const brand = (profile as any)?.nomeFantasia || "a empresa";
      const formatLabel = format === "stories" ? "Stories (vertical 9:16)" : "Feed (square 1:1)";
      const editPrompt = `Improve this product/marketing image for Instagram ${formatLabel} for the brand "${brand}". Subject: ${gen.theme}${gen.productName ? ` — product: ${gen.productName}` : ""}. Keep the same product and subject. Improve: lighting, sharpness, color, composition. Professional marketing quality. No text overlays. No watermarks.`;
      const urls = await generateImagesWithReference(tenantId, referenceImageUrl, editPrompt, 1);
      imageUrl = urls[0];
    } else {
      const imageUrls = await generateImagesForContent(
        profile ?? {},
        tenantId,
        gen.theme,
        gen.productName ?? undefined,
        format,
        1,
      );
      imageUrl = imageUrls[0];
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao gerar imagem";
    res.status(502).json({ error: `Erro ao gerar imagem: ${msg}` });
    return;
  }

  if (!imageUrl) {
    res.status(502).json({ error: "DALL-E não retornou imagem. Tente novamente." });
    return;
  }

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string; imageUrls?: string[]; imageSource?: "ai" | "upload" })[];
  if (!variations[idx]) { res.status(400).json({ error: "Variação inválida" }); return; }
  variations[idx] = { ...variations[idx], imageUrl, imageUrls: undefined, imageSource: "ai" } as typeof variations[number];

  await db
    .update(contentGenerationsTable)
    .set({ result: { variations } })
    .where(eq(contentGenerationsTable.id, contentId));

  res.json({ success: true, imageUrl });
});

router.patch("/tenants/:tenantId/content/:contentId/variations/:idx/image", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = patchMediaBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "objectPath é obrigatório" });
    return;
  }

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & {
    imageUrl?: string | null;
    imageUrls?: string[];
    videoUrl?: string;
    coverUrl?: string;
    coverOriginalUrl?: string;
    coverSource?: "upload" | "frame" | "ai";
    coverCrop?: { zoom: number; x: number; y: number };
    thumbOffsetMs?: number;
    framed?: boolean;
    imageSource?: "ai" | "upload";
  })[];
  if (!variations[idx]) { res.status(400).json({ error: "Variação inválida" }); return; }

  const mediaUrl = `/api/storage${body.data.objectPath}`;
  const variation = variations[idx]!;
  let responseImageUrls: string[] | undefined;

  if (body.data.field === "imageUrl") {
    if (body.data.append) {
      const currentUrls = variation.imageUrls ?? (variation.imageUrl ? [variation.imageUrl] : []);
      const nextUrls = Array.from(new Set([...currentUrls, mediaUrl]));
      if (nextUrls.length > 10) {
        res.status(422).json({ error: "O Feed aceita no máximo 10 imagens por publicação." });
        return;
      }
      responseImageUrls = nextUrls;
      variations[idx] = {
        ...variation,
        imageUrl: nextUrls[0] ?? mediaUrl,
        imageUrls: nextUrls.length > 1 ? nextUrls : undefined,
        imageSource: "upload",
        framed: false,
      };
    } else {
      responseImageUrls = [mediaUrl];
      variations[idx] = { ...variation, imageUrl: mediaUrl, imageUrls: undefined, imageSource: "upload", framed: false };
    }
  } else if (body.data.field === "videoUrl") {
    variations[idx] = { ...variation, videoUrl: mediaUrl };
  } else {
    try {
      const sourceBuffer = await fetchVariationImageBuffer(mediaUrl);
      const rendered = await renderInstagramProfileCover(sourceBuffer, { zoom: 1, x: 0, y: 0 });
      const coverUrl = await saveContentImageBuffer(rendered.buffer, "instagram-reel-cover.jpg");
      variations[idx] = {
        ...variation,
        coverUrl,
        coverOriginalUrl: mediaUrl,
        coverSource: "upload",
        coverCrop: rendered.crop,
        thumbOffsetMs: undefined,
      };
    } catch (error) {
      req.log.error({ error }, "instagram-cover: falha ao preparar capa enviada");
      const message = error instanceof Error ? error.message : "Falha ao preparar a capa";
      res.status(422).json({ error: message });
      return;
    }
  }

  await db
    .update(contentGenerationsTable)
    .set({ result: { ...gen.result, variations } })
    .where(eq(contentGenerationsTable.id, contentId));

  const savedVariation = variations[idx] as typeof variations[number] & { coverUrl?: string };
  res.json({
    success: true,
    mediaUrl: body.data.field === "coverUrl" ? savedVariation.coverUrl ?? mediaUrl : mediaUrl,
    originalMediaUrl: body.data.field === "coverUrl" ? mediaUrl : undefined,
    field: body.data.field,
    imageUrls: responseImageUrls,
  });
});

router.patch("/tenants/:tenantId/content/:contentId/variations/:idx/feed-cover", async (req, res) => { // tenant-audit: reviewed same-tenant/Super Admin guard immediately below
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = feedCoverBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(422).json({ error: "Selecione uma imagem válida para a capa." });
    return;
  }

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
  if (gen.type !== "feed") { res.status(422).json({ error: "Capa por reordenação está disponível apenas para Feed/Carrossel." }); return; }

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & {
    imageUrl?: string | null;
    imageUrls?: string[];
  })[];
  const variation = variations[idx];
  if (!variation) { res.status(400).json({ error: "Variação inválida" }); return; }

  const currentUrls = variation.imageUrls ?? (variation.imageUrl ? [variation.imageUrl] : []);
  const selected = currentUrls[body.data.imageIndex];
  if (!selected) { res.status(422).json({ error: "Essa imagem não existe mais no carrossel." }); return; }

  const nextUrls = [selected, ...currentUrls.filter((_, imageIndex) => imageIndex !== body.data.imageIndex)];
  variations[idx] = {
    ...variation,
    imageUrl: nextUrls[0],
    imageUrls: nextUrls.length > 1 ? nextUrls : undefined,
  };

  await db
    .update(contentGenerationsTable)
    .set({ result: { ...gen.result, variations } })
    .where(eq(contentGenerationsTable.id, contentId));

  res.json({ success: true, imageUrls: nextUrls });
});

router.patch("/tenants/:tenantId/content/:contentId/variations/:idx/reel-cover", async (req, res) => { // tenant-audit: reviewed same-tenant/Super Admin guard immediately below
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = reelCoverBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(422).json({ error: "Informe um frame válido em milissegundos." });
    return;
  }

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
  if (gen.type !== "reels") { res.status(422).json({ error: "A seleção de capa por frame está disponível apenas para Reels." }); return; }

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & {
    videoUrl?: string;
    coverUrl?: string;
    coverOriginalUrl?: string;
    coverSource?: "upload" | "frame" | "ai";
    coverCrop?: { zoom: number; x: number; y: number };
    thumbOffsetMs?: number;
  })[];
  const variation = variations[idx];
  if (!variation) { res.status(400).json({ error: "Variação inválida" }); return; }
  if (!variation.videoUrl) { res.status(422).json({ error: "Adicione o vídeo antes de escolher um frame de capa." }); return; }

  variations[idx] = {
    ...variation,
    coverUrl: undefined,
    coverOriginalUrl: undefined,
    coverSource: "frame",
    coverCrop: undefined,
    thumbOffsetMs: body.data.thumbOffsetMs,
  };

  await db
    .update(contentGenerationsTable)
    .set({ result: { ...gen.result, variations } })
    .where(eq(contentGenerationsTable.id, contentId));

  res.json({ success: true, coverSource: "frame", thumbOffsetMs: body.data.thumbOffsetMs });
});

router.patch("/tenants/:tenantId/content/:contentId/variations/:idx/reel-cover/crop", async (req, res) => { // tenant-audit: reviewed same-tenant/Super Admin guard immediately below
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = reelCoverCropBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(422).json({ error: "Enquadramento inválido para a capa." });
    return;
  }

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
  if (gen.type !== "reels") { res.status(422).json({ error: "Enquadramento de capa disponível apenas para Reels." }); return; }

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & {
    coverUrl?: string;
    coverOriginalUrl?: string;
    coverSource?: "upload" | "frame" | "ai";
    coverCrop?: { zoom: number; x: number; y: number };
  })[];
  const variation = variations[idx];
  if (!variation) { res.status(400).json({ error: "Variação inválida" }); return; }
  if (variation.coverSource === "frame") {
    res.status(422).json({ error: "Para crop/zoom, use uma imagem de capa enviada ou gerada por IA." });
    return;
  }

  const sourceUrl = variation.coverOriginalUrl ?? variation.coverUrl;
  if (!sourceUrl) {
    res.status(422).json({ error: "Adicione ou gere uma imagem de capa antes de ajustar o enquadramento." });
    return;
  }

  try {
    const sourceBuffer = await fetchVariationImageBuffer(sourceUrl);
    const rendered = await renderInstagramProfileCover(sourceBuffer, body.data);
    const coverUrl = await saveContentImageBuffer(rendered.buffer, "instagram-reel-cover.jpg");
    variations[idx] = {
      ...variation,
      coverUrl,
      coverOriginalUrl: sourceUrl,
      coverCrop: rendered.crop,
    };

    await db
      .update(contentGenerationsTable)
      .set({ result: { ...gen.result, variations } })
      .where(eq(contentGenerationsTable.id, contentId));

    res.json({ success: true, coverUrl, coverCrop: rendered.crop });
  } catch (error) {
    req.log.error({ error }, "instagram-cover: falha ao aplicar crop");
    const message = error instanceof Error ? error.message : "Não foi possível reenquadrar a capa.";
    res.status(422).json({ error: message });
  }
});

router.post("/tenants/:tenantId/content/:contentId/variations/:idx/reel-cover/generate", async (req, res) => { // tenant-audit: reviewed same-tenant/Super Admin guard immediately below
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = reelCoverGenerateBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(422).json({ error: "Orientação inválida para geração da capa." });
    return;
  }

  const [[gen], [profile]] = await Promise.all([
    db
      .select()
      .from(contentGenerationsTable)
      .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
      .limit(1),
    db
      .select()
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1),
  ]);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
  if (gen.type !== "reels") { res.status(422).json({ error: "Geração de capa disponível apenas para Reels." }); return; }

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & {
    title?: string;
    coverUrl?: string;
    coverOriginalUrl?: string;
    coverSource?: "upload" | "frame" | "ai";
    coverCrop?: { zoom: number; x: number; y: number };
    thumbOffsetMs?: number;
  })[];
  const variation = variations[idx];
  if (!variation) { res.status(400).json({ error: "Variação inválida" }); return; }

  const extra = body.data.instructions ? ` Orientação adicional: ${body.data.instructions}.` : "";
  const observations = [
    "Crie uma capa premium para Reel do Instagram.",
    "Mantenha o assunto principal claramente reconhecível e centralizado.",
    "Reserve margens visuais generosas para evitar cortes no perfil.",
    "Composição fotográfica profissional, alto contraste e leitura imediata em tela pequena.",
    "Sem texto, sem letras, sem marca d'água.",
    extra,
  ].join(" ");

  try {
    const generated = await generateImagesForContent(
      profile ?? {},
      tenantId,
      variation.title ? `${gen.theme} — ${variation.title}` : gen.theme,
      gen.productName ?? undefined,
      "feed",
      1,
      undefined,
      undefined,
      observations,
      "4:5",
    );
    const generatedUrl = generated[0];
    if (!generatedUrl) throw new Error("A IA não retornou uma imagem de capa.");

    const generatedBuffer = await fetchVariationImageBuffer(generatedUrl);
    const normalizedSource = await normalizeInstagramCoverSource(generatedBuffer);
    const sourceUrl = await saveContentImageBuffer(normalizedSource, "instagram-reel-cover-source.jpg");
    const rendered = await renderInstagramProfileCover(normalizedSource, { zoom: 1, x: 0, y: 0 });
    const coverUrl = await saveContentImageBuffer(rendered.buffer, "instagram-reel-cover-ai.jpg");

    variations[idx] = {
      ...variation,
      coverUrl,
      coverOriginalUrl: sourceUrl,
      coverSource: "ai",
      coverCrop: rendered.crop,
      thumbOffsetMs: undefined,
    };

    await db
      .update(contentGenerationsTable)
      .set({ result: { ...gen.result, variations } })
      .where(eq(contentGenerationsTable.id, contentId));

    res.json({
      success: true,
      coverUrl,
      coverOriginalUrl: sourceUrl,
      coverSource: "ai",
      coverCrop: rendered.crop,
    });
  } catch (error) {
    req.log.error({ error }, "instagram-cover: falha ao gerar capa com IA");
    const message = error instanceof Error ? error.message : "Não foi possível gerar a capa.";
    res.status(502).json({ error: message });
  }
});

const applyBrandFrameBodySchema = z.object({
  imageIndex: z.number().int().min(0).optional(),
});

async function fetchVariationImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("/api/storage/objects/") || url.startsWith("/objects/")) {
    const objectPath = url.startsWith("/api/storage/objects/")
      ? `/objects/${url.slice("/api/storage/objects/".length)}`
      : url;
    const objectStorage = new ObjectStorageService();
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const [buffer] = await file.download();
    return buffer;
  }
  const absolute = /^https?:\/\//i.test(url)
    ? url
    : new URL(url, (process.env["FRONTEND_APP_URL"] || process.env["APP_URL"] || "https://app.appvendorai.com").replace(/\/$/, "") + "/").toString();
  const res = await fetch(absolute);
  if (!res.ok) throw new Error(`Falha ao baixar imagem de origem (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function saveContentImageBuffer(buffer: Buffer, filename: string): Promise<string> {
  const objectStorage = new ObjectStorageService();
  const objectPath = await objectStorage.savePrivateBuffer(buffer, "image/jpeg", filename);
  return `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;
}


router.post("/tenants/:tenantId/content/:contentId/variations/:idx/apply-brand-frame", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = applyBrandFrameBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(422).json({ error: body.error.message });
    return;
  }
  const imageIndex = body.data.imageIndex ?? 0;

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);
  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string | null; imageUrls?: string[]; framed?: boolean; imageSource?: "ai" | "upload" })[];
  const variation = variations[idx];
  if (!variation) { res.status(400).json({ error: "Variação inválida" }); return; }

  const currentUrls = variation.imageUrls ?? (variation.imageUrl ? [variation.imageUrl] : []);
  const sourceUrl = currentUrls[imageIndex];
  if (!sourceUrl) { res.status(422).json({ error: "Essa variação não tem imagem nesse índice." }); return; }

  const [tenant] = await db
    .select({ corPrimaria: tenantsTable.corPrimaria, logoUrl: tenantsTable.logoUrl })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  try {
    const sourceBuffer = await fetchVariationImageBuffer(sourceUrl);
    const framed = await applyBrandFrame(sourceBuffer, {
      corPrimaria: tenant?.corPrimaria || "#A78BFA",
      logoUrl: tenant?.logoUrl || null,
    });

    const objectStorage = new ObjectStorageService();
    const objectPath = await objectStorage.savePrivateBuffer(framed, "image/jpeg", "brand-frame.jpg");
    const mediaUrl = `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;

    const newUrls = [...currentUrls];
    newUrls[imageIndex] = mediaUrl;
    variations[idx] = { ...variation, imageUrl: newUrls[0], imageUrls: newUrls.length > 1 ? newUrls : undefined, framed: true, imageSource: "upload" } as typeof variations[number];

    await db
      .update(contentGenerationsTable)
      .set({ result: { variations } })
      .where(eq(contentGenerationsTable.id, contentId));

    res.json({ success: true, mediaUrl, imageUrls: newUrls });
  } catch (err) {
    req.log.error({ err }, "apply-brand-frame: falha ao gerar moldura");
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(502).json({ error: `Não foi possível aplicar a moldura: ${msg}` });
  }
});

router.delete("/tenants/:tenantId/content/:contentId/variations/:idx/image", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }

  const imageIndexRaw = req.query["imageIndex"];
  const imageIndex = imageIndexRaw !== undefined ? parseInt(String(imageIndexRaw), 10) : null;

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string | null; imageUrls?: string[] })[];
  if (!variations[idx]) { res.status(400).json({ error: "Variação inválida" }); return; }

  const v = variations[idx] as typeof variations[number] & { imageUrl?: string | null; imageUrls?: string[] };

  if (imageIndex !== null && !isNaN(imageIndex)) {
    const currentUrls: string[] = v.imageUrls ?? (v.imageUrl ? [v.imageUrl] : []);
    const newUrls = currentUrls.filter((_, i) => i !== imageIndex);
    variations[idx] = { ...v, imageUrl: newUrls[0] ?? null, imageUrls: newUrls.length > 1 ? newUrls : undefined } as typeof variations[number];
  } else {
    variations[idx] = { ...v, imageUrl: null, imageUrls: undefined } as typeof variations[number];
  }

  await db
    .update(contentGenerationsTable)
    .set({ result: { variations } })
    .where(eq(contentGenerationsTable.id, contentId));

  res.json({ success: true });
});

router.post("/tenants/:tenantId/content/:contentId/publish-instagram", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = publishBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "variationIndex inválido" });
    return;
  }

  try {
    const published = await publishContentGenerationToInstagram({
      tenantId,
      contentId,
      variationIndex: body.data.variationIndex,
      captionOverride: body.data.captionOverride,
      instagramConnectionId: body.data.instagramConnectionId,
      log: req.log,
    });
    res.json({ success: true, postId: published.postId, contentType: published.contentType });
  } catch (err) {
    req.log.error({ err }, "instagram-publish: route failed");
    if (err instanceof SocialPublicationError) {
      res.status(err.status).json({ code: "INSTAGRAM_CONTENT_NOT_READY", error: err.message });
      return;
    }
    if (err instanceof InstagramApiError) {
      const metaCode = err.graph?.code;
      const tokenInvalid = metaCode === 190;
      const permissionMissing = metaCode === 10 || metaCode === 200;
      res.status(tokenInvalid ? 401 : permissionMissing ? 403 : 422).json({
        code: tokenInvalid
          ? "INSTAGRAM_TOKEN_INVALID"
          : permissionMissing
            ? "INSTAGRAM_PERMISSION_MISSING"
            : "INSTAGRAM_PUBLISH_REJECTED",
        error: err.message,
        metaCode,
        metaSubcode: err.graph?.error_subcode,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(502).json({ code: "INSTAGRAM_PUBLISH_FAILED", error: `Falha ao publicar no Instagram: ${msg}` });
  }
});

router.get("/tenants/:tenantId/content/instagram-grid", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  try {
    const { accessToken, accountId } = await getPublishingCredentials(tenantId);
    const items = await listRecentMedia(accountId, accessToken, 11);
    res.json({ connected: true, items });
  } catch (err) {
    if (err instanceof SocialPublicationError) {
      // Não conectado/token expirado — não é erro de servidor, o frontend
      // trata como "conecte o Instagram" em vez de mostrar falha.
      res.json({ connected: false, items: [] });
      return;
    }
    req.log.error({ err }, "instagram-grid: falha ao listar mídia publicada");
    res.status(502).json({ connected: false, items: [], error: "Não foi possível carregar a grade do Instagram agora." });
  }
});

/**
 * "Inteligência" de layout — motor de regras (não um agente autônomo):
 * 1. Olha o tipo dos últimos posts publicados de verdade (media_type da
 *    Graph API: IMAGE/CAROUSEL_ALBUM = Feed estático, VIDEO = Reels) e
 *    recomenda alternar quando o mesmo tipo se repete demais em seguida.
 * 2. Vasculha a Biblioteca por rascunhos de Feed enviados manualmente
 *    (imageSource "upload") que ainda não passaram pela moldura de marca
 *    — provável print/screenshot cru que vai destoar da grade.
 */
router.get("/tenants/:tenantId/content/layout-recommendation", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  let recommendedType: "feed" | "reels" | null = null;
  let reason = "";

  try {
    const { accessToken, accountId } = await getPublishingCredentials(tenantId);
    const items = await listRecentMedia(accountId, accessToken, 6);
    const recentTypes = items.map((item) => (item.mediaType === "VIDEO" ? "reels" : "feed"));
    const lastType = recentTypes[0];

    if (lastType) {
      let streak = 0;
      for (const t of recentTypes) {
        if (t === lastType) streak++;
        else break;
      }
      if (streak >= 2) {
        recommendedType = lastType === "feed" ? "reels" : "feed";
        reason = `Os últimos ${streak} posts publicados foram todos ${lastType === "feed" ? "Feed (foto)" : "Reels (vídeo)"} — publicar um ${recommendedType === "feed" ? "Feed" : "Reels"} agora quebra a repetição e dá mais variedade pra grade.`;
      } else {
        reason = "A grade já está alternando entre Feed e Reels — sem repetição pra corrigir agora.";
      }
    } else {
      reason = "Ainda não há posts publicados suficientes pra recomendar um padrão.";
    }
  } catch (err) {
    if (!(err instanceof SocialPublicationError)) {
      req.log.error({ err }, "layout-recommendation: falha ao ler grade real");
    }
    reason = "Instagram não conectado — conecte pra receber recomendação de padrão da grade.";
  }

  const libraryRows = await db
    .select({
      id: contentLibraryTable.id,
      type: contentLibraryTable.type,
      theme: contentLibraryTable.theme,
      variation: contentLibraryTable.variation,
    })
    .from(contentLibraryTable)
    .where(eq(contentLibraryTable.tenantId, tenantId))
    .orderBy(desc(contentLibraryTable.savedAt));

  const flaggedDrafts = libraryRows
    .filter((row) => {
      if (row.type !== "feed") return false;
      const v = row.variation as { imageSource?: string; framed?: boolean; imageUrl?: string };
      return v.imageSource === "upload" && !v.framed && !!v.imageUrl;
    })
    .map((row) => ({ id: row.id, theme: row.theme }));

  res.json({ recommendedType, reason, flaggedDrafts });
});

const highlightCoverBodySchema = z.object({
  label: z.string().min(1).max(30),
});

router.post("/tenants/:tenantId/content/highlight-cover", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const body = highlightCoverBodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(422).json({ error: body.error.message });
    return;
  }

  const [tenant] = await db
    .select({ corPrimaria: tenantsTable.corPrimaria, logoUrl: tenantsTable.logoUrl })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  try {
    const cover = await generateHighlightCover({
      corPrimaria: tenant?.corPrimaria || "#A78BFA",
      logoUrl: tenant?.logoUrl || null,
      label: body.data.label,
    });

    const objectStorage = new ObjectStorageService();
    const objectPath = await objectStorage.savePrivateBuffer(cover, "image/jpeg", "highlight-cover.jpg");
    const mediaUrl = `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;

    res.json({ success: true, mediaUrl });
  } catch (err) {
    req.log.error({ err }, "highlight-cover: falha ao gerar capa");
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(502).json({ error: `Não foi possível gerar a capa: ${msg}` });
  }
});

router.delete("/tenants/:tenantId/content/:id", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const id = String(req.params["id"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  await db
    .delete(contentGenerationsTable)
    .where(
      and(
        eq(contentGenerationsTable.id, id),
        eq(contentGenerationsTable.tenantId, tenantId)
      )
    );

  res.json({ success: true });
});

// POST /tenants/:tenantId/content/describe-image — descreve imagem com GPT-4o Vision
router.post("/tenants/:tenantId/content/describe-image", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const bodySchema = z.object({ imageUrl: z.string().min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const description = await describeImage(parsed.data.imageUrl, tenantId);
    res.json({ description });
  } catch (err) {
    req.log.error({ err }, "describe-image failed");
    res.status(500).json({ error: "Falha ao descrever imagem" });
  }
});

// POST /tenants/:tenantId/content/:contentId/variations/:idx/regenerate-image — regenera com estilo
router.post("/tenants/:tenantId/content/:contentId/variations/:idx/regenerate-image", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const contentId = String(req.params["contentId"]);
  const idx = parseInt(String(req.params["idx"]), 10);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const bodySchema = z.object({
    style: z.string().optional(),
    observations: z.string().optional(),
    imageCount: z.coerce.number().int().min(1).max(10).default(1),
    referenceImageUrl: z.string().optional(),
  });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) {
    res.status(422).json({ error: body.error.message });
    return;
  }

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
  if (gen.type === "reels") { res.status(400).json({ error: "Reels não suportam geração de imagem" }); return; }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const format = gen.type === "stories" ? "stories" : "feed";
  const observations = body.data.observations || body.data.style;
  try {
    let imageUrls: string[];
    if (body.data.referenceImageUrl) {
      const brand = (profile as any)?.nomeFantasia || "a empresa";
      const obsNote = observations ? ` Client request: ${observations}.` : "";
      const formatLabel = format === "stories" ? "Stories (vertical 9:16)" : "Feed (square 1:1)";
      const editPrompt = `Improve this product/marketing image for Instagram ${formatLabel} for "${brand}". Subject: ${gen.theme}${gen.productName ? ` — ${gen.productName}` : ""}.${obsNote} Keep the same product. Improve: lighting, sharpness, color, composition. Professional marketing quality. No text. No watermarks.`;
      imageUrls = await generateImagesWithReference(tenantId, body.data.referenceImageUrl, editPrompt, body.data.imageCount);
    } else {
      imageUrls = await generateImagesForContent(
        profile ?? {},
        tenantId,
        gen.theme,
        gen.productName ?? undefined,
        format,
        body.data.imageCount,
        undefined,
        undefined,
        observations,
      );
    }

    const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string; imageUrls?: string[]; imageSource?: "ai" | "upload" })[];
    if (!variations[idx]) { res.status(400).json({ error: "Variação inválida" }); return; }

    variations[idx] = {
      ...variations[idx],
      imageUrl: imageUrls[0],
      imageUrls: imageUrls.length > 1 ? imageUrls : undefined,
      imageSource: "ai",
    } as typeof variations[number];

    await db
      .update(contentGenerationsTable)
      .set({ result: { variations } })
      .where(eq(contentGenerationsTable.id, contentId));

    res.json({ success: true, imageUrls });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao regenerar imagem";
    res.status(502).json({ error: msg });
  }
});

// ── Melhorar texto ────────────────────────────────────────────────────────────

const improveBodySchema = z.object({
  type: z.enum(["feed", "stories", "reels", "linkedin", "youtube", "tiktok"]),
  variation: z.record(z.string(), z.unknown()),
  theme: z.string().optional().nullable(),
});

router.post("/tenants/:tenantId/content/improve", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  const parsed = improveBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message }); return; }
  try {
    const { type, variation, theme } = parsed.data;
    if (type === "tiktok") {
      res.status(422).json({ error: "Melhoria de texto para TikTok ainda não é suportada por este motor." });
      return;
    }
    const { variation: improved, tokensUsed } = await improveVariationText(
      tenantId, type, variation as Parameters<typeof improveVariationText>[2], theme ?? undefined,
    );
    res.json({ variation: improved, tokensUsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao melhorar texto";
    res.status(502).json({ error: msg });
  }
});

// ── Biblioteca de Conteúdo ─────────────────────────────────────────────────────

const libraryBodySchema = z.object({
  type: z.enum(["feed", "stories", "reels", "linkedin", "youtube", "tiktok"]),
  variation: z.any(),
  theme: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
});

router.post("/tenants/:tenantId/content/library", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  const parsed = libraryBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message }); return; }
  const { type, variation, theme, title } = parsed.data;
  const [row] = await db
    .insert(contentLibraryTable)
    .values({ id: crypto.randomUUID(), tenantId, type, variation, theme: theme ?? null, title: title ?? null })
    .returning();
  res.json(row);
});

router.get("/tenants/:tenantId/content/library", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  const [items, generations] = await Promise.all([
    db
      .select()
      .from(contentLibraryTable)
      .where(eq(contentLibraryTable.tenantId, tenantId))
      .orderBy(desc(contentLibraryTable.savedAt)),
    db
      .select({
        id: contentGenerationsTable.id,
        type: contentGenerationsTable.type,
        theme: contentGenerationsTable.theme,
        result: contentGenerationsTable.result,
      })
      .from(contentGenerationsTable)
      .where(eq(contentGenerationsTable.tenantId, tenantId))
      .orderBy(desc(contentGenerationsTable.createdAt))
      .limit(100),
  ]);

  const enrichedItems = items.map((item) => {
    const serializedVariation = JSON.stringify(item.variation);
    let fallback: { id: string; variationIndex: number } | null = null;

    for (const generation of generations) {
      if (generation.type !== item.type) continue;
      const variations = Array.isArray(generation.result?.variations) ? generation.result.variations : [];
      const exactIndex = variations.findIndex((variation) => JSON.stringify(variation) === serializedVariation);
      if (exactIndex >= 0) {
        return { ...item, contentGenerationId: generation.id, variationIndex: exactIndex };
      }
      if (!fallback && generation.theme === item.theme && variations.length > 0) {
        fallback = { id: generation.id, variationIndex: 0 };
      }
    }

    return {
      ...item,
      contentGenerationId: fallback?.id ?? null,
      variationIndex: fallback?.variationIndex ?? null,
    };
  });

  res.json({ items: enrichedItems });
});

router.delete("/tenants/:tenantId/content/library/:id", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const id = String(req.params["id"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  await db
    .delete(contentLibraryTable)
    .where(and(eq(contentLibraryTable.id, id), eq(contentLibraryTable.tenantId, tenantId)));
  res.json({ success: true });
});

// ── Content Studio Uploads (Passo 3) ─────────────────────────────────────────

const uploadRegisterSchema = z.object({
  sessionId: z.string().min(1),
  fileUrl: z.string().min(1),
  purpose: z.enum(["style_reference", "post_material"]).default("style_reference"),
});

router.post("/tenants/:tenantId/content/uploads", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  const parsed = uploadRegisterSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message }); return; }
  const { sessionId, fileUrl, purpose } = parsed.data;
  const [row] = await db
    .insert(contentStudioUploadsTable)
    .values({ id: crypto.randomUUID(), tenantId, sessionId, fileUrl, purpose })
    .returning();
  res.json(row);
});

router.get("/tenants/:tenantId/content/uploads", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  const sessionId = String(req.query["sessionId"] ?? "");
  if (!sessionId) { res.status(422).json({ error: "sessionId obrigatório" }); return; }
  const rows = await db
    .select()
    .from(contentStudioUploadsTable)
    .where(and(eq(contentStudioUploadsTable.tenantId, tenantId), eq(contentStudioUploadsTable.sessionId, sessionId)))
    .orderBy(contentStudioUploadsTable.createdAt);
  res.json(rows);
});

router.patch("/tenants/:tenantId/content/uploads/:id", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const id = String(req.params["id"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  const parsed = z.object({ purpose: z.enum(["style_reference", "post_material"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message }); return; }
  const [row] = await db
    .update(contentStudioUploadsTable)
    .set({ purpose: parsed.data.purpose })
    .where(and(eq(contentStudioUploadsTable.id, id), eq(contentStudioUploadsTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Upload não encontrado" }); return; }
  res.json(row);
});

router.delete("/tenants/:tenantId/content/uploads/:id", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const id = String(req.params["id"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" }); return;
  }
  await db
    .delete(contentStudioUploadsTable)
    .where(and(eq(contentStudioUploadsTable.id, id), eq(contentStudioUploadsTable.tenantId, tenantId)));
  res.json({ success: true });
});

export default router;
