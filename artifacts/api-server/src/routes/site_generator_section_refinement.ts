import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, generatedSitesTable } from "@workspace/db";
import { buildTargetedRefinementInstruction, resolveSectionRefinement } from "@workspace/vendor-brain/site-section-refinement";
import { computeSiteSeoScore } from "../lib/site-seo-analysis.js";
import siteGenerator2RuntimeRouter from "./site_generator_2_runtime.js";

function cleanText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function extractSections(html: string) {
  const pattern = /<section\b[^>]*>[\s\S]*?<\/section>/gi;
  let blocks = html.match(pattern) ?? [];
  if (blocks.length === 0) blocks = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi) ?? [];
  return blocks.map((block, index) => {
    const headingMatch = block.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i);
    const title = cleanText(headingMatch?.[1] ?? "") || `Seção ${index + 1}`;
    return { index, key: `${index}:${slugify(title) || `secao-${index + 1}`}`, title, html: block };
  });
}

function restorePreservedSections(originalHtml: string, candidateHtml: string, preserveKeys: string[]): string {
  if (!preserveKeys.length) return candidateHtml;
  const original = extractSections(originalHtml);
  const candidate = extractSections(candidateHtml);
  if (!original.length || !candidate.length) return candidateHtml;

  const indexes = new Set(
    preserveKeys
      .map((key) => Number.parseInt(key.split(":")[0] ?? "", 10))
      .filter((index) => Number.isFinite(index)),
  );

  let restored = candidateHtml;
  for (const index of [...indexes].sort((a, b) => b - a)) {
    if (original[index] && candidate[index]) {
      restored = restored.replace(candidate[index]!.html, original[index]!.html);
    }
  }
  return restored;
}

const router: IRouter = Router();

// Runtime 2.0 runs first: creative direction, automatic media, component/motion
// contracts, deterministic SEO/runtime injection and publication QA gate.
router.use(siteGenerator2RuntimeRouter);

router.use(async (req, res, next) => {
  const match = req.method === "POST"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/refine$/)
    : null;
  if (!match) return next();

  const tenantId = match[1]!;
  const siteId = match[2]!;
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return next();

  const [site] = await db
    .select({ html: generatedSitesTable.html, config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site?.html) return next();

  const sections = extractSections(site.html).map(({ index, key, title }) => ({ index, key, title }));
  const resolution = resolveSectionRefinement(message, sections);
  if (resolution.mode !== "targeted") return next();

  req.body = {
    ...req.body,
    message: `${message}\n\n${buildTargetedRefinementInstruction(resolution)}`,
    sectionRefinement: {
      mode: resolution.mode,
      targetSectionKey: resolution.targetSectionKey,
      targetSectionIndex: resolution.targetSectionIndex,
      targetSectionTitle: resolution.targetSectionTitle,
      confidence: resolution.confidence,
    },
  };

  const originalJson = res.json.bind(res);
  let replied = false;
  (res as any).json = (body: any) => {
    if (replied || !body?.html || typeof body.html !== "string") return originalJson(body);
    replied = true;

    const restored = restorePreservedSections(site.html, body.html, resolution.preserveSectionKeys);
    const { score: seoScore, checklist: seoChecklist } = computeSiteSeoScore(restored);
    body.html = restored;
    body.seoScore = seoScore;
    body.seoChecklist = seoChecklist;
    body.sectionRefinement = {
      mode: resolution.mode,
      targetSectionKey: resolution.targetSectionKey,
      targetSectionIndex: resolution.targetSectionIndex,
      targetSectionTitle: resolution.targetSectionTitle,
      confidence: resolution.confidence,
    };

    const currentConfig = (site.config ?? {}) as Record<string, any>;
    const nextConfig = {
      ...currentConfig,
      generatorVersion: "2.0",
      lastSectionRefinement: {
        targetSectionKey: resolution.targetSectionKey,
        targetSectionTitle: resolution.targetSectionTitle,
        confidence: resolution.confidence,
        requestedAt: new Date().toISOString(),
      },
    };

    void db.update(generatedSitesTable)
      .set({
        html: restored,
        config: nextConfig as any,
        seoScore,
        seoChecklist,
        analisadoEm: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
      .then(() => originalJson(body))
      .catch(() => originalJson(body));
    return body;
  };

  next();
});

export default router;
