import { desc, eq } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";
import { loadJarvisRelationshipIntelligence } from "./jarvis-relationship-intelligence.js";
import { loadJarvisTemporalIntelligence } from "./jarvis-temporal-intelligence.js";
import { loadJarvisAnomalyCorrelationIntelligence } from "./jarvis-anomaly-correlation-intelligence.js";

const MAX_CASES = 80;
const MAX_INSIGHTS = 16;

type Feedback = {
  relevance?: "relevant" | "irrelevant";
  note?: string | null;
};

type Evidence = Record<string, unknown> & {
  jarvisFeedback?: Feedback;
};

export type JarvisTenantLearningInsight = {
  key: string;
  kind: "recurrence" | "relevance" | "outcome" | "coverage" | "relationship" | "temporal" | "correlation";
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
  relationshipNodes: number;
  relationshipEdges: number;
  temporalDealsConsidered: number;
  temporalAnomalies: number;
  correlationFindings: number;
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

function caseIdsFromRelationships(
  edges: Awaited<ReturnType<typeof loadJarvisRelationshipIntelligence>>["edges"],
  nodeId: string,
) {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.relation !== "case_mentions") continue;
    if (edge.from !== nodeId && edge.to !== nodeId) continue;
    const candidate = edge.from.startsWith("case:") ? edge.from : edge.to;
    if (candidate.startsWith("case:")) ids.add(candidate.slice("case:".length));
  }
  return [...ids].slice(0, 6);
}

function temporalLabel(metric: string) {
  if (metric === "created_deals") return "entrada de novos negócios";
  if (metric === "won_revenue") return "receita de negócios ganhos";
  if (metric === "average_ticket") return "ticket médio dos ganhos";
  if (metric === "conversion") return "conversão de fechamentos";
  return metric;
}

function correlationDimensionLabel(dimension: string) {
  if (dimension === "seller") return "vendedor";
  if (dimension === "city") return "cidade";
  if (dimension === "product") return "produto";
  if (dimension === "discount") return "desconto";
  return dimension;
}

export async function loadJarvisTenantLearningIntelligence(
  tenantId: string,
): Promise<JarvisTenantLearningIntelligence> {
  const [rows, relationships, temporal] = await Promise.all([
    db
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
      .limit(MAX_CASES),
    loadJarvisRelationshipIntelligence(tenantId),
    loadJarvisTemporalIntelligence(tenantId),
  ]);

  const correlation = await loadJarvisAnomalyCorrelationIntelligence(tenantId, temporal);
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

  for (const anomaly of temporal.anomalies) {
    const direction = anomaly.direction === "up" ? "acima" : "abaixo";
    const change = anomaly.changePoints != null
      ? `${Math.abs(anomaly.changePoints).toFixed(1)} p.p.`
      : `${Math.abs(anomaly.changePercent ?? 0).toFixed(1)}%`;
    insights.push({
      key: `temporal:${anomaly.metric}`,
      kind: "temporal",
      title: `${temporalLabel(anomaly.metric)} fora do padrão recente`,
      detail: `Nos últimos ${temporal.currentWindow.days} dias, ${temporalLabel(anomaly.metric)} ficou ${direction} do período imediatamente anterior em ${change}. ${anomaly.detail} Trate como desvio temporal observado; não atribua causa sem cruzar com vendedor, cidade, produto, desconto, campanha ou outro dado persistido.`,
      confidence: anomaly.confidence,
      sampleSize: Math.max(temporal.coverage.currentClosed, temporal.coverage.previousClosed, 1),
      caseIds: [],
    });
  }

  for (const finding of correlation.findings.slice(0, 6)) {
    const change = finding.changePoints != null
      ? `${Math.abs(finding.changePoints).toFixed(1)} p.p.`
      : `${Math.abs(finding.changePercent ?? 0).toFixed(1)}%`;
    insights.push({
      key: `correlation:${finding.dimension}:${finding.key}:${finding.signal}`,
      kind: "correlation",
      title: `Anomalia concentrada por ${correlationDimensionLabel(finding.dimension)}: ${finding.label}`,
      detail: `${finding.detail} Variação observada=${change}; amostra=${finding.sampleSize}; evidência=${finding.evidence}; anomalias relacionadas=${finding.relatedAnomalies.join(", ")}. Use isto para localizar onde a mudança está concentrada. Correlação temporal não prova causa; confirme com dados adicionais antes de atribuir responsabilidade ou efeito financeiro.`,
      confidence: finding.confidence,
      sampleSize: finding.sampleSize,
      caseIds: [],
    });
  }

  if (temporal.coverage.dealsConsidered > 0) {
    insights.push({
      key: "temporal:coverage",
      kind: "temporal",
      title: "Baseline temporal comercial disponível",
      detail: `O JARVIS comparou ${temporal.currentWindow.days} dias atuais com ${temporal.previousWindow.days} dias anteriores usando ${temporal.coverage.dealsConsidered} negócios persistidos. Fechamentos observados: atual=${temporal.coverage.currentClosed}, anterior=${temporal.coverage.previousClosed}. Se a amostra for pequena, não generalize tendências nem transforme ausência de anomalia em prova de estabilidade.`,
      confidence: Math.min(95, 55 + Math.min(40, temporal.coverage.dealsConsidered * 2)),
      sampleSize: temporal.coverage.dealsConsidered,
      caseIds: [],
    });
  }

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

  for (const hub of relationships.hubs.filter((item) => item.connections >= 2).slice(0, 5)) {
    const relatedCaseIds = caseIdsFromRelationships(relationships.edges, hub.id);
    const evidenceTypes = new Set(
      relationships.edges
        .filter((edge) => edge.from === hub.id || edge.to === hub.id)
        .map((edge) => edge.evidence),
    );
    const evidenceSummary = [...evidenceTypes].join(", ");
    insights.push({
      key: `relationship:${hub.id}`,
      kind: "relationship",
      title: `${hub.label} é um ponto de conexão do negócio`,
      detail: `${hub.label} (${hub.kind}) possui ${hub.connections} conexões no mapa estrutural deste tenant. Evidências usadas: ${evidenceSummary || "não informada"}. ${relatedCaseIds.length ? `Casos relacionados por menção observada: ${relatedCaseIds.join(", ")}.` : "Não há Caso Vendor ligado por menção nesta amostra."} Use concentração de relações como contexto, não como prova de importância financeira ou causalidade.`,
      confidence: evidenceTypes.has("persisted_fk") ? 90 : evidenceTypes.has("persisted_field") ? 80 : 60,
      sampleSize: hub.connections,
      caseIds: relatedCaseIds,
    });
  }

  if (relationships.summary.nodes > 0 && relationships.summary.edges > 0) {
    insights.push({
      key: "relationship:coverage",
      kind: "relationship",
      title: "Mapa estrutural do tenant disponível",
      detail: `O JARVIS possui ${relationships.summary.nodes} entidades e ${relationships.summary.edges} relações observadas nesta amostra: ${relationships.summary.people} pessoas, ${relationships.summary.companies} empresas, ${relationships.summary.deals} negócios, ${relationships.summary.suppliers} fornecedores e ${relationships.summary.cases} casos. Relações por texto são indícios; relações por FK/campo persistido são evidência estrutural mais forte.`,
      confidence: 95,
      sampleSize: relationships.summary.edges,
      caseIds: [],
    });
  }

  insights.sort((a, b) => b.confidence - a.confidence || b.sampleSize - a.sampleSize);

  return {
    tenantId,
    sampleSize: Math.max(rows.length, relationships.summary.nodes, temporal.coverage.dealsConsidered),
    resolvedCases: resolved.length,
    casesWithOutcome: withOutcome.length,
    outcomeCoveragePercent,
    feedbackCount: feedbackRows.length,
    relevantFeedback,
    irrelevantFeedback,
    relationshipNodes: relationships.summary.nodes,
    relationshipEdges: relationships.summary.edges,
    temporalDealsConsidered: temporal.coverage.dealsConsidered,
    temporalAnomalies: temporal.anomalies.length,
    correlationFindings: correlation.findings.length,
    insights: insights.slice(0, MAX_INSIGHTS),
  };
}
