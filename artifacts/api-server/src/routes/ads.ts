import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  adCampaignsTable,
  adCreativesTable,
  adPerformanceSnapshotsTable,
  insertAdCampaignSchema,
  leadsTable,
  dealsTable,
  vehicleAdReservationsTable,
  itemAdReservationsTable,
  businessProfilesTable,
  generatedSitesTable,
  contentGenerationsTable,
  contentPublishedPostsTable,
  contentAutopilotConfigTable,
  adCampaignEventsTable,
} from "@workspace/db";
import type { AdCampaign } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { gerarCriativoRSA } from "../lib/adContentGenerator.js";
import { gerarCriativoImagem } from "../lib/adContentGeneratorImagem.js";
import { gerarShoppingFeedXml, gerarFeedToken, validarFeedToken } from "../lib/adShoppingFeed.js";
import { buildResumoItem } from "../lib/adItemSummary.js";
import { decideVehicleReservation, reserveUniqueVehicle } from "../services/vehicle-reservation.js";
import { decideItemReservation, reserveUniqueItem } from "../services/item-reservation.js";
import { enrichAdsSegmentacao } from "../services/ad-audience-plan.js";
import { setGoogleAdsCampaignStatus, syncGoogleAdsReviewStatus, GoogleAdsPublishError } from "../services/google-ads-campaign-publish.js";
import { setMetaAdsCampaignStatus, syncMetaAdsReviewStatus, MetaAdsPublishError } from "../services/meta-ads-campaign-publish.js";
import { publishCampaignThroughChannelRegistry } from "../services/channelPublishBridge.js";
import { getAdsOverview, recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

const router: IRouter = Router();

const importedCreativeSchema = z.object({
  headlines: z.array(z.string().min(1).max(500)).max(15).default([]),
  descriptions: z.array(z.string().min(1).max(5000)).max(4).default([]),
  imagens: z.array(z.string().min(1).max(4000)).max(10).default([]),
});

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}
function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}
function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

function detectSpecialAdCategory(text: string): "HOUSING" | "EMPLOYMENT" | "CREDIT" | "ISSUES_ELECTIONS_POLITICS" | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(vaga|emprego|recrutamento|contratando|trabalhe conosco)\b/.test(normalized)) return "EMPLOYMENT";
  if (/\b(imovel|apartamento|casa a venda|aluguel|locacao residencial|loteamento|financiamento imobiliario)\b/.test(normalized)) return "HOUSING";
  if (/\b(emprestimo|credito|cartao de credito|financiamento|consorcio)\b/.test(normalized)) return "CREDIT";
  if (/\b(candidato|eleicao|partido politico|vote|campanha eleitoral)\b/.test(normalized)) return "ISSUES_ELECTIONS_POLITICS";
  return null;
}

/**
 * Monta o resumo de dados do item pra alimentar o gerador de criativo —
 * cada tipo tem campos bem diferentes, então normaliza aqui pra um texto
 * livre estruturado em vez de tentar unificar os 3 schemas.
 */

/**
 * Resumo pra campanhas sem item estruturado (itemTipo 'livre' ou
 * 'landing_page') — antes era só "Campanha institucional/landing page,
 * segmento: X", o que não dá contexto nenhum pra IA e gera título/descrição
 * genéricos demais ("Aumente sua Visibilidade", "Desenvolvemos campanhas
 * únicas"). Agora puxa o perfil real do negócio e, quando a campanha aponta
 * pra uma landing page específica, os dados daquela página também — mesmo
 * padrão já usado no gerador de copy de campanhas e no gerador de sites.
 */
async function buildResumoLivreOuLandingPage(campanha: AdCampaign, tenantId: string): Promise<string> {
  const [perfil] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));

  const partes: string[] = [];

  if (campanha.contentGenerationId) {
    const [sourceContent] = await db
      .select({ theme: contentGenerationsTable.theme, type: contentGenerationsTable.type, result: contentGenerationsTable.result })
      .from(contentGenerationsTable)
      .where(and(eq(contentGenerationsTable.id, campanha.contentGenerationId), eq(contentGenerationsTable.tenantId, tenantId)));
    if (sourceContent) {
      partes.push(`Conteúdo de origem do Marketing: ${sourceContent.theme}`);
      partes.push(`Formato original: ${sourceContent.type}`);
      const firstVariation = sourceContent.result?.variations?.[0];
      if (firstVariation) partes.push(`Variação de referência: ${JSON.stringify(firstVariation).slice(0, 5000)}`);
    }
  }

  const nomeNegocio = perfil?.nomeFantasia || perfil?.razaoSocial;
  if (nomeNegocio) partes.push(`Empresa: ${nomeNegocio}`);
  if (perfil?.vertical) partes.push(`Setor: ${perfil.vertical}`);
  if (perfil?.diferenciais) partes.push(`Diferenciais: ${perfil.diferenciais}`);
  if (perfil?.publicoAlvo) partes.push(`Público-alvo: ${perfil.publicoAlvo}`);
  if (perfil?.produtos && perfil.produtos.length > 0) {
    partes.push(`Produtos/serviços: ${perfil.produtos.map((p) => p.nome).join(", ")}`);
  }

  if (campanha.itemTipo === "landing_page" && campanha.landingPageId) {
    const [site] = await db.select({ config: generatedSitesTable.config })
      .from(generatedSitesTable)
      .where(eq(generatedSitesTable.id, campanha.landingPageId));
    if (site?.config) {
      const { name, desc, pain, servicos } = site.config;
      partes.push(`Foco específico desta campanha: ${name}`);
      if (desc) partes.push(`O que oferece: ${desc}`);
      if (pain) partes.push(`Dor do cliente que resolve: ${pain}`);
      if (servicos) partes.push(`Serviços/produtos em destaque: ${servicos}`);
    }
  }

  if (campanha.itemLabel) partes.push(`Rótulo interno da campanha: ${campanha.itemLabel}`);

  return partes.length > 0
    ? partes.join("\n")
    : `Campanha institucional/landing page, segmento: ${campanha.vertical}`;
}

class AdAutomationError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "AdAutomationError";
  }
}

async function isMarketingAutomatic(tenantId: string): Promise<boolean> {
  const [config] = await db
    .select({ ativo: contentAutopilotConfigTable.ativo, automationMode: contentAutopilotConfigTable.automationMode })
    .from(contentAutopilotConfigTable)
    .where(eq(contentAutopilotConfigTable.tenantId, tenantId))
    .limit(1);
  return Boolean(config?.ativo && config.automationMode === "automatic");
}

function validateAutonomousCampaignControl(campanha: AdCampaign) {
  const control = campanha.segmentacao?.campaignControl;
  const dailyBudget = Number(campanha.orcamentoDiario);
  const totalBudget = Number(control?.totalBudget);
  if (!control) throw new AdAutomationError("Campanha sem controle de orçamento/período. A IA não pode ativar mídia sem limites definidos.");
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) throw new AdAutomationError("Limite diário inválido para patrocínio automático.");
  if (!Number.isFinite(totalBudget) || totalBudget < dailyBudget) throw new AdAutomationError("Orçamento total inválido para patrocínio automático.");
  const start = new Date(`${control.startDate}T00:00:00`);
  const end = new Date(`${control.endDate}T23:59:59`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new AdAutomationError("Período inválido para patrocínio automático.");
  }
  if (control.automation?.allowBudgetIncrease !== false) {
    throw new AdAutomationError("A IA só pode patrocinar quando aumento automático de orçamento está bloqueado.");
  }
  if (control.conversionTracking?.mode === "platform" && !control.conversionTracking.confirmed) {
    throw new AdAutomationError("A conversão da plataforma precisa estar confirmada antes da ativação automática.");
  }
}

async function generateCreativeForCampaign(tenantId: string, campanha: AdCampaign) {
  if (campanha.tipoAnuncio !== "rsa_pmax" && campanha.tipoAnuncio !== "imagem") {
    throw new AdAutomationError("Geração de criativo por IA só se aplica a campanhas rsa_pmax ou imagem.", 400);
  }
  if (campanha.itemTipo !== "landing_page" && campanha.itemTipo !== "livre" && !campanha.itemId) {
    throw new AdAutomationError("Campanha sem item_id; geração por item único não se aplica.", 400);
  }

  const item = (campanha.itemTipo === "produto" || campanha.itemTipo === "veiculo" || campanha.itemTipo === "imovel")
    ? await buildResumoItem(campanha.itemTipo, campanha.itemId as string, tenantId)
    : { itemTipo: campanha.itemTipo, resumo: await buildResumoLivreOuLandingPage(campanha, tenantId), nomeCurto: campanha.itemLabel || campanha.vertical };
  if (!item) throw new AdAutomationError("Item de origem da campanha não encontrado.", 404);

  const previousRejectionReason = (campanha.segmentacao as any)?.previousRejectionReason;
  if (previousRejectionReason) {
    item.resumo += `\nCorreção obrigatória de política: a versão anterior foi recusada por: ${previousRejectionReason}. Crie uma formulação diferente, factual e compatível; não repita o trecho ou alegação problemática.`;
  }

  if (campanha.tipoAnuncio === "rsa_pmax") {
    const gerado = await gerarCriativoRSA(item as any, logger, tenantId);
    if (!gerado) throw new AdAutomationError("Falha ao gerar criativo RSA.", 502);
    const [creative] = await db.insert(adCreativesTable).values({
      campaignId: campanha.id,
      headlines: gerado.headlines,
      descriptions: gerado.descriptions,
      imagens: [],
    }).returning();
    if (!creative) throw new AdAutomationError("Falha ao persistir criativo RSA.", 500);
    logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative.id }, "ads: criativo RSA gerado");
    return creative;
  }

  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
  if (campanha.imagemEscolhidaUrl) {
    const gerado = await gerarCriativoImagem(item, tenantId, profile ?? {}, logger, { pularGeracaoDeImagem: true });
    if (!gerado) throw new AdAutomationError("Falha ao gerar texto do criativo de imagem.", 502);
    const [creative] = await db.insert(adCreativesTable).values({
      campaignId: campanha.id,
      headlines: [gerado.headline, gerado.primaryText],
      descriptions: gerado.description ? [gerado.description] : [],
      imagens: [campanha.imagemEscolhidaUrl],
    }).returning();
    if (!creative) throw new AdAutomationError("Falha ao persistir criativo de imagem.", 500);
    logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative.id }, "ads: criativo de imagem gerado com foto existente");
    return creative;
  }

  const gerado = await gerarCriativoImagem(item, tenantId, profile ?? {}, logger);
  if (!gerado) throw new AdAutomationError("Falha ao gerar criativo de imagem.", 502);
  const [creative] = await db.insert(adCreativesTable).values({
    campaignId: campanha.id,
    headlines: [gerado.headline, gerado.primaryText],
    descriptions: gerado.description ? [gerado.description] : [],
    imagens: [gerado.imageUrl],
  }).returning();
  if (!creative) throw new AdAutomationError("Falha ao persistir criativo de imagem.", 500);
  logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative.id }, "ads: criativo de imagem gerado");
  return creative;
}

async function executeSponsoredContentAutonomously(tenantId: string, campanha: AdCampaign) {
  if (!campanha.contentGenerationId) {
    return { attempted: false, executed: false, reason: "Campanha não veio de uma publicação do Marketing." };
  }
  if (!(await isMarketingAutomatic(tenantId))) {
    return { attempted: false, executed: false, reason: "Marketing não está no modo Automático." };
  }
  if (campanha.plataforma !== "google" && campanha.plataforma !== "meta") {
    return { attempted: true, executed: false, reason: `Patrocínio automático ainda não disponível para ${campanha.plataforma}.` };
  }

  validateAutonomousCampaignControl(campanha);

  let [creative] = await db
    .select()
    .from(adCreativesTable)
    .where(eq(adCreativesTable.campaignId, campanha.id))
    .orderBy(desc(adCreativesTable.geradoEm))
    .limit(1);

  if (!creative) creative = await generateCreativeForCampaign(tenantId, campanha);

  if (creative.status !== "aprovado") {
    const [approved] = await db
      .update(adCreativesTable)
      .set({ status: "aprovado", aprovadoPorId: null, aprovadoEm: new Date() })
      .where(eq(adCreativesTable.id, creative.id))
      .returning();
    creative = approved ?? creative;
    await recordAdCampaignEvent({
      tenantId,
      campaignId: campanha.id,
      eventType: "creative_auto_approved",
      severity: "success",
      message: "Criativo aprovado automaticamente pelo Marketing IA.",
      metadata: { actor: "marketing_ai", creativeId: creative.id },
    });
  }

  const publication = await publishCampaignThroughChannelRegistry({
    tenantId,
    campaignId: campanha.id,
    channel: campanha.plataforma === "google" ? "google-search" : "meta",
    authorization: "agent-autonomous",
    allowPublishAds: true,
    requireDesignQa: true,
  });
  const published = publication.result;

  await recordAdCampaignEvent({
    tenantId,
    campaignId: campanha.id,
    eventType: "auto_published",
    severity: "success",
    message: "Marketing IA publicou a campanha na plataforma usando os limites configurados.",
    metadata: { actor: "marketing_ai", plataforma: campanha.plataforma, creativeId: creative.id, designQa: publication.designQa },
  });

  try {
    if (campanha.plataforma === "google") await setGoogleAdsCampaignStatus(tenantId, campanha.id, true);
    else await setMetaAdsCampaignStatus(tenantId, campanha.id, true);
    await recordAdCampaignEvent({
      tenantId,
      campaignId: campanha.id,
      eventType: "auto_activated",
      severity: "success",
      message: "Marketing IA ativou o patrocínio dentro do orçamento e período configurados.",
      metadata: { actor: "marketing_ai", plataforma: campanha.plataforma, dailyBudget: campanha.orcamentoDiario, totalBudget: campanha.segmentacao?.campaignControl?.totalBudget },
    });
    return { attempted: true, executed: true, published: true, activated: true, creativeId: creative.id, designQa: publication.designQa, platformResult: published };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "A campanha foi publicada, mas a plataforma não aceitou a ativação imediata.";
    await recordAdCampaignEvent({
      tenantId,
      campaignId: campanha.id,
      eventType: "auto_activation_pending",
      severity: "warning",
      message: warning,
      metadata: { actor: "marketing_ai", plataforma: campanha.plataforma },
    }).catch(() => null);
    return { attempted: true, executed: true, published: true, activated: false, creativeId: creative.id, designQa: publication.designQa, warning, platformResult: published };
  }
}

router.get("/tenants/:tenantId/ads/overview", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json(await getAdsOverview(tenantId));
});

router.get("/tenants/:tenantId/ads/campaigns/:id/events", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const events = await db.select().from(adCampaignEventsTable)
    .where(and(eq(adCampaignEventsTable.tenantId, tenantId), eq(adCampaignEventsTable.campaignId, req.params.id as string)))
    .orderBy(desc(adCampaignEventsTable.createdAt));
  return res.json(events);
});

router.post("/tenants/:tenantId/ads/events/:id/resolve", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const [event] = await db.update(adCampaignEventsTable)
    .set({ resolvedAt: new Date() })
    .where(and(eq(adCampaignEventsTable.id, req.params.id as string), eq(adCampaignEventsTable.tenantId, tenantId)))
    .returning();
  if (!event) return res.status(404).json({ error: "Alerta não encontrado" });
  return res.json(event);
});

router.get("/tenants/:tenantId/ads/campaigns", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.tenantId, tenantId));
  if (rows.length === 0) return res.json([]);
  const creatives = await db.select().from(adCreativesTable)
    .where(inArray(adCreativesTable.campaignId, rows.map((row) => row.id)))
    .orderBy(desc(adCreativesTable.geradoEm));
  const latestByCampaign = new Map<string, typeof creatives[number]>();
  for (const creative of creatives) {
    if (!latestByCampaign.has(creative.campaignId)) latestByCampaign.set(creative.campaignId, creative);
  }
  return res.json(rows.map((row) => ({ ...row, latestCreative: latestByCampaign.get(row.id) ?? null })));
});

router.delete("/tenants/:tenantId/ads/campaigns/:id", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const campaignId = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [campaign] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campaign) return res.status(404).json({ error: "Campanha não encontrada" });
  if (campaign.externalCampaignId) {
    return res.status(409).json({ error: "Campanha já enviada à plataforma. Pause a campanha; a exclusão só é permitida para rascunhos." });
  }
  await db.delete(adCampaignsTable).where(eq(adCampaignsTable.id, campaignId));
  return res.status(204).send();
});

router.post("/tenants/:tenantId/ads/campaigns", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertAdCampaignSchema.safeParse({ destinoClique: "whatsapp", ...req.body, tenantId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const creativeDraft = req.body?.creativeDraft
    ? importedCreativeSchema.safeParse(req.body.creativeDraft)
    : null;
  if (creativeDraft && !creativeDraft.success) {
    return res.status(400).json({ error: creativeDraft.error.flatten() });
  }

  if (parsed.data.contentGenerationId) {
    const [sourceContent] = await db.select({ id: contentGenerationsTable.id })
      .from(contentGenerationsTable)
      .where(and(eq(contentGenerationsTable.id, parsed.data.contentGenerationId), eq(contentGenerationsTable.tenantId, tenantId)));
    if (!sourceContent) return res.status(422).json({ error: "Conteúdo de origem não encontrado neste tenant" });
  }

  let segmentacao: any = enrichAdsSegmentacao((parsed.data.segmentacao ?? {}) as any);
  const sourceVariationIndex = Number(req.body?.sourceVariationIndex);
  if (parsed.data.contentGenerationId && Number.isInteger(sourceVariationIndex) && sourceVariationIndex >= 0) {
    const [publishedPost] = await db
      .select({ instagramMediaId: contentPublishedPostsTable.instagramMediaId, instagramConnectionId: contentPublishedPostsTable.instagramConnectionId })
      .from(contentPublishedPostsTable)
      .where(and(
        eq(contentPublishedPostsTable.tenantId, tenantId),
        eq(contentPublishedPostsTable.contentGenerationId, parsed.data.contentGenerationId),
        eq(contentPublishedPostsTable.variationIndex, sourceVariationIndex),
      ))
      .orderBy(desc(contentPublishedPostsTable.publishedAt))
      .limit(1);
    if (publishedPost?.instagramMediaId) {
      segmentacao = { ...segmentacao, origemInstagram: { mediaId: publishedPost.instagramMediaId, variationIndex: sourceVariationIndex, contentGenerationId: parsed.data.contentGenerationId, instagramConnectionId: publishedPost.instagramConnectionId ?? undefined }, instagramConnectionId: publishedPost.instagramConnectionId ?? segmentacao.instagramConnectionId };
    }
  }

  const control = (segmentacao as any)?.campaignControl;
  if (!control) {
    return res.status(422).json({ error: "Defina objetivo, período, orçamento total e medição antes de criar a campanha." });
  }
  const startDate = new Date(`${control.startDate}T00:00:00`);
  const endDate = new Date(`${control.endDate}T23:59:59`);
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000);
  const dailyBudget = Number(parsed.data.orcamentoDiario);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || durationDays < 1 || durationDays > 90) {
    return res.status(422).json({ error: "O período da campanha deve ter entre 2 e 90 dias." });
  }
  if (!Number.isFinite(control.totalBudget) || control.totalBudget < dailyBudget) {
    return res.status(422).json({ error: "O orçamento total precisa ser igual ou maior que o limite diário." });
  }
  const specialCategoryHint = detectSpecialAdCategory([
    parsed.data.vertical,
    parsed.data.itemLabel,
    ...((segmentacao as any)?.marketingContext?.productNames ?? []),
  ].filter(Boolean).join(" "));
  if (specialCategoryHint && control.specialAdCategory === "NONE") {
    return res.status(422).json({
      error: `Este anúncio parece pertencer à categoria especial ${specialCategoryHint}. Confirme a categoria correta antes de criar.`,
    });
  }
  if (["whatsapp", "lead", "sale", "visit"].includes(control.objective) && control.conversionTracking?.mode === "clicks") {
    return res.status(422).json({ error: "Para este objetivo, escolha a medição de contatos do VendorAI ou uma conversão configurada na plataforma." });
  }
  if (control.conversionTracking?.mode === "platform" && !control.conversionTracking?.confirmed) {
    return res.status(422).json({ error: "Confirme que a conversão da plataforma foi instalada e testada antes de publicar." });
  }

  const utmCode = `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  const [row] = await db.insert(adCampaignsTable).values({ ...parsed.data, segmentacao, utmCode }).returning();
  let importedCreative = null;
  if (row && creativeDraft?.success) {
    const draft = creativeDraft.data;
    const hasExistingInstagramPost = Boolean((segmentacao as any)?.origemInstagram?.mediaId);
    const canImportDraft =
      (draft.headlines.length || draft.descriptions.length || draft.imagens.length) &&
      (row.tipoAnuncio !== "imagem" || draft.imagens.length > 0 || hasExistingInstagramPost);
    if (canImportDraft) {
      [importedCreative] = await db.insert(adCreativesTable).values({
        campaignId: row.id,
        headlines: draft.headlines,
        descriptions: draft.descriptions,
        imagens: draft.imagens,
      }).returning();
    }
  }
  let autonomousExecution: Awaited<ReturnType<typeof executeSponsoredContentAutonomously>> | null = null;
  if (row) {
    await recordAdCampaignEvent({ tenantId, campaignId: row.id, userId: (req as any).user?.sub, eventType: "created", message: "Campanha criada como rascunho." });
    try {
      autonomousExecution = await executeSponsoredContentAutonomously(tenantId, row);
    } catch (error) {
      const warning = error instanceof Error ? error.message : "A IA não conseguiu concluir o patrocínio automático.";
      autonomousExecution = { attempted: true, executed: false, reason: warning };
      await recordAdCampaignEvent({
        tenantId,
        campaignId: row.id,
        eventType: "autopilot_error",
        severity: "warning",
        message: warning,
        metadata: { actor: "marketing_ai" },
      }).catch(() => null);
      req.log.warn({ error, tenantId, campaignId: row.id }, "ads: patrocínio automático não concluído; campanha preservada");
    }
  }
  return res.status(201).json({ ...row, latestCreative: importedCreative, autonomousExecution });
});

router.post("/tenants/:tenantId/ads/campaigns/:id/retry", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [campaign] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, req.params.id as string), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campaign) return res.status(404).json({ error: "Campanha não encontrada" });
  if (campaign.segmentacao?.platformReview?.status !== "reprovada") {
    return res.status(409).json({ error: "Somente campanhas reprovadas podem usar este fluxo de correção." });
  }

  const rejectionReason = campaign.segmentacao.platformReview.reason
    || campaign.segmentacao.platformReview.policyTopics?.join(", ")
    || "Motivo não informado pela plataforma";
  const {
    id: _id,
    externalCampaignId: _externalCampaignId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...copy
  } = campaign;
  const segmentacao = {
    ...campaign.segmentacao,
    platformReview: undefined,
    previousRejectionReason: rejectionReason,
  };
  const [retry] = await db.insert(adCampaignsTable).values({
    ...copy,
    status: "rascunho",
    externalCampaignId: null,
    segmentacao,
    utmCode: `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
  } as any).returning();

  if (retry) await recordAdCampaignEvent({ tenantId, campaignId: retry.id, userId: (req as any).user?.sub, eventType: "retry_created", severity: "warning", message: "Nova versão criada para corrigir uma reprovação.", metadata: { sourceCampaignId: campaign.id, rejectionReason } });
  return res.status(201).json(retry);
});

router.post("/tenants/:tenantId/ads/campaigns/:id/prepare-recommendation", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const action = req.body?.action;
  if (!["review_targeting", "improve_destination", "extend_campaign"].includes(action)) {
    return res.status(422).json({ error: "Recomendação inválida." });
  }
  const [campaign] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, req.params.id as string), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campaign) return res.status(404).json({ error: "Campanha não encontrada" });

  const { id: _id, externalCampaignId: _externalId, createdAt: _created, updatedAt: _updated, ...copy } = campaign;
  const currentControl = campaign.segmentacao?.campaignControl;
  let campaignControl = currentControl;
  let guidance: string[];
  if (action === "extend_campaign") {
    const base = currentControl?.endDate ? new Date(`${currentControl.endDate}T12:00:00Z`) : new Date();
    const start = new Date(base.getTime() + 86_400_000);
    const end = new Date(start.getTime() + 4 * 86_400_000);
    campaignControl = {
      ...(currentControl ?? { objective: "lead", specialAdCategory: "NONE" }),
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      totalBudget: Number(campaign.orcamentoDiario) * 5,
    } as any;
    guidance = ["Período adicional de 5 dias preparado.", "Revise o orçamento total.", "Publique somente depois de confirmar."];
  } else if (action === "review_targeting") {
    guidance = ["Revise cidades, raio e perfil do público.", "Confirme se a oferta corresponde ao nicho escolhido.", "Gere um novo criativo antes de publicar."];
  } else {
    guidance = ["Confira se o destino abre corretamente no celular.", "Deixe a chamada principal clara.", "Use WhatsApp ou formulário curto para reduzir abandono."];
  }
  const segmentacao = {
    ...campaign.segmentacao,
    platformReview: undefined,
    campaignControl,
    sourceCampaignId: campaign.id,
    preparedRecommendation: { action, guidance, preparedAt: new Date().toISOString() },
  };
  const [draft] = await db.insert(adCampaignsTable).values({
    ...copy,
    status: "rascunho",
    externalCampaignId: null,
    segmentacao,
    utmCode: `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
  } as any).returning();
  await recordAdCampaignEvent({
    tenantId, campaignId: draft.id, userId: (req as any).user?.sub,
    eventType: "recommendation_prepared", severity: "info",
    message: "Novo rascunho criado a partir de uma recomendação do VendorAI.",
    metadata: { action, sourceCampaignId: campaign.id, guidance },
  });
  return res.status(201).json({ campaign: draft, guidance });
});

router.post("/tenants/:tenantId/ads/campaigns/:id/vehicle-interest", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const leadId = typeof req.body?.leadId === "string" ? req.body.leadId : "";
  if (!leadId) return res.status(422).json({ error: "leadId é obrigatório" });
  try {
    const reservation = await reserveUniqueVehicle({
      tenantId, campaignId: req.params.id as string, leadId,
      sellerId: typeof req.body?.sellerId === "string" ? req.body.sellerId : null,
    });
    return res.status(201).json(reservation);
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : "Não foi possível reservar o veículo" });
  }
});

router.get("/tenants/:tenantId/ads/vehicle-reservations", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(vehicleAdReservationsTable)
    .where(eq(vehicleAdReservationsTable.tenantId, tenantId))
    .orderBy(desc(vehicleAdReservationsTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/ads/vehicle-reservations/:id/decision", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const decision = req.body?.decision;
  if (!["manter", "avancar", "perdido"].includes(decision)) {
    return res.status(422).json({ error: "decision deve ser manter, avancar ou perdido" });
  }
  try {
    const row = await decideVehicleReservation({
      tenantId, reservationId: req.params.id as string,
      userId: (req as any).user?.sub ?? null, decision,
      justification: typeof req.body?.justification === "string" ? req.body.justification : "",
    });
    return res.json(row);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Decisão inválida" });
  }
});

router.post("/tenants/:tenantId/ads/campaigns/:id/item-interest", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const leadId = typeof req.body?.leadId === "string" ? req.body.leadId : "";
  if (!leadId) return res.status(422).json({ error: "leadId é obrigatório" });
  try {
    const reservation = await reserveUniqueItem({
      tenantId, campaignId: req.params.id as string, leadId,
      sellerId: typeof req.body?.sellerId === "string" ? req.body.sellerId : null,
    });
    return res.status(201).json(reservation);
  } catch (error) {
    return res.status(409).json({ error: error instanceof Error ? error.message : "Não foi possível reservar o item" });
  }
});

router.get("/tenants/:tenantId/ads/item-reservations", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(itemAdReservationsTable)
    .where(eq(itemAdReservationsTable.tenantId, tenantId))
    .orderBy(desc(itemAdReservationsTable.createdAt));
  return res.json(rows);
});

router.post("/tenants/:tenantId/ads/item-reservations/:id/decision", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const decision = req.body?.decision;
  if (!["manter", "avancar", "perdido"].includes(decision)) {
    return res.status(422).json({ error: "decision deve ser manter, avancar ou perdido" });
  }
  try {
    const row = await decideItemReservation({
      tenantId, reservationId: req.params.id as string,
      userId: (req as any).user?.sub ?? null, decision,
      justification: typeof req.body?.justification === "string" ? req.body.justification : "",
    });
    return res.json(row);
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : "Decisão inválida" });
  }
});

router.post("/tenants/:tenantId/ads/campaigns/:id/gerar-criativo", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [campanha] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, req.params.id as string), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campanha) return res.status(404).json({ error: "Campanha not found" });

  try {
    const creative = await generateCreativeForCampaign(tenantId, campanha);
    return res.status(201).json(creative);
  } catch (error) {
    if (error instanceof AdAutomationError) return res.status(error.status).json({ error: error.message });
    req.log.error({ error, tenantId, campaignId: campanha.id }, "ads: falha inesperada ao gerar criativo");
    return res.status(500).json({ error: "Falha inesperada ao gerar criativo." });
  }
});

router.post("/tenants/:tenantId/ads/creatives/:id/aprovar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [creative] = await db.select({ id: adCreativesTable.id, campaignId: adCreativesTable.campaignId })
    .from(adCreativesTable).where(eq(adCreativesTable.id, req.params.id as string));
  if (!creative) return res.status(404).json({ error: "Creative not found" });

  const [campanha] = await db.select({ tenantId: adCampaignsTable.tenantId })
    .from(adCampaignsTable).where(eq(adCampaignsTable.id, creative.campaignId));
  if (!campanha || campanha.tenantId !== tenantId) return res.status(403).json({ error: "Forbidden" });

  const userId = (req as any).user?.sub as string | undefined;
  const [row] = await db.update(adCreativesTable)
    .set({ status: "aprovado", aprovadoPorId: userId ?? null, aprovadoEm: new Date() })
    .where(eq(adCreativesTable.id, creative.id))
    .returning();

  return res.json(row);
});

async function getCampanhaPlataforma(tenantId: string, campaignId: string): Promise<"google" | "meta" | "tiktok" | "linkedin" | null> {
  const [row] = await db
    .select({ plataforma: adCampaignsTable.plataforma })
    .from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, campaignId), eq(adCampaignsTable.tenantId, tenantId)));
  return row?.plataforma ?? null;
}

router.post("/tenants/:tenantId/ads/campaigns/:id/publicar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const campaignId = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const plataforma = await getCampanhaPlataforma(tenantId, campaignId);
  if (plataforma !== "google" && plataforma !== "meta") {
    return res.status(422).json({ error: `Publicação automática ainda não implementada pra plataforma "${plataforma ?? "desconhecida"}".` });
  }

  try {
    const publication = await publishCampaignThroughChannelRegistry({
      tenantId,
      campaignId,
      channel: plataforma === "google" ? "google-search" : "meta",
      authorization: "human-approved",
      requireDesignQa: false,
    });
    const result = publication.result;

    logger.info({ tenantId, campaignId, plataforma, activateNow: false }, "ads: campanha publicada via channel bridge");
    await recordAdCampaignEvent({ tenantId, campaignId, userId: (req as any).user?.sub, eventType: "published", severity: "success", message: "Campanha publicada em modo pausado.", metadata: { plataforma, designQa: publication.designQa } });
    return res.status(201).json({ ...result, activated: false, designQa: publication.designQa });
  } catch (err) {
    const failureMessage = err instanceof Error ? err.message : "Falha não identificada ao publicar.";
    await recordAdCampaignEvent({
      tenantId, campaignId, userId: (req as any).user?.sub,
      eventType: /pagamento|payment|billing|saldo|cart[aã]o/i.test(failureMessage) ? "payment_error" : "publish_error",
      severity: "critical",
      message: /pagamento|payment|billing|saldo|cart[aã]o/i.test(failureMessage)
        ? `A plataforma interrompeu a publicação por pagamento: ${failureMessage}`
        : `Não foi possível publicar a campanha: ${failureMessage}`,
      dedupeKey: `publish-error:${new Date().toISOString().slice(0, 13)}`,
      metadata: { plataforma },
    }).catch(() => null);
    if (err instanceof GoogleAdsPublishError || err instanceof MetaAdsPublishError) {
      return res.status(422).json({ error: err.message });
    }
    logger.error({ err, tenantId, campaignId, plataforma }, "ads: erro inesperado ao publicar campanha");
    return res.status(500).json({ error: `Erro inesperado ao publicar campanha no ${plataforma === "google" ? "Google Ads" : "Meta Ads"}.` });
  }
});

router.post("/tenants/:tenantId/ads/campaigns/:id/sync-status", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const campaignId = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const plataforma = await getCampanhaPlataforma(tenantId, campaignId);
  try {
    const platformReview = plataforma === "google"
      ? await syncGoogleAdsReviewStatus(tenantId, campaignId)
      : plataforma === "meta"
        ? await syncMetaAdsReviewStatus(tenantId, campaignId)
        : null;
    if (!platformReview) return res.status(422).json({ error: "Consulta de situação disponível apenas para Google e Meta." });
    const severity = platformReview.status === "reprovada" || platformReview.status === "erro_pagamento" || platformReview.status === "erro_conta" ? "critical" : platformReview.status === "aprovada" ? "success" : "info";
    await recordAdCampaignEvent({ tenantId, campaignId, userId: (req as any).user?.sub, eventType: `review_${platformReview.status}`, severity, message: platformReview.reason ?? `Situação da plataforma: ${platformReview.status}.`, dedupeKey: `review:${platformReview.status}:${platformReview.syncedAt.slice(0, 10)}`, metadata: { plataforma, policyTopics: platformReview.policyTopics ?? [] } });
    return res.json(platformReview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível atualizar a situação da campanha.";
    return res.status(422).json({ error: message });
  }
});

router.post("/tenants/:tenantId/ads/campaigns/:id/ativar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const campaignId = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const plataforma = await getCampanhaPlataforma(tenantId, campaignId);
  if (plataforma !== "google" && plataforma !== "meta") {
    return res.status(422).json({ error: `Ativação automática ainda não implementada pra plataforma "${plataforma ?? "desconhecida"}".` });
  }

  try {
    if (plataforma === "google") await setGoogleAdsCampaignStatus(tenantId, campaignId, true);
    else await setMetaAdsCampaignStatus(tenantId, campaignId, true);
    await recordAdCampaignEvent({ tenantId, campaignId, userId: (req as any).user?.sub, eventType: "activated", severity: "success", message: "Campanha ativada manualmente.", metadata: { plataforma } });
    return res.json({ success: true, status: "ativo" });
  } catch (err) {
    if (err instanceof GoogleAdsPublishError || err instanceof MetaAdsPublishError) {
      return res.status(422).json({ error: err.message });
    }
    logger.error({ err, tenantId, campaignId, plataforma }, "ads: erro inesperado ao ativar campanha");
    return res.status(500).json({ error: `Erro inesperado ao ativar campanha no ${plataforma === "google" ? "Google Ads" : "Meta Ads"}.` });
  }
});

router.post("/tenants/:tenantId/ads/campaigns/:id/pausar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const campaignId = req.params.id as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const plataforma = await getCampanhaPlataforma(tenantId, campaignId);
  if (plataforma !== "google" && plataforma !== "meta") {
    return res.status(422).json({ error: `Pausa automática ainda não implementada pra plataforma "${plataforma ?? "desconhecida"}".` });
  }

  try {
    if (plataforma === "google") await setGoogleAdsCampaignStatus(tenantId, campaignId, false);
    else await setMetaAdsCampaignStatus(tenantId, campaignId, false);
    await recordAdCampaignEvent({ tenantId, campaignId, userId: (req as any).user?.sub, eventType: "paused", severity: "warning", message: "Campanha pausada manualmente.", metadata: { plataforma } });
    return res.json({ success: true, status: "pausado" });
  } catch (err) {
    if (err instanceof GoogleAdsPublishError || err instanceof MetaAdsPublishError) {
      return res.status(422).json({ error: err.message });
    }
    logger.error({ err, tenantId, campaignId, plataforma }, "ads: erro inesperado ao pausar campanha");
    return res.status(500).json({ error: `Erro inesperado ao pausar campanha no ${plataforma === "google" ? "Google Ads" : "Meta Ads"}.` });
  }
});

export default router;

router.get("/tenants/:tenantId/ads/campaigns/:id/performance", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [campanha] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, req.params.id as string), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campanha) return res.status(404).json({ error: "Campanha not found" });

  const [metricasPlataforma] = await db
    .select({
      impressoes: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.impressoes}), 0)`,
      cliques: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.cliques}), 0)`,
      custoTotal: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
    })
    .from(adPerformanceSnapshotsTable)
    .where(eq(adPerformanceSnapshotsTable.campaignId, campanha.id));

  const [leadsGerados] = await db
    .select({ total: sql<number>`count(*)` })
    .from(leadsTable)
    .where(eq(leadsTable.adCampaignId, campanha.id));

  const [negociosGanhos] = await db
    .select({
      total: sql<number>`count(*)`,
      receitaTotal: sql<string>`coalesce(sum(${dealsTable.valor}), 0)`,
    })
    .from(dealsTable)
    .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
    .where(and(eq(leadsTable.adCampaignId, campanha.id), eq(dealsTable.etapa, "ganho")));

  const custo = Number(metricasPlataforma?.custoTotal ?? 0);
  const receita = Number(negociosGanhos?.receitaTotal ?? 0);

  return res.json({
    campanhaId: campanha.id,
    plataforma: {
      impressoes: Number(metricasPlataforma?.impressoes ?? 0),
      cliques: Number(metricasPlataforma?.cliques ?? 0),
      custoTotal: custo,
      obs: custo === 0 ? "Sem snapshot de métricas ainda — depende do job de coleta (aguardando developer token da plataforma)" : undefined,
    },
    conversaoReal: {
      leadsGerados: Number(leadsGerados?.total ?? 0),
      negociosGanhos: Number(negociosGanhos?.total ?? 0),
      receitaTotal: receita,
      roas: custo > 0 ? Number((receita / custo).toFixed(2)) : null,
      obs: "Só conta lead/negócio com ad_campaign_id preenchido — depende de captura de UTM na origem, ainda não conectada em todos os pontos de entrada",
    },
  });
});

router.get("/tenants/:tenantId/ads/shopping-feed/url", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  res.setHeader("Cache-Control", "no-store");
  return res.json({ configured: true });
});

router.post("/tenants/:tenantId/ads/shopping-feed/copy-url", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const token = gerarFeedToken(tenantId);
  const base = process.env.API_PUBLIC_BASE_URL ?? "https://vendorai-platform-replit-production.up.railway.app";
  res.setHeader("Cache-Control", "no-store");
  return res.json({ feedUrl: `${base}/api/public/ads/shopping-feed/${tenantId}.xml?token=${token}` });
});

export const adsPublicRouter: IRouter = Router();
adsPublicRouter.get("/public/ads/shopping-feed/:tenantId.xml", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  const token = (req.query.token as string | undefined) ?? "";
  if (!token || !validarFeedToken(tenantId, token)) {
    return res.status(403).send("Forbidden");
  }
  const xml = await gerarShoppingFeedXml(tenantId, logger);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  return res.send(xml);
});