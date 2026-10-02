import { Router, type IRouter } from "express";
import { authenticate } from "../middlewares/auth.js";
import { createOAuthState, consumeOAuthState } from "../lib/oauth-state.js";
import { buildSketchfabOAuthUrl, exchangeSketchfabCode, sketchfabConfigured } from "../lib/arqdor/sketchfab.js";
import { disconnectSketchfab, getSketchfabConnection, saveSketchfabConnection } from "../services/sketchfab-connection.js";

const router: IRouter = Router();
const callbackRouter: IRouter = Router();

function frontendUrl(): string {
  return (process.env["FRONTEND_APP_URL"] || (process.env["NODE_ENV"] === "production" ? "https://app.appvendorai.com" : "http://localhost:3000")).replace(/\/$/, "");
}

function safeReturnTo(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  return text.startsWith("/arch") ? text : "/arch";
}

router.get("/auth/sketchfab", authenticate, async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.sub;
  if (!tenantId || !userId) return res.status(401).json({ error: "Unauthorized" });
  if (!sketchfabConfigured()) return res.status(503).json({ error: "sketchfab_not_configured" });

  const returnTo = safeReturnTo(req.query.returnTo);
  const state = createOAuthState(tenantId, userId, "sketchfab", returnTo);
  return res.json({ url: buildSketchfabOAuthUrl(state) });
});

callbackRouter.get("/auth/sketchfab/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const app = frontendUrl();
  if (error || !code || !state) return res.redirect(`${app}/arch?sketchfabError=access_denied`);

  let tenantId: string;
  let returnTo = "/arch";
  try {
    const decoded = consumeOAuthState(state, "sketchfab");
    tenantId = decoded.tenantId;
    returnTo = safeReturnTo(decoded.returnTo);
  } catch {
    return res.redirect(`${app}/arch?sketchfabError=invalid_state`);
  }

  try {
    const tokens = await exchangeSketchfabCode(code);
    await saveSketchfabConnection(tenantId, tokens);
    const separator = returnTo.includes("?") ? "&" : "?";
    return res.redirect(`${app}${returnTo}${separator}sketchfabConnected=1`);
  } catch (err) {
    console.error("[sketchfab/oauth/callback]", err);
    const separator = returnTo.includes("?") ? "&" : "?";
    return res.redirect(`${app}${returnTo}${separator}sketchfabError=connection_failed`);
  }
});

router.get("/arch/sketchfab/connection", authenticate, async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
  const row = await getSketchfabConnection(tenantId);
  return res.json({
    configured: sketchfabConfigured(),
    connected: Boolean(row && row.status === "active" && !row.disconnectedAt),
    accountName: row?.accountName ?? null,
    tokenExpiresAt: row?.tokenExpiresAt?.toISOString() ?? null,
  });
});

router.delete("/arch/sketchfab/connection", authenticate, async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });
  await disconnectSketchfab(tenantId);
  return res.json({ success: true });
});

export default router;
export { callbackRouter as sketchfabCallbackRouter };
