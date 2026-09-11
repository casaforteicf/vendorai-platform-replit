export type MarketingTrackingPlan = {
  campaignKey?: string;
  utmCampaign?: string;
  conversionGoal?: string;
  channels?: Record<string, { source?: string; medium?: string; content?: string }>;
};

export type MarketingContextForAds = {
  nicheId?: string;
  nicheName?: string;
  productIds?: string[];
  productNames?: string[];
  businessVertical?: string;
  businessVerticalSlug?: string;
  audienceSegment?: string;
  audienceNiche?: string;
  campaignGoal?: string;
  locationCity?: string;
  locationState?: string;
  locationRegion?: string;
  projectName?: string;
  specificDetails?: string;
  mandatoryDifferentiators?: string;
  restrictions?: string;
  primaryKpi?: string;
  researchEnabled?: boolean;
  seoTrackingEnabled?: boolean;
  campaignId?: string;
  campaignName?: string;
  marketingIntelligence?: {
    source?: string;
    keywords?: Array<{ text?: string; avgMonthlySearches?: number; competition?: string }>;
    seo?: { primaryKeyword?: string; secondaryKeywords?: string[] };
    tracking?: MarketingTrackingPlan;
  };
};

export type RemarketingAudienceRule = {
  key: string;
  label: string;
  lookbackDays: number;
  description: string;
  includeSignals: string[];
  excludeSignals?: string[];
  stage: "remarketing" | "nutricao" | "oportunidade" | "prioridade";
};

export type AdsAudiencePlan = {
  summary: string;
  google: { keywords: string[] };
  meta: { interestQueries: string[]; resolvedInterests?: Array<{ id: string; name: string }> };
  remarketing: {
    strategy: "continuous_lead_journey";
    rules: RemarketingAudienceRule[];
    principle: string;
  };
};

type Segmentacao = {
  audiencias?: { termosPesquisa?: string[]; [key: string]: unknown };
  marketingContext?: MarketingContextForAds;
  audiencePlan?: AdsAudiencePlan;
  marketingTracking?: MarketingTrackingPlan;
  [key: string]: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function unique(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = clean(raw).slice(0, 80);
    const key = value.toLocaleLowerCase("pt-BR");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= max) break;
  }
  return result;
}

function parseLegacyContext(label: string) {
  const parts = label.split("|").map((part) => part.trim());
  const find = (prefix: string) => clean(parts.find((part) => part.toLowerCase().startsWith(prefix))?.split(":").slice(1).join(":"));
  return {
    audienceSegment: find("público:"), audienceNiche: find("nicho do público:"), campaignGoal: find("objetivo:"),
    location: find("local:"), region: find("região/bairro:"), project: find("empreendimento/local:"),
  };
}

function buildRemarketingRules(offers: string[]): RemarketingAudienceRule[] {
  const productLabel = offers[0] ? ` de ${offers[0]}` : "";
  return [
    {
      key: "all_visitors_30d", label: "Todos os visitantes · 30 dias", lookbackDays: 30,
      description: `Reimpactar quem visitou o site${productLabel} e ainda não converteu.`,
      includeSignals: ["Todos os visitantes"], excludeSignals: ["Converteu"], stage: "remarketing",
    },
    {
      key: "returning_visitors_30d", label: "Visitantes recorrentes · 30 dias", lookbackDays: 30,
      description: "Pessoas que voltaram ao site e demonstraram continuidade de interesse.",
      includeSignals: ["Visitantes recorrentes"], excludeSignals: ["Converteu"], stage: "nutricao",
    },
    {
      key: "pricing_high_intent_30d", label: "Preços + alta intenção · 30 dias", lookbackDays: 30,
      description: "Público de decisão: preços, orçamento, proposta, CTA ou score comercial alto.",
      includeSignals: ["Visitou preços", "Alta intenção", "Clicou em CTA"], excludeSignals: ["Converteu"], stage: "oportunidade",
    },
    {
      key: "form_abandon_14d", label: "Abandonou formulário · 14 dias", lookbackDays: 14,
      description: "Recuperar quem iniciou um formulário e não concluiu.",
      includeSignals: ["Abandonou formulário"], excludeSignals: ["Converteu"], stage: "prioridade",
    },
    {
      key: "converted_exclusion_180d", label: "Convertidos · exclusão", lookbackDays: 180,
      description: "Evita continuar campanhas de aquisição para quem já converteu; pode alimentar pós-venda e novas ofertas.",
      includeSignals: ["Converteu"], stage: "nutricao",
    },
  ];
}

export function buildAdsAudiencePlan(segmentacao: Segmentacao): AdsAudiencePlan | undefined {
  const context = segmentacao.marketingContext;
  if (!context) return segmentacao.audiencePlan;

  const legacy = parseLegacyContext(clean(context.nicheName));
  const audienceSegment = clean(context.audienceSegment) || legacy.audienceSegment;
  const audienceNiche = clean(context.audienceNiche) || legacy.audienceNiche;
  const campaignGoal = clean(context.campaignGoal) || legacy.campaignGoal;
  const city = clean(context.locationCity);
  const state = clean(context.locationState);
  const region = clean(context.locationRegion) || legacy.region;
  const project = clean(context.projectName) || legacy.project;
  const location = [city, state].filter(Boolean).join(" ") || legacy.location.replace("/", " ");
  const details = clean(context.specificDetails);
  const differentiators = clean(context.mandatoryDifferentiators);
  const restrictions = clean(context.restrictions);
  const primaryKpi = clean(context.primaryKpi);
  const campaignName = clean(context.campaignName);
  const offers = (context.productNames ?? []).map(clean).filter(Boolean);
  const manualKeywords = (segmentacao.audiencias?.termosPesquisa ?? []).map(clean).filter(Boolean);
  const intelligence = context.marketingIntelligence;
  const intelligenceKeywords = [
    clean(intelligence?.seo?.primaryKeyword),
    ...(intelligence?.seo?.secondaryKeywords ?? []).map(clean),
    ...(intelligence?.keywords ?? []).map((item) => clean(item?.text)),
  ].filter(Boolean);

  const keywords = unique([
    ...manualKeywords, ...intelligenceKeywords, ...offers,
    ...offers.flatMap((offer) => [
      audienceNiche && `${offer} ${audienceNiche}`,
      audienceSegment && `${offer} para ${audienceSegment.replace(/\([^)]*\)/g, "").trim()}`,
      location && `${offer} ${location}`, region && `${offer} ${region}`, project && `${offer} ${project}`,
      campaignGoal && `${offer} ${campaignGoal}`,
    ].filter(Boolean) as string[]),
    audienceNiche && location ? `${audienceNiche} ${location}` : "",
    project && location ? `${project} ${location}` : "", audienceNiche, project, campaignGoal,
  ], 15);

  const interestQueries = unique([
    audienceNiche, audienceSegment.replace(/\([^)]*\)/g, "").trim(), ...offers,
  ], 8);

  const remarketing = {
    strategy: "continuous_lead_journey" as const,
    rules: buildRemarketingRules(offers),
    principle: "A campanha termina; a jornada do lead continua. O histórico comportamental permanece elegível para futuras campanhas compatíveis.",
  };

  if (!keywords.length && !interestQueries.length && !context.campaignId && !campaignName) return undefined;

  return {
    summary: [
      campaignName && `Campanha: ${campaignName}`, audienceSegment && `Público: ${audienceSegment}`,
      audienceNiche && `Nicho: ${audienceNiche}`, offers.length && `Oferta: ${offers.join(", ")}`,
      campaignGoal && `Objetivo: ${campaignGoal}`, location && `Local: ${location}`, region && `Região: ${region}`,
      project && `Empreendimento/local: ${project}`, details && `Contexto: ${details}`,
      differentiators && `Diferenciais obrigatórios: ${differentiators}`,
      restrictions && `Restrições criativas: ${restrictions}`, primaryKpi && `KPI: ${primaryKpi}`,
      clean(intelligence?.seo?.primaryKeyword) && `Keyword principal: ${clean(intelligence?.seo?.primaryKeyword)}`,
      clean(intelligence?.tracking?.utmCampaign) && `Tracking mestre: ${clean(intelligence?.tracking?.utmCampaign)}`,
      context.researchEnabled && "Pesquisa pública: solicitada", context.seoTrackingEnabled && "SEO/tracking: habilitado",
      "Remarketing comportamental: planejado",
    ].filter(Boolean).join(" · "),
    google: { keywords }, meta: { interestQueries }, remarketing,
  };
}

export function enrichAdsSegmentacao(segmentacao: Segmentacao): Segmentacao {
  const audiencePlan = buildAdsAudiencePlan(segmentacao);
  const marketingTracking = segmentacao.marketingContext?.marketingIntelligence?.tracking;
  if (!audiencePlan && !marketingTracking) return segmentacao;
  return { ...segmentacao, ...(audiencePlan ? { audiencePlan } : {}), ...(marketingTracking ? { marketingTracking } : {}) };
}
