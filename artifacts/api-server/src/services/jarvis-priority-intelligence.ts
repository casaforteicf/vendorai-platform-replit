import { and, desc, eq } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";
import {
  findJarvisFinancialPrecedent,
  loadJarvisFinancialPrioritizationIntelligence,
  type JarvisFinancialPrecedent,
} from "./jarvis-financial-prioritization-intelligence.js";

export type JarvisPriorityChangeType = "new" | "updated" | "ongoing";
export type JarvisProactivityLevel = "interrupt" | "briefing" | "silent";

export type JarvisExplicitFinancialImpact = {
  amount: number;
  currency: "BRL";
  source: "metric";
  raw: string;
};

export type JarvisHistoricalFinancialEstimate = {
  medianAmount: number;
  currency: "BRL";
  source: "tenant_history";
  sampleSize: number;
  positiveRatePercent: number;
  confidence: number;
  minAmount: number;
  maxAmount: number;
  precedentCaseIds: string[];
};

export type JarvisProactivityDecision = {
  level: JarvisProactivityLevel;
  reason: string;
  interruptEligible: boolean;
};

export type JarvisPriorityItem = {
  id: string;
  title: string;
  category: string;
  severity: string;
  source: string;
  priorityScore: number;
  changeType: JarvisPriorityChangeType;
  confidence: number | null;
  impact: number | null;
  metric: string | null;
  explicitFinancialImpact: JarvisExplicitFinancialImpact | null;
  historicalFinancialEstimate: JarvisHistoricalFinancialEstimate | null;
  recommendedAction: string | null;
  proactivity: JarvisProactivityDecision;
  updatedAt: Date;
};

type PriorityCaseInput = {
  id: string;
  title: string;
  category: string;
  severity: string;
  source: string;
  metric: string | null;
  confidence: number | null;
  impact: number | null;
  recommendedAction: string | null;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  updatedAt: Date;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function parsePtBrNumber(raw: string) {
  const cleaned = raw.replace(/\s/g, "");
  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,(?=\d{3}(?:\D|$))/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function extractExplicitFinancialImpact(metric: string | null | undefined): JarvisExplicitFinancialImpact | null {
  if (!metric) return null;
  const match = metric.match(/(?:R\$|BRL)\s*([0-9][0-9.]*?(?:,[0-9]{1,2})?)(?=\s|$|[^0-9.,])/i);
  if (!match?.[1]) return null;
  const amount = parsePtBrNumber(match[1]);
  if (amount == null || amount < 0) return null;
  return { amount, currency: "BRL", source: "metric", raw: match[0].trim() };
}

function explicitFinancialWeight(amount: number) {
  if (amount >= 1_000_000) return 10;
  if (amount >= 250_000) return 9;
  if (amount >= 100_000) return 8;
  if (amount >= 50_000) return 7;
  if (amount >= 20_000) return 6;
  if (amount >= 10_000) return 5;
  if (amount >= 5_000) return 4;
  if (amount >= 1_000) return 3;
  if (amount > 0) return 2;
  return 0;
}

function historicalFinancialWeight(precedent: JarvisFinancialPrecedent | null) {
  if (!precedent || precedent.medianImpactBrl <= 0 || precedent.positiveRatePercent < 50) return 0;
  const amountWeight = Math.min(7, explicitFinancialWeight(precedent.medianImpactBrl));
  const confidenceFactor = precedent.confidence / 100;
  const effectivenessFactor = precedent.positiveRatePercent / 100;
  return Math.round(amountWeight * confidenceFactor * effectivenessFactor);
}

function historicalEstimate(precedent: JarvisFinancialPrecedent | null): JarvisHistoricalFinancialEstimate | null {
  if (!precedent) return null;
  return {
    medianAmount: precedent.medianImpactBrl,
    currency: "BRL",
    source: "tenant_history",
    sampleSize: precedent.sampleSize,
    positiveRatePercent: precedent.positiveRatePercent,
    confidence: precedent.confidence,
    minAmount: precedent.minImpactBrl,
    maxAmount: precedent.maxImpactBrl,
    precedentCaseIds: precedent.caseIds,
  };
}

export function resolvePriorityChangeType(item: Pick<PriorityCaseInput, "firstDetectedAt" | "lastDetectedAt" | "updatedAt">, now = new Date()): JarvisPriorityChangeType {
  const dayMs = 24 * 60 * 60 * 1000;
  if (now.getTime() - item.firstDetectedAt.getTime() <= dayMs) return "new";
  const latestSignalAt = Math.max(item.lastDetectedAt.getTime(), item.updatedAt.getTime());
  if (latestSignalAt - item.firstDetectedAt.getTime() >= 5 * 60 * 1000 && now.getTime() - latestSignalAt <= dayMs) return "updated";
  return "ongoing";
}

export function scoreJarvisPriority(item: PriorityCaseInput, now = new Date()) {
  const severityWeight = item.severity === "risk"
    ? 35
    : item.severity === "opportunity"
      ? 30
      : item.severity === "attention"
        ? 20
        : 15;

  const confidenceWeight = item.confidence == null ? 5 : clamp(item.confidence) * 0.2;
  const impactWeight = item.impact == null ? 5 : clamp(item.impact) * 0.25;
  const ageHours = Math.max(0, (now.getTime() - item.updatedAt.getTime()) / (60 * 60 * 1000));
  const recencyWeight = ageHours <= 24 ? 15 : ageHours <= 72 ? 10 : ageHours <= 168 ? 5 : 0;
  const explicit = extractExplicitFinancialImpact(item.metric);
  const financialWeight = explicit ? explicitFinancialWeight(explicit.amount) : 0;

  return Math.round(clamp(severityWeight + confidenceWeight + impactWeight + recencyWeight + financialWeight));
}

export function classifyJarvisProactivity(item: Omit<JarvisPriorityItem, "proactivity">): JarvisProactivityDecision {
  const confidence = item.confidence ?? 0;
  const materialFinancialSignal = Boolean(
    (item.explicitFinancialImpact?.amount ?? 0) >= 20_000 ||
    ((item.historicalFinancialEstimate?.medianAmount ?? 0) >= 50_000 &&
      (item.historicalFinancialEstimate?.confidence ?? 0) >= 70),
  );
  const materialOperationalSignal = (item.impact ?? 0) >= 75;
  const actionableChange = item.changeType === "new" || item.changeType === "updated";
  const highSeverity = item.severity === "risk" || item.severity === "opportunity";

  if (
    item.priorityScore >= 85 &&
    confidence >= 70 &&
    actionableChange &&
    highSeverity &&
    (materialOperationalSignal || materialFinancialSignal)
  ) {
    return {
      level: "interrupt",
      interruptEligible: true,
      reason: materialFinancialSignal
        ? "Sinal novo/atualizado de alta prioridade, confiança suficiente e materialidade financeira."
        : "Sinal novo/atualizado de alta prioridade, confiança suficiente e alto impacto operacional.",
    };
  }

  if (
    item.priorityScore >= 65 ||
    (actionableChange && confidence >= 55) ||
    materialFinancialSignal
  ) {
    return {
      level: "briefing",
      interruptEligible: false,
      reason: actionableChange
        ? "Relevante para o próximo briefing/conversa, mas abaixo do limiar de interrupção."
        : "Relevante para acompanhamento, sem mudança recente suficiente para interromper.",
    };
  }

  return {
    level: "silent",
    interruptEligible: false,
    reason: "Registrar e acompanhar silenciosamente até surgir mudança, confiança ou impacto material.",
  };
}

export function buildJarvisPriorityItem(
  item: PriorityCaseInput,
  now = new Date(),
  precedent: JarvisFinancialPrecedent | null = null,
): JarvisPriorityItem {
  const explicit = extractExplicitFinancialImpact(item.metric);
  const historyWeight = explicit ? 0 : historicalFinancialWeight(precedent);
  const base = {
    id: item.id,
    title: item.title,
    category: item.category,
    severity: item.severity,
    source: item.source,
    priorityScore: Math.round(clamp(scoreJarvisPriority(item, now) + historyWeight)),
    changeType: resolvePriorityChangeType(item, now),
    confidence: item.confidence,
    impact: item.impact,
    metric: item.metric,
    explicitFinancialImpact: explicit,
    historicalFinancialEstimate: explicit ? null : historicalEstimate(precedent),
    recommendedAction: item.recommendedAction,
    updatedAt: item.updatedAt,
  };
  return { ...base, proactivity: classifyJarvisProactivity(base) };
}

export async function loadJarvisPriorityIntelligence(tenantId: string, limit = 5) {
  const [rows, financialLearning] = await Promise.all([
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        source: jarvisCasesTable.source,
        metric: jarvisCasesTable.metric,
        confidence: jarvisCasesTable.confidence,
        impact: jarvisCasesTable.impact,
        recommendedAction: jarvisCasesTable.recommendedAction,
        firstDetectedAt: jarvisCasesTable.firstDetectedAt,
        lastDetectedAt: jarvisCasesTable.lastDetectedAt,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        eq(jarvisCasesTable.status, "open"),
      ))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(100),
    loadJarvisFinancialPrioritizationIntelligence(tenantId),
  ]);

  const now = new Date();
  const ranked = rows
    .map((item) => {
      const precedent = findJarvisFinancialPrecedent(
        financialLearning.precedents,
        item.category,
        item.recommendedAction,
      );
      return buildJarvisPriorityItem(item, now, precedent);
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.updatedAt.getTime() - a.updatedAt.getTime());

  const interruptNow = ranked.filter((item) => item.proactivity.level === "interrupt").slice(0, 3);
  const briefing = ranked.filter((item) => item.proactivity.level === "briefing").slice(0, 5);
  const silent = ranked.filter((item) => item.proactivity.level === "silent");
  const items = ranked.slice(0, Math.max(1, Math.min(limit, 20)));

  return {
    generatedAt: now,
    summary: {
      openCasesEvaluated: rows.length,
      prioritiesReturned: items.length,
      withExplicitFinancialImpact: items.filter((item) => item.explicitFinancialImpact).length,
      withHistoricalFinancialEstimate: items.filter((item) => item.historicalFinancialEstimate).length,
      comparableFinancialPatterns: financialLearning.comparableFinancialPatterns,
      minFinancialSample: financialLearning.minFinancialSample,
      newOrUpdated: items.filter((item) => item.changeType !== "ongoing").length,
      interruptEligible: ranked.filter((item) => item.proactivity.level === "interrupt").length,
      briefingEligible: ranked.filter((item) => item.proactivity.level === "briefing").length,
      silentCount: silent.length,
    },
    proactivity: {
      interruptNow,
      briefing,
      silentCount: silent.length,
      guardrail: "Interrupção é apenas uma decisão de atenção. Não autoriza execução, envio, publicação, pagamento ou alteração sensível.",
    },
    items,
  };
}
