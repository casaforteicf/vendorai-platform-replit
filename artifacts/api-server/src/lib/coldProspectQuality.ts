export type ColdEvidenceConfidence = "high" | "medium" | "low";
export type ColdOutreachChannel = "whatsapp" | "instagram" | "email";

export interface ColdOutreachChannelPlan {
  channel: ColdOutreachChannel;
  available: boolean;
  autoExecutable: boolean;
  reason: string;
}

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
  instagramScopedId?: string | null;
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
  hasExecutableChannel: boolean;
  preferredChannel: ColdOutreachChannel | null;
  channels: ColdOutreachChannelPlan[];
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

function normalized(value: string | null | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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

  const phone = cleanText(input.telefone);
  const email = cleanText(input.email);
  const instagramHandle = cleanText(input.instagramHandle);
  const instagramScopedId = cleanText(input.instagramScopedId);

  // "Contato encontrado" e "canal que o sistema consegue executar agora" são
  // conceitos diferentes. Um @ público do Instagram, por exemplo, não permite
  // DM fria pela API da Meta sem um scoped id prévio. E-mail continua sendo
  // preservado como opção comercial, mas o transporte automático ainda não é
  // executado pelo Prospecctor.
  const channels: ColdOutreachChannelPlan[] = [
    {
      channel: "whatsapp",
      available: Boolean(phone),
      autoExecutable: Boolean(phone),
      reason: phone ? "telefone_comercial_disponivel" : "sem_telefone",
    },
    {
      channel: "instagram",
      available: Boolean(instagramHandle || instagramScopedId),
      autoExecutable: false,
      reason: instagramScopedId
        ? "instagram_disponivel_mas_cadencia_automatica_ainda_nao_habilitada"
        : instagramHandle
          ? "handle_publico_sem_permissao_de_dm_automatica"
          : "sem_instagram",
    },
    {
      channel: "email",
      available: Boolean(email),
      autoExecutable: false,
      reason: email ? "email_disponivel_transporte_prospector_pendente" : "sem_email",
    },
  ];

  const hasValidContact = channels.some((item) => item.available);
  const executableChannels = channels.filter((item) => item.autoExecutable);
  const hasExecutableChannel = executableChannels.length > 0;
  const preferredChannel =
    executableChannels.find((item) => item.channel === "whatsapp")?.channel ??
    executableChannels.find((item) => item.channel === "instagram")?.channel ??
    channels.find((item) => item.available)?.channel ??
    null;

  const segmentIdentified = normalized(input.segmento) !== "" && normalized(input.segmento) !== "geral";
  const requiredEvidence = 2;

  let fitScore = 0;
  if (segmentIdentified) fitScore += 30;
  if (hasValidContact) fitScore += 25;
  if (evidence.length >= 2) fitScore += 25;
  if (input.digital.presenca_google) fitScore += 10;
  if (input.websiteUrl || input.instagramHandle) fitScore += 10;
  fitScore = Math.min(100, fitScore);

  // Score universal: não embute regras de um nicho específico no núcleo.
  // Pesos específicos de segmento devem vir do tenant/preset, não deste gate.
  let painScore = 20;
  if (!input.digital.indicio_crm) painScore += 15;
  if (input.growth.anuncios_ativos) painScore += 15;
  if (input.growth.reviews_velocity >= 5) painScore += 10;
  if (input.growth.multiplas_unidades) painScore += 10;
  if (input.digital.site_qualidade === "simples") painScore += 10;
  painScore = Math.min(100, painScore);

  const reasons: string[] = [];
  if (!hasValidContact) reasons.push("sem_contato_utilizavel");
  else if (!hasExecutableChannel) reasons.push("sem_canal_automatico_executavel");
  if (!segmentIdentified) reasons.push("segmento_nao_identificado");
  if (evidence.length < requiredEvidence) reasons.push("evidencias_insuficientes");
  if (input.propensityScore < input.dispatchThreshold) reasons.push("score_abaixo_do_threshold");

  const ready = reasons.length === 0;
  const status = ready
    ? "ready_for_outreach"
    : input.propensityScore < input.dispatchThreshold
      ? "below_score"
      : "needs_more_data";

  const configuredFocusSignals = stringArray(meta["prospector_focus_signals"]);
  const configuredModules = stringArray(meta["prospector_recommended_modules"]);

  return {
    ready,
    status,
    reasons,
    evidence,
    evidenceCount: evidence.length,
    hasValidContact,
    hasExecutableChannel,
    preferredChannel,
    channels,
    segmentIdentified,
    fitScore,
    painScore,
    requiredEvidence,
    playbook: {
      segment: input.segmento,
      niche: cleanText(meta["prospector_niche"]) ?? input.segmento,
      focusSignals: configuredFocusSignals.length > 0
        ? configuredFocusSignals
        : ["google_presence", "website", "instagram", "active_ads", "reviews", "commercial_contact"],
      recommendedModules: configuredModules.length > 0
        ? configuredModules
        : ["crm", "sdr", "follow_up", "marketing", "revenue_scout"],
    },
  };
}
