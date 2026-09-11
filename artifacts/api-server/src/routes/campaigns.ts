import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { campaignsTable, db, segmentoFiltroSchema } from "@workspace/db";
import { resolveCampaignAudiencePreview } from "../services/campaignAudience.js";
import legacyRouter from "./campaignsLegacy.js";

const router: IRouter = Router();

/**
 * Prévia comercial fica antes do router legado para que filtros por leadIds,
 * Behavior Intent, estágio comercial, audiência e consentimento sejam aplicados
 * do mesmo jeito que no dispatcher. Demais rotas continuam 100% legadas.
 */
router.get("/tenants/:tenantId/campaigns/:id/preview-audience", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [campaign] = await db
    .select({ id: campaignsTable.id, segmentoFiltro: campaignsTable.segmentoFiltro })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.tenantId, tenantId)))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const parsed = segmentoFiltroSchema.safeParse(campaign.segmentoFiltro);
  const filtro = parsed.success ? parsed.data : undefined;
  const preview = await resolveCampaignAudiencePreview(tenantId, filtro, 500);
  res.json({
    count: preview.count,
    filtersApplied: filtro ?? null,
    sample: preview.sample,
  });
});

router.use(legacyRouter);

export default router;
