import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { agentConfigsTable, db } from "@workspace/db";
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
