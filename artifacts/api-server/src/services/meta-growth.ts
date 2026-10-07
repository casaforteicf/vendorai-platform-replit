import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  contentPublishedPostsTable,
  db,
  dealsTable,
  leadsTable,
  metaGrowthDailySnapshotsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getInstagramConnectionByTenantId } from "./instagram-oauth.js";
import {
  getMetaAdsConnectionByTenantId,
  META_GRAPH_BASE,
  normalizeMetaAdAccountId,
} from "./meta-ads-oauth.js";
import { getInstagramStoryFunnel } from "./instagram-story-funnel.js";
import { canonicalDealValueSql } from "../lib/deal-value.js";

const IG_GRAPH_BASE = "https://graph.instagram.com/v26.0";
const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

type InsightMetric = { name?: string; total_value?: { value?: number } };
type InsightResponse = { data?: InsightMetric[] };

type MetaAdsInsightRow = {
  spend?: string;
  actions?: Array<{ action_type?: string; value?: string }>;
};

export type MetaGrowthAlert = {
  id: string;
  severity: "success" | "warning" | "info";
  title: string;
  message: string;
};

function isMetaSource(source: string | null | undefined) {
  const value = (source ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return value.includes("instagram") || value.includes("facebook") || value.includes("meta");
}

function isPaidMetaLead(lead: { source: string; adCampaignId: string | null }) {
  const value = lead.source.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return Boolean(lead.adCampaignId) || value.includes("ads") || value.includes("anuncio") || value.includes("patrocin");
}

function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dayAgo(days: number) {
  return isoDay(new Date(Date.now() - days * DAY_MS));
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

async function saveDailySnapshot(params: {
  tenantId: string;
  followers: number;
  reach30d: number | null;
  profileVisits30d: number | null;
  engagedAccounts30d: number | null;
}) {
  const snapshotDate = isoDay();
  await db
    .insert(metaGrowthDailySnapshotsTable)
    .values({ ...params, snapshotDate, capturedAt: new Date() })
    .onConflictDoUpdate({
      target: [metaGrowthDailySnapshotsTable.tenantId, metaGrowthDailySnapshotsTable.snapshotDate],
      set: {
        followers: params.followers,
        reach30d: params.reach30d,
        profileVisits30d: params.profileVisits30d,
        engagedAccounts30d: params.engagedAccounts30d,
        capturedAt: new Date(),
      },
    });
}

async function followerDelta(tenantId: string, followers: number, days: number) {
  const [snapshot] = await db
    .select({ followers: metaGrowthDailySnapshotsTable.followers, snapshotDate: metaGrowthDailySnapshotsTable.snapshotDate })
    .from(metaGrowthDailySnapshotsTable)
    .where(and(
      eq(metaGrowthDailySnapshotsTable.tenantId, tenantId),
      lte(metaGrowthDailySnapshotsTable.snapshotDate, dayAgo(days)),
    ))
    .orderBy(desc(metaGrowthDailySnapshotsTable.snapshotDate))
    .limit(1);
  return snapshot?.followers == null ? null : followers - snapshot.followers;
}

function buildAlerts(params: {
  instagramConnected: boolean;
  facebookConnected: boolean;
  followersDelta7d: number | null;
  paidSpend30d: number | null;
  leads30d: number;
  topContent: Array<{ title: string; engagements: number }>;
}): MetaGrowthAlert[] {
  const alerts: MetaGrowthAlert[] = [];
  if (!params.instagramConnected) {
    alerts.push({
      id: "instagram-disconnected",
      severity: "warning",
      title: "Instagram precisa de conexão",
      message: "Conecte ou renove o Instagram para acompanhar audiência e crescimento real.",
    });
  }
  if (!params.facebookConnected) {
    alerts.push({
      id: "facebook-disconnected",
      severity: "info",
      title: "Meta Ads não está ativo",
      message: "Sem uma conexão ativa de Ads, investimento e conversões pagas ficam incompletos.",
    });
  }
  if (params.followersDelta7d != null && params.followersDelta7d > 0) {
    alerts.push({
      id: "followers-growing",
      severity: "success",
      title: "Audiência em crescimento",
      message: `O perfil ganhou ${params.followersDelta7d} seguidores nos últimos 7 dias.`,
    });
  }
  if ((params.paidSpend30d ?? 0) > 0 && params.leads30d === 0) {
    alerts.push({
      id: "spend-without-leads",
      severity: "warning",
      title: "Investimento sem leads atribuídos",
      message: "Há gasto em mídia nos últimos 30 dias, mas nenhum lead Meta foi atribuído no CRM.",
    });
  }
  if (params.topContent.length >= 3) {
    const average = params.topContent.reduce((sum, item) => sum + item.engagements, 0) / params.topContent.length;
    const best = params.topContent[0];
    if (best && average > 0 && best.engagements >= average * 1.5) {
      alerts.push({
        id: `top-content-${best.title}`,
        severity: "success",
        title: "Conteúdo acima da média",
        message: `“${best.title}” está com pelo menos 50% mais interações que a média dos conteúdos recentes.`,
      });
    }
  }
  return alerts.slice(0, 4);
}

export async function getMetaGrowthOverview(tenantId: string) {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const [instagram, metaAds, recentLeads, recentPosts, storyFunnel] = await Promise.all([
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
    getInstagramStoryFunnel(tenantId).catch((error) => {
      logger.warn({ error, tenantId }, "Meta Growth: funil de Stories indisponível");
      return null;
    }),
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

  let followersDelta7d: number | null = null;
  let followersDelta30d: number | null = null;
  if (followers != null) {
    await saveDailySnapshot({ tenantId, followers, reach30d, profileVisits30d, engagedAccounts30d });
    [followersDelta7d, followersDelta30d] = await Promise.all([
      followerDelta(tenantId, followers, 7),
      followerDelta(tenantId, followers, 30),
    ]);
  }

  const metaLeads = recentLeads.filter((lead) => isMetaSource(lead.source));
  const paidMetaLeadIds = metaLeads.filter(isPaidMetaLead).map((lead) => lead.id);
  const organicMetaLeadIds = metaLeads.filter((lead) => !isPaidMetaLead(lead)).map((lead) => lead.id);
  const metaLeadIds = metaLeads.map((lead) => lead.id);

  const relatedDeals = metaLeadIds.length
    ? await db
        .select({ leadId: dealsTable.leadId, valor: canonicalDealValueSql })
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

  const alerts = buildAlerts({
    instagramConnected,
    facebookConnected,
    followersDelta7d,
    paidSpend30d,
    leads30d: metaLeads.length,
    topContent: topContent.map((item) => ({ title: item.title, engagements: item.engagements })),
  });

  return {
    connected: instagramConnected || facebookConnected,
    instagramConnected,
    facebookConnected,
    followers,
    followersDelta7d,
    followersDelta30d,
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
    storyFunnel,
    alerts,
    refreshedAt: new Date().toISOString(),
    dataQuality: {
      followerDeltas: followersDelta7d != null || followersDelta30d != null ? "historical_snapshots" : "collecting_daily_snapshots",
      contentFollowerAttribution: "not_available_from_current_history",
      paidLeadsSource: paidMetaLeadIds.length ? "crm" : paidLeadsFromAds != null ? "meta_ads" : "unavailable",
      storyFunnelAttribution: storyFunnel ? "media_id_to_crm" : "unavailable",
    },
  };
}
