import { Router, type IRouter, type Request } from "express";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState } from "../lib/oauth-state.js";
import {
  buildInstagramOAuthUrl,
  getInstagramConnectionByTenantId,
} from "../services/instagram-oauth.js";
import {
  buildGoogleAdsOAuthUrl,
  getGoogleAdsConnectionByTenantId,
} from "../services/google-ads-oauth.js";

const router: IRouter = Router();

function canAccessTenant(req: Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.get("/integrations/instagram/auth", authenticate, async (req, res) => {
  const userId = req.user?.sub;
  const tenantId = req.user?.tenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const state = createOAuthState(tenantId, userId, "instagram");
  return res.json({ url: buildInstagramOAuthUrl(tenantId, state, req.hostname) });
});

router.get("/integrations/google-ads/auth", authenticate, async (req, res) => {
  const userId = req.user?.sub;
  const tenantId = req.user?.tenantId;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const state = createOAuthState(tenantId, userId, "google-ads");
  return res.json({ url: buildGoogleAdsOAuthUrl(tenantId, state) });
});

router.get("/integrations/status/:tenantId", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const [instagram, googleAds] = await Promise.all([
    getInstagramConnectionByTenantId(tenantId),
    getGoogleAdsConnectionByTenantId(tenantId),
  ]);

  const instagramActive = Boolean(instagram && !instagram.disconnectedAt);
  const googleAdsActive = Boolean(
    googleAds &&
    !googleAds.disconnectedAt &&
    googleAds.status !== "disconnected",
  );

  return res.json([
    {
      platform: "instagram",
      status: instagramActive ? "active" : "revoked",
      connectedAt: instagram?.connectedAt?.toISOString() ?? null,
    },
    {
      platform: "google_ads",
      status: googleAdsActive
        ? googleAds?.status === "pending_account_selection"
          ? "pending"
          : "active"
        : "revoked",
      connectedAt: googleAds?.connectedAt?.toISOString() ?? null,
    },
  ]);
});

export default router;
