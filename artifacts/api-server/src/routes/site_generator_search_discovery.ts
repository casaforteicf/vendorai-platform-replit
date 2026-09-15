import { Router, type IRouter } from "express";
import { resubmitTenantSitemapAfterSitePublish } from "../services/site-generator-search-discovery.js";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.use((req, res, next) => {
  const match = req.method === "POST"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/publish$/)
    : null;
  if (!match) return next();

  const tenantId = match[1]!;
  if (!canAccess(req, tenantId)) return next();

  const originalJson = res.json.bind(res);
  let handled = false;
  (res as any).json = (body: any) => {
    if (!handled && res.statusCode >= 200 && res.statusCode < 300) {
      handled = true;
      void resubmitTenantSitemapAfterSitePublish(tenantId).catch((error) => {
        req.log?.warn?.({ error, tenantId }, "Site Generator: sitemap resubmission failed after successful publish");
      });
    }
    return originalJson(body);
  };

  next();
});

export default router;
