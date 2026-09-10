import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, vieItemsTable, vieSourcesTable } from "@workspace/db";

export type VieRssCollectResult = {
  sourceId: string;
  sourceCode: string;
  fetched: number;
  upserted: number;
  error?: string;
};

type ParsedRssItem = {
  externalId: string | null;
  title: string;
  url: string;
  excerpt: string | null;
  author: string | null;
  publishedAt: Date | null;
  categories: string[];
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function stripMarkup(value: string): string {
  return decodeXml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(block: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match?.[1] ? decodeXml(match[1]) : null;
}

function allTagValues(block: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  const values: string[] = [];
  for (const match of block.matchAll(regex)) {
    if (match[1]) values.push(stripMarkup(match[1]));
  }
  return [...new Set(values.filter(Boolean))];
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function fingerprint(item: ParsedRssItem): string {
  const base = item.url || item.externalId || `${item.title}|${item.publishedAt?.toISOString() ?? ""}`;
  return createHash("sha256").update(base).digest("hex");
}

export function parseRss(xml: string): ParsedRssItem[] {
  const blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1] ?? "");
  const items: ParsedRssItem[] = [];

  for (const block of blocks) {
    const title = stripMarkup(tagValue(block, "title") ?? "");
    const link = normalizeUrl(stripMarkup(tagValue(block, "link") ?? ""));
    if (!title || !link) continue;

    const description = tagValue(block, "description") ?? tagValue(block, "content:encoded");
    const author = tagValue(block, "dc:creator") ?? tagValue(block, "author");
    const externalId = tagValue(block, "guid");
    const publishedAt = parseDate(tagValue(block, "pubDate") ?? tagValue(block, "dc:date"));

    items.push({
      externalId: externalId ? stripMarkup(externalId) : null,
      title,
      url: link,
      excerpt: description ? stripMarkup(description).slice(0, 800) || null : null,
      author: author ? stripMarkup(author).slice(0, 255) || null : null,
      publishedAt,
      categories: allTagValues(block, "category").slice(0, 20),
    });
  }

  return items;
}

function mergedCategories(sourceCategories: string[] | null, itemCategories: string[]) {
  return [...new Set([...(sourceCategories ?? []), ...itemCategories].filter(Boolean))].slice(0, 20);
}

async function collectSource(source: typeof vieSourcesTable.$inferSelect): Promise<VieRssCollectResult> {
  const now = new Date();
  if (!source.endpointUrl) {
    return { sourceId: source.id, sourceCode: source.code, fetched: 0, upserted: 0, error: "Fonte sem endpoint" };
  }

  try {
    const response = await fetch(source.endpointUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
        "User-Agent": "VendorAI-VIE/1.0 (+https://appvendorai.com)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const parsed = parseRss(xml).slice(0, 100);
    let upserted = 0;

    for (const item of parsed) {
      const categories = mergedCategories(source.categories, item.categories);
      await db
        .insert(vieItemsTable)
        .values({
          sourceId: source.id,
          fingerprint: fingerprint(item),
          externalId: item.externalId,
          title: item.title,
          url: item.url,
          excerpt: item.excerpt,
          author: item.author,
          publishedAt: item.publishedAt,
          categories,
          rawMetadata: { sourceCode: source.code, sourceScope: source.scope, sourceDomain: source.domain },
          collectedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [vieItemsTable.sourceId, vieItemsTable.fingerprint],
          set: {
            externalId: item.externalId,
            title: item.title,
            url: item.url,
            excerpt: item.excerpt,
            author: item.author,
            publishedAt: item.publishedAt,
            categories,
            collectedAt: now,
            updatedAt: now,
          },
        });
      upserted += 1;
    }

    await db
      .update(vieSourcesTable)
      .set({ lastCheckedAt: now, lastSuccessAt: now, updatedAt: now })
      .where(eq(vieSourcesTable.id, source.id));

    return { sourceId: source.id, sourceCode: source.code, fetched: parsed.length, upserted };
  } catch (error) {
    await db
      .update(vieSourcesTable)
      .set({ lastCheckedAt: now, lastFailureAt: now, updatedAt: now })
      .where(eq(vieSourcesTable.id, source.id));

    return {
      sourceId: source.id,
      sourceCode: source.code,
      fetched: 0,
      upserted: 0,
      error: error instanceof Error ? error.message : "Falha desconhecida",
    };
  }
}

export async function collectActiveRssSources(sourceCode?: string): Promise<VieRssCollectResult[]> {
  const conditions = [eq(vieSourcesTable.active, true), eq(vieSourcesTable.sourceType, "rss")];
  if (sourceCode) conditions.push(eq(vieSourcesTable.code, sourceCode));

  const sources = await db
    .select()
    .from(vieSourcesTable)
    .where(and(...conditions));

  const results: VieRssCollectResult[] = [];
  for (const source of sources) results.push(await collectSource(source));
  return results;
}
