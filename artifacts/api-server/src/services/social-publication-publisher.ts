import { and, eq } from "drizzle-orm";
import { db, socialPublicationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import type { SocialProvider } from "./social-platforms.js";
import { resolveValidSocialConnection } from "./social-token-runtime.js";

const LINKEDIN_VERSION = process.env["LINKEDIN_API_VERSION"] || "202608";
const MAX_REMOTE_MEDIA_BYTES = 150 * 1024 * 1024;

type PublishResult = {
  externalId: string;
  status: "published" | "processing";
  metadata?: Record<string, unknown>;
};

class SocialPublishError extends Error {}

async function requestJson(url: string, init: RequestInit, label: string): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const raw = await response.text();
    throw new SocialPublishError(`${label}_${response.status}: ${raw.slice(0, 500)}`);
  }
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function fetchRemoteMedia(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new SocialPublishError(`media_fetch_${response.status}`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_REMOTE_MEDIA_BYTES) throw new SocialPublishError("media_too_large");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_REMOTE_MEDIA_BYTES) throw new SocialPublishError("media_too_large");
  return {
    bytes: new Uint8Array(buffer),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

function linkedinHeaders(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function uploadLinkedInImage(token: string, owner: string, mediaUrl: string): Promise<string> {
  const initialized = await requestJson(
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    {
      method: "POST",
      headers: linkedinHeaders(token),
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    },
    "linkedin_image_init",
  );
  const uploadUrl = initialized?.value?.uploadUrl as string | undefined;
  const image = initialized?.value?.image as string | undefined;
  if (!uploadUrl || !image) throw new SocialPublishError("linkedin_image_init_invalid");
  const media = await fetchRemoteMedia(mediaUrl);
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": media.contentType },
    body: new Uint8Array(media.bytes),
  });
  if (!upload.ok) throw new SocialPublishError(`linkedin_image_upload_${upload.status}`);
  return image;
}

async function uploadLinkedInVideo(token: string, owner: string, mediaUrl: string): Promise<string> {
  const media = await fetchRemoteMedia(mediaUrl);
  const initialized = await requestJson(
    "https://api.linkedin.com/rest/videos?action=initializeUpload",
    {
      method: "POST",
      headers: linkedinHeaders(token),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner,
          fileSizeBytes: media.bytes.byteLength,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    },
    "linkedin_video_init",
  );
  const value = initialized?.value;
  const video = value?.video as string | undefined;
  const uploadToken = (value?.uploadToken || "") as string;
  const instructions = (value?.uploadInstructions || []) as Array<{ uploadUrl: string; firstByte: number; lastByte: number }>;
  if (!video || instructions.length === 0) throw new SocialPublishError("linkedin_video_init_invalid");

  const uploadedPartIds: string[] = [];
  for (const part of instructions) {
    const chunk = media.bytes.slice(part.firstByte, part.lastByte + 1);
    const upload = await fetch(part.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": media.contentType },
      body: chunk,
    });
    if (!upload.ok) throw new SocialPublishError(`linkedin_video_upload_${upload.status}`);
    const etag = upload.headers.get("etag")?.replace(/^\"|\"$/g, "");
    if (!etag) throw new SocialPublishError("linkedin_video_missing_etag");
    uploadedPartIds.push(etag);
  }

  await requestJson(
    "https://api.linkedin.com/rest/videos?action=finalizeUpload",
    {
      method: "POST",
      headers: linkedinHeaders(token),
      body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken, uploadedPartIds } }),
    },
    "linkedin_video_finalize",
  );
  return video;
}

async function publishLinkedIn(
  token: string,
  accountId: string,
  input: { text?: string | null; mediaUrl?: string | null; contentType: string },
): Promise<PublishResult> {
  if (!accountId) throw new SocialPublishError("linkedin_account_id_missing");
  const author = `urn:li:person:${accountId}`;
  let mediaUrn: string | undefined;
  if (input.mediaUrl && input.contentType === "image") mediaUrn = await uploadLinkedInImage(token, author, input.mediaUrl);
  if (input.mediaUrl && (input.contentType === "video" || input.contentType === "short")) {
    mediaUrn = await uploadLinkedInVideo(token, author, input.mediaUrl);
  }
  if (input.mediaUrl && !mediaUrn) throw new SocialPublishError(`linkedin_media_type_not_supported:${input.contentType}`);

  const body: Record<string, unknown> = {
    author,
    commentary: input.text || "",
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (mediaUrn) {
    body.content = { media: { id: mediaUrn, title: (input.text || "Conteúdo VendorAI").slice(0, 200) } };
  }
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedinHeaders(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new SocialPublishError(`linkedin_post_${response.status}: ${raw.slice(0, 500)}`);
  }
  const externalId = response.headers.get("x-restli-id");
  if (!externalId) throw new SocialPublishError("linkedin_post_missing_id");
  return { externalId, status: "published", metadata: mediaUrn ? { mediaUrn } : undefined };
}

async function publishTikTok(
  token: string,
  input: { text?: string | null; mediaUrl?: string | null; contentType: string },
): Promise<PublishResult> {
  if (!input.mediaUrl) throw new SocialPublishError("tiktok_media_required");
  if (input.contentType !== "video" && input.contentType !== "short") {
    throw new SocialPublishError(`tiktok_media_type_not_supported:${input.contentType}`);
  }
  const creator = await requestJson(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: "{}" },
    "tiktok_creator_info",
  );
  const privacyOptions = (creator?.data?.privacy_level_options || []) as string[];
  const privacyLevel = privacyOptions.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : privacyOptions[0];
  if (!privacyLevel) throw new SocialPublishError("tiktok_privacy_unavailable");

  const initialized = await requestJson(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        post_info: {
          title: (input.text || "").slice(0, 2200),
          privacy_level: privacyLevel,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: { source: "PULL_FROM_URL", video_url: input.mediaUrl },
      }),
    },
    "tiktok_publish_init",
  );
  const externalId = initialized?.data?.publish_id as string | undefined;
  if (!externalId) throw new SocialPublishError("tiktok_publish_missing_id");
  return { externalId, status: "processing", metadata: { privacyLevel } };
}

async function publishYouTube(
  token: string,
  input: { text?: string | null; mediaUrl?: string | null; contentType: string; metadata?: Record<string, unknown> | null },
): Promise<PublishResult> {
  if (!input.mediaUrl) throw new SocialPublishError("youtube_media_required");
  if (input.contentType !== "video" && input.contentType !== "short") {
    throw new SocialPublishError(`youtube_media_type_not_supported:${input.contentType}`);
  }

  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const youtube = metadata["youtube"] && typeof metadata["youtube"] === "object"
    ? metadata["youtube"] as Record<string, unknown>
    : {};
  const media = await fetchRemoteMedia(input.mediaUrl);
  const fallbackTitle = input.text?.split(/\r?\n/)[0] || "Vídeo VendorAI";
  const title = String(youtube["title"] || fallbackTitle).slice(0, 100);
  const description = String(youtube["description"] ?? input.text ?? "").slice(0, 5000);
  const categoryId = String(youtube["categoryId"] || "22");
  const tags = Array.isArray(youtube["tags"])
    ? youtube["tags"].map((value) => String(value).trim()).filter(Boolean).slice(0, 50)
    : [];
  const requestedPrivacy = String(youtube["privacyStatus"] || "public");
  const privacyStatus = requestedPrivacy === "private" || requestedPrivacy === "unlisted" ? requestedPrivacy : "public";
  const selfDeclaredMadeForKids = youtube["madeForKids"] === true;

  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Length": String(media.bytes.byteLength),
      "X-Upload-Content-Type": media.contentType,
    },
    body: JSON.stringify({
      snippet: {
        title,
        description,
        categoryId,
        ...(tags.length ? { tags } : {}),
        ...(youtube["defaultLanguage"] ? { defaultLanguage: String(youtube["defaultLanguage"]) } : {}),
      },
      status: { privacyStatus, selfDeclaredMadeForKids },
    }),
  });
  if (!init.ok) throw new SocialPublishError(`youtube_upload_init_${init.status}: ${(await init.text()).slice(0, 500)}`);
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new SocialPublishError("youtube_upload_missing_location");

  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": media.contentType, "Content-Length": String(media.bytes.byteLength) },
    body: new Uint8Array(media.bytes),
  });
  if (!uploaded.ok) throw new SocialPublishError(`youtube_upload_${uploaded.status}: ${(await uploaded.text()).slice(0, 500)}`);
  const data = await uploaded.json() as { id?: string };
  if (!data.id) throw new SocialPublishError("youtube_upload_missing_id");

  const applied: Record<string, unknown> = { title, description, categoryId, privacyStatus, tags };

  const thumbnailUrl = typeof youtube["thumbnailUrl"] === "string" ? youtube["thumbnailUrl"] : "";
  if (thumbnailUrl) {
    try {
      const thumbnail = await fetchRemoteMedia(thumbnailUrl);
      const response = await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(data.id)}&uploadType=media`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": thumbnail.contentType },
          body: new Uint8Array(thumbnail.bytes),
        },
      );
      if (!response.ok) throw new Error(`thumbnail_${response.status}: ${(await response.text()).slice(0, 300)}`);
      applied["thumbnailApplied"] = true;
    } catch (error) {
      logger.warn({ error, videoId: data.id }, "YouTube publicado, mas a thumbnail personalizada não pôde ser aplicada");
      applied["thumbnailApplied"] = false;
    }
  }

  const playlistId = typeof youtube["playlistId"] === "string" ? youtube["playlistId"].trim() : "";
  if (playlistId) {
    try {
      const response = await fetch("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          snippet: {
            playlistId,
            resourceId: { kind: "youtube#video", videoId: data.id },
          },
        }),
      });
      if (!response.ok) throw new Error(`playlist_${response.status}: ${(await response.text()).slice(0, 300)}`);
      applied["playlistApplied"] = true;
    } catch (error) {
      logger.warn({ error, videoId: data.id, playlistId }, "YouTube publicado, mas não foi possível adicionar o vídeo à playlist");
      applied["playlistApplied"] = false;
    }
  }

  return { externalId: data.id, status: "published", metadata: { youtube: applied } };
}

export async function publishSocialPublication(tenantId: string, publicationId: string) {
  const [publication] = await db.select().from(socialPublicationsTable).where(and(
    eq(socialPublicationsTable.id, publicationId),
    eq(socialPublicationsTable.tenantId, tenantId),
  )).limit(1);
  if (!publication) throw new SocialPublishError("publication_not_found");
  if (publication.externalId && ["published", "processing"].includes(publication.status)) return publication;

  const provider = publication.provider as SocialProvider;
  if (!(["youtube", "linkedin", "tiktok"] as string[]).includes(provider)) {
    throw new SocialPublishError(`provider_not_supported:${publication.provider}`);
  }
  if (!publication.connectionId) throw new SocialPublishError("connection_not_found");

  const connection = await resolveValidSocialConnection(tenantId, provider, publication.connectionId);
  if (provider === "linkedin" && !connection.externalAccountId) {
    throw new SocialPublishError("linkedin_account_id_missing");
  }

  await db.update(socialPublicationsTable).set({ status: "publishing", updatedAt: new Date() })
    .where(and(eq(socialPublicationsTable.id, publication.id), eq(socialPublicationsTable.tenantId, tenantId)));

  try {
    const input = { text: publication.text, mediaUrl: publication.mediaUrl, contentType: publication.contentType, metadata: publication.metadata };
    const result = provider === "youtube"
      ? await publishYouTube(connection.accessToken, input)
      : provider === "linkedin"
        ? await publishLinkedIn(connection.accessToken, connection.externalAccountId || "", input)
        : await publishTikTok(connection.accessToken, input);

    const [updated] = await db.update(socialPublicationsTable).set({
      externalId: result.externalId,
      status: result.status,
      metadata: { ...(publication.metadata || {}), ...(result.metadata || {}) },
      publishedAt: result.status === "published" ? new Date() : publication.publishedAt,
      updatedAt: new Date(),
    }).where(and(eq(socialPublicationsTable.id, publication.id), eq(socialPublicationsTable.tenantId, tenantId))).returning();
    return updated;
  } catch (error) {
    logger.error({ error, tenantId, publicationId, provider }, "Falha ao publicar conteúdo em canal social nativo");
    await db.update(socialPublicationsTable).set({
      status: "failed",
      metadata: { ...(publication.metadata || {}), lastError: error instanceof Error ? error.message : String(error) },
      updatedAt: new Date(),
    }).where(and(eq(socialPublicationsTable.id, publication.id), eq(socialPublicationsTable.tenantId, tenantId)));
    throw error;
  }
}
