import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  propostasTable,
  produtosCatalogoTable,
  composicoesTable,
  categoriasProdutoTable,
  propostaTemplatesTable,
  businessProfilesTable,
  insertPropostaSchema,
  updatePropostaSchema,
  propostaApresentacaoSchema,
  tenantsTable,
  dealsTable,
  leadsTable,
  leadBriefingsTable,
  type PropostaItem,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { callOpenAI as gatewayCallOpenAI, generateImage } from "../lib/ai-gateway.js";
import { captureGeneratedMedia } from "../services/media-library.js";
import { proposalAccepted } from "../lib/proposal-accepted.js";
import { renderOrcamentoPdf, generateProposalPDF } from "../lib/proposal-engine.js";
import { logger } from "../lib/logger.js";
import { calcularOrcamentoProdutoArea, ErroCalculoOrcamento, type ProdutoCalculo, type TipoCalculo } from "../lib/calculoOrcamentoM2.js";
import { resolverECalcularOrcamento, ErroResolucaoOrcamento } from "../lib/calculoOrcamentoM2Resolver.js";
import { buildProposalProductContext, proposalProductPromptRules } from "../lib/proposal-catalog-context.js";
import {
  normalizeOrcamentoMoney,
  normalizeOrcamentoQuantity,
  roundOrcamentoNumber,
} from "../lib/orcamento-numbers.js";
import { auditProposalBudget, calculateBudgetItemsTotal } from "../lib/budget-integrity.js";
import { recordIntelligenceEvent } from "../services/customer-intelligence-history.js";
import {
  defaultProposalBuilderTemplate,
  ensureTenantProposalBuilderTemplate,
  normalizeProposalBuilderTemplate,
  type ProposalBuilderTemplate,
} from "../lib/proposal-builder.js";
import { syncDealValueFromProposal } from "../lib/deal-value.js";

const router: IRouter = Router();

function canViewAllProposals(req: Express.Request): boolean {
  return req.user?.platformRole === "super_admin"
    || req.user?.platformRole === "tenant_admin"
    || req.user?.userFunction === "administrador";
}

async function canAccessProposalOwnership(req: Express.Request, proposta: { tenantId: string; leadId: string; dealId?: string | null }): Promise<boolean> {
  if (canViewAllProposals(req)) return true;
  const userId = req.user?.sub;
  if (!userId) return false;

  if (proposta.dealId) {
    const [deal] = await db
      .select({ assignedTo: dealsTable.assignedTo })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, proposta.dealId), eq(dealsTable.tenantId, proposta.tenantId)))
      .limit(1);
    if (deal) return deal.assignedTo === userId;
  }

  const [lead] = await db
    .select({ assignedTo: leadsTable.assignedTo })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, proposta.leadId), eq(leadsTable.tenantId, proposta.tenantId)))
    .limit(1);
  return lead?.assignedTo === userId;
}

type BudgetSnapshotPending = {
  code: string;
  severity: "blocker" | "warning";
  field?: string;
  message: string;
};

function mergeBudgetPresentationSnapshot(
  presentation: any,
  snapshot: Record<string, unknown>,
) {
  return {
    ...(presentation ?? {}),
    sourceSnapshot: snapshot,
  };
}

async function buildBudgetContextSnapshot(input: {
  tenantId: string;
  leadId: string;
  origin: "manual" | "catalog" | "composition" | "revision" | "imported";
  items: PropostaItem[];
  presentation?: any;
  baseBudgetId?: string;
  baseBudgetNumber?: string;
  revisionLabel?: string;
  dealId?: string | null;
}) {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, input.leadId), eq(leadsTable.tenantId, input.tenantId)))
    .limit(1);

  const [deal] = input.dealId
    ? await db
        .select({
          id: dealsTable.id,
          respostasEtapas: dealsTable.respostasEtapas,
          etapa: dealsTable.etapa,
        })
        .from(dealsTable)
        .where(and(
          eq(dealsTable.id, input.dealId),
          eq(dealsTable.tenantId, input.tenantId),
          eq(dealsTable.leadId, input.leadId),
        ))
        .limit(1)
    : await db
        .select({
          id: dealsTable.id,
          respostasEtapas: dealsTable.respostasEtapas,
          etapa: dealsTable.etapa,
        })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, input.tenantId), eq(dealsTable.leadId, input.leadId)))
        .orderBy(desc(dealsTable.updatedAt))
        .limit(1);

  const [briefing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(and(eq(leadBriefingsTable.tenantId, input.tenantId), eq(leadBriefingsTable.leadId, input.leadId)))
    .limit(1);

  const [profile] = await db
    .select({
      nomeFantasia: businessProfilesTable.nomeFantasia,
      razaoSocial: businessProfilesTable.razaoSocial,
      vertical: businessProfilesTable.vertical,
      logoUrl: businessProfilesTable.logoUrl,
      diferenciais: businessProfilesTable.diferenciais,
      publicoAlvo: businessProfilesTable.publicoAlvo,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, input.tenantId))
    .limit(1);

  const pending: BudgetSnapshotPending[] = [];
  if (!lead) pending.push({ code: "CLIENT_MISSING", severity: "blocker", field: "leadId", message: "Cliente não encontrado." });
  if (!profile?.nomeFantasia && !profile?.razaoSocial) {
    pending.push({ code: "COMPANY_NAME_MISSING", severity: "warning", message: "Nome da empresa não está preenchido." });
  }
  if (!input.items.length) {
    pending.push({ code: "NO_ITEMS", severity: "blocker", field: "itens", message: "O orçamento não possui itens." });
  }

  const mediaUrls = Array.from(new Set([
    ...(input.items.flatMap((item: any) => [
      item?.sourceSnapshot?.imagemUrl,
      ...(Array.isArray(item?.sourceSnapshot?.imagens) ? item.sourceSnapshot.imagens : []),
    ])),
    ...Object.values(input.presentation?.imagensEtapas ?? {}),
    input.presentation?.imagemCapa,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)));

  return {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    immutableForVersion: true,
    origin: input.origin,
    ...(input.baseBudgetId ? { baseBudgetId: input.baseBudgetId } : {}),
    ...(input.baseBudgetNumber ? { baseBudgetNumber: input.baseBudgetNumber } : {}),
    ...(input.revisionLabel ? { revisionLabel: input.revisionLabel } : {}),
    client: lead ? {
      id: lead.id,
      nome: lead.nome,
      empresa: lead.empresa,
      email: lead.email,
      telefone: lead.telefone,
      documento: lead.documento,
      objetivo: lead.objetivo,
      mercadoSegmento: lead.mercadoSegmento,
    } : undefined,
    qualification: {
      dealId: deal?.id ?? input.dealId ?? null,
      dealStage: deal?.etapa ?? null,
      stageAnswers: (deal?.respostasEtapas as Record<string, Record<string, string>> | null | undefined)?.qualificado ?? {},
      briefing: briefing ? {
        contactType: briefing.contactType,
        situationAnswers: briefing.situationAnswers ?? [],
        problemAnswers: briefing.problemAnswers ?? [],
        implicationAnswers: briefing.implicationAnswers ?? [],
        implicationEstimatedValue: briefing.implicationEstimatedValue,
        needAnswers: briefing.needAnswers ?? [],
        needThermometer: briefing.needThermometer,
        objections: briefing.objections ?? [],
        prospectSize: briefing.prospectSize,
        nextStepType: briefing.nextStepType,
        nextStepDate: briefing.nextStepDate,
        freeNotes: briefing.freeNotes,
        aiSummary: briefing.aiSummary,
        journeyStage: briefing.journeyStage,
      } : null,
    },
    company: profile ? {
      nomeFantasia: profile.nomeFantasia,
      razaoSocial: profile.razaoSocial,
      vertical: profile.vertical,
      logoUrl: profile.logoUrl,
      diferenciais: profile.diferenciais,
      publicoAlvo: profile.publicoAlvo,
    } : undefined,
    catalogItemIds: Array.from(new Set(input.items.map((item) => item.produtoId).filter((id): id is string => Boolean(id)))),
    compositionIds: Array.from(new Set(input.items.map((item) => item.composicaoId).filter((id): id is string => Boolean(id)))),
    mediaUrls,
    pending,
  };
}

async function enrichBudgetItemsWithCatalogSnapshot(
  tenantId: string,
  items: PropostaItem[],
): Promise<PropostaItem[]> {
  const productIds = Array.from(new Set(items.map((item) => item.produtoId).filter((id): id is string => Boolean(id))));
  const products = productIds.length
    ? await db.select().from(produtosCatalogoTable).where(and(
        eq(produtosCatalogoTable.tenantId, tenantId),
        inArray(produtosCatalogoTable.id, productIds),
      ))
    : [];
  const byId = new Map(products.map((product) => [product.id, product] as const));
  const capturedAt = new Date().toISOString();

  return items.map((item) => {
    if (item.sourceSnapshot) return item;
    if (item.produtoId) {
      const product = byId.get(item.produtoId);
      if (product) {
        return {
          ...item,
          sourceSnapshot: {
            capturedAt,
            sourceType: "catalog_product" as const,
            sourceId: product.id,
            nome: product.nome,
            sku: product.sku ?? undefined,
            descricao: product.descricao ?? undefined,
            unidade: product.unidade ?? undefined,
            marca: product.marca ?? undefined,
            fornecedor: product.fornecedor ?? undefined,
            imagemUrl: product.imagemUrl ?? undefined,
            imagens: product.imagens ?? undefined,
            precoCatalogo: Number(product.precoBase ?? 0),
            precoAplicado: Number(item.valorUnitario ?? 0),
            prazoEntregaDias: product.prazoEntregaDias ?? undefined,
            pricingConfig: (product.pricingConfig ?? undefined) as any,
            deliveryConfig: (product.deliveryConfig ?? undefined) as any,
          },
        };
      }
    }
    if (item.composicaoId) {
      return {
        ...item,
        sourceSnapshot: {
          capturedAt,
          sourceType: "composition" as const,
          sourceId: item.composicaoId,
          nome: item.nome,
          sku: item.sku,
          descricao: item.descricao,
          unidade: item.unidade,
          precoAplicado: Number(item.valorUnitario ?? 0),
        },
      };
    }
    return {
      ...item,
      sourceSnapshot: {
        capturedAt,
        sourceType: "manual" as const,
        nome: item.nome,
        sku: item.sku,
        descricao: item.descricao,
        unidade: item.unidade,
        precoAplicado: Number(item.valorUnitario ?? 0),
      },
    };
  });
}

router.get("/tenants/:tenantId/proposal-builder/templates", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately authorized against the authenticated tenant or Super Admin
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db
    .select({
      discoveryData: businessProfilesTable.discoveryData,
      vertical: businessProfilesTable.vertical,
    })
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);

  const discovery = (profile?.discoveryData ?? {}) as Record<string, unknown>;
  const templates = Array.isArray(discovery.proposalBuilderTemplates)
    ? discovery.proposalBuilderTemplates
    : [];

  res.json({
    templates,
    activeTemplateId:
      typeof discovery.activeProposalBuilderTemplateId === "string"
        ? discovery.activeProposalBuilderTemplateId
        : null,
    suggestedDefault: defaultProposalBuilderTemplate(profile?.vertical),
  });
});

router.post("/tenants/:tenantId/proposal-builder/templates/ai-bootstrap", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately authorized against the authenticated tenant or Super Admin
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  try {
    const result = await ensureTenantProposalBuilderTemplate({
      tenantId,
      forceNewVersion: true,
      customInstruction: typeof req.body?.instruction === "string" ? req.body.instruction : undefined,
      log: req.log,
    });
    res.status(201).json({
      template: result.template,
      templates: result.templates,
      activeTemplateId: result.activeTemplateId,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Business profile not found") {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.put("/tenants/:tenantId/proposal-builder/templates/:templateId", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately authorized against the authenticated tenant or Super Admin
  const tenantId = String(req.params.tenantId);
  const templateId = String(req.params.templateId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  const discovery = (profile.discoveryData ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(discovery.proposalBuilderTemplates)
    ? discovery.proposalBuilderTemplates
    : [];
  const index = existing.findIndex((item) =>
    item && typeof item === "object" && String((item as Record<string, unknown>).id) === templateId
  );
  if (index < 0) {
    res.status(404).json({ error: "Proposal builder template not found" });
    return;
  }

  const fallback = defaultProposalBuilderTemplate(profile.vertical);
  const current = existing[index] as Record<string, unknown>;
  const normalized = normalizeProposalBuilderTemplate({ ...current, ...req.body, createdBy: "manual" }, fallback);
  const updated: ProposalBuilderTemplate = {
    ...normalized,
    id: templateId,
    createdAt: typeof current.createdAt === "string" ? current.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const nextTemplates = existing.map((item, itemIndex) => {
    if (itemIndex === index) return updated;
    if (updated.isDefault && item && typeof item === "object") {
      return { ...(item as Record<string, unknown>), isDefault: false };
    }
    return item;
  });

  await db
    .update(businessProfilesTable)
    .set({
      discoveryData: {
        ...discovery,
        proposalBuilderTemplates: nextTemplates,
        activeProposalBuilderTemplateId: updated.isDefault
          ? updated.id
          : discovery.activeProposalBuilderTemplateId,
      },
      updatedAt: new Date(),
    })
    .where(eq(businessProfilesTable.tenantId, tenantId));

  res.json({ template: updated, templates: nextTemplates });
});



router.post("/tenants/:tenantId/proposal-builder/templates/:templateId/duplicate", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const templateId = String(req.params.templateId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db.select().from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  const discovery = (profile.discoveryData ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(discovery.proposalBuilderTemplates)
    ? discovery.proposalBuilderTemplates as ProposalBuilderTemplate[]
    : [];
  const current = existing.find((item) => item?.id === templateId);
  if (!current) {
    res.status(404).json({ error: "Proposal builder template not found" });
    return;
  }

  const now = new Date().toISOString();
  const requestedName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const copy: ProposalBuilderTemplate = {
    ...current,
    id: crypto.randomUUID(),
    name: requestedName || `${current.name} · Cópia`,
    isDefault: false,
    createdBy: "manual",
    createdAt: now,
    updatedAt: now,
    modules: current.modules.map((module) => ({
      ...module,
      image: module.image ? { ...module.image } : undefined,
    })),
    visualStyle: { ...(current.visualStyle ?? {}) },
    aiRules: {
      ...(current.aiRules ?? {}),
      imageRules: [...(current.aiRules?.imageRules ?? [])],
      contentRules: [...(current.aiRules?.contentRules ?? [])],
      avoid: [...(current.aiRules?.avoid ?? [])],
    },
  };

  const nextTemplates = [...existing, copy];
  await db.update(businessProfilesTable).set({
    discoveryData: { ...discovery, proposalBuilderTemplates: nextTemplates },
    updatedAt: new Date(),
  }).where(eq(businessProfilesTable.tenantId, tenantId));

  res.status(201).json({ template: copy, templates: nextTemplates });
});

router.post("/tenants/:tenantId/proposal-builder/templates/:templateId/set-default", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const templateId = String(req.params.templateId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db.select().from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  const discovery = (profile.discoveryData ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(discovery.proposalBuilderTemplates)
    ? discovery.proposalBuilderTemplates as ProposalBuilderTemplate[]
    : [];
  if (!existing.some((item) => item?.id === templateId)) {
    res.status(404).json({ error: "Proposal builder template not found" });
    return;
  }

  const nextTemplates = existing.map((item) => ({
    ...item,
    isDefault: item.id === templateId,
    updatedAt: item.id === templateId ? new Date().toISOString() : item.updatedAt,
  }));

  await db.update(businessProfilesTable).set({
    discoveryData: {
      ...discovery,
      proposalBuilderTemplates: nextTemplates,
      activeProposalBuilderTemplateId: templateId,
    },
    updatedAt: new Date(),
  }).where(eq(businessProfilesTable.tenantId, tenantId));

  res.json({
    template: nextTemplates.find((item) => item.id === templateId),
    templates: nextTemplates,
    activeTemplateId: templateId,
  });
});

router.post("/tenants/:tenantId/proposal-builder/templates/:templateId/modules/:moduleKey/develop", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately authorized against the authenticated tenant or Super Admin
  const tenantId = String(req.params.tenantId);
  const templateId = String(req.params.templateId);
  const moduleKey = String(req.params.moduleKey);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db.select().from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  const discovery = (profile.discoveryData ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(discovery.proposalBuilderTemplates)
    ? discovery.proposalBuilderTemplates as ProposalBuilderTemplate[]
    : [];
  const template = existing.find((item) => item?.id === templateId);
  if (!template) {
    res.status(404).json({ error: "Proposal builder template not found" });
    return;
  }
  const module = template.modules.find((item) => item.key === moduleKey);
  if (!module) {
    res.status(404).json({ error: "Proposal builder module not found" });
    return;
  }

  const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  const styleHint = typeof req.body?.styleHint === "string" ? req.body.styleHint.trim() : "";
  const company = profile.nomeFantasia || profile.razaoSocial || "empresa";
  const aiRules = template.aiRules ?? {};

  try {
    const result = await gatewayCallOpenAI(
      tenantId,
      "proposal_generator",
      [
        {
          role: "system",
          content: [
            "Você é diretor de conteúdo e design de propostas comerciais premium.",
            "Desenvolva SOMENTE uma página reutilizável do modelo de proposta da empresa, sem inventar dados de cliente, preços, prazos ou escopo.",
            "O conteúdo deve parecer pronto para apresentação comercial, com texto claro, profissional e visualmente enxuto.",
            "Retorne APENAS JSON válido neste formato:",
            '{"title":"...","description":"...","contentPrompt":"...","imagePrompt":"..."}',
            "title: título curto da página.",
            "description: subtítulo/linha de apoio de até 140 caracteres.",
            "contentPrompt: conteúdo final da página em português, pronto para exibição, com 1 a 3 parágrafos curtos ou uma pequena lista quando fizer sentido.",
            "imagePrompt: orientação visual objetiva para uma imagem coerente com a página, sem textos ou marcas d'água.",
            aiRules.tone ? `Tom: ${aiRules.tone}` : "",
            aiRules.technicalLevel ? `Nível técnico: ${aiRules.technicalLevel}` : "",
            ...(aiRules.contentRules ?? []).map((rule) => `Regra de conteúdo: ${rule}`),
            ...(aiRules.avoid ?? []).map((rule) => `Evitar: ${rule}`),
          ].filter(Boolean).join("\n"),
        },
        {
          role: "user",
          content: [
            `Empresa: ${company}`,
            `Segmento: ${profile.vertical || "não informado"}`,
            `Página: ${module.title || module.key}`,
            module.description ? `Descrição atual: ${module.description}` : "",
            module.contentPrompt ? `Conteúdo atual: ${module.contentPrompt}` : "",
            styleHint ? `Direção visual: ${styleHint}` : "",
            instruction ? `Pedido do usuário: ${instruction}` : "Desenvolva a melhor versão desta página.",
          ].filter(Boolean).join("\n"),
        },
      ],
      {
        model: "gpt-4o-mini",
        responseFormat: { type: "json_object" },
        maxTokens: 900,
        temperature: 0.65,
        log: req.log,
      },
    );

    const raw = JSON.parse(result.content || "{}") as Record<string, unknown>;
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : module.title;
    const description = typeof raw.description === "string" ? raw.description.trim() : module.description;
    const contentPrompt = typeof raw.contentPrompt === "string" ? raw.contentPrompt.trim() : module.contentPrompt;
    const imagePrompt = typeof raw.imagePrompt === "string" ? raw.imagePrompt.trim() : module.image?.prompt;

    res.json({
      module: {
        ...module,
        title,
        description,
        contentPrompt,
        image: {
          ...(module.image ?? { mode: "automatic", aspectRatio: "16:9" }),
          prompt: imagePrompt,
        },
      },
    });
  } catch (err) {
    req.log.error({ err, tenantId, templateId, moduleKey }, "proposal-builder: develop page failed");
    res.status(500).json({ error: "Não foi possível desenvolver esta página com IA." });
  }
});

router.post("/tenants/:tenantId/proposal-builder/templates/:templateId/modules/:moduleKey/generate-image", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant or Super Admin before tenant-scoped reads/writes
  const tenantId = String(req.params.tenantId);
  const templateId = String(req.params.templateId);
  const moduleKey = String(req.params.moduleKey);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [profile] = await db.select().from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  const discovery = (profile.discoveryData ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(discovery.proposalBuilderTemplates)
    ? discovery.proposalBuilderTemplates as ProposalBuilderTemplate[]
    : [];
  const template = existing.find((item) => item?.id === templateId);
  if (!template) {
    res.status(404).json({ error: "Proposal builder template not found" });
    return;
  }
  const module = template.modules.find((item) => item.key === moduleKey);
  if (!module) {
    res.status(404).json({ error: "Proposal builder module not found" });
    return;
  }

  const customPrompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const company = profile.nomeFantasia || profile.razaoSocial || "empresa";
  const prompt = [
    "Crie uma imagem editorial premium para um BLOCO DE MODELO DE PROPOSTA COMERCIAL reutilizável.",
    `Empresa: ${company}.`,
    `Segmento: ${profile.vertical || "não informado"}.`,
    `Bloco: ${module.title || module.key}.`,
    module.description ? `Objetivo do bloco: ${module.description}.` : "",
    customPrompt || module.image?.prompt || "",
    ...(template.aiRules?.imageRules ?? []),
    "A imagem NÃO deve conter nome de cliente, preço, endereço, número de orçamento ou dados de uma proposta específica.",
    "Sem textos, logotipos inventados, marcas d'água ou elementos deformados.",
    "Fotorealismo e qualidade comercial profissional.",
  ].filter(Boolean).join("\n");

  try {
    const { urls } = await generateImage(tenantId, "image_generator", prompt, {
      model: "gpt-image-1",
      size: "1536x1024",
      n: 1,
      log: req.log,
      requestId: `proposal-template:${templateId}:${moduleKey}:${crypto.randomUUID()}`,
    });
    const sourceUrl = urls[0];
    if (!sourceUrl) throw new Error("IA não retornou imagem");
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Falha ao baixar imagem gerada (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? "image/png";
    const captured = await captureGeneratedMedia({
      tenantId,
      userId: req.user?.sub ?? null,
      title: `Proposta — ${module.title || module.key}`,
      operation: "proposal_template_image",
      buffer,
      mimeType,
      type: "image",
      originalFilename: `proposal-template-${templateId}-${moduleKey}.png`,
      kind: "mixed",
      metadata: {
        module: "propostas",
        templateId,
        moduleKey,
        prompt,
        generatedByAi: true,
      },
    });
    const imageUrl = `/api/storage/objects${captured.storageUrl.replace(/^\/objects/, "")}`;

    const nextTemplates = existing.map((item) => item.id !== templateId
      ? item
      : {
          ...item,
          modules: item.modules.map((candidate) => candidate.key !== moduleKey
            ? candidate
            : {
                ...candidate,
                image: {
                  ...(candidate.image ?? { mode: "ai" }),
                  mode: "ai" as const,
                  url: imageUrl,
                  prompt: customPrompt || candidate.image?.prompt,
                  aspectRatio: candidate.image?.aspectRatio ?? "16:9",
                },
              }),
          updatedAt: new Date().toISOString(),
        });

    await db.update(businessProfilesTable).set({
      discoveryData: { ...discovery, proposalBuilderTemplates: nextTemplates },
      updatedAt: new Date(),
    }).where(eq(businessProfilesTable.tenantId, tenantId));

    res.json({ imageUrl, mediaAssetId: captured.assetId, templates: nextTemplates });
  } catch (err) {
    req.log.warn({ err, tenantId, templateId, moduleKey }, "proposal template module image generation failed");
    res.status(502).json({ error: err instanceof Error ? err.message : "Falha ao gerar imagem do bloco" });
  }
});

// ── Proposal number generation ────────────────────────────────────────────────
function normalizarItensExecucao(itens: PropostaItem[]): PropostaItem[] {
  return itens.map((item, index) => ({
    ...item,
    quantidade: normalizeOrcamentoQuantity(item.quantidade),
    valorUnitario: normalizeOrcamentoMoney(item.valorUnitario),
    ordemExecucao: item.ordemExecucao ?? index + 1,
    statusExecucao: item.statusExecucao ?? "pendente",
  }));
}

function normalizarComposicoesPagamento(
  composicoes: Array<{ forma: string; valor: string | number; comprovanteUrl?: string | null }> | undefined,
) {
  return composicoes?.map((item) => ({
    ...item,
    valor: roundOrcamentoNumber(item.valor).toFixed(2),
  }));
}

async function generateNumero(tenantId: string): Promise<string> {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const datePart =
    String(now.getFullYear()) +
    pad2(now.getMonth() + 1) +
    pad2(now.getDate());
  const timePart = pad2(now.getHours()) + pad2(now.getMinutes());
  const prefix = `ORC-${datePart}-${timePart}`;

  // Count proposals created today for this tenant to get sequence number
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(propostasTable)
    .where(
      and(
        eq(propostasTable.tenantId, tenantId),
        sql`${propostasTable.createdAt} >= ${startOfDay}`
      )
    );
  const seq = ((result[0]?.count ?? 0) + 1).toString().padStart(3, "0");
  return `${prefix}-${seq}`;
}

router.post("/propostas", async (req, res) => {
  const parsed = insertPropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const numero = await generateNumero(parsed.data.tenantId);

  const itensNormalizadosBase = normalizarItensExecucao((parsed.data.itens ?? []) as PropostaItem[]);
  const itensNormalizados = await enrichBudgetItemsWithCatalogSnapshot(parsed.data.tenantId, itensNormalizadosBase);
  const calculatedItemsTotal = itensNormalizados.length ? calculateBudgetItemsTotal(itensNormalizados) : null;
  const sourceSnapshot = await buildBudgetContextSnapshot({
    tenantId: parsed.data.tenantId,
    leadId: parsed.data.leadId,
    origin: parsed.data.arquivoImportadoUrl ? "imported" : "manual",
    items: itensNormalizados,
    presentation: parsed.data.apresentacao,
    dealId: parsed.data.dealId ?? null,
  });

  const [proposta] = await db
    .insert(propostasTable)
    .values({
      ...parsed.data,
      itens: itensNormalizados,
      apresentacao: mergeBudgetPresentationSnapshot(parsed.data.apresentacao, sourceSnapshot),
      ...(parsed.data.arquivoImportadoUrl && parsed.data.valorTotal !== undefined && parsed.data.valorTotal !== null
        ? { valorTotal: roundOrcamentoNumber(parsed.data.valorTotal).toFixed(2) }
        : calculatedItemsTotal !== null
          ? { valorTotal: calculatedItemsTotal.toFixed(2) }
          : parsed.data.valorTotal !== undefined && parsed.data.valorTotal !== null
            ? { valorTotal: roundOrcamentoNumber(parsed.data.valorTotal).toFixed(2) }
            : {}),
      ...(parsed.data.valorMensal !== undefined && parsed.data.valorMensal !== null
        ? { valorMensal: roundOrcamentoNumber(parsed.data.valorMensal).toFixed(2) }
        : {}),
      ...(parsed.data.paymentCompositions
        ? { paymentCompositions: normalizarComposicoesPagamento(parsed.data.paymentCompositions) }
        : {}),
      numero,
    })
    .returning();

  await syncDealValueFromProposal({
    dealId: proposta.dealId,
    tenantId: proposta.tenantId,
    valorTotal: proposta.valorTotal,
  });

  void recordIntelligenceEvent({
    tenantId: proposta.tenantId,
    leadId: proposta.leadId,
    eventType: "proposal_created",
    title: `Orçamento/proposta criado: ${proposta.titulo}`,
    summary: proposta.numero ? `Número ${proposta.numero} · status ${proposta.status}` : `Status ${proposta.status}`,
    sourceModule: "propostas",
    sourceId: proposta.id,
    metadata: {
      numero: proposta.numero ?? null,
      status: proposta.status,
      valorTotal: proposta.valorTotal ?? null,
      recorrente: proposta.recorrente ?? false,
      dealId: proposta.dealId ?? null,
    },
    log: req.log,
  });

  res.status(201).json(proposta);
});

router.post("/tenants/:tenantId/leads/:leadId/propostas/reconcile", async (req, res) => {
  // tenant-audit: reviewed tenant is explicitly authorized below and every lookup is tenant-scoped
  const tenantId = String(req.params.tenantId);
  const leadId = String(req.params.leadId);
  const dealId = typeof req.body?.dealId === "string" && req.body.dealId.trim()
    ? req.body.dealId.trim()
    : null;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [lead] = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      telefone: leadsTable.telefone,
      email: leadsTable.email,
      documento: leadsTable.documento,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  // A ligação pelo deal é a evidência mais forte: se o orçamento já aponta
  // para o negócio atual, apenas corrige o lead legado/duplicado.
  if (dealId) {
    const [deal] = await db
      .select({ id: dealsTable.id, leadId: dealsTable.leadId })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)))
      .limit(1);

    if (!deal) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    if (deal.leadId && deal.leadId !== leadId) {
      res.status(409).json({ error: "Deal does not belong to this lead" });
      return;
    }

    const [proposalByDeal] = await db
      .select()
      .from(propostasTable)
      .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.dealId, dealId)))
      .orderBy(desc(propostasTable.createdAt))
      .limit(1);

    if (proposalByDeal) {
      if (proposalByDeal.leadId === leadId) {
        res.json({ proposal: proposalByDeal, relinked: false, source: "deal" });
        return;
      }

      const [relinked] = await db
        .update(propostasTable)
        .set({ leadId, updatedAt: new Date() })
        .where(and(
          eq(propostasTable.id, proposalByDeal.id),
          eq(propostasTable.tenantId, tenantId),
        ))
        .returning();

      res.json({ proposal: relinked ?? proposalByDeal, relinked: true, source: "deal" });
      return;
    }
  }

  // Se já existe orçamento diretamente no lead, não cria nem duplica nada.
  const [proposalByLead] = await db
    .select()
    .from(propostasTable)
    .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, leadId)))
    .orderBy(desc(propostasTable.createdAt))
    .limit(1);

  if (proposalByLead) {
    res.json({ proposal: proposalByLead, relinked: false, source: "lead" });
    return;
  }

  // Alguns registros antigos ficaram ligados a um lead duplicado. Só fazemos
  // a reconciliação quando há identidade forte (documento, e-mail ou telefone)
  // e todos os orçamentos encontrados pertencem a um único lead de origem.
  const normalizedName = String(lead.nome ?? "").trim().toLowerCase();
  const normalizedEmail = String(lead.email ?? "").trim().toLowerCase();
  const normalizedPhone = String(lead.telefone ?? "").replace(/\D/g, "");
  const normalizedDocument = String(lead.documento ?? "").replace(/\D/g, "");

  const phoneAndNameMatch = normalizedPhone.length >= 8 && normalizedName
    ? and(
        sql`regexp_replace(coalesce(${leadsTable.telefone}, ''), '[^0-9]', '', 'g') = ${normalizedPhone}`,
        sql`lower(trim(${leadsTable.nome})) = ${normalizedName}`,
      )
    : undefined;

  const identityMatch = or(
    normalizedEmail
      ? sql`lower(trim(coalesce(${leadsTable.email}, ''))) = ${normalizedEmail}`
      : undefined,
    normalizedDocument.length >= 6
      ? sql`regexp_replace(coalesce(${leadsTable.documento}, ''), '[^0-9]', '', 'g') = ${normalizedDocument}`
      : undefined,
    phoneAndNameMatch,
  );

  if (!identityMatch) {
    res.json({ proposal: null, relinked: false, source: "none" });
    return;
  }

  const identityLeads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), identityMatch))
    .limit(25);

  const duplicateLeadIds = identityLeads
    .map((row) => row.id)
    .filter((candidateId) => candidateId !== leadId);

  if (duplicateLeadIds.length === 0) {
    res.json({ proposal: null, relinked: false, source: "none" });
    return;
  }

  const candidateProposals = await db
    .select()
    .from(propostasTable)
    .where(and(
      eq(propostasTable.tenantId, tenantId),
      inArray(propostasTable.leadId, duplicateLeadIds),
    ))
    .orderBy(desc(propostasTable.createdAt));

  if (candidateProposals.length === 0) {
    res.json({ proposal: null, relinked: false, source: "none" });
    return;
  }

  const sourceLeadIds = Array.from(new Set(candidateProposals.map((proposal) => proposal.leadId)));
  if (sourceLeadIds.length !== 1) {
    res.json({ proposal: null, relinked: false, source: "ambiguous" });
    return;
  }

  const sourceLeadId = sourceLeadIds[0];
  await db
    .update(propostasTable)
    .set({ leadId, updatedAt: new Date() })
    .where(and(
      eq(propostasTable.tenantId, tenantId),
      eq(propostasTable.leadId, sourceLeadId),
    ));

  const [relinkedProposal] = await db
    .select()
    .from(propostasTable)
    .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.leadId, leadId)))
    .orderBy(desc(propostasTable.createdAt))
    .limit(1);

  res.json({
    proposal: relinkedProposal ?? null,
    relinked: Boolean(relinkedProposal),
    source: relinkedProposal ? "identity" : "none",
  });
});

router.get("/tenants/:tenantId/propostas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { leadId, dealId } = req.query as Record<string, string | undefined>;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [eq(propostasTable.tenantId, tenantId)];
  if (leadId) conditions.push(eq(propostasTable.leadId, leadId));
  if (dealId) conditions.push(eq(propostasTable.dealId, dealId));

  const propostas = await db
    .select()
    .from(propostasTable)
    .where(and(...conditions))
    .orderBy(propostasTable.createdAt);

  // GET é somente leitura. Reconciliação de dados legados acontece no endpoint
  // explícito /propostas/reconcile e nunca cria um orçamento novo.
  if (canViewAllProposals(req)) {
    res.json(propostas);
    return;
  }

  const visible = [];
  for (const proposta of propostas) {
    if (await canAccessProposalOwnership(req, proposta)) visible.push(proposta);
  }
  res.json(visible);
});

router.get("/propostas/:id", async (req, res) => {
  let [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessProposalOwnership(req, proposta))) {
    res.status(403).json({ error: "Access denied to this proposal" });
    return;
  }

  // Orçamentos recuperados anteriormente podiam existir sem itens e até com
  // valorTotal zerado, enquanto o negócio na pipeline já possuía valor. Repara
  // os dois lados usando o valor atual do deal sem criar outro orçamento.
  const itensAtuais = (proposta.itens ?? []) as PropostaItem[];
  if (
    itensAtuais.length === 0
    && proposta.dealId
    && proposta.autoGenerated
  ) {
    const [dealAtual] = await db
      .select({ valor: dealsTable.valor })
      .from(dealsTable)
      .where(and(
        eq(dealsTable.id, proposta.dealId),
        eq(dealsTable.tenantId, proposta.tenantId),
      ))
      .limit(1);

    const valorProposta = Number(proposta.valorTotal ?? 0);
    const valorDeal = Number(dealAtual?.valor ?? 0);
    const valor = valorProposta > 0 ? valorProposta : valorDeal;

    if (Number.isFinite(valor) && valor > 0) {
      const [repaired] = await db
        .update(propostasTable)
        .set({
          itens: [{
            nome: "Valor comercial do negócio",
            descricao: "Valor recuperado da oportunidade comercial na pipeline.",
            quantidade: 1,
            valorUnitario: valor,
            unidade: "un",
            ordemExecucao: 1,
            statusExecucao: "pendente",
          }],
          valorTotal: valor.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(propostasTable.id, proposta.id))
        .returning();
      if (repaired) proposta = repaired;
    }
  }

  void recordIntelligenceEvent({
    tenantId: proposta.tenantId,
    leadId: proposta.leadId,
    eventType: parsed.data.status && parsed.data.status !== existing.status ? "proposal_status_changed" : "proposal_updated",
    title: parsed.data.status && parsed.data.status !== existing.status
      ? `Proposta ${proposta.numero ?? proposta.titulo}: ${existing.status} → ${proposta.status}`
      : `Proposta atualizada: ${proposta.titulo}`,
    summary: proposta.observacoes?.slice(0, 500) ?? null,
    sourceModule: "propostas",
    sourceId: proposta.id,
    metadata: {
      previousStatus: existing.status,
      status: proposta.status,
      valorTotal: proposta.valorTotal ?? null,
      dealId: proposta.dealId ?? null,
    },
    log: req.log,
  });

  res.json(proposta);
});



const integrityPreviewBodySchema = z.object({
  tenantId: z.string().min(1),
  itens: z.array(z.any()).default([]),
  valorTotal: z.union([z.string(), z.number()]).optional().nullable(),
  validadeAte: z.string().optional().nullable(),
  prazoEntrega: z.string().optional().nullable(),
  apresentacao: z.any().optional().nullable(),
});

router.post("/propostas/integrity/preview", async (req, res) => {
  const parsed = integrityPreviewBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(auditProposalBudget({
    itens: parsed.data.itens as PropostaItem[],
    valorTotal: parsed.data.valorTotal,
    validadeAte: parsed.data.validadeAte,
    prazoEntrega: parsed.data.prazoEntrega,
    apresentacao: parsed.data.apresentacao,
  }));
});

router.get("/propostas/:id/integrity", async (req, res) => {
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)))
    .limit(1);

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(auditProposalBudget({
    itens: (proposta.itens ?? []) as PropostaItem[],
    valorTotal: proposta.valorTotal,
    validadeAte: proposta.validadeAte,
    prazoEntrega: proposta.prazoEntrega,
    apresentacao: proposta.apresentacao,
  }));
});

router.get("/propostas/:id/sources", async (req, res) => {
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)))
    .limit(1);

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }
  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const presentation = (proposta.apresentacao ?? {}) as any;
  res.json({
    budgetId: proposta.id,
    numero: proposta.numero,
    status: proposta.status,
    sourceSnapshot: presentation.sourceSnapshot ?? null,
    items: ((proposta.itens ?? []) as PropostaItem[]).map((item, index) => ({
      index,
      nome: item.nome,
      produtoId: item.produtoId ?? null,
      composicaoId: item.composicaoId ?? null,
      sourceSnapshot: (item as any).sourceSnapshot ?? null,
    })),
    integrity: auditProposalBudget({
      itens: (proposta.itens ?? []) as PropostaItem[],
      valorTotal: proposta.valorTotal,
      validadeAte: proposta.validadeAte,
      prazoEntrega: proposta.prazoEntrega,
      apresentacao: proposta.apresentacao,
    }),
  });
});

// ── GET /propostas/:id/pdf — capa + tabela A4 ─────────────────────────────
router.get("/propostas/:id/pdf", async (req, res) => {
  const propostaId = String(req.params.id);
  try {
    const [proposta] = await db.select().from(propostasTable).where(eq(propostasTable.id, propostaId));
    if (!proposta) {
      res.status(404).json({ error: "Proposta not found" });
      return;
    }
    if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    let profile: any = null;
    try {
      const rows = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, proposta.tenantId)).limit(1);
      profile = rows[0] ?? null;
    } catch (error) {
      logger.warn({ err: error, propostaId }, "propostas: profile unavailable while generating PDF");
    }

    let catalogItems: any[] = [];
    try {
      catalogItems = await db
        .select({
          nome: produtosCatalogoTable.nome,
          descricao: produtosCatalogoTable.descricao,
          categoria: categoriasProdutoTable.nome,
          precoBase: produtosCatalogoTable.precoBase,
          unidade: produtosCatalogoTable.unidade,
          imagemUrl: produtosCatalogoTable.imagemUrl,
        })
        .from(produtosCatalogoTable)
        .leftJoin(categoriasProdutoTable, eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id))
        .where(and(eq(produtosCatalogoTable.tenantId, proposta.tenantId), eq(produtosCatalogoTable.ativo, true)))
        .limit(6);
    } catch (error) {
      logger.warn({ err: error, propostaId }, "propostas: catalog unavailable while generating PDF");
    }

    let lead: any = null;
    if (proposta.leadId) {
      try {
        const rows = await db
          .select({ nome: leadsTable.nome, empresa: leadsTable.empresa, telefone: leadsTable.telefone, email: leadsTable.email })
          .from(leadsTable)
          .where(eq(leadsTable.id, proposta.leadId))
          .limit(1);
        lead = rows[0] ?? null;
      } catch (error) {
        logger.warn({ err: error, propostaId }, "propostas: lead unavailable while generating PDF");
      }
    }

    const port = process.env.PORT ?? "5000";
    const basePath = process.env.BASE_PATH ?? "";
    const resolveUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      if (url.startsWith("/objects/")) return `http://localhost:${port}${basePath}/api/storage${url}`;
      if (url.startsWith("/api/storage/")) return `http://localhost:${port}${basePath}${url}`;
      return url;
    };

    const profileResolved = profile ? { ...profile, logoUrl: resolveUrl(profile.logoUrl) } : null;
    const presentationResolved = proposta.apresentacao
      ? {
          ...proposta.apresentacao,
          imagensEtapas: Object.fromEntries(
            Object.entries(proposta.apresentacao.imagensEtapas ?? {}).map(([stageId, imageUrl]) => [
              stageId,
              typeof imageUrl === "string" ? resolveUrl(imageUrl) ?? imageUrl : imageUrl,
            ]),
          ),
        }
      : proposta.apresentacao;

    const html = renderOrcamentoPdf({
      proposta: {
        ...proposta,
        apresentacao: presentationResolved,
        itens: (proposta.itens ?? []) as Array<{ nome: string; quantidade: number; valorUnitario: number; sku?: string | null; descricao?: string | null }>,
      },
      profile: profileResolved,
      catalogItems,
      lead,
    });

    const pdfBuffer = await generateProposalPDF(html);
    const isPdf = pdfBuffer.length >= 4 && pdfBuffer[0] === 0x25 && pdfBuffer[1] === 0x50;
    if (!isPdf) {
      logger.error({ propostaId }, "propostas: PDF generator returned non-PDF payload");
      res.status(503).json({ error: "O gerador de PDF está temporariamente indisponível. Tente novamente em instantes.", code: "PDF_GENERATION_UNAVAILABLE" });
      return;
    }

    const safe = (proposta.numero ?? proposta.id.slice(-8)).replace(/[^a-zA-Z0-9\-_]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Orcamento_${safe}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    logger.error({ err: error, propostaId }, "propostas: failed to generate PDF");
    res.status(500).json({ error: "Não foi possível gerar o PDF do orçamento." });
  }
});

router.patch("/propostas/:id", async (req, res) => {
  const parsed = updatePropostaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: propostasTable.id, tenantId: propostasTable.tenantId, status: propostasTable.status })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessProposalOwnership(req, existing))) {
    res.status(403).json({ error: "Access denied to this proposal" });
    return;
  }

  const commercialFields = [
    "itens", "valorTotal", "validadeAte", "formaPagamento", "condPagamento",
    "prazoEntrega", "paymentCompositions", "apresentacao", "observacoes",
  ] as const;
  const touchesCommercialCore = commercialFields.some((field) => Object.prototype.hasOwnProperty.call(parsed.data, field));
  if (existing.status !== "rascunho" && touchesCommercialCore) {
    res.status(409).json({
      error: "Este orçamento já foi emitido e está congelado. Crie uma revisão (R1, R2...) para alterar dados comerciais.",
      code: "BUDGET_VERSION_IMMUTABLE",
      currentStatus: existing.status,
    });
    return;
  }

  const normalizedItemsBase = parsed.data.itens
    ? normalizarItensExecucao(parsed.data.itens as PropostaItem[])
    : null;
  const normalizedItems = normalizedItemsBase
    ? await enrichBudgetItemsWithCatalogSnapshot(existing.tenantId, normalizedItemsBase)
    : null;
  const calculatedUpdateTotal = normalizedItems ? calculateBudgetItemsTotal(normalizedItems) : null;
  const normalizedUpdate = {
    ...parsed.data,
    ...(normalizedItems ? { itens: normalizedItems } : {}),
    ...(calculatedUpdateTotal !== null
      ? { valorTotal: calculatedUpdateTotal.toFixed(2) }
      : parsed.data.valorTotal !== undefined && parsed.data.valorTotal !== null
        ? { valorTotal: roundOrcamentoNumber(parsed.data.valorTotal).toFixed(2) }
        : {}),
    ...(parsed.data.valorMensal !== undefined && parsed.data.valorMensal !== null
      ? { valorMensal: roundOrcamentoNumber(parsed.data.valorMensal).toFixed(2) }
      : {}),
    ...(parsed.data.paymentCompositions
      ? { paymentCompositions: normalizarComposicoesPagamento(parsed.data.paymentCompositions) }
      : {}),
  };

  const [proposta] = await db
    .update(propostasTable)
    .set({ ...normalizedUpdate, updatedAt: new Date() })
    .where(eq(propostasTable.id, existing.id))
    .returning();

  if (proposta?.dealId && normalizedUpdate.valorTotal !== undefined && normalizedUpdate.valorTotal !== null) {
    await db
      .update(dealsTable)
      .set({ valor: String(normalizedUpdate.valorTotal), updatedAt: new Date() })
      .where(and(
        eq(dealsTable.id, proposta.dealId),
        eq(dealsTable.tenantId, proposta.tenantId),
      ));
  }

  res.json(proposta);
});

const propostaItemExecucaoBodySchema = z.object({
  status: z.enum(["em_execucao", "concluida"]),
});

router.patch("/propostas/:id/execucao/:itemIndex", async (req, res) => {
  const parsed = propostaItemExecucaoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const itemIndex = Number.parseInt(String(req.params.itemIndex), 10);
  if (!Number.isInteger(itemIndex) || itemIndex < 0) {
    res.status(422).json({ error: "itemIndex inválido" });
    return;
  }

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessProposalOwnership(req, proposta))) {
    res.status(403).json({ error: "Access denied to this proposal" });
    return;
  }

  if (proposta.status !== "aceita") {
    res.status(422).json({ error: "A execução só pode avançar depois que o orçamento estiver vendido/aceito." });
    return;
  }

  const itens = normalizarItensExecucao((proposta.itens ?? []) as PropostaItem[]);
  if (itemIndex >= itens.length) {
    res.status(404).json({ error: "Item do orçamento não encontrado." });
    return;
  }

  const pendentes = itens
    .map((item, index) => ({
      item,
      index,
      etapaOrdem: item.etapaOrdem ?? item.ordemExecucao ?? index + 1,
      etapaNome: item.etapaNome ?? item.nome,
    }))
    .filter(({ item }) => item.statusExecucao !== "concluida");

  if (pendentes.length === 0) {
    res.status(422).json({ error: "Todas as etapas deste orçamento já foram concluídas." });
    return;
  }

  const etapaAtualOrdem = Math.min(...pendentes.map((entry) => entry.etapaOrdem));
  const etapaAtual = pendentes.find((entry) => entry.etapaOrdem === etapaAtualOrdem)!;
  const itemAlvo = itens[itemIndex];
  const itemEtapaOrdem = itemAlvo.etapaOrdem ?? itemAlvo.ordemExecucao ?? itemIndex + 1;

  // Vários produtos/composições podem ser executados dentro da mesma etapa.
  // A próxima etapa só é liberada quando todos os itens da etapa atual terminarem.
  if (itemEtapaOrdem !== etapaAtualOrdem) {
    res.status(409).json({
      error: `Conclua primeiro a etapa ${etapaAtualOrdem}: ${etapaAtual.etapaNome}.`,
    });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const itensAtualizados = itens.map((item, index) => {
    if (index !== itemIndex) return item;

    if (parsed.data.status === "em_execucao") {
      return {
        ...item,
        statusExecucao: "em_execucao" as const,
        iniciadoEm: item.iniciadoEm ?? nowIso,
      };
    }

    return {
      ...item,
      statusExecucao: "concluida" as const,
      iniciadoEm: item.iniciadoEm ?? nowIso,
      executadoEm: nowIso,
    };
  });

  const [updated] = await db
    .update(propostasTable)
    .set({ itens: itensAtualizados, updatedAt: now })
    .where(eq(propostasTable.id, proposta.id))
    .returning();

  const restantes = itensAtualizados.filter((item) => item.statusExecucao !== "concluida");
  const concluidas = itensAtualizados.length - restantes.length;

  if (proposta.dealId) {
    const targetEtapa = restantes.length === 0 ? "entregue" : "em_execucao";
    await db
      .update(dealsTable)
      .set({
        etapa: targetEtapa as typeof dealsTable.$inferSelect.etapa,
        updatedAt: now,
      })
      .where(eq(dealsTable.id, proposta.dealId));
  }

  res.json({
    proposta: updated,
    execucao: {
      concluidas,
      restantes: restantes.length,
      finalizada: restantes.length === 0,
      proximaOrdem: restantes.length
        ? Math.min(...restantes.map((item, index) => item.ordemExecucao ?? index + 1))
        : null,
      proximaEtapaOrdem: restantes.length
        ? Math.min(...restantes.map((item, index) => item.etapaOrdem ?? item.ordemExecucao ?? index + 1))
        : null,
      proximaEtapaNome: restantes.length
        ? (() => {
            const ordem = Math.min(...restantes.map((item, index) => item.etapaOrdem ?? item.ordemExecucao ?? index + 1));
            return restantes.find((item, index) => (item.etapaOrdem ?? item.ordemExecucao ?? index + 1) === ordem)?.etapaNome ?? null;
          })()
        : null,
    },
  });
});

const PROPOSTA_TRANSITIONS: Record<string, string[]> = {
  rascunho: ["enviada", "pendente"],
  enviada: ["pendente", "aceita", "rejeitada", "expirada"],
  pendente: ["aceita", "rejeitada", "expirada"],
  aceita: [],
  rejeitada: [],
  expirada: [],
};

router.patch("/propostas/:id/status", async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status) {
    res.status(422).json({ error: "status is required" });
    return;
  }

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessProposalOwnership(req, proposta))) {
    res.status(403).json({ error: "Access denied to this proposal" });
    return;
  }

  const allowed = PROPOSTA_TRANSITIONS[proposta.status] ?? [];
  if (!allowed.includes(status)) {
    res.status(422).json({
      error: `Transition from "${proposta.status}" to "${status}" is not allowed. Allowed: [${allowed.join(", ") || "none"}]`,
    });
    return;
  }

  const [updated] = await db
    .update(propostasTable)
    .set({ status: status as typeof proposta.status, updatedAt: new Date() })
    .where(eq(propostasTable.id, String(req.params.id)))
    .returning();

  // ── Central funnel: proposalAccepted handles deal ganho + automation ───────
  if (status === "aceita" && proposta.dealId) {
    const result = await proposalAccepted(proposta.id, "manual");
    if (!result.ok) {
      req.log.warn({ propostaId: proposta.id, error: result.error }, "proposalAccepted failed during status transition");
    } else {
      req.log.info({ propostaId: proposta.id, dealId: result.dealId, alreadyProcessed: result.alreadyProcessed }, "proposalAccepted executed via status transition");
    }
  } else if (status === "aceita" && !proposta.dealId && proposta.leadId) {
    // No deal linked — move lead directly to convertido so the card reaches "ganho"
    await db
      .update(leadsTable)
      .set({ status: "convertido", updatedAt: new Date() })
      .where(eq(leadsTable.id, proposta.leadId));
    req.log.info({ propostaId: proposta.id, leadId: proposta.leadId }, "proposta aceita sem deal: lead movido para convertido");
  } else if (proposta.dealId && status !== "aceita") {
    // Auto-sync deal stage for non-aceita transitions (rejeitada, expirada, pendente)
    const dealEtapaMap: Record<string, string> = {
      pendente: "proposta",
      rejeitada: "perdido",
      expirada: "perdido",
    };
    const targetEtapa = dealEtapaMap[status];
    if (targetEtapa) {
      await db
        .update(dealsTable)
        .set({ etapa: targetEtapa as typeof dealsTable.$inferSelect.etapa, updatedAt: new Date() })
        .where(eq(dealsTable.id, proposta.dealId));
      req.log.info({ dealId: proposta.dealId, from: proposta.status, to: status, etapa: targetEtapa }, "proposta: auto-synced deal stage");
    }
  }

  res.json(updated);
});

const paymentCompositionLineSchema = z.object({
  forma: z.string().min(1),
  valor: z.number().positive(),
  comprovanteUrl: z.string().optional(),
});

const fromCatalogoBodySchema = z.object({
  leadId: z.string().min(1),
  titulo: z.string().min(1),
  dealId: z.string().optional(),
  validadeAte: z.coerce.date().optional(),
  observacoes: z.string().optional(),
  formaPagamento: z.string().optional(),
  condPagamento: z.string().optional(),
  prazoEntrega: z.string().optional(),
  recorrente: z.boolean().optional(),
  valorMensal: z.number().optional(),
  prazoContratoMeses: z.number().int().optional(),
  numParcelas: z.number().int().min(1).optional(),
  paymentCompositions: z.array(paymentCompositionLineSchema).optional(),
  apresentacao: propostaApresentacaoSchema.optional(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().min(1).optional(),
        composicaoId: z.string().min(1).optional(),
        quantidade: z.number().positive(),
        precoUnitario: z.number().nonnegative().optional(),
        nome: z.string().optional(),
        etapaId: z.string().min(1).optional(),
        etapaNome: z.string().min(1).optional(),
        etapaOrdem: z.number().int().positive().optional(),
        ordemExecucao: z.number().int().positive().optional(),
      }).refine(
        (item) => Boolean(item.produtoId) !== Boolean(item.composicaoId),
        { message: "Informe produtoId ou composicaoId, mas não os dois." },
      )
    )
    .min(1, "At least one item is required"),
});

router.post(
  "/tenants/:tenantId/propostas/from-catalogo",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    const parsed = fromCatalogoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.message });
      return;
    }

    const {
      leadId, titulo, dealId, validadeAte, observacoes, itens,
      formaPagamento, condPagamento, prazoEntrega,
      recorrente, valorMensal, prazoContratoMeses, numParcelas,
      paymentCompositions, apresentacao,
    } = parsed.data;

    const produtoIds = itens.flatMap((item) => item.produtoId ? [item.produtoId] : []);
    const composicaoIds = itens.flatMap((item) => item.composicaoId ? [item.composicaoId] : []);

    const produtos = produtoIds.length > 0
      ? await db
          .select()
          .from(produtosCatalogoTable)
          .where(
            and(
              eq(produtosCatalogoTable.tenantId, tenantId),
              inArray(produtosCatalogoTable.id, produtoIds)
            )
          )
      : [];

    const composicoes = composicaoIds.length > 0
      ? await db
          .select()
          .from(composicoesTable)
          .where(
            and(
              eq(composicoesTable.tenantId, tenantId),
              inArray(composicoesTable.id, composicaoIds)
            )
          )
      : [];

    const missingProductIds = produtoIds.filter(
      (id) => !produtos.find((produto) => produto.id === id)
    );
    if (missingProductIds.length > 0) {
      res.status(422).json({
        error: `Products not found or do not belong to this tenant: ${missingProductIds.join(", ")}`,
      });
      return;
    }

    const missingCompositionIds = composicaoIds.filter(
      (id) => !composicoes.find((composicao) => composicao.id === id)
    );
    if (missingCompositionIds.length > 0) {
      res.status(422).json({
        error: `Compositions not found or do not belong to this tenant: ${missingCompositionIds.join(", ")}`,
      });
      return;
    }

    const inactiveProdutos = produtos.filter((produto) => !produto.ativo);
    if (inactiveProdutos.length > 0) {
      res.status(422).json({
        error: `Inactive products cannot be added to a proposta: ${inactiveProdutos.map((produto) => produto.nome).join(", ")}`,
      });
      return;
    }

    const produtoMap = new Map(produtos.map((produto) => [produto.id, produto]));
    const composicaoMap = new Map(composicoes.map((composicao) => [composicao.id, composicao]));

    let valorTotal = 0;
    const propostaItens = itens.map((item) => {
      if (item.produtoId) {
        const produto = produtoMap.get(item.produtoId)!;
        const quantidade = normalizeOrcamentoQuantity(item.quantidade);
        const valorUnitario = normalizeOrcamentoMoney(
          item.precoUnitario !== undefined
            ? item.precoUnitario
            : parseFloat(produto.precoBase),
        );
        valorTotal += quantidade * valorUnitario;
        return {
          nome: item.nome || produto.nome,
          quantidade,
          valorUnitario,
          produtoId: produto.id,
          sku: produto.sku ?? undefined,
          descricao: produto.descricao ?? undefined,
          unidade: produto.unidade ?? undefined,
          sourceSnapshot: {
            capturedAt: new Date().toISOString(),
            sourceType: "catalog_product" as const,
            sourceId: produto.id,
            nome: produto.nome,
            sku: produto.sku ?? undefined,
            descricao: produto.descricao ?? undefined,
            unidade: produto.unidade ?? undefined,
            marca: produto.marca ?? undefined,
            fornecedor: produto.fornecedor ?? undefined,
            imagemUrl: produto.imagemUrl ?? undefined,
            imagens: produto.imagens ?? undefined,
            precoCatalogo: Number(produto.precoBase ?? 0),
            precoAplicado: valorUnitario,
            prazoEntregaDias: produto.prazoEntregaDias ?? undefined,
            pricingConfig: (produto.pricingConfig ?? undefined) as any,
            deliveryConfig: (produto.deliveryConfig ?? undefined) as any,
          },
          etapaId: item.etapaId,
          etapaNome: item.etapaNome,
          etapaOrdem: item.etapaOrdem,
          ordemExecucao: item.ordemExecucao,
        };
      }

      const composicao = composicaoMap.get(item.composicaoId!)!;
      const quantidade = normalizeOrcamentoQuantity(item.quantidade);
      const valorUnitario = normalizeOrcamentoMoney(
        item.precoUnitario !== undefined
          ? item.precoUnitario
          : Number(composicao.custoTotal ?? 0),
      );
      valorTotal += quantidade * valorUnitario;
      return {
        nome: item.nome || composicao.nome,
        quantidade,
        valorUnitario,
        composicaoId: composicao.id,
        sku: composicao.codigo ?? undefined,
        descricao: composicao.descricao ?? undefined,
        unidade: composicao.unidade,
        sourceSnapshot: {
          capturedAt: new Date().toISOString(),
          sourceType: "composition" as const,
          sourceId: composicao.id,
          nome: item.nome || composicao.nome,
          sku: composicao.codigo ?? undefined,
          descricao: composicao.descricao ?? undefined,
          unidade: composicao.unidade,
          precoAplicado: valorUnitario,
        },
        etapaId: item.etapaId,
        etapaNome: item.etapaNome,
        etapaOrdem: item.etapaOrdem,
        ordemExecucao: item.ordemExecucao,
      };
    });

    const numero = await generateNumero(tenantId);
    const normalizedCatalogItems = normalizarItensExecucao(propostaItens as PropostaItem[]);
    const catalogSourceSnapshot = await buildBudgetContextSnapshot({
      tenantId,
      leadId,
      origin: composicaoIds.length && produtoIds.length ? "composition" : produtoIds.length ? "catalog" : "composition",
      items: normalizedCatalogItems,
      presentation: apresentacao,
      dealId: dealId ?? null,
    });

    const [proposta] = await db
      .insert(propostasTable)
      .values({
        tenantId,
        leadId,
        titulo,
        numero,
        ...(dealId ? { dealId } : {}),
        ...(validadeAte ? { validadeAte } : {}),
        ...(observacoes ? { observacoes } : {}),
        ...(formaPagamento ? { formaPagamento: formaPagamento as typeof propostasTable.$inferInsert.formaPagamento } : {}),
        ...(condPagamento ? { condPagamento } : {}),
        ...(prazoEntrega ? { prazoEntrega } : {}),
        ...(recorrente !== undefined ? { recorrente } : {}),
        ...(valorMensal !== undefined ? { valorMensal: roundOrcamentoNumber(valorMensal).toFixed(2) } : {}),
        ...(prazoContratoMeses !== undefined ? { prazoContratoMeses } : {}),
        ...(numParcelas !== undefined ? { numParcelas } : {}),
        ...(paymentCompositions ? {
          paymentCompositions: paymentCompositions.map((pc) => ({
            forma: pc.forma,
            valor: roundOrcamentoNumber(pc.valor).toFixed(2),
            comprovanteUrl: pc.comprovanteUrl ?? null,
          })),
        } : {}),
        apresentacao: mergeBudgetPresentationSnapshot(apresentacao, catalogSourceSnapshot),
        itens: normalizedCatalogItems,
        valorTotal: roundOrcamentoNumber(valorTotal).toFixed(2),
      })
      .returning();

    res.status(201).json(proposta);
  }
);

// ─── AI item suggestion ───────────────────────────────────────────────────────
const suggestBodySchema = z.object({
  titulo: z.string().min(1),
  leadNome: z.string().optional(),
  contexto: z.string().optional(),
});

router.post("/tenants/:tenantId/propostas/suggest-items", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = suggestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId));

  const catalog = await db
    .select({
      nome: produtosCatalogoTable.nome,
      precoBase: produtosCatalogoTable.precoBase,
      unidade: produtosCatalogoTable.unidade,
      categoria: categoriasProdutoTable.nome,
    })
    .from(produtosCatalogoTable)
    .leftJoin(categoriasProdutoTable, eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id))
    .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
    .limit(20);

  const productContext = buildProposalProductContext(
    catalog,
    (profile?.produtos as Array<{ nome?: string | null; preco?: number | null }> | null | undefined),
  );

  const contextParts: string[] = [`Título do orçamento: ${parsed.data.titulo}`];
  if (parsed.data.leadNome) contextParts.push(`Cliente: ${parsed.data.leadNome}`);
  if (parsed.data.contexto) contextParts.push(`Contexto adicional: ${parsed.data.contexto}`);
  if (profile?.nomeFantasia) contextParts.push(`Empresa vendedora: ${profile.nomeFantasia}`);
  if (profile?.vertical) contextParts.push(`Segmento: ${profile.vertical}`);
  if (profile?.urlLinhaProdutos) contextParts.push(`Fonte externa complementar: ${profile.urlLinhaProdutos}`);
  contextParts.push(productContext.context);

  try {
    const sourceRules = proposalProductPromptRules(productContext.source)
      .map((rule) => `- ${rule}`)
      .join("\n");
    const aiResult = await gatewayCallOpenAI(
      tenantId,
      "proposal_generator",
      [
        {
          role: "system",
          content: `Você é um assistente especializado em criar orçamentos comerciais brasileiros.
Com base nas informações fornecidas, sugira uma lista de itens para o orçamento.
Retorne APENAS JSON válido:
{"itens":[{"nome":"nome do item","quantidade":número,"valorUnitario":número_decimal}]}
Regras:
- Sugira entre 3 e 7 itens relevantes ao contexto
${sourceRules}
- Retorne SOMENTE o JSON, sem texto extra`,
        },
        { role: "user", content: contextParts.join("\n") },
      ],
      { model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 800, temperature: 0.7, log: req.log },
    );

    const raw = aiResult.content || "{}";
    res.json(JSON.parse(raw));
  } catch (err) {
    req.log.error({ err }, "suggest-items: OpenAI error");
    res.status(500).json({ error: "Erro ao gerar sugestão" });
  }
});

router.delete("/propostas/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: propostasTable.id, tenantId: propostasTable.tenantId })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessProposalOwnership(req, existing))) {
    res.status(403).json({ error: "Access denied to this proposal" });
    return;
  }

  await db.delete(propostasTable).where(eq(propostasTable.id, existing.id));

  res.status(204).send();
});

// Each proposal owns exactly one public token. Legacy proposals that predate
// automatic token generation are backfilled lazily the first time the seller
// asks to share them. The conditional update avoids token replacement on races.
router.post("/propostas/:id/public-link", async (req, res) => {
  const propostaId = String(req.params.id);
  const [existing] = await db
    .select({
      id: propostasTable.id,
      tenantId: propostasTable.tenantId,
      publicToken: propostasTable.publicToken,
    })
    .from(propostasTable)
    .where(eq(propostasTable.id, propostaId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessProposalOwnership(req, existing))) {
    res.status(403).json({ error: "Access denied to this proposal" });
    return;
  }

  if (existing.publicToken) {
    res.json({ propostaId, publicToken: existing.publicToken });
    return;
  }

  const generatedToken = crypto.randomUUID().replace(/-/g, "");
  const [updated] = await db
    .update(propostasTable)
    .set({ publicToken: generatedToken, updatedAt: new Date() })
    .where(and(eq(propostasTable.id, propostaId), isNull(propostasTable.publicToken)))
    .returning({ publicToken: propostasTable.publicToken });

  if (updated?.publicToken) {
    res.json({ propostaId, publicToken: updated.publicToken });
    return;
  }

  const [current] = await db
    .select({ publicToken: propostasTable.publicToken })
    .from(propostasTable)
    .where(eq(propostasTable.id, propostaId))
    .limit(1);

  if (!current?.publicToken) {
    res.status(500).json({ error: "Não foi possível gerar o link público desta proposta." });
    return;
  }

  res.json({ propostaId, publicToken: current.publicToken });
});

// ── Canal A: Link público de aceite ───────────────────────────────────────────

router.get("/propostas/:id/public", async (req, res) => {
  const [proposta] = await db
    .select({
      id: propostasTable.id,
      tenantId: propostasTable.tenantId,
      leadId: propostasTable.leadId,
      titulo: propostasTable.titulo,
      numero: propostasTable.numero,
      itens: propostasTable.itens,
      valorTotal: propostasTable.valorTotal,
      formaPagamento: propostasTable.formaPagamento,
      condPagamento: propostasTable.condPagamento,
      prazoEntrega: propostasTable.prazoEntrega,
      validadeAte: propostasTable.validadeAte,
      status: propostasTable.status,
      observacoes: propostasTable.observacoes,
    })
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (proposta.status !== "enviada" && proposta.status !== "pendente") {
    res.status(422).json({ error: "Proposta cannot be accepted in current status" });
    return;
  }

  const [lead] = await db
    .select({ nome: leadsTable.nome, email: leadsTable.email, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(eq(leadsTable.id, proposta.leadId));

  const [tenant] = await db
    .select({ name: tenantsTable.name })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, proposta.tenantId));

  res.json({
    proposta,
    lead: lead ?? null,
    tenant: tenant ?? null,
  });
});

const acceptBodySchema = z.object({
  nome: z.string().min(1).optional(),
  documento: z.string().optional(),
});

router.post("/propostas/:id/accept", async (req, res) => {
  const parsed = acceptBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const propostaId = String(req.params.id);
  const ip = req.ip ?? req.headers["x-forwarded-for"] as string ?? undefined;

  const result = await proposalAccepted(propostaId, "link", {
    ip,
    nome: parsed.data.nome,
    documento: parsed.data.documento,
  });

  if (!result.ok) {
    res.status(404).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(200).json({ message: "Proposta already accepted", propostaId: result.propostaId });
    return;
  }

  res.status(200).json({
    message: "Proposta accepted successfully",
    propostaId: result.propostaId,
    dealId: result.dealId,
  });
});

// ── Canal C: Marcação manual pelo vendedor (manual ou via WhatsApp) ─────────

const acceptManualBodySchema = z.object({
  via: z.enum(["manual", "whatsapp"]).optional().default("manual"),
});

router.post("/propostas/:id/accept-manual", async (req, res) => {
  const bodyParsed = acceptManualBodySchema.safeParse(req.body);
  const via = bodyParsed.success ? bodyParsed.data.via : "manual";

  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, String(req.params.id)));

  if (!proposta) {
    res.status(404).json({ error: "Proposta not found" });
    return;
  }

  if (proposta.status === "aceita") {
    res.status(409).json({ error: "Proposta já aceita", propostaId: proposta.id });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && proposta.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (!(await canAccessProposalOwnership(req, proposta))) {
    res.status(403).json({ error: "Access denied to this proposal" });
    return;
  }

  const result = await proposalAccepted(proposta.id, via as "manual" | "whatsapp", {
    nome: req.user?.email ?? undefined,
  });

  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }

  if (result.alreadyProcessed) {
    res.status(200).json({ message: "Proposta already accepted", propostaId: result.propostaId });
    return;
  }

  res.status(200).json({
    message: `Proposta accepted via ${via}`,
    propostaId: result.propostaId,
    dealId: result.dealId,
  });
});

// ── GET /tenants/:tenantId/proposta-templates ─────────────────────────────────
router.get("/tenants/:tenantId/proposta-templates", async (req, res) => {
  // tenant-audit: reviewed same-tenant or super_admin guard runs before tenant-scoped data access
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const templates = await db
    .select()
    .from(propostaTemplatesTable)
    .where(eq(propostaTemplatesTable.isActive, true))
    .orderBy(propostaTemplatesTable.name);

  res.json(templates);
});

// ── POST /tenants/:tenantId/propostas/from-template ───────────────────────────
const fromTemplateBody = z.object({
  templateSlug: z.string(),
  leadId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  validadeAte: z.coerce.date().optional(),
  observacoes: z.string().optional(),
  formaPagamento: z.string().optional(),
  condPagamento: z.string().optional(),
  prazoEntrega: z.string().optional(),
  paymentCompositions: z.array(paymentCompositionLineSchema).optional(),
  extraItens: z.array(
    z.object({
      nome: z.string(),
      quantidade: z.number().positive(),
      valorUnitario: z.number().nonnegative(),
      sku: z.string().optional(),
      descricao: z.string().optional(),
    })
  ).optional(),
});

router.post("/tenants/:tenantId/propostas/from-template", async (req, res) => {
  // tenant-audit: reviewed same-tenant or super_admin guard runs before tenant-scoped data access
  const { tenantId } = req.params;

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = fromTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const {
    templateSlug,
    leadId,
    dealId,
    validadeAte: requestedValidadeAte,
    observacoes,
    formaPagamento,
    condPagamento,
    prazoEntrega,
    paymentCompositions,
    extraItens,
  } = parsed.data;

  const [template] = await db
    .select()
    .from(propostaTemplatesTable)
    .where(and(eq(propostaTemplatesTable.slug, templateSlug), eq(propostaTemplatesTable.isActive, true)))
    .limit(1);

  if (!template) {
    res.status(404).json({ error: "Template not found or inactive" });
    return;
  }

  const [lead] = await db
    .select({ id: leadsTable.id, nome: leadsTable.nome })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const itens = [
    ...(template.itens as Array<{ nome: string; quantidade: number; valorUnitario: number; sku?: string; descricao?: string }>),
    ...(extraItens ?? []),
  ];

  const itensNormalizados = normalizarItensExecucao(itens as PropostaItem[]);
  const valorTotal = itensNormalizados.reduce(
    (sum, item) => sum + item.quantidade * item.valorUnitario,
    0,
  );
  const numero = await generateNumero(tenantId);
  const validadeAte = requestedValidadeAte ?? (() => {
    const date = new Date();
    date.setDate(date.getDate() + 15);
    return date;
  })();

  const [proposta] = await db
    .insert(propostasTable)
    .values({
      tenantId,
      leadId,
      dealId: dealId ?? null,
      titulo: `${template.name} — ${lead.nome}`,
      numero,
      itens: itensNormalizados,
      valorTotal: roundOrcamentoNumber(valorTotal).toFixed(2),
      status: "rascunho",
      validadeAte,
      ...(observacoes ? { observacoes } : {}),
      ...(formaPagamento ? { formaPagamento: formaPagamento as typeof propostasTable.$inferInsert.formaPagamento } : {}),
      ...(condPagamento ? { condPagamento } : {}),
      ...(prazoEntrega ? { prazoEntrega } : {}),
      ...(paymentCompositions ? {
        paymentCompositions: paymentCompositions.map((pc) => ({
          forma: pc.forma,
          valor: roundOrcamentoNumber(pc.valor).toFixed(2),
          comprovanteUrl: pc.comprovanteUrl ?? null,
        })),
      } : {}),
      recorrente: template.cycle !== "annual" && template.planSlug !== "",
    })
    .returning();

  res.status(201).json({ proposta, template: { slug: template.slug, name: template.name } });
});
// — Cálculo de orçamento por m² (teto vinílico, revestimento) ——————————
const calcularOrcamentoBodySchema = z.object({
  produtoId: z.string().min(1),
  superficies: z
    .array(
      z.object({
        nome: z.string().optional(),
        largura: z.number().positive().optional(),
        comprimento: z.number().positive().optional(),
        altura: z.number().positive().optional(),
        m2Direto: z.number().positive().optional(),
        perimetroManual: z.number().positive().optional(),
      })
    )
    .min(1, "Informe ao menos uma superfície (ambiente ou parede)."),
  acessorioProdutoId: z.string().optional(),
});

router.post("/tenants/:tenantId/propostas/calcular-orcamento", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const parsed = calcularOrcamentoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const { resultado, acessorioSugeridoAutomaticamente, itensComposicao } = await resolverECalcularOrcamento(tenantId, parsed.data);
    res.status(200).json({ ...resultado, acessorioSugeridoAutomaticamente, itensComposicao });
  } catch (err) {
    if (err instanceof ErroResolucaoOrcamento) {
      const status = err.message.startsWith("Produto not found") ? 404 : 422;
      res.status(status).json({ error: err.message });
      return;
    }
    if (err instanceof ErroCalculoOrcamento) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
});
export default router;
