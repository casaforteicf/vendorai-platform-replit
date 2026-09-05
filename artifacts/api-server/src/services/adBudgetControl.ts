import { and, eq } from "drizzle-orm";
import { adCampaignsTable, db } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getGoogleAdsConnectionByTenantId, refreshGoogleAdsToken } from "./google-ads-oauth.js";
import {
  getMetaAdsConnectionByTenantId,
  refreshMetaAdsToken,
  META_GRAPH_BASE,
} from "./meta-ads-oauth.js";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];

export class AdBudgetControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdBudgetControlError";
  }
}

async function googleCredentials(tenantId: string) {
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.customerId) {
    throw new AdBudgetControlError("Google Ads não está conectado para este cliente.");
  }
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (!conn.accessToken || expiresAt < Date.now() + 2 * 60 * 1000) {
    await refreshGoogleAdsToken(conn.id);
    const refreshed = await getGoogleAdsConnectionByTenantId(tenantId);
    if (!refreshed?.accessToken) throw new AdBudgetControlError("Não foi possível renovar o acesso ao Google Ads.");
    return { accessToken: refreshed.accessToken, customerId: conn.customerId };
  }
  return { accessToken: conn.accessToken, customerId: conn.customerId };
}

async function metaCredentials(tenantId: string) {
  const conn = await getMetaAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.adAccountId) {
    throw new AdBudgetControlError("Meta Ads não está conectado para este cliente.");
  }
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (!conn.accessToken || expiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
    await refreshMetaAdsToken(conn.id);
    const refreshed = await getMetaAdsConnectionByTenantId(tenantId);
    if (!refreshed?.accessToken) throw new AdBudgetControlError("Não foi possível renovar o acesso ao Meta Ads.");
    return { accessToken: refreshed.accessToken };
  }
  return { accessToken: conn.accessToken };
}

async function updateGoogleDailyBudget(tenantId: string, externalCampaignId: string, dailyBudget: number) {
  const { accessToken, customerId } = await googleCredentials(tenantId);
  const query = [
    "SELECT campaign.campaign_budget, campaign_budget.resource_name, campaign_budget.amount_micros",
    "FROM campaign",
    `WHERE campaign.id = ${externalCampaignId}`,
    "LIMIT 1",
  ].join(" ");
  const search = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!search.ok) {
    const raw = await search.text();
    throw new AdBudgetControlError(`Google Ads não permitiu localizar o orçamento: ${raw.slice(0, 240)}`);
  }
  const chunks = await search.json() as Array<{ results?: Array<{ campaign?: { campaignBudget?: string }; campaignBudget?: { resourceName?: string } }> }>;
  const first = chunks.flatMap((chunk) => chunk.results ?? [])[0];
  const resourceName = first?.campaignBudget?.resourceName ?? first?.campaign?.campaignBudget;
  if (!resourceName) throw new AdBudgetControlError("Google Ads não retornou o recurso de orçamento da campanha.");

  const amountMicros = String(Math.round(dailyBudget * 1_000_000));
  const mutate = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/campaignBudgets:mutate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operations: [{ update: { resourceName, amountMicros }, updateMask: "amount_micros" }] }),
  });
  if (!mutate.ok) {
    const raw = await mutate.text();
    throw new AdBudgetControlError(`Google Ads recusou o novo orçamento: ${raw.slice(0, 240)}`);
  }
}

async function updateMetaDailyBudget(tenantId: string, externalCampaignId: string, dailyBudget: number) {
  const { accessToken } = await metaCredentials(tenantId);
  const listUrl = new URL(`${META_GRAPH_BASE}/${externalCampaignId}/adsets`);
  listUrl.searchParams.set("fields", "id,daily_budget");
  listUrl.searchParams.set("limit", "10");
  listUrl.searchParams.set("access_token", accessToken);
  const list = await fetch(listUrl.toString());
  if (!list.ok) {
    const raw = await list.text();
    throw new AdBudgetControlError(`Meta Ads não permitiu localizar o conjunto de anúncios: ${raw.slice(0, 240)}`);
  }
  const payload = await list.json() as { data?: Array<{ id?: string }> };
  const adSetIds = (payload.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
  if (adSetIds.length === 0) throw new AdBudgetControlError("Meta Ads não retornou conjunto de anúncios para esta campanha.");

  const dailyBudgetCents = String(Math.round(dailyBudget * 100));
  for (const adSetId of adSetIds) {
    const body = new URLSearchParams({ daily_budget: dailyBudgetCents, access_token: accessToken });
    const update = await fetch(`${META_GRAPH_BASE}/${adSetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!update.ok) {
      const raw = await update.text();
      throw new AdBudgetControlError(`Meta Ads recusou o novo orçamento: ${raw.slice(0, 240)}`);
    }
  }
}

/**
 * Altera o orçamento diário real na plataforma e só depois espelha o valor
 * no VendorAI. A função não decide aumento/redução: quem chama precisa validar
 * o teto financeiro da campanha/plano antes. Isso evita divergência local se
 * a plataforma recusar a alteração.
 */
export async function setPlatformCampaignDailyBudget(
  tenantId: string,
  campaignId: string,
  requestedDailyBudget: number,
): Promise<{ previousDailyBudget: number; dailyBudget: number }> {
  const dailyBudget = Math.round(requestedDailyBudget * 100) / 100;
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) {
    throw new AdBudgetControlError("O orçamento diário precisa ser maior que zero.");
  }

  const [campaign] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campaign) throw new AdBudgetControlError("Campanha não encontrada.");
  if (!campaign.externalCampaignId) throw new AdBudgetControlError("Campanha ainda não foi publicada na plataforma.");
  if (campaign.plataforma !== "google" && campaign.plataforma !== "meta") {
    throw new AdBudgetControlError(`Ajuste automático ainda não disponível para ${campaign.plataforma}.`);
  }

  const previousDailyBudget = Number(campaign.orcamentoDiario);
  if (Math.abs(previousDailyBudget - dailyBudget) < 0.01) return { previousDailyBudget, dailyBudget };

  if (campaign.plataforma === "google") {
    await updateGoogleDailyBudget(tenantId, campaign.externalCampaignId, dailyBudget);
  } else {
    await updateMetaDailyBudget(tenantId, campaign.externalCampaignId, dailyBudget);
  }

  await db.update(adCampaignsTable)
    .set({ orcamentoDiario: dailyBudget.toFixed(2), updatedAt: new Date() })
    .where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.tenantId, tenantId)));

  logger.info({ tenantId, campaignId, plataforma: campaign.plataforma, previousDailyBudget, dailyBudget }, "ads: orçamento diário alterado na plataforma");
  return { previousDailyBudget, dailyBudget };
}
