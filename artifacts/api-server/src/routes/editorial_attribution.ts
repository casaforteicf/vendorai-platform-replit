import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, dealsTable, socialPublicationsTable, webBehaviorEventsTable } from "@workspace/db";

const router: IRouter = Router();

function canAccess(req: Request, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const attributionSchema = z.object({
  editorialId: z.string().trim().min(1).max(120),
  thesis: z.string().trim().min(1).max(300),
  series: z.string().trim().min(1).max(300).default("Onde seu negócio está perdendo dinheiro?"),
  channel: z.enum(["instagram", "tiktok", "linkedin", "facebook"]).optional(),
  landingPage: z.string().trim().max(500).optional(),
  trackedDestination: z.string().trim().max(2_000).optional(),
});

function metadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

router.post("/tenants/:tenantId/marketing/editorial/publications/:publicationId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = attributionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_editorial_attribution", details: parsed.error.flatten() });

  const [publication] = await db.select().from(socialPublicationsTable).where(and(
    eq(socialPublicationsTable.id, String(req.params.publicationId)),
    eq(socialPublicationsTable.tenantId, tenantId),
  )).limit(1);
  if (!publication) return res.status(404).json({ error: "publication_not_found" });

  const editorial = {
    editorialId: parsed.data.editorialId,
    thesis: parsed.data.thesis,
    series: parsed.data.series,
    channel: parsed.data.channel ?? publication.provider,
    landingPage: parsed.data.landingPage ?? null,
    trackedDestination: parsed.data.trackedDestination ?? null,
    attributedAt: new Date().toISOString(),
  };

  const [updated] = await db.update(socialPublicationsTable).set({
    metadata: { ...(publication.metadata || {}), editorial },
    updatedAt: new Date(),
  }).where(and(
    eq(socialPublicationsTable.id, publication.id),
    eq(socialPublicationsTable.tenantId, tenantId),
  )).returning();

  return res.json({ publication: updated, editorial });
});

router.get("/tenants/:tenantId/marketing/editorial/performance", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [publications, behaviorEvents] = await Promise.all([
    db.select().from(socialPublicationsTable)
      .where(eq(socialPublicationsTable.tenantId, tenantId))
      .orderBy(desc(socialPublicationsTable.createdAt))
      .limit(500),
    db.select({
      sessionId: webBehaviorEventsTable.anonymousSessionId,
      leadId: webBehaviorEventsTable.leadId,
      metadata: webBehaviorEventsTable.metadata,
      createdAt: webBehaviorEventsTable.createdAt,
    }).from(webBehaviorEventsTable)
      .where(eq(webBehaviorEventsTable.tenantId, tenantId))
      .orderBy(desc(webBehaviorEventsTable.createdAt))
      .limit(50_000),
  ]);

  const groups = new Map<string, {
    editorialId: string;
    thesis: string;
    series: string;
    publications: number;
    reach: number;
    impressions: number;
    views: number;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    clicks: number;
    sessions: Set<string>;
    leadIds: Set<string>;
    opportunities: number;
    wonDeals: number;
    wonRevenue: number;
    lastPublishedAt: string | null;
  }>();

  const ensureGroup = (editorialId: string, thesis: string, series = "Editorial VendorAI") => {
    const current = groups.get(editorialId);
    if (current) return current;
    const created = {
      editorialId,
      thesis,
      series,
      publications: 0,
      reach: 0,
      impressions: 0,
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      clicks: 0,
      sessions: new Set<string>(),
      leadIds: new Set<string>(),
      opportunities: 0,
      wonDeals: 0,
      wonRevenue: 0,
      lastPublishedAt: null,
    };
    groups.set(editorialId, created);
    return created;
  };

  for (const publication of publications) {
    const metadata = (publication.metadata || {}) as Record<string, unknown>;
    const editorial = metadata.editorial as Record<string, unknown> | undefined;
    const editorialId = typeof editorial?.editorialId === "string" ? editorial.editorialId : null;
    const thesis = typeof editorial?.thesis === "string" ? editorial.thesis : null;
    if (!editorialId || !thesis) continue;

    const metrics = (publication.metrics || {}) as Record<string, number>;
    const current = ensureGroup(editorialId, thesis, typeof editorial?.series === "string" ? editorial.series : "Editorial VendorAI");
    current.publications += 1;
    current.reach += Number(metrics.reach || 0);
    current.impressions += Number(metrics.impressions || 0);
    current.views += Number(metrics.views || metrics.plays || 0);
    current.likes += Number(metrics.likes || 0);
    current.comments += Number(metrics.comments || 0);
    current.saves += Number(metrics.saves || 0);
    current.shares += Number(metrics.shares || 0);
    current.clicks += Number(metrics.clicks || metrics.linkClicks || 0);
    const published = publication.publishedAt ?? publication.createdAt;
    const publishedIso = published ? new Date(published).toISOString() : null;
    if (publishedIso && (!current.lastPublishedAt || publishedIso > current.lastPublishedAt)) current.lastPublishedAt = publishedIso;
  }

  for (const event of behaviorEvents) {
    const editorialId = metadataString(event.metadata, "editorialId") ?? metadataString(event.metadata, "utmContent");
    const thesis = metadataString(event.metadata, "editorialThesis");
    if (!editorialId || !thesis) continue;
    const current = ensureGroup(editorialId, thesis);
    current.sessions.add(event.sessionId);
    if (event.leadId) current.leadIds.add(event.leadId);
  }

  const allLeadIds = Array.from(new Set(Array.from(groups.values()).flatMap((group) => Array.from(group.leadIds))));
  const deals = allLeadIds.length
    ? await db.select({
      id: dealsTable.id,
      leadId: dealsTable.leadId,
      etapa: dealsTable.etapa,
      valor: dealsTable.valor,
      wonAt: dealsTable.wonAt,
    }).from(dealsTable).where(and(
      eq(dealsTable.tenantId, tenantId),
      inArray(dealsTable.leadId, allLeadIds),
    ))
    : [];

  for (const group of groups.values()) {
    if (!group.leadIds.size) continue;
    const groupDeals = deals.filter((deal) => Boolean(deal.leadId && group.leadIds.has(deal.leadId)));
    group.opportunities = groupDeals.length;
    const won = groupDeals.filter((deal) => deal.etapa === "ganho" || Boolean(deal.wonAt));
    group.wonDeals = won.length;
    group.wonRevenue = won.reduce((sum, deal) => sum + Number(deal.valor || 0), 0);
  }

  const theses = Array.from(groups.values()).map((item) => ({
    editorialId: item.editorialId,
    thesis: item.thesis,
    series: item.series,
    publications: item.publications,
    reach: item.reach,
    impressions: item.impressions,
    views: item.views,
    likes: item.likes,
    comments: item.comments,
    saves: item.saves,
    shares: item.shares,
    clicks: item.clicks,
    visits: item.sessions.size,
    leads: item.leadIds.size,
    opportunities: item.opportunities,
    wonDeals: item.wonDeals,
    wonRevenue: item.wonRevenue,
    engagement: item.likes + item.comments + item.saves + item.shares,
    engagementRate: item.reach > 0 ? (item.likes + item.comments + item.saves + item.shares) / item.reach : null,
    visitToLeadRate: item.sessions.size > 0 ? item.leadIds.size / item.sessions.size : null,
    leadToOpportunityRate: item.leadIds.size > 0 ? item.opportunities / item.leadIds.size : null,
    opportunityToWinRate: item.opportunities > 0 ? item.wonDeals / item.opportunities : null,
    lastPublishedAt: item.lastPublishedAt,
  })).sort((a, b) => b.wonRevenue - a.wonRevenue || b.opportunities - a.opportunities || (b.engagementRate ?? 0) - (a.engagementRate ?? 0));

  return res.json({
    theses,
    totals: {
      publications: theses.reduce((sum, item) => sum + item.publications, 0),
      reach: theses.reduce((sum, item) => sum + item.reach, 0),
      clicks: theses.reduce((sum, item) => sum + item.clicks, 0),
      visits: theses.reduce((sum, item) => sum + item.visits, 0),
      leads: theses.reduce((sum, item) => sum + item.leads, 0),
      opportunities: theses.reduce((sum, item) => sum + item.opportunities, 0),
      wonDeals: theses.reduce((sum, item) => sum + item.wonDeals, 0),
      wonRevenue: theses.reduce((sum, item) => sum + item.wonRevenue, 0),
    },
    attributionLevel: "first_party_commercial",
    note: "Visita e lead são ligados pela mesma sessão first-party/editorialId. Oportunidade e venda só entram quando existe leadId real ligado ao negócio no CRM.",
  });
});

export default router;