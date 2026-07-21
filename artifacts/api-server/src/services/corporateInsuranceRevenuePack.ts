/**
 * Industry Pack do Revenue Scout para corretoras de seguros corporativos.
 *
 * O Core permanece genérico. Este módulo concentra catálogo, matriz conta ×
 * produto, renovação, whitespace, limites de autonomia e guardrails do vertical.
 */

export const INSURANCE_PRODUCTS = [
  "frota",
  "vida_grupo",
  "saude_odonto",
  "patrimonial",
  "rc_geral",
  "do",
  "cyber",
  "transporte_carga",
  "engenharia_obra",
  "garantia",
  "previdencia_beneficios",
] as const;

export type InsuranceProduct = (typeof INSURANCE_PRODUCTS)[number];

export const ACCOUNT_PRODUCT_STAGES = [
  "nao_aplicavel",
  "whitespace",
  "prospeccao",
  "qualificacao",
  "proposta_enviada",
  "negociacao",
  "ativo",
  "risco_renovacao",
  "fechado_perdido",
  "cancelado",
] as const;

export type AccountProductStage = (typeof ACCOUNT_PRODUCT_STAGES)[number];

export const INSURANCE_OPPORTUNITY_TYPES = [
  "renovacao",
  "risco_nao_renovacao",
  "whitespace",
  "novo_negocio",
  "upsell_evento",
  "consolidacao_apolices",
  "revisao_subseguro",
  "recuperacao_pos_sinistro",
] as const;

export type InsuranceOpportunityType = (typeof INSURANCE_OPPORTUNITY_TYPES)[number];

export type RenewalWindow = "90_dias" | "60_dias" | "30_dias" | "10_dias" | "vencido" | "fora_janela";

export function renewalWindow(expiresAt: Date, now = new Date()): RenewalWindow {
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return "fora_janela";
  if (days < 0) return "vencido";
  if (days <= 10) return "10_dias";
  if (days <= 30) return "30_dias";
  if (days <= 60) return "60_dias";
  if (days <= 90) return "90_dias";
  return "fora_janela";
}

export interface InsuranceRiskInput {
  expiresAt: Date;
  now?: Date;
  claimOpen?: boolean;
  highLossRatio?: boolean;
  competitiveSignal?: boolean;
  unresolvedComplaint?: boolean;
  operationalDelay?: boolean;
  estimatedRevenue?: number;
  profileFit?: number;
  externalEventAgeDays?: number;
}

export interface InsuranceScoreResult {
  score: number;
  priority: "critica" | "alta" | "media" | "acompanhar";
  humanRequired: boolean;
  blocked: boolean;
  reasons: string[];
}

export function scoreInsuranceOpportunity(input: InsuranceRiskInput): InsuranceScoreResult {
  const window = renewalWindow(input.expiresAt, input.now);
  const reasons: string[] = [];
  let score: number = ({ vencido: 100, "10_dias": 90, "30_dias": 75, "60_dias": 60, "90_dias": 45, fora_janela: 20 } as const)[window];

  if (input.highLossRatio) { score += 10; reasons.push("sinistralidade_alta"); }
  if (input.competitiveSignal) { score += 15; reasons.push("risco_competitivo"); }
  if (input.unresolvedComplaint) { score += 15; reasons.push("reclamacao_nao_resolvida"); }
  if (input.operationalDelay) { score += 10; reasons.push("prazo_avancou_sem_acao"); }
  if ((input.profileFit ?? 0) >= 80) { score += 5; reasons.push("forte_aderencia_ao_perfil"); }
  if ((input.externalEventAgeDays ?? 999) <= 30) { score += 5; reasons.push("evento_externo_recente"); }

  const blocked = Boolean(input.claimOpen || input.unresolvedComplaint);
  if (input.claimOpen) reasons.push("sinistro_em_aberto");

  score = Math.min(score, 100);
  return {
    score,
    priority: score >= 90 ? "critica" : score >= 70 ? "alta" : score >= 45 ? "media" : "acompanhar",
    humanRequired: blocked || Boolean(input.highLossRatio || input.competitiveSignal || window === "10_dias" || window === "vencido"),
    blocked,
    reasons,
  };
}

/**
 * No lançamento, toda renovação fica limitada ao nível 3. Casos de risco
 * permanecem no máximo no nível 3 mesmo após evolução geral do tenant.
 */
export function insuranceAutonomyCap(input: {
  requestedLevel: number;
  launchMode: boolean;
  competitiveRisk?: boolean;
  highLossRatio?: boolean;
  healthData?: boolean;
  claimSupport?: boolean;
}): number {
  if (input.healthData) return Math.min(input.requestedLevel, 2);
  if (input.claimSupport) return Math.min(input.requestedLevel, 2);
  if (input.launchMode || input.competitiveRisk || input.highLossRatio) {
    return Math.min(input.requestedLevel, 3);
  }
  return Math.min(Math.max(input.requestedLevel, 1), 6);
}

const SENSITIVE_HEALTH_TERMS = [
  "diagnostico",
  "diagnóstico",
  "doenca",
  "doença",
  "cid",
  "tratamento individual",
  "condicao de saude",
  "condição de saúde",
];

const SENSITIVE_COLD_OUTREACH_TERMS = [
  "processo judicial",
  "acao judicial",
  "ação judicial",
  "vimos que sua empresa foi processada",
];

export function validateInsuranceMessage(message: string, context: {
  healthProduct?: boolean;
  coldOutreach?: boolean;
}): { allowed: boolean; violations: string[] } {
  const normalized = message.toLocaleLowerCase("pt-BR");
  const violations: string[] = [];

  if (context.healthProduct && SENSITIVE_HEALTH_TERMS.some((term) => normalized.includes(term))) {
    violations.push("dado_sensivel_saude");
  }
  if (context.coldOutreach && SENSITIVE_COLD_OUTREACH_TERMS.some((term) => normalized.includes(term))) {
    violations.push("gatilho_sensivel_em_abordagem_fria");
  }

  return { allowed: violations.length === 0, violations };
}

export const PRODUCT_VOCABULARY: Record<InsuranceProduct, {
  tone: string;
  keywords: readonly string[];
}> = {
  frota: { tone: "operacional", keywords: ["disponibilidade", "veiculos", "sinistro"] },
  vida_grupo: { tone: "cuidado", keywords: ["colaboradores", "cobertura", "dependentes"] },
  saude_odonto: { tone: "bem_estar", keywords: ["rede credenciada", "vidas", "beneficio"] },
  patrimonial: { tone: "protecao_de_ativos", keywords: ["reposicao", "incendio", "roubo"] },
  rc_geral: { tone: "exposicao_juridica", keywords: ["terceiros", "responsabilidade", "risco"] },
  do: { tone: "governanca", keywords: ["diretoria", "reputacao", "gestao"] },
  cyber: { tone: "continuidade", keywords: ["dados", "lgpd", "incidente"] },
  transporte_carga: { tone: "logistica", keywords: ["rota", "mercadoria", "entrega"] },
  engenharia_obra: { tone: "tecnico", keywords: ["cronograma", "obra", "responsabilidade"] },
  garantia: { tone: "contratual", keywords: ["licitacao", "edital", "prazo"] },
  previdencia_beneficios: { tone: "retencao", keywords: ["beneficio", "longo prazo", "colaboradores"] },
};
