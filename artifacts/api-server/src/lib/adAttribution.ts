/**
 * Atribuição de lead a campanha de anúncio via UTM.
 *
 * Cada ad_campaigns tem um utm_code curto e único (gerado na criação, ver
 * routes/ads.ts). Qualquer link de divulicação dessa campanha (landing
 * page, link direto pro produto) deveria incluir ?utm_campaign={utmCode}
 * — quando um lead chega por esse link, quem cria o lead chama
 * resolveAdCampaignFromUtm() e grava o resultado em leads.ad_campaign_id.
 *
 * PENDÊNCIA CONHECIDA: no momento em que isso foi escrito, não existe no
 * codebase um formulário de contato público genérico por tenant (leads de
 * tenant real chegam majoritariamente por WhatsApp, não formulário web) —
 * então esta função ainda não está conectada em nenhum ponto de captura
 * de lead de tenant. Fica pronta pra plugar assim que uma página pública
 * de produto/veículo/imóvel com formulário for construída, ou se o fluxo
 * do WhatsApp passar a carregar algum parâmetro de referência.
 */
import type { Logger } from "pino";
import { eq, and } from "drizzle-orm";
import { db, adCampaignsTable } from "@workspace/db";

/**
 * Resolve um valor de utm_campaign (vindo da querystring de um link) pra
 * um ad_campaigns.id do tenant — ou null se não bater com nenhuma
 * campanha conhecida (ex: veio de outro lugar, não de um anúncio nosso).
 */
export async function resolveAdCampaignFromUtm(
  tenantId: string,
  utmCampaign: string | null | undefined,
  log: Logger,
): Promise<string | null> {
  if (!utmCampaign?.trim()) return null;

  try {
    const [campanha] = await db
      .select({ id: adCampaignsTable.id })
      .from(adCampaignsTable)
      .where(and(eq(adCampaignsTable.tenantId, tenantId), eq(adCampaignsTable.utmCode, utmCampaign.trim())));
    return campanha?.id ?? null;
  } catch (err) {
    // Atribuição é best-effort — nunca deve derrubar a criação do lead.
    log.warn({ err, tenantId, utmCampaign }, "resolveAdCampaignFromUtm: falha ao resolver, seguindo sem atribuição");
    return null;
  }
}
