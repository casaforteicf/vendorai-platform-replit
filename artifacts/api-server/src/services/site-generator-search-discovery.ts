import { db, searchConsoleConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  getSearchConsoleConnectionByTenantId,
  refreshSearchConsoleToken,
} from "./search-console-oauth.js";

const SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3";

function normalizeSiteUrl(siteUrl: string): string {
  if (siteUrl.startsWith("sc-domain:")) return siteUrl;
  const url = new URL(siteUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function resubmitTenantSitemapAfterSitePublish(tenantId: string): Promise<boolean> {
  let connection = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!connection || connection.status !== "active" || !connection.verified || !connection.siteUrl) {
    return false;
  }

  const expiresSoon = !connection.accessToken
    || !connection.tokenExpiresAt
    || connection.tokenExpiresAt.getTime() <= Date.now() + 2 * 60_000;

  if (expiresSoon) {
    await refreshSearchConsoleToken(connection.id);
    connection = await getSearchConsoleConnectionByTenantId(tenantId);
  }

  if (!connection?.accessToken || !connection.siteUrl) return false;
  const siteUrl = normalizeSiteUrl(connection.siteUrl);
  if (!siteUrl.startsWith("http")) {
    // Domain properties cannot expose a canonical sitemap URL without choosing
    // a concrete scheme/host. Existing Search Console setup handles those.
    return false;
  }

  const sitemapUrl = `${siteUrl.replace(/\/$/, "")}/sitemap.xml`;
  const response = await fetch(
    `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${connection.accessToken}` },
    },
  );

  if (!response.ok) {
    logger.warn(
      { tenantId, siteUrl, sitemapUrl, status: response.status, body: await response.text() },
      "Site Generator: Search Console sitemap resubmission failed",
    );
    return false;
  }

  await db
    .update(searchConsoleConnectionsTable)
    .set({ sitemapSubmittedAt: new Date(), updatedAt: new Date() })
    .where(eq(searchConsoleConnectionsTable.id, connection.id));

  logger.info({ tenantId, siteUrl, sitemapUrl }, "Site Generator: sitemap resubmitted after publication");
  return true;
}
