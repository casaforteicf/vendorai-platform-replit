import { and, eq } from "drizzle-orm";
import { db, socialPublicationsTable } from "@workspace/db";
import { publishSocialPublication } from "./social-publication-publisher.js";
import { publishInstagramOrganicPublication } from "./instagram-organic-publication.js";
import { publishFacebookOrganicPublication } from "./facebook-organic-publication.js";

export async function publishAnySocialPublication(tenantId: string, publicationId: string) {
  const [publication] = await db.select({ provider: socialPublicationsTable.provider })
    .from(socialPublicationsTable)
    .where(and(
      eq(socialPublicationsTable.id, publicationId),
      eq(socialPublicationsTable.tenantId, tenantId),
    ))
    .limit(1);
  if (!publication) throw new Error("publication_not_found");
  if (publication.provider === "instagram") {
    return publishInstagramOrganicPublication(tenantId, publicationId);
  }
  if (publication.provider === "facebook") {
    return publishFacebookOrganicPublication(tenantId, publicationId);
  }
  return publishSocialPublication(tenantId, publicationId);
}
