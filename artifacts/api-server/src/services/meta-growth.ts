import { and, eq, gte } from "drizzle-orm";
import {
  contentPublishedPostsTable,
  db,
  dealsTable,
  leadsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getInstagramConnectionByTenantId } from "./instagram-oauth.js";
import {
  getMetaAdsConnectionByTenantId,
  META_GRAPH_BASE,
  normalizeMetaAdAccountId,
} from "./meta-ads-oauth.js";

const IG_GRAPH_BASE = "https://graph.instagram.com/v26.0";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type InsightMetric = { name?: string; total_value?: { value?: number } };
type InsightResponse = { data?: InsightMetric[] };

type MetaAdsInsightRow = {
  spend?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
};

function isMetaSource(source: string | null | undefined) {
  const value = (source ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return value.includes("instagram") || value.includes("facebook") || value.includes("meta");
}

function isPaidMetaLead(lead: { source: string; adCampaignId: string | null }) {
  const value = lead.source.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return Boolean(lead.adCampaignId) || value.includes("ads") || value.includes("anuncio") || value.includes("patrocin");
}

async function fetchInstagramProfile(accountId: string, token: string) {
  const url = new URL(`${IG_GRAPH_BASE}/${accountId}`);
  url.searchParams.set("fields", "id,username,followers_count,media_count");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  if (!response.ok) {
    logger.warn({ status: response.status, accountId }, "Meta Growth: perfil do Instagram indisponível");
    return null;
  }
  return response.json() as Promise<{ followers_count?: number; media_count?: number }>;
}

async function fetchInstagramTotalMetric(accountId: string, token: string, metric: string): Promise<number | null> {
  const now = Math.floor(Date.now() / 1000);
  const since = Math.floor((Date.now() - THIRTY_DAYS_MS) / 1000);
  const url = new URL(`${IG_GRAPH_BASE}/${accountId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("period", "day");
  url.searchParams.set("since", String(since));
  url.searchParams.set("until", String(now));
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = (await response.json()) as InsightResponse;
  const value = payload.data?.[0]?.total_value?.value;
  return typeof value === "number" ? value : null;
}

async function fetchMetaAds30d(adAccountId: string, token: string) {
  const url = new URL(`${META_GRAPH_BASE}/${normalizeMetaAdAccountId(adAccountId)}/insights`);
  url.searchParams.set("fields", "spend,actions");
  url.searchParams.set("date_preset", "last_30d");
  url.searchParams.set("level", "account");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  if (!response.ok) {
    logger.warn({ status: response.status, adAccountId }, "Meta Growth: insights de Ads indisponíveis");
    return { spend: null as number | null, leads: null as number | null };
  }
  const payload = (await response.json()) as { data?: MetaAdsInsightRow[] };
  const row = payload.data?.[0];
  if (!row) return { spend: 0, leads: 0 };
  const spend = row.spend != null && Number.isFinite(Number(row.spend)) ? Number(row.spend) : null;
  const leadAction = row.actions?.find((action) => {
    const kind = action.action_type ?? "";
    return kind === "lead" || kind === "onsite_conversion.lead_grouped" || kind.endsWith(".lead");
  });
  const leads = leadAction?.value != null && Number.isFinite(Number(leadAction.value)) ? Number(leadAction.value) : null;
  return { spend, leads };
}

export async function getMetaGrowthOverview(tenantId: string) {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const [instagram, metaAds, recentLeads, recentPosts] = await Promise.all([
    getInstagramConnectionByTenantId(tenantId),
    getMetaAdsConnectionByTenantId(tenantId),
    db
      .select({ id: leadsTable.id, source: leadsTable.source, adCampaignId: leadsTable.adCampaignId })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), gte(leadsTable.createdAt, cutoff))),
    db
      .select()
      .from(contentPublishedPostsTable)
      .where(and(eq(contentPublishedPostsTable.tenantId, tenantId), gte(contentPublishedPostsTable.publishedAt, cutoff))),
  ]);

  const instagramConnected = Boolean(instagram?.pageAccessToken && !instagram.disconnectedAt);
  const facebookConnected = Boolean(metaAds?.accessToken && metaAds.status === "active" && !metaAds.disconnectedAt);

  let followers: number | null = null;
  let reach30d: number | null = null;
  let profileVisits30d: number | null = null;
  let engagedAccounts30d: number | null = null;

  if (instagramConnected && instagram?.accountId && instagram.pageAccessToken) {
    const [profile, reach, visits, engaged] = await Promise.all([
      fetchInstagramProfile(instagram.accountId, instagram.pageAccessToken),
      fetchInstagramTotalMetric(instagram.accountId, instagram.pageAccessToken, "reach"),
      fetchInstagramTotalMetric(instagram.accountId, instagram.pageAccessToken, "profile_views"),
      fetchInstagramTotalMetric(instagram.accountId, instagram.pageAccessToken, "accounts_engaged"),
    ]);
    followers = profile?.followers_count ?? null;
    reach30d = reach;
    profileVisits30d = visits;
    engagedAccounts30d = engaged;
  }

  const metaLeads = recentLeads.filter((lead) => isMetaSource(lead.source));
  const paidMetaLeadIds = metaLeads.filter(isPaidMetaLead).map((lead) => lead.id);
  const organicMetaLeadIds = metaLeads.filter((lead) => !isPaidMetaLead(lead)).map((lead) => lead.id);
  const metaLeadIds = metaLeads.map((lead) => lead.id);

  const relatedDeals = metaLeadIds.length
    ? await db
        .select({ leadId: dealsTable.leadId, valor: dealsTable.valor })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), gte(dealsTable.createdAt, cutoff)))
    : [];
  const metaLeadSet = new Set(metaLeadIds);
  const metaDeals = relatedDeals.filter((deal) => deal.leadId && metaLeadSet.has(deal.leadId));
  const pipelineValue30d = metaDeals.reduce((sum, deal) => sum + (deal.valor ? Number(deal.valor) || 0 : 0), 0);

  let paidSpend30d: number | null = null;
  let paidLeadsFromAds: number | null = null;
  if (facebookConnected && metaAds?.accessToken && metaAds.adAccountId) {
    const paid = await fetchMetaAds30d(metaAds.adAccountId, metaAds.accessToken);
    paidSpend30d = paid.spend;
    paidLeadsFromAds = paid.leads;
  }

  const topContent = recentPosts
    .map((post) => {
      const m = post.metricas ?? {};
      const engagements = (m.likes ?? 0) + (m.comments ?? 0) + (m.saved ?? 0) + (m.shares ?? 0);
      return {
        id: post.id,
        title: post.theme || post.captionOuTexto?.slice(0, 70) || "Conteúdo publicado",
        format: post.contentType,
        reach: m.reach ?? null,
        engagements,
        followersGained: null,
        leads: null,
      };
    })
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, 5);

  return {
    connected: instagramConnected || facebookConnected,
    instagramConnected,
    facebookConnected,
    followers,
    followersDelta7d: null,
    followersDelta30d: null,
    reach30d,
    profileVisits30d,
    engagedAccounts30d,
    leads30d: metaLeads.length,
    opportunities30d: metaDeals.length,
    pipelineValue30d,
    paidSpend30d,
    paidLeads30d: paidMetaLeadIds.length || paidLeadsFromAds,
    organicLeads30d: organicMetaLeadIds.length,
    topContent,
    dataQuality: {
      followerDeltas: "pending_daily_snapshots",
      contentFollowerAttribution: "not_available_from_current_history",
      paidLeadsSource: paidMetaLeadIds.length ? "crm" : paidLeadsFromAds != null ? "meta_ads" : "unavailable",
    },
  };
}
