import { getSearchConsoleConnectionByTenantId, refreshSearchConsoleToken } from "./search-console-oauth.js";
import { logger } from "../lib/logger.js";

const URL_INSPECTION_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const INDEXATION_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_URLS = 20;
const INSPECTION_BATCH_SIZE = 5;

const PLATFORM_PRIORITY_PATHS = [
  "/",
  "/solucoes",
  "/produtos/prospeccao",
  "/solucoes/crm-whatsapp",
  "/segmentos/distributors",
  "/blog/crm-integrado-com-whatsapp-o-que-e-e-como-funciona",
  "/segmentos/retail",
  "/solucoes/agentes-ia-vendas",
  "/produtos/marketing",
  "/blog",
  "/segmentos/industries",
  "/comparar/crm-com-ia-vs-crm-tradicional",
  "/produtos/crm",
  "/produtos",
  "/funcionalidades",
  "/produtos/agentes-ia",
  "/produtos/revenue-scout",
  "/segmentos/dealerships",
  "/solucoes/automatizar-follow-up",
  "/solucoes/revenue-intelligence",
] as const;

type SearchConsoleConnection = NonNullable<Awaited<ReturnType<typeof getSearchConsoleConnectionByTenantId>>>;

type IndexationStatus = "indexed" | "discovered" | "crawled" | "unknown" | "not_indexed" | "error";

type InspectionIndexStatus = {
  verdict?: string;
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  pageFetchState?: string;
  lastCrawlTime?: string;
};

type InspectionResponse = {
  inspectionResult?: {
    indexStatusResult?: InspectionIndexStatus;
  };
};

export type SearchIndexationUrl = {
  url: string;
  status: IndexationStatus;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
};

export type SearchIndexationSnapshot = {
  checkedAt: string;
  cached: boolean;
  total: number;
  indexed: number;
  discovered: number;
  crawled: number;
  unknown: number;
  other: number;
  urls: SearchIndexationUrl[];
};

type CachedSnapshot = {
  expiresAt: number;
  snapshot: SearchIndexationSnapshot;
};

const cache = new Map<string, CachedSnapshot>();

function normalizeSiteUrl(siteUrl: string) {
  if (siteUrl.startsWith("sc-domain:")) return siteUrl;
  const url = new URL(siteUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function classifyIndexStatus(indexStatus?: InspectionIndexStatus): IndexationStatus {
  if (!indexStatus) return "error";
  const verdict = (indexStatus.verdict ?? "").toUpperCase();
  const coverage = (indexStatus.coverageState ?? "").toLowerCase();

  if (verdict === "PASS") return "indexed";
  if (coverage.includes("currently not indexed") && coverage.includes("crawled")) return "crawled";
  if (coverage.includes("currently not indexed") && coverage.includes("discovered")) return "discovered";
  if (coverage.includes("unknown to google")) return "unknown";
  if (coverage.includes("indexed") && !coverage.includes("not indexed")) return "indexed";
  return "not_indexed";
}

function extractLocs(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  for (const match of xml.matchAll(re)) {
    const value = match[1]?.replace(/&amp;/g, "&").trim();
    if (value) urls.push(value);
  }
  return urls;
}

function isSameHost(candidate: string, siteUrl: string) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    try {
      const host = new URL(candidate).hostname.toLowerCase();
      return host === domain || host.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  }

  try {
    const siteHost = new URL(siteUrl).hostname.toLowerCase();
    return new URL(candidate).hostname.toLowerCase() === siteHost;
  } catch {
    return false;
  }
}

async function urlsFromSitemap(siteUrl: string): Promise<string[]> {
  if (!siteUrl.startsWith("http")) return [];
  const sitemapUrl = `${siteUrl.replace(/\/$/, "")}/sitemap.xml`;

  try {
    const response = await fetch(sitemapUrl, { headers: { "User-Agent": "VendorAI-SearchIndexation/1.0" } });
    if (!response.ok) return [];
    const xml = await response.text();
    const locs = extractLocs(xml);
    const childSitemaps = /<sitemapindex\b/i.test(xml) ? locs.slice(0, 5) : [];
    const pageUrls = /<urlset\b/i.test(xml) ? locs : [];

    for (const child of childSitemaps) {
      if (!isSameHost(child, siteUrl)) continue;
      try {
        const childResponse = await fetch(child, { headers: { "User-Agent": "VendorAI-SearchIndexation/1.0" } });
        if (!childResponse.ok) continue;
        pageUrls.push(...extractLocs(await childResponse.text()));
      } catch (error) {
        logger.warn({ error, child }, "Search Console indexation: falha ao ler sitemap filho");
      }
      if (pageUrls.length >= MAX_URLS) break;
    }

    return [...new Set(pageUrls.filter((url) => isSameHost(url, siteUrl)))].slice(0, MAX_URLS);
  } catch (error) {
    logger.warn({ error, sitemapUrl }, "Search Console indexation: falha ao ler sitemap");
    return [];
  }
}

async function resolveInspectionUrls(connection: SearchConsoleConnection): Promise<string[]> {
  const siteUrl = connection.siteUrl ? normalizeSiteUrl(connection.siteUrl) : "";
  if (!siteUrl) return [];

  if (siteUrl.startsWith("http")) {
    try {
      const host = new URL(siteUrl).hostname.replace(/^www\./i, "").toLowerCase();
      if (host === "appvendorai.com") {
        const origin = new URL(siteUrl).origin;
        return PLATFORM_PRIORITY_PATHS.map((pathname) => new URL(pathname, `${origin}/`).toString());
      }
    } catch {
      // Fallback to sitemap discovery below.
    }
  }

  return urlsFromSitemap(siteUrl);
}

async function ensureInspectionConnection(tenantId: string): Promise<SearchConsoleConnection> {
  let connection = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!connection || connection.status === "disconnected" || connection.disconnectedAt || !connection.verified || !connection.siteUrl) {
    throw new Error("SEARCH_CONSOLE_NOT_ACTIVE");
  }

  const expiresSoon = !connection.accessToken
    || !connection.tokenExpiresAt
    || connection.tokenExpiresAt.getTime() <= Date.now() + 2 * 60_000;

  if (expiresSoon) {
    await refreshSearchConsoleToken(connection.id);
    connection = await getSearchConsoleConnectionByTenantId(tenantId);
  }

  if (!connection?.accessToken || !connection.siteUrl) throw new Error("SEARCH_CONSOLE_TOKEN_UNAVAILABLE");
  return connection;
}

async function inspectOne(
  tenantId: string,
  connection: SearchConsoleConnection,
  inspectionUrl: string,
): Promise<SearchIndexationUrl> {
  const fallback: SearchIndexationUrl = {
    url: inspectionUrl,
    status: "error",
    verdict: null,
    coverageState: null,
    indexingState: null,
    robotsTxtState: null,
    pageFetchState: null,
    lastCrawlTime: null,
  };

  try {
    const response = await fetch(URL_INSPECTION_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inspectionUrl,
        siteUrl: normalizeSiteUrl(connection.siteUrl!),
        languageCode: "pt-BR",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn({ tenantId, inspectionUrl, status: response.status, body }, "Search Console indexation: inspeção falhou");
      return fallback;
    }

    const payload = await response.json() as InspectionResponse;
    const result = payload.inspectionResult?.indexStatusResult;
    return {
      url: inspectionUrl,
      status: classifyIndexStatus(result),
      verdict: result?.verdict ?? null,
      coverageState: result?.coverageState ?? null,
      indexingState: result?.indexingState ?? null,
      robotsTxtState: result?.robotsTxtState ?? null,
      pageFetchState: result?.pageFetchState ?? null,
      lastCrawlTime: result?.lastCrawlTime ?? null,
    };
  } catch (error) {
    logger.warn({ error, tenantId, inspectionUrl }, "Search Console indexation: erro ao inspecionar URL");
    return fallback;
  }
}

function summarize(urls: SearchIndexationUrl[], cached: boolean): SearchIndexationSnapshot {
  const count = (status: IndexationStatus) => urls.filter((item) => item.status === status).length;
  const indexed = count("indexed");
  const discovered = count("discovered");
  const crawled = count("crawled");
  const unknown = count("unknown");
  const other = urls.length - indexed - discovered - crawled - unknown;

  return {
    checkedAt: new Date().toISOString(),
    cached,
    total: urls.length,
    indexed,
    discovered,
    crawled,
    unknown,
    other,
    urls,
  };
}

export async function getSearchConsoleIndexation(tenantId: string): Promise<SearchIndexationSnapshot | null> {
  const connection = await ensureInspectionConnection(tenantId);
  const cacheKey = normalizeSiteUrl(connection.siteUrl!);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.snapshot, cached: true };
  }

  const inspectionUrls = await resolveInspectionUrls(connection);
  if (!inspectionUrls.length) return null;

  const results: SearchIndexationUrl[] = [];
  for (let offset = 0; offset < inspectionUrls.length; offset += INSPECTION_BATCH_SIZE) {
    const batch = inspectionUrls.slice(offset, offset + INSPECTION_BATCH_SIZE);
    results.push(...await Promise.all(batch.map((url) => inspectOne(tenantId, connection, url))));
  }

  const snapshot = summarize(results, false);
  cache.set(cacheKey, { expiresAt: Date.now() + INDEXATION_CACHE_TTL_MS, snapshot });
  return snapshot;
}
