import { getSearchConsoleConnectionByTenantId, refreshSearchConsoleToken } from "./search-console-oauth.js";
import { getVisitorIntelligence } from "./visitorIntelligence.js";
import { logger } from "../lib/logger.js";

const SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3";

type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchAnalyticsResponse = {
  rows?: SearchAnalyticsRow[];
};

type SearchConsoleConnection = NonNullable<Awaited<ReturnType<typeof getSearchConsoleConnectionByTenantId>>>;

type SearchAnalyticsRequest = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  type?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
};

function clampDays(value: number) {
  if (!Number.isFinite(value)) return 28;
  return Math.max(7, Math.min(90, Math.round(value)));
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function metric(row?: SearchAnalyticsRow) {
  return {
    clicks: Number(row?.clicks ?? 0),
    impressions: Number(row?.impressions ?? 0),
    ctr: Number(row?.ctr ?? 0),
    position: Number(row?.position ?? 0),
  };
}

function percentDelta(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function pagePath(value: string | undefined) {
  if (!value) return "/";
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}

function isGoogleOrganicSession(session: Awaited<ReturnType<typeof getVisitorIntelligence>>["sessions"][number]) {
  const source = (session.source ?? "").toLowerCase();
  const medium = (session.medium ?? "").toLowerCase();
  const referrer = (session.referrer ?? "").toLowerCase();
  const label = (session.sourceLabel ?? "").toLowerCase();
  const google = source.includes("google") || referrer.includes("google.") || label.includes("google");
  const paid = Boolean(session.adCampaignId)
    || ["cpc", "ppc", "paid", "paidsearch", "paid_search", "ads"].some((term) => medium.includes(term));
  return google && !paid;
}

async function ensureActiveConnection(tenantId: string): Promise<SearchConsoleConnection> {
  let connection = await getSearchConsoleConnectionByTenantId(tenantId);
  if (
    !connection
    || connection.status === "disconnected"
    || connection.disconnectedAt
    || !connection.verified
    || !connection.siteUrl
  ) {
    throw new Error("SEARCH_CONSOLE_NOT_ACTIVE");
  }

  const expiresSoon = !connection.accessToken
    || !connection.tokenExpiresAt
    || connection.tokenExpiresAt.getTime() <= Date.now() + 2 * 60_000;

  if (expiresSoon) {
    await refreshSearchConsoleToken(connection.id);
    connection = await getSearchConsoleConnectionByTenantId(tenantId);
  }

  if (!connection?.accessToken || !connection.siteUrl) {
    throw new Error("SEARCH_CONSOLE_TOKEN_UNAVAILABLE");
  }

  return connection;
}

async function querySearchAnalytics(
  tenantId: string,
  initialConnection: SearchConsoleConnection,
  request: SearchAnalyticsRequest,
): Promise<SearchAnalyticsResponse> {
  let connection = initialConnection;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!connection.accessToken || !connection.siteUrl) {
      throw new Error("SEARCH_CONSOLE_TOKEN_UNAVAILABLE");
    }

    const response = await fetch(
      `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(connection.siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );

    if (response.status === 401 && attempt === 0) {
      await refreshSearchConsoleToken(connection.id);
      const refreshed = await getSearchConsoleConnectionByTenantId(tenantId);
      if (!refreshed) throw new Error("SEARCH_CONSOLE_TOKEN_UNAVAILABLE");
      connection = refreshed;
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { tenantId, status: response.status, body },
        "Search Console insights: falha ao consultar Search Analytics",
      );
      throw new Error(`SEARCH_CONSOLE_API_${response.status}`);
    }

    return response.json() as Promise<SearchAnalyticsResponse>;
  }

  throw new Error("SEARCH_CONSOLE_TOKEN_UNAVAILABLE");
}

function buildOpportunities(topQueries: SearchAnalyticsRow[], topPages: SearchAnalyticsRow[]) {
  const opportunities: Array<{
    type: "ctr" | "ranking" | "page";
    priority: "high" | "medium";
    label: string;
    detail: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }> = [];

  for (const row of topQueries) {
    const label = row.keys?.[0]?.trim();
    if (!label) continue;
    const clicks = Number(row.clicks ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const ctr = Number(row.ctr ?? 0);
    const position = Number(row.position ?? 0);

    if (impressions >= 50 && position > 0 && position <= 10 && ctr < 0.03) {
      opportunities.push({
        type: "ctr",
        priority: impressions >= 200 ? "high" : "medium",
        label,
        detail: "Boa visibilidade, mas CTR baixo. Priorizar título, descrição e aderência da página à intenção de busca.",
        clicks,
        impressions,
        ctr,
        position,
      });
      continue;
    }

    if (impressions >= 30 && position > 3 && position <= 15) {
      opportunities.push({
        type: "ranking",
        priority: position <= 10 ? "high" : "medium",
        label,
        detail: "Consulta próxima das melhores posições. Reforçar conteúdo, links internos e prova comercial desta intenção.",
        clicks,
        impressions,
        ctr,
        position,
      });
    }
  }

  for (const row of topPages) {
    const label = pagePath(row.keys?.[0]);
    const clicks = Number(row.clicks ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const ctr = Number(row.ctr ?? 0);
    const position = Number(row.position ?? 0);
    if (impressions < 100 || ctr >= 0.025) continue;
    opportunities.push({
      type: "page",
      priority: impressions >= 300 ? "high" : "medium",
      label,
      detail: "Página recebe muitas impressões e poucos cliques. Revisar snippet, oferta e coerência entre busca e conteúdo.",
      clicks,
      impressions,
      ctr,
      position,
    });
  }

  return opportunities
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
      return b.impressions - a.impressions;
    })
    .slice(0, 8);
}

export async function getSearchConsoleInsights(tenantId: string, requestedDays = 28) {
  const days = clampDays(requestedDays);
  const connection = await ensureActiveConnection(tenantId);

  // Search Console pode ter atraso de processamento. Encerrar em D-1 evita
  // comparar o período atual com um dia corrente ainda incompleto.
  const end = addDays(new Date(), -1);
  const start = addDays(end, -(days - 1));
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(days - 1));

  const currentRange = { startDate: dateOnly(start), endDate: dateOnly(end) };
  const previousRange = { startDate: dateOnly(previousStart), endDate: dateOnly(previousEnd) };

  const [summaryResult, previousSummaryResult, trendResult, queriesResult, pagesResult, countriesResult, devicesResult] = await Promise.all([
    querySearchAnalytics(tenantId, connection, { ...currentRange, rowLimit: 1, type: "web" }),
    querySearchAnalytics(tenantId, connection, { ...previousRange, rowLimit: 1, type: "web" }),
    querySearchAnalytics(tenantId, connection, { ...currentRange, dimensions: ["date"], rowLimit: Math.min(days + 5, 100), type: "web" }),
    querySearchAnalytics(tenantId, connection, { ...currentRange, dimensions: ["query"], rowLimit: 12, type: "web" }),
    querySearchAnalytics(tenantId, connection, { ...currentRange, dimensions: ["page"], rowLimit: 12, type: "web" }),
    querySearchAnalytics(tenantId, connection, { ...currentRange, dimensions: ["country"], rowLimit: 10, type: "web" }),
    querySearchAnalytics(tenantId, connection, { ...currentRange, dimensions: ["device"], rowLimit: 10, type: "web" }),
  ]);

  const summary = metric(summaryResult.rows?.[0]);
  const previous = metric(previousSummaryResult.rows?.[0]);
  const topQueries = queriesResult.rows ?? [];
  const topPages = pagesResult.rows ?? [];

  let visitorIntelligence: null | {
    sessions: number;
    conversions: number;
    identifiedLeads: number;
    hotOpportunities: number;
    conversionRate: number;
    truncated: boolean;
    topSessions: Array<{
      sessionId: string;
      leadId: string | null;
      currentPath: string | null;
      city: string | null;
      region: string | null;
      intentScore: number;
      intentLabel: string;
      conversions: number;
      lastSeenAt: string | null;
    }>;
  } = null;

  try {
    const visitorData = await getVisitorIntelligence(tenantId, { minutes: days * 24 * 60 });
    const organicSessions = visitorData.sessions
      .filter(isGoogleOrganicSession)
      .sort((a, b) => {
        if (a.hotOpportunity !== b.hotOpportunity) return a.hotOpportunity ? -1 : 1;
        if (a.intent.score !== b.intent.score) return b.intent.score - a.intent.score;
        if (a.conversions !== b.conversions) return b.conversions - a.conversions;
        return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
      });

    const conversions = organicSessions.filter((session) => session.conversions > 0).length;
    visitorIntelligence = {
      sessions: organicSessions.length,
      conversions,
      identifiedLeads: organicSessions.filter((session) => Boolean(session.leadId)).length,
      hotOpportunities: organicSessions.filter((session) => session.hotOpportunity).length,
      conversionRate: organicSessions.length
        ? Number(((conversions / organicSessions.length) * 100).toFixed(1))
        : 0,
      truncated: visitorData.truncated,
      topSessions: organicSessions.slice(0, 6).map((session) => ({
        sessionId: session.sessionId,
        leadId: session.leadId,
        currentPath: session.currentPath,
        city: session.geo.city,
        region: session.geo.region,
        intentScore: session.intent.score,
        intentLabel: session.intent.tierLabel,
        conversions: session.conversions,
        lastSeenAt: session.lastSeenAt,
      })),
    };
  } catch (error) {
    logger.warn({ error, tenantId }, "Search Console insights: Visitor Intelligence indisponível");
  }

  return {
    generatedAt: new Date().toISOString(),
    period: {
      days,
      startDate: currentRange.startDate,
      endDate: currentRange.endDate,
      previousStartDate: previousRange.startDate,
      previousEndDate: previousRange.endDate,
    },
    connection: {
      siteUrl: connection.siteUrl,
      connectedAt: connection.connectedAt?.toISOString() ?? null,
      sitemapSubmittedAt: connection.sitemapSubmittedAt?.toISOString() ?? null,
    },
    summary,
    previous,
    comparison: {
      clicksPct: percentDelta(summary.clicks, previous.clicks),
      impressionsPct: percentDelta(summary.impressions, previous.impressions),
      ctrPoints: Number(((summary.ctr - previous.ctr) * 100).toFixed(2)),
      positionImprovement: previous.position && summary.position
        ? Number((previous.position - summary.position).toFixed(1))
        : 0,
    },
    trend: (trendResult.rows ?? []).map((row) => ({
      date: row.keys?.[0] ?? "",
      ...metric(row),
    })),
    topQueries: topQueries.map((row) => ({
      query: row.keys?.[0] ?? "",
      ...metric(row),
    })),
    topPages: topPages.map((row) => ({
      page: row.keys?.[0] ?? "",
      path: pagePath(row.keys?.[0]),
      ...metric(row),
    })),
    countries: (countriesResult.rows ?? []).map((row) => ({
      country: row.keys?.[0] ?? "unknown",
      ...metric(row),
    })),
    devices: (devicesResult.rows ?? []).map((row) => ({
      device: row.keys?.[0] ?? "unknown",
      ...metric(row),
    })),
    opportunities: buildOpportunities(topQueries, topPages),
    visitorIntelligence,
  };
}
