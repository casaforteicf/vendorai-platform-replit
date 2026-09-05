import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  businessProfilesTable,
  tenantsTable,
  whatsappConnectionsTable,
  insertBusinessProfileSchema,
  updateBusinessProfileSchema,
} from "@workspace/db";
import { resolveMarketingRuntime } from "@workspace/vendor-brain/marketing-runtime";
import type { ChannelId } from "@workspace/vendor-brain/platform-foundation";
import { resolveTenantCreativePlan } from "../services/creativeDesignBridge";
import { buildGenerationDesignQa } from "../services/contentCreativeRuntime";

const router: IRouter = Router();

router.post("/business-profiles", async (req, res) => {
  const parsed = insertBusinessProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  try {
    const [profile] = await db
      .insert(businessProfilesTable)
      .values(parsed.data)
      .returning();
    if (parsed.data.vertical) {
      await db
        .update(tenantsTable)
        .set({ vertical: parsed.data.vertical, segmento: parsed.data.vertical, updatedAt: new Date() })
        .where(eq(tenantsTable.id, parsed.data.tenantId));
    }
    res.status(201).json(profile);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Tenant already has a business profile" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:tenantId/business-profile", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const [profileResult, tenantResult, whatsappResult] = await Promise.allSettled([
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      nomeEmpresa: tenantsTable.nomeEmpresa,
      vertical: tenantsTable.vertical,
      segmento: tenantsTable.segmento,
      logoUrl: tenantsTable.logoUrl,
      site: tenantsTable.site,
      descricao: tenantsTable.descricao,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select({
      displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber,
      businessName: whatsappConnectionsTable.businessName,
      isDefault: whatsappConnectionsTable.isDefault,
      updatedAt: whatsappConnectionsTable.updatedAt,
    }).from(whatsappConnectionsTable)
      .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active")))
      .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
      .limit(1),
  ]);
  const profile = profileResult.status === "fulfilled" ? profileResult.value[0] ?? null : null;
  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value[0] ?? null : null;
  const whatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value[0] ?? null : null;
  const mergedProfile = tenant || profile || whatsapp ? {
    ...(profile ?? {}),
    tenantId,
    razaoSocial: profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || "",
    nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || null,
    vertical: profile?.vertical || tenant?.segmento || tenant?.vertical || null,
    logoUrl: profile?.logoUrl || tenant?.logoUrl || null,
    telefone: profile?.telefone || whatsapp?.displayPhoneNumber || null,
    descricao: tenant?.descricao || null,
    site: tenant?.site || null,
    displayPhoneNumber: whatsapp?.displayPhoneNumber || null,
  } : null;
  const degraded = [profileResult, tenantResult, whatsappResult].some((result) => result.status === "rejected");
  if (degraded) req.log?.warn({ tenantId }, "business-profile: served with fallback sources");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(mergedProfile);
});

/**
 * Read-only Marketing Agent runtime resolver.
 * It consumes the existing campaign/MarketingContextSelector context and the
 * canonical tenant Brand Profile. No campaign, brand or agent state is persisted.
 */
router.post("/tenants/:tenantId/marketing-agent/runtime", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = (req.body ?? {}) as {
    verticalId?: string | null;
    campaignId?: string | null;
    campaignName?: string | null;
    page?: string | null;
    objective?: string | null;
    audience?: string | null;
    productIds?: string[];
    productNames?: string[];
    selectedChannels?: ChannelId[];
    creative?: {
      channel?: string;
      format?: string;
      offer?: string | null;
      message?: string | null;
      cta?: string | null;
      visualDirection?: string | null;
      assetIds?: string[];
    };
  };

  const runtime = resolveMarketingRuntime({
    tenantId,
    verticalId: body.verticalId ?? null,
    campaignId: body.campaignId ?? null,
    campaignName: body.campaignName ?? null,
    page: body.page ?? null,
    objective: body.objective ?? null,
    audience: body.audience ?? null,
    productIds: Array.isArray(body.productIds) ? body.productIds : [],
    productNames: Array.isArray(body.productNames) ? body.productNames : [],
    selectedChannels: Array.isArray(body.selectedChannels) ? body.selectedChannels : undefined,
  }, body.creative);

  let creativePlan = null;
  if (runtime.creativeBrief && runtime.creativeBriefErrors.length === 0) {
    try {
      creativePlan = await resolveTenantCreativePlan(tenantId, runtime.creativeBrief);
    } catch (error) {
      req.log?.warn({ error, tenantId }, "marketing-agent: creative plan unavailable");
    }
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    agentPlan: runtime.agentPlan,
    creativeBrief: runtime.creativeBrief ?? null,
    creativeBriefErrors: runtime.creativeBriefErrors,
    creativePlan,
  });
});

/**
 * Shared deterministic QA inspector used by content, site/LP, video and ad
 * surfaces. It does not publish or persist anything; it only returns the
 * normalized DesignQaResult contract used by the publication gate.
 */
router.post("/tenants/:tenantId/marketing-agent/design-qa", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = (req.body ?? {}) as {
    kind?: "content" | "site" | "video" | "ad";
    text?: string;
    channel?: string;
    format?: string;
    objective?: string;
    cta?: string | null;
    campaignId?: string | null;
    audience?: string | null;
    productId?: string | null;
    technicalValid?: boolean;
    visualChecks?: {
      readability?: number;
      composition?: number;
      channelFit?: number;
    };
  };

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const channel = typeof body.channel === "string" && body.channel.trim() ? body.channel.trim() : "instagram";
  const format = typeof body.format === "string" && body.format.trim() ? body.format.trim() : body.kind || "content";
  const objective = typeof body.objective === "string" && body.objective.trim() ? body.objective.trim() : `revisar ${body.kind || "conteúdo"}`;

  let hasBrandContext = false;
  try {
    const plan = await resolveTenantCreativePlan(tenantId, {
      tenantId,
      campaignId: body.campaignId ?? null,
      objective,
      audience: body.audience ?? null,
      productId: body.productId ?? null,
      channel,
      format,
      cta: body.cta ?? null,
    });
    hasBrandContext = Boolean(plan.brand.logoUrl || plan.brand.tone?.length || plan.brand.colors?.length);
  } catch (error) {
    req.log?.warn({ error, tenantId }, "marketing-agent: design QA brand context unavailable");
  }

  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const hasCta = body.cta?.trim()
    ? text.toLowerCase().includes(body.cta.trim().toLowerCase()) || /\bcta\b|fale|saiba|compre|chame|acesse|solicite/i.test(text)
    : /\bcta\b|fale|saiba|compre|chame|acesse|solicite/i.test(text);
  const hasStructure = body.kind === "site"
    ? /<h1|<main|<section|cta|button|form/i.test(text)
    : /gancho|cta|benef[ií]cio|visual|legenda|headline|oferta/i.test(text);

  const designQa = buildGenerationDesignQa({
    brandScore: hasBrandContext ? 92 : 76,
    readabilityScore: body.visualChecks?.readability ?? (wordCount > 0 && wordCount < 5_000 ? 90 : 75),
    compositionScore: body.visualChecks?.composition ?? (hasStructure ? 92 : 78),
    channelFitScore: body.visualChecks?.channelFit ?? 88,
    ctaScore: hasCta ? 94 : 68,
    technicalScore: body.technicalValid === false ? 60 : 94,
    warnings: [
      ...(!hasBrandContext ? ["Contexto de marca incompleto para revisão criativa."] : []),
      ...(!hasCta ? ["CTA não foi identificado com clareza."] : []),
      ...(body.technicalValid === false ? ["Saída não passou na validação técnica do pipeline."] : []),
    ],
    recommendations: [
      ...(!hasCta ? ["Adicionar ou reforçar CTA alinhado ao objetivo da campanha."] : []),
      ...(!hasBrandContext ? ["Completar identidade/tom no Perfil da Empresa para elevar consistência de marca."] : []),
    ],
  });

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ designQa });
});

router.get("/business-profiles/:id", async (req, res) => {
  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, String(req.params.id)));

  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  res.json(profile);
});

router.patch("/business-profiles/:id", async (req, res) => {
  const parsed = updateBusinessProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: businessProfilesTable.id, tenantId: businessProfilesTable.tenantId })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db
    .update(businessProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(businessProfilesTable.id, existing.id))
    .returning();

  // A navegação e os gates dos módulos especializados consultam a vertical
  // do tenant. Mantém esse valor alinhado ao perfil comercial editável para
  // que a troca de segmento passe a valer imediatamente em toda a aplicação.
  if (parsed.data.vertical !== undefined) {
    await db
      .update(tenantsTable)
      .set({
        vertical: parsed.data.vertical || null,
        segmento: parsed.data.vertical || null,
        updatedAt: new Date(),
      })
      .where(eq(tenantsTable.id, existing.tenantId));
  }

  res.json(profile);
});

router.delete("/business-profiles/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: businessProfilesTable.id, tenantId: businessProfilesTable.tenantId })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(businessProfilesTable).where(eq(businessProfilesTable.id, existing.id));

  res.status(204).send();
});

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return isPgCode(err, "23505");
}

export default router;