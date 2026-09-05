import { and, eq } from "drizzle-orm";
import {
  adCreativesTable,
  businessProfilesTable,
  db,
  generatedSitesTable,
  type AdCampaign,
  type AdCreative,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { buildResumoItem } from "../lib/adItemSummary.js";
import { gerarCriativoImagem, type ItemAnunciavelImagem } from "../lib/adContentGeneratorImagem.js";

async function buildPmaxImageItem(tenantId: string, campaign: AdCampaign): Promise<ItemAnunciavelImagem> {
  if ((campaign.itemTipo === "produto" || campaign.itemTipo === "veiculo" || campaign.itemTipo === "imovel") && campaign.itemId) {
    const item = await buildResumoItem(campaign.itemTipo, campaign.itemId, tenantId);
    if (item) return item;
  }

  const [profile] = await db.select().from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
  const details: string[] = [];
  if (profile?.nomeFantasia || profile?.razaoSocial) details.push(`Empresa: ${profile.nomeFantasia || profile.razaoSocial}`);
  if (profile?.vertical) details.push(`Setor: ${profile.vertical}`);
  if (profile?.publicoAlvo) details.push(`Público-alvo: ${profile.publicoAlvo}`);
  if (profile?.diferenciais) details.push(`Diferenciais: ${profile.diferenciais}`);
  if (campaign.itemLabel) details.push(`Oferta/campanha: ${campaign.itemLabel}`);
  if (campaign.vertical) details.push(`Contexto comercial: ${campaign.vertical}`);

  if (campaign.itemTipo === "landing_page" && campaign.landingPageId) {
    const [site] = await db.select({ config: generatedSitesTable.config }).from(generatedSitesTable)
      .where(eq(generatedSitesTable.id, campaign.landingPageId)).limit(1);
    const config = site?.config;
    if (config?.name) details.push(`Landing page: ${config.name}`);
    if (config?.desc) details.push(`Descrição: ${config.desc}`);
    if (config?.pain) details.push(`Dor resolvida: ${config.pain}`);
  }

  return {
    itemTipo: campaign.itemTipo,
    nomeCurto: campaign.itemLabel || profile?.nomeFantasia || campaign.vertical || "Campanha Performance Max",
    resumo: details.length > 0 ? details.join("\n") : `Campanha Performance Max: ${campaign.itemLabel || campaign.vertical}`,
  };
}

export async function ensurePmaxCreativeImage(
  tenantId: string,
  campaign: AdCampaign,
  creative: AdCreative,
): Promise<AdCreative> {
  if (creative.imagens.length > 0) return creative;

  let imageUrl = campaign.imagemEscolhidaUrl || "";
  if (!imageUrl) {
    const [profile] = await db.select().from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
    const item = await buildPmaxImageItem(tenantId, campaign);
    const generated = await gerarCriativoImagem(item, tenantId, profile ?? {}, logger);
    imageUrl = generated?.imageUrl || "";
  }

  if (!imageUrl) {
    throw new Error("Performance Max não conseguiu preparar uma imagem de campanha. Escolha uma imagem na Central de Mídias ou gere o criativo novamente.");
  }

  const [updated] = await db.update(adCreativesTable)
    .set({ imagens: [imageUrl] })
    .where(and(eq(adCreativesTable.id, creative.id), eq(adCreativesTable.campaignId, campaign.id)))
    .returning();
  if (!updated) throw new Error("Não foi possível persistir a imagem do criativo Performance Max.");

  logger.info({ tenantId, campaignId: campaign.id, creativeId: creative.id }, "ads: imagem preparada para Performance Max");
  return updated;
}
