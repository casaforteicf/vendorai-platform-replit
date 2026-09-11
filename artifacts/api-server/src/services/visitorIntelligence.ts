import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, leadsTable, usersTable, webBehaviorEventsTable } from "@workspace/db";
import { buildBehaviorIntentSummary } from "../jobs/behaviorIntentSync.js";

export type VisitorIntelligenceFilters = {
  minutes?: number;
  onlineWindowSeconds?: number;
};

type Metadata = Record<string, unknown>;
type VisitorSurface = "site" | "app" | "mobile" | "unknown";

type RawEvent = {
  anonymousSessionId: string;
  leadId: string | null;
  adCampaignId: string | null;
  eventType: string;
  pageUrl: string | null;
  path: string | null;
  referrer: string | null;
  landingPageSlug: string | null;
  engagedMs: number | null;
  scrollDepth: number | null;
  metadata: unknown;
  createdAt: Date;
};

function metadataString(metadata: Metadata | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataNumber(metadata: Metadata | null | undefined, key: string): number | null {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sessionMetadataString(events: RawEvent[], key: string): string | null {
  for (const event of events) {
    const value = metadataString(event.metadata as Metadata | null | undefined, key);
    if (value) return value;
  }
  return null;
}

function sessionMetadataNumber(events: RawEvent[], key: string): number | null {
  for (const event of events) {
    const value = metadataNumber(event.metadata as Metadata | null | undefined, key);
    if (value !== null) return value;
  }
  return null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveSurface(events: RawEvent[]): VisitorSurface {
  const explicit = sessionMetadataString(events, "surface");
  if (explicit === "site" || explicit === "app" || explicit === "mobile") return explicit;

  for (const event of events) {
    if (!event.pageUrl) continue;
    try {
      const hostname = new URL(event.pageUrl).hostname.toLowerCase();
      if (hostname === "app.appvendorai.com" || hostname.endsWith(".app.appvendorai.com")) return "app";
      if (hostname === "appvendorai.com" || hostname === "www.appvendorai.com" || hostname.endsWith(".appvendorai.com")) return "site";
    } catch {
      // URL antiga/incompleta: segue procurando outro evento da sessão.
    }
  }
  return "unknown";
}

function sourceForSession(events: RawEvent[]): string | null {
  return sessionMetadataString(events, "source") ?? sessionMetadataString(events, "utmSource") ?? null;
}

function mediumForSession(events: RawEvent[]): string | null {
  return sessionMetadataString(events, "medium") ?? sessionMetadataString(events, "utmMedium") ?? null;
}

function campaignForSession(events: RawEvent[]): string | null {
  return sessionMetadataString(events, "campaign") ?? sessionMetadataString(events, "utmCampaign") ?? null;
}

function sourceLabel(source: string | null, medium: string | null, referrer: string | null) {
  if (source || medium) return [source, medium].filter(Boolean).join(" / ");
  if (referrer) {
    try {
      return new URL(referrer).hostname.replace(/^www\./, "");
    } catch {
      return referrer;
    }
  }
  return "Direto / desconhecido";
}

function dateKey(value: string | null) {
  return value ? value.slice(0, 10) : "sem-data";
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map: Map<string, number>, limit = 10) {
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function commercialJourneyFromLead(discoveryData: unknown) {
  if (!discoveryData || typeof discoveryData !== "object" || Array.isArray(discoveryData)) return null;
  const journey = (discoveryData as Record<string, unknown>)["commercialJourney"];
  return journey && typeof journey === "object" && !Array.isArray(journey)
    ? journey as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getVisitorIntelligence(
  tenantId: string,
  filters: VisitorIntelligenceFilters = {},
) {
  const minutes = Math.max(5, Math.min(90 * 24 * 60, filters.minutes ?? 60));
  const onlineWindowSeconds = Math.max(30, Math.min(300, filters.onlineWindowSeconds ?? 90));
  const since = new Date(Date.now() - minutes * 60_000);
  const onlineSince = new Date(Date.now() - onlineWindowSeconds * 1000);
  const eventLimit = minutes <= 24 * 60
    ? 10_000
    : minutes <= 7 * 24 * 60
      ? 25_000
      : minutes <= 30 * 24 * 60
        ? 50_000
        : 75_000;

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
    .limit(eventLimit) as RawEvent[];

  const leadIds = Array.from(new Set(events.map((event) => event.leadId).filter((value): value is string => Boolean(value))));
  const userIds = Array.from(new Set(events
    .map((event) => metadataString(event.metadata as Metadata | null | undefined, "userId"))
    .filter((value): value is string => Boolean(value))));

  const leadRows = leadIds.length
    ? await db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        email: leadsTable.email,
        telefone: leadsTable.telefone,
        empresa: leadsTable.empresa,
        proximaAcao: leadsTable.proximaAcao,
        discoveryData: leadsTable.discoveryData,
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.id, leadIds)))
    : [];

  const userRows = userIds.length
    ? await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        telefone: usersTable.telefone,
      })
      .from(usersTable)
      .where(and(eq(usersTable.tenantId, tenantId), inArray(usersTable.id, userIds)))
    : [];

  const leadById = new Map(leadRows.map((lead) => [lead.id, lead]));
  const userById = new Map(userRows.map((user) => [user.id, user]));

  const bySession = new Map<string, RawEvent[]>();
  for (const event of events) {
    const current = bySession.get(event.anonymousSessionId) ?? [];
    current.push(event);
    bySession.set(event.anonymousSessionId, current);
  }

  const baseSessions = Array.from(bySession.entries()).map(([sessionId, sessionEvents]) => {
    const latest = sessionEvents[0];
    const oldest = sessionEvents[sessionEvents.length - 1];
    const pageViews = sessionEvents.filter((event) => event.eventType === "page_view" || event.eventType === "screen_view");
    const conversions = sessionEvents.filter((event) => ["form_submit", "signup", "conversion"].includes(event.eventType)).length;
    const maxScrollDepth = sessionEvents.reduce((max, event) => Math.max(max, event.scrollDepth ?? 0), 0);
    const maxEngagedMs = sessionEvents.reduce((max, event) => Math.max(max, event.engagedMs ?? 0), 0);
    const leadId = sessionEvents.find((event) => Boolean(event.leadId))?.leadId ?? null;
    const userId = sessionMetadataString(sessionEvents, "userId");
    const visitorId = sessionMetadataString(sessionEvents, "visitorId");
    const leadIdentity = leadId ? leadById.get(leadId) : undefined;
    const userIdentity = userId ? userById.get(userId) : undefined;
    const sessionIntent = buildBehaviorIntentSummary(sessionEvents.map((event) => ({
      anonymousSessionId: event.anonymousSessionId,
      eventType: event.eventType,
      path: event.path,
      engagedMs: event.engagedMs,
      scrollDepth: event.scrollDepth,
      metadata: event.metadata,
      createdAt: event.createdAt,
    })));
    const leadJourney = leadIdentity ? commercialJourneyFromLead(leadIdentity.discoveryData) : null;

    const lastSeen = latest.createdAt;
    const online = lastSeen >= onlineSince;
    const surface = resolveSurface(sessionEvents);
    const source = sourceForSession(sessionEvents);
    const medium = mediumForSession(sessionEvents);
    const campaign = campaignForSession(sessionEvents);
    const referrer = sessionEvents.find((event) => Boolean(event.referrer))?.referrer ?? null;
    const journeyScore = typeof leadJourney?.score === "number" ? leadJourney.score : sessionIntent.score;
    const commercialStage = typeof leadJourney?.stage === "string" ? leadJourney.stage : sessionIntent.commercialStage;
    const commercialStageLabel = typeof leadJourney?.stageLabel === "string" ? leadJourney.stageLabel : sessionIntent.commercialStageLabel;
    const commercialSummary = typeof leadJourney?.summary === "string" ? leadJourney.summary : sessionIntent.summary;
    const nextBestAction = leadIdentity?.proximaAcao
      || (typeof leadJourney?.nextBestAction === "string" ? leadJourney.nextBestAction : null)
      || sessionIntent.recommendedAction;
    const audienceTags = stringArray(leadJourney?.audienceTags).length
      ? stringArray(leadJourney?.audienceTags)
      : sessionIntent.audienceTags;
    const campaigns = stringArray(leadJourney?.campaigns).length
      ? stringArray(leadJourney?.campaigns)
      : sessionIntent.campaigns;

    return {
      sessionId,
      visitorId,
      surface,
      online,
      hotOpportunity: online && journeyScore >= 60,
      identified: Boolean(leadId || userId),
      identityType: leadId ? "lead" : userId ? "user" : "anonymous",
      identity: leadIdentity
        ? {
          displayName: leadIdentity.nome,
          email: leadIdentity.email,
          phone: leadIdentity.telefone,
          company: leadIdentity.empresa,
          source: "lead" as const,
        }
        : userIdentity
          ? {
            displayName: userIdentity.name,
            email: userIdentity.email,
            phone: userIdentity.telefone,
            company: null,
            source: "user" as const,
          }
          : {
            displayName: null,
            email: null,
            phone: null,
            company: null,
            source: null,
          },
      leadId,
      userId,
      adCampaignId: latest.adCampaignId,
      currentPath: latest.path,
      currentPageUrl: latest.pageUrl,
      landingPageSlug: sessionEvents.find((event) => Boolean(event.landingPageSlug))?.landingPageSlug ?? null,
      referrer,
      firstSeenAt: toIso(oldest.createdAt),
      lastSeenAt: toIso(lastSeen),
      durationMs: Math.max(
        sessionIntent.signals.totalEngagedMs,
        maxEngagedMs,
        Math.max(0, lastSeen.getTime() - oldest.createdAt.getTime()),
      ),
      pageViews: pageViews.length,
      ctaClicks: sessionIntent.signals.ctaClicks,
      formStarts: sessionIntent.signals.formStarts,
      formSubmits: sessionIntent.signals.formSubmits,
      conversions,
      eventCount: sessionEvents.length,
      maxScrollDepth,
      maxEngagedMs,
      intent: { ...sessionIntent, score: journeyScore },
      commercialStage,
      commercialStageLabel,
      commercialSummary,
      nextBestAction,
      audienceTags,
      campaigns,
      pageBreakdown: sessionIntent.topPages,
      clicks: sessionIntent.clicks,
      geo: {
        country: sessionMetadataString(sessionEvents, "country"),
        region: sessionMetadataString(sessionEvents, "region"),
        city: sessionMetadataString(sessionEvents, "city"),
        latitude: sessionMetadataNumber(sessionEvents, "latitude"),
        longitude: sessionMetadataNumber(sessionEvents, "longitude"),
        source: sessionMetadataString(sessionEvents, "geoSource"),
      },
      device: {
        type: sessionMetadataString(sessionEvents, "deviceType"),
        browser: sessionMetadataString(sessionEvents, "browser"),
        os: sessionMetadataString(sessionEvents, "os"),
      },
      source,
      medium,
      campaign,
      sourceLabel: sourceLabel(source, medium, referrer),
      journey: sessionEvents
        .slice()
        .reverse()
        .filter((event) => event.eventType !== "heartbeat")
        .map((event) => ({
          eventType: event.eventType,
          path: event.path,
          pageUrl: event.pageUrl,
          at: toIso(event.createdAt),
          engagedMs: event.engagedMs,
          scrollDepth: event.scrollDepth,
          label: metadataString(event.metadata as Metadata, "label"),
          href: metadataString(event.metadata as Metadata, "href"),
        })),
    };
  });

  const recurrence = new Map<string, number>();
  for (const session of baseSessions) {
    const key = session.leadId ? `lead:${session.leadId}` : session.visitorId ? `visitor:${session.visitorId}` : `session:${session.sessionId}`;
    recurrence.set(key, (recurrence.get(key) ?? 0) + 1);
  }

  const sessions = baseSessions.map((session) => {
    const key = session.leadId ? `lead:${session.leadId}` : session.visitorId ? `visitor:${session.visitorId}` : `session:${session.sessionId}`;
    const recurrenceCount = recurrence.get(key) ?? 1;
    const signalLabels = new Set<string>();
    if (recurrenceCount > 1) signalLabels.add(`Retornou ${recurrenceCount}x`);
    if (session.intent.signals.pricingViews > 0) signalLabels.add("Viu preços");
    if (session.ctaClicks > 0) signalLabels.add("Clicou em CTA");
    if (session.formStarts > session.formSubmits) signalLabels.add("Abandonou formulário");
    if (session.conversions > 0) signalLabels.add("Converteu");
    if (session.durationMs >= 120_000) signalLabels.add("2min+ no site");
    if (session.intent.score >= 60) signalLabels.add("Alta intenção");
    const remarketingReady = session.surface === "site" && (recurrenceCount > 1 || session.intent.score >= 15 || session.pageViews > 0);
    return {
      ...session,
      recurrenceCount,
      signalLabels: Array.from(signalLabels),
      remarketingReady,
    };
  });

  sessions.sort((a, b) => {
    if (a.hotOpportunity !== b.hotOpportunity) return a.hotOpportunity ? -1 : 1;
    if (a.identified !== b.identified) return a.identified ? -1 : 1;
    if (a.intent.score !== b.intent.score) return b.intent.score - a.intent.score;
    if (a.online !== b.online) return a.online ? -1 : 1;
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

  const daily = new Map<string, { sessions: number; conversions: number; pageViews: number }>();
  const topSources = new Map<string, number>();
  const topCities = new Map<string, number>();
  const topCampaigns = new Map<string, number>();
  const topPages = new Map<string, number>();
  const stableVisitorSessions = new Map<string, number>();

  for (const session of sessions) {
    const day = dateKey(session.firstSeenAt);
    const current = daily.get(day) ?? { sessions: 0, conversions: 0, pageViews: 0 };
    current.sessions += 1;
    current.conversions += session.conversions > 0 ? 1 : 0;
    current.pageViews += session.pageViews;
    daily.set(day, current);

    increment(topSources, session.sourceLabel || "Direto / desconhecido");
    const cityLabel = [session.geo.city, session.geo.region].filter(Boolean).join(" / ") || "Localização não disponível";
    increment(topCities, cityLabel);
    increment(topCampaigns, session.campaign || "Sem campanha");
    if (session.visitorId) increment(stableVisitorSessions, session.visitorId);
  }

  for (const event of events) {
    if ((event.eventType === "page_view" || event.eventType === "screen_view") && event.path) increment(topPages, event.path);
  }

  const uniqueVisitorKeys = new Set(sessions.map((session) => session.visitorId || `session:${session.sessionId}`));
  const returningVisitors = Array.from(stableVisitorSessions.values()).filter((count) => count > 1).length;
  const averageSessionDurationMs = sessions.length
    ? Math.round(sessions.reduce((sum, session) => sum + session.durationMs, 0) / sessions.length)
    : 0;
  const averagePagesPerSession = sessions.length
    ? Number((sessions.reduce((sum, session) => sum + session.pageViews, 0) / sessions.length).toFixed(2))
    : 0;
  const averageIntent = sessions.length
    ? Math.round(sessions.reduce((sum, session) => sum + session.intent.score, 0) / sessions.length)
    : 0;
  const sessionConversions = sessions.filter((session) => session.conversions > 0).length;
  const siteSessions = sessions.filter((session) => session.surface === "site");

  return {
    periodMinutes: minutes,
    onlineWindowSeconds,
    generatedAt: new Date().toISOString(),
    truncated: events.length >= eventLimit,
    eventLimit,
    totals: {
      visitors: Number(totals?.visitors ?? 0),
      uniqueVisitors: uniqueVisitorKeys.size,
      returningVisitors,
      pageViews: Number(totals?.pageViews ?? 0),
      conversions: Number(totals?.conversions ?? 0),
      onlineNow: sessions.filter((session) => session.online).length,
      identified: sessions.filter((session) => session.identified).length,
      hotNow: sessions.filter((session) => session.hotOpportunity).length,
      hotLeadsNow: sessions.filter((session) => session.hotOpportunity && session.leadId).length,
      pricingVisitors: siteSessions.filter((session) => session.intent.signals.pricingViews > 0).length,
      ctaVisitors: siteSessions.filter((session) => session.ctaClicks > 0).length,
      remarketingReady: siteSessions.filter((session) => session.remarketingReady).length,
      siteVisitors: siteSessions.length,
      appVisitors: sessions.filter((session) => session.surface === "app").length,
      mobileVisitors: sessions.filter((session) => session.surface === "mobile").length,
      averageSessionDurationMs,
      averagePagesPerSession,
      averageIntent,
      conversionRate: sessions.length ? Number(((sessionConversions / sessions.length) * 100).toFixed(1)) : 0,
      identifiedRate: sessions.length ? Number(((sessions.filter((session) => session.identified).length / sessions.length) * 100).toFixed(1)) : 0,
    },
    analytics: {
      daily: Array.from(daily.entries())
        .map(([date, value]) => ({ date, ...value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      topSources: topEntries(topSources),
      topCities: topEntries(topCities),
      topCampaigns: topEntries(topCampaigns),
      topPages: topEntries(topPages),
    },
    hotOpportunities: sessions.filter((session) => session.hotOpportunity).slice(0, 20),
    sessions,
  };
}
