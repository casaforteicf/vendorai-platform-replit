import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  generatedSitesTable,
  type SiteGeneratorConfig,
  type SiteGeneratorVersionSnapshot,
} from "@workspace/db";
import { enhanceSiteGenerator2Html } from "../lib/site-generator-2-runtime.js";

const router: IRouter = Router();
const MAX_SNAPSHOTS = 5;

function canAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function appendSnapshot(
  config: SiteGeneratorConfig,
  snapshot: SiteGeneratorVersionSnapshot,
): SiteGeneratorConfig {
  const existing = Array.isArray(config.versionHistory) ? config.versionHistory : [];
  const deduped = existing.filter((item) => item.html !== snapshot.html);
  return {
    ...config,
    versionHistory: [snapshot, ...deduped].slice(0, MAX_SNAPSHOTS),
  };
}

async function snapshotCurrentVersion(input: {
  tenantId: string;
  siteId: string;
  reason: SiteGeneratorVersionSnapshot["reason"];
  note?: string;
}) {
  const [site] = await db
    .select({
      html: generatedSitesTable.html,
      config: generatedSitesTable.config,
      seoScore: generatedSitesTable.seoScore,
    })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, input.siteId), eq(generatedSitesTable.tenantId, input.tenantId)))
    .limit(1);
  if (!site?.html) return;

  const snapshot: SiteGeneratorVersionSnapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reason: input.reason,
    html: site.html,
    seoScore: site.seoScore,
    note: input.note,
  };
  const nextConfig = appendSnapshot(site.config as SiteGeneratorConfig, snapshot);
  await db
    .update(generatedSitesTable)
    .set({ config: nextConfig, updatedAt: new Date() })
    .where(and(eq(generatedSitesTable.id, input.siteId), eq(generatedSitesTable.tenantId, input.tenantId)));
}

router.use(async (req, res, next) => {
  const match = req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/(refine|html|publish)$/);
  if (!match) return next();

  const tenantId = match[1]!;
  const siteId = match[2]!;
  if (!canAccess(req, tenantId)) return next();

  const action = match[3]!;
  const allowed =
    (action === "refine" && req.method === "POST") ||
    (action === "html" && req.method === "PATCH") ||
    (action === "publish" && req.method === "POST");
  if (!allowed) return next();

  try {
    await snapshotCurrentVersion({
      tenantId,
      siteId,
      reason: action === "refine" ? "refine" : action === "publish" ? "publish" : "manual",
      note: action === "refine" && typeof req.body?.message === "string"
        ? req.body.message.trim().slice(0, 220)
        : undefined,
    });
  } catch (error) {
    req.log?.warn?.({ error, tenantId, siteId }, "Site Generator 2: version snapshot failed; continuing mutation");
  }
  next();
});

router.get("/tenants/:tenantId/site-generator/:siteId/versions", async (req, res) => {
  const route = req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/versions$/);
  const tenantId = route?.[1] ?? "";
  const siteId = route?.[2] ?? "";
  if (!tenantId || !siteId || !canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({ config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  const config = site.config as SiteGeneratorConfig;
  const versions = (config.versionHistory ?? []).map(({ html: _html, ...version }) => version);
  res.json({ versions, maxSnapshots: MAX_SNAPSHOTS });
});

router.post("/tenants/:tenantId/site-generator/:siteId/versions/:versionId/restore", async (req, res) => {
  const route = req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/versions\/([^/]+)\/restore$/);
  const tenantId = route?.[1] ?? "";
  const siteId = route?.[2] ?? "";
  const versionId = route?.[3] ?? "";
  if (!tenantId || !siteId || !versionId || !canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({
      html: generatedSitesTable.html,
      config: generatedSitesTable.config,
      siteSlug: generatedSitesTable.siteSlug,
      published: generatedSitesTable.published,
      seoScore: generatedSitesTable.seoScore,
    })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const config = site.config as SiteGeneratorConfig;
  const target = (config.versionHistory ?? []).find((item) => item.id === versionId);
  if (!target) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const currentSnapshot: SiteGeneratorVersionSnapshot = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reason: "restore",
    html: site.html,
    seoScore: site.seoScore,
    note: `Antes de restaurar ${versionId}`,
  };
  const configWithCurrent = appendSnapshot(config, currentSnapshot);
  const enhanced = enhanceSiteGenerator2Html({
    html: target.html,
    config: configWithCurrent,
    published: Boolean(site.published),
    siteSlug: site.siteSlug,
  });
  const nextConfig: SiteGeneratorConfig = {
    ...configWithCurrent,
    qaScorecard: enhanced.qa,
    pageSpec: enhanced.pageSpec as unknown as Record<string, unknown>,
    creativeDirector: enhanced.pageSpec.director as unknown as Record<string, unknown>,
    componentIds: enhanced.pageSpec.sections.map((section) => section.componentId),
  };

  await db
    .update(generatedSitesTable)
    .set({
      html: enhanced.html,
      config: nextConfig,
      seoScore: enhanced.seoScore,
      seoChecklist: enhanced.seoChecklist,
      analisadoEm: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)));

  res.json({
    restored: true,
    versionId,
    html: enhanced.html,
    seoScore: enhanced.seoScore,
    qaScorecard: enhanced.qa,
  });
});

export default router;
