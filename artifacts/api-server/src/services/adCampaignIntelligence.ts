import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  adCampaignEventsTable,
  adCampaignsTable,
  adPerformanceSnapshotsTable,
  db,
  dealsTable,
  leadsTable,
  notificationsTable,
  tenantsTable,
  webBehaviorEventsTable,
} from "@workspace/db";
import { canonicalDealValueSql } from "../lib/deal-value.js";

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

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

function moneyRatio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(2)) : null;
}

function behaviorIntentFromDiscovery(discoveryData: Record<string, unknown> | null | undefined) {
  const raw = discoveryData?.["behaviorIntent"];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const score = Number(value["score"]);
  if (!Number.isFinite(score)) return null;
  const tier = typeof value["tier"] === "string" ? value["tier"] : score >= 80 ? "muito_alto" : score >= 60 ? "alto" : score >= 35 ? "medio" : "baixo";
  return { score, tier };
}

function launchDiagnosis(input: {
  spend: number;
  clicks: number;
  visitors: number;
  leads: number;
  avgBehaviorIntent: number | null;
  trials: number;
  activatedTrials: number;
  sales: number;
  revenue: number;
  recoveredLeads: number;
}) {
  const { spend, clicks, visitors, leads, avgBehaviorIntent, trials, activatedTrials, sales, revenue, recoveredLeads } = input;
  if (spend > 0 && clicks < 20) {
    return { stage: "aquisicao", title: "Aquisição ainda insuficiente", evidence: `R$ ${spend.toFixed(2)} investidos e apenas ${clicks} clique(s).`, impact: "Pouco volume chega às páginas para validar oferta e criativo.", action: "Revisar público, palavra-chave, criativo e distribuição de verba antes de aumentar orçamento." };
  }
  if (clicks >= 30 && visitors > 0 && leads === 0) {
    return { stage: "lp", title: "Cliques não viram leads", evidence: `${clicks} cliques e ${visitors} visitante(s), sem lead atribuído.`, impact: "O investimento chega à página, mas não avança para contato.", action: "Revisar aderência anúncio↔LP, proposta, CTA, formulário e prova de valor." };
  }
  if (leads >= 5 && avgBehaviorIntent !== null && avgBehaviorIntent < 35) {
    return { stage: "qualidade_intencao", title: "Leads com baixa intenção", evidence: `${leads} leads com Behavior Intent médio ${avgBehaviorIntent.toFixed(0)}/100.`, impact: "O funil recebe contatos, mas o interesse observado antes da conversão é fraco.", action: "Refinar público e promessa; priorizar campanhas/LPs que gerem comportamento de maior intenção." };
  }
  if (trials >= 3 && activatedTrials === 0) {
    return { stage: "ativacao_trial", title: "Trial não chega ao primeiro valor", evidence: `${trials} trial(s) iniciados e nenhum ativado.`, impact: "Há intenção suficiente para testar, mas o usuário não chega ao uso operacional.", action: "Reduzir fricção no onboarding e conduzir o usuário ao primeiro lead/integração nos primeiros minutos." };
  }
  if (activatedTrials >= 3 && sales === 0) {
    return { stage: "fechamento", title: "Uso acontece, venda não", evidence: `${activatedTrials} trial(s) ativados e nenhuma venda.`, impact: "O produto entrega uso, mas a demonstração de valor/oferta não fecha o contrato.", action: "Acionar comercial nos trials de maior intenção, mostrar valor gerado e revisar oferta/objeções." };
  }
  if (leads >= 5 && recoveredLeads === 0 && sales === 0) {
    return { stage: "follow_up", title: "Follow-up não está recuperando oportunidades", evidence: `${leads} leads, nenhuma venda e nenhum lead recuperado registrado.`, impact: "Oportunidades podem estar morrendo após o primeiro contato.", action: "Revisar cadência, mensagens e gatilhos de recuperação antes de ampliar aquisição." };
  }
  if (sales >= 2 && spend > 0 && revenue / spend >= 3) {
    return { stage: "escala", title: "Funil com sinal de escala", evidence: `${sales} venda(s), R$ ${revenue.toFixed(2)} de receita e ROAS ${(revenue / spend).toFixed(2)}x.`, impact: "Há evidência comercial, não apenas clique/lead, de que o funil está funcionando.", action: "Considerar escala gradual somente dentro do limite de orçamento aprovado e monitorando CAC/ativação." };
  }
  return { stage: "aprendizado", title: "Funil em aprendizado", evidence: `${leads} lead(s), ${trials} trial(s), ${activatedTrials} ativado(s) e ${sales} venda(s).`, impact: "Ainda não há volume suficiente para declarar um gargalo dominante com confiança.", action: "Manter coleta, priorizar velocidade de atendimento e não escalar campanha apenas por CTR/CPL." };
}

export async function getAdsOverview(tenantId: string) {
  const campaigns = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.tenantId, tenantId))
    .orderBy(desc(adCampaignsTable.updatedAt));

  const activeAlerts = await db.select().from(adCampaignEventsTable)
    .where(and(
      eq(adCampaignEventsTable.tenantId, tenantId),
      isNull(adCampaignEventsTable.resolvedAt),
      inArray(adCampaignEventsTable.severity, ["warning", "critical"]),
    ))
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

    const [lifecycleStats] = await db.select({
      trials: sql<number>`count(*) filter (where ${adCampaignEventsTable.eventType} = 'trial_started')`,
      activatedTrials: sql<number>`coalesce(sum(case
        when ${adCampaignEventsTable.eventType} = 'trial_started'
          and exists (
            select 1 from ${tenantsTable} as trial_tenant
            where trial_tenant.id = (${adCampaignEventsTable.metadata}->>'trialTenantId')
              and trial_tenant.onboarding_concluido = true
              and (
                trial_tenant.integracoes_concluido = true
                or exists (
                  select 1 from ${leadsTable} as trial_lead
                  where trial_lead.tenant_id = trial_tenant.id
                    and trial_lead.excluido_em is null
                    and trial_lead.nao_lead_tipo is null
                )
              )
          )
        then 1 else 0 end), 0)`,
      recoveredLeads: sql<number>`count(*) filter (where ${adCampaignEventsTable.eventType} = 'lead_recovered')`,
      coolingLeads: sql<number>`count(*) filter (where ${adCampaignEventsTable.eventType} = 'lead_cooling')`,
    }).from(adCampaignEventsTable)
      .where(and(eq(adCampaignEventsTable.tenantId, tenantId), eq(adCampaignEventsTable.campaignId, campaign.id)));

    const [sales] = await db.select({
      total: sql<number>`count(*)`,
      revenue: sql<string>`coalesce(sum(${canonicalDealValueSql}), 0)`,
    }).from(dealsTable)
      .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
      .where(and(eq(leadsTable.adCampaignId, campaign.id), eq(dealsTable.etapa, "ganho")));

    const spend = Number(platform?.spend ?? 0);
    const leads = Number(leadStats?.total ?? 0);
    const trials = Number(lifecycleStats?.trials ?? 0);
    const activatedTrials = Number(lifecycleStats?.activatedTrials ?? 0);
    const recoveredLeads = Number(lifecycleStats?.recoveredLeads ?? 0);
    const coolingLeads = Number(lifecycleStats?.coolingLeads ?? 0);
    const salesCount = Number(sales?.total ?? 0);
    const revenue = Number(sales?.revenue ?? 0);
    const roas = moneyRatio(revenue, spend);
    const costPerLead = moneyRatio(spend, leads);
    const costPerTrial = moneyRatio(spend, trials);
    const costPerActivatedTrial = moneyRatio(spend, activatedTrials);
    const costPerSale = moneyRatio(spend, salesCount);
    const leadToTrialRate = percent(trials, leads);
    const trialActivationRate = percent(activatedTrials, trials);
    const activatedTrialToSaleRate = percent(salesCount, activatedTrials);
    const trialToSaleRate = percent(salesCount, trials);
    const leadToSaleRate = percent(salesCount, leads);
    const revenuePerLead = moneyRatio(revenue, leads);
    const control = campaign.segmentacao?.campaignControl;
    const remaining = daysRemaining(control?.endDate);
    const alerts = [...(alertsByCampaign.get(campaign.id) ?? [])];

    if (remaining !== null && remaining <= 2 && campaign.status === "ativo") {
      alerts.push({ id: `computed-ending-${campaign.id}`, tenantId, campaignId: campaign.id, userId: null, eventType: "ending_soon", severity: "warning", message: remaining === 0 ? "A campanha termina hoje." : `A campanha termina em ${remaining} dia(s).`, dedupeKey: null, metadata: {}, resolvedAt: null, createdAt: new Date() });
    }

    let recommendation: { title: string; reason: string; action: string; requiresApproval: boolean } | null = null;
    if (campaign.segmentacao?.platformReview?.status === "reprovada") recommendation = { title: "Corrigir o criativo", reason: campaign.segmentacao.platformReview.reason ?? "A plataforma reprovou o anúncio.", action: "correct_creative", requiresApproval: false };
    else if (spend > 0 && leads === 0) recommendation = { title: "Revisar público e oferta", reason: `Já foram gastos R$ ${spend.toFixed(2)} sem lead atribuído.`, action: "review_targeting", requiresApproval: false };
    else if (trials >= 3 && activatedTrials === 0) recommendation = { title: "Melhorar ativação do trial", reason: `${trials} trial(s) atribuídos, mas nenhum chegou à ativação operacional.`, action: "review_trial_activation", requiresApproval: false };
    else if (activatedTrials >= 3 && salesCount === 0) recommendation = { title: "Trials ativam, mas não convertem", reason: `${activatedTrials} trial(s) ativados, mas nenhuma venda foi fechada.`, action: "review_trial_conversion", requiresApproval: false };
    else if (leads >= 5 && salesCount === 0) recommendation = { title: "Otimizar para venda, não só para lead", reason: `${leads} leads atribuídos, mas nenhuma venda fechada.`, action: "review_lead_quality", requiresApproval: false };
    else if (salesCount >= 2 && roas !== null && roas >= 3) recommendation = { title: "Campanha vencedora — considerar escala", reason: `${salesCount} venda(s), CAC de ${costPerSale !== null ? `R$ ${costPerSale.toFixed(2)}` : "n/d"} e ROAS ${roas.toFixed(2)}x.`, action: "scale_winner", requiresApproval: true };
    else if (leads >= 3 && revenue > spend && remaining !== null && remaining <= 2) recommendation = { title: "Considerar prolongar a campanha", reason: `${leads} leads e R$ ${revenue.toFixed(2)} em receita atribuída.`, action: "extend_campaign", requiresApproval: true };
    else if (Number(platform?.clicks ?? 0) >= 30 && leads === 0) recommendation = { title: "Melhorar a página ou chamada", reason: "Há cliques, mas nenhum contato atribuído.", action: "improve_destination", requiresApproval: false };

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
      trials,
      activatedTrials,
      recoveredLeads,
      coolingLeads,
      sales: salesCount,
      revenue,
      costPerLead,
      costPerTrial,
      costPerActivatedTrial,
      costPerSale,
      leadToTrialRate,
      trialActivationRate,
      activatedTrialToSaleRate,
      trialToSaleRate,
      leadToSaleRate,
      revenuePerLead,
      roas,
      alerts,
      recommendation,
      activationDefinition: "onboarding_complete_and_(integration_complete_or_first_real_lead)",
    });
  }

  const totals = rows.reduce((total, row) => ({
    plannedBudget: total.plannedBudget + row.plannedBudget,
    spend: total.spend + row.spend,
    impressions: total.impressions + row.impressions,
    clicks: total.clicks + row.clicks,
    leads: total.leads + row.leads,
    trials: total.trials + row.trials,
    activatedTrials: total.activatedTrials + row.activatedTrials,
    recoveredLeads: total.recoveredLeads + row.recoveredLeads,
    coolingLeads: total.coolingLeads + row.coolingLeads,
    sales: total.sales + row.sales,
    revenue: total.revenue + row.revenue,
    activeCampaigns: total.activeCampaigns + (row.status === "ativo" ? 1 : 0),
    unresolvedAlerts: total.unresolvedAlerts + row.alerts.length,
  }), { plannedBudget: 0, spend: 0, impressions: 0, clicks: 0, leads: 0, trials: 0, activatedTrials: 0, recoveredLeads: 0, coolingLeads: 0, sales: 0, revenue: 0, activeCampaigns: 0, unresolvedAlerts: 0 });

  const [behaviorTotals] = await db.select({
    visitors: sql<number>`count(distinct ${webBehaviorEventsTable.anonymousSessionId})`,
    pageViews: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'page_view')`,
    ctaClicks: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'cta_click')`,
    formStarts: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'form_start')`,
    formSubmits: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'form_submit')`,
  }).from(webBehaviorEventsTable).where(eq(webBehaviorEventsTable.tenantId, tenantId));

  const behaviorLeadRows = await db.select({ discoveryData: leadsTable.discoveryData })
    .from(leadsTable)
    .where(eq(leadsTable.tenantId, tenantId));
  const intents = behaviorLeadRows.map((row) => behaviorIntentFromDiscovery(row.discoveryData)).filter((value): value is { score: number; tier: string } => Boolean(value));
  const intentDistribution = { baixo: 0, medio: 0, alto: 0, muito_alto: 0 };
  for (const intent of intents) {
    if (intent.tier in intentDistribution) intentDistribution[intent.tier as keyof typeof intentDistribution]++;
  }
  const avgBehaviorIntent = intents.length > 0 ? Number((intents.reduce((sum, item) => sum + item.score, 0) / intents.length).toFixed(1)) : null;
  const visitors = Number(behaviorTotals?.visitors ?? 0);
  const launchMetrics = {
    visitors,
    pageViews: Number(behaviorTotals?.pageViews ?? 0),
    ctaClicks: Number(behaviorTotals?.ctaClicks ?? 0),
    formStarts: Number(behaviorTotals?.formStarts ?? 0),
    formSubmits: Number(behaviorTotals?.formSubmits ?? 0),
    avgBehaviorIntent,
    intentDistribution,
    measuredIntentLeads: intents.length,
    visitorToLeadRate: percent(totals.leads, visitors),
    leadToTrialRate: percent(totals.trials, totals.leads),
    trialActivationRate: percent(totals.activatedTrials, totals.trials),
    activatedTrialToSaleRate: percent(totals.sales, totals.activatedTrials),
    leadToSaleRate: percent(totals.sales, totals.leads),
    costPerLead: moneyRatio(totals.spend, totals.leads),
    costPerActivatedTrial: moneyRatio(totals.spend, totals.activatedTrials),
    cac: moneyRatio(totals.spend, totals.sales),
    revenuePerLead: moneyRatio(totals.revenue, totals.leads),
    roas: moneyRatio(totals.revenue, totals.spend),
  };

  const diagnosis = launchDiagnosis({
    spend: totals.spend,
    clicks: totals.clicks,
    visitors,
    leads: totals.leads,
    avgBehaviorIntent,
    trials: totals.trials,
    activatedTrials: totals.activatedTrials,
    sales: totals.sales,
    revenue: totals.revenue,
    recoveredLeads: totals.recoveredLeads,
  });

  return {
    totals,
    campaigns: rows,
    launchCommandCenter: {
      metrics: launchMetrics,
      diagnosis,
      funnel: [
        { stage: "Visitantes", value: visitors },
        { stage: "Leads", value: totals.leads },
        { stage: "Trials", value: totals.trials },
        { stage: "Trials ativados", value: totals.activatedTrials },
        { stage: "Vendas", value: totals.sales },
      ],
    },
  };
}
