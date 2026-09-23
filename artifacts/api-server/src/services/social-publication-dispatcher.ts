import { and, eq } from "drizzle-orm";
import {
  contentCalendarItemsTable,
  contentPublishedPostsTable,
  db,
  mediaProjectsTable,
  socialPublicationsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { publishSocialPublication } from "./social-publication-publisher.js";
import { publishInstagramOrganicPublication } from "./instagram-organic-publication.js";
import { publishFacebookOrganicPublication } from "./facebook-organic-publication.js";
import { fanOutYoutubeVideoToConnectedChannels } from "./youtube-cross-channel-fanout.js";
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function promptField(prompt: string, label: string): string {
  if (!prompt) return "";
  const match = prompt.match(new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]+)`, "i"));
  return match?.[1]?.trim() ?? "";
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

async function registerVideoStudioInstagramPerformance(
  tenantId: string,
  publication: typeof socialPublicationsTable.$inferSelect,
) {
  if (publication.provider !== "instagram" || publication.status !== "published" || !publication.externalId) return;
  const metadata = asRecord(publication.metadata);
  if (metadata.source !== "video-studio") return;

  const [existing] = await db.select({ id: contentPublishedPostsTable.id })
    .from(contentPublishedPostsTable)
    .where(and(
      eq(contentPublishedPostsTable.tenantId, tenantId),
      eq(contentPublishedPostsTable.instagramMediaId, publication.externalId),
    ))
    .limit(1);
  if (existing) return;

  const sourceProjectId = text(metadata.sourceProjectId);
  const sourceVersion = Math.max(1, Number(metadata.sourceVersion ?? 1) || 1);
  let title = `Vídeo Studio V${sourceVersion}`;
  let learningContext = publication.text ?? "";

  if (sourceProjectId) {
    const [project] = await db.select({
      title: mediaProjectsTable.title,
      context: mediaProjectsTable.context,
    }).from(mediaProjectsTable).where(and(
      eq(mediaProjectsTable.id, sourceProjectId),
      eq(mediaProjectsTable.tenantId, tenantId),
    )).limit(1);

    if (project) {
      const context = asRecord(project.context);
      const professional = asRecord(context.professionalCreation);
      const prompt = text(context.prompt);
      const profileId = text(professional.profileId);
      const script = text(professional.script);
      const objective = promptField(prompt, "OBJETIVO DO NEGÓCIO");
      const product = promptField(prompt, "PRODUTO/SERVIÇO");
      const audience = promptField(prompt, "PÚBLICO");
      const cta = promptField(prompt, "PRÓXIMA AÇÃO/OFERTA");
      const channel = promptField(prompt, "CANAL");

      title = [
        text(context.guidedVideoTitle) || project.title,
        profileId ? `perfil ${profileId}` : "",
        objective,
        product,
        channel,
      ].filter(Boolean).join(" · ").slice(0, 500);

      learningContext = [
        publication.text ?? "",
        audience ? `Público: ${audience}` : "",
        cta ? `CTA: ${cta}` : "",
        script ? `Roteiro: ${script}` : "",
      ].filter(Boolean).join(" | ").slice(0, 4000);
    }
  }

  await db.insert(contentPublishedPostsTable).values({
    tenantId,
    contentGenerationId: null,
    variationIndex: sourceVersion - 1,
    instagramMediaId: publication.externalId,
    contentType: publication.contentType || "reel",
    theme: title,
    captionOuTexto: learningContext || publication.text || null,
    publishedAt: publication.publishedAt ?? new Date(),
  });

  await db.update(socialPublicationsTable).set({
    metadata: {
      ...metadata,
      performanceLearningRegisteredAt: new Date().toISOString(),
    },
    updatedAt: new Date(),
  }).where(and(
    eq(socialPublicationsTable.id, publication.id),
    eq(socialPublicationsTable.tenantId, tenantId),
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

  if (publication.provider === "youtube" && ["video", "short"].includes(publication.contentType || "")) {
    await fanOutYoutubeVideoToConnectedChannels(tenantId, publication).catch((error) => {
      logger.warn({ error, tenantId, publicationId }, "YouTube será publicado, mas o fan-out para outros canais falhou");
    });
  }

  const published = publication.provider === "instagram"
    ? await publishInstagramOrganicPublication(tenantId, publicationId)
    : publication.provider === "facebook"
      ? await publishFacebookOrganicPublication(tenantId, publicationId)
      : await publishSocialPublication(tenantId, publicationId);

  await markCalendarPublished(tenantId, published);
  await registerVideoStudioInstagramPerformance(tenantId, published).catch((error) => {
    logger.warn(
      { error, tenantId, publicationId: published.id, externalId: published.externalId },
      "Video Studio: publicação concluída, mas o registro no aprendizado de performance falhou",
    );
  });
  return published;
}
