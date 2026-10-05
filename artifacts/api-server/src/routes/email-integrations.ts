import { Router, type IRouter, type Request } from "express";
import { authenticate } from "../middlewares/auth.js";
import { consumeOAuthState, createOAuthState } from "../lib/oauth-state.js";
import {
  buildEmailOAuthUrl,
  disconnectEmail,
  emailIntegrationRedirect,
  emailProviderAvailability,
  exchangeEmailCode,
  listEmailConnections,
  syncConnectedEmailInbox,
  type EmailProvider,
} from "../services/email-platforms.js";

const router: IRouter = Router();
const callbackRouter: IRouter = Router();

function provider(value: unknown): EmailProvider | null {
  const candidate = String(value || "");
  return candidate === "google" || candidate === "microsoft" ? candidate : null;
}

function stateProvider(selected: EmailProvider) {
  return selected === "google" ? "email-google" as const : "email-microsoft" as const;
}

function canAccess(req: Request, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

router.get("/tenants/:tenantId/email-connections", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json({ connections: await listEmailConnections(tenantId) });
});

router.get("/tenants/:tenantId/email-connections/:provider/auth-url", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (!req.user?.sub) return res.status(401).json({ error: "Unauthorized" });
  const availability = emailProviderAvailability(selected);
  if (!availability.configured) return res.status(503).json({ error: "provider_not_configured", provider: selected });
  try {
    const state = createOAuthState(tenantId, req.user.sub, stateProvider(selected), "/configuracoes");
    return res.json({ url: buildEmailOAuthUrl(selected, state) });
  } catch (error) {
    req.log?.warn?.({ error, provider: selected }, "email oauth url failed");
    return res.status(503).json({ error: "provider_not_configured", provider: selected });
  }
});

router.delete("/tenants/:tenantId/email-connections/:provider", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  await disconnectEmail(tenantId, selected);
  return res.json({ success: true });
});

router.post("/tenants/:tenantId/email-connections/:provider/test", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const connections = await listEmailConnections(tenantId);
  const found = connections.find((connection) => connection.provider === selected);
  return found ? res.json({ ok: true, connection: found }) : res.status(404).json({ error: "connection_not_found" });
});

router.post("/tenants/:tenantId/email-connections/:provider/sync", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await syncConnectedEmailInbox(tenantId, selected);
    return res.json(result);
  } catch (error) {
    req.log?.error?.({ error, tenantId, provider: selected }, "email inbox sync failed");
    const message = error instanceof Error ? error.message : "email_sync_failed";
    if (message === "email_connection_not_found") return res.status(404).json({ error: message });
    return res.status(422).json({ error: "email_sync_failed", detail: message });
  }
});

callbackRouter.get("/auth/email/:provider/callback", async (req, res) => {
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).send("Provider not supported");
  const { code, state, error } = req.query as Record<string, string>;
  const redirect = emailIntegrationRedirect();
  if (error || !code || !state) return res.redirect(`${redirect}?emailError=access_denied&provider=${selected}`);
  try {
    const payload = consumeOAuthState(state, stateProvider(selected));
    await exchangeEmailCode(selected, code, payload.tenantId);
    return res.redirect(`${redirect}?emailConnected=${selected}`);
  } catch (callbackError) {
    req.log?.error?.({ error: callbackError, provider: selected }, "email oauth callback failed");
    return res.redirect(`${redirect}?emailError=connection_failed&provider=${selected}`);
  }
});

export default router;
export const emailIntegrationsCallbackRouter: IRouter = callbackRouter;
