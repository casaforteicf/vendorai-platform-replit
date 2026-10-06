import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  businessProfilesTable,
  generatedSitesTable,
  tenantsTable,
  whatsappConnectionsTable,
  insertBusinessProfileSchema,
  updateBusinessProfileSchema,
} from "@workspace/db";
import { resolveMarketingRuntime } from "@workspace/vendor-brain/marketing-runtime";
import type { ChannelId } from "@workspace/vendor-brain/platform-foundation";
import { resolveTenantCreativePlan } from "../services/creativeDesignBridge";
import { buildGenerationDesignQa } from "../services/contentCreativeRuntime";
import { enrichSiteGeneratorServicesContext, inspectGeneratedSite, resolveSiteCreativeRuntime } from "../services/siteCreativeRuntime";
import { getOpenAIForTenant } from "../lib/agent-engine.js";
import { ensureTenantProposalBuilderTemplate } from "../lib/proposal-builder.js";
import { resolverContextoNegocio } from "../services/resolvedorContextoNegocio.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();
const businessProfileStorage = new ObjectStorageService();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function canAccessTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function normalizeSiteSurface(value: unknown): "institutional" | "landing" | "product" | "ecommerce" {
  return value === "institutional" || value === "product" || value === "ecommerce" ? value : "landing";
}

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
    const [profile] = await db.insert(businessProfilesTable).values(parsed.data).returning();
    if (parsed.data.vertical) {
      await db
        .update(tenantsTable)
        .set({ vertical: parsed.data.vertical, segmento: parsed.data.vertical, updatedAt: new Date() })
        .where(eq(tenantsTable.id, parsed.data.tenantId));
    }
    try {
      await ensureTenantProposalBuilderTemplate({
        tenantId: parsed.data.tenantId,
        log: req.log,
      });
    } catch (err) {
      req.log.warn(
        { err, tenantId: parsed.data.tenantId },
        "Business profile: failed to prepare proposal builder template",
      );
    }
    const [profileWithProposalModel] = await db
      .select()
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.id, profile.id))
      .limit(1);
    res.status(201).json(profileWithProposalModel ?? profile);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Tenant already has a business profile" });
      return;
    }
    throw err;
  }
});

type BusinessContextAiField = "all" | "diferenciais" | "publicoAlvo" | "missao" | "visao" | "valores";

const BUSINESS_CONTEXT_AI_FIELDS = new Set<BusinessContextAiField>([
  "all",
  "diferenciais",
  "publicoAlvo",
  "missao",
  "visao",
  "valores",
]);

function trimText(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeBusinessContextSuggestions(raw: any) {
  return {
    diferenciais: trimText(raw?.diferenciais, 3000),
    publicoAlvo: trimText(raw?.publicoAlvo, 3000),
    missao: trimText(raw?.missao, 1200),
    visao: trimText(raw?.visao, 1200),
    valores: Array.isArray(raw?.valores)
      ? raw.valores.map((value: unknown) => trimText(value, 180)).filter(Boolean).slice(0, 8)
      : [],
  };
}

router.post("/tenants/:tenantId/business-context/generate", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const requestedField = BUSINESS_CONTEXT_AI_FIELDS.has(req.body?.field)
    ? (req.body.field as BusinessContextAiField)
    : "all";
  const current = req.body?.current && typeof req.body.current === "object" ? req.body.current : {};

  try {
    const [profileRows, tenantRows] = await Promise.all([
      db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
      db.select({
        name: tenantsTable.name,
        nomeEmpresa: tenantsTable.nomeEmpresa,
        vertical: tenantsTable.vertical,
        segmento: tenantsTable.segmento,
        descricao: tenantsTable.descricao,
        site: tenantsTable.site,
      }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    ]);

    const profile = profileRows[0] ?? null;
    const tenant = tenantRows[0] ?? null;
    const productsSource = Array.isArray(current.produtos)
      ? current.produtos
      : Array.isArray(profile?.produtos)
        ? profile.produtos
        : [];

    const businessContext = {
      empresa: {
        razaoSocial: profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || "",
        nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || "",
        segmento: profile?.vertical || tenant?.segmento || tenant?.vertical || "",
        descricao: tenant?.descricao || "",
        site: tenant?.site || "",
        endereco: profile?.endereco || "",
      },
      contextoAtual: {
        diferenciais: trimText(current.diferenciais ?? profile?.diferenciais, 3000),
        publicoAlvo: trimText(current.publicoAlvo ?? profile?.publicoAlvo, 3000),
        concorrentes: Array.isArray(current.concorrentes) ? current.concorrentes.slice(0, 20) : (profile?.concorrentes ?? []),
        canaisVenda: Array.isArray(current.canaisVenda) ? current.canaisVenda.slice(0, 20) : (profile?.canaisVenda ?? []),
        missao: trimText(current.missao ?? (profile?.discoveryData as any)?.missao, 1200),
        visao: trimText(current.visao ?? (profile?.discoveryData as any)?.visao, 1200),
        valores: Array.isArray(current.valores)
          ? current.valores.slice(0, 12)
          : Array.isArray((profile?.discoveryData as any)?.valores)
            ? (profile?.discoveryData as any).valores.slice(0, 12)
            : [],
        historia: trimText(current.historia ?? (profile?.discoveryData as any)?.historia, 2500),
        produtosServicos: productsSource.slice(0, 60).map((item: any) => ({
          nome: trimText(item?.nome, 180),
          descricao: trimText(item?.descricao, 500),
        })).filter((item: any) => item.nome),
      },
    };

    const requestedInstruction = requestedField === "all"
      ? "Gere ou melhore os cinco blocos: diferenciais, publicoAlvo, missao, visao e valores."
      : `Gere ou melhore somente o bloco "${requestedField}". Nos demais campos, devolva string vazia ou lista vazia.`;

    const openai = await getOpenAIForTenant(tenantId);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 1800,
      response_format: { type: "json_object" } as any,
      messages: [
        {
          role: "system",
          content: `Você é um estrategista de posicionamento empresarial. Ajude a empresa a escrever seu contexto institucional de forma clara, específica e útil para CRM, marketing e agentes de IA.
Regras:
- Use apenas o contexto fornecido. Não invente números, prêmios, clientes, certificações, liderança de mercado ou superioridade não comprovada.
- Diferenciais: 4 a 8 pontos concretos em texto corrido ou linhas curtas, conectando capacidades reais a benefícios.
- Público-alvo: descreva segmentos, perfil de cliente, principais necessidades e situações de compra. Evite generalidades.
- Missão: uma frase objetiva explicando por que a empresa existe e qual valor entrega.
- Visão: uma frase aspiracional e crível sobre onde quer chegar; não invente prazo ou meta numérica.
- Valores: 5 a 7 valores curtos, específicos e coerentes com o negócio.
- Preserve o que já estiver bom no texto atual e melhore clareza, coerência e especificidade.
- Responda somente JSON válido no formato: {"diferenciais":"", "publicoAlvo":"", "missao":"", "visao":"", "valores":[""]}.`,
        },
        {
          role: "user",
          content: `${requestedInstruction}

Contexto da empresa:
${JSON.stringify(businessContext)}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const suggestions = normalizeBusinessContextSuggestions(parsed);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ field: requestedField, suggestions });
  } catch (error) {
    req.log?.error({ error, tenantId, requestedField }, "business-context: AI generation failed");
    res.status(500).json({ error: "Não foi possível gerar as sugestões com IA agora." });
  }
});

router.post("/tenants/:tenantId/inteligencia-negocio/resolver", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const query = typeof req.body?.query === "string" ? req.body.query.trim().slice(0, 8000) : "";
  const productIds = Array.isArray(req.body?.productIds)
    ? req.body.productIds.map((value: unknown) => String(value)).filter(Boolean).slice(0, 30)
    : [];

  try {
    const resolved = await resolverContextoNegocio({
      tenantId,
      query,
      productIds,
      limit: typeof req.body?.limit === "number" ? req.body.limit : undefined,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(resolved);
  } catch (error) {
    req.log?.error({ error, tenantId }, "inteligencia-negocio: falha ao resolver");
    res.status(500).json({ error: "Não foi possível resolver a inteligência do negócio agora." });
  }
});

router.get("/tenants/:tenantId/business-profile", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profileResult, tenantResult, whatsappResult] = await Promise.allSettled([
    withTimeout(
      db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
      3_500,
      "business profile query",
    ),
    withTimeout(
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
      3_500,
      "tenant query",
    ),
    withTimeout(
      db.select({
        displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber,
        businessName: whatsappConnectionsTable.businessName,
        isDefault: whatsappConnectionsTable.isDefault,
        updatedAt: whatsappConnectionsTable.updatedAt,
      }).from(whatsappConnectionsTable)
        .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active")))
        .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
        .limit(1),
      3_500,
      "whatsapp connection query",
    ),
  ]);
  let profile = profileResult.status === "fulfilled" ? profileResult.value[0] ?? null : null;
  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value[0] ?? null : null;
  const whatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value[0] ?? null : null;

  const canonicalLogoUrl = profile?.logoUrl || tenant?.logoUrl || null;
  let logoAccessUrl = canonicalLogoUrl;
  if (canonicalLogoUrl?.startsWith("/objects/")) {
    try {
      logoAccessUrl = await withTimeout(
        businessProfileStorage.getObjectEntitySignedUrl(canonicalLogoUrl, 900),
        2_500,
        "logo signed url",
      );
    } catch (error) {
      req.log?.warn({ error, tenantId }, "business-profile: logo signed URL unavailable");
      logoAccessUrl = null;
    }
  }

  const mergedProfile = tenant || profile || whatsapp ? {
    ...(profile ?? {}),
    tenantId,
    razaoSocial: profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || "",
    nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || null,
    vertical: profile?.vertical || tenant?.segmento || tenant?.vertical || null,
    logoUrl: canonicalLogoUrl,
    logoAccessUrl,
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

router.post("/tenants/:tenantId/marketing-agent/runtime", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
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

router.post("/tenants/:tenantId/marketing-agent/site-runtime", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = (req.body ?? {}) as {
    surface?: "institutional" | "landing" | "product" | "ecommerce";
    campaignId?: string | null;
    campaignName?: string | null;
    businessName?: string | null;
    productId?: string | null;
    productName?: string | null;
    objective?: string | null;
    audience?: string | null;
    offer?: string | null;
    cta?: string | null;
    visualDirection?: string | null;
    assetIds?: string[];
    brandColor?: string | null;
  };

  const [profile, tenant] = await Promise.all([
    db.select({ logoUrl: businessProfilesTable.logoUrl, nomeFantasia: businessProfilesTable.nomeFantasia })
      .from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1)
      .then((rows) => rows[0] ?? null),
    db.select({ logoUrl: tenantsTable.logoUrl, name: tenantsTable.name, nomeEmpresa: tenantsTable.nomeEmpresa })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const surface = body.surface ?? "landing";
  const runtime = await resolveSiteCreativeRuntime({
    tenantId,
    surface,
    campaignId: body.campaignId ?? null,
    campaignName: body.campaignName ?? null,
    businessName: body.businessName || profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || null,
    productId: body.productId ?? null,
    productName: body.productName ?? null,
    objective: body.objective?.trim() || (surface === "institutional" ? "apresentar a empresa e gerar contato qualificado" : "converter o público da campanha"),
    audience: body.audience ?? null,
    offer: body.offer ?? null,
    cta: body.cta ?? null,
    visualDirection: body.visualDirection ?? null,
    logoUrl: profile?.logoUrl || tenant?.logoUrl || null,
    brandColor: body.brandColor ?? null,
    assetIds: Array.isArray(body.assetIds) ? body.assetIds : [],
  });

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ runtime });
});

/**
 * Pre-generation middleware. This router is mounted before Site Generator, so
 * it enriches the official request and delegates to the existing generator.
 */
router.post("/tenants/:tenantId/site-generator/generate", async (req, res, next) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) return next();

  try {
    const body = (req.body ?? {}) as Record<string, any>;
    const marketing = (body.marketingContext ?? {}) as Record<string, any>;
    const surface = normalizeSiteSurface(body.type);
    const [profile, tenant] = await Promise.all([
      db.select({ logoUrl: businessProfilesTable.logoUrl, nomeFantasia: businessProfilesTable.nomeFantasia })
        .from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1)
        .then((rows) => rows[0] ?? null),
      db.select({ logoUrl: tenantsTable.logoUrl, name: tenantsTable.name, nomeEmpresa: tenantsTable.nomeEmpresa })
        .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    const productIds = Array.isArray(marketing.productIds) ? marketing.productIds : Array.isArray(body.productIds) ? body.productIds : [];
    const productNames = Array.isArray(marketing.productNames) ? marketing.productNames : Array.isArray(body.productNames) ? body.productNames : [];
    const runtime = await resolveSiteCreativeRuntime({
      tenantId,
      surface,
      campaignId: marketing.campaignId || body.campaignId || null,
      campaignName: marketing.campaignName || body.campaignName || null,
      businessName: body.name || profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || null,
      productId: body.produtoId || productIds[0] || null,
      productName: productNames[0] || null,
      objective: marketing.campaignGoal || body.campaignGoal || (surface === "institutional" ? "apresentar a empresa e gerar contato qualificado" : "converter o público da campanha"),
      audience: marketing.audienceNiche || marketing.audienceSegment || marketing.nicheName || body.nicheName || null,
      offer: marketing.offer || body.offer || null,
      cta: body.cta || marketing.cta || null,
      visualDirection: marketing.specificDetails || body.visualDirection || null,
      logoUrl: body.logoUrl || profile?.logoUrl || tenant?.logoUrl || null,
      brandColor: body.color || null,
      assetIds: [],
    });

    body.servicos = enrichSiteGeneratorServicesContext(body.servicos, runtime.promptContext);
    body.creativeRuntimeContext = runtime.promptContext;
    body.campaignId = marketing.campaignId || body.campaignId || undefined;
    body.campaignName = marketing.campaignName || body.campaignName || undefined;
    req.body = body;
  } catch (error) {
    req.log?.warn({ error, tenantId }, "site-generator: creative runtime enrichment unavailable; using canonical generator inputs");
  }
  next();
});

router.post("/tenants/:tenantId/marketing-agent/design-qa", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const body = (req.body ?? {}) as {
    kind?: "content" | "site" | "video" | "ad";
    artifactId?: string | null;
    persist?: boolean;
    text?: string;
    channel?: string;
    format?: string;
    objective?: string;
    cta?: string | null;
    campaignId?: string | null;
    audience?: string | null;
    productId?: string | null;
    technicalValid?: boolean;
    visualChecks?: { readability?: number; composition?: number; channelFit?: number };
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

  let designQa;
  if (body.kind === "site") {
    designQa = inspectGeneratedSite({
      html: text,
      hasBrandContext,
      expectedCta: body.cta ?? null,
      technicalValid: body.technicalValid !== false,
    });
  } else {
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const hasCta = body.cta?.trim()
      ? text.toLowerCase().includes(body.cta.trim().toLowerCase()) || /\bcta\b|fale|saiba|compre|chame|acesse|solicite/i.test(text)
      : /\bcta\b|fale|saiba|compre|chame|acesse|solicite/i.test(text);
    const hasStructure = /gancho|cta|benef[ií]cio|visual|legenda|headline|oferta/i.test(text);
    designQa = buildGenerationDesignQa({
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
  }

  if (body.kind === "site" && body.persist && body.artifactId) {
    const [site] = await db.select({ id: generatedSitesTable.id, tenantId: generatedSitesTable.tenantId, config: generatedSitesTable.config })
      .from(generatedSitesTable)
      .where(and(eq(generatedSitesTable.id, body.artifactId), eq(generatedSitesTable.tenantId, tenantId)))
      .limit(1);
    if (!site) {
      res.status(404).json({ error: "Site/LP não encontrado para persistir o QA" });
      return;
    }
    const reviewedAt = new Date().toISOString();
    await db.update(generatedSitesTable)
      .set({
        config: {
          ...(site.config as any),
          designQa,
          qaReviewedAt: reviewedAt,
          qaApprovedAt: designQa.approved ? reviewedAt : null,
          qaSource: "marketing-agent",
        } as any,
        updatedAt: new Date(),
      })
      .where(eq(generatedSitesTable.id, site.id));
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ designQa });
});

/**
 * Publication pre-gate. If QA is absent, run it against the current HTML and
 * persist it. Only approved pages are delegated to the canonical publish route.
 */
router.post("/tenants/:tenantId/site-generator/:siteId/publish", async (req, res, next) => {
  const tenantId = String(req.params.tenantId);
  const siteId = String(req.params.siteId);
  if (!canAccessTenant(req, tenantId)) return next();

  const [site] = await db.select({ id: generatedSitesTable.id, tenantId: generatedSitesTable.tenantId, html: generatedSitesTable.html, config: generatedSitesTable.config })
    .from(generatedSitesTable)
    .where(and(eq(generatedSitesTable.id, siteId), eq(generatedSitesTable.tenantId, tenantId)))
    .limit(1);
  if (!site) return next();

  let config = (site.config ?? {}) as any;
  let qa = config.designQa as { approved?: boolean; overallScore?: number } | undefined;
  if (!qa) {
    let hasBrandContext = false;
    try {
      const plan = await resolveTenantCreativePlan(tenantId, {
        tenantId,
        campaignId: config.campaignId ?? null,
        objective: config.marketingContext?.campaignGoal || "publicar Site/LP",
        audience: config.marketingContext?.audienceNiche || config.nicheName || null,
        productId: config.productIds?.[0] ?? null,
        channel: "web",
        format: config.type || "landing",
        cta: config.cta ?? null,
      });
      hasBrandContext = Boolean(plan.brand.logoUrl || plan.brand.tone?.length || plan.brand.colors?.length);
    } catch {}
    qa = inspectGeneratedSite({ html: site.html, hasBrandContext, expectedCta: config.cta ?? null, technicalValid: true });
    const reviewedAt = new Date().toISOString();
    config = {
      ...config,
      designQa: qa,
      qaReviewedAt: reviewedAt,
      qaApprovedAt: qa.approved ? reviewedAt : null,
      qaSource: "publish-gate",
    };
    await db.update(generatedSitesTable).set({ config, updatedAt: new Date() }).where(eq(generatedSitesTable.id, site.id));
  }

  if (!qa.approved) {
    res.status(409).json({
      error: `Design QA reprovou este Site/LP${typeof qa.overallScore === "number" ? ` (${qa.overallScore}/100)` : ""}. Corrija os alertas antes de publicar.`,
      designQa: qa,
    });
    return;
  }
  next();
});

router.get("/business-profiles/:id", async (req, res) => {
  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, String(req.params.id)));
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

  const [existing] = await db.select({
    id: businessProfilesTable.id,
    tenantId: businessProfilesTable.tenantId,
    discoveryData: businessProfilesTable.discoveryData,
  })
    .from(businessProfilesTable).where(eq(businessProfilesTable.id, String(req.params.id)));
  if (!existing) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const existingDiscovery = (existing.discoveryData ?? {}) as Record<string, unknown>;
  const incomingDiscovery = parsed.data.discoveryData && typeof parsed.data.discoveryData === "object"
    ? parsed.data.discoveryData as Record<string, unknown>
    : undefined;
  const protectedDiscovery = incomingDiscovery
    ? {
        ...incomingDiscovery,
        ...(incomingDiscovery.proposalBuilderTemplates === undefined && existingDiscovery.proposalBuilderTemplates !== undefined
          ? { proposalBuilderTemplates: existingDiscovery.proposalBuilderTemplates }
          : {}),
        ...(incomingDiscovery.activeProposalBuilderTemplateId === undefined && existingDiscovery.activeProposalBuilderTemplateId !== undefined
          ? { activeProposalBuilderTemplateId: existingDiscovery.activeProposalBuilderTemplateId }
          : {}),
      }
    : undefined;

  const [profile] = await db.update(businessProfilesTable)
    .set({
      ...parsed.data,
      ...(protectedDiscovery ? { discoveryData: sql`(${JSON.stringify(protectedDiscovery)}::jsonb - 'businessPlan') || CASE WHEN ${businessProfilesTable.discoveryData} ? 'businessPlan' THEN jsonb_build_object('businessPlan', ${businessProfilesTable.discoveryData}->'businessPlan') ELSE '{}'::jsonb END` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.id, existing.id))
    .returning();
  if (parsed.data.vertical !== undefined) {
    await db.update(tenantsTable)
      .set({ vertical: parsed.data.vertical || null, segmento: parsed.data.vertical || null, updatedAt: new Date() })
      .where(eq(tenantsTable.id, existing.tenantId));
  }

  try {
    await ensureTenantProposalBuilderTemplate({
      tenantId: existing.tenantId,
      log: req.log,
    });
  } catch (err) {
    // O Kit da Marca/perfil continua sendo salvo mesmo se a IA do modelo falhar.
    req.log.warn(
      { err, tenantId: existing.tenantId },
      "Business profile: failed to prepare proposal builder template",
    );
  }

  const [profileWithProposalModel] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.id, existing.id))
    .limit(1);
  res.json(profileWithProposalModel ?? profile);
});

router.delete("/business-profiles/:id", async (req, res) => {
  const [existing] = await db.select({ id: businessProfilesTable.id, tenantId: businessProfilesTable.tenantId })
    .from(businessProfilesTable).where(eq(businessProfilesTable.id, String(req.params.id)));
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
