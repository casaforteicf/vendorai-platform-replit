import { desc, eq } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";

const MAX_CASES = 200;
const MAX_PATTERNS = 8;

export type JarvisOutcomeEffectiveness = "positive" | "neutral" | "negative" | "inconclusive";

type StructuredOutcome = {
  effectiveness?: JarvisOutcomeEffectiveness;
  actionTaken?: string | null;
  financialImpactBrl?: number | null;
  actorId?: string | null;
  recordedAt?: string | null;
};

type Evidence = Record<string, unknown> & {
  jarvisOutcome?: StructuredOutcome;
};

export type JarvisDecisionEffectivenessPattern = {
  key: string;
  category: string;
  actionLabel: string;
  sampleSize: number;
  conclusiveSample: number;
  positive: number;
  neutral: number;
  negative: number;
  inconclusive: number;
  positiveRatePercent: number | null;
  documentedFinancialImpactBrl: number | null;
  confidence: number;
  caseIds: string[];
};

export type JarvisDecisionEffectivenessIntelligence = {
  tenantId: string;
  resolvedCasesObserved: number;
  structuredOutcomes: number;
  conclusiveOutcomes: number;
  outcomeCoveragePercent: number;
  patterns: JarvisDecisionEffectivenessPattern[];
};

function normalizeAction(value: string | null | undefined) {
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

function validImpact(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function confidence(conclusiveSample: number, structuredSample: number) {
  if (!structuredSample) return 0;
  const coverage = conclusiveSample / structuredSample;
  return Math.round(Math.max(35, Math.min(95, 40 + Math.min(40, conclusiveSample * 7) + coverage * 15)));
}

export async function loadJarvisDecisionEffectivenessIntelligence(
  tenantId: string,
): Promise<JarvisDecisionEffectivenessIntelligence> {
  const rows = await db
    .select({
      id: jarvisCasesTable.id,
      category: jarvisCasesTable.category,
      recommendedAction: jarvisCasesTable.recommendedAction,
      resultSummary: jarvisCasesTable.resultSummary,
      evidence: jarvisCasesTable.evidence,
      status: jarvisCasesTable.status,
      resolvedAt: jarvisCasesTable.resolvedAt,
      updatedAt: jarvisCasesTable.updatedAt,
    })
    .from(jarvisCasesTable)
    .where(eq(jarvisCasesTable.tenantId, tenantId))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(MAX_CASES);

  const resolved = rows.filter((row) => row.status === "resolved");
  const structured = resolved.flatMap((row) => {
    const outcome = ((row.evidence ?? {}) as Evidence).jarvisOutcome;
    const effectiveness = outcome?.effectiveness;
    if (!effectiveness || !["positive", "neutral", "negative", "inconclusive"].includes(effectiveness)) return [];
    const actionTaken = outcome?.actionTaken?.trim() || row.recommendedAction?.trim() || null;
    return [{
      row,
      effectiveness,
      actionTaken,
      financialImpactBrl: validImpact(outcome?.financialImpactBrl),
    }];
  });

  const buckets = new Map<string, {
    category: string;
    actionLabel: string;
    ids: string[];
    positive: number;
    neutral: number;
    negative: number;
    inconclusive: number;
    impacts: number[];
  }>();

  for (const item of structured) {
    const actionKey = normalizeAction(item.actionTaken);
    const key = `${item.row.category}:${actionKey}`;
    const bucket = buckets.get(key) ?? {
      category: item.row.category,
      actionLabel: compactAction(item.actionTaken),
      ids: [],
      positive: 0,
      neutral: 0,
      negative: 0,
      inconclusive: 0,
      impacts: [],
    };
    bucket.ids.push(item.row.id);
    bucket[item.effectiveness] += 1;
    if (item.financialImpactBrl != null) bucket.impacts.push(item.financialImpactBrl);
    buckets.set(key, bucket);
  }

  const patterns = [...buckets.entries()].map(([key, bucket]): JarvisDecisionEffectivenessPattern => {
    const sampleSize = bucket.positive + bucket.neutral + bucket.negative + bucket.inconclusive;
    const conclusiveSample = bucket.positive + bucket.neutral + bucket.negative;
    const positiveRatePercent = conclusiveSample >= 2
      ? Math.round((bucket.positive / conclusiveSample) * 100)
      : null;
    const documentedFinancialImpactBrl = bucket.impacts.length
      ? Math.round(bucket.impacts.reduce((sum, value) => sum + value, 0) * 100) / 100
      : null;
    return {
      key,
      category: bucket.category,
      actionLabel: bucket.actionLabel,
      sampleSize,
      conclusiveSample,
      positive: bucket.positive,
      neutral: bucket.neutral,
      negative: bucket.negative,
      inconclusive: bucket.inconclusive,
      positiveRatePercent,
      documentedFinancialImpactBrl,
      confidence: confidence(conclusiveSample, sampleSize),
      caseIds: bucket.ids.slice(0, 8),
    };
  }).sort((a, b) => {
    const aUsable = a.positiveRatePercent == null ? -1 : a.positiveRatePercent;
    const bUsable = b.positiveRatePercent == null ? -1 : b.positiveRatePercent;
    return b.conclusiveSample - a.conclusiveSample || bUsable - aUsable || b.confidence - a.confidence;
  });

  const conclusiveOutcomes = structured.filter((item) => item.effectiveness !== "inconclusive").length;
  const outcomeCoveragePercent = resolved.length
    ? Math.round((structured.length / resolved.length) * 100)
    : 0;

  return {
    tenantId,
    resolvedCasesObserved: resolved.length,
    structuredOutcomes: structured.length,
    conclusiveOutcomes,
    outcomeCoveragePercent,
    patterns: patterns.slice(0, MAX_PATTERNS),
  };
}
