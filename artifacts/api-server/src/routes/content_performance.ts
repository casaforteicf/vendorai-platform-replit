import { Router, type IRouter } from "express";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import {
  listPublishedPosts,
  refreshPendingMetrics,
  getPerformanceInsights,
  refreshPerformanceInsights,
  PerformanceError,
} from "../services/content-performance.js";

const router: IRouter = Router();

function assertTenantAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

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
