/**
 * Prospector Memory — feedback loop + vector similarity
 *
 * Feedback: vendors rate leads 1-5; converted = true when deal closes.
 * Embeddings: on conversion, store text-embedding-3-small vector.
 * Similarity: when scoring a new lead, compare against converted embeddings
 *             and return a bonus (0–15 pts) to add to propensity_score.
 */
import OpenAI from "openai";
import { db, prospectFeedbackTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for prospector memory");
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export async function registerLeadFeedback({
  tenantId,
  leadId,
  userId,
  rating,
  comment,
}: {
  tenantId: string;
  leadId: string;
  userId: string;
  rating: number;
  comment?: string;
}) {
  await db.insert(prospectFeedbackTable).values({
    id: crypto.randomUUID(),
    tenantId,
    leadId,
    userId,
    rating,
    comment: comment ?? null,
    converted: false,
  });

  const [avg] = await db
    .select({ avg: sql<number>`ROUND(AVG(rating)::numeric, 2)` })
    .from(prospectFeedbackTable)
    .where(eq(prospectFeedbackTable.leadId, leadId));

  logger.info({ leadId, rating, avgRating: avg?.avg }, "prospect feedback registered");
  return { avgRating: avg?.avg ?? rating };
}

export async function markFeedbackConverted(leadId: string) {
  const result = await db
    .update(prospectFeedbackTable)
    .set({ converted: true })
    .where(eq(prospectFeedbackTable.leadId, leadId))
    .returning({ id: prospectFeedbackTable.id });

  logger.info({ leadId, updated: result.length }, "prospect feedback marked converted");
}

// ── Embeddings ────────────────────────────────────────────────────────────────

function buildEmbeddingText(lead: {
  nome?: string | null;
  segmento?: string | null;
  websiteUrl?: string | null;
  endereco?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const setor = lead.segmento ?? (lead.metadata?.["setor"] as string | undefined) ?? "";
  const cidade = lead.endereco ?? (lead.metadata?.["cidade"] as string | undefined) ?? "";
  const digital = (lead.metadata?.["nivelPresencaDigital"] as string | undefined) ?? "";
  return [
    `Empresa: ${lead.nome ?? ""}`,
    `Setor: ${setor}`,
    `Cidade: ${cidade}`,
    `Presença digital: ${digital}`,
    `Site: ${lead.websiteUrl ?? ""}`,
  ]
    .filter((l) => !l.endsWith(": "))
    .join("\n");
}

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0]!.embedding;
}

export async function storeConvertedEmbedding(lead: {
  id: string;
  tenantId: string;
  nome?: string | null;
  segmento?: string | null;
  websiteUrl?: string | null;
  endereco?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    const text = buildEmbeddingText(lead);
    const embedding = await generateEmbedding(text);
    const vectorLiteral = `[${embedding.join(",")}]`;

    await db.execute(
      sql`INSERT INTO lead_embeddings (id, tenant_id, lead_id, embedding, segmento, nome)
          VALUES (${crypto.randomUUID()}, ${lead.tenantId}, ${lead.id},
                  ${vectorLiteral}::vector, ${lead.segmento ?? null}, ${lead.nome ?? null})
          ON CONFLICT DO NOTHING`,
    );

    logger.info({ leadId: lead.id, tenantId: lead.tenantId }, "lead embedding stored");
  } catch (err) {
    logger.warn({ err, leadId: lead.id }, "storeConvertedEmbedding failed (non-fatal)");
  }
}

/**
 * Returns a similarity bonus (0–15 pts) for use in propensity scoring.
 * 0 if no converted embeddings exist yet for the tenant.
 */
export async function getSimilarityBonus(
  tenantId: string,
  lead: {
    nome?: string | null;
    segmento?: string | null;
    websiteUrl?: string | null;
    endereco?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<number> {
  try {
    const countResult = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM lead_embeddings WHERE tenant_id = ${tenantId}`,
    );
    const count = countResult.rows[0]?.count;
    if ((count ?? 0) < 3) return 0;

    const text = buildEmbeddingText(lead);
    const embedding = await generateEmbedding(text);
    const vectorLiteral = `[${embedding.join(",")}]`;

    const rowsResult = await db.execute<{ similarity: number }>(
      sql`SELECT 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
          FROM lead_embeddings
          WHERE tenant_id = ${tenantId}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT 5`,
    );
    const rows = rowsResult.rows;

    if (!rows.length) return 0;

    const avg =
      rows.reduce((sum, r) => sum + Number(r.similarity), 0) / rows.length;

    const bonus = Math.round(avg * 15);
    logger.info({ tenantId, avgSimilarity: avg.toFixed(3), bonus }, "similarity bonus computed");
    return Math.min(15, Math.max(0, bonus));
  } catch (err) {
    logger.warn({ err }, "getSimilarityBonus failed (non-fatal)");
    return 0;
  }
}
