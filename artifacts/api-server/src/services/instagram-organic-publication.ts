import { and, eq, isNull } from "drizzle-orm";
import { db, instagramConnectionsTable, socialPublicationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { resolveWebsiteConnection } from "./websiteConnector.js";

const META_GRAPH_VERSION = "v26.0";

type InstagramPublicationInput = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  destinationUrl?: string | null;
  contentType?: "post" | "image" | "video" | "short" | "carousel" | "story" | "reel";
};

type InstagramConnection = typeof instagramConnectionsTable.$inferSelect;

class InstagramPublishError extends Error {}

function graphBase(connection: InstagramConnection) {
  return connection.pageId && connection.accountId && connection.pageId !== connection.accountId
    ? `https://graph.facebook.com/${META_GRAPH_VERSION}`
    : `https://graph.instagram.com/${META_GRAPH_VERSION}`;
}

function hasHttpUrl(text: string) {
  return /https?:\/\/\S+/i.test(text);
}

async function buildInstagramCaption(tenantId: string, input: InstagramPublicationInput) {
  const baseText = (input.text ?? "").trim();
  if (hasHttpUrl(baseText)) return baseText.slice(0, 2200) || null;

  let destinationUrl = (input.destinationUrl ?? "").trim();
  if (!destinationUrl) {
    try {
      const website = await resolveWebsiteConnection(tenantId);
      destinationUrl = website.siteUrl ?? "";
    } catch (error) {
      logger.warn({ error, tenantId }, "Não foi possível resolver o site oficial do tenant para o CTA do Instagram");
    }
  }

  if (!destinationUrl) return baseText.slice(0, 2200) || null;

  const cta = `Saiba mais: ${destinationUrl}`;
  const separator = baseText ? "\n\n" : "";
  return `${baseText}${separator}${cta}`.slice(0, 2200);
}

async function graphPost(base: string, path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params);
  const response = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const raw = await response.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!response.ok) throw new InstagramPublishError(`instagram_${path.replace(/\W+/g, "_")}_${response.status}: ${raw.slice(0, 500)}`);
  return data;
}

async function waitUntilReady(base: string, containerId: string, accessToken: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const url = new URL(`${base}/${containerId}`);
    url.searchParams.set("fields", "status_code,status");
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json() as { status_code?: string; status?: string };
      if (data.status_code === "FINISHED" || data.status === "FINISHED") return;
      if (data.status_code === "ERROR" || data.status === "ERROR") throw new InstagramPublishError("instagram_container_processing_failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}

async function createSingleContainer(
  connection: InstagramConnection,
  input: InstagramPublicationInput,
  mediaUrl: string,
  options?: { carouselChild?: boolean },
) {
  const accountId = connection.accountId;
  const accessToken = connection.pageAccessToken;
  if (!accountId || !accessToken) throw new InstagramPublishError("instagram_connection_incomplete");
  const base = graphBase(connection);
  const type = input.contentType || "post";
  const lower = mediaUrl.toLowerCase();
  const looksVideo = /\.(mp4|mov|webm)(?:\?|$)/.test(lower) || type === "video" || type === "short" || type === "reel";
  const params: Record<string, string> = { access_token: accessToken };
  if (looksVideo) params.video_url = mediaUrl;
  else params.image_url = mediaUrl;
  if (options?.carouselChild) params.is_carousel_item = "true";
  if (!options?.carouselChild && input.text) params.caption = input.text;
  if (!options?.carouselChild && type === "story") params.media_type = "STORIES";
  if (!options?.carouselChild && (type === "reel" || type === "short")) params.media_type = "REELS";
  const created = await graphPost(base, `${accountId}/media`, params);
  const containerId = created?.id as string | undefined;
  if (!containerId) throw new InstagramPublishError("instagram_container_missing_id");
  if (looksVideo) await waitUntilReady(base, containerId, accessToken);
  return containerId;
}

async function createCarouselContainer(connection: InstagramConnection, input: InstagramPublicationInput, mediaUrls: string[]) {
  const accountId = connection.accountId;
  const accessToken = connection.pageAccessToken;
  if (!accountId || !accessToken) throw new InstagramPublishError("instagram_connection_incomplete");
  const base = graphBase(connection);
  const children: string[] = [];
  for (const mediaUrl of mediaUrls.slice(0, 10)) {
    children.push(await createSingleContainer(connection, { ...input, contentType: "image" }, mediaUrl, { carouselChild: true }));
  }
  if (children.length < 2) throw new InstagramPublishError("instagram_carousel_requires_two_items");
  const created = await graphPost(base, `${accountId}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: input.text || "",
    access_token: accessToken,
  });
  const containerId = created?.id as string | undefined;
  if (!containerId) throw new InstagramPublishError("instagram_carousel_missing_id");
  return containerId;
}

async function publishContainer(connection: InstagramConnection, containerId: string) {
  const accountId = connection.accountId;
  const accessToken = connection.pageAccessToken;
  if (!accountId || !accessToken) throw new InstagramPublishError("instagram_connection_incomplete");
  const data = await graphPost(graphBase(connection), `${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  const externalId = data?.id as string | undefined;
  if (!externalId) throw new InstagramPublishError("instagram_publish_missing_id");
  return externalId;
}

export async function createInstagramOrganicPublication(tenantId: string, input: InstagramPublicationInput) {
  const [connection] = await db.select().from(instagramConnectionsTable).where(and(
    eq(instagramConnectionsTable.tenantId, tenantId),
    isNull(instagramConnectionsTable.disconnectedAt),
  )).limit(1);
  if (!connection?.accountId || !connection.pageAccessToken) throw new Error("connection_not_found");

  const mediaUrls = (input.mediaUrls ?? []).filter(Boolean);
  const primary = input.mediaUrl || mediaUrls[0];
  if (!primary && !input.text) throw new Error("text_or_media_required");

  const caption = await buildInstagramCaption(tenantId, input);
  const [created] = await db.insert(socialPublicationsTable).values({
    tenantId,
    provider: "instagram",
    connectionId: null,
    text: caption ?? undefined,
    mediaUrl: primary,
    contentType: input.contentType || (mediaUrls.length > 1 ? "carousel" : "post"),
    status: "queued",
    metadata: {
      mediaUrls,
      instagramConnectionId: connection.id,
      destinationUrl: input.destinationUrl ?? null,
      conversionLinkApplied: Boolean(caption && !hasHttpUrl(input.text ?? "") && hasHttpUrl(caption)),
    },
  }).returning();
  return created;
}

export async function publishInstagramOrganicPublication(tenantId: string, publicationId: string) {
  const [publication] = await db.select().from(socialPublicationsTable).where(and(
    eq(socialPublicationsTable.id, publicationId),
    eq(socialPublicationsTable.tenantId, tenantId),
    eq(socialPublicationsTable.provider, "instagram"),
  )).limit(1);
  if (!publication) throw new InstagramPublishError("publication_not_found");
  if (publication.externalId && publication.status === "published") return publication;

  const [connection] = await db.select().from(instagramConnectionsTable).where(and(
    eq(instagramConnectionsTable.tenantId, tenantId),
    isNull(instagramConnectionsTable.disconnectedAt),
  )).limit(1);
  if (!connection?.accountId || !connection.pageAccessToken) throw new InstagramPublishError("connection_not_found");

  await db.update(socialPublicationsTable).set({ status: "publishing", updatedAt: new Date() })
    .where(eq(socialPublicationsTable.id, publication.id));

  try {
    const metadata = (publication.metadata || {}) as Record<string, unknown>;
    const mediaUrls = Array.isArray(metadata.mediaUrls)
      ? metadata.mediaUrls.filter((value): value is string => typeof value === "string" && Boolean(value))
      : [];
    if (publication.mediaUrl && !mediaUrls.includes(publication.mediaUrl)) mediaUrls.unshift(publication.mediaUrl);
    if (mediaUrls.length === 0) throw new InstagramPublishError("instagram_media_required");

    const input: InstagramPublicationInput = {
      text: publication.text || undefined,
      mediaUrl: publication.mediaUrl || undefined,
      mediaUrls,
      destinationUrl: typeof metadata.destinationUrl === "string" ? metadata.destinationUrl : null,
      contentType: publication.contentType as InstagramPublicationInput["contentType"],
    };
    input.text = (await buildInstagramCaption(tenantId, input)) ?? undefined;

    const containerId = publication.contentType === "carousel" || mediaUrls.length > 1
      ? await createCarouselContainer(connection, input, mediaUrls)
      : await createSingleContainer(connection, input, mediaUrls[0]);
    const externalId = await publishContainer(connection, containerId);

    const [updated] = await db.update(socialPublicationsTable).set({
      externalId,
      text: input.text,
      status: "published",
      publishedAt: new Date(),
      metadata: { ...metadata, mediaUrls, containerId, conversionLinkVerified: Boolean(input.text && hasHttpUrl(input.text)) },
      updatedAt: new Date(),
    }).where(eq(socialPublicationsTable.id, publication.id)).returning();
    return updated;
  } catch (error) {
    logger.error({ error, tenantId, publicationId }, "Falha ao publicar conteúdo orgânico no Instagram");
    await db.update(socialPublicationsTable).set({
      status: "failed",
      metadata: { ...(publication.metadata || {}), lastError: error instanceof Error ? error.message : String(error) },
      updatedAt: new Date(),
    }).where(eq(socialPublicationsTable.id, publication.id));
    throw error;
  }
}
