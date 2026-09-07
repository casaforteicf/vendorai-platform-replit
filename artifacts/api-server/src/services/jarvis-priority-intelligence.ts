import { and, desc, eq } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";

export type JarvisPriorityChangeType = "new" | "updated" | "ongoing";

export type JarvisExplicitFinancialImpact = {
  amount: number;
  currency: "BRL";
  source: "metric";
  raw: string;
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
  recommendedAction: string | null;
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
  const financialWeight = extractExplicitFinancialImpact(item.metric) ? 5 : 0;

  return Math.round(clamp(severityWeight + confidenceWeight + impactWeight + recencyWeight + financialWeight));
}

export function buildJarvisPriorityItem(item: PriorityCaseInput, now = new Date()): JarvisPriorityItem {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    severity: item.severity,
    source: item.source,
    priorityScore: scoreJarvisPriority(item, now),
    changeType: resolvePriorityChangeType(item, now),
    confidence: item.confidence,
    impact: item.impact,
    metric: item.metric,
    explicitFinancialImpact: extractExplicitFinancialImpact(item.metric),
    recommendedAction: item.recommendedAction,
    updatedAt: item.updatedAt,
  };
}

export async function loadJarvisPriorityIntelligence(tenantId: string, limit = 5) {
  const rows = await db
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
    .limit(100);

  const now = new Date();
  const ranked = rows
    .map((item) => buildJarvisPriorityItem(item, now))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.updatedAt.getTime() - a.updatedAt.getTime());
  const items = ranked.slice(0, Math.max(1, Math.min(limit, 20)));

  return {
    generatedAt: now,
    summary: {
      openCasesEvaluated: rows.length,
      prioritiesReturned: items.length,
      withExplicitFinancialImpact: items.filter((item) => item.explicitFinancialImpact).length,
      newOrUpdated: items.filter((item) => item.changeType !== "ongoing").length,
    },
    items,
  };
}
