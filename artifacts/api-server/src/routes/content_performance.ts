import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { adCampaignsTable, agentConfigsTable, db } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import {
  listPublishedPosts,
  refreshPendingMetrics,
  getPerformanceInsights,
  refreshPerformanceInsights,
  PerformanceError,
} from "../services/content-performance.js";
import { getMetaGrowthOverview } from "../services/meta-growth.js";
import { ingestMetaEngagement } from "../services/meta-engagement-crm.js";
import { getMetaRemarketingOverview } from "../services/meta-remarketing.js";
import { listMetaCustomAudiences, syncMetaCustomAudience } from "../services/meta-custom-audiences.js";
import { publishMetaCampaignWithCustomAudience } from "../services/meta-custom-audience-campaign.js";
import { getMetaAudiencePerformance } from "../services/meta-audience-performance.js";

const router: IRouter = Router();

function assertTenantAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const metaEngagementBody = z.object({
  externalEventId: z.string().min(1),
  eventType: z.enum(["dm", "comment", "mention"]),
  instagramScopedId: z.string().min(1),
  username: z.string().optional().nullable(),
  text: z.string().optional().nullable(),
  mediaId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const metaCustomAudienceKey = z.enum([
  "meta_engaged_30d",
  "meta_hot_intent_30d",
  "instagram_dm_30d",
  "instagram_comments_30d",
]);

const applyCustomAudienceBody = z.object({
  campaignId: z.string().min(1),
});

async function loadSyncedAudience(tenantId: string, key: string) {
  const audienceResult = await db.execute(sql`
    SELECT audience_key, label, external_audience_id, status
      FROM meta_custom_audiences
     WHERE tenant_id = ${tenantId}
       AND audience_key = ${key}
     LIMIT 1
  `);
  return audienceResult.rows?.[0] as {
    audience_key?: string;
    label?: string;
    external_audience_id?: string | null;
    status?: string;
  } | undefined;
}

router.post("/tenants/:tenantId/meta-growth/engagements/ingest", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const secret = req.header("x-webhook-secret");
  if (!secret) return res.status(401).json({ error: "Missing X-Webhook-Secret header" });

  const [config] = await db
    .select({ webhookSecret: agentConfigsTable.webhookSecret })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);
  if (!config?.webhookSecret || config.webhookSecret !== secret) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const parsed = metaEngagementBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  try {
    return res.json(await ingestMetaEngagement(tenantId, parsed.data));
  } catch (err) {
    logger.error({ err, tenantId, externalEventId: parsed.data.externalEventId }, "meta-growth: erro ao ingerir engajamento");
    return res.status(500).json({ error: "Não foi possível registrar o engajamento da Meta." });
  }
});

router.get("/tenants/:tenantId/meta-growth/remarketing", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await getMetaRemarketingOverview(tenantId));
  } catch (err) {
    logger.error({ err, tenantId }, "meta-growth: erro ao carregar audiências de remarketing");
    return res.status(500).json({ error: "Não foi possível carregar as audiências de remarketing." });
  }
});

router.get("/tenants/:tenantId/meta-growth/custom-audiences", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await listMetaCustomAudiences(tenantId));
  } catch (err) {
    logger.error({ err, tenantId }, "meta-growth: erro ao listar Custom Audiences");
    return res.status(500).json({ error: "Não foi possível carregar as Custom Audiences da Meta." });
  }
});

router.post("/tenants/:tenantId/meta-growth/custom-audiences/:key/sync", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = metaCustomAudienceKey.safeParse(String(req.params.key));
  if (!parsed.success) return res.status(422).json({ error: "Audiência Meta não suportada." });

  try {
    return res.json(await syncMetaCustomAudience(tenantId, parsed.data));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível sincronizar a audiência na Meta.";
    logger.warn({ err, tenantId, audienceKey: parsed.data }, "meta-growth: falha ao sincronizar Custom Audience");
    return res.status(422).json({ error: message });
  }
});

router.post("/tenants/:tenantId/meta-growth/custom-audiences/:key/apply-to-campaign", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const key = metaCustomAudienceKey.safeParse(String(req.params.key));
  const body = applyCustomAudienceBody.safeParse(req.body);
  if (!key.success || !body.success) return res.status(422).json({ error: "Audiência ou campanha inválida." });

  const audience = await loadSyncedAudience(tenantId, key.data);
  if (!audience?.external_audience_id || audience.status !== "synced") {
    return res.status(409).json({ error: "Sincronize esta Custom Audience com a Meta antes de usá-la em uma campanha." });
  }

  const [campaign] = await db
    .select({
      id: adCampaignsTable.id,
      plataforma: adCampaignsTable.plataforma,
      externalCampaignId: adCampaignsTable.externalCampaignId,
      segmentacao: adCampaignsTable.segmentacao,
    })
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, body.data.campaignId), eq(adCampaignsTable.tenantId, tenantId)))
    .limit(1);

  if (!campaign) return res.status(404).json({ error: "Campanha não encontrada." });
  if (campaign.plataforma !== "meta") return res.status(422).json({ error: "Custom Audience da Meta só pode ser aplicada a campanha Meta." });
  if (campaign.externalCampaignId) return res.status(409).json({ error: "A campanha já foi publicada. Crie ou use um rascunho Meta para trocar a audiência." });

  const current = (campaign.segmentacao ?? {}) as Record<string, unknown>;
  const rawExisting = Array.isArray(current["metaCustomAudiences"])
    ? current["metaCustomAudiences"] as Array<Record<string, unknown>>
    : [];
  const nextAudience = {
    key: key.data,
    label: audience.label ?? key.data,
    externalAudienceId: audience.external_audience_id,
    appliedAt: new Date().toISOString(),
  };
  const metaCustomAudiences = [
    ...rawExisting.filter((item) => item["key"] !== key.data),
    nextAudience,
  ];

  await db
    .update(adCampaignsTable)
    .set({ segmentacao: { ...current, metaCustomAudiences } as any, updatedAt: new Date() })
    .where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.tenantId, tenantId)));

  return res.json({
    ok: true,
    campaignId: campaign.id,
    audience: nextAudience,
    campaignActivated: false,
    spendActivated: false,
  });
});

router.post("/tenants/:tenantId/meta-growth/custom-audiences/:key/publish-campaign", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const key = metaCustomAudienceKey.safeParse(String(req.params.key));
  const body = applyCustomAudienceBody.safeParse(req.body);
  if (!key.success || !body.success) return res.status(422).json({ error: "Audiência ou campanha inválida." });

  const audience = await loadSyncedAudience(tenantId, key.data);
  if (!audience?.external_audience_id || audience.status !== "synced") {
    return res.status(409).json({ error: "Sincronize esta Custom Audience com a Meta antes de publicar o remarketing." });
  }

  const [campaign] = await db
    .select({ id: adCampaignsTable.id, plataforma: adCampaignsTable.plataforma, externalCampaignId: adCampaignsTable.externalCampaignId })
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, body.data.campaignId), eq(adCampaignsTable.tenantId, tenantId)))
    .limit(1);
  if (!campaign) return res.status(404).json({ error: "Campanha não encontrada." });
  if (campaign.plataforma !== "meta") return res.status(422).json({ error: "Este fluxo só publica campanhas Meta." });
  if (campaign.externalCampaignId) return res.status(409).json({ error: "A campanha já foi publicada." });

  try {
    const result = await publishMetaCampaignWithCustomAudience({
      tenantId,
      campaignId: campaign.id,
      audienceKey: key.data,
      audienceLabel: audience.label ?? key.data,
      externalAudienceId: audience.external_audience_id,
    });
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível publicar a campanha de remarketing.";
    logger.warn({ err, tenantId, campaignId: campaign.id, audienceKey: key.data }, "meta-growth: falha ao publicar campanha com Custom Audience");
    return res.status(422).json({ error: message });
  }
});

router.get("/tenants/:tenantId/meta-growth/audience-performance", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await getMetaAudiencePerformance(tenantId));
  } catch (err) {
    logger.error({ err, tenantId }, "meta-growth: erro ao calcular performance por audiência");
    return res.status(500).json({ error: "Não foi possível calcular o resultado por audiência Meta." });
  }
});

router.get("/tenants/:tenantId/meta-growth/overview", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await getMetaGrowthOverview(tenantId));
  } catch (err) {
    logger.error({ err, tenantId }, "meta-growth: erro ao carregar overview");
    return res.status(500).json({ error: "Não foi possível carregar os indicadores da Meta." });
  }
});

router.post("/tenants/:tenantId/meta-growth/atualizar", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json(await getMetaGrowthOverview(tenantId));
  } catch (err) {
    logger.error({ err, tenantId }, "meta-growth: erro ao atualizar indicadores");
    return res.status(500).json({ error: "Não foi possível atualizar os indicadores da Meta." });
  }
});

router.get("/tenants/:tenantId/content-performance/posts", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json(await listPublishedPosts(tenantId));
});

router.post("/tenants/:tenantId/content-performance/posts/atualizar-metricas", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await refreshPendingMetrics(tenantId);
    return res.json(result);
  } catch (err) {
    if (err instanceof PerformanceError) return res.status(422).json({ error: err.message });
    logger.error({ err, tenantId }, "content-performance: erro ao atualizar métricas");
    return res.status(500).json({ error: "Erro inesperado." });
  }
});

router.get("/tenants/:tenantId/content-performance/insights", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json(await getPerformanceInsights(tenantId));
});

router.post("/tenants/:tenantId/content-performance/insights/atualizar", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!assertTenantAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const updated = await refreshPerformanceInsights(tenantId);
    return res.json(updated);
  } catch (err) {
    if (err instanceof PerformanceError) return res.status(422).json({ error: err.message });
    logger.error({ err, tenantId }, "content-performance: erro ao atualizar aprendizados");
    return res.status(500).json({ error: "Erro inesperado." });
  }
});

export default router;