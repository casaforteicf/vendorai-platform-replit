export type MarketingContextForAds = {
  nicheId?: string;
  nicheName?: string;
  productIds?: string[];
  productNames?: string[];
  audienceSegment?: string;
  audienceNiche?: string;
  campaignGoal?: string;
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
  };
}

export function buildAdsAudiencePlan(segmentacao: Segmentacao): AdsAudiencePlan | undefined {
  const context = segmentacao.marketingContext;
  if (!context) return segmentacao.audiencePlan;

  const legacy = parseLegacyContext(clean(context.nicheName));
  const audienceSegment = clean(context.audienceSegment) || legacy.audienceSegment;
  const audienceNiche = clean(context.audienceNiche) || legacy.audienceNiche;
  const campaignGoal = clean(context.campaignGoal) || legacy.campaignGoal;
  const offers = (context.productNames ?? []).map(clean).filter(Boolean);
  const manualKeywords = (segmentacao.audiencias?.termosPesquisa ?? []).map(clean).filter(Boolean);

  const keywords = unique([
    ...manualKeywords,
    ...offers,
    ...offers.flatMap((offer) => [
      audienceNiche && `${offer} ${audienceNiche}`,
      audienceSegment && `${offer} para ${audienceSegment.replace(/\([^)]*\)/g, "").trim()}`,
      campaignGoal && `${offer} ${campaignGoal}`,
    ].filter(Boolean) as string[]),
    audienceNiche,
    campaignGoal,
  ], 15);

  const interestQueries = unique([
    audienceNiche,
    audienceSegment.replace(/\([^)]*\)/g, "").trim(),
    ...offers,
  ], 8);

  if (!keywords.length && !interestQueries.length) return undefined;

  return {
    summary: [
      audienceSegment && `Público: ${audienceSegment}`,
      audienceNiche && `Nicho: ${audienceNiche}`,
      offers.length && `Oferta: ${offers.join(", ")}`,
      campaignGoal && `Objetivo: ${campaignGoal}`,
    ].filter(Boolean).join(" · "),
    google: { keywords },
    meta: { interestQueries },
  };
}

export function enrichAdsSegmentacao(segmentacao: Segmentacao): Segmentacao {
  const audiencePlan = buildAdsAudiencePlan(segmentacao);
  return audiencePlan ? { ...segmentacao, audiencePlan } : segmentacao;
}
