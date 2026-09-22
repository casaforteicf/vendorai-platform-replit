export type ColdEvidenceConfidence = "high" | "medium" | "low";

export interface ColdEvidence {
  key: string;
  label: string;
  value: string | number | boolean;
  source: string;
  confidence: ColdEvidenceConfidence;
  observedAt: string;
}

export interface ColdProspectQualityInput {
  segmento: string;
  telefone?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
  websiteUrl?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
  digital: {
    tem_site: boolean;
    site_qualidade: "nenhum" | "simples" | "profissional";
    tem_agendamento_online: boolean;
    tem_ecommerce: boolean;
    presenca_instagram: boolean;
    indicio_crm: boolean;
    presenca_google?: boolean;
  };
  growth: {
    reviews_velocity: number;
    rating_trend: "subindo" | "estavel" | "caindo";
    horario_estendido: boolean;
    multiplas_unidades: boolean;
    contratando: boolean;
    anuncios_ativos: boolean;
  };
  propensityScore: number;
  dispatchThreshold: number;
}

export interface ColdProspectQualityResult {
  ready: boolean;
  status: "ready_for_outreach" | "needs_more_data" | "below_score";
  reasons: string[];
  evidence: ColdEvidence[];
  evidenceCount: number;
  hasValidContact: boolean;
  segmentIdentified: boolean;
  fitScore: number;
  painScore: number;
  requiredEvidence: number;
  playbook: {
    segment: string;
    niche: string;
    focusSignals: string[];
    recommendedModules: string[];
  };
}

const ODONTO_TOKENS = ["odonto", "odontolog", "dent", "implant", "ortodont", "clinica_dental"];

function normalized(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isOdonto(segmento: string): boolean {
  const value = normalized(segmento);
  return ODONTO_TOKENS.some((token) => value.includes(token));
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pushEvidence(
  target: ColdEvidence[],
  key: string,
  label: string,
  value: string | number | boolean | null | undefined,
  source: string,
  confidence: ColdEvidenceConfidence = "high",
): void {
  if (value === null || value === undefined || value === "") return;
  target.push({ key, label, value, source, confidence, observedAt: new Date().toISOString() });
}

export function evaluateColdProspectQuality(input: ColdProspectQualityInput): ColdProspectQualityResult {
  const meta = input.metadata ?? {};
  const evidence: ColdEvidence[] = [];
  const origin = cleanText(meta["origem"]) ?? input.source ?? "prospector";

  if (input.websiteUrl) pushEvidence(evidence, "website", "Site comercial encontrado", input.websiteUrl, "site/public_web");
  if (input.instagramHandle) pushEvidence(evidence, "instagram", "Instagram comercial encontrado", input.instagramHandle, "public_social");
  if (input.digital.presenca_google === true) pushEvidence(evidence, "google_presence", "Presença no Google confirmada", true, "google_places");
  if (input.digital.tem_agendamento_online) pushEvidence(evidence, "online_booking", "Agendamento online detectado", true, "site_scan");
  if (input.growth.anuncios_ativos) pushEvidence(evidence, "active_ads", "Sinal de anúncios ativos", true, origin === "ad_library" ? "meta_ad_library" : "public_ad_signal", origin === "ad_library" ? "high" : "medium");
  if (input.growth.multiplas_unidades) pushEvidence(evidence, "multiple_units", "Múltiplas unidades detectadas", true, "public_business_data", "medium");

  const rating = Number(meta["rating"] ?? 0);
  const totalRatings = Number(meta["total_ratings"] ?? 0);
  if (rating > 0) pushEvidence(evidence, "rating", "Nota pública", rating, "google_places");
  if (totalRatings > 0) pushEvidence(evidence, "reviews", "Avaliações públicas", totalRatings, "google_places");

  const cnpj = cleanText(meta["cnpj"]) ?? cleanText(meta["documento"]);
  if (cnpj) pushEvidence(evidence, "business_registry", "Cadastro empresarial identificado", cnpj, "public_business_registry");

  const constructionSignal = cleanText(meta["construction_signal"]);
  if (constructionSignal) {
    const authority = cleanText(meta["construction_signal_authority"]);
    const sourceUrl = cleanText(meta["construction_signal_url"]);
    const sourceTitle = cleanText(meta["construction_signal_title"]);
    pushEvidence(
      evidence,
      "construction_work_signal",
      "Obra/projeto identificado em fonte pública",
      constructionSignal,
      sourceUrl ?? sourceTitle ?? "construction_radar",
      authority === "oficial" ? "high" : authority === "primaria" ? "medium" : "low",
    );
  }

  const constructionActor = cleanText(meta["construction_actor_name"]);
  if (constructionActor) {
    pushEvidence(
      evidence,
      "construction_actor",
      "Responsável ligado à obra identificado publicamente",
      constructionActor,
      cleanText(meta["construction_signal_url"]) ?? "construction_radar",
      meta["construction_actor_role"] === "responsavel_tecnico" ? "high" : "medium",
    );
  }

  const hasValidContact = Boolean(cleanText(input.telefone) || cleanText(input.email) || cleanText(input.instagramHandle));
  const segmentIdentified = normalized(input.segmento) !== "" && normalized(input.segmento) !== "geral";
  const requiredEvidence = 2;

  let fitScore = 0;
  if (segmentIdentified) fitScore += 30;
  if (hasValidContact) fitScore += 25;
  if (evidence.length >= 2) fitScore += 25;
  if (input.digital.presenca_google) fitScore += 10;
  if (input.websiteUrl || input.instagramHandle) fitScore += 10;
  fitScore = Math.min(100, fitScore);

  let painScore = 20;
  if (!input.digital.indicio_crm) painScore += 20;
  if (!input.digital.tem_agendamento_online && isOdonto(input.segmento)) painScore += 15;
  if (input.growth.anuncios_ativos) painScore += 15;
  if (input.growth.reviews_velocity >= 5) painScore += 10;
  if (input.growth.multiplas_unidades) painScore += 10;
  if (input.digital.site_qualidade === "simples") painScore += 10;
  painScore = Math.min(100, painScore);

  const reasons: string[] = [];
  if (!hasValidContact) reasons.push("sem_contato_utilizavel");
  if (!segmentIdentified) reasons.push("segmento_nao_identificado");
  if (evidence.length < requiredEvidence) reasons.push("evidencias_insuficientes");
  if (input.propensityScore < input.dispatchThreshold) reasons.push("score_abaixo_do_threshold");

  const ready = reasons.length === 0;
  const status = ready
    ? "ready_for_outreach"
    : input.propensityScore < input.dispatchThreshold
      ? "below_score"
      : "needs_more_data";

  const odonto = isOdonto(input.segmento);
  return {
    ready,
    status,
    reasons,
    evidence,
    evidenceCount: evidence.length,
    hasValidContact,
    segmentIdentified,
    fitScore,
    painScore,
    requiredEvidence,
    playbook: odonto
      ? {
          segment: "saude",
          niche: "clinicas_odontologicas",
          focusSignals: ["google_reviews", "website", "instagram", "online_booking", "active_ads", "multiple_units", "commercial_contact"],
          recommendedModules: ["crm", "sdr", "follow_up", "agendamento", "whatsapp", "marketing", "revenue_scout", "jarvis"],
        }
      : {
          segment: input.segmento,
          niche: input.segmento,
          focusSignals: ["google_presence", "website", "instagram", "active_ads", "reviews", "commercial_contact"],
          recommendedModules: ["crm", "sdr", "follow_up", "marketing", "revenue_scout", "jarvis"],
        },
  };
}
