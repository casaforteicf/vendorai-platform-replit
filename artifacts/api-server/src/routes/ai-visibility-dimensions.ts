import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();
const PROVIDER = "bing_ai_performance";
const MAX_ROWS = 10000;

type DimensionType = "grounding_queries" | "timeseries" | "topics" | "intents";
type DimensionRow = {
  pageUrl: string | null;
  groundingQuery: string | null;
  topic: string | null;
  intent: string | null;
  activityDate: string | null;
  citations: number;
  citationShare: number | null;
};
type ImportRow = { id: string; dimension_type: DimensionType; file_name: string | null; row_count: number; imported_at: string | Date };

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
  const text = cleanText(value, 30);
  if (!text) return null;
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

function cleanNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/\s/g, "").replace(/%$/, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRow(input: unknown): DimensionRow | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const normalized: DimensionRow = {
    pageUrl: cleanText(row.pageUrl ?? row.page_url ?? row.url, 4000),
    groundingQuery: cleanText(row.groundingQuery ?? row.grounding_query ?? row.query, 2000),
    topic: cleanText(row.topic, 500),
    intent: cleanText(row.intent, 500),
    activityDate: cleanDate(row.activityDate ?? row.activity_date ?? row.date),
    citations: Math.max(0, Math.round(cleanNumber(row.citations ?? row.totalCitations ?? row.total_citations, 0))),
    citationShare: row.citationShare == null && row.citation_share == null
      ? null
      : Math.max(0, cleanNumber(row.citationShare ?? row.citation_share, 0)),
  };
  if (!normalized.pageUrl && !normalized.groundingQuery && !normalized.topic && !normalized.intent && !normalized.activityDate) return null;
  return normalized;
}

function inferType(rows: DimensionRow[]): DimensionType | null {
  const dated = rows.filter((row) => row.activityDate).length;
  const queries = rows.filter((row) => row.groundingQuery).length;
  const topics = rows.filter((row) => row.topic).length;
  const intents = rows.filter((row) => row.intent).length;
  if (dated > 0 && queries === 0 && topics === 0 && intents === 0) return "timeseries";
  if (queries > 0) return "grounding_queries";
  if (topics > 0) return "topics";
  if (intents > 0) return "intents";
  if (dated > 0) return "timeseries";
  return null;
}

function checksumFor(type: DimensionType, rows: DimensionRow[]) {
  const stable = [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(`${type}:${JSON.stringify(stable)}`).digest("hex");
}

async function topTopics(tenantId: string, importId: string | null) {
  if (!importId) return [];
  const result = await db.execute(sql`
    SELECT topic, sum(citations)::int AS citations
    FROM ai_visibility_dimensions
    WHERE tenant_id = ${tenantId} AND import_id = ${importId} AND topic IS NOT NULL
    GROUP BY topic ORDER BY citations DESC, topic ASC LIMIT 15
  `);
  return rowsOf(result);
}

async function topIntents(tenantId: string, importId: string | null) {
  if (!importId) return [];
  const result = await db.execute(sql`
    SELECT intent, sum(citations)::int AS citations
    FROM ai_visibility_dimensions
    WHERE tenant_id = ${tenantId} AND import_id = ${importId} AND intent IS NOT NULL
    GROUP BY intent ORDER BY citations DESC, intent ASC LIMIT 15
  `);
  return rowsOf(result);
}

router.get("/tenants/:tenantId/ai-visibility/dimensions/summary", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const [latestResult, historyResult] = await Promise.all([
      db.execute(sql`
        SELECT DISTINCT ON (dimension_type) id, dimension_type, file_name, row_count, imported_at
        FROM ai_visibility_dimension_imports
        WHERE tenant_id = ${tenantId} AND provider = ${PROVIDER}
        ORDER BY dimension_type, imported_at DESC
      `),
      db.execute(sql`
        SELECT id, dimension_type, file_name, row_count, imported_at
        FROM ai_visibility_dimension_imports
        WHERE tenant_id = ${tenantId} AND provider = ${PROVIDER}
        ORDER BY imported_at DESC LIMIT 20
      `),
    ]);
    const latest = rowsOf<ImportRow>(latestResult);
    const byType = new Map(latest.map((item) => [item.dimension_type, item]));
    const queryId = byType.get("grounding_queries")?.id ?? null;
    const topicId = byType.get("topics")?.id ?? null;
    const intentId = byType.get("intents")?.id ?? null;
    const timelineId = byType.get("timeseries")?.id ?? null;

    const [queryResult, queryTopics, ownTopics, queryIntents, ownIntents, timelineResult] = await Promise.all([
      queryId ? db.execute(sql`
        SELECT grounding_query, sum(citations)::int AS citations,
               round(avg(citation_share) FILTER (WHERE citation_share IS NOT NULL), 2) AS citation_share,
               count(DISTINCT page_url) FILTER (WHERE page_url IS NOT NULL)::int AS page_count
        FROM ai_visibility_dimensions
        WHERE tenant_id = ${tenantId} AND import_id = ${queryId} AND grounding_query IS NOT NULL
        GROUP BY grounding_query ORDER BY citations DESC, grounding_query ASC LIMIT 30
      `) : Promise.resolve([]),
      topTopics(tenantId, queryId),
      topTopics(tenantId, topicId),
      topIntents(tenantId, queryId),
      topIntents(tenantId, intentId),
      timelineId ? db.execute(sql`
        SELECT activity_date, sum(citations)::int AS citations
        FROM ai_visibility_dimensions
        WHERE tenant_id = ${tenantId} AND import_id = ${timelineId} AND activity_date IS NOT NULL
        GROUP BY activity_date ORDER BY activity_date ASC
      `) : Promise.resolve([]),
    ]);

    return res.json({
      available: latest.length > 0,
      topQueries: rowsOf(queryResult),
      topics: queryTopics.length ? queryTopics : ownTopics,
      intents: queryIntents.length ? queryIntents : ownIntents,
      timeline: rowsOf(timelineResult),
      latest: Object.fromEntries(latest.map((item) => [item.dimension_type, item])),
      imports: rowsOf(historyResult),
    });
  } catch (err) {
    logger.error({ err, tenantId }, "AI visibility dimensions: summary failed");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.post("/tenants/:tenantId/ai-visibility/dimensions/import", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const body = req.body as { fileName?: unknown; rows?: unknown; dimensionType?: unknown };
    if (!Array.isArray(body.rows) || body.rows.length === 0) return res.status(400).json({ error: "AI_VISIBILITY_ROWS_REQUIRED" });
    if (body.rows.length > MAX_ROWS) return res.status(413).json({ error: "AI_VISIBILITY_TOO_MANY_ROWS", maxRows: MAX_ROWS });

    const normalized = body.rows.map(normalizeRow).filter((row): row is DimensionRow => row !== null);
    const requested = cleanText(body.dimensionType, 40) as DimensionType | null;
    const allowed: DimensionType[] = ["grounding_queries", "timeseries", "topics", "intents"];
    const type = requested && allowed.includes(requested) ? requested : inferType(normalized);
    if (!normalized.length || !type) return res.status(400).json({ error: "AI_VISIBILITY_UNSUPPORTED_REPORT" });

    const checksum = checksumFor(type, normalized);
    const duplicateResult = await db.execute(sql`
      SELECT id, imported_at FROM ai_visibility_dimension_imports
      WHERE tenant_id = ${tenantId} AND provider = ${PROVIDER} AND dimension_type = ${type} AND checksum = ${checksum}
      LIMIT 1
    `);
    const duplicate = rowsOf<{ id: string; imported_at: string }>(duplicateResult)[0];
    if (duplicate) return res.json({ success: true, duplicate: true, importId: duplicate.id, dimensionType: type });

    const importId = randomUUID();
    const fileName = cleanText(body.fileName, 500);
    const importedBy = req.user?.sub ?? req.user?.id ?? null;
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO ai_visibility_dimension_imports
          (id, tenant_id, provider, dimension_type, file_name, checksum, row_count, imported_by)
        VALUES (${importId}, ${tenantId}, ${PROVIDER}, ${type}, ${fileName}, ${checksum}, ${normalized.length}, ${importedBy})
      `);
      for (let index = 0; index < normalized.length; index += 250) {
        const chunk = normalized.slice(index, index + 250);
        const values = chunk.map((row) => sql`(
          ${randomUUID()}, ${tenantId}, ${importId}, ${PROVIDER}, ${type}, ${row.pageUrl}, ${row.groundingQuery},
          ${row.topic}, ${row.intent}, ${row.activityDate}, ${row.citations}, ${row.citationShare}
        )`);
        await tx.execute(sql`
          INSERT INTO ai_visibility_dimensions
            (id, tenant_id, import_id, provider, dimension_type, page_url, grounding_query, topic, intent, activity_date, citations, citation_share)
          VALUES ${sql.join(values, sql`, `)}
        `);
      }
    });
    logger.info({ tenantId, importId, type, rows: normalized.length }, "AI visibility dimensions imported");
    return res.status(201).json({ success: true, duplicate: false, importId, dimensionType: type, rowCount: normalized.length });
  } catch (err) {
    logger.error({ err, tenantId }, "AI visibility dimensions: import failed");
    return res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/tenants/:tenantId/ai-visibility/dimensions/imports/:importId", authenticate, async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const importId = String(req.params.importId);
  if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await db.execute(sql`
      DELETE FROM ai_visibility_dimension_imports WHERE tenant_id = ${tenantId} AND id = ${importId} RETURNING id
    `);
    if (!rowsOf(result).length) return res.status(404).json({ error: "AI_VISIBILITY_IMPORT_NOT_FOUND" });
    return res.json({ success: true, id: importId });
  } catch (err) {
    logger.error({ err, tenantId, importId }, "AI visibility dimensions: delete failed");
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
