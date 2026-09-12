import { and, eq } from "drizzle-orm";
import { contentCalendarItemsTable, db, socialPublicationsTable } from "@workspace/db";
import { publishSocialPublication } from "./social-publication-publisher.js";
import { publishInstagramOrganicPublication } from "./instagram-organic-publication.js";
import { publishFacebookOrganicPublication } from "./facebook-organic-publication.js";
import {
  assertMediaPublishReady,
  CreativeQualityGateBlockedError,
} from "./media-publish-quality-gate.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function publicationMediaRefs(publication: typeof socialPublicationsTable.$inferSelect) {
  const metadata = asRecord(publication.metadata);
  const mediaUrls = asStringArray(metadata.mediaUrls);
  if (publication.mediaUrl && !mediaUrls.includes(publication.mediaUrl)) mediaUrls.unshift(publication.mediaUrl);

  const mediaAssetIds = Array.from(new Set([
    ...asStringArray(metadata.mediaAssetIds),
    ...asStringArray(metadata.assetIds),
    typeof metadata.mediaAssetId === "string" ? metadata.mediaAssetId : "",
    typeof metadata.assetId === "string" ? metadata.assetId : "",
    typeof metadata.videoAssetId === "string" ? metadata.videoAssetId : "",
  ].filter(Boolean)));

  return { mediaUrls, mediaAssetIds, metadata };
}

async function markCalendarPublished(tenantId: string, publication: typeof socialPublicationsTable.$inferSelect) {
  if (publication.status !== "published") return;
  const metadata = (publication.metadata || {}) as Record<string, unknown>;
  const calendarItemId = typeof metadata.calendarItemId === "string" ? metadata.calendarItemId : null;
  if (!calendarItemId) return;

  await db.update(contentCalendarItemsTable).set({
    status: "publicado",
    contentIdPublicado: publication.externalId || publication.id,
    updatedAt: new Date(),
  }).where(and(
    eq(contentCalendarItemsTable.id, calendarItemId),
    eq(contentCalendarItemsTable.tenantId, tenantId),
  ));
}

export async function publishAnySocialPublication(tenantId: string, publicationId: string) {
  const [publication] = await db.select()
    .from(socialPublicationsTable)
    .where(and(
      eq(socialPublicationsTable.id, publicationId),
      eq(socialPublicationsTable.tenantId, tenantId),
    ))
    .limit(1);
  if (!publication) throw new Error("publication_not_found");

  const { mediaUrls, mediaAssetIds, metadata } = publicationMediaRefs(publication);
  try {
    const readiness = await assertMediaPublishReady({ tenantId, mediaUrls, mediaAssetIds });
    if (readiness.matchedAssetIds.length > 0) {
      await db.update(socialPublicationsTable).set({
        metadata: {
          ...metadata,
          creativeQualityCheckedAt: readiness.checkedAt,
          creativeQualityAssetIds: readiness.matchedAssetIds,
          creativeQualityApprovedAssetIds: readiness.approvedAssetIds,
        },
        updatedAt: new Date(),
      }).where(and(
        eq(socialPublicationsTable.id, publication.id),
        eq(socialPublicationsTable.tenantId, tenantId),
      ));
    }
  } catch (error) {
    if (error instanceof CreativeQualityGateBlockedError) {
      const blockedAt = new Date().toISOString();
      await db.update(socialPublicationsTable).set({
        status: "failed",
        metadata: {
          ...metadata,
          lastError: error.code,
          creativeQualityBlockedAt: blockedAt,
          creativeQualityBlockedAssets: error.blockedAssets,
          publishReady: false,
        },
        updatedAt: new Date(),
      }).where(and(
        eq(socialPublicationsTable.id, publication.id),
        eq(socialPublicationsTable.tenantId, tenantId),
      ));
    }
    throw error;
  }

  const published = publication.provider === "instagram"
    ? await publishInstagramOrganicPublication(tenantId, publicationId)
    : publication.provider === "facebook"
      ? await publishFacebookOrganicPublication(tenantId, publicationId)
      : await publishSocialPublication(tenantId, publicationId);

  await markCalendarPublished(tenantId, published);
  return published;
}
