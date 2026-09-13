import { Router, type IRouter, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, socialPublicationsTable } from "@workspace/db";

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

  const publications = await db.select().from(socialPublicationsTable)
    .where(eq(socialPublicationsTable.tenantId, tenantId))
    .orderBy(desc(socialPublicationsTable.createdAt))
    .limit(500);

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
    lastPublishedAt: string | null;
  }>();

  for (const publication of publications) {
    const metadata = (publication.metadata || {}) as Record<string, unknown>;
    const editorial = metadata.editorial as Record<string, unknown> | undefined;
    const editorialId = typeof editorial?.editorialId === "string" ? editorial.editorialId : null;
    const thesis = typeof editorial?.thesis === "string" ? editorial.thesis : null;
    if (!editorialId || !thesis) continue;

    const metrics = (publication.metrics || {}) as Record<string, number>;
    const current = groups.get(editorialId) ?? {
      editorialId,
      thesis,
      series: typeof editorial?.series === "string" ? editorial.series : "Editorial VendorAI",
      publications: 0,
      reach: 0,
      impressions: 0,
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      shares: 0,
      clicks: 0,
      lastPublishedAt: null,
    };

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
    groups.set(editorialId, current);
  }

  const theses = Array.from(groups.values()).map((item) => ({
    ...item,
    engagement: item.likes + item.comments + item.saves + item.shares,
    engagementRate: item.reach > 0 ? (item.likes + item.comments + item.saves + item.shares) / item.reach : null,
  })).sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));

  return res.json({
    theses,
    totals: {
      publications: theses.reduce((sum, item) => sum + item.publications, 0),
      reach: theses.reduce((sum, item) => sum + item.reach, 0),
      clicks: theses.reduce((sum, item) => sum + item.clicks, 0),
    },
    attributionLevel: "publication",
    note: "Performance comercial (visita, lead, oportunidade e venda) será adicionada quando houver vínculo first-party comprovado com a mesma tese.",
  });
});

export default router;
