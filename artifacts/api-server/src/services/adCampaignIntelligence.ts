import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  adCampaignEventsTable,
  adCampaignsTable,
  adPerformanceSnapshotsTable,
  db,
  dealsTable,
  leadsTable,
  notificationsTable,
} from "@workspace/db";

export async function recordAdCampaignEvent(input: {
  tenantId: string;
  campaignId: string;
  userId?: string | null;
  eventType: string;
  severity?: "info" | "warning" | "critical" | "success";
  message: string;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [event] = await db.insert(adCampaignEventsTable).values({
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    userId: input.userId ?? null,
    eventType: input.eventType,
    severity: input.severity ?? "info",
    message: input.message,
    dedupeKey: input.dedupeKey ?? null,
    metadata: input.metadata ?? {},
  }).onConflictDoNothing().returning();
  if (event && (event.severity === "warning" || event.severity === "critical")) {
    await db.insert(notificationsTable).values({
      tenantId: input.tenantId,
      type: event.severity === "critical" ? "error" : "warning",
      category: "ads",
      title: event.severity === "critical" ? "Anúncio exige ação" : "Atenção na campanha",
      message: input.message,
    });
  }
  return event ?? null;
}

function daysRemaining(endDate?: string) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T23:59:59-03:00`).getTime();
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

export async function getAdsOverview(tenantId: string) {
  const campaigns = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.tenantId, tenantId))
    .orderBy(desc(adCampaignsTable.updatedAt));

  const activeAlerts = await db.select().from(adCampaignEventsTable)
    .where(and(eq(adCampaignEventsTable.tenantId, tenantId), isNull(adCampaignEventsTable.resolvedAt)))
    .orderBy(desc(adCampaignEventsTable.createdAt));
  const alertsByCampaign = new Map<string, typeof activeAlerts>();
  for (const alert of activeAlerts) {
    const list = alertsByCampaign.get(alert.campaignId) ?? [];
    list.push(alert);
    alertsByCampaign.set(alert.campaignId, list);
  }

  const rows = [];
  for (const campaign of campaigns) {
    const [platform] = await db.select({
      impressions: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.impressoes}), 0)`,
      clicks: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.cliques}), 0)`,
      spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
      platformConversions: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.conversoesPlataforma}), 0)`,
    }).from(adPerformanceSnapshotsTable)
      .where(eq(adPerformanceSnapshotsTable.campaignId, campaign.id));

    const [leadStats] = await db.select({ total: sql<number>`count(*)` })
      .from(leadsTable).where(eq(leadsTable.adCampaignId, campaign.id));
    const [sales] = await db.select({
      total: sql<number>`count(*)`,
      revenue: sql<string>`coalesce(sum(${dealsTable.valor}), 0)`,
    }).from(dealsTable)
      .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
      .where(and(eq(leadsTable.adCampaignId, campaign.id), eq(dealsTable.etapa, "ganho")));

    const spend = Number(platform?.spend ?? 0);
    const leads = Number(leadStats?.total ?? 0);
    const salesCount = Number(sales?.total ?? 0);
    const revenue = Number(sales?.revenue ?? 0);
    const roas = spend > 0 ? Number((revenue / spend).toFixed(2)) : null;
    const costPerLead = leads > 0 ? Number((spend / leads).toFixed(2)) : null;
    const costPerSale = salesCount > 0 ? Number((spend / salesCount).toFixed(2)) : null;
    const leadToSaleRate = leads > 0 ? Number(((salesCount / leads) * 100).toFixed(2)) : null;
    const revenuePerLead = leads > 0 ? Number((revenue / leads).toFixed(2)) : null;
    const control = campaign.segmentacao?.campaignControl;
    const remaining = daysRemaining(control?.endDate);
    const alerts = [...(alertsByCampaign.get(campaign.id) ?? [])];

    if (remaining !== null && remaining <= 2 && campaign.status === "ativo") {
      alerts.push({
        id: `computed-ending-${campaign.id}`,
        tenantId,
        campaignId: campaign.id,
        userId: null,
        eventType: "ending_soon",
        severity: "warning",
        message: remaining === 0 ? "A campanha termina hoje." : `A campanha termina em ${remaining} dia(s).`,
        dedupeKey: null,
        metadata: {},
        resolvedAt: null,
        createdAt: new Date(),
      });
    }

    let recommendation: { title: string; reason: string; action: string; requiresApproval: boolean } | null = null;
    if (campaign.segmentacao?.platformReview?.status === "reprovada") {
      recommendation = { title: "Corrigir o criativo", reason: campaign.segmentacao.platformReview.reason ?? "A plataforma reprovou o anúncio.", action: "correct_creative", requiresApproval: false };
    } else if (spend > 0 && leads === 0) {
      recommendation = { title: "Revisar público e oferta", reason: `Já foram gastos R$ ${spend.toFixed(2)} sem lead atribuído.`, action: "review_targeting", requiresApproval: false };
    } else if (leads >= 5 && salesCount === 0) {
      recommendation = {
        title: "Otimizar para venda, não só para lead",
        reason: `${leads} leads atribuídos, mas nenhuma venda fechada. Revise qualidade do público, promessa da LP, qualificação e follow-up antes de aumentar verba.`,
        action: "review_lead_quality",
        requiresApproval: false,
      };
    } else if (salesCount >= 2 && roas !== null && roas >= 3) {
      recommendation = {
        title: "Campanha vencedora — considerar escala",
        reason: `${salesCount} venda(s), CAC de ${costPerSale !== null ? `R$ ${costPerSale.toFixed(2)}` : "n/d"} e ROAS ${roas.toFixed(2)}x. Aumente verba somente dentro dos limites aprovados.`,
        action: "scale_winner",
        requiresApproval: true,
      };
    } else if (leads >= 3 && revenue > spend && remaining !== null && remaining <= 2) {
      recommendation = { title: "Considerar prolongar a campanha", reason: `${leads} leads e R$ ${revenue.toFixed(2)} em receita atribuída.`, action: "extend_campaign", requiresApproval: true };
    } else if (Number(platform?.clicks ?? 0) >= 30 && leads === 0) {
      recommendation = { title: "Melhorar a página ou chamada", reason: "Há cliques, mas nenhum contato atribuído.", action: "improve_destination", requiresApproval: false };
    }

    rows.push({
      campaignId: campaign.id,
      label: campaign.itemLabel || campaign.vertical,
      plataforma: campaign.plataforma,
      status: campaign.status,
      objective: control?.objective ?? null,
      startDate: control?.startDate ?? null,
      endDate: control?.endDate ?? null,
      daysRemaining: remaining,
      plannedBudget: Number(control?.totalBudget ?? 0),
      dailyBudget: Number(campaign.orcamentoDiario),
      spend,
      impressions: Number(platform?.impressions ?? 0),
      clicks: Number(platform?.clicks ?? 0),
      platformConversions: Number(platform?.platformConversions ?? 0),
      leads,
      sales: salesCount,
      revenue,
      costPerLead,
      costPerSale,
      leadToSaleRate,
      revenuePerLead,
      roas,
      alerts,
      recommendation,
    });
  }

  return {
    totals: rows.reduce((total, row) => ({
      plannedBudget: total.plannedBudget + row.plannedBudget,
      spend: total.spend + row.spend,
      leads: total.leads + row.leads,
      sales: total.sales + row.sales,
      revenue: total.revenue + row.revenue,
      activeCampaigns: total.activeCampaigns + (row.status === "ativo" ? 1 : 0),
      unresolvedAlerts: total.unresolvedAlerts + row.alerts.length,
    }), { plannedBudget: 0, spend: 0, leads: 0, sales: 0, revenue: 0, activeCampaigns: 0, unresolvedAlerts: 0 }),
    campaigns: rows,
  };
}