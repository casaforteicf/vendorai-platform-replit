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

  const { type, theme, productId, variations } = parsed.data;

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

  const [saved] = await db
    .insert(contentGenerationsTable)
    .values({
      tenantId,
      type,
      productId: productId ?? null,
      productName: productName ?? null,
      theme,
      result: result.result as { variations: [] },
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
