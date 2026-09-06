import { Router, type IRouter, type Request } from "express";
import { z } from "zod/v4";
import { authenticate } from "../middlewares/auth.js";
import { consumeOAuthState, createOAuthState } from "../lib/oauth-state.js";
import { logger } from "../lib/logger.js";
import {
  buildSocialOAuthUrl, createSocialPublication, disconnectSocial, exchangeSocialCode,
  getActiveSocialConnection, listSocialConnections, providerAvailability, saveSocialConnection,
  listSocialComments, replyToSocialComment,
  type SocialProvider,
} from "../services/social-platforms.js";
import { createInstagramOrganicPublication } from "../services/instagram-organic-publication.js";
import { createFacebookOrganicPublication, resolveFacebookOrganicCapability } from "../services/facebook-organic-publication.js";
import { publishAnySocialPublication } from "../services/social-publication-dispatcher.js";
import { startSocialPublicationWorker } from "../services/social-publication-worker.js";

const router: IRouter = Router();
const callbackRouter: IRouter = Router();
const providers = new Set<SocialProvider>(["youtube", "linkedin", "tiktok"]);
startSocialPublicationWorker();

function provider(value: unknown): SocialProvider | null {
  const candidate = String(value || "") as SocialProvider;
  return providers.has(candidate) ? candidate : null;
}

function canAccess(req: Request, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function frontendUrl() {
  return (process.env["FRONTEND_APP_URL"] || (process.env["NODE_ENV"] === "production" ? "https://app.appvendorai.com" : "http://localhost:3000")).replace(/\/$/, "");
}

router.get("/auth/:provider", authenticate, (req, res) => {
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!req.user?.sub || !req.user.tenantId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const state = createOAuthState(req.user.tenantId, req.user.sub, selected);
    return res.json({ url: buildSocialOAuthUrl(selected, state) });
  } catch (error) {
    logger.warn({ error, provider: selected }, "Integração social não configurada");
    return res.status(503).json({ error: "provider_not_configured", provider: selected, ...providerAvailability(selected) });
  }
});

callbackRouter.get("/auth/:provider/callback", async (req, res) => {
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).send("Provider not supported");
  const { code, state, error } = req.query as Record<string, string>;
  const redirect = `${frontendUrl()}/configuracoes`;
  if (error || !code || !state) return res.redirect(`${redirect}?socialError=access_denied&provider=${selected}`);
  try {
    const payload = consumeOAuthState(state, selected);
    const tokens = await exchangeSocialCode(selected, code);
    await saveSocialConnection(payload.tenantId, selected, tokens);
    return res.redirect(`${redirect}?socialConnected=${selected}`);
  } catch (callbackError) {
    logger.error({ error: callbackError, provider: selected }, "Falha no callback social");
    return res.redirect(`${redirect}?socialError=connection_failed&provider=${selected}`);
  }
});

router.get("/tenants/:tenantId/social-connections", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json({ connections: await listSocialConnections(tenantId) });
});

router.get("/tenants/:tenantId/facebook-organic-capability", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const capability = await resolveFacebookOrganicCapability(tenantId);
  return res.json({
    ready: capability.ready,
    reason: capability.reason,
    pageId: capability.pageId,
    pageName: capability.pageName,
    reconnectMeta: capability.reason === "page_permission_missing" || capability.reason === "meta_token_expired",
  });
});

router.delete("/tenants/:tenantId/social-connections/:provider", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  await disconnectSocial(tenantId, selected);
  return res.json({ success: true });
});

router.post("/tenants/:tenantId/social-connections/:provider/test", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const connection = await getActiveSocialConnection(tenantId, selected);
  return connection ? res.json({ ok: true, accountName: connection.accountName }) : res.status(404).json({ error: "connection_not_found" });
});

const publicationSchema = z.object({
  text: z.string().trim().max(10_000).optional(),
  mediaUrl: z.string().url().optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  contentType: z.enum(["post", "video", "short", "image", "carousel", "story", "reel"]).optional(),
  mediaKind: z.enum(["image", "video"]).optional(),
}).refine((data) => Boolean(data.text || data.mediaUrl || data.mediaUrls?.length), "text_or_media_required");

router.post("/tenants/:tenantId/social-publications/:provider", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const requestedProvider = String(req.params.provider || "");
  const selected = requestedProvider === "instagram" || requestedProvider === "facebook"
    ? requestedProvider
    : provider(requestedProvider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = publicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_publication", details: parsed.error.flatten() });
  try {
    const publication = selected === "instagram"
      ? await createInstagramOrganicPublication(tenantId, parsed.data)
      : selected === "facebook"
        ? await createFacebookOrganicPublication(tenantId, parsed.data)
        : await createSocialPublication(tenantId, selected, parsed.data);
    void publishAnySocialPublication(tenantId, publication.id).catch((error) => {
      logger.error({ error, tenantId, publicationId: publication.id, provider: selected }, "Falha assíncrona na publicação social");
    });
    return res.status(202).json({ publication, publishing: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "publication_failed";
    if (["connection_not_found", "meta_not_connected", "meta_token_expired", "instagram_not_connected", "page_permission_missing", "linked_page_not_found"].includes(message)) {
      return res.status(409).json({ error: message });
    }
    if (["facebook_content_type_not_supported", "facebook_reel_requires_video", "facebook_story_requires_single_media"].includes(message)) {
      return res.status(422).json({ error: message });
    }
    throw error;
  }
});

router.post("/tenants/:tenantId/social-publications/:publicationId/retry", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const publication = await publishAnySocialPublication(tenantId, String(req.params.publicationId));
    return res.json({ publication });
  } catch (error) {
    const message = error instanceof Error ? error.message : "publication_failed";
    if (message === "publication_not_found") return res.status(404).json({ error: message });
    if (["connection_not_found", "meta_not_connected", "meta_token_expired", "instagram_not_connected", "page_permission_missing", "linked_page_not_found"].includes(message)) {
      return res.status(409).json({ error: message });
    }
    return res.status(422).json({ error: "publication_failed", detail: message });
  }
});

router.get("/tenants/:tenantId/social-comments/:provider/:postId", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    return res.json({ comments: await listSocialComments(tenantId, selected, String(req.params.postId)) });
  } catch (error) {
    if (error instanceof Error && error.message === "capability_not_available") return res.status(422).json({ error: error.message });
    throw error;
  }
});

router.post("/tenants/:tenantId/social-comments/:provider/:commentId/replies", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const text = z.string().trim().min(1).max(2_000).safeParse(req.body?.text);
  if (!text.success) return res.status(400).json({ error: "invalid_reply" });
  try {
    return res.json({ reply: await replyToSocialComment(tenantId, selected, String(req.params.commentId), text.data });
  } catch (error) {
    if (error instanceof Error && error.message === "capability_not_available") return res.status(422).json({ error: error.message });
    throw error;
  }
});

export default router;
export const socialIntegrationsCallbackRouter: IRouter = callbackRouter;