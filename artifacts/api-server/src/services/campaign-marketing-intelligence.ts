import { createHash } from "node:crypto";
import { logger } from "../lib/logger.js";
import {
  getGoogleAdsConnectionByTenantId,
  refreshGoogleAdsToken,
} from "./google-ads-oauth.js";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];

export type MarketingResearchKeyword = {
  text: string;
  avgMonthlySearches?: number;
  competition?: string;
  competitionIndex?: number;
  lowTopOfPageBidMicros?: number;
  highTopOfPageBidMicros?: number;
};

export type MarketingIntelligenceContext = {
  nicheId?: string;
  nicheName?: string;
  productIds?: string[];
  productNames?: string[];
  businessVertical?: string;
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
};

export type MarketingIntelligencePack = {
  version: 1;
  generatedAt: string;
  source: "google_ads_keyword_planner" | "briefing_internal";
  providerStatus: {
    googleAdsConnected: boolean;
    googleAdsUsed: boolean;
    geoTarget?: {
      resourceName: string;
      name?: string;
      targetType?: string;
    };
  };
  seedKeywords: string[];
  keywords: MarketingResearchKeyword[];
  seo: {
    primaryKeyword: string;
    secondaryKeywords: string[];
    title: string;
    metaDescription: string;
    slug: string;
    h1: string;
    h2: string[];
    faq: Array<{ question: string; answer: string }>;
    imageAlt: string[];
  };
  tracking: {
    campaignKey: string;
    utmCampaign: string;
    conversionGoal?: string;
    channels: Record<string, { source: string; medium: string; content: string }>;
  };
  warnings: string[];
};

type BuildPackInput = {
  tenantId: string;
  campaignId?: string;
  campaignName?: string;
  context: MarketingIntelligenceContext;
  countryCode?: string;
};

type GoogleAdsConnection = Awaited<ReturnType<typeof getGoogleAdsConnectionByTenantId>>;

type GeoSuggestionResponse = {
  geoTargetConstantSuggestions?: Array<{
    geoTargetConstant?: {
      resourceName?: string;
      name?: string;
      countryCode?: string;
      targetType?: string;
      status?: string;
    };
    searchTerm?: string;
  }>;
};

type KeywordIdeasResponse = {
  results?: Array<{
    text?: string;
    keywordIdeaMetrics?: {
      avgMonthlySearches?: string | number;
      competition?: string;
      competitionIndex?: string | number;
      lowTopOfPageBidMicros?: string | number;
      highTopOfPageBidMicros?: string | number;
    };
  }>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function unique(values: string[], max = 20): string[] {
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

function slugify(value: string): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function truncate(value: string, max: number): string {
  const text = clean(value);
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)).replace(/[\s,;:.-]+$/g, "") + "…";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeCountryCode(value: string | undefined): string {
  const code = clean(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "BR";
}

function languageForCountry(countryCode: string) {
  if (countryCode === "BR") return { resourceName: "languageConstants/1014", locale: "pt_BR" };
  return { resourceName: "languageConstants/1003", locale: `es_${countryCode}` };
}

function buildSeeds(context: MarketingIntelligenceContext): string[] {
  const offers = Array.isArray(context.productNames) ? context.productNames.map(clean).filter(Boolean) : [];
  const audience = clean(context.audienceNiche);
  const city = clean(context.locationCity);
  const region = clean(context.locationRegion);
  const project = clean(context.projectName);
  const business = clean(context.businessVertical);

  const baseOffers = offers.length ? offers : [business, audience].filter(Boolean);
  return unique([
    ...baseOffers,
    ...baseOffers.flatMap((offer) => [
      city && `${offer} ${city}`,
      city && `${offer} em ${city}`,
      region && `${offer} ${region}`,
      audience && `${offer} ${audience}`,
      project && `${offer} ${project}`,
    ].filter(Boolean) as string[]),
    audience && city ? `${audience} ${city}` : "",
    project && city ? `${project} ${city}` : "",
  ], 10);
}

function fallbackKeywords(seeds: string[]): MarketingResearchKeyword[] {
  return unique(seeds, 15).map((text) => ({ text }));
}

async function getReadyGoogleAdsConnection(tenantId: string): Promise<GoogleAdsConnection> {
  let connection = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!connection || connection.status !== "active" || !connection.customerId) return connection;

  const expiresSoon = !connection.accessToken
    || !connection.tokenExpiresAt
    || connection.tokenExpiresAt.getTime() <= Date.now() + 60_000;
  if (expiresSoon && connection.refreshToken) {
    try {
      await refreshGoogleAdsToken(connection.id);
      connection = await getGoogleAdsConnectionByTenantId(tenantId);
    } catch (error) {
      logger.warn({ tenantId, error }, "marketing intelligence: falha ao renovar token Google Ads");
    }
  }
  return connection;
}

function googleHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
}

async function resolveGeoTarget(args: {
  accessToken: string;
  city: string;
  countryCode: string;
}): Promise<{ resourceName: string; name?: string; targetType?: string } | undefined> {
  if (!args.city || !GOOGLE_ADS_DEVELOPER_TOKEN) return undefined;
  const { locale } = languageForCountry(args.countryCode);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${GOOGLE_ADS_API_BASE}/geoTargetConstants:suggest`, {
      method: "POST",
      headers: googleHeaders(args.accessToken),
      signal: controller.signal,
      body: JSON.stringify({
        locale,
        countryCode: args.countryCode,
        locationNames: { names: [args.city] },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, body: body.slice(0, 800) }, "marketing intelligence: geo target indisponível");
      return undefined;
    }
    const data = await response.json() as GeoSuggestionResponse;
    const suggestions = data.geoTargetConstantSuggestions ?? [];
    const normalizedCity = slugify(args.city);
    const best = suggestions.find((item) => {
      const target = item.geoTargetConstant;
      return target?.resourceName
        && slugify(target.name ?? "") === normalizedCity
        && (target.targetType?.toLowerCase() === "city" || !target.targetType);
    }) ?? suggestions.find((item) => item.geoTargetConstant?.resourceName);
    const target = best?.geoTargetConstant;
    if (!target?.resourceName) return undefined;
    return { resourceName: target.resourceName, name: target.name, targetType: target.targetType };
  } catch (error) {
    logger.warn({ error }, "marketing intelligence: erro ao consultar geo target Google Ads");
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function researchGoogleAds(args: {
  connection: NonNullable<GoogleAdsConnection>;
  seeds: string[];
  city: string;
  countryCode: string;
}): Promise<{
  keywords: MarketingResearchKeyword[];
  geoTarget?: { resourceName: string; name?: string; targetType?: string };
}> {
  if (!args.connection.customerId || !args.connection.accessToken || !GOOGLE_ADS_DEVELOPER_TOKEN || args.seeds.length === 0) {
    return { keywords: [] };
  }

  const geoTarget = await resolveGeoTarget({
    accessToken: args.connection.accessToken,
    city: args.city,
    countryCode: args.countryCode,
  });
  const { resourceName: language } = languageForCountry(args.countryCode);
  const customerId = args.connection.customerId.replace(/\D/g, "");
  const body: Record<string, unknown> = {
    language,
    includeAdultKeywords: false,
    keywordPlanNetwork: "GOOGLE_SEARCH",
    keywordSeed: { keywords: args.seeds },
    pageSize: 40,
  };
  if (geoTarget?.resourceName) body["geoTargetConstants"] = [geoTarget.resourceName];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}:generateKeywordIdeas`, {
      method: "POST",
      headers: googleHeaders(args.connection.accessToken),
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Google Ads Keyword Planner ${response.status}: ${errorBody.slice(0, 1000)}`);
    }
    const data = await response.json() as KeywordIdeasResponse;
    const mapped = (data.results ?? [])
      .map((item): MarketingResearchKeyword | null => {
        const text = clean(item.text);
        if (!text) return null;
        const metrics = item.keywordIdeaMetrics ?? {};
        return {
          text,
          avgMonthlySearches: asNumber(metrics.avgMonthlySearches),
          competition: clean(metrics.competition) || undefined,
          competitionIndex: asNumber(metrics.competitionIndex),
          lowTopOfPageBidMicros: asNumber(metrics.lowTopOfPageBidMicros),
          highTopOfPageBidMicros: asNumber(metrics.highTopOfPageBidMicros),
        };
      })
      .filter((item): item is MarketingResearchKeyword => Boolean(item));

    const deduped = new Map<string, MarketingResearchKeyword>();
    for (const keyword of mapped) {
      const key = keyword.text.toLocaleLowerCase("pt-BR");
      const previous = deduped.get(key);
      if (!previous || (keyword.avgMonthlySearches ?? 0) > (previous.avgMonthlySearches ?? 0)) {
        deduped.set(key, keyword);
      }
    }
    return {
      geoTarget,
      keywords: [...deduped.values()]
        .sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0))
        .slice(0, 20),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSeoPack(context: MarketingIntelligenceContext, keywords: MarketingResearchKeyword[]) {
  const offers = Array.isArray(context.productNames) ? context.productNames.map(clean).filter(Boolean) : [];
  const offer = offers[0] || clean(context.businessVertical) || clean(context.audienceNiche) || "solução";
  const city = clean(context.locationCity);
  const state = clean(context.locationState);
  const location = [city, state].filter(Boolean).join("/");
  const audience = clean(context.audienceNiche) || clean(context.audienceSegment);
  const primaryKeyword = clean(keywords[0]?.text) || clean(city ? `${offer} ${city}` : offer);
  const secondaryKeywords = unique(keywords.slice(1).map((item) => item.text), 8);
  const business = clean(context.businessVertical);

  const titleBase = location ? `${offer} em ${location}` : offer;
  const title = truncate(business && slugify(business) !== slugify(offer) ? `${titleBase} | ${business}` : titleBase, 60);
  const goal = clean(context.campaignGoal);
  const metaDescription = truncate([
    `Conheça ${offer}${location ? ` em ${location}` : ""}.`,
    audience ? `Solução direcionada a ${audience}.` : "",
    goal ? `${goal}.` : "Solicite mais informações e fale com a equipe.",
  ].filter(Boolean).join(" "), 155);

  const h2 = unique([
    `Por que considerar ${offer}`,
    location ? `${offer} em ${location}` : "",
    audience ? `${offer} para ${audience}` : "",
    "Como solicitar informações ou orçamento",
  ], 4);

  const differentiators = clean(context.mandatoryDifferentiators);
  const faq = [
    {
      question: `Como solicitar informações sobre ${offer}${location ? ` em ${location}` : ""}?`,
      answer: "Use o canal de atendimento indicado na página para conversar com a equipe e informar o que você precisa.",
    },
    ...(audience ? [{
      question: `Para quem ${offer} é indicado?`,
      answer: `Esta campanha foi preparada para ${audience}. A adequação final depende da necessidade específica de cada interessado.`,
    }] : []),
    ...(differentiators ? [{
      question: `Quais diferenciais estão sendo destacados nesta campanha?`,
      answer: `Os diferenciais informados no briefing são: ${differentiators}.`,
    }] : []),
  ].slice(0, 3);

  return {
    primaryKeyword,
    secondaryKeywords,
    title,
    metaDescription,
    slug: slugify(primaryKeyword || titleBase),
    h1: titleBase,
    h2,
    faq,
    imageAlt: unique([
      `${offer}${location ? ` em ${location}` : ""}`,
      audience ? `${offer} para ${audience}` : "",
      clean(context.projectName) ? `${offer} — ${clean(context.projectName)}` : "",
    ], 4),
  };
}

function buildTrackingPack(input: BuildPackInput, primaryKeyword: string) {
  const offer = Array.isArray(input.context.productNames) ? clean(input.context.productNames[0]) : "";
  const baseName = clean(input.campaignName) || clean(input.context.campaignGoal) || offer || "campanha";
  const fingerprint = createHash("sha256")
    .update([input.tenantId, input.campaignId ?? "draft", baseName, clean(input.context.locationCity)].join("|"))
    .digest("hex")
    .slice(0, 8);
  const campaignKey = `${slugify(baseName) || "campanha"}-${fingerprint}`.slice(0, 80);
  const content = (channel: string) => `${channel}-${fingerprint}`;
  return {
    campaignKey,
    utmCampaign: campaignKey,
    conversionGoal: clean(input.context.primaryKpi) || clean(input.context.campaignGoal) || undefined,
    channels: {
      site: { source: "site", medium: "owned", content: content("site") },
      landing_page: { source: "landing-page", medium: "owned", content: content("lp") },
      instagram: { source: "instagram", medium: "organic_social", content: content("instagram") },
      instagram_ads: { source: "instagram", medium: "paid_social", content: content("instagram-ads") },
      facebook_ads: { source: "facebook", medium: "paid_social", content: content("facebook-ads") },
      tiktok: { source: "tiktok", medium: "organic_social", content: content("tiktok") },
      linkedin: { source: "linkedin", medium: "organic_social", content: content("linkedin") },
      youtube: { source: "youtube", medium: "video", content: content("youtube") },
      google_ads: { source: "google", medium: "cpc", content: content("google-ads") },
      whatsapp: { source: "whatsapp", medium: "messaging", content: content("whatsapp") },
      email: { source: "email", medium: "email", content: content("email") },
      keyword_term: { source: "google", medium: "organic", content: slugify(primaryKeyword).slice(0, 60) || content("keyword") },
    },
  };
}

export async function buildCampaignMarketingIntelligence(input: BuildPackInput): Promise<MarketingIntelligencePack> {
  const countryCode = normalizeCountryCode(input.countryCode);
  const seeds = buildSeeds(input.context);
  if (!seeds.length) throw new Error("Defina ao menos uma oferta, nicho ou negócio antes de pesquisar.");

  const warnings: string[] = [];
  const connection = await getReadyGoogleAdsConnection(input.tenantId);
  const googleAdsConnected = Boolean(connection?.status === "active" && connection.customerId && connection.accessToken);
  let googleAdsUsed = false;
  let geoTarget: MarketingIntelligencePack["providerStatus"]["geoTarget"];
  let keywords = fallbackKeywords(seeds);

  if (input.context.researchEnabled === true && googleAdsConnected && connection) {
    try {
      const researched = await researchGoogleAds({
        connection,
        seeds,
        city: clean(input.context.locationCity),
        countryCode,
      });
      if (researched.keywords.length > 0) {
        keywords = researched.keywords;
        googleAdsUsed = true;
        geoTarget = researched.geoTarget;
      } else {
        warnings.push("O Google Ads não retornou volume suficiente; o plano foi montado com os termos do briefing.");
      }
    } catch (error) {
      logger.warn({ tenantId: input.tenantId, error }, "marketing intelligence: Keyword Planner indisponível");
      warnings.push("A pesquisa do Google Ads ficou indisponível nesta execução; o plano interno foi mantido sem inventar métricas.");
    }
  } else if (input.context.researchEnabled === true && !googleAdsConnected) {
    warnings.push("Conecte uma conta Google Ads ativa para incluir volume, concorrência e faixas de lance do Keyword Planner.");
  }

  if (clean(input.context.projectName)) {
    warnings.push("O empreendimento/local é tratado como contexto informado pelo usuário; esta etapa não valida fatos públicos sobre ele.");
  }

  const seo = buildSeoPack(input.context, keywords);
  const tracking = buildTrackingPack(input, seo.primaryKeyword);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: googleAdsUsed ? "google_ads_keyword_planner" : "briefing_internal",
    providerStatus: { googleAdsConnected, googleAdsUsed, geoTarget },
    seedKeywords: seeds,
    keywords,
    seo,
    tracking,
    warnings,
  };
}
