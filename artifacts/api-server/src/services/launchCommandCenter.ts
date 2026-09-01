import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  adCampaignEventsTable,
  adCampaignsTable,
  adPerformanceSnapshotsTable,
  db,
  dealsTable,
  leadsTable,
  tenantsTable,
  webBehaviorEventsTable,
} from "@workspace/db";

export type LaunchPeriod = "7d" | "30d" | "90d" | "all";
export type BehaviorIntentTier = "baixo" | "medio" | "alto" | "muito_alto";

export type LaunchCommandCenterFilters = {
  period?: LaunchPeriod;
  platform?: string | null;
  campaignId?: string | null;
  landingPageId?: string | null;
  vertical?: string | null;
  intentTier?: BehaviorIntentTier | null;
};

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(2)) : null;
}

function behaviorIntentFromDiscovery(discoveryData: Record<string, unknown> | null | undefined) {
  const raw = discoveryData?.["behaviorIntent"];
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const score = Number(value["score"]);
  if (!Number.isFinite(score)) return null;
  const tier = typeof value["tier"] === "string"
    ? value["tier"]
    : score >= 80 ? "muito_alto" : score >= 60 ? "alto" : score >= 35 ? "medio" : "baixo";
  return { score, tier };
}

function dateScope(period: LaunchPeriod) {
  if (period === "all") return { from: null as Date | null, to: new Date(), label: "Todo o período" };
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  from.setHours(0, 0, 0, 0);
  return { from, to, label: `Últimos ${days} dias` };
}

function ymd(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function eventLeadId(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.["leadId"];
  return typeof value === "string" && value ? value : null;
}

function eventTrialTenantId(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.["trialTenantId"];
  return typeof value === "string" && value ? value : null;
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
    return { stage: "ativacao_trial", title: "Trial não chega ao primeiro valor", evidence: `${trials} trial(s) iniciados e nenhum ativado.`, impact: "Há intenção suficiente para testar, mas o usuário não chega ao uso operacional.", action: "Reduzir fricção no onboarding e conduzir o usuário ao primeiro lead/integração nos primeiros minutos." };
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

function zeroCenter(input: {
  filters: Required<Pick<LaunchCommandCenterFilters, "period">> & LaunchCommandCenterFilters;
  allCampaigns: Array<{ id: string; itemLabel: string | null; vertical: string; plataforma: string; landingPageId: string | null }>;
}) {
  const { filters, allCampaigns } = input;
  const scope = dateScope(filters.period);
  const filterOptions = buildFilterOptions(allCampaigns);
  const intentDistribution = { baixo: 0, medio: 0, alto: 0, muito_alto: 0 };
  return {
    totals: { spend: 0, impressions: 0, clicks: 0, leads: 0, trials: 0, activatedTrials: 0, coolingLeads: 0, recoveredLeads: 0, sales: 0, revenue: 0, activeCampaigns: 0 },
    metrics: {
      visitors: 0, pageViews: 0, ctaClicks: 0, formStarts: 0, formSubmits: 0,
      avgBehaviorIntent: null, measuredIntentLeads: 0, intentDistribution,
      visitorToLeadRate: null, leadToTrialRate: null, trialActivationRate: null,
      activatedTrialToSaleRate: null, leadToSaleRate: null, costPerLead: null,
      costPerActivatedTrial: null, cac: null, revenuePerLead: null, roas: null,
    },
    diagnosis: { stage: "sem_dados", title: "Nenhum dado neste recorte", evidence: "Os filtros atuais não encontraram campanhas ou eventos mensuráveis.", impact: "Não há base suficiente para comparar desempenho neste recorte.", action: "Amplie o período ou remova um dos filtros para recuperar volume de análise." },
    funnel: ["Visitantes", "Leads", "Trials", "Trials ativados", "Vendas"].map((stage) => ({ stage, value: 0 })),
    filterOptions,
    appliedFilters: filters,
    period: { label: scope.label, from: scope.from?.toISOString() ?? null, to: scope.to.toISOString() },
    intentCohortNote: filters.intentTier ? "O filtro de intenção recorta leads e etapas posteriores; investimento permanece no escopo de mídia selecionado." : null,
  };
}

function buildFilterOptions(campaigns: Array<{ id: string; itemLabel: string | null; vertical: string; plataforma: string; landingPageId: string | null }>) {
  const platforms = Array.from(new Set(campaigns.map((item) => item.plataforma))).sort();
  const verticals = Array.from(new Set(campaigns.map((item) => item.vertical).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const landingMap = new Map<string, string>();
  for (const item of campaigns) {
    if (item.landingPageId) landingMap.set(item.landingPageId, item.itemLabel || item.vertical || "Landing page");
  }
  return {
    periods: [
      { value: "7d", label: "Últimos 7 dias" },
      { value: "30d", label: "Últimos 30 dias" },
      { value: "90d", label: "Últimos 90 dias" },
      { value: "all", label: "Todo o período" },
    ],
    platforms,
    verticals,
    campaigns: campaigns.map((item) => ({ id: item.id, label: item.itemLabel || item.vertical, platform: item.plataforma, vertical: item.vertical, landingPageId: item.landingPageId })),
    landingPages: Array.from(landingMap.entries()).map(([id, label]) => ({ id, label })),
    intentTiers: [
      { value: "baixo", label: "Baixo" },
      { value: "medio", label: "Médio" },
      { value: "alto", label: "Alto" },
      { value: "muito_alto", label: "Muito alto" },
    ],
  };
}

export async function getFilteredLaunchCommandCenter(tenantId: string, rawFilters: LaunchCommandCenterFilters = {}) {
  const filters = {
    period: rawFilters.period ?? "30d",
    platform: rawFilters.platform || null,
    campaignId: rawFilters.campaignId || null,
    landingPageId: rawFilters.landingPageId || null,
    vertical: rawFilters.vertical || null,
    intentTier: rawFilters.intentTier || null,
  } satisfies Required<Pick<LaunchCommandCenterFilters, "period">> & LaunchCommandCenterFilters;
  const scope = dateScope(filters.period);

  const allCampaigns = await db.select({
    id: adCampaignsTable.id,
    itemLabel: adCampaignsTable.itemLabel,
    vertical: adCampaignsTable.vertical,
    plataforma: adCampaignsTable.plataforma,
    landingPageId: adCampaignsTable.landingPageId,
    status: adCampaignsTable.status,
  }).from(adCampaignsTable).where(eq(adCampaignsTable.tenantId, tenantId));

  const selectedCampaigns = allCampaigns.filter((campaign) => {
    if (filters.platform && campaign.plataforma !== filters.platform) return false;
    if (filters.campaignId && campaign.id !== filters.campaignId) return false;
    if (filters.landingPageId && campaign.landingPageId !== filters.landingPageId) return false;
    if (filters.vertical && campaign.vertical !== filters.vertical) return false;
    return true;
  });

  if (selectedCampaigns.length === 0) return zeroCenter({ filters, allCampaigns });
  const campaignIds = selectedCampaigns.map((item) => item.id);

  const performanceConditions = [inArray(adPerformanceSnapshotsTable.campaignId, campaignIds)];
  if (scope.from) performanceConditions.push(gte(adPerformanceSnapshotsTable.data, ymd(scope.from)));
  performanceConditions.push(lte(adPerformanceSnapshotsTable.data, ymd(scope.to)));
  const [performance] = await db.select({
    impressions: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.impressoes}), 0)`,
    clicks: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.cliques}), 0)`,
    spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
  }).from(adPerformanceSnapshotsTable).where(and(...performanceConditions));

  const leadConditions = [
    eq(leadsTable.tenantId, tenantId),
    inArray(leadsTable.adCampaignId, campaignIds),
    isNull(leadsTable.excluidoEm),
    isNull(leadsTable.naoLeadTipo),
  ];
  if (scope.from) leadConditions.push(gte(leadsTable.createdAt, scope.from));
  leadConditions.push(lte(leadsTable.createdAt, scope.to));
  const leadRows = await db.select({
    id: leadsTable.id,
    adCampaignId: leadsTable.adCampaignId,
    discoveryData: leadsTable.discoveryData,
  }).from(leadsTable).where(and(...leadConditions));

  const cohortLeads = filters.intentTier
    ? leadRows.filter((row) => behaviorIntentFromDiscovery(row.discoveryData)?.tier === filters.intentTier)
    : leadRows;
  const cohortLeadIds = cohortLeads.map((row) => row.id);
  const cohortLeadIdSet = new Set(cohortLeadIds);
  const leadIntents = cohortLeads
    .map((row) => behaviorIntentFromDiscovery(row.discoveryData))
    .filter((value): value is { score: number; tier: string } => Boolean(value));
  const intentDistribution = { baixo: 0, medio: 0, alto: 0, muito_alto: 0 };
  for (const intent of leadIntents) {
    if (intent.tier in intentDistribution) intentDistribution[intent.tier as keyof typeof intentDistribution]++;
  }
  const avgBehaviorIntent = leadIntents.length
    ? Number((leadIntents.reduce((sum, item) => sum + item.score, 0) / leadIntents.length).toFixed(1))
    : null;

  const lifecycleConditions = [
    eq(adCampaignEventsTable.tenantId, tenantId),
    inArray(adCampaignEventsTable.campaignId, campaignIds),
    inArray(adCampaignEventsTable.eventType, ["trial_started", "lead_cooling", "lead_recovered"]),
  ];
  if (scope.from) lifecycleConditions.push(gte(adCampaignEventsTable.createdAt, scope.from));
  lifecycleConditions.push(lte(adCampaignEventsTable.createdAt, scope.to));
  const lifecycleRows = await db.select({
    eventType: adCampaignEventsTable.eventType,
    metadata: adCampaignEventsTable.metadata,
  }).from(adCampaignEventsTable).where(and(...lifecycleConditions));
  const cohortLifecycle = filters.intentTier
    ? lifecycleRows.filter((row) => {
        const leadId = eventLeadId(row.metadata);
        return Boolean(leadId && cohortLeadIdSet.has(leadId));
      })
    : lifecycleRows;
  const trialRows = cohortLifecycle.filter((row) => row.eventType === "trial_started");
  const coolingLeads = cohortLifecycle.filter((row) => row.eventType === "lead_cooling").length;
  const recoveredLeads = cohortLifecycle.filter((row) => row.eventType === "lead_recovered").length;

  const trialTenantIds = Array.from(new Set(trialRows.map((row) => eventTrialTenantId(row.metadata)).filter((value): value is string => Boolean(value))));
  let activatedTrials = 0;
  if (trialTenantIds.length > 0) {
    const trialTenants = await db.select({
      id: tenantsTable.id,
      onboardingConcluido: tenantsTable.onboardingConcluido,
      integracoesConcluido: tenantsTable.integracoesConcluido,
    }).from(tenantsTable).where(inArray(tenantsTable.id, trialTenantIds));
    const tenantLeadRows = await db.select({ tenantId: leadsTable.tenantId })
      .from(leadsTable)
      .where(and(
        inArray(leadsTable.tenantId, trialTenantIds),
        isNull(leadsTable.excluidoEm),
        isNull(leadsTable.naoLeadTipo),
      ));
    const tenantWithLead = new Set(tenantLeadRows.map((row) => row.tenantId));
    const activatedSet = new Set(trialTenants
      .filter((tenant) => tenant.onboardingConcluido && (tenant.integracoesConcluido || tenantWithLead.has(tenant.id)))
      .map((tenant) => tenant.id));
    activatedTrials = trialRows.filter((row) => {
      const trialTenantId = eventTrialTenantId(row.metadata);
      return Boolean(trialTenantId && activatedSet.has(trialTenantId));
    }).length;
  }

  const wonDeals = await db.select({
    leadId: dealsTable.leadId,
    valor: dealsTable.valor,
    wonAt: dealsTable.wonAt,
    dataFechamento: dealsTable.dataFechamento,
    updatedAt: dealsTable.updatedAt,
  }).from(dealsTable)
    .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
    .where(and(
      inArray(leadsTable.adCampaignId, campaignIds),
      eq(dealsTable.etapa, "ganho"),
    ));
  const salesRows = wonDeals.filter((deal) => {
    if (filters.intentTier && (!deal.leadId || !cohortLeadIdSet.has(deal.leadId))) return false;
    const closedAt = deal.wonAt ?? deal.dataFechamento ?? deal.updatedAt;
    if (scope.from && closedAt < scope.from) return false;
    if (closedAt > scope.to) return false;
    return true;
  });
  const revenue = salesRows.reduce((sum, deal) => sum + Number(deal.valor ?? 0), 0);

  const behaviorConditions = [eq(webBehaviorEventsTable.tenantId, tenantId)];
  if (filters.platform || filters.campaignId || filters.landingPageId || filters.vertical) {
    behaviorConditions.push(inArray(webBehaviorEventsTable.adCampaignId, campaignIds));
  }
  if (scope.from) behaviorConditions.push(gte(webBehaviorEventsTable.createdAt, scope.from));
  behaviorConditions.push(lte(webBehaviorEventsTable.createdAt, scope.to));
  if (filters.intentTier) {
    if (cohortLeadIds.length === 0) return zeroCenter({ filters, allCampaigns });
    behaviorConditions.push(inArray(webBehaviorEventsTable.leadId, cohortLeadIds));
  }
  const [behavior] = await db.select({
    visitors: sql<number>`count(distinct ${webBehaviorEventsTable.anonymousSessionId})`,
    pageViews: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'page_view')`,
    ctaClicks: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'cta_click')`,
    formStarts: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'form_start')`,
    formSubmits: sql<number>`count(*) filter (where ${webBehaviorEventsTable.eventType} = 'form_submit')`,
  }).from(webBehaviorEventsTable).where(and(...behaviorConditions));

  const spend = Number(performance?.spend ?? 0);
  const impressions = Number(performance?.impressions ?? 0);
  const clicks = Number(performance?.clicks ?? 0);
  const visitors = Number(behavior?.visitors ?? 0);
  const leads = cohortLeads.length;
  const trials = trialRows.length;
  const sales = salesRows.length;
  const totals = {
    spend,
    impressions,
    clicks,
    leads,
    trials,
    activatedTrials,
    coolingLeads,
    recoveredLeads,
    sales,
    revenue,
    activeCampaigns: selectedCampaigns.filter((campaign) => campaign.status === "ativo").length,
  };
  const metrics = {
    visitors,
    pageViews: Number(behavior?.pageViews ?? 0),
    ctaClicks: Number(behavior?.ctaClicks ?? 0),
    formStarts: Number(behavior?.formStarts ?? 0),
    formSubmits: Number(behavior?.formSubmits ?? 0),
    avgBehaviorIntent,
    measuredIntentLeads: leadIntents.length,
    intentDistribution,
    visitorToLeadRate: percent(leads, visitors),
    leadToTrialRate: percent(trials, leads),
    trialActivationRate: percent(activatedTrials, trials),
    activatedTrialToSaleRate: percent(sales, activatedTrials),
    leadToSaleRate: percent(sales, leads),
    costPerLead: ratio(spend, leads),
    costPerActivatedTrial: ratio(spend, activatedTrials),
    cac: ratio(spend, sales),
    revenuePerLead: ratio(revenue, leads),
    roas: ratio(revenue, spend),
  };

  return {
    totals,
    metrics,
    diagnosis: launchDiagnosis({ spend, clicks, visitors, leads, avgBehaviorIntent, trials, activatedTrials, sales, revenue, recoveredLeads }),
    funnel: [
      { stage: "Visitantes", value: visitors },
      { stage: "Leads", value: leads },
      { stage: "Trials", value: trials },
      { stage: "Trials ativados", value: activatedTrials },
      { stage: "Vendas", value: sales },
    ],
    filterOptions: buildFilterOptions(allCampaigns),
    appliedFilters: filters,
    period: { label: scope.label, from: scope.from?.toISOString() ?? null, to: scope.to.toISOString() },
    intentCohortNote: filters.intentTier ? "O filtro de intenção recorta leads e etapas posteriores; investimento permanece no escopo de mídia selecionado." : null,
  };
}
