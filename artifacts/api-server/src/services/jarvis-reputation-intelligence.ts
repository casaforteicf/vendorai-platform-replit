import { and, desc, eq, gte } from "drizzle-orm";
import { db, entregasTable, jarvisCasesTable } from "@workspace/db";

export type JarvisReputationState = "positive" | "stable" | "attention" | "risk" | "insufficient_data";

const REPUTATION_TERMS = [
  "avaliacao",
  "avaliação",
  "review",
  "reviews",
  "reclamacao",
  "reclamação",
  "reclame aqui",
  "elogio",
  "reputacao",
  "reputação",
  "atendimento",
  "qualidade",
  "satisfacao",
  "satisfação",
  "google",
  "nota",
  "estrela",
  "estrelas",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isReputationCase(item: { title: string; detail: string | null; category: string; source: string }) {
  const text = normalize(`${item.title} ${item.detail ?? ""}`);
  const category = normalize(item.category);
  const source = normalize(item.source);
  if (["customer", "cliente", "marketing", "support", "suporte"].includes(category)) return true;
  if (["news", "social", "review", "reviews"].includes(source)) {
    return REPUTATION_TERMS.some((term) => text.includes(normalize(term)));
  }
  return REPUTATION_TERMS.some((term) => text.includes(normalize(term)));
}

function resolveState(params: {
  positiveFeedback: number;
  negativeFeedback: number;
  riskSignals: number;
  opportunitySignals: number;
}): JarvisReputationState {
  const feedbackTotal = params.positiveFeedback + params.negativeFeedback;
  const externalTotal = params.riskSignals + params.opportunitySignals;
  if (feedbackTotal + externalTotal === 0) return "insufficient_data";

  const negativeRate = feedbackTotal > 0 ? params.negativeFeedback / feedbackTotal : 0;
  const externalRiskRate = externalTotal > 0 ? params.riskSignals / externalTotal : 0;

  if (negativeRate >= 0.4 || params.riskSignals >= 3 || externalRiskRate >= 0.7) return "risk";
  if (negativeRate >= 0.2 || params.riskSignals > params.opportunitySignals) return "attention";
  if (params.positiveFeedback >= 3 && negativeRate <= 0.1 && params.riskSignals === 0) return "positive";
  return "stable";
}

export async function loadJarvisReputationIntelligence(tenantId: string, windowDays = 90) {
  const now = new Date();
  const since = new Date(now.getTime() - Math.max(7, Math.min(windowDays, 365)) * 24 * 60 * 60 * 1000);

  const [feedbackRows, caseRows] = await Promise.all([
    db
      .select({
        id: entregasTable.id,
        leadId: entregasTable.leadId,
        feedbackStatus: entregasTable.feedbackStatus,
        feedbackMotivo: entregasTable.feedbackMotivo,
        avaliacaoSolicitada: entregasTable.avaliacaoSolicitada,
        feedbackRespondidoEm: entregasTable.feedbackRespondidoEm,
      })
      .from(entregasTable)
      .where(and(
        eq(entregasTable.tenantId, tenantId),
        gte(entregasTable.updatedAt, since),
      ))
      .orderBy(desc(entregasTable.updatedAt))
      .limit(200),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        detail: jarvisCasesTable.detail,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        source: jarvisCasesTable.source,
        confidence: jarvisCasesTable.confidence,
        impact: jarvisCasesTable.impact,
        status: jarvisCasesTable.status,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(and(
        eq(jarvisCasesTable.tenantId, tenantId),
        gte(jarvisCasesTable.updatedAt, since),
      ))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(300),
  ]);

  const answeredFeedback = feedbackRows.filter((item) => item.feedbackStatus === "positivo" || item.feedbackStatus === "negativo");
  const positiveFeedback = answeredFeedback.filter((item) => item.feedbackStatus === "positivo").length;
  const negativeFeedback = answeredFeedback.filter((item) => item.feedbackStatus === "negativo").length;
  const reviewRequests = feedbackRows.filter((item) => item.avaliacaoSolicitada).length;
  const reputationCases = caseRows.filter(isReputationCase);
  const riskSignals = reputationCases.filter((item) => item.severity === "risk").length;
  const opportunitySignals = reputationCases.filter((item) => item.severity === "opportunity").length;
  const attentionSignals = reputationCases.filter((item) => item.severity === "attention").length;

  const state = resolveState({ positiveFeedback, negativeFeedback, riskSignals, opportunitySignals });
  const feedbackCoverage = feedbackRows.length > 0
    ? Math.round((answeredFeedback.length / feedbackRows.length) * 100)
    : 0;

  return {
    generatedAt: now,
    windowDays: Math.max(7, Math.min(windowDays, 365)),
    state,
    summary: {
      deliveriesObserved: feedbackRows.length,
      feedbackAnswered: answeredFeedback.length,
      positiveFeedback,
      negativeFeedback,
      feedbackCoveragePercent: feedbackCoverage,
      reviewRequests,
      reputationSignals: reputationCases.length,
      riskSignals,
      opportunitySignals,
      attentionSignals,
    },
    negativeFeedback: answeredFeedback
      .filter((item) => item.feedbackStatus === "negativo")
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        leadId: item.leadId,
        reason: item.feedbackMotivo,
        respondedAt: item.feedbackRespondidoEm,
      })),
    signals: reputationCases.slice(0, 20).map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      severity: item.severity,
      source: item.source,
      confidence: item.confidence,
      impact: item.impact,
      status: item.status,
      updatedAt: item.updatedAt,
    })),
    caveats: [
      "O estado de reputação é um indicador operacional, não uma nota pública consolidada.",
      "Feedback pós-entrega mede somente clientes que responderam ao fluxo registrado no VendorAI.",
      "Casos Vendor entram apenas quando o texto/categoria/fonte contém contexto reputacional verificável.",
      "Ausência de avaliações externas integradas não significa boa reputação; significa cobertura externa incompleta.",
    ],
  };
}
