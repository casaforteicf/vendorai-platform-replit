import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, webBehaviorEventsTable } from "@workspace/db";
import { buildBehaviorIntentSummary } from "../jobs/behaviorIntentSync.js";

export type VisitorIntelligenceFilters = {
  minutes?: number;
  onlineWindowSeconds?: number;
};

type Metadata = Record<string, unknown>;
type VisitorSurface = "site" | "app" | "mobile" | "unknown";

function metadataString(metadata: Metadata | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function resolveSurface(metadata: Metadata | null | undefined, pageUrl: string | null): VisitorSurface {
  const explicit = metadataString(metadata, "surface");
  if (explicit === "site" || explicit === "app" || explicit === "mobile") return explicit;

  if (pageUrl) {
    try {
      const hostname = new URL(pageUrl).hostname.toLowerCase();
      if (hostname === "app.appvendorai.com" || hostname.endsWith(".app.appvendorai.com")) return "app";
      if (hostname === "appvendorai.com" || hostname === "www.appvendorai.com" || hostname.endsWith(".appvendorai.com")) return "site";
    } catch {
      // URLs legadas/incompletas ficam como unknown.
    }
  }

  return "unknown";
}

export async function getVisitorIntelligence(
  tenantId: string,
  filters: VisitorIntelligenceFilters = {},
) {
  const minutes = Math.max(5, Math.min(24 * 60, filters.minutes ?? 60));
  const onlineWindowSeconds = Math.max(30, Math.min(300, filters.onlineWindowSeconds ?? 90));
  const since = new Date(Date.now() - minutes * 60_000);
  const onlineSince = new Date(Date.now() - onlineWindowSeconds * 1000);

  const events = await db
    .select({
      anonymousSessionId: webBehaviorEventsTable.anonymousSessionId,
      leadId: webBehaviorEventsTable.leadId,
      adCampaignId: webBehaviorEventsTable.adCampaignId,
      eventType: webBehaviorEventsTable.eventType,
      pageUrl: webBehaviorEventsTable.pageUrl,
      path: webBehaviorEventsTable.path,
      referrer: webBehaviorEventsTable.referrer,
      landingPageSlug: webBehaviorEventsTable.landingPageSlug,
      engagedMs: webBehaviorEventsTable.engagedMs,
      scrollDepth: webBehaviorEventsTable.scrollDepth,
      metadata: webBehaviorEventsTable.metadata,
      createdAt: webBehaviorEventsTable.createdAt,
    })
    .from(webBehaviorEventsTable)
    .where(and(
      eq(webBehaviorEventsTable.tenantId, tenantId),
      gte(webBehaviorEventsTable.createdAt, since),
    ))
    .orderBy(desc(webBehaviorEventsTable.createdAt))
    .limit(5000);

  const bySession = new Map<string, typeof events>();
  for (const event of events) {
    const current = bySession.get(event.anonymousSessionId) ?? [];
    current.push(event);
    bySession.set(event.anonymousSessionId, current);
  }

  const sessions = Array.from(bySession.entries()).map(([sessionId, sessionEvents]) => {
    const latest = sessionEvents[0];
    const oldest = sessionEvents[sessionEvents.length - 1];
    const pageViews = sessionEvents.filter((event) => event.eventType === "page_view" || event.eventType === "screen_view");
    const ctaClicks = sessionEvents.filter((event) => event.eventType === "cta_click").length;
    const formStarts = sessionEvents.filter((event) => event.eventType === "form_start").length;
    const formSubmits = sessionEvents.filter((event) => event.eventType === "form_submit").length;
    const maxScrollDepth = sessionEvents.reduce((max, event) => Math.max(max, event.scrollDepth ?? 0), 0);
    const maxEngagedMs = sessionEvents.reduce((max, event) => Math.max(max, event.engagedMs ?? 0), 0);
    const metadata = latest.metadata as Metadata | null | undefined;
    const userId = metadataString(metadata, "userId");
    const intent = buildBehaviorIntentSummary(sessionEvents.map((event) => ({
      eventType: event.eventType,
      path: event.path,
      engagedMs: event.engagedMs,
      scrollDepth: event.scrollDepth,
    })));

    const lastSeen = latest.createdAt;
    const online = lastSeen >= onlineSince;
    const hotOpportunity = online && intent.score >= 60;
    const surface = resolveSurface(metadata, latest.pageUrl);

    return {
      sessionId,
      surface,
      online,
      hotOpportunity,
      identified: Boolean(latest.leadId || userId),
      identityType: latest.leadId ? "lead" : userId ? "user" : "anonymous",
      leadId: latest.leadId,
      userId,
      adCampaignId: latest.adCampaignId,
      currentPath: latest.path,
      currentPageUrl: latest.pageUrl,
      landingPageSlug: latest.landingPageSlug,
      referrer: latest.referrer,
      firstSeenAt: toIso(oldest.createdAt),
      lastSeenAt: toIso(lastSeen),
      durationMs: Math.max(0, lastSeen.getTime() - oldest.createdAt.getTime()),
      pageViews: pageViews.length,
      ctaClicks,
      formStarts,
      formSubmits,
      maxScrollDepth,
      maxEngagedMs,
      intent,
      geo: {
        country: metadataString(metadata, "country"),
        region: metadataString(metadata, "region"),
        city: metadataString(metadata, "city"),
      },
      device: {
        type: metadataString(metadata, "deviceType"),
        browser: metadataString(metadata, "browser"),
        os: metadataString(metadata, "os"),
      },
      source: metadataString(metadata, "source") ?? metadataString(metadata, "utmSource"),
      medium: metadataString(metadata, "medium") ?? metadataString(metadata, "utmMedium"),
      campaign: metadataString(metadata, "campaign") ?? metadataString(metadata, "utmCampaign"),
      journey: pageViews
        .slice()
        .reverse()
        .map((event) => ({
          path: event.path,
          pageUrl: event.pageUrl,
          at: toIso(event.createdAt),
        })),
    };
  });

  sessions.sort((a, b) => {
    if (a.hotOpportunity !== b.hotOpportunity) return a.hotOpportunity ? -1 : 1;
    if (a.intent.score !== b.intent.score) return b.intent.score - a.intent.score;
    return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
  });

  const [totals] = await db
    .select({
      visitors: sql<number>`count(distinct ${webBehaviorEventsTable.anonymousSessionId})`,
      pageViews: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} in ('page_view', 'screen_view'))`,
      conversions: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} in ('form_submit', 'signup', 'conversion'))`,
    })
    .from(webBehaviorEventsTable)
    .where(and(
      eq(webBehaviorEventsTable.tenantId, tenantId),
      gte(webBehaviorEventsTable.createdAt, since),
    ));

  return {
    periodMinutes: minutes,
    onlineWindowSeconds,
    generatedAt: new Date().toISOString(),
    totals: {
      visitors: Number(totals?.visitors ?? 0),
      pageViews: Number(totals?.pageViews ?? 0),
      conversions: Number(totals?.conversions ?? 0),
      onlineNow: sessions.filter((session) => session.online).length,
      identified: sessions.filter((session) => session.identified).length,
      hotNow: sessions.filter((session) => session.hotOpportunity).length,
      siteVisitors: sessions.filter((session) => session.surface === "site").length,
      appVisitors: sessions.filter((session) => session.surface === "app").length,
      mobileVisitors: sessions.filter((session) => session.surface === "mobile").length,
    },
    hotOpportunities: sessions.filter((session) => session.hotOpportunity).slice(0, 20),
    sessions,
  };
}
