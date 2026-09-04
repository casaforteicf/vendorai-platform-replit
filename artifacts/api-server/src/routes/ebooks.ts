import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, tenantsTable, mediaAssetsTable } from "@workspace/db";
import { generateEbook, renderAndSaveEbook, type MarketingContext } from "../services/ebook-generation.js";

const router: IRouter = Router();

const generateEbookSchema = z.object({
  nicheId: z.string().min(1, "Nicho ID obrigatório"),
  nicheName: z.string().min(1, "Nome do nicho obrigatório"),
  productIds: z.array(z.string()).default([]),
  productNames: z.array(z.string()).default([]),
  businessVertical: z.string().optional().nullable(),
  businessVerticalSlug: z.string().optional().nullable(),
  audienceSegment: z.string().optional().nullable(),
  audienceNiche: z.string().optional().nullable(),
  campaignGoal: z.string().optional().nullable(),
  locationCity: z.string().optional().nullable(),
  locationState: z.string().optional().nullable(),
  locationRegion: z.string().optional().nullable(),
  projectName: z.string().optional().nullable(),
  specificDetails: z.string().optional().nullable(),
  mandatoryDifferentiators: z.string().optional().nullable(),
  restrictions: z.string().optional().nullable(),
  primaryKpi: z.string().optional().nullable(),
  researchEnabled: z.boolean().optional().default(false),
  seoTrackingEnabled: z.boolean().optional().default(false),
  campaignId: z.string().optional().nullable(),
  campaignName: z.string().optional().nullable(),
  theme: z.string().min(3, "Tema deve ter no mínimo 3 caracteres"),
  objective: z.enum(["lead_generation", "educate", "authority", "sales", "guide"]),
  depth: z.enum(["curto", "médio", "completo"]),
  tone: z.string().optional().nullable(),
  finalCta: z.string().optional().nullable(),
});

type GenerateEbookInput = z.infer<typeof generateEbookSchema>;

router.post("/tenants/:tenantId/content/ebook/generate", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if ((req.user as Record<string, unknown>)?.platformRole !== "super_admin" && (req.user as Record<string, unknown>)?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant não encontrado" });
    return;
  }

  const parsed = generateEbookSchema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Erro na validação";
    res.status(422).json({ error: message });
    return;
  }

  const data = parsed.data as GenerateEbookInput;

  const marketingContext: MarketingContext = {
    nicheId: data.nicheId,
    nicheName: data.nicheName,
    productIds: data.productIds || [],
    productNames: data.productNames || [],
    businessVertical: data.businessVertical || undefined,
    businessVerticalSlug: data.businessVerticalSlug || undefined,
    audienceSegment: data.audienceSegment || undefined,
    audienceNiche: data.audienceNiche || undefined,
    campaignGoal: data.campaignGoal || undefined,
    locationCity: data.locationCity || undefined,
    locationState: data.locationState || undefined,
    locationRegion: data.locationRegion || undefined,
    projectName: data.projectName || undefined,
    specificDetails: data.specificDetails || undefined,
    mandatoryDifferentiators: data.mandatoryDifferentiators || undefined,
    restrictions: data.restrictions || undefined,
    primaryKpi: data.primaryKpi || undefined,
    researchEnabled: data.researchEnabled,
    seoTrackingEnabled: data.seoTrackingEnabled,
    campaignId: data.campaignId || undefined,
    campaignName: data.campaignName || undefined,
  };

  try {
    const ebook = await generateEbook(tenantId, marketingContext, { theme: data.theme, objective: data.objective, depth: data.depth, tone: data.tone || undefined, finalCta: data.finalCta || undefined });
    const asset = await renderAndSaveEbook(tenantId, ebook, marketingContext, { objective: data.objective, depth: data.depth });
    res.json({
      assetId: asset.assetId,
      title: ebook.title,
      subtitle: ebook.subtitle,
      summary: ebook.summary,
      chapters: ebook.chapters,
      finalCta: ebook.finalCta,
      campaignLanguage: ebook.campaignLanguage,
      campaignKit: ebook.campaignKit,
      landingHeadline: ebook.landingHeadline,
      landingSubheadline: ebook.landingSubheadline,
      storageUrl: asset.storageUrl,
      downloadUrl: asset.downloadUrl,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    });
  } catch (err: unknown) {
    console.error("ebook generation error:", err);
    const message = err instanceof Error ? err.message : "Erro ao gerar e-book";
    res.status(500).json({ error: message });
  }
});

const listEbooksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get("/tenants/:tenantId/content/ebooks", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if ((req.user as Record<string, unknown>)?.platformRole !== "super_admin" && (req.user as Record<string, unknown>)?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const parsed = listEbooksQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Erro na validação";
    res.status(422).json({ error: message });
    return;
  }

  const { limit } = parsed.data;

  try {
    const fetchLimit = Math.min(limit * 5, 100);
    const assets = await db.select().from(mediaAssetsTable).where(and(eq(mediaAssetsTable.tenantId, tenantId), eq(mediaAssetsTable.type, "document"), eq(mediaAssetsTable.role, "output"), eq(mediaAssetsTable.source, "generated"))).orderBy(desc(mediaAssetsTable.createdAt)).limit(fetchLimit);

    const ebookAssets = assets
      .filter((asset) => {
        const metadata = asset.metadata as Record<string, unknown> | null;
        return metadata?.operation === "ebook_generate";
      })
      .slice(0, limit)
      .map((asset) => {
        const metadata = asset.metadata as Record<string, unknown> & { title?: string; subtitle?: string; summary?: string; objective?: string; depth?: string; campaignId?: string; campaignName?: string; createdAt?: string };
        return {
          assetId: asset.id,
          title: metadata.title || "Sem título",
          subtitle: metadata.subtitle || "",
          summary: metadata.summary || "",
          objective: metadata.objective || "",
          depth: metadata.depth || "",
          campaignId: metadata.campaignId || null,
          campaignName: metadata.campaignName || null,
          storageUrl: asset.storageUrl,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          createdAt: metadata.createdAt || asset.createdAt?.toISOString(),
        };
      });

    res.json({ items: ebookAssets, total: ebookAssets.length, limit });
  } catch (err: unknown) {
    console.error("ebooks list error:", err);
    const message = err instanceof Error ? err.message : "Erro ao listar e-books";
    res.status(500).json({ error: message });
  }
});

export default router;
