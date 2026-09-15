import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  generatedSitesTable,
  mediaAssetsTable,
  type SiteGeneratorConfig,
} from "@workspace/db";
import {
  buildSiteGenerator2Prompt,
  buildSitePageSpec,
  type SitePageSpec,
} from "@workspace/vendor-brain/site-generator-2";
import {
  buildSiteGenerator2Config,
  enhanceSiteGenerator2Html,
} from "../lib/site-generator-2-runtime.js";

const router: IRouter = Router();
const GENERATOR_MARKER = "SITE GENERATOR 2.0 — EXECUÇÃO ESTRUTURADA OBRIGATÓRIA";

function canAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function publicMediaUrl(storageUrl: string): string {
  if (storageUrl.startsWith("/objects/")) return `/api/storage${storageUrl}`;
  return storageUrl;
}

function asPageSpec(value: unknown): SitePageSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<SitePageSpec>;
  return record.schemaVersion === "2.0" && Array.isArray(record.sections)
    ? (record as SitePageSpec)
    : null;
}

async function resolveAutomaticMedia(tenantId: string, config: SiteGeneratorConfig) {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  const currentImages = unique(Array.isArray(config.images) ? config.images : []);
  const currentVideos = unique(Array.isArray(config.videos) ? config.videos : []);
  const targetImages = 4;
  const targetVideos = 1;

  if (currentImages.length >= targetImages && currentVideos.length >= targetVideos) {
    return {
      images: currentImages,
      videos: currentVideos,
      auto: { imageCount: 0, videoCount: 0 },
    };
  }

  const assets = await db
    .select({
      id: mediaAssetsTable.id,
      type: mediaAssetsTable.type,
      role: mediaAssetsTable.role,
      storageUrl: mediaAssetsTable.storageUrl,
      metadata: mediaAssetsTable.metadata,
      createdAt: mediaAssetsTable.createdAt,
    })
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.tenantId, tenantId))
    .orderBy(desc(mediaAssetsTable.createdAt))
    .limit(80);

  const context = [
    config.name,
    config.sector,
    config.headline,
    config.desc,
    config.servicos,
    typeof config.creativeRuntimeContext === "string" ? config.creativeRuntimeContext : "",
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
  const stopwords = new Set(["para", "com", "uma", "das", "dos", "que", "site", "empresa", "cliente", "clientes", "vendorai"]);
  const contextTokens = new Set(
    context
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && !stopwords.has(token)),
  );

  const describe = (asset: typeof assets[number]) => {
    const metadata = asset.metadata && typeof asset.metadata === "object"
      ? asset.metadata as Record<string, unknown>
      : {};
    const usage = String(metadata.aiUsage ?? metadata.ai_usage ?? metadata.usage ?? "").toLowerCase();
    const role = String(asset.role ?? metadata.role ?? "").toLowerCase();
    const searchable = [role, JSON.stringify(metadata)]
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const relevant = [...contextTokens].some((token) => searchable.includes(token));
    const approved = usage === "approved" || metadata.siteApproved === true || metadata.site_approved === true;
    const genericPerson = /portrait|avatar|talking.?head|presenter|influencer|pessoa|retrato/.test(searchable);
    const productDemo = /product.?demo|screen.?record|dashboard|workflow|platform.?demo|sistema|interface|produto/.test(searchable);
    const fingerprint = String(
      metadata.contentHash ?? metadata.content_hash ?? metadata.subjectId ?? metadata.subject_id
      ?? metadata.topic ?? metadata.caption ?? asset.storageUrl,
    ).toLowerCase();
    return { approved, relevant, genericPerson, productDemo, fingerprint, role };
  };

  const seen = new Set<string>();
  const eligible = assets.filter((asset) => {
    const info = describe(asset);
    if (!info.approved || !info.relevant || info.genericPerson) return false;
    if (asset.type === "video" && !info.productDemo) return false;
    if (seen.has(info.fingerprint)) return false;
    seen.add(info.fingerprint);
    return true;
  });

  const ranked = [...eligible].sort((a, b) => {
    const score = (asset: typeof assets[number]) => {
      const info = describe(asset);
      return (info.productDemo ? 30 : 0)
        + (/product|reference|source|screenshot|interface/.test(info.role) ? 20 : 0)
        + (asset.type === "image" ? 5 : 0);
    };
    return score(b) - score(a);
  });

  const pickedImages = ranked
    .filter((asset) => asset.type === "image")
    .map((asset) => publicMediaUrl(asset.storageUrl))
    .filter((url) => !currentImages.includes(url))
    .slice(0, Math.max(0, targetImages - currentImages.length));
  const pickedVideos = ranked
    .filter((asset) => asset.type === "video")
    .map((asset) => publicMediaUrl(asset.storageUrl))
    .filter((url) => !currentVideos.includes(url))
    .slice(0, Math.max(0, targetVideos - currentVideos.length));

  return {
    images: unique([...currentImages, ...pickedImages]),
    videos: unique([...currentVideos, ...pickedVideos]),
    auto: { imageCount: pickedImages.length, videoCount: pickedVideos.length },
  };
}

function buildSpec(config: SiteGeneratorConfig): SitePageSpec {
  const mediaRefs = [
    ...(config.images ?? []),
    ...(config.videos ?? []),
    ...((config.products ?? []).map((product) => product.imageUrl).filter(Boolean) as string[]),
  ];
  return buildSitePageSpec({
    surface: config.type,
    sector: config.sector,
    tone: config.tone,
    objective: config.cta,
    visualDirection: config.creativeRuntimeContext,
    hasProducts: Boolean(config.products?.length),
    hasRealMedia: mediaRefs.length > 0,
    requestedMotion: config.motionLevel,
    mediaRefs,
  });
}

function enrichGenerationContext(config: SiteGeneratorConfig, spec: SitePageSpec): SiteGeneratorConfig {
  const prompt = buildSiteGenerator2Prompt(spec);
  const currentServices = typeof config.servicos === "string" ? config.servicos.trim() : "";
  const services = currentServices.includes(GENERATOR_MARKER)
    ? currentServices
    : [currentServices, prompt].filter(Boolean).join("\n\n");
  return { ...config, servicos: services };
}

async function persistEnhancedSite(input: {
  siteId: string;
  tenantId: string;
  html: string;
  config: SiteGeneratorConfig;
  siteSlug?: string | null;
  published: boolean;
  autoMedia?: { imageCount: number; videoCount: number };
}) {
  const existingSpec = asPageSpec(input.config.pageSpec);
  const enhanced = enhanceSiteGenerator2Html({
    html: input.html,
    config: input.config,
    pageSpec: existingSpec,
    published: input.published,
    siteSlug: input.siteSlug,
  });
  const nextConfig = buildSiteGenerator2Config({
    config: input.config,
    pageSpec: enhanced.pageSpec,
    qa: enhanced.qa,
    autoMedia: input.autoMedia,
  });
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
    .where(and(eq(generatedSitesTable.id, input.siteId), eq(generatedSitesTable.tenantId, input.tenantId)));
  return { enhanced, nextConfig };
}

router.use(async (req, res, next) => {
  const generateMatch = req.method === "POST"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/generate$/)
    : null;
  if (!generateMatch) return next();

  const tenantId = generateMatch[1]!;
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const config = (req.body ?? {}) as SiteGeneratorConfig;
  if (!config.type) return next();

  try {
    const media = await resolveAutomaticMedia(tenantId, config);
    const withMedia: SiteGeneratorConfig = {
      ...config,
      images: media.images,
      videos: media.videos,
    };
    const spec = buildSpec(withMedia);
    req.body = buildSiteGenerator2Config({
      config: enrichGenerationContext(withMedia, spec),
      pageSpec: spec,
      autoMedia: media.auto,
    });
  } catch (error) {
    req.log?.warn?.({ error, tenantId }, "Site Generator 2: automatic media resolution failed; continuing with supplied assets");
    const spec = buildSpec(config);
    req.body = buildSiteGenerator2Config({ config: enrichGenerationContext(config, spec), pageSpec: spec });
  }

  next();
});

router.use(async (req, res, next) => {
  const jobMatch = req.method === "GET"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/jobs\/([^/]+)$/)
    : null;
  if (!jobMatch) return next();

  const tenantId = jobMatch[1]!;
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const originalJson = res.json.bind(res);
  let sent = false;
  (res as any).json = (body: any) => {
    if (sent) return originalJson(body);
    const result = body?.status === "done" && body?.result && typeof body.result === "object" ? body.result : null;
    if (!result?.id || typeof result?.html !== "string") return originalJson(body);
    sent = true;
    const config = (result.config ?? {}) as SiteGeneratorConfig;
    void persistEnhancedSite({
      siteId: String(result.id),
      tenantId,
      html: result.html,
      config,
      siteSlug: typeof result.siteSlug === "string" ? result.siteSlug : null,
      published: Boolean(result.published),
      autoMedia: config.mediaAutoSelected,
    })
      .then(({ enhanced, nextConfig }) => originalJson({
        ...body,
        result: {
          ...result,
          html: enhanced.html,
          config: nextConfig,
          seoScore: enhanced.seoScore,
          seoChecklist: enhanced.seoChecklist,
          qaScorecard: enhanced.qa,
        },
      }))
      .catch((error) => {
        req.log?.error?.({ error, tenantId, siteId: result.id }, "Site Generator 2: failed to persist generated runtime");
        return originalJson(body);
      });
    return body;
  };
  next();
});

router.use(async (req, res, next) => {
  const refineMatch = req.method === "POST"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/refine$/)
    : null;
  if (!refineMatch) return next();

  const tenantId = refineMatch[1]!;
  const siteId = refineMatch[2]!;
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({
      config: generatedSitesTable.config,
      siteSlug: generatedSitesTable.siteSlug,
      published: generatedSitesTable.published,
    })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) return next();

  const config = site.config as SiteGeneratorConfig;
  const spec = asPageSpec(config.pageSpec) ?? buildSpec(config);
  const currentMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (currentMessage && !currentMessage.includes(GENERATOR_MARKER)) {
    req.body = {
      ...req.body,
      message: `${currentMessage}\n\n${buildSiteGenerator2Prompt(spec)}\n\nIMPORTANTE: este é um refinamento da versão atual. Preserve todo conteúdo e toda seção não afetados diretamente pelo pedido do usuário.`,
    };
  }

  const originalJson = res.json.bind(res);
  let sent = false;
  (res as any).json = (body: any) => {
    if (sent || typeof body?.html !== "string") return originalJson(body);
    sent = true;
    void persistEnhancedSite({
      siteId,
      tenantId,
      html: body.html,
      config,
      siteSlug: site.siteSlug,
      published: Boolean(site.published),
    })
      .then(({ enhanced, nextConfig }) => originalJson({
        ...body,
        html: enhanced.html,
        seoScore: enhanced.seoScore,
        seoChecklist: enhanced.seoChecklist,
        qaScorecard: enhanced.qa,
        config: nextConfig,
      }))
      .catch((error) => {
        req.log?.error?.({ error, tenantId, siteId }, "Site Generator 2: failed to persist refined runtime");
        return originalJson(body);
      });
    return body;
  };
  next();
});

router.use(async (req, res, next) => {
  const htmlPatchMatch = req.method === "PATCH"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/html$/)
    : null;
  if (!htmlPatchMatch) return next();

  const tenantId = htmlPatchMatch[1]!;
  const siteId = htmlPatchMatch[2]!;
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({ config: generatedSitesTable.config, siteSlug: generatedSitesTable.siteSlug, published: generatedSitesTable.published })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site || typeof req.body?.html !== "string") return next();

  const enhanced = enhanceSiteGenerator2Html({
    html: req.body.html,
    config: site.config as SiteGeneratorConfig,
    pageSpec: asPageSpec((site.config as SiteGeneratorConfig).pageSpec),
    published: Boolean(site.published),
    siteSlug: site.siteSlug,
  });
  req.body = { ...req.body, html: enhanced.html };
  next();
});

router.use(async (req, res, next) => {
  const publishMatch = req.method === "POST"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/publish$/)
    : null;
  if (!publishMatch) return next();

  const tenantId = publishMatch[1]!;
  const siteId = publishMatch[2]!;
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({
      id: generatedSitesTable.id,
      html: generatedSitesTable.html,
      config: generatedSitesTable.config,
      siteSlug: generatedSitesTable.siteSlug,
    })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);

  if (!site) return next();
  const config = site.config as SiteGeneratorConfig;
  const enhanced = enhanceSiteGenerator2Html({
    html: site.html,
    config,
    pageSpec: asPageSpec(config.pageSpec),
    published: true,
    siteSlug: site.siteSlug,
  });
  const nextConfig = buildSiteGenerator2Config({ config, pageSpec: enhanced.pageSpec, qa: enhanced.qa });

  if (!enhanced.qa.approved) {
    res.status(422).json({
      error: "SITE_QA_BLOCKED",
      message: "O site ainda não atingiu o padrão mínimo para publicação.",
      qaScorecard: enhanced.qa,
      thresholds: { design: 90, seo: 90, mobile: 90, performance: 85, accessibility: 90 },
    });
    return;
  }

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

  next();
});

router.get("/tenants/:tenantId/site-generator/:siteId/qa", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const siteId = String(req.params.siteId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [site] = await db
    .select({
      html: generatedSitesTable.html,
      config: generatedSitesTable.config,
      siteSlug: generatedSitesTable.siteSlug,
      published: generatedSitesTable.published,
    })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const config = site.config as SiteGeneratorConfig;
  const enhanced = enhanceSiteGenerator2Html({
    html: site.html,
    config,
    pageSpec: asPageSpec(config.pageSpec),
    published: Boolean(site.published),
    siteSlug: site.siteSlug,
  });
  res.json({ qaScorecard: enhanced.qa, seoScore: enhanced.seoScore, componentIds: enhanced.pageSpec.sections.map((section) => section.componentId), director: enhanced.pageSpec.director });
});

export default router;
