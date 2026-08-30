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
  businessProfilesTable,
  generatedSitesTable,
  contentGenerationsTable,
  contentPublishedPostsTable,
} from "@workspace/db";
import type { AdCampaign } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { gerarCriativoRSA } from "../lib/adContentGenerator.js";
import { gerarCriativoImagem } from "../lib/adContentGeneratorImagem.js";
import { gerarShoppingFeedXml, gerarFeedToken, validarFeedToken } from "../lib/adShoppingFeed.js";
import { buildResumoItem } from "../lib/adItemSummary.js";
import { decideVehicleReservation, reserveUniqueVehicle } from "../services/vehicle-reservation.js";
import { enrichAdsSegmentacao } from "../services/ad-audience-plan.js";
import { publishCampaignToGoogleAds, setGoogleAdsCampaignStatus, syncGoogleAdsReviewStatus, GoogleAdsPublishError } from "../services/google-ads-campaign-publish.js";
import { publishCampaignToMetaAds, setMetaAdsCampaignStatus, syncMetaAdsReviewStatus, MetaAdsPublishError } from "../services/meta-ads-campaign-publish.js";

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

  const parsed = insertAdCampaignSchema.safeParse({ ...req.body, tenantId });
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
      .select({ instagramMediaId: contentPublishedPostsTable.instagramMediaId })
      .from(contentPublishedPostsTable)
      .where(and(
        eq(contentPublishedPostsTable.tenantId, tenantId),
        eq(contentPublishedPostsTable.contentGenerationId, parsed.data.contentGenerationId),
        eq(contentPublishedPostsTable.variationIndex, sourceVariationIndex),
      ))
      .orderBy(desc(contentPublishedPostsTable.publishedAt))
      .limit(1);
    if (publishedPost?.instagramMediaId) {
      segmentacao = { ...segmentacao, origemInstagram: { mediaId: publishedPost.instagramMediaId, variationIndex: sourceVariationIndex, contentGenerationId: parsed.data.contentGenerationId } };
    }
  }

  // Código curto e único pra usar como utm_campaign em qualquer link de
  // divulgação dessa campanha (ver adAttribution.ts).
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
  return res.status(201).json({ ...row, latestCreative: importedCreative });
});

// Chamado pelo canal que confirmou o interesse (WhatsApp, formulário ou ação
// manual). Para veículo único, pausa a mídia, reserva o estoque e abre/vincula
// o negócio ao vendedor com SLA configurável (48h por padrão).
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

router.post("/tenants/:tenantId/ads/campaigns/:id/gerar-criativo", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [campanha] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, req.params.id as string), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campanha) return res.status(404).json({ error: "Campanha not found" });

  if (campanha.tipoAnuncio !== "rsa_pmax" && campanha.tipoAnuncio !== "imagem") {
    return res.status(400).json({ error: "Geração de criativo por IA só se aplica a campanhas do tipo rsa_pmax ou imagem — shopping usa o feed de produto direto" });
  }
  if (campanha.itemTipo !== "landing_page" && campanha.itemTipo !== "livre" && !campanha.itemId) {
    return res.status(400).json({ error: "Campanha sem item_id (modo carrossel por categoria) — geração de criativo por item único não se aplica aqui" });
  }

  // buildResumoItem só cobre produto/veiculo/imovel — landing_page/livre
  // não têm registro estruturado de item pra ler, então montam o resumo a
  // partir do perfil do negócio (+ dados da LP, quando houver uma ligada).
  const item = (campanha.itemTipo === "produto" || campanha.itemTipo === "veiculo" || campanha.itemTipo === "imovel")
    ? await buildResumoItem(campanha.itemTipo, campanha.itemId as string, tenantId)
    : { itemTipo: campanha.itemTipo, resumo: await buildResumoLivreOuLandingPage(campanha, tenantId), nomeCurto: campanha.itemLabel || campanha.vertical };
  if (!item) return res.status(404).json({ error: "Item de origem da campanha não encontrado" });

  if (campanha.tipoAnuncio === "rsa_pmax") {
    const gerado = await gerarCriativoRSA(item as any, logger, tenantId);
    if (!gerado) return res.status(502).json({ error: "Falha ao gerar criativo — ver logs do servidor. Tente novamente." });

    const [creative] = await db.insert(adCreativesTable).values({
      campaignId: campanha.id,
      headlines: gerado.headlines,
      descriptions: gerado.descriptions,
      imagens: [],
    }).returning();

    logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative!.id }, "ads: criativo RSA gerado");
    return res.status(201).json(creative);
  }

  // tipoAnuncio === "imagem" (Meta Feed Ads e afins)
  // Se o usuário escolheu uma foto real do item no formulário
  // (imagemEscolhidaUrl), usa ela direto — só o texto (headline/corpo)
  // ainda vem da IA. Sem isso, gera a imagem também via IA como sempre.
  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));

  if (campanha.imagemEscolhidaUrl) {
    const gerado = await gerarCriativoImagem(item, tenantId, profile ?? {}, logger, { pularGeracaoDeImagem: true });
    if (!gerado) return res.status(502).json({ error: "Falha ao gerar o texto do criativo — ver logs do servidor. Tente novamente." });

    const [creative] = await db.insert(adCreativesTable).values({
      campaignId: campanha.id,
      headlines: [gerado.headline, gerado.primaryText],
      descriptions: gerado.description ? [gerado.description] : [],
      imagens: [campanha.imagemEscolhidaUrl],
    }).returning();

    logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative!.id }, "ads: criativo de imagem gerado (foto escolhida pelo usuário)");
    return res.status(201).json(creative);
  }

  const gerado = await gerarCriativoImagem(item, tenantId, profile ?? {}, logger);
  if (!gerado) return res.status(502).json({ error: "Falha ao gerar criativo de imagem — ver logs do servidor. Tente novamente." });

  // Reaproveita headlines[0]=headline, headlines[1]=primaryText,
  // descriptions[0]=description — evita coluna nova só pra isso, já que
  // adCreativesTable já tem os 3 arrays genéricos certos pro conteúdo.
  const [creative] = await db.insert(adCreativesTable).values({
    campaignId: campanha.id,
    headlines: [gerado.headline, gerado.primaryText],
    descriptions: gerado.description ? [gerado.description] : [],
    imagens: [gerado.imageUrl],
  }).returning();

  logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative!.id }, "ads: criativo de imagem gerado");
  return res.status(201).json(creative);
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

// ─── Publicação real na API do Google Ads ──────────────────────────────────
//
// publicar: cria campanha+orçamento+grupo+anúncio na conta real do
// tenant, TUDO pausado (não gasta nada ainda) — o "rascunho aprovado"
// vira estrutura de verdade na plataforma, esperando revisão.
// ativar/pausar: única ação que de fato liga/desliga veiculação real.
// Ambas exigem clique explícito do lojista — nada aqui roda sozinho.
//
// As 3 rotas abaixo despacham pro serviço certo (Google ou Meta) de
// acordo com ad_campaigns.plataforma — mesmo contrato de rota pros dois,
// só troca o motor por baixo.
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
    const result = plataforma === "google"
      ? await publishCampaignToGoogleAds(tenantId, campaignId)
      : await publishCampaignToMetaAds(tenantId, campaignId);
    logger.info({ tenantId, campaignId, plataforma }, "ads: campanha publicada via rota");
    return res.status(201).json(result);
  } catch (err) {
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

// ─── Performance / atribuição ──────────────────────────────────────────────
//
// Combina o que a própria plataforma reporta (impressões/cliques/custo —
// só existe depois que o job de coleta rodar, que depende do developer
// token aprovado) com o que a GENTE sabe de verdade: quantos leads e
// negócios ganhos vieram de cada campanha (via leads.ad_campaign_id).
// Isso é mais confiável que CTR/CPC isolado — mostra se a campanha trouxe
// venda de verdade, não só clique.
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

// ─── Feed do Google Shopping (Merchant Center) ────────────────────────────────
//
// Endpoint AUTENTICADO: devolve a URL assinada do feed (o Merchant Center
// não autentica com JWT, então o feed em si fica atrás de um token HMAC na
// própria URL — mesmo princípio do secret usado no webhook do WhatsApp).
router.get("/tenants/:tenantId/ads/shopping-feed/url", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const token = gerarFeedToken(tenantId);
  const base = process.env.API_PUBLIC_BASE_URL ?? "https://vendorai-platform-replit-production.up.railway.app";
  return res.json({ feedUrl: `${base}/api/public/ads/shopping-feed/${tenantId}.xml?token=${token}` });
});

// Endpoint PÚBLICO (sem middleware de autenticação — precisa ser
// registrado antes do `authenticate` global, mesmo padrão de
// publicSiteRouter/fretesPublicRouter): é isso que o Google Merchant
// Center de fato busca periodicamente.
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
