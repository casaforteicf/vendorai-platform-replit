import { and, eq } from "drizzle-orm";
import { db, socialPublicationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getInstagramConnectionByTenantId } from "./instagram-oauth.js";
import { getMetaAdsConnectionByTenantId, listAccessibleInstagramIdentities, META_GRAPH_BASE } from "./meta-ads-oauth.js";

type FacebookOrganicInput = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  contentType?: "post" | "image" | "carousel" | "story" | "reel";
  mediaKind?: "image" | "video";
};

type FacebookCapability = {
  ready: boolean;
  reason?: "meta_not_connected" | "meta_token_expired" | "instagram_not_connected" | "page_permission_missing" | "linked_page_not_found";
  pageId?: string;
  pageName?: string;
  pageAccessToken?: string;
};

class FacebookPublishError extends Error {}

async function parseResponse(response: Response) {
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { raw, data };
}

async function graphPost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const response = await fetch(`${META_GRAPH_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const { raw, data } = await parseResponse(response);
  if (!response.ok) throw new FacebookPublishError(`facebook_${path.replace(/\W+/g, "_")}_${response.status}: ${raw.slice(0, 500)}`);
  return data;
}

async function uploadHostedVideo(uploadUrl: string, token: string, mediaUrl: string) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      file_url: mediaUrl,
    },
  });
  const { raw, data } = await parseResponse(response);
  if (!response.ok || data?.success === false) {
    throw new FacebookPublishError(`facebook_video_upload_${response.status}: ${raw.slice(0, 500)}`);
  }
  return data;
}

export async function resolveFacebookOrganicCapability(tenantId: string): Promise<FacebookCapability> {
  const meta = await getMetaAdsConnectionByTenantId(tenantId);
  if (!meta?.accessToken || meta.status === "disconnected" || meta.disconnectedAt) {
    return { ready: false, reason: "meta_not_connected" };
  }
  if (meta.tokenExpiresAt && meta.tokenExpiresAt <= new Date()) {
    return { ready: false, reason: "meta_token_expired" };
  }

  const instagram = await getInstagramConnectionByTenantId(tenantId);
  if (!instagram?.accountId || instagram.disconnectedAt) {
    return { ready: false, reason: "instagram_not_connected" };
  }

  let identities;
  try {
    identities = await listAccessibleInstagramIdentities(meta.accessToken);
  } catch (error) {
    logger.warn({ error, tenantId }, "Facebook orgânico: conexão Meta sem acesso suficiente às Pages");
    return { ready: false, reason: "page_permission_missing" };
  }

  const linked = identities.find((identity) => identity.instagramUserId === instagram.accountId);
  if (!linked) return { ready: false, reason: "linked_page_not_found" };
  return {
    ready: true,
    pageId: linked.pageId,
    pageName: linked.pageName,
    pageAccessToken: linked.pageAccessToken,
  };
}

export async function createFacebookOrganicPublication(tenantId: string, input: FacebookOrganicInput) {
  const capability = await resolveFacebookOrganicCapability(tenantId);
  if (!capability.ready || !capability.pageId || !capability.pageAccessToken) {
    throw new Error(capability.reason || "connection_not_found");
  }

  const mediaUrls = Array.from(new Set((input.mediaUrls ?? []).filter(Boolean)));
  if (input.mediaUrl && !mediaUrls.includes(input.mediaUrl)) mediaUrls.unshift(input.mediaUrl);
  if (!input.text && mediaUrls.length === 0) throw new Error("text_or_media_required");
  const contentType = input.contentType || (mediaUrls.length > 1 ? "carousel" : mediaUrls.length === 1 ? "image" : "post");
  if (!(["post", "image", "carousel", "story", "reel"] as string[]).includes(contentType)) throw new Error("facebook_content_type_not_supported");

  if (contentType === "reel") {
    if (mediaUrls.length !== 1 || input.mediaKind !== "video") throw new Error("facebook_reel_requires_video");
  }
  if (contentType === "story") {
    if (mediaUrls.length !== 1 || !input.mediaKind) throw new Error("facebook_story_requires_single_media");
  }

  const [created] = await db.insert(socialPublicationsTable).values({
    tenantId,
    provider: "facebook",
    connectionId: null,
    text: input.text,
    mediaUrl: mediaUrls[0],
    contentType,
    status: "queued",
    metadata: {
      mediaUrls,
      facebookPageId: capability.pageId,
      facebookPageName: capability.pageName,
      facebookMediaKind: input.mediaKind,
    },
  }).returning();
  return created;
}

async function publishText(pageId: string, token: string, text: string) {
  const result = await graphPost(`${pageId}/feed`, { message: text, access_token: token });
  const externalId = result?.id as string | undefined;
  if (!externalId) throw new FacebookPublishError("facebook_feed_missing_id");
  return externalId;
}

async function publishImage(pageId: string, token: string, mediaUrl: string, text: string) {
  const result = await graphPost(`${pageId}/photos`, {
    url: mediaUrl,
    caption: text,
    published: "true",
    access_token: token,
  });
  const externalId = (result?.post_id || result?.id) as string | undefined;
  if (!externalId) throw new FacebookPublishError("facebook_photo_missing_id");
  return externalId;
}

async function publishCarousel(pageId: string, token: string, mediaUrls: string[], text: string) {
  if (mediaUrls.length < 2) throw new FacebookPublishError("facebook_carousel_requires_two_items");
  const mediaIds: string[] = [];
  for (const mediaUrl of mediaUrls.slice(0, 10)) {
    const uploaded = await graphPost(`${pageId}/photos`, {
      url: mediaUrl,
      published: "false",
      access_token: token,
    });
    const id = uploaded?.id as string | undefined;
    if (!id) throw new FacebookPublishError("facebook_carousel_photo_missing_id");
    mediaIds.push(id);
  }
  const result = await graphPost(`${pageId}/feed`, {
    message: text,
    attached_media: JSON.stringify(mediaIds.map((media_fbid) => ({ media_fbid }))),
    access_token: token,
  });
  const externalId = result?.id as string | undefined;
  if (!externalId) throw new FacebookPublishError("facebook_carousel_missing_id");
  return externalId;
}

async function publishPhotoStory(pageId: string, token: string, mediaUrl: string) {
  const uploaded = await graphPost(`${pageId}/photos`, {
    url: mediaUrl,
    published: "false",
    access_token: token,
  });
  const photoId = uploaded?.id as string | undefined;
  if (!photoId) throw new FacebookPublishError("facebook_story_photo_missing_id");
  const result = await graphPost(`${pageId}/photo_stories`, {
    photo_id: photoId,
    access_token: token,
  });
  const externalId = (result?.post_id || result?.id || photoId) as string | undefined;
  if (!externalId) throw new FacebookPublishError("facebook_photo_story_missing_id");
  return externalId;
}

async function publishVideoStory(pageId: string, token: string, mediaUrl: string, text: string) {
  const started = await graphPost(`${pageId}/video_stories`, {
    upload_phase: "start",
    access_token: token,
  });
  const videoId = started?.video_id as string | undefined;
  const uploadUrl = started?.upload_url as string | undefined;
  if (!videoId || !uploadUrl) throw new FacebookPublishError("facebook_video_story_start_failed");

  await uploadHostedVideo(uploadUrl, token, mediaUrl);
  const result = await graphPost(`${pageId}/video_stories`, {
    upload_phase: "finish",
    video_id: videoId,
    video_state: "PUBLISHED",
    description: text,
    access_token: token,
  });
  return (result?.post_id || result?.id || videoId) as string;
}

async function publishReel(pageId: string, token: string, mediaUrl: string, text: string) {
  const started = await graphPost(`${pageId}/video_reels`, {
    upload_phase: "start",
    access_token: token,
  });
  const videoId = started?.video_id as string | undefined;
  const uploadUrl = started?.upload_url as string | undefined;
  if (!videoId || !uploadUrl) throw new FacebookPublishError("facebook_reel_start_failed");

  await uploadHostedVideo(uploadUrl, token, mediaUrl);
  const result = await graphPost(`${pageId}/video_reels`, {
    upload_phase: "finish",
    video_id: videoId,
    video_state: "PUBLISHED",
    description: text,
    access_token: token,
  });
  return (result?.id || result?.post_id || videoId) as string;
}

export async function publishFacebookOrganicPublication(tenantId: string, publicationId: string) {
  const [publication] = await db.select().from(socialPublicationsTable).where(and(
    eq(socialPublicationsTable.id, publicationId),
    eq(socialPublicationsTable.tenantId, tenantId),
    eq(socialPublicationsTable.provider, "facebook"),
  )).limit(1);
  if (!publication) throw new FacebookPublishError("publication_not_found");
  if (publication.externalId && publication.status === "published") return publication;

  const capability = await resolveFacebookOrganicCapability(tenantId);
  if (!capability.ready || !capability.pageId || !capability.pageAccessToken) {
    throw new FacebookPublishError(capability.reason || "connection_not_found");
  }

  await db.update(socialPublicationsTable).set({ status: "publishing", updatedAt: new Date() })
    .where(eq(socialPublicationsTable.id, publication.id));

  try {
    const metadata = (publication.metadata || {}) as Record<string, unknown>;
    const mediaUrls = Array.isArray(metadata.mediaUrls)
      ? metadata.mediaUrls.filter((value): value is string => typeof value === "string" && Boolean(value))
      : [];
    if (publication.mediaUrl && !mediaUrls.includes(publication.mediaUrl)) mediaUrls.unshift(publication.mediaUrl);
    const text = publication.text || "";
    const mediaKind = metadata.facebookMediaKind === "video" ? "video" : "image";

    let externalId: string;
    if (publication.contentType === "reel") {
      if (!mediaUrls[0] || mediaKind !== "video") throw new FacebookPublishError("facebook_reel_requires_video");
      externalId = await publishReel(capability.pageId, capability.pageAccessToken, mediaUrls[0], text);
    } else if (publication.contentType === "story") {
      if (!mediaUrls[0]) throw new FacebookPublishError("facebook_story_requires_single_media");
      externalId = mediaKind === "video"
        ? await publishVideoStory(capability.pageId, capability.pageAccessToken, mediaUrls[0], text)
        : await publishPhotoStory(capability.pageId, capability.pageAccessToken, mediaUrls[0]);
    } else if (publication.contentType === "carousel" || mediaUrls.length > 1) {
      externalId = await publishCarousel(capability.pageId, capability.pageAccessToken, mediaUrls, text);
    } else if (mediaUrls[0]) {
      externalId = await publishImage(capability.pageId, capability.pageAccessToken, mediaUrls[0], text);
    } else {
      externalId = await publishText(capability.pageId, capability.pageAccessToken, text);
    }

    const [updated] = await db.update(socialPublicationsTable).set({
      externalId,
      status: "published",
      publishedAt: new Date(),
      metadata: {
        ...metadata,
        mediaUrls,
        facebookPageId: capability.pageId,
        facebookPageName: capability.pageName,
      },
      updatedAt: new Date(),
    }).where(eq(socialPublicationsTable.id, publication.id)).returning();
    return updated;
  } catch (error) {
    logger.error({ error, tenantId, publicationId }, "Falha ao publicar conteúdo orgânico no Facebook");
    await db.update(socialPublicationsTable).set({
      status: "failed",
      metadata: { ...(publication.metadata || {}), lastError: error instanceof Error ? error.message : String(error) },
      updatedAt: new Date(),
    }).where(eq(socialPublicationsTable.id, publication.id));
    throw error;
  }
}