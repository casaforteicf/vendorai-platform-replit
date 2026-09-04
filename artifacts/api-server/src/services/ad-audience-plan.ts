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
};

export type AdsAudiencePlan = {
  summary: string;
  google: { keywords: string[] };
  meta: {
    interestQueries: string[];
    resolvedInterests?: Array<{ id: string; name: string }>;
  };
};

type Segmentacao = {
  audiencias?: { termosPesquisa?: string[]; [key: string]: unknown };
  marketingContext?: MarketingContextForAds;
  audiencePlan?: AdsAudiencePlan;
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
    audienceSegment: find("público:"),
    audienceNiche: find("nicho do público:"),
    campaignGoal: find("objetivo:"),
    location: find("local:"),
    region: find("região/bairro:"),
    project: find("empreendimento/local:"),
  };
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

  // Local, empreendimento e oferta entram como sinais de intenção. Restrições e
  // detalhes livres ficam fora das keywords para não transformar instruções
  // internas em termos de compra ou segmentação.
  const keywords = unique([
    ...manualKeywords,
    ...offers,
    ...offers.flatMap((offer) => [
      audienceNiche && `${offer} ${audienceNiche}`,
      audienceSegment && `${offer} para ${audienceSegment.replace(/\([^)]*\)/g, "").trim()}`,
      location && `${offer} ${location}`,
      region && `${offer} ${region}`,
      project && `${offer} ${project}`,
      campaignGoal && `${offer} ${campaignGoal}`,
    ].filter(Boolean) as string[]),
    audienceNiche && location ? `${audienceNiche} ${location}` : "",
    project && location ? `${project} ${location}` : "",
    audienceNiche,
    project,
    campaignGoal,
  ], 15);

  // Meta resolve interesses por entidades/categorias. Localização específica é
  // preservada no targeting geográfico, não forçada como interesse inexistente.
  const interestQueries = unique([
    audienceNiche,
    audienceSegment.replace(/\([^)]*\)/g, "").trim(),
    ...offers,
  ], 8);

  if (!keywords.length && !interestQueries.length) return undefined;

  return {
    summary: [
      campaignName && `Campanha: ${campaignName}`,
      audienceSegment && `Público: ${audienceSegment}`,
      audienceNiche && `Nicho: ${audienceNiche}`,
      offers.length && `Oferta: ${offers.join(", ")}`,
      campaignGoal && `Objetivo: ${campaignGoal}`,
      location && `Local: ${location}`,
      region && `Região: ${region}`,
      project && `Empreendimento/local: ${project}`,
      details && `Contexto: ${details}`,
      differentiators && `Diferenciais obrigatórios: ${differentiators}`,
      restrictions && `Restrições criativas: ${restrictions}`,
      primaryKpi && `KPI: ${primaryKpi}`,
      context.researchEnabled && "Pesquisa pública: solicitada",
      context.seoTrackingEnabled && "SEO/tracking: habilitado",
    ].filter(Boolean).join(" · "),
    google: { keywords },
    meta: { interestQueries },
  };
}

export function enrichAdsSegmentacao(segmentacao: Segmentacao): Segmentacao {
  const audiencePlan = buildAdsAudiencePlan(segmentacao);
  return audiencePlan ? { ...segmentacao, audiencePlan } : segmentacao;
}
