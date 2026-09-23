import { and, desc, eq } from "drizzle-orm";
import { db, socialPublicationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { resolveValidSocialConnection } from "./social-token-runtime.js";

type YouTubeMetricMap = Record<string, number>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function youtubeJson(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`youtube_api_${response.status}: ${raw.slice(0, 500)}`);
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : {};
}

export async function refreshYouTubePublicationMetrics(tenantId: string, publicationId: string) {
  const [publication] = await db.select().from(socialPublicationsTable).where(and(
    eq(socialPublicationsTable.id, publicationId),
    eq(socialPublicationsTable.tenantId, tenantId),
    eq(socialPublicationsTable.provider, "youtube"),
  )).limit(1);

  if (!publication) throw new Error("publication_not_found");
  if (!publication.externalId) throw new Error("youtube_video_id_missing");
  if (!publication.connectionId) throw new Error("connection_not_found");

  const connection = await resolveValidSocialConnection(tenantId, "youtube", publication.connectionId);
  const videoId = publication.externalId;
  const video = await youtubeJson(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet,status&id=${encodeURIComponent(videoId)}`,
    connection.accessToken,
  );
  const item = video.items?.[0];
  if (!item) throw new Error("youtube_video_not_found");

  const statistics = item.statistics || {};
  const metrics: YouTubeMetricMap = {
    views: numeric(statistics.viewCount),
    likes: numeric(statistics.likeCount),
    comments: numeric(statistics.commentCount),
    favorites: numeric(statistics.favoriteCount),
  };

  const startDate = dateOnly(publication.publishedAt || publication.createdAt || new Date());
  const endDate = dateOnly(new Date());
  try {
    const analytics = await youtubeJson(
      "https://youtubeanalytics.googleapis.com/v2/reports?" + new URLSearchParams({
        ids: "channel==MINE",
        startDate,
        endDate,
        metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,subscribersGained,subscribersLost",
        filters: `video==${videoId}`,
      }).toString(),
      connection.accessToken,
    );
    const columns = (analytics.columnHeaders || []).map((header: any) => String(header.name));
    const row = analytics.rows?.[0] || [];
    columns.forEach((name: string, index: number) => {
      metrics[name] = numeric(row[index]);
    });
  } catch (error) {
    logger.info({ error, tenantId, publicationId }, "YouTube Analytics detalhado indisponível; métricas básicas foram mantidas");
  }

  const metadata = asRecord(publication.metadata);
  const [updated] = await db.update(socialPublicationsTable).set({
    metrics,
    metadata: {
      ...metadata,
      youtube: {
        ...asRecord(metadata.youtube),
        channelId: connection.externalAccountId || null,
        videoTitle: item.snippet?.title || null,
        privacyStatus: item.status?.privacyStatus || null,
        duration: item.contentDetails?.duration || null,
      },
      metricsSyncedAt: new Date().toISOString(),
    },
    updatedAt: new Date(),
  }).where(and(
    eq(socialPublicationsTable.id, publicationId),
    eq(socialPublicationsTable.tenantId, tenantId),
  )).returning();

  return updated;
}

export async function syncYouTubePublicationComments(tenantId: string, publicationId: string) {
  const [publication] = await db.select().from(socialPublicationsTable).where(and(
    eq(socialPublicationsTable.id, publicationId),
    eq(socialPublicationsTable.tenantId, tenantId),
    eq(socialPublicationsTable.provider, "youtube"),
  )).limit(1);
  if (!publication) throw new Error("publication_not_found");
  if (!publication.externalId) throw new Error("youtube_video_id_missing");
  if (!publication.connectionId) throw new Error("connection_not_found");

  const connection = await resolveValidSocialConnection(tenantId, "youtube", publication.connectionId);
  const response = await youtubeJson(
    `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${encodeURIComponent(publication.externalId)}&maxResults=100&order=time&textFormat=plainText`,
    connection.accessToken,
  );

  const comments = (response.items || []).map((thread: any) => {
    const top = thread.snippet?.topLevelComment;
    const snippet = top?.snippet || {};
    const text = String(snippet.textDisplay || snippet.textOriginal || "");
    const normalized = text.toLowerCase();
    const intent = /preço|valor|comprar|contratar|orçamento|orcamento|demo|demonstração|demonstracao|contato|whatsapp|como contratar|quero/.test(normalized)
      ? "commercial"
      : /erro|problema|bug|não funciona|nao funciona|ajuda|suporte/.test(normalized)
        ? "support"
        : /parabéns|parabens|ótimo|otimo|excelente|gostei|top/.test(normalized)
          ? "praise"
          : "general";
    return {
      id: top?.id || thread.id,
      threadId: thread.id,
      authorChannelId: snippet.authorChannelId?.value || null,
      authorDisplayName: snippet.authorDisplayName || null,
      text,
      likeCount: numeric(snippet.likeCount),
      publishedAt: snippet.publishedAt || null,
      updatedAt: snippet.updatedAt || null,
      totalReplyCount: numeric(thread.snippet?.totalReplyCount),
      intent,
    };
  });

  const metadata = asRecord(publication.metadata);
  const [updated] = await db.update(socialPublicationsTable).set({
    metadata: {
      ...metadata,
      youtubeComments: comments,
      youtubeCommentsSyncedAt: new Date().toISOString(),
      youtubeCommercialIntentCount: comments.filter((item: any) => item.intent === "commercial").length,
      youtubeSupportIntentCount: comments.filter((item: any) => item.intent === "support").length,
    },
    updatedAt: new Date(),
  }).where(and(
    eq(socialPublicationsTable.id, publicationId),
    eq(socialPublicationsTable.tenantId, tenantId),
  )).returning();

  return { publication: updated, comments };
}

export async function refreshRecentYouTubeAutomation(limit = 25) {
  const publications = await db.select().from(socialPublicationsTable)
    .where(and(
      eq(socialPublicationsTable.provider, "youtube"),
      eq(socialPublicationsTable.status, "published"),
    ))
    .orderBy(desc(socialPublicationsTable.publishedAt))
    .limit(limit);

  let refreshed = 0;
  let commentsSynced = 0;
  for (const publication of publications) {
    if (!publication.externalId) continue;
    try {
      await refreshYouTubePublicationMetrics(publication.tenantId, publication.id);
      refreshed += 1;
    } catch (error) {
      logger.warn({ error, tenantId: publication.tenantId, publicationId: publication.id }, "Falha ao atualizar métricas do YouTube");
    }
    try {
      await syncYouTubePublicationComments(publication.tenantId, publication.id);
      commentsSynced += 1;
    } catch (error) {
      logger.warn({ error, tenantId: publication.tenantId, publicationId: publication.id }, "Falha ao sincronizar comentários do YouTube");
    }
  }
  return { refreshed, commentsSynced };
}
