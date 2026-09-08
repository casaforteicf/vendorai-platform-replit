import { and, desc, eq } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";

const MAX_CASES = 80;
const MAX_INSIGHTS = 8;

type Feedback = {
  relevance?: "relevant" | "irrelevant";
  note?: string | null;
};

type Evidence = Record<string, unknown> & {
  jarvisFeedback?: Feedback;
};

export type JarvisTenantLearningInsight = {
  key: string;
  kind: "recurrence" | "relevance" | "outcome" | "coverage";
  title: string;
  detail: string;
  confidence: number;
  sampleSize: number;
  caseIds: string[];
};

export type JarvisTenantLearningIntelligence = {
  tenantId: string;
  sampleSize: number;
  resolvedCases: number;
  casesWithOutcome: number;
  outcomeCoveragePercent: number;
  feedbackCount: number;
  relevantFeedback: number;
  irrelevantFeedback: number;
  insights: JarvisTenantLearningInsight[];
};

function clampConfidence(sampleSize: number, coverage = 1) {
  const sampleFactor = Math.min(1, sampleSize / 8);
  return Math.max(20, Math.min(95, Math.round((0.35 + sampleFactor * 0.65) * coverage * 100)));
}

function compact(value: string | null | undefined, max = 220) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

export async function loadJarvisTenantLearningIntelligence(
  tenantId: string,
): Promise<JarvisTenantLearningIntelligence> {
  const rows = await db
    .select({
      id: jarvisCasesTable.id,
      signalKey: jarvisCasesTable.signalKey,
      category: jarvisCasesTable.category,
      title: jarvisCasesTable.title,
      status: jarvisCasesTable.status,
      evidence: jarvisCasesTable.evidence,
      recommendedAction: jarvisCasesTable.recommendedAction,
      resultSummary: jarvisCasesTable.resultSummary,
      resolvedAt: jarvisCasesTable.resolvedAt,
      updatedAt: jarvisCasesTable.updatedAt,
    })
    .from(jarvisCasesTable)
    .where(eq(jarvisCasesTable.tenantId, tenantId))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(MAX_CASES);

  const resolved = rows.filter((row) => row.status === "resolved");
  const withOutcome = resolved.filter((row) => Boolean(row.resultSummary?.trim()));
  const feedbackRows = rows
    .map((row) => ({
      row,
      feedback: ((row.evidence ?? {}) as Evidence).jarvisFeedback,
    }))
    .filter((item) => item.feedback?.relevance === "relevant" || item.feedback?.relevance === "irrelevant");

  const relevantFeedback = feedbackRows.filter((item) => item.feedback?.relevance === "relevant").length;
  const irrelevantFeedback = feedbackRows.filter((item) => item.feedback?.relevance === "irrelevant").length;
  const outcomeCoveragePercent = resolved.length
    ? Math.round((withOutcome.length / resolved.length) * 100)
    : 0;

  const insights: JarvisTenantLearningInsight[] = [];

  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    const current = byCategory.get(row.category) ?? [];
    current.push(row);
    byCategory.set(row.category, current);
  }

  for (const [category, items] of byCategory.entries()) {
    if (items.length < 2) continue;
    const ids = items.slice(0, 6).map((item) => item.id);
    insights.push({
      key: `recurrence:${category}`,
      kind: "recurrence",
      title: `Padrão recorrente em ${category}`,
      detail: `${items.length} Casos Vendor recentes deste tenant pertencem à categoria ${category}. Trate isso como recorrência observada, não como causa comum comprovada.`,
      confidence: clampConfidence(items.length),
      sampleSize: items.length,
      caseIds: ids,
    });
  }

  const feedbackByCategory = new Map<string, { relevant: number; irrelevant: number; ids: string[] }>();
  for (const item of feedbackRows) {
    const current = feedbackByCategory.get(item.row.category) ?? { relevant: 0, irrelevant: 0, ids: [] };
    if (item.feedback?.relevance === "relevant") current.relevant += 1;
    if (item.feedback?.relevance === "irrelevant") current.irrelevant += 1;
    current.ids.push(item.row.id);
    feedbackByCategory.set(item.row.category, current);
  }

  for (const [category, stats] of feedbackByCategory.entries()) {
    const total = stats.relevant + stats.irrelevant;
    if (total < 2) continue;
    const ratio = stats.relevant / total;
    const direction = ratio >= 0.7 ? "alta" : ratio <= 0.3 ? "baixa" : "mista";
    insights.push({
      key: `relevance:${category}`,
      kind: "relevance",
      title: `Relevância ${direction} para sinais de ${category}`,
      detail: `${stats.relevant}/${total} feedbacks desta categoria foram marcados como relevantes pelo tenant. Use isso apenas para priorização de sinais semelhantes, não para ocultar informação crítica.`,
      confidence: clampConfidence(total, Math.max(0.5, Math.abs(ratio - 0.5) * 2)),
      sampleSize: total,
      caseIds: stats.ids.slice(0, 6),
    });
  }

  if (withOutcome.length) {
    const recent = withOutcome.slice(0, 4);
    insights.push({
      key: "outcome:documented-history",
      kind: "outcome",
      title: "Histórico de resultados documentados disponível",
      detail: `${withOutcome.length} casos resolvidos desta amostra possuem resultado registrado. O JARVIS pode reutilizar esses resultados como precedente do tenant, sem assumir causalidade. Exemplos: ${recent.map((item) => `[${item.id}] ${compact(item.resultSummary, 110)}`).join(" | ")}`,
      confidence: clampConfidence(withOutcome.length, outcomeCoveragePercent / 100 || 0.5),
      sampleSize: withOutcome.length,
      caseIds: recent.map((item) => item.id),
    });
  }

  if (resolved.length >= 3 && outcomeCoveragePercent < 70) {
    insights.push({
      key: "coverage:outcomes",
      kind: "coverage",
      title: "Lacuna de aprendizado por resultados incompletos",
      detail: `Somente ${withOutcome.length}/${resolved.length} casos resolvidos (${outcomeCoveragePercent}%) têm resultado registrado. O JARVIS deve pedir/estimular fechamento de resultado antes de generalizar o que funcionou.`,
      confidence: 95,
      sampleSize: resolved.length,
      caseIds: resolved.filter((item) => !item.resultSummary?.trim()).slice(0, 6).map((item) => item.id),
    });
  }

  insights.sort((a, b) => b.confidence - a.confidence || b.sampleSize - a.sampleSize);

  return {
    tenantId,
    sampleSize: rows.length,
    resolvedCases: resolved.length,
    casesWithOutcome: withOutcome.length,
    outcomeCoveragePercent,
    feedbackCount: feedbackRows.length,
    relevantFeedback,
    irrelevantFeedback,
    insights: insights.slice(0, MAX_INSIGHTS),
  };
}
