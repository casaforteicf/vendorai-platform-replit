/**
 * Criação automática de campanha de anúncio quando um item entra no ar
 * publicamente (veículo com vistoria confirmada + status disponível;
 * imóvel disponível + vendeNoPracaAi=true). Chamado a partir de
 * routes/veiculos.ts e routes/imoveis.ts, no mesmo ponto que já decide se
 * o item fica visível no Praça.ai.
 *
 * Sempre cria em modo rascunho + gera o criativo — NUNCA aprova nem
 * publica sozinho. A aprovação continua manual (tela /ads), e a
 * publicação de verdade na plataforma segue bloqueada até o developer
 * token estar disponível de qualquer forma.
 */
import type { Logger } from "pino";
import { and, eq } from "drizzle-orm";
import { db, adCampaignsTable, adCreativesTable } from "@workspace/db";
import { buildResumoItem } from "./adItemSummary.js";
import { gerarCriativoRSA } from "./adContentGenerator.js";

/** Orçamento diário sugerido pra campanha criada automaticamente — só um
 * ponto de partida pro usuário revisar/ajustar antes de qualquer ativação
 * real; nada é gasto de verdade enquanto a campanha não for publicada. */
const ORCAMENTO_DIARIO_PADRAO = "20.00";

export async function autoCreateAdCampaignIfNeeded(
  params: { tenantId: string; itemTipo: "veiculo" | "imovel"; itemId: string; vertical: string },
  log: Logger,
): Promise<void> {
  const { tenantId, itemTipo, itemId, vertical } = params;

  try {
    const [existing] = await db
      .select({ id: adCampaignsTable.id })
      .from(adCampaignsTable)
      .where(and(
        eq(adCampaignsTable.tenantId, tenantId),
        eq(adCampaignsTable.itemTipo, itemTipo),
        eq(adCampaignsTable.itemId, itemId),
      ));
    if (existing) return; // já tem campanha pra esse item — não duplica a cada edição

    const utmCode = `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const [campanha] = await db.insert(adCampaignsTable).values({
      tenantId,
      plataforma: "google",
      tipoAnuncio: "rsa_pmax",
      vertical,
      itemTipo,
      itemId,
      modo: "unico",
      destinoClique: "whatsapp",
      orcamentoDiario: ORCAMENTO_DIARIO_PADRAO,
      utmCode,
    }).returning();

    log.info({ tenantId, itemTipo, itemId, campanhaId: campanha!.id }, "adAutoCreate: campanha criada automaticamente");

    const item = await buildResumoItem(itemTipo, itemId, tenantId);
    if (!item) return;

    const gerado = await gerarCriativoRSA(item, log);
    if (!gerado) {
      log.warn({ tenantId, itemId, campanhaId: campanha!.id }, "adAutoCreate: campanha criada mas geração de criativo falhou — usuário pode gerar manualmente na tela");
      return;
    }

    await db.insert(adCreativesTable).values({
      campaignId: campanha!.id,
      headlines: gerado.headlines,
      descriptions: gerado.descriptions,
      imagens: [],
    });
    log.info({ tenantId, campanhaId: campanha!.id }, "adAutoCreate: criativo gerado automaticamente, aguardando aprovação");
  } catch (err) {
    // Automação é best-effort — nunca deve derrubar o fluxo de publicar
    // veículo/imóvel por causa disso.
    log.error({ err, tenantId, itemTipo, itemId }, "adAutoCreate: falha ao criar campanha automática, seguindo sem ela");
  }
}
