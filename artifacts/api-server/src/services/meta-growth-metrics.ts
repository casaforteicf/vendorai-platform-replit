export function isPaidMetaLead(lead: {
  source: string;
  adCampaignId: string | null;
  campaignPlatform?: string | null;
}) {
  const value = lead.source.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // A campanha vinculada no CRM é a fonte autoritativa quando a plataforma é conhecida.
  // Isso evita classificar como Meta pago um lead originalmente atribuído ao Google.
  if (lead.adCampaignId && lead.campaignPlatform) {
    return lead.campaignPlatform === "meta";
  }

  // Fallback legado para leads Meta sem campanha resolvida.
  return value.includes("meta ads")
    || value.includes("facebook ads")
    || value.includes("instagram ads")
    || value.includes("anuncio")
    || value.includes("patrocin");
}

export type MetaDealForSummary = {
  leadId: string | null;
  valor: string | null;
  etapa: string;
  wonAt: Date | null;
  dataFechamento: Date | null;
  createdAt: Date;
};

export function summarizeMetaCommercialResults(params: {
  metaLeadIds: string[];
  paidMetaLeadIds: string[];
  deals: MetaDealForSummary[];
  cutoff: Date;
}) {
  const metaLeadSet = new Set(params.metaLeadIds);
  const paidMetaLeadSet = new Set(params.paidMetaLeadIds);
  const metaDeals = params.deals.filter((deal) => deal.leadId && metaLeadSet.has(deal.leadId));

  const openDeals = metaDeals.filter((deal) => !["ganho", "perdido"].includes(deal.etapa));
  const wonDeals = metaDeals.filter((deal) => {
    if (deal.etapa !== "ganho") return false;
    const closedAt = deal.dataFechamento ?? deal.wonAt ?? deal.createdAt;
    return closedAt >= params.cutoff;
  });
  const paidWonDeals = wonDeals.filter((deal) => deal.leadId && paidMetaLeadSet.has(deal.leadId));

  const sumValue = (rows: MetaDealForSummary[]) => rows.reduce(
    (sum, deal) => sum + (deal.valor ? Number(deal.valor) || 0 : 0),
    0,
  );

  return {
    opportunities30d: openDeals.length,
    pipelineValue30d: sumValue(openDeals),
    sales30d: wonDeals.length,
    revenueClosed30d: sumValue(wonDeals),
    paidSales30d: paidWonDeals.length,
    paidRevenueClosed30d: sumValue(paidWonDeals),
  };
}
