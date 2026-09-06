import { and, eq } from "drizzle-orm";
import { contentCalendarItemsTable, db, socialPublicationsTable } from "@workspace/db";
import { publishSocialPublication } from "./social-publication-publisher.js";
import { publishInstagramOrganicPublication } from "./instagram-organic-publication.js";
import { publishFacebookOrganicPublication } from "./facebook-organic-publication.js";

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
  const [publication] = await db.select({ provider: socialPublicationsTable.provider })
    .from(socialPublicationsTable)
    .where(and(
      eq(socialPublicationsTable.id, publicationId),
      eq(socialPublicationsTable.tenantId, tenantId),
    ))
    .limit(1);
  if (!publication) throw new Error("publication_not_found");

  const published = publication.provider === "instagram"
    ? await publishInstagramOrganicPublication(tenantId, publicationId)
    : publication.provider === "facebook"
      ? await publishFacebookOrganicPublication(tenantId, publicationId)
      : await publishSocialPublication(tenantId, publicationId);

  await markCalendarPublished(tenantId, published);
  return published;
}