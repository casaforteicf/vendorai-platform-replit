// Publicação real de campanha na API do Google Ads — o elo que faltava
// entre "rascunho aprovado" (ad_campaigns) e uma campanha de verdade
// rodando na conta do lojista. Antes desse arquivo, o sistema só criava
// o rascunho local; nada nunca chegava na API do Google Ads.
//
// Segurança em duas etapas, seguindo a regra do sistema de nunca gastar
// dinheiro sozinho: publishCampaignToGoogleAds() cria TUDO pausado
// (campanha, ad group, anúncio) — publicar não liga o gasto. Só
// activateGoogleAdsCampaign(), chamado à parte por ação explícita do
// lojista, de fato habilita a veiculação.
//
// Implementado só pra tipoAnuncio='rsa_pmax' (Search) nessa passada.
// Shopping precisa de conta Merchant Center vinculada (fluxo próprio,
// ainda não construído) e Imagem/Vídeo precisam de Performance Max
// asset groups (estrutura de API bem diferente, também não construído)
// — ambos retornam erro claro em vez de tentar publicar errado.
import { and, eq } from "drizzle-orm";
import {
  db,
  adCampaignsTable,
  adCreativesTable,
  generatedSitesTable,
  tenantsTable,
  businessProfilesTable,
  type AdCampaign,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { resolveWhatsappAdCtaCopy, resolveWhatsappAdCtaUrl } from "./whatsapp-ad-cta.js";
import { buildResumoItem } from "../lib/adItemSummary.js";
import {
  getGoogleAdsConnectionByTenantId,
  refreshGoogleAdsToken,
} from "./google-ads-oauth.js";

// Mesma versão de google-ads-oauth.ts — ver comentário lá sobre sunset.
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];

// Brasil (geoTargetConstants/2076) + Português (languageConstants/1014) —
// alvo padrão fixo nessa primeira versão. Segmentação fina por
// cidade/raio (campanha.segmentacao.localizacao) fica pra quando o
// motor de recomendação entrar — precisa de GeoTargetConstantService
// pra resolver nome de cidade -> geo target constant, escopo maior.
const LANGUAGE_PORTUGUES = "languageConstants/1014";

class GoogleAdsPublishError extends Error {}

// Traduz os erros mais comuns da API do Google Ads pra uma frase clara
// em português — o padrão até aqui era jogar o JSON cru na tela
// (confuso mesmo pra quem entende de API, pior ainda pro lojista). Cai
// no texto original truncado só quando não reconhece o código —
// prefere mostrar algo real (mesmo que feio) a inventar uma explicação
// pra um erro que não foi checado de verdade.
function traduzirErroGoogleAds(status: number, rawBody: string): string {
  let codigos: string[] = [];
  try {
    const parsed = JSON.parse(rawBody) as { error?: { details?: Array<{ errors?: Array<{ errorCode?: Record<string, string> }> }> } };
    codigos = (parsed.error?.details ?? [])
      .flatMap((d) => d.errors ?? [])
      .flatMap((e) => Object.values(e.errorCode ?? {}));
  } catch {
    // corpo não é JSON válido — segue pro fallback abaixo
  }

  if (codigos.includes("OPERATION_NOT_PERMITTED_FOR_CONTEXT") || codigos.includes("DEVELOPER_TOKEN_NOT_APPROVED")) {
    return "O token de desenvolvedor do Google Ads ainda está em nível de teste — só funciona com contas de teste, não com sua conta real. Peça o upgrade pra \"Basic access\" na Central de API (dentro da conta MCC no Google Ads) antes de publicar campanhas de verdade.";
  }
  if (codigos.includes("CUSTOMER_NOT_ENABLED")) {
    return "Sua conta do Google Ads ainda não está totalmente habilitada (pode faltar forma de pagamento ou aprovação do Google). Confira em ads.google.com.";
  }
  if (codigos.includes("MISSING_TOS")) {
    return "Falta aceitar os Termos de Serviço da API do Google Ads — acesse ads.google.com/aw/apicenter e aceite antes de publicar.";
  }
  if (codigos.some((c) => c === "REQUIRED")) {
    return "O Google Ads recusou a campanha por faltar um campo obrigatório na requisição — isso é um bug no VendorAI, não algo que você precisa corrigir. Reportado automaticamente.";
  }

  return `Google Ads recusou a publicação (código ${status}). Detalhe técnico: ${rawBody.slice(0, 300)}`;
}

async function mutate(
  customerId: string,
  accessToken: string,
  resource: string,
  operations: unknown[],
): Promise<{ results: Array<{ resourceName: string }> }> {
  const res = await fetch(
    `${GOOGLE_ADS_API_BASE}/customers/${customerId}/${resource}:mutate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ operations }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, resource, customerId }, "Falha na mutate da API do Google Ads");
    throw new GoogleAdsPublishError(traduzirErroGoogleAds(res.status, text));
  }
  return res.json() as Promise<{ results: Array<{ resourceName: string }> }>;
}

async function resolveGoogleGeoTargets(accessToken: string, locationNames: string[]): Promise<string[]> {
  if (locationNames.length === 0) {
    throw new GoogleAdsPublishError("Informe pelo menos uma cidade, estado ou região antes de publicar. O VendorAI não publica campanha com Brasil inteiro por padrão.");
  }
  const res = await fetch(`${GOOGLE_ADS_API_BASE}/geoTargetConstants:suggest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      locale: "pt_BR",
      countryCode: "BR",
      locationNames: { names: locationNames.slice(0, 25) },
    }),
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new GoogleAdsPublishError(traduzirErroGoogleAds(res.status, raw));
  }
  const data = await res.json() as {
    geoTargetConstantSuggestions?: Array<{
      geoTargetConstant?: { resourceName?: string; countryCode?: string; status?: string };
      searchTerm?: string;
    }>;
  };
  const targets = [...new Set((data.geoTargetConstantSuggestions ?? [])
    .filter((item) => item.geoTargetConstant?.countryCode === "BR" && item.geoTargetConstant?.status !== "REMOVAL_PLANNED")
    .map((item) => item.geoTargetConstant?.resourceName)
    .filter(Boolean) as string[])];
  if (targets.length === 0) {
    throw new GoogleAdsPublishError(`O Google Ads não reconheceu a localização: ${locationNames.join(", ")}. Corrija a cidade/estado antes de publicar.`);
  }
  return targets;
}

// Resolve pra onde o clique do anúncio vai, de acordo com o eixo
// destino_clique + a origem do item. Lança erro claro quando o destino
// exige algo que o tenant ainda não tem configurado.
async function resolveFinalUrl(tenantId: string, campanha: AdCampaign): Promise<string> {
  if (campanha.destinoClique === "formulario_lead") {
    throw new GoogleAdsPublishError(
      "Destino \"Formulário de lead nativo\" ainda não implementado — publique com destino Landing Page ou WhatsApp por enquanto.",
    );
  }

  if (campanha.destinoClique === "whatsapp") {
    return resolveWhatsappAdCtaUrl(tenantId, campanha);
  }

  if (campanha.itemTipo === "landing_page") {
    if (!campanha.landingPageId) {
      throw new GoogleAdsPublishError("Campanha com origem Landing Page mas sem landing_page_id preenchido.");
    }
    const [site] = await db
      .select({ siteSlug: generatedSitesTable.siteSlug })
      .from(generatedSitesTable)
      .where(eq(generatedSitesTable.id, campanha.landingPageId));
    if (!site?.siteSlug) {
      throw new GoogleAdsPublishError("Landing page da campanha não encontrada ou ainda sem endereço publicado.");
    }
    const url = new URL(`https://${site.siteSlug}.appvendorai.com`);
    if (campanha.utmCode) url.searchParams.set("utm_campaign", campanha.utmCode);
    return url.toString();
  }

  // produto/veiculo/imovel: ainda não existe página pública de detalhe
  // por item nesse app (appvendorai.com) — Praça.ai tem, mas é outro
  // domínio/repo. Fallback pro site institucional do tenant até essa
  // página existir aqui. Limitação conhecida, não um bug silencioso.
  const [tenant] = await db
    .select({ subdomainSlug: tenantsTable.subdomainSlug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant?.subdomainSlug) {
    throw new GoogleAdsPublishError("Tenant sem site publicado (subdomínio) — necessário como destino do anúncio.");
  }
  const url = new URL(`https://${tenant.subdomainSlug}.appvendorai.com`);
  if (campanha.utmCode) url.searchParams.set("utm_campaign", campanha.utmCode);
  return url.toString();
}

async function getValidAccessToken(tenantId: string): Promise<{ accessToken: string; customerId: string }> {
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.customerId) {
    throw new GoogleAdsPublishError(
      "Tenant sem conexão ativa com o Google Ads — conecte em Configurações → Integrações antes de publicar.",
    );
  }

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  // Renova com folga de 2min pra não expirar no meio das chamadas mutate seguintes.
  if (!conn.accessToken || expiresAt < Date.now() + 2 * 60 * 1000) {
    await refreshGoogleAdsToken(conn.id);
    const refreshed = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!refreshed?.accessToken) throw new GoogleAdsPublishError("Falha ao renovar token de acesso do Google Ads.");
    return { accessToken: refreshed.accessToken, customerId: conn.customerId };
  }

  return { accessToken: conn.accessToken, customerId: conn.customerId };
}

export interface PublishResult {
  externalCampaignId: string;
  campaignResourceName: string;
  adGroupResourceName: string;
  adResourceName: string;
}

// Cria campanha + orçamento + segmentação geo/idioma + ad group + anúncio
// RSA na conta Google Ads real do tenant. TUDO criado com status PAUSED
// em todos os níveis — publicar não liga gasto nenhum, só coloca a
// estrutura pronta na conta pra revisão. Idempotente na prática porque
// o chamador (rota) só invoca isso quando externalCampaignId ainda é null.
export async function preflightGoogleAdsAccount(tenantId: string): Promise<void> {
  const { accessToken, customerId } = await getValidAccessToken(tenantId);
  const query = "SELECT customer.status, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1";
  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new GoogleAdsPublishError(
      /billing|payment|payments_account|customer_not_enabled/i.test(raw)
        ? "A conta Google Ads não está pronta para veicular: revise faturamento, forma de pagamento e ativação da conta."
        : traduzirErroGoogleAds(res.status, raw),
    );
  }
  const chunks = await res.json() as Array<{ results?: Array<{ customer?: { status?: string } }> }>;
  const status = chunks.flatMap((chunk) => chunk.results ?? [])[0]?.customer?.status;
  if (status && status !== "ENABLED") {
    throw new GoogleAdsPublishError(`A conta Google Ads está com status ${status}. Ative a conta e confirme a forma de pagamento antes de publicar.`);
  }
}

export async function publishCampaignToGoogleAds(tenantId: string, campaignId: string): Promise<PublishResult> {
  await preflightGoogleAdsAccount(tenantId);
  const [campanha] = await db
    .select()
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));

  if (!campanha) throw new GoogleAdsPublishError("Campanha não encontrada.");
  if (campanha.plataforma !== "google") {
    throw new GoogleAdsPublishError(`Publicação automática só implementada pra plataforma Google (essa campanha é "${campanha.plataforma}").`);
  }
  if (campanha.tipoAnuncio !== "rsa_pmax") {
    throw new GoogleAdsPublishError(
      `Publicação automática só implementada pra Search/Performance Max (RSA) nessa versão. "${campanha.tipoAnuncio}" ainda não tem esse caminho — crie manualmente no Google Ads por enquanto.`,
    );
  }
  if (campanha.externalCampaignId) {
    throw new GoogleAdsPublishError("Campanha já publicada — use ativar/pausar em vez de publicar de novo.");
  }

  const [creative] = await db
    .select()
    .from(adCreativesTable)
    .where(and(eq(adCreativesTable.campaignId, campaignId), eq(adCreativesTable.status, "aprovado")));
  if (!creative) {
    throw new GoogleAdsPublishError("Nenhum criativo aprovado pra essa campanha — gere e aprove o criativo antes de publicar.");
  }
  if (creative.headlines.length === 0 || creative.descriptions.length === 0) {
    throw new GoogleAdsPublishError("Criativo aprovado está sem títulos ou descrições.");
  }

  const finalUrl = await resolveFinalUrl(tenantId, campanha);
  const whatsappCta = campanha.destinoClique === "whatsapp" ? await resolveWhatsappAdCtaCopy(tenantId) : null;
  const { accessToken, customerId } = await getValidAccessToken(tenantId);
  const requestedLocations = campanha.segmentacao?.localizacao?.locais ?? [];
  const geoTargetResources = await resolveGoogleGeoTargets(accessToken, requestedLocations);

  // Nome curto do item pra usar como palavra-chave inicial e no nome da
  // campanha — editável depois direto no Google Ads.
  let nomeCurto = "Anúncio";
  if (campanha.itemTipo === "produto" || campanha.itemTipo === "veiculo" || campanha.itemTipo === "imovel") {
    if (campanha.itemId) {
      const item = await buildResumoItem(campanha.itemTipo, campanha.itemId, tenantId);
      if (item?.nomeCurto) nomeCurto = item.nomeCurto;
    }
  } else if (campanha.itemTipo === "landing_page") {
    nomeCurto = "Landing Page";
  } else {
    nomeCurto = "Institucional";
  }

  const campaignName = `Vendor.ai — ${nomeCurto} — ${new Date().toISOString().slice(0, 10)}`;
  const campaignControl = campanha.segmentacao?.campaignControl;
  if (!campaignControl?.startDate || !campaignControl?.endDate) {
    throw new GoogleAdsPublishError("Defina as datas de início e término antes de publicar.");
  }
  const googleDate = (value: string) => value.replace(/-/g, "");
  const amountMicros = String(Math.round(Number(campanha.orcamentoDiario) * 1_000_000));

  // 1) Orçamento
  const budgetRes = await mutate(customerId, accessToken, "campaignBudgets", [
    {
      create: {
        name: `${campaignName} — orçamento`,
        amountMicros,
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    },
  ]);
  const budgetResourceName = budgetRes.results[0]?.resourceName;
  if (!budgetResourceName) throw new GoogleAdsPublishError("Google Ads não retornou o orçamento criado.");

  // 2) Campanha — sempre PAUSED. Ativar é ação separada e explícita.
  // Estratégia de lances é OBRIGATÓRIA pro Google Ads aceitar criar a
  // campanha (achado real: faltava esse campo, causava erro 400
  // "required field was not present" ao publicar). Maximizar Cliques
  // (targetSpend) é a opção mais segura pra campanha nova — não exige
  // rastreamento de conversão configurado, só busca o máximo de
  // cliques dentro do orçamento. Editável depois no próprio Google Ads
  // se o lojista quiser trocar pra uma estratégia baseada em conversão.
  const campaignRes = await mutate(customerId, accessToken, "campaigns", [
    {
      create: {
        name: campaignName,
        advertisingChannelType: "SEARCH",
        status: "PAUSED",
        campaignBudget: budgetResourceName,
        startDate: googleDate(campaignControl.startDate),
        endDate: googleDate(campaignControl.endDate),
        targetSpend: {},
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false,
        },
      },
    },
  ]);
  const campaignResourceName = campaignRes.results[0]?.resourceName;
  if (!campaignResourceName) throw new GoogleAdsPublishError("Google Ads não retornou a campanha criada.");

  // 3) Segmentação geográfica real resolvida pela API + idioma.
  await mutate(customerId, accessToken, "campaignCriteria", [
    ...geoTargetResources.map((geoTargetConstant) => ({
      create: { campaign: campaignResourceName, location: { geoTargetConstant } },
    })),
    { create: { campaign: campaignResourceName, language: { languageConstant: LANGUAGE_PORTUGUES } } },
  ]);

  // 4) Ad group
  const adGroupRes = await mutate(customerId, accessToken, "adGroups", [
    {
      create: {
        name: `${campaignName} — grupo`,
        campaign: campaignResourceName,
        status: "PAUSED",
        type: "SEARCH_STANDARD",
      },
    },
  ]);
  const adGroupResourceName = adGroupRes.results[0]?.resourceName;
  if (!adGroupResourceName) throw new GoogleAdsPublishError("Google Ads não retornou o grupo de anúncios criado.");

  // 5) Palavras-chave derivadas do público, nicho, objetivo e oferta.
  // O plano é exibido no rascunho antes desta publicação. PHRASE evita
  // alcance excessivamente aberto e ainda permite variações relevantes.
  const plannedKeywords = campanha.segmentacao?.audiencePlan?.google?.keywords ?? [];
  const keywords = plannedKeywords.length > 0 ? plannedKeywords : [nomeCurto];
  await mutate(
    customerId,
    accessToken,
    "adGroupCriteria",
    keywords.slice(0, 15).map((text) => ({
      create: {
        adGroup: adGroupResourceName,
        status: "ENABLED",
        keyword: { text: text.slice(0, 80), matchType: "PHRASE" },
      },
    })),
  );

  // 6) Anúncio RSA — títulos/descrições do criativo já aprovado
  const adRes = await mutate(customerId, accessToken, "adGroupAds", [
    {
      create: {
        adGroup: adGroupResourceName,
        status: "PAUSED",
        ad: {
          finalUrls: [finalUrl],
          responsiveSearchAd: {
            headlines: creative.headlines.slice(0, 15).map((text) => ({ text })),
            descriptions: whatsappCta
              ? [...creative.descriptions.slice(0, 3), whatsappCta].map((text) => ({ text }))
              : creative.descriptions.slice(0, 4).map((text) => ({ text })),
          },
        },
      },
    },
  ]);
  const adResourceName = adRes.results[0]?.resourceName;
  if (!adResourceName) throw new GoogleAdsPublishError("Google Ads não retornou o anúncio criado.");

  // resourceName vem como "customers/123/campaigns/456" — guardamos só o
  // ID numérico final, mesmo padrão já usado em listAccessibleCustomers.
  const externalCampaignId = campaignResourceName.split("/").pop() ?? campaignResourceName;

  const segmentacao = {
    ...campanha.segmentacao,
    platformReview: { status: "em_analise" as const, reason: "Enviado ao Google Ads para análise automática.", syncedAt: new Date().toISOString() },
  };
  await db
    .update(adCampaignsTable)
    .set({ externalCampaignId, status: "pausado", segmentacao, updatedAt: new Date() })
    .where(eq(adCampaignsTable.id, campaignId));

  logger.info(
    { tenantId, campaignId, externalCampaignId, campaignResourceName },
    "ads: campanha publicada de verdade na API do Google Ads (pausada — aguardando ativação explícita)",
  );

  return { externalCampaignId, campaignResourceName, adGroupResourceName, adResourceName };
}

// Liga/desliga a veiculação de verdade — a única chamada que de fato
// pode gastar dinheiro. Só funciona depois de publishCampaignToGoogleAds.
export async function setGoogleAdsCampaignStatus(
  tenantId: string,
  campaignId: string,
  ativar: boolean,
): Promise<void> {
  const [campanha] = await db
    .select()
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));

  if (!campanha) throw new GoogleAdsPublishError("Campanha não encontrada.");
  if (!campanha.externalCampaignId) {
    throw new GoogleAdsPublishError("Campanha ainda não foi publicada na API do Google Ads.");
  }

  const { accessToken, customerId } = await getValidAccessToken(tenantId);
  const campaignResourceName = `customers/${customerId}/campaigns/${campanha.externalCampaignId}`;

  const query = [
    "SELECT ad_group.resource_name, ad_group_ad.resource_name",
    "FROM ad_group_ad",
    `WHERE campaign.id = ${campanha.externalCampaignId}`,
  ].join(" ");
  const searchRes = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!searchRes.ok) {
    const raw = await searchRes.text();
    throw new GoogleAdsPublishError(traduzirErroGoogleAds(searchRes.status, raw));
  }
  const chunks = await searchRes.json() as Array<{ results?: Array<{ adGroup?: { resourceName?: string }; adGroupAd?: { resourceName?: string } }> }>;
  const rows = chunks.flatMap((chunk) => chunk.results ?? []);
  const adGroupNames = [...new Set(rows.map((row) => row.adGroup?.resourceName).filter(Boolean) as string[])];
  const adNames = [...new Set(rows.map((row) => row.adGroupAd?.resourceName).filter(Boolean) as string[])];

  const updateCampaign = () => mutate(customerId, accessToken, "campaigns", [{
    update: { resourceName: campaignResourceName, status: ativar ? "ENABLED" : "PAUSED" },
    updateMask: "status",
  }]);
  const updateChildren = async () => {
    if (adGroupNames.length) {
      await mutate(customerId, accessToken, "adGroups", adGroupNames.map((resourceName) => ({
        update: { resourceName, status: ativar ? "ENABLED" : "PAUSED" },
        updateMask: "status",
      })));
    }
    if (adNames.length) {
      await mutate(customerId, accessToken, "adGroupAds", adNames.map((resourceName) => ({
        update: { resourceName, status: ativar ? "ENABLED" : "PAUSED" },
        updateMask: "status",
      })));
    }
  };

  if (ativar) {
    await updateChildren();
    await updateCampaign();
  } else {
    await updateCampaign();
    await updateChildren();
  }

  await db
    .update(adCampaignsTable)
    .set({ status: ativar ? "ativo" : "pausado", updatedAt: new Date() })
    .where(eq(adCampaignsTable.id, campaignId));

  logger.info({ tenantId, campaignId, ativar }, "ads: status da campanha alterado na API do Google Ads");
}

export async function fetchGoogleAdsCampaignPerformance(tenantId: string, campaignId: string) {
  const [campaign] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campaign?.externalCampaignId) throw new GoogleAdsPublishError("Campanha ainda não foi enviada ao Google Ads.");
  const { accessToken, customerId } = await getValidAccessToken(tenantId);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const query = [
    "SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions",
    "FROM campaign",
    `WHERE campaign.id = ${campaign.externalCampaignId} AND segments.date = '${today}'`,
  ].join(" ");
  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new GoogleAdsPublishError(traduzirErroGoogleAds(res.status, await res.text()));
  const chunks = await res.json() as Array<{ results?: Array<{ metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number } }> }>;
  const rows = chunks.flatMap((chunk) => chunk.results ?? []);
  return rows.reduce((total, row) => ({
    impressions: total.impressions + Number(row.metrics?.impressions ?? 0),
    clicks: total.clicks + Number(row.metrics?.clicks ?? 0),
    spend: total.spend + Number(row.metrics?.costMicros ?? 0) / 1_000_000,
    conversions: total.conversions + Number(row.metrics?.conversions ?? 0),
  }), { impressions: 0, clicks: 0, spend: 0, conversions: 0 });
}

export async function syncGoogleAdsReviewStatus(tenantId: string, campaignId: string) {
  const [campanha] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campanha?.externalCampaignId) throw new GoogleAdsPublishError("Campanha ainda não foi enviada ao Google Ads.");

  const { accessToken, customerId } = await getValidAccessToken(tenantId);
  const query = [
    "SELECT campaign.status, ad_group_ad.status,",
    "ad_group_ad.policy_summary.approval_status,",
    "ad_group_ad.policy_summary.policy_topic_entries",
    "FROM ad_group_ad",
    `WHERE campaign.id = ${campanha.externalCampaignId}`,
  ].join(" ");
  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  let platformReview: NonNullable<AdCampaign["segmentacao"]>["platformReview"];
  if (!res.ok) {
    const raw = await res.text();
    const paymentProblem = /billing|payment|payments_account|customer_not_enabled/i.test(raw);
    platformReview = {
      status: paymentProblem ? "erro_pagamento" : "erro_conta",
      reason: paymentProblem
        ? "O Google Ads informou um problema de cobrança ou forma de pagamento."
        : traduzirErroGoogleAds(res.status, raw),
      syncedAt: new Date().toISOString(),
    };
  } else {
    const chunks = await res.json() as Array<{ results?: Array<{ adGroupAd?: { policySummary?: { approvalStatus?: string; policyTopicEntries?: Array<{ topic?: string; type?: string }> } } }> }>;
    const rows = chunks.flatMap((chunk) => chunk.results ?? []);
    const approvals = rows.map((row) => row.adGroupAd?.policySummary?.approvalStatus ?? "UNKNOWN");
    const policyTopics = [...new Set(rows.flatMap((row) => row.adGroupAd?.policySummary?.policyTopicEntries ?? []).map((entry) => entry.topic ?? entry.type ?? "").filter(Boolean))];
    const status = approvals.some((item) => item === "DISAPPROVED")
      ? "reprovada"
      : approvals.some((item) => item === "APPROVED_LIMITED")
        ? "aprovada_limitada"
        : approvals.length > 0 && approvals.every((item) => item === "APPROVED")
          ? "aprovada"
          : "em_analise";
    platformReview = {
      status,
      reason: status === "reprovada"
        ? "O Google Ads reprovou o anúncio. Consulte os tópicos de política e corrija antes de reenviar."
        : status === "aprovada_limitada"
          ? "O anúncio foi aprovado com limitações de público, local ou formato."
          : status === "aprovada"
            ? "Anúncio aprovado pelo Google Ads."
            : "O Google Ads ainda está analisando o anúncio.",
      policyTopics,
      syncedAt: new Date().toISOString(),
    };
  }

  const segmentacao = { ...campanha.segmentacao, platformReview };
  await db.update(adCampaignsTable).set({ segmentacao, updatedAt: new Date() }).where(eq(adCampaignsTable.id, campaignId));
  return platformReview;
}

export { GoogleAdsPublishError };
