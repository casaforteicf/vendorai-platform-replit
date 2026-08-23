import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  adCampaignsTable,
  adCreativesTable,
  adPerformanceSnapshotsTable,
  insertAdCampaignSchema,
  leadsTable,
  dealsTable,
  vehicleAdReservationsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { gerarCriativoRSA } from "../lib/adContentGenerator.js";
import { gerarShoppingFeedXml, gerarFeedToken, validarFeedToken } from "../lib/adShoppingFeed.js";
import { buildResumoItem } from "../lib/adItemSummary.js";
import { decideVehicleReservation, reserveUniqueVehicle } from "../services/vehicle-reservation.js";
import { publishCampaignToGoogleAds, setGoogleAdsCampaignStatus, GoogleAdsPublishError } from "../services/google-ads-campaign-publish.js";

const router: IRouter = Router();

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

router.get("/tenants/:tenantId/ads/campaigns", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const rows = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.tenantId, tenantId));
  return res.json(rows);
});

router.post("/tenants/:tenantId/ads/campaigns", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = insertAdCampaignSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Código curto e único pra usar como utm_campaign em qualquer link de
  // divulgação dessa campanha (ver adAttribution.ts).
  const utmCode = `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  const [row] = await db.insert(adCampaignsTable).values({ ...parsed.data, utmCode }).returning();
  return res.status(201).json(row);
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

  if (campanha.tipoAnuncio !== "rsa_pmax") {
    return res.status(400).json({ error: "Geração de criativo por IA só se aplica a campanhas do tipo rsa_pmax — shopping usa o feed de produto direto" });
  }
  if (!campanha.itemId) {
    return res.status(400).json({ error: "Campanha sem item_id (modo carrossel por categoria) — geração de criativo por item único não se aplica aqui" });
  }

  const item = await buildResumoItem(campanha.itemTipo, campanha.itemId, tenantId);
  if (!item) return res.status(404).json({ error: "Item de origem da campanha não encontrado" });

  const gerado = await gerarCriativoRSA(item, logger);
  if (!gerado) {
    return res.status(502).json({ error: "Falha ao gerar criativo — ver logs do servidor. Tente novamente." });
  }

  const [creative] = await db.insert(adCreativesTable).values({
    campaignId: campanha.id,
    headlines: gerado.headlines,
    descriptions: gerado.descriptions,
    imagens: [],
  }).returning();

  logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative!.id }, "ads: criativo gerado");
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
router.post("/tenants/:tenantId/ads/campaigns/:id/publicar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  try {
    const result = await publishCampaignToGoogleAds(tenantId, req.params.id as string);
    logger.info({ tenantId, campaignId: req.params.id }, "ads: campanha publicada via rota");
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof GoogleAdsPublishError) {
      return res.status(422).json({ error: err.message });
    }
    logger.error({ err, tenantId, campaignId: req.params.id }, "ads: erro inesperado ao publicar campanha");
    return res.status(500).json({ error: "Erro inesperado ao publicar campanha no Google Ads." });
  }
});

router.post("/tenants/:tenantId/ads/campaigns/:id/ativar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  try {
    await setGoogleAdsCampaignStatus(tenantId, req.params.id as string, true);
    return res.json({ success: true, status: "ativo" });
  } catch (err) {
    if (err instanceof GoogleAdsPublishError) {
      return res.status(422).json({ error: err.message });
    }
    logger.error({ err, tenantId, campaignId: req.params.id }, "ads: erro inesperado ao ativar campanha");
    return res.status(500).json({ error: "Erro inesperado ao ativar campanha no Google Ads." });
  }
});

router.post("/tenants/:tenantId/ads/campaigns/:id/pausar", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  try {
    await setGoogleAdsCampaignStatus(tenantId, req.params.id as string, false);
    return res.json({ success: true, status: "pausado" });
  } catch (err) {
    if (err instanceof GoogleAdsPublishError) {
      return res.status(422).json({ error: err.message });
    }
    logger.error({ err, tenantId, campaignId: req.params.id }, "ads: erro inesperado ao pausar campanha");
    return res.status(500).json({ error: "Erro inesperado ao pausar campanha no Google Ads." });
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
