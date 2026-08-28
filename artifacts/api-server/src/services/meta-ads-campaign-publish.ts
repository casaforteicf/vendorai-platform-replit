// Publicação real de campanha na Marketing API da Meta (Facebook/
// Instagram Ads) — análogo ao google-ads-campaign-publish.ts, mas
// adaptado à estrutura de recursos bem diferente da Meta:
//
// Google: Campanha -> Ad Group -> Anúncio (com keyword de busca)
// Meta:   Campanha -> Conjunto de Anúncios (ad set, é onde fica
//         orçamento/segmentação/objetivo) -> Anúncio (aponta pra um
//         Ad Creative separado, que é onde fica o texto/imagem)
//
// Mesma regra de segurança do Google: publicar cria TUDO pausado, nunca
// liga gasto sozinho — só activateMetaAdsCampaign() faz isso, por ação
// explícita separada do lojista.
//
// Escopo desta passada: só tipoAnuncio="imagem" (link ad de imagem
// única, Feed do Facebook/Instagram) — é o único formato pro qual existe
// geração de criativo hoje (ver adContentGeneratorImagem.ts). Carrossel,
// vídeo e Stories/Reels nativos ficam pra depois.
//
// DEPENDÊNCIA REAL: todo anúncio da Meta roda "como" uma Página do
// Facebook (object_story_spec exige page_id) — não tem como publicar
// sem uma. Reaproveita a Página já vinculada na conexão do Instagram
// (mesma Página de origem do Instagram Business da conta) em vez de
// construir mais um seletor de Página só pra isso; se o tenant não tem
// Instagram conectado, publicar aqui falha com erro claro pedindo isso
// primeiro — não é possível contornar, é exigência da própria Meta.
import { and, eq } from "drizzle-orm";
import {
  db,
  adCampaignsTable,
  adCreativesTable,
  generatedSitesTable,
  tenantsTable,
  businessProfilesTable,
  instagramConnectionsTable,
  type AdCampaign,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  getMetaAdsConnectionByTenantId,
  refreshMetaAdsToken,
  listAccessibleInstagramIdentities,
  normalizeMetaAdAccountId,
  META_GRAPH_BASE,
} from "./meta-ads-oauth.js";

class MetaAdsPublishError extends Error {}

// Extrai a mensagem legível de dentro do JSON de erro da Meta em vez de
// mostrar o corpo bruto — a Marketing API já devolve error.message (e
// às vezes error.error_user_msg, pensado especificamente pra mostrar
// ao usuário final) em vez de códigos crípticos como o Google, então
// não precisa de tradução código-por-código, só extrair o campo certo.
function traduzirErroMetaAds(path: string, status: number, rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string; error_user_msg?: string; code?: number; error_subcode?: number } };
    const err = parsed.error;
    if (err) {
      // Erro de permissão (App Review de ads_management não aprovado
      // ainda, ou token sem escopo) — o caso mais provável de acontecer
      // enquanto o App Review não sai.
      if (err.code === 200 || err.code === 10 || /permission/i.test(err.message ?? "")) {
        return "A Meta recusou por falta de permissão — provavelmente o App Review do escopo ads_management ainda não foi aprovado (Meta for Developers → App Review). Sem essa aprovação, só funciona pra contas de admin/tester do app.";
      }
      const msg = err.error_user_msg || err.message;
      if (msg) return `Meta Ads recusou a publicação: ${msg}`;
    }
  } catch {
    // corpo não é JSON válido — segue pro fallback abaixo
  }
  return `Meta Ads recusou a publicação (${path}, código ${status}). Detalhe técnico: ${rawBody.slice(0, 300)}`;
}

async function metaApi<T>(
  path: string,
  accessToken: string,
  method: "GET" | "POST",
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE}/${path}`);
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text, path }, "Falha na chamada GET à Marketing API da Meta");
      throw new MetaAdsPublishError(traduzirErroMetaAds(path, res.status, text));
    }
    return res.json() as Promise<T>;
  }

  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, path }, "Falha na chamada POST à Marketing API da Meta");
    throw new MetaAdsPublishError(traduzirErroMetaAds(path, res.status, text));
  }
  return res.json() as Promise<T>;
}

// Mesma lógica de resolução de destino do Google Ads — duplicada em vez
// de compartilhada porque cada serviço lança seu próprio tipo de erro e
// não vale a pena acoplar os dois só por isso.
async function resolveFinalUrl(tenantId: string, campanha: AdCampaign): Promise<string> {
  if (campanha.destinoClique === "formulario_lead") {
    throw new MetaAdsPublishError(
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
      throw new MetaAdsPublishError(
        "Tenant sem telefone de WhatsApp cadastrado (Configurações → Perfil do Negócio) — necessário pra destino de clique WhatsApp.",
      );
    }
    // Simplificação assumida: link comum pro wa.me, não o formato nativo
    // "click-to-WhatsApp" da Meta (que exigiria destination_type=WHATSAPP
    // no ad set + estrutura de creative diferente). Funciona (abre o
    // WhatsApp ao clicar), só não é o objetivo de campanha nativo.
    return `https://wa.me/${numero}`;
  }

  if (campanha.itemTipo === "landing_page") {
    if (!campanha.landingPageId) {
      throw new MetaAdsPublishError("Campanha com origem Landing Page mas sem landing_page_id preenchido.");
    }
    const [site] = await db
      .select({ siteSlug: generatedSitesTable.siteSlug })
      .from(generatedSitesTable)
      .where(eq(generatedSitesTable.id, campanha.landingPageId));
    if (!site?.siteSlug) {
      throw new MetaAdsPublishError("Landing page da campanha não encontrada ou ainda sem endereço publicado.");
    }
    return `https://${site.siteSlug}.appvendorai.com`;
  }

  const [tenant] = await db
    .select({ subdomainSlug: tenantsTable.subdomainSlug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant?.subdomainSlug) {
    throw new MetaAdsPublishError("Tenant sem site publicado (subdomínio) — necessário como destino do anúncio.");
  }
  return `https://${tenant.subdomainSlug}.appvendorai.com`;
}

async function getValidAccessToken(tenantId: string): Promise<{ accessToken: string; adAccountId: string }> {
  const conn = await getMetaAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.adAccountId) {
    throw new MetaAdsPublishError(
      "Tenant sem conexão ativa com o Meta Ads — conecte em Configurações → Integrações antes de publicar.",
    );
  }

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  // Token de usuário de longa duração da Meta (~60 dias) — renova com
  // folga de 3 dias, bem maior que a do Google (aqui não tem
  // refresh_token separado, é trocar o próprio token ainda válido).
  if (!conn.accessToken || expiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
    await refreshMetaAdsToken(conn.id);
    const refreshed = await getMetaAdsConnectionByTenantId(tenantId);
    if (!refreshed?.accessToken) throw new MetaAdsPublishError("Falha ao renovar token de acesso do Meta Ads.");
    return { accessToken: refreshed.accessToken, adAccountId: conn.adAccountId };
  }

  return { accessToken: conn.accessToken, adAccountId: conn.adAccountId };
}

async function getInstagramIdentity(
  tenantId: string,
  accessToken: string,
): Promise<{ pageId: string; pageAccessToken: string; instagramUserId: string }> {
  const [directInstagram] = await db
    .select({ username: instagramConnectionsTable.username })
    .from(instagramConnectionsTable)
    .where(eq(instagramConnectionsTable.tenantId, tenantId));

  const identities = await listAccessibleInstagramIdentities(accessToken);
  if (identities.length === 0) {
    throw new MetaAdsPublishError(
      "A conexão Meta Ads não encontrou nenhuma Página do Facebook com Instagram profissional vinculado. Vincule a conta profissional a uma Página e reconecte Meta Ads.",
    );
  }

  const expectedUsername = directInstagram?.username?.trim().toLowerCase();
  if (expectedUsername) {
    const matching = identities.find(
      (identity) => identity.instagramUsername?.trim().toLowerCase() === expectedUsername,
    );
    if (matching) {
      return {
        pageId: matching.pageId,
        pageAccessToken: matching.pageAccessToken,
        instagramUserId: matching.instagramUserId,
      };
    }
  }

  if (identities.length === 1 && identities[0]) {
    const identity = identities[0];
    return {
      pageId: identity.pageId,
      pageAccessToken: identity.pageAccessToken,
      instagramUserId: identity.instagramUserId,
    };
  }

  throw new MetaAdsPublishError(
    "A conexão Meta Ads administra mais de uma Página com Instagram e não foi possível identificar automaticamente qual corresponde ao Instagram conectado no VendorAI. Confirme que as duas integrações usam a mesma conta profissional.",
  );
}

async function fetchDirectInstagramPermalink(tenantId: string, mediaId: string): Promise<string | null> {
  const [direct] = await db
    .select({ token: instagramConnectionsTable.pageAccessToken })
    .from(instagramConnectionsTable)
    .where(eq(instagramConnectionsTable.tenantId, tenantId));
  if (!direct?.token) return null;

  const url = new URL(`https://graph.instagram.com/v26.0/${encodeURIComponent(mediaId)}`);
  url.searchParams.set("fields", "id,permalink");
  url.searchParams.set("access_token", direct.token);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const payload = (await res.json()) as { permalink?: string };
    return payload.permalink ?? null;
  } catch {
    return null;
  }
}

async function resolveBoostableInstagramMediaId(
  tenantId: string,
  sourceMediaId: string,
  instagramUserId: string,
  pageAccessToken: string,
): Promise<string> {
  const directPermalink = await fetchDirectInstagramPermalink(tenantId, sourceMediaId);

  let nextUrl: string | null = `${META_GRAPH_BASE}/${encodeURIComponent(instagramUserId)}/media`;
  for (let page = 0; page < 5 && nextUrl; page += 1) {
    const url = new URL(nextUrl);
    if (page === 0) {
      url.searchParams.set("fields", "id,permalink");
      url.searchParams.set("limit", "100");
      url.searchParams.set("access_token", pageAccessToken);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      const raw = await res.text();
      throw new MetaAdsPublishError(traduzirErroMetaAds(`${instagramUserId}/media`, res.status, raw));
    }
    const payload = (await res.json()) as {
      data?: Array<{ id: string; permalink?: string }>;
      paging?: { next?: string };
    };

    const match = (payload.data ?? []).find(
      (media) => media.id === sourceMediaId || (!!directPermalink && media.permalink === directPermalink),
    );
    if (match) return match.id;
    nextUrl = payload.paging?.next ?? null;
  }

  throw new MetaAdsPublishError(
    "A publicação do Instagram existe no VendorAI, mas não apareceu na identidade Instagram vinculada ao Meta Ads. Confirme que Instagram e Meta Ads usam a mesma conta profissional/Página e tente novamente.",
  );
}

export interface MetaPublishResult {
  externalCampaignId: string;
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
}

export async function publishCampaignToMetaAds(tenantId: string, campaignId: string): Promise<MetaPublishResult> {
  const [campanha] = await db
    .select()
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));

  if (!campanha) throw new MetaAdsPublishError("Campanha não encontrada.");
  if (campanha.plataforma !== "meta") {
    throw new MetaAdsPublishError(`Publicação automática Meta só se aplica a campanhas plataforma="meta" (essa é "${campanha.plataforma}").`);
  }
  if (campanha.tipoAnuncio !== "imagem") {
    throw new MetaAdsPublishError(
      `Publicação automática na Meta só implementada pra anúncio de Imagem nessa versão. "${campanha.tipoAnuncio}" ainda não tem esse caminho.`,
    );
  }
  if (campanha.externalCampaignId) {
    throw new MetaAdsPublishError("Campanha já publicada — use ativar/pausar em vez de publicar de novo.");
  }

  const [creative] = await db
    .select()
    .from(adCreativesTable)
    .where(and(eq(adCreativesTable.campaignId, campaignId), eq(adCreativesTable.status, "aprovado")));
  if (!creative) {
    throw new MetaAdsPublishError("Nenhum criativo aprovado pra essa campanha — gere e aprove o criativo antes de publicar.");
  }
  const origemInstagram = campanha.segmentacao?.origemInstagram;
  if (!origemInstagram && !creative.imagens[0]) {
    throw new MetaAdsPublishError("Criativo aprovado está sem imagem.");
  }
  const headline = creative.headlines[0] ?? campanha.vertical;
  const primaryText = creative.headlines[1] ?? headline;
  const description = creative.descriptions[0] ?? "";

  const finalUrl = origemInstagram ? null : await resolveFinalUrl(tenantId, campanha);
  const { accessToken, adAccountId } = await getValidAccessToken(tenantId);
  const adAccountPath = normalizeMetaAdAccountId(adAccountId);
  const { pageId, pageAccessToken, instagramUserId } = await getInstagramIdentity(tenantId, accessToken);
  const boostableInstagramMediaId = origemInstagram
    ? await resolveBoostableInstagramMediaId(tenantId, origemInstagram.mediaId, instagramUserId, pageAccessToken)
    : null;

  const campaignName = `Vendor.ai — ${headline} — ${new Date().toISOString().slice(0, 10)}`;

  // 1) Campanha — objetivo Tráfego cobre landing page/WhatsApp-via-link/
  // fallback institucional. special_ad_categories vazio é o padrão pra
  // retail/serviços comuns (housing/credit/employment/political exigem
  // categoria declarada, fora do escopo dos verticais atendidos hoje).
  const campaignRes = await metaApi<{ id: string }>(`${adAccountPath}/campaigns`, accessToken, "POST", {
    name: campaignName,
    objective: origemInstagram ? "OUTCOME_ENGAGEMENT" : "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: "[]",
  });

  // 2) Ad Set — orçamento (centavos, inteiro), geo Brasil fixo nessa
  // versão (mesma simplificação do Google — segmentação fina fica pro
  // motor de recomendação).
  const dailyBudgetCents = Math.round(Number(campanha.orcamentoDiario) * 100);
  const adSetRes = await metaApi<{ id: string }>(`${adAccountPath}/adsets`, accessToken, "POST", {
    name: `${campaignName} — conjunto`,
    campaign_id: campaignRes.id,
    daily_budget: String(dailyBudgetCents),
    billing_event: "IMPRESSIONS",
    optimization_goal: origemInstagram ? "POST_ENGAGEMENT" : "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    targeting: JSON.stringify(origemInstagram ? { geo_locations: { countries: ["BR"] }, publisher_platforms: ["instagram"] } : { geo_locations: { countries: ["BR"] } }),
  });

  let creativeRes: { id: string };
  if (origemInstagram) {
    creativeRes = await metaApi<{ id: string }>(`${adAccountPath}/adcreatives`, accessToken, "POST", {
      name: `${campaignName} — publicação Instagram`,
      object_id: pageId,
      instagram_user_id: instagramUserId!,
      source_instagram_media_id: boostableInstagramMediaId!,
    });
  } else {
    const objectStorySpec = {
      page_id: pageId,
      instagram_user_id: instagramUserId,
      link_data: {
        message: primaryText,
        link: finalUrl!,
        name: headline,
        description,
        picture: creative.imagens[0],
        call_to_action: { type: "LEARN_MORE", value: { link: finalUrl! } },
      },
    };
    creativeRes = await metaApi<{ id: string }>(`act_${adAccountId}/adcreatives`, accessToken, "POST", {
      name: `${campaignName} — criativo`,
      object_story_spec: JSON.stringify(objectStorySpec),
    });
  }

  // 4) Anúncio — liga ad set + criativo, também pausado.
  const adRes = await metaApi<{ id: string }>(`${adAccountPath}/ads`, accessToken, "POST", {
    name: `${campaignName} — anúncio`,
    adset_id: adSetRes.id,
    creative: JSON.stringify({ creative_id: creativeRes.id }),
    status: "PAUSED",
  });

  await db
    .update(adCampaignsTable)
    .set({ externalCampaignId: campaignRes.id, status: "pausado", updatedAt: new Date() })
    .where(eq(adCampaignsTable.id, campaignId));

  logger.info(
    { tenantId, campaignId, externalCampaignId: campaignRes.id },
    "ads: campanha publicada de verdade na Marketing API da Meta (pausada — aguardando ativação explícita)",
  );

  return { externalCampaignId: campaignRes.id, campaignId: campaignRes.id, adSetId: adSetRes.id, creativeId: creativeRes.id, adId: adRes.id };
}

export async function setMetaAdsCampaignStatus(tenantId: string, campaignId: string, ativar: boolean): Promise<void> {
  const [campanha] = await db
    .select()
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));

  if (!campanha) throw new MetaAdsPublishError("Campanha não encontrada.");
  if (!campanha.externalCampaignId) {
    throw new MetaAdsPublishError("Campanha ainda não foi publicada na Marketing API da Meta.");
  }

  const { accessToken } = await getValidAccessToken(tenantId);

  await metaApi(campanha.externalCampaignId, accessToken, "POST", {
    status: ativar ? "ACTIVE" : "PAUSED",
  });

  await db
    .update(adCampaignsTable)
    .set({ status: ativar ? "ativo" : "pausado", updatedAt: new Date() })
    .where(eq(adCampaignsTable.id, campaignId));

  logger.info({ tenantId, campaignId, ativar }, "ads: status da campanha Meta alterado na Marketing API");
}

export { MetaAdsPublishError };
