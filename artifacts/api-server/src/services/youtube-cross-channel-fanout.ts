import { and, eq, sql } from "drizzle-orm";
import { db, socialPublicationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { createInstagramOrganicPublication } from "./instagram-organic-publication.js";
import { createFacebookOrganicPublication } from "./facebook-organic-publication.js";
import { createSocialPublication, type SocialProvider } from "./social-platforms.js";

type FanoutProvider = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cloneMetadata(source: typeof socialPublicationsTable.$inferSelect, groupId: string) {
  const metadata = asRecord(source.metadata);
  const {
    calendarItemId: _calendarItemId,
    contentIdPublicado: _contentIdPublicado,
    ...rest
  } = metadata;
  return {
    ...rest,
    sourcePublicationId: source.id,
    sourceProvider: source.provider,
    crossPostGroupId: groupId,
    crossChannelFanout: false,
    source: metadata.source || "universal-video-cross-channel",
  };
}

async function alreadyQueued(
  tenantId: string,
  sourcePublicationId: string,
  provider: FanoutProvider,
) {
  const [existing] = await db.select({ id: socialPublicationsTable.id })
    .from(socialPublicationsTable)
    .where(and(
      eq(socialPublicationsTable.tenantId, tenantId),
      eq(socialPublicationsTable.provider, provider),
      sql`${socialPublicationsTable.metadata}->>'sourcePublicationId' = ${sourcePublicationId}`,
    ))
    .limit(1);
  return existing ?? null;
}

function isVideoPublication(publication: typeof socialPublicationsTable.$inferSelect) {
  return ["video", "short", "reel"].includes(publication.contentType || "");
}

export async function fanOutVideoToConnectedChannels(
  tenantId: string,
  sourcePublication: typeof socialPublicationsTable.$inferSelect,
) {
  if (!sourcePublication.mediaUrl) return { queued: [], skipped: [{ provider: "all", reason: "media_required" }] };
  if (!isVideoPublication(sourcePublication)) return { queued: [], skipped: [] };

  const metadata = asRecord(sourcePublication.metadata);
  if (metadata.crossChannelFanout === false) return { queued: [], skipped: [] };

  const sourceProvider = sourcePublication.provider as FanoutProvider;
  const groupId = typeof metadata.crossPostGroupId === "string" && metadata.crossPostGroupId
    ? metadata.crossPostGroupId
    : `${sourceProvider}:${sourcePublication.id}`;
  const sharedMetadata = cloneMetadata(sourcePublication, groupId);
  const text = sourcePublication.text || "";
  const mediaUrl = sourcePublication.mediaUrl;
  const isShort = sourcePublication.contentType === "short" || sourcePublication.contentType === "reel";
  const providers: FanoutProvider[] = ["instagram", "facebook", "linkedin", "tiktok", "youtube"];
  const queued: Array<{ provider: FanoutProvider; publicationId: string }> = [];
  const skipped: Array<{ provider: string; reason: string }> = [];

  for (const provider of providers) {
    if (provider === sourceProvider) continue;

    try {
      const existing = await alreadyQueued(tenantId, sourcePublication.id, provider);
      if (existing) {
        skipped.push({ provider, reason: "already_queued" });
        continue;
      }

      let publication;
      if (provider === "instagram") {
        publication = await createInstagramOrganicPublication(tenantId, {
          text,
          mediaUrl,
          contentType: "reel",
        });
      } else if (provider === "facebook") {
        publication = await createFacebookOrganicPublication(tenantId, {
          text,
          mediaUrl,
          contentType: "reel",
          mediaKind: "video",
        });
      } else {
        publication = await createSocialPublication(
          tenantId,
          provider as SocialProvider,
          {
            text,
            mediaUrl,
            contentType: isShort ? "short" : "video",
            metadata: sharedMetadata,
          },
        );
      }

      await db.update(socialPublicationsTable).set({
        metadata: {
          ...asRecord(publication.metadata),
          ...sharedMetadata,
          targetProvider: provider,
        },
        updatedAt: new Date(),
      }).where(and(
        eq(socialPublicationsTable.id, publication.id),
        eq(socialPublicationsTable.tenantId, tenantId),
      ));

      queued.push({ provider, publicationId: publication.id });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      skipped.push({ provider, reason });
      logger.info(
        { tenantId, sourcePublicationId: sourcePublication.id, sourceProvider, provider, reason },
        "Cross-post de vídeo ignorou canal indisponível",
      );
    }
  }

  await db.update(socialPublicationsTable).set({
    metadata: {
      ...metadata,
      crossPostGroupId: groupId,
      crossChannelFanoutQueuedAt: new Date().toISOString(),
      crossChannelQueuedProviders: queued.map((item) => item.provider),
      crossChannelSkippedProviders: skipped,
    },
    updatedAt: new Date(),
  }).where(and(
    eq(socialPublicationsTable.id, sourcePublication.id),
    eq(socialPublicationsTable.tenantId, tenantId),
  ));

  return { queued, skipped, groupId };
}

export const fanOutYoutubeVideoToConnectedChannels = fanOutVideoToConnectedChannels;
