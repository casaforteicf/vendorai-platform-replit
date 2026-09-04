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
import { applyBrandFrame } from "../services/brandFrame.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();

const PLAN_LIMITS: Record<string, number> = {
  starter: 20,
  growth: 50,
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

  const [ownPerfBlock, refCreatorsBlock] = await Promise.all([
    buildOwnPerformancePromptBlock(tenantId),
    buildReferencePatternsPromptBlock(tenantId),
  ]);
  const strategy = {
    customerPain: customerPain ?? undefined,
    postObjective: postObjective ?? undefined,
    voiceTone: voiceTone ?? undefined,
    desiredCta: desiredCta ?? undefined,
    referencePatterns: ownPerfBlock + refCreatorsBlock,
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

  res.json(saved ?? { id: null, tenantId, type, theme, result: finalResult, tokensUsed: result.tokensUsed });
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
    const [ownPerfBlock, refCreatorsBlock] = await Promise.all([
      buildOwnPerformancePromptBlock(tenantId),
      buildReferencePatternsPromptBlock(tenantId),
    ]);
    const { strategy } = await generateContentStrategy(
      profile ?? {},
      tenantId,
      command,
      contentType,
      variations,
      ownPerfBlock + refCreatorsBlock,
    );
    res.json(strategy);
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
});
const patchMediaBodySchema = z.object({
  objectPath: z.string().min(1),
  field: z.enum(["imageUrl", "videoUrl"]).default("imageUrl"),
  append: z.boolean().optional().default(false),
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

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string; imageUrls?: string[] })[];
  if (!variations[idx]) { res.status(400).json({ error: "Variação inválida" }); return; }
  variations[idx] = { ...variations[idx], imageUrl, imageUrls: undefined };

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
      };
    } else {
      responseImageUrls = [mediaUrl];
      variations[idx] = { ...variation, imageUrl: mediaUrl, imageUrls: undefined };
    }
  } else {
    variations[idx] = { ...variation, videoUrl: mediaUrl };
  }

  await db
    .update(contentGenerationsTable)
    .set({ result: { variations } })
    .where(eq(contentGenerationsTable.id, contentId));

  res.json({ success: true, mediaUrl, field: body.data.field, imageUrls: responseImageUrls });
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

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string | null; imageUrls?: string[] })[];
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
    variations[idx] = { ...variation, imageUrl: newUrls[0], imageUrls: newUrls.length > 1 ? newUrls : undefined };

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

    const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string; imageUrls?: string[] })[];
    if (!variations[idx]) { res.status(400).json({ error: "Variação inválida" }); return; }

    variations[idx] = {
      ...variations[idx],
      imageUrl: imageUrls[0],
      imageUrls: imageUrls.length > 1 ? imageUrls : undefined,
    };

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
