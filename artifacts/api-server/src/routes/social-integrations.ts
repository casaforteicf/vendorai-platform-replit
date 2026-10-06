import { Router, type IRouter, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { contentCalendarItemsTable, db, socialPublicationsTable } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { consumeOAuthState, createOAuthState } from "../lib/oauth-state.js";
import { logger } from "../lib/logger.js";
import { writeConfigurationAudit } from "../lib/configuration-audit.js";
import {
  buildSocialOAuthUrl, createSocialPublication, disconnectSocial, exchangeSocialCode,
  getActiveSocialConnection, listSocialConnections, providerAvailability, saveSocialConnection,
  setSocialConnectionIdentityRole, listSocialComments, replyToSocialComment,
  type SocialProvider,
} from "../services/social-platforms.js";
import { createInstagramOrganicPublication } from "../services/instagram-organic-publication.js";
import { createFacebookOrganicPublication, resolveFacebookOrganicCapability } from "../services/facebook-organic-publication.js";
import { publishAnySocialPublication } from "../services/social-publication-dispatcher.js";
import { startSocialPublicationWorker } from "../services/social-publication-worker.js";
import { refreshYouTubePublicationMetrics, syncYouTubePublicationComments } from "../services/youtube-channel-automation.js";
import { resolveValidSocialConnection } from "../services/social-token-runtime.js";

const router: IRouter = Router();
const callbackRouter: IRouter = Router();
const providers = new Set<SocialProvider>(["youtube", "linkedin", "tiktok"]);
const socialIdentityRoleSchema = z.object({ identityRole: z.enum(["brand", "personal", "operational"]) });
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

async function auditSocialConnectionChange(input: {
  tenantId: string;
  selected: SocialProvider;
  action: "criar" | "atualizar" | "excluir";
  before?: unknown;
  after?: unknown;
  userId?: string | null;
  ip?: string | null;
}) {
  const audited = await writeConfigurationAudit({
    tenantId: input.tenantId,
    action: input.action,
    entity: `integration_${input.selected}`,
    entityId: input.tenantId,
    before: input.before,
    after: input.after,
    actor: { userId: input.userId ?? null, ip: input.ip ?? null },
  });
  if (!audited) logger.warn({ tenantId: input.tenantId, provider: input.selected }, "configuracoes: falha ao auditar integração social");
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
    const before = await getActiveSocialConnection(payload.tenantId, selected);
    const tokens = await exchangeSocialCode(selected, code);
    await saveSocialConnection(payload.tenantId, selected, tokens);
    const after = await getActiveSocialConnection(payload.tenantId, selected);
    await auditSocialConnectionChange({
      tenantId: payload.tenantId,
      selected,
      action: before ? "atualizar" : "criar",
      before: before ?? undefined,
      after: after ?? undefined,
      userId: payload.userId ?? null,
      ip: req.ip ?? null,
    });
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

router.patch("/tenants/:tenantId/social-connections/:provider", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = socialIdentityRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_identity_role", details: parsed.error.flatten() });

  const before = await getActiveSocialConnection(tenantId, selected);
  if (!before || before.disconnectedAt) return res.status(404).json({ error: "connection_not_found" });
  const previousRole = before.metadata?.["identityRole"] === "brand" || before.metadata?.["identityRole"] === "personal" || before.metadata?.["identityRole"] === "operational"
    ? before.metadata["identityRole"]
    : selected === "youtube" ? "operational" : "personal";
  const updated = await setSocialConnectionIdentityRole(tenantId, selected, parsed.data.identityRole);
  if (!updated) return res.status(404).json({ error: "connection_not_found" });

  await auditSocialConnectionChange({
    tenantId,
    selected,
    action: "atualizar",
    before: { identityRole: previousRole, accountName: before.accountName },
    after: { identityRole: parsed.data.identityRole, accountName: before.accountName },
    userId: req.user?.sub ?? null,
    ip: req.ip ?? null,
  });
  return res.json({ success: true, provider: selected, identityRole: parsed.data.identityRole });
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

router.get("/tenants/:tenantId/social-publications", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const publications = await db.select().from(socialPublicationsTable)
    .where(eq(socialPublicationsTable.tenantId, tenantId))
    .orderBy(desc(socialPublicationsTable.createdAt))
    .limit(100);
  return res.json({ publications });
});

router.delete("/tenants/:tenantId/social-connections/:provider", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const before = await getActiveSocialConnection(tenantId, selected);
  await disconnectSocial(tenantId, selected);
  await auditSocialConnectionChange({
    tenantId,
    selected,
    action: "excluir",
    before: before ?? undefined,
    userId: req.user?.sub ?? null,
    ip: req.ip ?? null,
  });
  return res.json({ success: true });
});

router.post("/tenants/:tenantId/social-connections/:provider/test", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const selected = provider(req.params.provider);
  if (!selected) return res.status(404).json({ error: "provider_not_supported" });
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const connection = await getActiveSocialConnection(tenantId, selected);
  if (!connection) return res.status(404).json({ error: "connection_not_found" });
  try {
    const valid = await resolveValidSocialConnection(tenantId, selected, connection.id);
    return res.json({ ok: true, accountName: valid.accountName, refreshed: valid.updatedAt?.getTime() !== connection.updatedAt?.getTime() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "connection_test_failed";
    if (message.endsWith("_reconnect_required")) return res.status(409).json({ error: message, reconnectRequired: true });
    return res.status(422).json({ error: "connection_test_failed", detail: message });
  }
});

const publicationSchema = z.object({
  text: z.string().trim().max(10_000).optional(),
  mediaUrl: z.string().url().optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  contentType: z.enum(["post", "video", "short", "image", "carousel", "story", "reel"]).optional(),
  mediaKind: z.enum(["image", "video"]).optional(),
  calendarItemId: z.string().min(1).optional(),
  contentGenerationId: z.string().min(1).optional(),
  scheduledAt: z.string().min(1).optional(),
  mediaAssetId: z.string().min(1).optional(),
  sourceProjectId: z.string().min(1).optional(),
  sourceSeriesId: z.string().min(1).optional(),
  sourceVersion: z.number().int().positive().optional(),
  youtubeTitle: z.string().trim().min(1).max(100).optional(),
  youtubeDescription: z.string().trim().max(5000).optional(),
  youtubeTags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  youtubePrivacyStatus: z.enum(["public", "unlisted", "private"]).optional(),
  youtubeCategoryId: z.string().trim().min(1).max(10).optional(),
  youtubePlaylistId: z.string().trim().min(1).max(200).optional(),
  youtubeThumbnailUrl: z.string().url().optional(),
  youtubeMadeForKids: z.boolean().optional(),
  youtubeDefaultLanguage: z.string().trim().min(2).max(20).optional(),
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

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  if (scheduledAt && (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now() + 30_000)) {
    return res.status(422).json({ error: "schedule_in_past" });
  }

  if (parsed.data.calendarItemId) {
    const [calendarItem] = await db.select({
      id: contentCalendarItemsTable.id,
      contentGenerationId: contentCalendarItemsTable.contentGenerationId,
    }).from(contentCalendarItemsTable).where(and(
      eq(contentCalendarItemsTable.id, parsed.data.calendarItemId),
      eq(contentCalendarItemsTable.tenantId, tenantId),
    )).limit(1);
    if (!calendarItem) return res.status(404).json({ error: "calendar_item_not_found" });
    if (parsed.data.contentGenerationId && calendarItem.contentGenerationId && calendarItem.contentGenerationId !== parsed.data.contentGenerationId) {
      return res.status(409).json({ error: "calendar_generation_mismatch" });
    }
  }

  const facebookInput: Parameters<typeof createFacebookOrganicPublication>[1] = {
    text: parsed.data.text,
    mediaUrl: parsed.data.mediaUrl,
    mediaUrls: parsed.data.mediaUrls,
    contentType: parsed.data.contentType === "video" || parsed.data.contentType === "short"
      ? "reel"
      : parsed.data.contentType,
    mediaKind: parsed.data.mediaKind,
  };

  try {
    const youtubeMetadata = selected === "youtube" ? {
      youtube: {
        title: parsed.data.youtubeTitle,
        description: parsed.data.youtubeDescription ?? parsed.data.text,
        tags: parsed.data.youtubeTags ?? [],
        privacyStatus: parsed.data.youtubePrivacyStatus ?? "public",
        categoryId: parsed.data.youtubeCategoryId ?? "22",
        playlistId: parsed.data.youtubePlaylistId,
        thumbnailUrl: parsed.data.youtubeThumbnailUrl,
        madeForKids: parsed.data.youtubeMadeForKids ?? false,
        defaultLanguage: parsed.data.youtubeDefaultLanguage ?? "pt-BR",
      },
    } : undefined;

    const publication = selected === "instagram"
      ? await createInstagramOrganicPublication(tenantId, parsed.data)
      : selected === "facebook"
        ? await createFacebookOrganicPublication(tenantId, facebookInput)
        : await createSocialPublication(tenantId, selected, {
            text: parsed.data.text,
            mediaUrl: parsed.data.mediaUrl,
            contentType: parsed.data.contentType,
            metadata: youtubeMetadata,
          });

    const sourceMetadata: Record<string, unknown> = parsed.data.calendarItemId ? {
      calendarItemId: parsed.data.calendarItemId,
      contentGenerationId: parsed.data.contentGenerationId,
      source: "media-calendar",
    } : {};

    if (parsed.data.mediaAssetId) sourceMetadata.mediaAssetId = parsed.data.mediaAssetId;
    if (parsed.data.sourceProjectId) sourceMetadata.sourceProjectId = parsed.data.sourceProjectId;
    if (parsed.data.sourceSeriesId) sourceMetadata.sourceSeriesId = parsed.data.sourceSeriesId;
    if (parsed.data.sourceVersion) sourceMetadata.sourceVersion = parsed.data.sourceVersion;
    if (!parsed.data.calendarItemId && (parsed.data.mediaAssetId || parsed.data.sourceProjectId || parsed.data.sourceSeriesId)) {
      sourceMetadata.source = "video-studio";
    }
    if (scheduledAt) {
      sourceMetadata.scheduleMode = "manual";
      sourceMetadata.scheduledAt = scheduledAt.toISOString();
      sourceMetadata.scheduledBy = req.user?.sub ?? null;
    }

    const [linkedPublication] = await db.update(socialPublicationsTable).set({
      status: scheduledAt ? "scheduled" : publication.status,
      metadata: { ...(publication.metadata || {}), ...sourceMetadata },
      updatedAt: new Date(),
    }).where(and(
      eq(socialPublicationsTable.id, publication.id),
      eq(socialPublicationsTable.tenantId, tenantId),
    )).returning();
    if (!linkedPublication) throw new Error("publication_link_failed");

    if (scheduledAt) {
      logger.info(
        { tenantId, publicationId: linkedPublication.id, provider: selected, scheduledAt: scheduledAt.toISOString() },
        "Publicação do Video Studio agendada",
      );
      return res.status(202).json({ publication: linkedPublication, publishing: false, scheduled: true });
    }

    void publishAnySocialPublication(tenantId, linkedPublication.id).catch((error) => {
      logger.error({ error, tenantId, publicationId: linkedPublication.id, provider: selected }, "Falha assíncrona na publicação social");
    });
    return res.status(202).json({ publication: linkedPublication, publishing: true, scheduled: false });
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

router.post("/tenants/:tenantId/social-publications/:publicationId/youtube/refresh", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed guarded immediately by authenticated same-tenant/super-admin access
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const publication = await refreshYouTubePublicationMetrics(tenantId, String(req.params.publicationId));
    const comments = await syncYouTubePublicationComments(tenantId, String(req.params.publicationId));
    return res.json({ publication, comments: comments.comments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "youtube_refresh_failed";
    if (message === "publication_not_found") return res.status(404).json({ error: message });
    if (message === "connection_not_found") return res.status(409).json({ error: message });
    return res.status(422).json({ error: "youtube_refresh_failed", detail: message });
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
    return res.json({ reply: await replyToSocialComment(tenantId, selected, String(req.params.commentId), text.data) });
  } catch (error) {
    if (error instanceof Error && error.message === "capability_not_available") return res.status(422).json({ error: error.message });
    throw error;
  }
});

export default router;
export const socialIntegrationsCallbackRouter: IRouter = callbackRouter;
