import { Router, type IRouter, type Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { detectAiAssistant, normalizePageKey, percentDelta } from "../lib/ai-visibility.js";
import { getSearchConsoleInsights } from "../services/search-console-insights.js";
import { getVisitorIntelligence } from "../services/visitorIntelligence.js";

const router: IRouter = Router();
const PROVIDER = "bing_ai_performance";

type Snapshot = { id: string; imported_at: string | Date };
type PageMetric = { page_url: string; citations: number };
type QueryMetric = { grounding_query: string; citations: number };
type VisitorSession = Awaited<ReturnType<typeof getVisitorIntelligence>>["sessions"][number];

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

function canAccessTenant(req: Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

async function pagesForSnapshot(tenantId: string, importId: string): Promise<PageMetric[]> {
  const result = await db.execute(sql`
    SELECT page_url, sum(citations)::int AS citations
    FROM ai_visibility_citations
    WHERE tenant_id = ${tenantId} AND import_id = ${importId}
    GROUP BY page_url
    ORDER BY citations DESC, page_url ASC
    LIMIT 100
  `);
  return rowsOf<PageMetric>(result).map((row) => ({ ...row, citations: Number(row.citations ?? 0) }));
}

router.get("/tenants/:tenantId/ai-visibility/intelligence", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  try {
    const importsResult = await db.execute(sql`
      SELECT id, imported_at
      FROM ai_visibility_imports
      WHERE tenant_id = ${tenantId} AND provider = ${PROVIDER}
      ORDER BY imported_at DESC
      LIMIT 2
    `);
    const snapshots = rowsOf<Snapshot>(importsResult);
    const current = snapshots[0] ?? null;
    const previous = snapshots[1] ?? null;
    if (!current) {
      return res.json({ available: false, alerts: [], searchConsole: { available: false, matches: [] }, aiTraffic: { available: false, sessions: 0, conversions: 0, sources: [], pages: [] } });
    }

    const [currentPages, previousPages, newQueriesResult, searchConsole, visitorData] = await Promise.all([
      pagesForSnapshot(tenantId, current.id),
      previous ? pagesForSnapshot(tenantId, previous.id) : Promise.resolve([] as PageMetric[]),
      previous
        ? db.execute(sql`
            SELECT cur.grounding_query, sum(cur.citations)::int AS citations
            FROM ai_visibility_citations cur
            WHERE cur.tenant_id = ${tenantId}
              AND cur.import_id = ${current.id}
              AND cur.grounding_query IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM ai_visibility_citations prior
                WHERE prior.tenant_id = ${tenantId}
                  AND prior.import_id = ${previous.id}
                  AND prior.grounding_query = cur.grounding_query
              )
            GROUP BY cur.grounding_query
            ORDER BY citations DESC
            LIMIT 8
          `)
        : Promise.resolve([]),
      getSearchConsoleInsights(tenantId, 28).catch((error) => {
        logger.info({ tenantId, error: error instanceof Error ? error.message : String(error) }, "AI visibility: Search Console correlation unavailable");
        return null;
      }),
      getVisitorIntelligence(tenantId, { minutes: 28 * 24 * 60 }).catch((error) => {
        logger.warn({ tenantId, error }, "AI visibility: Visitor Intelligence unavailable");
        return null;
      }),
    ]);

    const previousByPage = new Map(previousPages.map((row) => [normalizePageKey(row.page_url), row]));
    const currentByPage = new Map(currentPages.map((row) => [normalizePageKey(row.page_url), row]));
    const currentTotal = currentPages.reduce((sum, row) => sum + row.citations, 0);
    const previousTotal = previousPages.reduce((sum, row) => sum + row.citations, 0);
    const totalDelta = previous ? percentDelta(currentTotal, previousTotal) : null;

    const pageChanges = currentPages
      .map((row) => {
        const prior = previousByPage.get(normalizePageKey(row.page_url));
        const priorCitations = prior?.citations ?? 0;
        return {
          pageUrl: row.page_url,
          citations: row.citations,
          previousCitations: priorCitations,
          deltaPct: previous ? percentDelta(row.citations, priorCitations) : null,
          status: !prior && previous ? "new" as const : "changed" as const,
        };
      })
      .concat(previousPages
        .filter((row) => !currentByPage.has(normalizePageKey(row.page_url)))
        .map((row) => ({ pageUrl: row.page_url, citations: 0, previousCitations: row.citations, deltaPct: -100, status: "lost" as const })))
      .sort((a, b) => Math.abs(Number(b.deltaPct ?? 0)) - Math.abs(Number(a.deltaPct ?? 0)))
      .slice(0, 20);

    const newQueries = rowsOf<QueryMetric>(newQueriesResult).map((row) => ({
      groundingQuery: row.grounding_query,
      citations: Number(row.citations ?? 0),
    }));

    const alerts: Array<{ type: "growth" | "drop" | "new_query" | "page_loss"; severity: "info" | "warning" | "high"; title: string; detail: string }> = [];
    if (totalDelta != null && totalDelta >= 15) {
      alerts.push({ type: "growth", severity: "info", title: "Citações em alta", detail: `O snapshot atual cresceu ${totalDelta}% em relação ao anterior.` });
    } else if (totalDelta != null && totalDelta <= -10) {
      alerts.push({ type: "drop", severity: totalDelta <= -25 ? "high" : "warning", title: "Queda de citações", detail: `O snapshot atual caiu ${Math.abs(totalDelta)}% em relação ao anterior.` });
    }
    const lostPage = pageChanges.find((change) => change.status === "lost" || Number(change.deltaPct ?? 0) <= -30);
    if (lostPage) {
      alerts.push({ type: "page_loss", severity: "warning", title: "Página perdeu presença em IA", detail: `${normalizePageKey(lostPage.pageUrl)} passou de ${lostPage.previousCitations} para ${lostPage.citations} citações.` });
    }
    if (newQueries[0]) {
      alerts.push({ type: "new_query", severity: "info", title: "Nova consulta detectada", detail: `“${newQueries[0].groundingQuery}” apareceu com ${newQueries[0].citations} citações.` });
    }

    const searchPages = searchConsole?.topPages ?? [];
    const searchByPath = new Map(searchPages.map((page) => [normalizePageKey(page.page), page]));
    const matches = currentPages
      .map((aiPage) => {
        const searchPage = searchByPath.get(normalizePageKey(aiPage.page_url));
        if (!searchPage) return null;
        return {
          pageUrl: aiPage.page_url,
          citations: aiPage.citations,
          clicks: Number(searchPage.clicks ?? 0),
          impressions: Number(searchPage.impressions ?? 0),
          ctr: Number(searchPage.ctr ?? 0),
          position: Number(searchPage.position ?? 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.citations - a.citations);

    const aiSessions: Array<{ session: VisitorSession; assistant: string }> = [];
    for (const session of visitorData?.sessions ?? []) {
      const assistant = detectAiAssistant(session);
      if (assistant) aiSessions.push({ session, assistant });
    }

    const sourceMap = new Map<string, { source: string; sessions: number; conversions: number }>();
    const pageMap = new Map<string, { page: string; sessions: number; conversions: number }>();
    for (const item of aiSessions) {
      const source = sourceMap.get(item.assistant) ?? { source: item.assistant, sessions: 0, conversions: 0 };
      source.sessions += 1;
      source.conversions += Number(item.session.conversions ?? 0);
      sourceMap.set(item.assistant, source);

      const path = normalizePageKey(item.session.currentPath ?? "/");
      const page = pageMap.get(path) ?? { page: path, sessions: 0, conversions: 0 };
      page.sessions += 1;
      page.conversions += Number(item.session.conversions ?? 0);
      pageMap.set(path, page);
    }

    return res.json({
      available: true,
      snapshot: { current: current.id, previous: previous?.id ?? null },
      alerts,
      pageChanges,
      newQueries,
      searchConsole: {
        available: Boolean(searchConsole),
        period: searchConsole?.period ?? null,
        matches,
        matchedPages: matches.length,
        citationsOnMatchedPages: matches.reduce((sum, row) => sum + row.citations, 0),
        impressionsOnMatchedPages: matches.reduce((sum, row) => sum + row.impressions, 0),
        clicksOnMatchedPages: matches.reduce((sum, row) => sum + row.clicks, 0),
      },
      aiTraffic: {
        available: Boolean(visitorData),
        sessions: aiSessions.length,
        conversions: aiSessions.reduce((sum, item) => sum + Number(item.session.conversions ?? 0), 0),
        identifiedLeads: aiSessions.filter((item) => Boolean(item.session.leadId)).length,
        sources: [...sourceMap.values()].sort((a, b) => b.sessions - a.sessions),
        pages: [...pageMap.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 10),
      },
    });
  } catch (err) {
    logger.error({ err, tenantId }, "AI visibility: intelligence correlation failed");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
