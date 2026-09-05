import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import {
  adCampaignsTable,
  adCreativesTable,
  businessProfilesTable,
  db,
  generatedSitesTable,
  tenantsTable,
  type AdCampaign,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getGoogleAdsConnectionByTenantId, refreshGoogleAdsToken } from "./google-ads-oauth.js";
import { resolveGoogleCampaignFormat } from "./google-ads-format.js";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"] || "";
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

class GooglePmaxPublishError extends Error {}

type PreparedImages = {
  landscape: string;
  square: string;
  logo: string;
};

type MutateResponse = {
  mutateOperationResponses?: Array<Record<string, unknown>>;
  partialFailureError?: unknown;
};

function googleHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };
}

async function getValidAccessToken(tenantId: string) {
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.customerId) {
    throw new GooglePmaxPublishError("Tenant sem conexão ativa com o Google Ads.");
  }
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (!conn.accessToken || expiresAt < Date.now() + 2 * 60_000) {
    await refreshGoogleAdsToken(conn.id);
    const refreshed = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!refreshed?.accessToken) throw new GooglePmaxPublishError("Falha ao renovar token do Google Ads.");
    return { accessToken: refreshed.accessToken, customerId: conn.customerId };
  }
  return { accessToken: conn.accessToken, customerId: conn.customerId };
}

async function resolveGeoTargets(accessToken: string, locationNames: string[]) {
  if (locationNames.length === 0) {
    throw new GooglePmaxPublishError("Performance Max exige pelo menos uma localização definida no planejamento.");
  }
  const response = await fetch(`${GOOGLE_ADS_API_BASE}/geoTargetConstants:suggest`, {
    method: "POST",
    headers: googleHeaders(accessToken),
    body: JSON.stringify({
      locale: "pt_BR",
      countryCode: "BR",
      locationNames: { names: locationNames.slice(0, 25) },
    }),
  });
  if (!response.ok) throw new GooglePmaxPublishError(`Falha ao resolver localização no Google Ads (${response.status}).`);
  const data = await response.json() as {
    geoTargetConstantSuggestions?: Array<{ geoTargetConstant?: { resourceName?: string; countryCode?: string; status?: string } }>;
  };
  const targets = [...new Set((data.geoTargetConstantSuggestions ?? [])
    .filter((row) => row.geoTargetConstant?.countryCode === "BR" && row.geoTargetConstant?.status !== "REMOVAL_PLANNED")
    .map((row) => row.geoTargetConstant?.resourceName)
    .filter(Boolean) as string[])];
  if (targets.length === 0) throw new GooglePmaxPublishError("O Google Ads não reconheceu as localizações informadas.");
  return targets;
}

function absoluteMediaUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env["FRONTEND_APP_URL"] || "https://app.appvendorai.com").replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function download(url: string) {
  const response = await fetch(absoluteMediaUrl(url));
  if (!response.ok) throw new GooglePmaxPublishError(`Não foi possível baixar mídia do criativo (${response.status}).`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_SOURCE_BYTES) throw new GooglePmaxPublishError("Imagem do criativo excede o limite de processamento.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_SOURCE_BYTES) throw new GooglePmaxPublishError("Imagem do criativo excede o limite de processamento.");
  return buffer;
}

async function preparePmaxImages(creativeUrl: string, logoUrl: string): Promise<PreparedImages> {
  const [creative, logo] = await Promise.all([download(creativeUrl), download(logoUrl)]);
  const landscape = await sharp(creative)
    .resize(1200, 628, { fit: "cover", position: "attention" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const square = await sharp(creative)
    .resize(1200, 1200, { fit: "cover", position: "attention" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const logoSquare = await sharp(logo)
    .resize(1200, 1200, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  for (const [label, buffer] of [["landscape", landscape], ["square", square], ["logo", logoSquare]] as const) {
    if (buffer.byteLength > 5_120_000) throw new GooglePmaxPublishError(`Asset ${label} excedeu 5 MB após normalização.`);
  }
  return {
    landscape: landscape.toString("base64"),
    square: square.toString("base64"),
    logo: logoSquare.toString("base64"),
  };
}

async function resolveFinalUrl(tenantId: string, campaign: AdCampaign) {
  if (campaign.destinoClique === "whatsapp" || campaign.destinoClique === "formulario_lead") {
    throw new GooglePmaxPublishError("Performance Max exige destino web/landing page; WhatsApp e formulário nativo não são usados como final URL neste publisher.");
  }
  if (campaign.itemTipo === "landing_page") {
    if (!campaign.landingPageId) throw new GooglePmaxPublishError("Landing page não vinculada à campanha.");
    const [site] = await db.select({ siteSlug: generatedSitesTable.siteSlug }).from(generatedSitesTable)
      .where(eq(generatedSitesTable.id, campaign.landingPageId)).limit(1);
    if (!site?.siteSlug) throw new GooglePmaxPublishError("Landing page ainda não possui endereço publicado.");
    const url = new URL(`https://${site.siteSlug}.appvendorai.com`);
    if (campaign.utmCode) url.searchParams.set("utm_campaign", campaign.utmCode);
    return url.toString();
  }
  const [tenant] = await db.select({ subdomainSlug: tenantsTable.subdomainSlug }).from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId)).limit(1);
  if (!tenant?.subdomainSlug) throw new GooglePmaxPublishError("Tenant sem site publicado para usar como destino da Performance Max.");
  const url = new URL(`https://${tenant.subdomainSlug}.appvendorai.com`);
  if (campaign.utmCode) url.searchParams.set("utm_campaign", campaign.utmCode);
  return url.toString();
}

function clip(value: string, max: number) {
  return value.trim().slice(0, max).trim();
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractResourceNames(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string" && value.startsWith("customers/")) out.add(value);
  else if (Array.isArray(value)) for (const item of value) extractResourceNames(item, out);
  else if (value && typeof value === "object") for (const child of Object.values(value as Record<string, unknown>)) extractResourceNames(child, out);
  return out;
}

export function validatePmaxCreative(input: { headlines: string[]; descriptions: string[]; images: string[] }) {
  const headlines = unique(input.headlines.map((value) => clip(value, 30)));
  const descriptions = unique(input.descriptions.map((value) => clip(value, 90)));
  if (headlines.length < 3) throw new GooglePmaxPublishError("Performance Max exige pelo menos 3 títulos distintos no criativo aprovado.");
  if (descriptions.length < 2) throw new GooglePmaxPublishError("Performance Max exige pelo menos 2 descrições distintas no criativo aprovado.");
  if (input.images.length < 1) throw new GooglePmaxPublishError("Performance Max exige pelo menos uma imagem aprovada.");
  const shortDescription = descriptions.find((value) => value.length <= 60) || clip(descriptions[0], 60);
  const normalizedDescriptions = unique([shortDescription, ...descriptions]).slice(0, 5);
  const longHeadline = clip(input.descriptions[0] || input.headlines[0], 90);
  return { headlines: headlines.slice(0, 15), descriptions: normalizedDescriptions, longHeadline };
}

export interface PmaxPublishResult {
  externalCampaignId: string;
  campaignResourceName: string;
  assetGroupResourceName: string;
}

export async function publishCampaignToGooglePmax(tenantId: string, campaignId: string): Promise<PmaxPublishResult> {
  const [campaign] = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.id, campaignId),
    eq(adCampaignsTable.tenantId, tenantId),
  )).limit(1);
  if (!campaign) throw new GooglePmaxPublishError("Campanha não encontrada.");
  if (campaign.plataforma !== "google" || resolveGoogleCampaignFormat(campaign) !== "performance_max") {
    throw new GooglePmaxPublishError("Esta campanha não está marcada como Performance Max.");
  }
  if (campaign.externalCampaignId) throw new GooglePmaxPublishError("Campanha já publicada no Google Ads.");

  const [creative] = await db.select().from(adCreativesTable).where(and(
    eq(adCreativesTable.campaignId, campaignId),
    eq(adCreativesTable.status, "aprovado"),
  )).limit(1);
  if (!creative) throw new GooglePmaxPublishError("Aprove o criativo antes de publicar Performance Max.");
  const text = validatePmaxCreative({ headlines: creative.headlines, descriptions: creative.descriptions, images: creative.imagens });

  const [[profile], [tenant]] = await Promise.all([
    db.select({ logoUrl: businessProfilesTable.logoUrl }).from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({ name: tenantsTable.name, nomeEmpresa: tenantsTable.nomeEmpresa, logoUrl: tenantsTable.logoUrl }).from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId)).limit(1),
  ]);
  const logoUrl = profile?.logoUrl || tenant?.logoUrl;
  const businessName = clip(tenant?.nomeEmpresa || tenant?.name || "", 25);
  if (!logoUrl) throw new GooglePmaxPublishError("Performance Max exige logo do tenant no Brand Kit/Perfil do Negócio.");
  if (!businessName) throw new GooglePmaxPublishError("Performance Max exige nome da empresa do tenant.");

  const images = await preparePmaxImages(creative.imagens[0], logoUrl);
  const finalUrl = await resolveFinalUrl(tenantId, campaign);
  const { accessToken, customerId } = await getValidAccessToken(tenantId);
  const geoTargets = await resolveGeoTargets(accessToken, campaign.segmentacao?.localizacao?.locais ?? []);
  const budgetMicros = Math.max(1, Math.round(Number(campaign.orcamentoDiario) * 1_000_000));
  const now = Date.now();

  const budgetResource = `customers/${customerId}/campaignBudgets/-1`;
  const campaignResource = `customers/${customerId}/campaigns/-2`;
  const assetGroupResource = `customers/${customerId}/assetGroups/-3`;
  let nextAssetId = -10;
  const mutateOperations: Array<Record<string, unknown>> = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResource,
          name: `VendorAI PMax Budget ${campaign.id.slice(0, 8)} ${now}`,
          amountMicros: String(budgetMicros),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResource,
          name: `VendorAI PMax ${campaign.itemLabel || campaign.vertical} ${now}`.slice(0, 128),
          campaignBudget: budgetResource,
          advertisingChannelType: "PERFORMANCE_MAX",
          status: "PAUSED",
          maximizeConversions: {},
          brandGuidelinesEnabled: false,
        },
      },
    },
    ...geoTargets.map((geoTargetConstant) => ({
      campaignCriterionOperation: { create: { campaign: campaignResource, location: { geoTargetConstant } } },
    })),
  ];

  const links: Array<{ resourceName: string; fieldType: string }> = [];
  const addTextAsset = (value: string, fieldType: string) => {
    const resourceName = `customers/${customerId}/assets/${nextAssetId--}`;
    mutateOperations.push({ assetOperation: { create: { resourceName, textAsset: { text: value } } } });
    links.push({ resourceName, fieldType });
  };
  text.headlines.forEach((value) => addTextAsset(value, "HEADLINE"));
  addTextAsset(text.longHeadline, "LONG_HEADLINE");
  text.descriptions.forEach((value) => addTextAsset(value, "DESCRIPTION"));
  addTextAsset(businessName, "BUSINESS_NAME");

  const addImageAsset = (data: string, fieldType: string, name: string) => {
    const resourceName = `customers/${customerId}/assets/${nextAssetId--}`;
    mutateOperations.push({ assetOperation: { create: { resourceName, name, imageAsset: { data } } } });
    links.push({ resourceName, fieldType });
  };
  addImageAsset(images.landscape, "MARKETING_IMAGE", `VendorAI PMax landscape ${campaign.id.slice(0, 8)}`);
  addImageAsset(images.square, "SQUARE_MARKETING_IMAGE", `VendorAI PMax square ${campaign.id.slice(0, 8)}`);
  addImageAsset(images.logo, "LOGO", `VendorAI PMax tenant logo ${campaign.id.slice(0, 8)}`);

  mutateOperations.push({
    assetGroupOperation: {
      create: {
        resourceName: assetGroupResource,
        campaign: campaignResource,
        name: `VendorAI Asset Group ${campaign.id.slice(0, 8)}`,
        finalUrls: [finalUrl],
        status: "PAUSED",
      },
    },
  });
  for (const link of links) {
    mutateOperations.push({
      assetGroupAssetOperation: {
        create: { assetGroup: assetGroupResource, asset: link.resourceName, fieldType: link.fieldType },
      },
    });
  }

  const response = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:mutate`, {
    method: "POST",
    headers: googleHeaders(accessToken),
    body: JSON.stringify({ mutateOperations, partialFailure: false, responseContentType: "RESOURCE_NAME_ONLY" }),
  });
  const raw = await response.text();
  if (!response.ok) {
    logger.error({ tenantId, campaignId, status: response.status, body: raw.slice(0, 1500) }, "Falha ao criar Performance Max");
    throw new GooglePmaxPublishError(`Google Ads recusou a Performance Max (${response.status}): ${raw.slice(0, 500)}`);
  }
  const parsed = (raw ? JSON.parse(raw) : {}) as MutateResponse;
  const resourceNames = [...extractResourceNames(parsed)];
  const actualCampaignResource = resourceNames.find((value) => /\/campaigns\/\d+$/.test(value));
  const actualAssetGroupResource = resourceNames.find((value) => /\/assetGroups\/\d+$/.test(value));
  if (!actualCampaignResource || !actualAssetGroupResource) {
    throw new GooglePmaxPublishError("Google Ads criou recursos, mas não retornou campaign/asset group identificáveis.");
  }
  const externalCampaignId = actualCampaignResource.split("/").pop() || "";
  await db.update(adCampaignsTable).set({ externalCampaignId, status: "pausado", updatedAt: new Date() })
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));

  logger.info({ tenantId, campaignId, externalCampaignId, actualAssetGroupResource }, "Performance Max criada pausada no Google Ads");
  return {
    externalCampaignId,
    campaignResourceName: actualCampaignResource,
    assetGroupResourceName: actualAssetGroupResource,
  };
}
