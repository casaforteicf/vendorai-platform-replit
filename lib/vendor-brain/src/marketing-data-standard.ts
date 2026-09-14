export type MarketingAutomationMode = 'OBSERVE' | 'RECOMMEND' | 'APPROVE' | 'EXECUTE';

export type MarketingConnector =
  | 'instagram'
  | 'facebook'
  | 'googleanalytics4'
  | 'google_ads'
  | 'searchconsole'
  | 'tiktok'
  | 'tiktok_organic'
  | string;

export interface MarketingMetricProvenance {
  tenantId: string;
  connector: MarketingConnector;
  accountId: string;
  accountName?: string | null;
  fetchedAt?: string | null;
  sourceRecordId?: string | null;
}

export interface NormalizedMarketingRecord {
  provenance: MarketingMetricProvenance;
  date?: string | null;
  content?: {
    id?: string | null;
    type?: string | null;
    productType?: string | null;
    permalink?: string | null;
    caption?: string | null;
    publishedAt?: string | null;
  };
  delivery?: {
    reach?: number | null;
    impressions?: number | null;
    views?: number | null;
    frequency?: number | null;
  };
  engagement?: {
    likes?: number | null;
    comments?: number | null;
    saves?: number | null;
    shares?: number | null;
    reposts?: number | null;
    replies?: number | null;
    interactions?: number | null;
    accountsEngaged?: number | null;
  };
  acquisition?: {
    clicks?: number | null;
    profileVisits?: number | null;
    profileLinkTaps?: number | null;
    sessions?: number | null;
    leads?: number | null;
    follows?: number | null;
  };
  commerce?: {
    opportunities?: number | null;
    conversions?: number | null;
    revenue?: number | null;
    ticket?: number | null;
    roas?: number | null;
    spend?: number | null;
  };
  audience?: {
    country?: string | null;
    region?: string | null;
    city?: string | null;
    age?: string | null;
    gender?: string | null;
  };
  quality?: {
    watchTimeMs?: number | null;
    averageWatchTimeMs?: number | null;
    skipRate?: number | null;
    engagementRate?: number | null;
  };
  raw?: Record<string, unknown>;
}

export interface MarketingDataQuery {
  tenantId: string;
  connector: MarketingConnector;
  accountIds: string[];
  dateFrom?: string;
  dateTo?: string;
  datePreset?: string;
}

export interface MarketingDataProvider {
  id: 'windsor' | 'native' | string;
  read(query: MarketingDataQuery): Promise<NormalizedMarketingRecord[]>;
}

export interface WindsorRow {
  [field: string]: unknown;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toStringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const ratio = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
};

/**
 * Maps Windsor.ai rows into the canonical VendorAI marketing contract.
 * Unknown or unavailable provider fields stay null/undefined and raw data is
 * retained for traceability. No tenant or account information is inferred.
 */
export function normalizeWindsorMarketingRow(input: {
  tenantId: string;
  connector: MarketingConnector;
  accountId: string;
  accountName?: string | null;
  row: WindsorRow;
}): NormalizedMarketingRecord {
  const { tenantId, connector, accountId, accountName, row } = input;

  const reach = toNumber(row.media_reach ?? row.reach ?? row.reach_1d);
  const views = toNumber(row.media_views ?? row.views);
  const interactions = toNumber(row.media_engagement ?? row.total_interactions);

  return {
    provenance: {
      tenantId,
      connector,
      accountId,
      accountName: accountName ?? toStringValue(row.account_name),
      fetchedAt: toStringValue(row.data_fetched_at),
      sourceRecordId: toStringValue(row.media_id ?? row.campaign_id ?? row.ad_id),
    },
    date: toStringValue(row.date),
    content: {
      id: toStringValue(row.media_id),
      type: toStringValue(row.media_type),
      productType: toStringValue(row.media_product_type),
      permalink: toStringValue(row.media_permalink),
      caption: toStringValue(row.media_caption),
      publishedAt: toStringValue(row.timestamp),
    },
    delivery: {
      reach,
      impressions: toNumber(row.media_impressions ?? row.impressions),
      views,
      frequency: toNumber(row.frequency),
    },
    engagement: {
      likes: toNumber(row.media_like_count ?? row.likes),
      comments: toNumber(row.media_comments_count ?? row.comments),
      saves: toNumber(row.media_saved ?? row.saves),
      shares: toNumber(row.media_shares ?? row.shares),
      reposts: toNumber(row.reposts),
      replies: toNumber(row.replies),
      interactions,
      accountsEngaged: toNumber(row.accounts_engaged),
    },
    acquisition: {
      clicks: toNumber(row.clicks),
      profileVisits: toNumber(row.media_profile_visits ?? row.profile_views),
      profileLinkTaps: toNumber(row.profile_links_taps),
      sessions: toNumber(row.sessions),
      leads: toNumber(row.leads),
      // media_follows represents follows attributed to a content item. Profile-level
      // follower_count is a stock value and must never be summed as newly gained followers.
      follows: toNumber(row.media_follows),
    },
    commerce: {
      opportunities: toNumber(row.opportunities),
      conversions: toNumber(row.conversions),
      revenue: toNumber(row.revenue),
      ticket: toNumber(row.ticket),
      roas: toNumber(row.roas),
      spend: toNumber(row.spend),
    },
    audience: {
      country: toStringValue(row.audience_country_name ?? row.country),
      region: toStringValue(row.region),
      city: toStringValue(row.city),
      age: toStringValue(row.audience_age_name),
      gender: toStringValue(row.audience_gender_name),
    },
    quality: {
      watchTimeMs: toNumber(row.media_reel_total_watch_time),
      averageWatchTimeMs: toNumber(row.media_reel_avg_watch_time),
      skipRate: toNumber(row.media_reel_skip_rate),
      engagementRate: ratio(interactions, reach ?? views),
    },
    raw: { ...row },
  };
}

export interface MarketingPriority {
  kind: 'retention' | 'engagement' | 'distribution' | 'conversion';
  title: string;
  evidence: string;
  recommendedAction: string;
  confidence: number;
  requiresApproval: boolean;
}

/**
 * First deterministic priority layer for Tad. It is intentionally conservative:
 * it only emits recommendations supported directly by normalized metrics.
 */
export function deriveMarketingPriorities(
  records: NormalizedMarketingRecord[],
  mode: MarketingAutomationMode = 'RECOMMEND',
): MarketingPriority[] {
  const priorities: MarketingPriority[] = [];

  for (const record of records) {
    const skipRate = record.quality?.skipRate;
    const views = record.delivery?.views ?? null;
    const interactions = record.engagement?.interactions ?? null;
    const engagementRate = record.quality?.engagementRate ?? null;

    if (skipRate != null && skipRate >= 0.75 && (views ?? 0) >= 20) {
      priorities.push({
        kind: 'retention',
        title: 'Retenção crítica nos primeiros segundos',
        evidence: `Skip rate ${(skipRate * 100).toFixed(1)}% com ${views ?? 0} visualizações.`,
        recommendedAction: 'Gerar uma nova versão com gancho direto de dor/resultado nos primeiros 2 segundos.',
        confidence: 0.95,
        requiresApproval: mode !== 'EXECUTE',
      });
    }

    if (engagementRate != null && engagementRate >= 0.2 && (interactions ?? 0) >= 3) {
      priorities.push({
        kind: 'engagement',
        title: 'Conteúdo com sinal forte de interesse',
        evidence: `Taxa de interação ${(engagementRate * 100).toFixed(1)}% (${interactions ?? 0} interações).`,
        recommendedAction: 'Reaproveitar o tema, formato e CTA em uma nova variação e ampliar distribuição.',
        confidence: 0.85,
        requiresApproval: mode !== 'EXECUTE',
      });
    }
  }

  return priorities
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}
