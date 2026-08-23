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
import { buildResumoItem } from "../lib/adItemSummary.js";
import {
  getGoogleAdsConnectionByTenantId,
  refreshGoogleAdsToken,
} from "./google-ads-oauth.js";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v17";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];

// Brasil (geoTargetConstants/2076) + Português (languageConstants/1014) —
// alvo padrão fixo nessa primeira versão. Segmentação fina por
// cidade/raio (campanha.segmentacao.localizacao) fica pra quando o
// motor de recomendação entrar — precisa de GeoTargetConstantService
// pra resolver nome de cidade -> geo target constant, escopo maior.
const GEO_TARGET_BRASIL = "geoTargetConstants/2076";
const LANGUAGE_PORTUGUES = "languageConstants/1014";

class GoogleAdsPublishError extends Error {}

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
    throw new GoogleAdsPublishError(`Google Ads API (${resource}) respondeu ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json() as Promise<{ results: Array<{ resourceName: string }> }>;
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
    const [profile] = await db
      .select({ telefone: businessProfilesTable.telefone })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId));
    const numero = profile?.telefone?.replace(/\D/g, "");
    if (!numero) {
      throw new GoogleAdsPublishError(
        "Tenant sem telefone de WhatsApp cadastrado (Configurações → Perfil do Negócio) — necessário pra destino de clique WhatsApp.",
      );
    }
    return `https://wa.me/${numero}`;
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
    return `https://${site.siteSlug}.appvendorai.com`;
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
  return `https://${tenant.subdomainSlug}.appvendorai.com`;
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
export async function publishCampaignToGoogleAds(tenantId: string, campaignId: string): Promise<PublishResult> {
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
  const { accessToken, customerId } = await getValidAccessToken(tenantId);

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
  const campaignRes = await mutate(customerId, accessToken, "campaigns", [
    {
      create: {
        name: campaignName,
        advertisingChannelType: "SEARCH",
        status: "PAUSED",
        campaignBudget: budgetResourceName,
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

  // 3) Segmentação geo/idioma (Brasil/Português fixo nessa versão)
  await mutate(customerId, accessToken, "campaignCriteria", [
    { create: { campaign: campaignResourceName, location: { geoTargetConstant: GEO_TARGET_BRASIL } } },
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

  // 5) Palavra-chave inicial (broad match no nome do item) — ponto de
  // partida editável, não segmentação final. Sem isso o grupo fica sem
  // nenhum critério de veiculação.
  await mutate(customerId, accessToken, "adGroupCriteria", [
    { create: { adGroup: adGroupResourceName, status: "ENABLED", keyword: { text: nomeCurto, matchType: "BROAD" } } },
  ]);

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
            descriptions: creative.descriptions.slice(0, 4).map((text) => ({ text })),
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

  await db
    .update(adCampaignsTable)
    .set({ externalCampaignId, status: "pausado", updatedAt: new Date() })
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

  await mutate(customerId, accessToken, "campaigns", [
    {
      update: { resourceName: campaignResourceName, status: ativar ? "ENABLED" : "PAUSED" },
      updateMask: "status",
    },
  ]);

  await db
    .update(adCampaignsTable)
    .set({ status: ativar ? "ativo" : "pausado", updatedAt: new Date() })
    .where(eq(adCampaignsTable.id, campaignId));

  logger.info({ tenantId, campaignId, ativar }, "ads: status da campanha alterado na API do Google Ads");
}

export { GoogleAdsPublishError };
