import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const PROVIDER = "bing_ai_performance";
const MAX_ROWS = 5000;

type AiVisibilityRow = {
  pageUrl: string;
  groundingQuery: string | null;
  topic: string | null;
  intent: string | null;
  citations: number;
  citationShare: number | null;
  periodStart: string | null;
  periodEnd: string | null;
};

type ImportRow = {
  id: string;
  file_name: string | null;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  imported_at: string | Date;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

function canAccessTenant(req: Request, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function cleanText(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanDate(value: unknown): string | null {
  const text = cleanText(value, 20);
  if (!text) return null;
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function cleanNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s/g, "").replace(/%$/, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRow(input: unknown): AiVisibilityRow | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const pageUrl = cleanText(row.pageUrl ?? row.page_url ?? row.url, 4000);
  if (!pageUrl) return null;

  return {
    pageUrl,
    groundingQuery: cleanText(row.groundingQuery ?? row.grounding_query ?? row.query, 2000),
    topic: cleanText(row.topic, 500),
    intent: cleanText(row.intent, 500),
    citations: Math.max(0, Math.round(cleanNumber(row.citations ?? row.totalCitations ?? row.total_citations, 0))),
    citationShare: row.citationShare == null && row.citation_share == null
      ? null
      : Math.max(0, cleanNumber(row.citationShare ?? row.citation_share, 0)),
    periodStart: cleanDate(row.periodStart ?? row.period_start),
    periodEnd: cleanDate(row.periodEnd ?? row.period_end),
  };
}

function stableChecksum(rows: AiVisibilityRow[]): string {
  const stable = [...rows].sort((a, b) => {
    const ka = `${a.pageUrl}|${a.groundingQuery ?? ""}|${a.topic ?? ""}|${a.intent ?? ""}|${a.citations}|${a.citationShare ?? ""}`;
    const kb = `${b.pageUrl}|${b.groundingQuery ?? ""}|${b.topic ?? ""}|${b.intent ?? ""}|${b.citations}|${b.citationShare ?? ""}`;
    return ka.localeCompare(kb);
  });
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

router.get("/tenants/:tenantId/ai-visibility/imports", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db.execute(sql`
      SELECT id, provider, file_name, period_start, period_end, row_count, imported_at
      FROM ai_visibility_imports
      WHERE tenant_id = ${tenantId}
      ORDER BY imported_at DESC
      LIMIT 20
    `);
    return res.json({ imports: rowsOf(result) });
  } catch (err) {
    logger.error({ err, tenantId }, "AI visibility: failed to list imports");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.get("/tenants/:tenantId/ai-visibility/summary", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const importsResult = await db.execute(sql`
      SELECT id, file_name, period_start, period_end, row_count, imported_at
      FROM ai_visibility_imports
      WHERE tenant_id = ${tenantId} AND provider = ${PROVIDER}
      ORDER BY imported_at DESC
      LIMIT 2
    `);
    const imports = rowsOf<ImportRow>(importsResult);
    const current = imports[0] ?? null;
    const previous = imports[1] ?? null;
    if (!current) {
      return res.json({
        provider: PROVIDER,
        empty: true,
        metrics: { totalCitations: 0, citedPages: 0, averagePerPage: 0, citationShare: null, citationsDeltaPct: null },
        topPages: [], topQueries: [], topics: [], intents: [], currentImport: null,
      });
    }

    const [metricsResult, pagesResult, queriesResult, topicsResult, intentsResult, previousResult] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(sum(citations), 0)::int AS total_citations,
               count(DISTINCT page_url)::int AS cited_pages,
               COALESCE(round(sum(citations)::numeric / NULLIF(count(DISTINCT page_url), 0), 2), 0) AS average_per_page,
               round(avg(citation_share) FILTER (WHERE citation_share IS NOT NULL), 2) AS citation_share
        FROM ai_visibility_citations
        WHERE tenant_id = ${tenantId} AND import_id = ${current.id}
      `),
      db.execute(sql`
        SELECT page_url, sum(citations)::int AS citations,
               round(avg(citation_share) FILTER (WHERE citation_share IS NOT NULL), 2) AS citation_share,
               count(DISTINCT grounding_query) FILTER (WHERE grounding_query IS NOT NULL)::int AS query_count
        FROM ai_visibility_citations
        WHERE tenant_id = ${tenantId} AND import_id = ${current.id}
        GROUP BY page_url
        ORDER BY citations DESC, page_url ASC
        LIMIT 20
      `),
      db.execute(sql`
        SELECT grounding_query, sum(citations)::int AS citations,
               count(DISTINCT page_url)::int AS page_count
        FROM ai_visibility_citations
        WHERE tenant_id = ${tenantId} AND import_id = ${current.id} AND grounding_query IS NOT NULL
        GROUP BY grounding_query
        ORDER BY citations DESC, grounding_query ASC
        LIMIT 15
      `),
      db.execute(sql`
        SELECT topic, sum(citations)::int AS citations
        FROM ai_visibility_citations
        WHERE tenant_id = ${tenantId} AND import_id = ${current.id} AND topic IS NOT NULL
        GROUP BY topic ORDER BY citations DESC, topic ASC LIMIT 12
      `),
      db.execute(sql`
        SELECT intent, sum(citations)::int AS citations
        FROM ai_visibility_citations
        WHERE tenant_id = ${tenantId} AND import_id = ${current.id} AND intent IS NOT NULL
        GROUP BY intent ORDER BY citations DESC, intent ASC LIMIT 12
      `),
      previous
        ? db.execute(sql`SELECT COALESCE(sum(citations), 0)::int AS total_citations FROM ai_visibility_citations WHERE tenant_id = ${tenantId} AND import_id = ${previous.id}`)
        : Promise.resolve([]),
    ]);

    const metric = rowsOf<Record<string, unknown>>(metricsResult)[0] ?? {};
    const previousMetric = rowsOf<Record<string, unknown>>(previousResult)[0] ?? {};
    const totalCitations = Number(metric.total_citations ?? 0);
    const previousTotal = Number(previousMetric.total_citations ?? 0);

    return res.json({
      provider: PROVIDER,
      empty: false,
      metrics: {
        totalCitations,
        citedPages: Number(metric.cited_pages ?? 0),
        averagePerPage: Number(metric.average_per_page ?? 0),
        citationShare: metric.citation_share == null ? null : Number(metric.citation_share),
        citationsDeltaPct: previous ? pctDelta(totalCitations, previousTotal) : null,
      },
      topPages: rowsOf(pagesResult),
      topQueries: rowsOf(queriesResult),
      topics: rowsOf(topicsResult),
      intents: rowsOf(intentsResult),
      currentImport: current,
      previousImport: previous,
    });
  } catch (err) {
    logger.error({ err, tenantId }, "AI visibility: failed to build summary");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/ai-visibility/import", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const body = req.body as { fileName?: unknown; rows?: unknown; periodStart?: unknown; periodEnd?: unknown };
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return res.status(400).json({ error: "AI_VISIBILITY_ROWS_REQUIRED" });
    }
    if (body.rows.length > MAX_ROWS) {
      return res.status(413).json({ error: "AI_VISIBILITY_TOO_MANY_ROWS", maxRows: MAX_ROWS });
    }

    const normalized = body.rows.map(normalizeRow).filter((row): row is AiVisibilityRow => row !== null);
    if (!normalized.length) {
      return res.status(400).json({ error: "AI_VISIBILITY_NO_VALID_ROWS" });
    }

    const checksum = stableChecksum(normalized);
    const duplicateResult = await db.execute(sql`
      SELECT id, imported_at FROM ai_visibility_imports
      WHERE tenant_id = ${tenantId} AND provider = ${PROVIDER} AND checksum = ${checksum}
      LIMIT 1
    `);
    const duplicate = rowsOf<{ id: string; imported_at: string }>(duplicateResult)[0];
    if (duplicate) {
      return res.json({ success: true, duplicate: true, importId: duplicate.id, importedAt: duplicate.imported_at });
    }

    const importId = randomUUID();
    const fileName = cleanText(body.fileName, 500);
    const periodStart = cleanDate(body.periodStart) ?? normalized.map((r) => r.periodStart).filter(Boolean).sort()[0] ?? null;
    const periodEndCandidates = normalized.map((r) => r.periodEnd).filter((value): value is string => Boolean(value)).sort();
    const periodEnd = cleanDate(body.periodEnd) ?? periodEndCandidates.at(-1) ?? null;
    const importedBy = req.user?.sub ?? req.user?.id ?? null;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO ai_visibility_imports
          (id, tenant_id, provider, file_name, checksum, period_start, period_end, row_count, imported_by)
        VALUES
          (${importId}, ${tenantId}, ${PROVIDER}, ${fileName}, ${checksum}, ${periodStart}, ${periodEnd}, ${normalized.length}, ${importedBy})
      `);

      for (let index = 0; index < normalized.length; index += 250) {
        const chunk = normalized.slice(index, index + 250);
        const values = chunk.map((row) => sql`(
          ${randomUUID()}, ${tenantId}, ${importId}, ${PROVIDER}, ${row.pageUrl}, ${row.groundingQuery},
          ${row.topic}, ${row.intent}, ${row.citations}, ${row.citationShare}, ${row.periodStart}, ${row.periodEnd}
        )`);
        await tx.execute(sql`
          INSERT INTO ai_visibility_citations
            (id, tenant_id, import_id, provider, page_url, grounding_query, topic, intent, citations, citation_share, period_start, period_end)
          VALUES ${sql.join(values, sql`, `)}
        `);
      }
    });

    logger.info({ tenantId, importId, rows: normalized.length }, "AI visibility: Bing AI Performance imported");
    return res.status(201).json({ success: true, duplicate: false, importId, rowCount: normalized.length });
  } catch (err) {
    logger.error({ err, tenantId }, "AI visibility: import failed");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/ai-visibility/imports/:importId", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const importId = String(req.params.importId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db.execute(sql`
      DELETE FROM ai_visibility_imports
      WHERE id = ${importId} AND tenant_id = ${tenantId}
      RETURNING id
    `);
    if (!rowsOf(result).length) return res.status(404).json({ error: "AI_VISIBILITY_IMPORT_NOT_FOUND" });
    return res.json({ success: true, id: importId });
  } catch (err) {
    logger.error({ err, tenantId, importId }, "AI visibility: failed to delete import");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
