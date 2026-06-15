import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  contentGenerationsTable,
  agentConfigsTable,
  businessProfilesTable,
  produtosCatalogoTable,
  subscriptionsTable,
} from "@workspace/db";
import {
  generateFeedContent,
  generateStoriesContent,
  generateReelsScript,
} from "../lib/content-generation.js";
import { publishFeedPost, publishStoriesPost } from "../lib/instagram-publish.js";
import type { FeedVariation, StoriesVariation } from "@workspace/db";

const router: IRouter = Router();

const PLAN_LIMITS: Record<string, number> = {
  starter: 20,
  growth: 50,
  enterprise: 200,
};

const generateBodySchema = z.object({
  type: z.enum(["feed", "stories", "reels"]),
  theme: z.string().min(3, "Descreva o tema (mín. 3 caracteres)"),
  productId: z.string().optional().nullable(),
  variations: z.coerce.number().int().min(1).max(3).default(2),
  imageUrl: z.string().optional().nullable(),
});

async function getMonthlyUsage(
  tenantId: string
): Promise<{ used: number; limit: number; configId: string | null }> {
  const [config] = await db
    .select()
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

  const { type, theme, productId, variations, imageUrl } = parsed.data;

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
  if (productId) {
    const [product] = await db
      .select({ nome: produtosCatalogoTable.nome })
      .from(produtosCatalogoTable)
      .where(
        and(
          eq(produtosCatalogoTable.id, String(productId)),
          eq(produtosCatalogoTable.tenantId, tenantId)
        )
      );
    productName = product?.nome;
  }

  let result: { result: { variations: unknown[] }; tokensUsed: number };
  try {
    if (type === "feed") {
      result = await generateFeedContent(profile ?? {}, theme, productName, variations);
    } else if (type === "stories") {
      result = await generateStoriesContent(profile ?? {}, theme, productName, variations);
    } else {
      result = await generateReelsScript(profile ?? {}, theme, productName, variations);
    }
  } catch (err) {
    req.log.error({ err }, "content generation failed");
    res.status(500).json({ error: "Falha na geração de conteúdo. Tente novamente." });
    return;
  }

  // If caller uploaded an image, apply it to every variation
  const finalResult = imageUrl
    ? {
        variations: (result.result.variations as Record<string, unknown>[]).map((v) => ({
          ...v,
          imageUrl,
        })),
      }
    : result.result;

  const [saved] = await db
    .insert(contentGenerationsTable)
    .values({
      tenantId,
      type,
      productId: productId ?? null,
      productName: productName ?? null,
      theme,
      result: finalResult as { variations: [] },
      tokensUsed: result.tokensUsed,
    })
    .returning();

  if (configId) {
    await db
      .update(agentConfigsTable)
      .set({ contentGenerationsThisMonth: used + 1 })
      .where(eq(agentConfigsTable.id, configId));
  }

  res.json(saved);
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

const publishBodySchema = z.object({ variationIndex: z.number().int().min(0) });
const patchMediaBodySchema = z.object({
  objectPath: z.string().min(1),
  field: z.enum(["imageUrl", "videoUrl"]).default("imageUrl"),
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

  const variations = [...gen.result.variations] as (typeof gen.result.variations[number] & { imageUrl?: string; videoUrl?: string })[];
  if (!variations[idx]) { res.status(400).json({ error: "Variação inválida" }); return; }

  const mediaUrl = `/api/storage${body.data.objectPath}`;
  variations[idx] = { ...variations[idx], [body.data.field]: mediaUrl };

  await db
    .update(contentGenerationsTable)
    .set({ result: { variations } })
    .where(eq(contentGenerationsTable.id, contentId));

  res.json({ success: true, mediaUrl, field: body.data.field });
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

  const [gen] = await db
    .select()
    .from(contentGenerationsTable)
    .where(and(eq(contentGenerationsTable.id, contentId), eq(contentGenerationsTable.tenantId, tenantId)))
    .limit(1);

  if (!gen) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
  if (gen.type === "reels") {
    res.status(400).json({ error: "Publicação de Reels ainda não é suportada via API." });
    return;
  }

  const variation = gen.result.variations[body.data.variationIndex];
  if (!variation) { res.status(400).json({ error: "Variação inválida" }); return; }

  const imageUrl = (variation as { imageUrl?: string }).imageUrl;
  if (!imageUrl) {
    res.status(400).json({
      error: "Imagem não disponível. Imagens do DALL-E expiram em ~1h após a geração — regere o conteúdo para publicar.",
    });
    return;
  }

  const [config] = await db
    .select({
      instagramPageAccessToken: agentConfigsTable.instagramPageAccessToken,
      instagramPageId: agentConfigsTable.instagramPageId,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  if (!config?.instagramPageAccessToken || !config?.instagramPageId) {
    res.status(400).json({ error: "Instagram não conectado. Configure o Page Access Token nas Configurações." });
    return;
  }

  try {
    let postId: string;
    if (gen.type === "feed") {
      const v = variation as FeedVariation;
      const caption = `${v.caption}\n\n${v.hashtags.join(" ")}`;
      postId = await publishFeedPost(config.instagramPageId, config.instagramPageAccessToken, caption, imageUrl, req.log);
    } else {
      postId = await publishStoriesPost(config.instagramPageId, config.instagramPageAccessToken, imageUrl, req.log);
    }
    res.json({ success: true, postId });
  } catch (err) {
    req.log.error({ err }, "instagram-publish: route failed");
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(502).json({ error: `Falha ao publicar no Instagram: ${msg}` });
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

export default router;
