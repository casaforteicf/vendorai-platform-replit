import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  adCampaignsTable,
  db,
  leadsTable,
  scoutOportunidadesTable,
} from "@workspace/db";

export type LaunchRevenueScoutFilters = {
  period?: "7d" | "30d" | "90d" | "all";
  platform?: string | null;
  campaignId?: string | null;
  landingPageId?: string | null;
  vertical?: string | null;
  intentTier?: "baixo" | "medio" | "alto" | "muito_alto" | null;
};

function dateScope(period: NonNullable<LaunchRevenueScoutFilters["period"]>) {
  const to = new Date();
  if (period === "all") return { from: null as Date | null, to };
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function behaviorIntentTier(discoveryData: Record<string, unknown> | null | undefined) {
  const raw = discoveryData?.["behaviorIntent"];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value["tier"] === "string") return value["tier"];
  const score = Number(value["score"]);
  if (!Number.isFinite(score)) return null;
  return score >= 80 ? "muito_alto" : score >= 60 ? "alto" : score >= 35 ? "medio" : "baixo";
}

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const CLOSED_STATUSES = new Set(["converteu", "ignorado"]);

/**
 * Revenue Scout attribution for the Launch Command Center.
 *
 * This is intentionally separate from Behavior Intent and Commercial Fit.
 * A Scout opportunity is attributed only through a real relational chain:
 * scout_oportunidades.cliente_id -> leads.id -> leads.ad_campaign_id.
 */
export async function getLaunchRevenueScout(tenantId: string, rawFilters: LaunchRevenueScoutFilters = {}) {
  const filters = {
    period: rawFilters.period ?? "30d",
    platform: rawFilters.platform || null,
    campaignId: rawFilters.campaignId || null,
    landingPageId: rawFilters.landingPageId || null,
    vertical: rawFilters.vertical || null,
    intentTier: rawFilters.intentTier || null,
  };
  const scope = dateScope(filters.period);

  const campaigns = await db.select({
    id: adCampaignsTable.id,
    itemLabel: adCampaignsTable.itemLabel,
    plataforma: adCampaignsTable.plataforma,
    vertical: adCampaignsTable.vertical,
    landingPageId: adCampaignsTable.landingPageId,
  }).from(adCampaignsTable).where(eq(adCampaignsTable.tenantId, tenantId));

  const selected = campaigns.filter((campaign) => {
    if (filters.platform && campaign.plataforma !== filters.platform) return false;
    if (filters.campaignId && campaign.id !== filters.campaignId) return false;
    if (filters.landingPageId && campaign.landingPageId !== filters.landingPageId) return false;
    if (filters.vertical && campaign.vertical !== filters.vertical) return false;
    return true;
  });

  if (selected.length === 0) {
    return {
      attributed: true,
      opportunities: 0,
      open: 0,
      highPriority: 0,
      converted: 0,
      openEstimatedValue: 0,
      convertedEstimatedValue: 0,
      avgPriority: null,
      conversionRate: null,
      topOpportunities: [],
      note: "Revenue Scout sem oportunidades atribuíveis ao recorte atual.",
    };
  }

  const conditions = [
    eq(scoutOportunidadesTable.tenantId, tenantId),
    inArray(leadsTable.adCampaignId, selected.map((campaign) => campaign.id)),
    isNull(leadsTable.excluidoEm),
    isNull(leadsTable.naoLeadTipo),
  ];
  if (scope.from) conditions.push(gte(scoutOportunidadesTable.createdAt, scope.from));
  conditions.push(lte(scoutOportunidadesTable.createdAt, scope.to));

  const rows = await db.select({
    id: scoutOportunidadesTable.id,
    leadId: scoutOportunidadesTable.clienteId,
    campaignId: leadsTable.adCampaignId,
    discoveryData: leadsTable.discoveryData,
    tipo: scoutOportunidadesTable.tipo,
    descricao: scoutOportunidadesTable.descricao,
    valorEstimado: scoutOportunidadesTable.valorEstimado,
    status: scoutOportunidadesTable.status,
    converteu: scoutOportunidadesTable.converteu,
    score: scoutOportunidadesTable.scoreOportunidade,
    pipelineStage: scoutOportunidadesTable.pipelineStage,
    humanRequired: scoutOportunidadesTable.humanRequired,
    createdAt: scoutOportunidadesTable.createdAt,
  })
    .from(scoutOportunidadesTable)
    .innerJoin(leadsTable, eq(leadsTable.id, scoutOportunidadesTable.clienteId))
    .where(and(...conditions));

  const cohortRows = filters.intentTier
    ? rows.filter((row) => behaviorIntentTier(row.discoveryData) === filters.intentTier)
    : rows;

  const convertedRows = cohortRows.filter((row) => row.converteu === true || row.status === "converteu");
  const openRows = cohortRows.filter((row) => !row.converteu && !CLOSED_STATUSES.has(row.status ?? ""));
  const highPriorityRows = openRows.filter((row) => numeric(row.score) >= 70);
  const openEstimatedValue = openRows.reduce((sum, row) => sum + numeric(row.valorEstimado), 0);
  const convertedEstimatedValue = convertedRows.reduce((sum, row) => sum + numeric(row.valorEstimado), 0);
  const scored = cohortRows.map((row) => numeric(row.score)).filter((score) => score > 0);
  const avgPriority = scored.length
    ? Number((scored.reduce((sum, score) => sum + score, 0) / scored.length).toFixed(1))
    : null;
  const conversionRate = cohortRows.length
    ? Number(((convertedRows.length / cohortRows.length) * 100).toFixed(1))
    : null;

  const campaignLabel = new Map(selected.map((campaign) => [campaign.id, campaign.itemLabel || campaign.vertical || campaign.id]));
  const topOpportunities = [...openRows]
    .sort((a, b) => numeric(b.score) - numeric(a.score) || numeric(b.valorEstimado) - numeric(a.valorEstimado))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      leadId: row.leadId,
      campaignId: row.campaignId,
      campaignLabel: row.campaignId ? campaignLabel.get(row.campaignId) ?? row.campaignId : "Sem campanha",
      tipo: row.tipo,
      descricao: row.descricao,
      status: row.status,
      pipelineStage: row.pipelineStage,
      score: numeric(row.score),
      estimatedValue: numeric(row.valorEstimado),
      humanRequired: row.humanRequired,
      createdAt: row.createdAt.toISOString(),
    }));

  return {
    attributed: true,
    opportunities: cohortRows.length,
    open: openRows.length,
    highPriority: highPriorityRows.length,
    converted: convertedRows.length,
    openEstimatedValue,
    convertedEstimatedValue,
    avgPriority,
    conversionRate,
    topOpportunities,
    note: "Atribuição Revenue Scout: oportunidade -> lead -> campanha. Os filtros de campanha, vertical, plataforma, período e intenção são respeitados.",
  };
}
