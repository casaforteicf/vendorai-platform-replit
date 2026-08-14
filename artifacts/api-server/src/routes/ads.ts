import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  adCampaignsTable,
  adCreativesTable,
  insertAdCampaignSchema,
  produtosCatalogoTable,
  veiculosEstoqueTable,
  imoveisPropriedadesTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { gerarCriativoRSA, type ItemAnunciavel } from "../lib/adContentGenerator.js";

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
async function buildResumoItem(itemTipo: "produto" | "veiculo" | "imovel", itemId: string, tenantId: string): Promise<ItemAnunciavel | null> {
  if (itemTipo === "produto") {
    const [p] = await db.select().from(produtosCatalogoTable)
      .where(and(eq(produtosCatalogoTable.id, itemId), eq(produtosCatalogoTable.tenantId, tenantId)));
    if (!p) return null;
    const linhas = [
      `Nome: ${p.nome}`,
      p.marca ? `Marca: ${p.marca}` : null,
      `Preço: R$ ${p.precoBase}`,
      p.descricao ? `Descrição: ${p.descricao}` : null,
    ].filter(Boolean);
    return { itemTipo, resumo: linhas.join("\n"), nomeCurto: p.nome };
  }

  if (itemTipo === "veiculo") {
    const [v] = await db.select().from(veiculosEstoqueTable)
      .where(and(eq(veiculosEstoqueTable.id, itemId), eq(veiculosEstoqueTable.tenantId, tenantId)));
    if (!v) return null;
    const linhas = [
      `Veículo: ${v.marca} ${v.modelo}${v.versao ? " " + v.versao : ""}`,
      `Ano: ${v.anoFabricacao ?? "?"}/${v.anoModelo ?? "?"}`,
      v.km != null ? `Quilometragem: ${v.km.toLocaleString("pt-BR")} km` : null,
      v.cor ? `Cor: ${v.cor}` : null,
      v.combustivel ? `Combustível: ${v.combustivel}` : null,
      v.cambio ? `Câmbio: ${v.cambio}` : null,
      `Preço: R$ ${v.valorPromocional ?? v.valor}`,
      v.fipeValor ? `Valor FIPE de referência: R$ ${v.fipeValor} (mês ${v.fipeMesReferencia})` : null,
    ].filter(Boolean);
    return { itemTipo, resumo: linhas.join("\n"), nomeCurto: `${v.marca} ${v.modelo}` };
  }

  // imovel
  const [i] = await db.select().from(imoveisPropriedadesTable)
    .where(and(eq(imoveisPropriedadesTable.id, itemId), eq(imoveisPropriedadesTable.tenantId, tenantId)));
  if (!i) return null;
  const linhas = [
    `Título: ${i.titulo}`,
    `Tipo: ${i.tipo} para ${i.finalidade}`,
    i.bairro || i.cidade ? `Localização: ${[i.bairro, i.cidade].filter(Boolean).join(", ")}` : null,
    i.areaM2 ? `Área: ${i.areaM2} m²` : null,
    i.quartos != null ? `Quartos: ${i.quartos}` : null,
    i.banheiros != null ? `Banheiros: ${i.banheiros}` : null,
    i.vagas != null ? `Vagas de garagem: ${i.vagas}` : null,
    `Valor: R$ ${i.valor}`,
    i.valorCondominio ? `Condomínio: R$ ${i.valorCondominio}` : null,
  ].filter(Boolean);
  return { itemTipo, resumo: linhas.join("\n"), nomeCurto: i.titulo };
}

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

  const [row] = await db.insert(adCampaignsTable).values(parsed.data).returning();
  return res.status(201).json(row);
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

export default router;
