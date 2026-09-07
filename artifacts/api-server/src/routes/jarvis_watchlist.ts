import { Router, type IRouter } from "express";
import { loadJarvisWatchlistIntelligence } from "../services/jarvis-watchlist-intelligence.js";

const router: IRouter = Router();

router.get("/jarvis/watchlist", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const intelligence = await loadJarvisWatchlistIntelligence(tenantId);
  return res.json({
    generatedAt: intelligence.generatedAt,
    windowDays: intelligence.windowDays,
    summary: intelligence.summary,
    items: intelligence.watchlist,
  });
});

router.get("/jarvis/blind-spots", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const intelligence = await loadJarvisWatchlistIntelligence(tenantId);
  return res.json({
    generatedAt: intelligence.generatedAt,
    windowDays: intelligence.windowDays,
    summary: intelligence.summary,
    blindSpots: intelligence.blindSpots,
  });
});

export default router;
