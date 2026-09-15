import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, generatedSitesTable } from "@workspace/db";
import { inspectRenderedSiteVisualQuality } from "../services/siteRenderedVisualQa.js";

function canAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

export const siteGeneratorRenderedVisualQaResponseRouter: IRouter = Router();
export const siteGeneratorRenderedVisualQaPublishRouter: IRouter = Router();

siteGeneratorRenderedVisualQaResponseRouter.use(async (req, res, next) => {
  const match = req.method === "GET"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/qa$/)
    : null;
  if (!match) return next();

  const tenantId = match[1]!;
  const siteId = match[2]!;
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({ html: generatedSitesTable.html })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);

  if (!site?.html) return next();

  const renderedVisualQa = await inspectRenderedSiteVisualQuality(site.html);
  const originalJson = res.json.bind(res);
  (res as any).json = (body: any) => originalJson({ ...body, renderedVisualQa });
  next();
});

siteGeneratorRenderedVisualQaPublishRouter.use(async (req, res, next) => {
  const match = req.method === "POST"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/publish$/)
    : null;
  if (!match) return next();

  const tenantId = match[1]!;
  const siteId = match[2]!;
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({ html: generatedSitesTable.html, config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);

  if (!site?.html) return next();

  const renderedVisualQa = await inspectRenderedSiteVisualQuality(site.html);
  if (!renderedVisualQa.rendered) {
    res.status(503).json({
      error: "SITE_VISUAL_QA_UNAVAILABLE",
      message: "Não foi possível concluir a validação visual renderizada. A publicação permaneceu bloqueada por segurança.",
      renderedVisualQa,
    });
    return;
  }

  if (!renderedVisualQa.approved) {
    res.status(422).json({
      error: "SITE_VISUAL_QA_BLOCKED",
      message: "A página renderizada ainda apresenta problemas visuais em um ou mais tamanhos de tela.",
      renderedVisualQa,
      thresholds: { renderedVisual: 90, mobile: 90 },
    });
    return;
  }

  const currentConfig = (site.config ?? {}) as Record<string, any>;
  const nextConfig = {
    ...currentConfig,
    renderedVisualQa: {
      approved: true,
      score: renderedVisualQa.score,
      checkedAt: new Date().toISOString(),
      viewports: renderedVisualQa.viewports.map((entry) => ({
        key: entry.viewport.key,
        width: entry.viewport.width,
        height: entry.viewport.height,
        score: entry.score,
        screenshotBytes: entry.screenshotBytes,
      })),
    },
  };

  await db
    .update(generatedSitesTable)
    .set({ config: nextConfig as any, analisadoEm: new Date(), updatedAt: new Date() })
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)));

  (res.locals as any).renderedVisualQa = renderedVisualQa;
  next();
});

export default siteGeneratorRenderedVisualQaPublishRouter;
