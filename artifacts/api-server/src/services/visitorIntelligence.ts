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

type PageEngagement = { path: string; views: number; engagedMs: number; maxScrollDepth: number };
type ClickSignal = { label: string; href: string | null; path: string | null; at: string | null };

function metadataRecord(metadata: unknown): Metadata {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Metadata : {};
}

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

function metadataBoolean(metadata: Metadata | null | undefined, key: string): boolean | null {
  const value = metadata?.[key];
  return typeof value === "boolean" ? value : null;
}

function sessionMetadataString(events: RawEvent[], key: string): string | null {
  for (const event of events) {
    const value = metadataString(metadataRecord(event.metadata), key);
    if (value) return value;
  }
  return null;
}

function sessionMetadataNumber(events: RawEvent[], key: string): number | null {
  for (const event of events) {
    const value = metadataNumber(metadataRecord(event.metadata), key);
    if (value !== null) return value;
  }
  return null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isHighIntentPath(path: string | null) {
  return /\/(pricing|planos|precos|preços|orcamento|orçamento|proposta|checkout|contato|demo|agendar)(\/|\?|$)/i.test(path ?? "");
}

function isPricingPath(path: string | null) {
  return /\/(pricing|planos|precos|preços|orcamento|orçamento|proposta|checkout)(\/|\?|$)/i.test(path ?? "");
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
      // URL antiga/incompleta: segue procurando em outro evento da sessão.
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

function pageEngagementForEvents(events: RawEvent[]): PageEngagement[] {
  const pages = new Map<string, PageEngagement>();
  for (const event of events) {
    const metaPath = metadataString(metadataRecord(event.metadata), "pagePath");
    const path = metaPath ?? event.path;
    if (!path) continue;
    const current = pages.get(path) ?? { path, views: 0, engagedMs: 0, maxScrollDepth: 0 };
    if (event.eventType === "page_view" || event.eventType === "screen_view") current.views += 1;
    if (event.eventType === "engagement") {
      current.engagedMs += Math.max(0, event.engagedMs ?? 0);
      current.maxScrollDepth = Math.max(current.maxScrollDepth, event.scrollDepth ?? 0);
    }
    pages.set(path, current);
  }
  return Array.from(pages.values()).sort((a, b) => {
    const aWeight = a.engagedMs + a.views * 15_000 + (isHighIntentPath(a.path) ? 60_000 : 0);
    const bWeight = b.engagedMs + b.views * 15_000 + (isHighIntentPath(b.path) ? 60_000 : 0);
    return bWeight - aWeight;
  });
}

function clickSignalsForEvents(events: RawEvent[]): ClickSignal[] {
  return events
    .filter((event) => event.eventType === "cta_click")
    .map((event) => ({
      label: metadataString(metadataRecord(event.metadata), "label") ?? metadataString(metadataRecord(event.metadata), "trackKey") ?? "CTA",
      href: metadataString(metadataRecord(event.metadata), "href"),
      path: event.path,
      at: toIso(event.createdAt),
    }));
}

function stageForScore(score: number) {
  if (score >= 80) return "oportunidade";
  if (score >= 60) return "quente";
  if (score >= 35) return "aquecimento";
  return "descoberta";
}

function commercialAudienceTags(input: {
  score: number;
  recurrenceCount: number;
  pricingViews: number;
  ctaClicks: number;
  formStarts: number;
  formSubmits: number;
  identified: boolean;
}) {
  const tags = new Set<string>(["all_site_visitors_30d", `stage:${stageForScore(input.score)}`]);
  if (input.recurrenceCount > 1) tags.add("returning_visitors");
  if (input.pricingViews > 0) tags.add("pricing_visitors");
  if (input.ctaClicks > 0) tags.add("cta_engaged");
  if (input.formStarts > input.formSubmits && input.formSubmits === 0) tags.add("form_abandoners");
  if (input.score >= 60) tags.add("high_intent");
  if (input.identified) tags.add("identified_leads");
  return Array.from(tags);
}

function readingForSession(input: {
  identified: boolean;
  recurrenceCount: number;
  score: number;
  topPath: string | null;
  pricingViews: number;
  clicks: ClickSignal[];
  formStarts: number;
  formSubmits: number;
}) {
  const parts: string[] = [];
  if (input.recurrenceCount > 1) parts.push(`retornou ${input.recurrenceCount} vezes no período`);
  if (input.topPath) parts.push(`maior interesse em ${input.topPath}`);
  if (input.pricingViews > 0) parts.push("visitou preço/orçamento/proposta");
  if (input.clicks[0]?.label) parts.push(`clicou em “${input.clicks[0].label}”`);
  if (input.formStarts > input.formSubmits && input.formSubmits === 0) parts.push("iniciou formulário e não concluiu");
  if (input.formSubmits > 0) parts.push("converteu em formulário");
  const reading = parts.length ? parts.join(", ") : "ainda há poucos sinais comerciais";
  const recommendedAction = input.identified
    ? input.score >= 80
      ? "Acionar SDR/Closer agora com o contexto desta navegação."
      : input.score >= 60
        ? "SDR deve abordar hoje e usar um material de valor ligado ao interesse principal."
        : input.score >= 35
          ? "Manter nutrição ativa e antecipar o follow-up se houver nova visita ou CTA."
          : "Nutrir de forma leve e manter em campanhas compatíveis."
    : input.score >= 60
      ? "Manter em remarketing de alta intenção e criar oportunidade de identificação por CTA/formulário."
      : "Manter em audiência de remarketing e continuar observando sinais até a identificação.";
  return { reading: `${reading}.`, recommendedAction };
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
    .where(and(eq(webBehaviorEventsTable.tenantId, tenantId), gte(webBehaviorEventsTable.createdAt, since)))
    .orderBy(desc(webBehaviorEventsTable.createdAt))
    .limit(eventLimit) as RawEvent[];

  const leadIds = Array.from(new Set(events.map((event) => event.leadId).filter((value): value is string => Boolean(value))));
  const userIds = Array.from(new Set(events
    .map((event) => metadataString(metadataRecord(event.metadata), "userId"))
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
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, telefone: usersTable.telefone })
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

  const sessionDrafts = Array.from(bySession.entries()).map(([sessionId, sessionEvents]) => {
    const latest = sessionEvents[0];
    const oldest = sessionEvents[sessionEvents.length - 1];
    const pageViews = sessionEvents.filter((event) => event.eventType === "page_view" || event.eventType === "screen_view");
    const ctaClicks = sessionEvents.filter((event) => event.eventType === "cta_click").length;
    const formStarts = sessionEvents.filter((event) => event.eventType === "form_start").length;
    const formSubmits = sessionEvents.filter((event) => event.eventType === "form_submit").length;
    const conversions = sessionEvents.filter((event) => ["form_submit", "signup", "conversion"].includes(event.eventType)).length;
    const maxScrollDepth = sessionEvents.reduce((max, event) => Math.max(max, event.scrollDepth ?? 0), 0);
    const maxEngagedMs = sessionEvents.reduce((max, event) => Math.max(max, event.engagedMs ?? 0), 0);
    const leadId = sessionEvents.find((event) => Boolean(event.leadId))?.leadId ?? null;
    const userId = sessionMetadataString(sessionEvents, "userId");
    const visitorId = sessionMetadataString(sessionEvents, "visitorId");
    const leadIdentity = leadId ? leadById.get(leadId) : undefined;
    const userIdentity = userId ? userById.get(userId) : undefined;
    const intent = buildBehaviorIntentSummary(sessionEvents.map((event) => ({
      anonymousSessionId: event.anonymousSessionId,
      eventType: event.eventType,
      path: event.path,
      engagedMs: event.engagedMs,
      scrollDepth: event.scrollDepth,
    })));
    const pageEngagement = pageEngagementForEvents(sessionEvents);
    const clicks = clickSignalsForEvents(sessionEvents);
    const pricingViews = pageViews.filter((event) => isPricingPath(event.path)).length;
    const lastSeen = latest.createdAt;
    const surface = resolveSurface(sessionEvents);
    const source = sourceForSession(sessionEvents);
    const medium = mediumForSession(sessionEvents);
    const campaign = campaignForSession(sessionEvents);
    const referrer = sessionEvents.find((event) => Boolean(event.referrer))?.referrer ?? null;
    const adConsent = sessionEvents.some((event) => metadataBoolean(metadataRecord(event.metadata), "hasAdDataConsent") === true);

    return {
      sessionId,
      visitorId,
      surface,
      online: lastSeen >= onlineSince,
      identified: Boolean(leadId || userId),
      identityType: leadId ? "lead" as const : userId ? "user" as const : "anonymous" as const,
      identity: leadIdentity
        ? { displayName: leadIdentity.nome, email: leadIdentity.email, phone: leadIdentity.telefone, company: leadIdentity.empresa, source: "lead" as const }
        : userIdentity
          ? { displayName: userIdentity.name, email: userIdentity.email, phone: userIdentity.telefone, company: null, source: "user" as const }
          : { displayName: null, email: null, phone: null, company: null, source: null },
      leadId,
      userId,
      adCampaignId: latest.adCampaignId,
      currentPath: latest.path,
      currentPageUrl: latest.pageUrl,
      landingPageSlug: sessionEvents.find((event) => Boolean(event.landingPageSlug))?.landingPageSlug ?? null,
      referrer,
      firstSeenAt: toIso(oldest.createdAt),
      lastSeenAt: toIso(lastSeen),
      durationMs: Math.max(0, lastSeen.getTime() - oldest.createdAt.getTime()),
      pageViews: pageViews.length,
      ctaClicks,
      formStarts,
      formSubmits,
      conversions,
      eventCount: sessionEvents.length,
      maxScrollDepth,
      maxEngagedMs,
      intent,
      pricingViews,
      pageEngagement,
      clicks,
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
      adConsent,
      leadCommercialJourney: leadIdentity?.discoveryData && typeof leadIdentity.discoveryData === "object"
        ? (leadIdentity.discoveryData as Record<string, unknown>)["commercialJourney"] ?? null
        : null,
      leadNextAction: leadIdentity?.proximaAcao ?? null,
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
          clickLabel: event.eventType === "cta_click" ? metadataString(metadataRecord(event.metadata), "label") : null,
          clickHref: event.eventType === "cta_click" ? metadataString(metadataRecord(event.metadata), "href") : null,
          formId: ["form_start", "form_submit"].includes(event.eventType) ? metadataString(metadataRecord(event.metadata), "formId") : null,
        })),
    };
  });

  const recurrence = new Map<string, number>();
  for (const session of sessionDrafts) {
    const key = session.leadId ? `lead:${session.leadId}` : session.userId ? `user:${session.userId}` : session.visitorId ? `visitor:${session.visitorId}` : `session:${session.sessionId}`;
    recurrence.set(key, (recurrence.get(key) ?? 0) + 1);
  }

  const sessions = sessionDrafts.map((session) => {
    const key = session.leadId ? `lead:${session.leadId}` : session.userId ? `user:${session.userId}` : session.visitorId ? `visitor:${session.visitorId}` : `session:${session.sessionId}`;
    const recurrenceCount = recurrence.get(key) ?? 1;
    const adjustedScore = Math.min(100, session.intent.score + (recurrenceCount > 1 ? Math.min(15, 5 + (recurrenceCount - 2) * 5) : 0));
    const audienceTags = commercialAudienceTags({
      score: adjustedScore,
      recurrenceCount,
      pricingViews: session.pricingViews,
      ctaClicks: session.ctaClicks,
      formStarts: session.formStarts,
      formSubmits: session.formSubmits,
      identified: session.identified,
    });
    const commercial = readingForSession({
      identified: session.identified,
      recurrenceCount,
      score: adjustedScore,
      topPath: session.pageEngagement[0]?.path ?? session.currentPath,
      pricingViews: session.pricingViews,
      clicks: session.clicks,
      formStarts: session.formStarts,
      formSubmits: session.formSubmits,
    });
    return {
      ...session,
      recurrenceCount,
      commercialScore: adjustedScore,
      commercialStage: stageForScore(adjustedScore),
      hotOpportunity: session.online && adjustedScore >= 60,
      audienceTags,
      commercialReading: commercial.reading,
      recommendedAction: session.leadNextAction || commercial.recommendedAction,
      remarketingEligible: session.surface === "site" && session.adConsent,
    };
  });

  sessions.sort((a, b) => {
    if (a.hotOpportunity !== b.hotOpportunity) return a.hotOpportunity ? -1 : 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.commercialScore !== b.commercialScore) return b.commercialScore - a.commercialScore;
    return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
  });

  const profileGroups = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const key = session.leadId ? `lead:${session.leadId}` : session.userId ? `user:${session.userId}` : session.visitorId ? `visitor:${session.visitorId}` : `session:${session.sessionId}`;
    const group = profileGroups.get(key) ?? [];
    group.push(session);
    profileGroups.set(key, group);
  }

  const profiles = Array.from(profileGroups.entries()).map(([profileKey, group]) => {
    const ordered = group.slice().sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
    const latest = ordered[0];
    const pageMap = new Map<string, PageEngagement>();
    const allClicks: ClickSignal[] = [];
    for (const session of ordered) {
      for (const page of session.pageEngagement) {
        const current = pageMap.get(page.path) ?? { path: page.path, views: 0, engagedMs: 0, maxScrollDepth: 0 };
        current.views += page.views;
        current.engagedMs += page.engagedMs;
        current.maxScrollDepth = Math.max(current.maxScrollDepth, page.maxScrollDepth);
        pageMap.set(page.path, current);
      }
      allClicks.push(...session.clicks);
    }
    const pages = Array.from(pageMap.values()).sort((a, b) => (b.engagedMs + b.views * 15_000) - (a.engagedMs + a.views * 15_000));
    const totalCtaClicks = group.reduce((sum, session) => sum + session.ctaClicks, 0);
    const totalPricingViews = group.reduce((sum, session) => sum + session.pricingViews, 0);
    const totalFormStarts = group.reduce((sum, session) => sum + session.formStarts, 0);
    const totalFormSubmits = group.reduce((sum, session) => sum + session.formSubmits, 0);
    const score = Math.max(...group.map((session) => session.commercialScore));
    const audienceTags = Array.from(new Set(group.flatMap((session) => session.audienceTags)));
    const commercial = readingForSession({
      identified: latest.identified,
      recurrenceCount: group.length,
      score,
      topPath: pages[0]?.path ?? latest.currentPath,
      pricingViews: totalPricingViews,
      clicks: allClicks,
      formStarts: totalFormStarts,
      formSubmits: totalFormSubmits,
    });
    return {
      profileKey,
      leadId: latest.leadId,
      userId: latest.userId,
      visitorId: latest.visitorId,
      sessionId: latest.sessionId,
      identity: latest.identity,
      identified: latest.identified,
      surface: latest.surface,
      online: group.some((session) => session.online),
      sessionsCount: group.length,
      firstSeenAt: ordered.map((session) => session.firstSeenAt).filter(Boolean).sort()[0] ?? null,
      lastSeenAt: latest.lastSeenAt,
      currentPath: latest.currentPath,
      sourceLabel: latest.sourceLabel,
      campaign: latest.campaign,
      geo: latest.geo,
      device: latest.device,
      totalDurationMs: group.reduce((sum, session) => sum + session.durationMs, 0),
      pageViews: group.reduce((sum, session) => sum + session.pageViews, 0),
      ctaClicks: totalCtaClicks,
      conversions: group.reduce((sum, session) => sum + session.conversions, 0),
      pricingViews: totalPricingViews,
      formStarts: totalFormStarts,
      formSubmits: totalFormSubmits,
      commercialScore: score,
      commercialStage: stageForScore(score),
      hotOpportunity: group.some((session) => session.online) && score >= 60,
      commercialReading: commercial.reading,
      recommendedAction: latest.leadNextAction || commercial.recommendedAction,
      audienceTags,
      remarketingEligible: group.some((session) => session.remarketingEligible),
      pageEngagement: pages.slice(0, 12),
      clicks: allClicks.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20),
      campaignHistory: latest.leadCommercialJourney && typeof latest.leadCommercialJourney === "object"
        ? ((latest.leadCommercialJourney as Record<string, unknown>)["campaignHistory"] ?? [])
        : [],
      recommendedMaterials: latest.leadCommercialJourney && typeof latest.leadCommercialJourney === "object"
        ? ((latest.leadCommercialJourney as Record<string, unknown>)["recommendedMaterials"] ?? [])
        : [],
    };
  }).sort((a, b) => {
    if (a.hotOpportunity !== b.hotOpportunity) return a.hotOpportunity ? -1 : 1;
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.commercialScore !== b.commercialScore) return b.commercialScore - a.commercialScore;
    return String(b.lastSeenAt).localeCompare(String(a.lastSeenAt));
  });

  const [totals] = await db
    .select({
      visitors: sql<number>`count(distinct ${webBehaviorEventsTable.anonymousSessionId})`,
      pageViews: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} in ('page_view', 'screen_view'))`,
      conversions: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} in ('form_submit', 'signup', 'conversion'))`,
    })
    .from(webBehaviorEventsTable)
    .where(and(eq(webBehaviorEventsTable.tenantId, tenantId), gte(webBehaviorEventsTable.createdAt, since)));

  const daily = new Map<string, { sessions: number; conversions: number; pageViews: number }>();
  const topSources = new Map<string, number>();
  const topCities = new Map<string, number>();
  const topCampaigns = new Map<string, number>();
  const topPages = new Map<string, number>();
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
  }
  for (const event of events) {
    if ((event.eventType === "page_view" || event.eventType === "screen_view") && event.path) increment(topPages, event.path);
  }

  const averageSessionDurationMs = sessions.length ? Math.round(sessions.reduce((sum, session) => sum + session.durationMs, 0) / sessions.length) : 0;
  const averagePagesPerSession = sessions.length ? Number((sessions.reduce((sum, session) => sum + session.pageViews, 0) / sessions.length).toFixed(2)) : 0;
  const averageIntent = sessions.length ? Math.round(sessions.reduce((sum, session) => sum + session.commercialScore, 0) / sessions.length) : 0;
  const sessionConversions = sessions.filter((session) => session.conversions > 0).length;

  return {
    periodMinutes: minutes,
    onlineWindowSeconds,
    generatedAt: new Date().toISOString(),
    truncated: events.length >= eventLimit,
    eventLimit,
    totals: {
      visitors: Number(totals?.visitors ?? 0),
      uniqueVisitors: profiles.length,
      returningVisitors: profiles.filter((profile) => profile.sessionsCount > 1).length,
      pageViews: Number(totals?.pageViews ?? 0),
      conversions: Number(totals?.conversions ?? 0),
      onlineNow: profiles.filter((profile) => profile.online).length,
      identified: profiles.filter((profile) => profile.identified).length,
      hotNow: profiles.filter((profile) => profile.hotOpportunity).length,
      siteVisitors: sessions.filter((session) => session.surface === "site").length,
      appVisitors: sessions.filter((session) => session.surface === "app").length,
      mobileVisitors: sessions.filter((session) => session.surface === "mobile").length,
      averageSessionDurationMs,
      averagePagesPerSession,
      averageIntent,
      conversionRate: sessions.length ? Number(((sessionConversions / sessions.length) * 100).toFixed(1)) : 0,
      identifiedRate: profiles.length ? Number(((profiles.filter((profile) => profile.identified).length / profiles.length) * 100).toFixed(1)) : 0,
    },
    commercial: {
      hotProfiles: profiles.filter((profile) => profile.commercialScore >= 60).length,
      returningProfiles: profiles.filter((profile) => profile.sessionsCount > 1).length,
      pricingProfiles: profiles.filter((profile) => profile.pricingViews > 0).length,
      ctaProfiles: profiles.filter((profile) => profile.ctaClicks > 0).length,
      formAbandoners: profiles.filter((profile) => profile.formStarts > profile.formSubmits && profile.formSubmits === 0).length,
      remarketingEligible: profiles.filter((profile) => profile.remarketingEligible).length,
      identifiedProfiles: profiles.filter((profile) => profile.identified).length,
    },
    analytics: {
      daily: Array.from(daily.entries()).map(([date, values]) => ({ date, ...values })).sort((a, b) => a.date.localeCompare(b.date)),
      topSources: topEntries(topSources, 12),
      topCities: topEntries(topCities, 12),
      topCampaigns: topEntries(topCampaigns, 12),
      topPages: topEntries(topPages, 15),
    },
    hotOpportunities: sessions.filter((session) => session.hotOpportunity).slice(0, 20),
    profiles,
    sessions,
  };
}
