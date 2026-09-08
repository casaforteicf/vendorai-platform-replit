import { desc, eq } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";

const MAX_CASES = 250;
const MIN_FINANCIAL_SAMPLE = 3;

export type JarvisFinancialPrecedent = {
  key: string;
  category: string;
  actionKey: string;
  actionLabel: string;
  sampleSize: number;
  medianImpactBrl: number;
  minImpactBrl: number;
  maxImpactBrl: number;
  positiveOutcomes: number;
  neutralOutcomes: number;
  negativeOutcomes: number;
  positiveRatePercent: number;
  confidence: number;
  caseIds: string[];
};

type StructuredOutcome = {
  effectiveness?: "positive" | "neutral" | "negative" | "inconclusive";
  actionTaken?: string | null;
  financialImpactBrl?: number | null;
};

type Evidence = Record<string, unknown> & {
  jarvisOutcome?: StructuredOutcome;
};

export function normalizeJarvisAction(value: string | null | undefined) {
  if (!value) return "acao-nao-documentada";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 180) || "acao-nao-documentada";
}

function compactAction(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return "Ação não documentada";
  return normalized.length > 160 ? `${normalized.slice(0, 159)}…` : normalized;
}

function finiteImpact(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle] ?? 0;
  return ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

function confidence(sampleSize: number, positiveRate: number) {
  const sampleWeight = Math.min(30, sampleSize * 6);
  const consistencyWeight = Math.min(20, Math.abs(positiveRate - 50) * 0.4);
  return Math.round(Math.max(50, Math.min(95, 45 + sampleWeight + consistencyWeight)));
}

export async function loadJarvisFinancialPrioritizationIntelligence(tenantId: string) {
  const rows = await db
    .select({
      id: jarvisCasesTable.id,
      category: jarvisCasesTable.category,
      recommendedAction: jarvisCasesTable.recommendedAction,
      evidence: jarvisCasesTable.evidence,
      status: jarvisCasesTable.status,
      updatedAt: jarvisCasesTable.updatedAt,
    })
    .from(jarvisCasesTable)
    .where(eq(jarvisCasesTable.tenantId, tenantId))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(MAX_CASES);

  const buckets = new Map<string, {
    category: string;
    actionKey: string;
    actionLabel: string;
    impacts: number[];
    positive: number;
    neutral: number;
    negative: number;
    ids: string[];
  }>();

  for (const row of rows) {
    if (row.status !== "resolved") continue;
    const outcome = ((row.evidence ?? {}) as Evidence).jarvisOutcome;
    const impact = finiteImpact(outcome?.financialImpactBrl);
    const effectiveness = outcome?.effectiveness;
    if (impact == null || !effectiveness || effectiveness === "inconclusive") continue;

    const actionTaken = outcome?.actionTaken?.trim() || row.recommendedAction?.trim() || null;
    if (!actionTaken) continue;
    const actionKey = normalizeJarvisAction(actionTaken);
    const key = `${row.category}:${actionKey}`;
    const bucket = buckets.get(key) ?? {
      category: row.category,
      actionKey,
      actionLabel: compactAction(actionTaken),
      impacts: [],
      positive: 0,
      neutral: 0,
      negative: 0,
      ids: [],
    };

    bucket.impacts.push(impact);
    if (effectiveness === "positive") bucket.positive += 1;
    if (effectiveness === "neutral") bucket.neutral += 1;
    if (effectiveness === "negative") bucket.negative += 1;
    bucket.ids.push(row.id);
    buckets.set(key, bucket);
  }

  const precedents: JarvisFinancialPrecedent[] = [];
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.impacts.length < MIN_FINANCIAL_SAMPLE) continue;
    const conclusive = bucket.positive + bucket.neutral + bucket.negative;
    if (conclusive < MIN_FINANCIAL_SAMPLE) continue;
    const positiveRatePercent = Math.round((bucket.positive / conclusive) * 100);
    precedents.push({
      key,
      category: bucket.category,
      actionKey: bucket.actionKey,
      actionLabel: bucket.actionLabel,
      sampleSize: bucket.impacts.length,
      medianImpactBrl: Math.round(median(bucket.impacts) * 100) / 100,
      minImpactBrl: Math.min(...bucket.impacts),
      maxImpactBrl: Math.max(...bucket.impacts),
      positiveOutcomes: bucket.positive,
      neutralOutcomes: bucket.neutral,
      negativeOutcomes: bucket.negative,
      positiveRatePercent,
      confidence: confidence(bucket.impacts.length, positiveRatePercent),
      caseIds: bucket.ids.slice(0, 8),
    });
  }

  precedents.sort((a, b) => b.sampleSize - a.sampleSize || b.confidence - a.confidence);

  return {
    tenantId,
    resolvedCasesObserved: rows.filter((row) => row.status === "resolved").length,
    comparableFinancialPatterns: precedents.length,
    minFinancialSample: MIN_FINANCIAL_SAMPLE,
    precedents,
  };
}

export function findJarvisFinancialPrecedent(
  precedents: JarvisFinancialPrecedent[],
  category: string,
  recommendedAction: string | null | undefined,
) {
  if (!recommendedAction) return null;
  const actionKey = normalizeJarvisAction(recommendedAction);
  return precedents.find((item) => item.category === category && item.actionKey === actionKey) ?? null;
}
