import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { getFilteredLaunchCommandCenter } from "../services/launchCommandCenter.js";
import { getLaunchRevenueScout } from "../services/launchRevenueScout.js";

const router: IRouter = Router();

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "all"]).optional(),
  platform: z.string().trim().min(1).optional(),
  campaignId: z.string().trim().min(1).optional(),
  landingPageId: z.string().trim().min(1).optional(),
  vertical: z.string().trim().min(1).optional(),
  intentTier: z.enum(["baixo", "medio", "alto", "muito_alto"]).optional(),
});

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/marketing/launch-command-center", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros inválidos", details: parsed.error.issues });
    return;
  }

  const result = await getFilteredLaunchCommandCenter(tenantId, parsed.data);
  res.json(result);
});

router.get("/tenants/:tenantId/marketing/launch-command-center/revenue-scout", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Filtros inválidos", details: parsed.error.issues });
    return;
  }

  const result = await getLaunchRevenueScout(tenantId, parsed.data);
  res.json(result);
});

export default router;