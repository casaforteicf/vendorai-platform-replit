import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, generatedSitesTable, type SiteGeneratorConfig } from "@workspace/db";

type MotionLevel = "auto" | "none" | "subtle" | "dynamic" | "cinematic";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function resolveMotionPreference(message: string): MotionLevel | null {
  const text = normalize(message);
  const motionIntent = /animacao|movimento|motion|efeito|cinematic|cinematograf|dinamic|suti|parallax|transicao/.test(text);
  if (!motionIntent) return null;
  if (/sem animacao|sem movimento|desativ.*animacao|tir.*animacao|remov.*animacao/.test(text)) return "none";
  if (/cinematic|cinematograf|imersiv/.test(text)) return "cinematic";
  if (/dinamic|mais movimento|mais animacao|parallax|storytelling/.test(text)) return "dynamic";
  if (/suti|discret|leve|menos movimento|menos animacao/.test(text)) return "subtle";
  if (/automatic|ia escolhe|ia decidir|recomendad/.test(text)) return "auto";
  return null;
}

async function persistMotionLevel(tenantId: string, siteId: string, level: MotionLevel) {
  const [site] = await db
    .select({ config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) return null;

  const config = site.config as SiteGeneratorConfig;
  const nextConfig: SiteGeneratorConfig = {
    ...config,
    motionLevel: level,
    // Rebuild the PageSpec in the 2.0 runtime so every section receives the
    // correct preset for the newly requested intensity.
    pageSpec: undefined,
    resolvedMotionLevel: level === "auto" ? undefined : level,
  };
  await db
    .update(generatedSitesTable)
    .set({ config: nextConfig, updatedAt: new Date() })
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)));
  return nextConfig;
}

router.use(async (req, res, next) => {
  const match = req.method === "POST"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/refine$/)
    : null;
  if (!match) return next();

  const tenantId = match[1]!;
  const siteId = match[2]!;
  if (!canAccess(req, tenantId)) return next();
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const level = resolveMotionPreference(message);
  if (!level) return next();

  try {
    await persistMotionLevel(tenantId, siteId, level);
    req.body = {
      ...req.body,
      motionPreference: level,
      message: `${message}\n\nAjuste o movimento global para ${level}. Preserve conteúdo, estrutura e dados; altere apenas os atributos data-motion necessários.`,
    };
  } catch (error) {
    req.log?.warn?.({ error, tenantId, siteId, level }, "Site Generator: failed to persist motion preference");
  }
  next();
});

router.patch("/tenants/:tenantId/site-generator/:siteId/motion", async (req, res) => {
  const match = req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/motion$/);
  const tenantId = match?.[1] ?? "";
  const siteId = match?.[2] ?? "";
  if (!tenantId || !siteId || !canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const level = req.body?.level as MotionLevel | undefined;
  if (!level || !["auto", "none", "subtle", "dynamic", "cinematic"].includes(level)) {
    res.status(400).json({ error: "Invalid motion level" });
    return;
  }

  const config = await persistMotionLevel(tenantId, siteId, level);
  if (!config) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json({ ok: true, motionLevel: level });
});

export default router;
