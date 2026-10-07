import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
import { canonicalDealValueSql } from "../lib/deal-value.js";
  adCampaignEventsTable,
  adCampaignsTable,
  adPerformanceSnapshotsTable,
  db,
  dealsTable,
  leadsTable,
  subscriptionsTable,
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

type FitLead = {
  empresa: string | null;
  tipoPessoa: string;
  dadosPj: {
    segmento?: string | null;
    numFuncionarios?: string | null;
    faturamentoEstimado?: string | null;
  } | null;
  mercadoSegmento: string | null;
  businessActivity: string | null;
  tamanhoEquipe: string | null;
  orcamento: string | null;
  urgencia: string | null;
  objetivo: string | null;
  dorPrincipal: string | null;
};

/**
 * Commercial Fit is deliberately rule-based and auditable. It does not reuse
 * Behavior Intent, Revenue Scout or propensity models. The score only reflects
 * explicit B2B qualification evidence already captured in CRM, never inferred
 * firmographic facts.
 */
function commercialFitFromLead(lead: FitLead) {
  const reasons: Array<{ key: string; label: string; points: number }> = [];
  const add = (key: string, label: string, points: number, present: boolean) => {
    if (present) reasons.push({ key, label, points });
  };
  const isBusiness = Boolean(lead.empresa?.trim()) || lead.tipoPessoa === "juridica" || Boolean(lead.dadosPj);
  const hasSegment = Boolean(
    lead.mercadoSegmento?.trim() || lead.businessActivity?.trim() || lead.dadosPj?.segmento?.trim(),
  );
  const hasTeam = Boolean(lead.tamanhoEquipe?.trim() || lead.dadosPj?.numFuncionarios?.trim());
  const hasBudget = Boolean(lead.orcamento?.trim() || lead.dadosPj?.faturamentoEstimado?.trim());

  add("business", "Empresa/PJ identificada", 20, isBusiness);
  add("segment", "Segmento/atividade identificado", 15, hasSegment);
  add("team", "Porte/equipe informado", 15, hasTeam);
  add("budget", "Orçamento/capacidade informado", 20, hasBudget);
  add("urgency", "Urgência declarada", 10, Boolean(lead.urgencia?.trim()));
  add("objective", "Objetivo declarado", 10, Boolean(lead.objetivo?.trim()));
  add("pain", "Dor principal declarada", 10, Boolean(lead.dorPrincipal?.trim()));

  const score = reasons.reduce((sum, item) => sum + item.points, 0);
  const tier = score >= 75 ? "alto" : score >= 50 ? "medio" : "baixo";
  return { score, tier, reasons };
}

function eventNumber(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = Number(metadata?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
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
  const commercialFitDistribution = { baixo: 0, medio: 0, alto: 0 };
  return {
    totals: {
      spend: 0, impressions: 0, clicks: 0, leads: 0, trials: 0, activatedTrials: 0,
      coolingLeads: 0, recoveredLeads: 0, sales: 0, revenue: 0, activeCampaigns: 0,
      activeSubscriptions: 0, delinquentSubscriptions: 0, renewals: 0, annualUpgrades: 0,
      churns: 0, renewalRevenue: 0, recoveredRevenue: 0, churnedMrr: 0,
    },
    metrics: {
      visitors: 0, pageViews: 0, ctaClicks: 0, formStarts: 0, formSubmits: 0,
      avgBehaviorIntent: null, measuredIntentLeads: 0, intentDistribution,
      avgCommercialFit: null, measuredCommercialFitLeads: 0, commercialFitDistribution,
      commercialFitDefinition: "Score 0–100 baseado somente em empresa/PJ, segmento, porte, orçamento, urgência, objetivo e dor explicitamente registrados no CRM.",
      visitorToLeadRate: null, leadToTrialRate: null, trialActivationRate: null,
      activatedTrialToSaleRate: null, leadToSaleRate: null, costPerLead: null,
      costPerActivatedTrial: null, cac: null, revenuePerLead: null, roas: null,
      mrr: 0, arr: 0, delinquentMrr: 0,
    },
    rankings: [],
    diagnosis: { stage: "sem_dados", title: "Nenhum dado neste recorte", evidence: "Os filtros atuais não encontraram campanhas ou eventos mensuráveis.", impact: "Não há base suficiente para comparar desempenho neste recorte.", action: "Amplie o período ou remova um dos filtros para recuperar volume de análise." },
    funnel: ["Visitantes", "Leads", "Trials", "Trials ativados", "Vendas"].map((stage) => ({ stage, value: 0 })),
    filterOptions,
    appliedFilters: filters,
    period: { label: scope.label, from: scope.from?.toISOString() ?? null, to: scope.to.toISOString() },
    intentCohortNote: filters.intentTier ? "O filtro de intenção recorta leads e etapas posteriores; investimento permanece no escopo de mídia selecionado." : null,
    financialNote: "MRR/ARR são posição atual das assinaturas ativas atribuídas ao recorte de campanha; renovações, churn e receita recuperada respeitam o período selecionado.",
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
  const campaignPerformanceRows = await db.select({
    campaignId: adPerformanceSnapshotsTable.campaignId,
    spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
    clicks: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.cliques}), 0)`,
  }).from(adPerformanceSnapshotsTable)
    .where(and(...performanceConditions))
    .groupBy(adPerformanceSnapshotsTable.campaignId);

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
    empresa: leadsTable.empresa,
    tipoPessoa: leadsTable.tipoPessoa,
    dadosPj: leadsTable.dadosPj,
    mercadoSegmento: leadsTable.mercadoSegmento,
    businessActivity: leadsTable.businessActivity,
    tamanhoEquipe: leadsTable.tamanhoEquipe,
    orcamento: leadsTable.orcamento,
    urgencia: leadsTable.urgencia,
    objetivo: leadsTable.objetivo,
    dorPrincipal: leadsTable.dorPrincipal,
  }).from(leadsTable).where(and(...leadConditions));

  const cohortLeads = filters.intentTier
    ? leadRows.filter((row) => behaviorIntentFromDiscovery(row.discoveryData)?.tier === filters.intentTier)
    : leadRows;
  const cohortLeadIds = cohortLeads.map((row) => row.id);
  const cohortLeadIdSet = new Set(cohortLeadIds);
  if (filters.intentTier && cohortLeadIds.length === 0) return zeroCenter({ filters, allCampaigns });

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

  const commercialFits = cohortLeads.map((row) => commercialFitFromLead(row));
  const commercialFitDistribution = { baixo: 0, medio: 0, alto: 0 };
  for (const fit of commercialFits) commercialFitDistribution[fit.tier as keyof typeof commercialFitDistribution]++;
  const avgCommercialFit = commercialFits.length
    ? Number((commercialFits.reduce((sum, item) => sum + item.score, 0) / commercialFits.length).toFixed(1))
    : null;

  const lifecycleEventTypes = [
    "trial_started", "lead_cooling", "lead_recovered", "subscription_renewed",
    "annual_upgrade", "churn", "subscription_recovered",
  ];
  const lifecycleConditions = [
    eq(adCampaignEventsTable.tenantId, tenantId),
    inArray(adCampaignEventsTable.campaignId, campaignIds),
    inArray(adCampaignEventsTable.eventType, lifecycleEventTypes),
  ];
  if (scope.from) lifecycleConditions.push(gte(adCampaignEventsTable.createdAt, scope.from));
  lifecycleConditions.push(lte(adCampaignEventsTable.createdAt, scope.to));
  const lifecycleRows = await db.select({
    eventType: adCampaignEventsTable.eventType,
    campaignId: adCampaignEventsTable.campaignId,
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
  const renewalRows = cohortLifecycle.filter((row) => row.eventType === "subscription_renewed");
  const annualUpgradeRows = cohortLifecycle.filter((row) => row.eventType === "annual_upgrade");
  const churnRows = cohortLifecycle.filter((row) => row.eventType === "churn");
  const subscriptionRecoveredRows = cohortLifecycle.filter((row) => row.eventType === "subscription_recovered");
  const renewalRevenue = renewalRows.reduce((sum, row) => sum + eventNumber(row.metadata, "value"), 0);
  const recoveredRevenue = subscriptionRecoveredRows.reduce((sum, row) => sum + eventNumber(row.metadata, "value"), 0);
  const churnedMrr = churnRows.reduce((sum, row) => sum + eventNumber(row.metadata, "monthlyValue"), 0);

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
    campaignId: leadsTable.adCampaignId,
    valor: canonicalDealValueSql,
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

  const subscriptionRows = await db.select({
    subscriptionId: subscriptionsTable.id,
    status: subscriptionsTable.status,
    billingPhase: subscriptionsTable.billingPhase,
    valorMensal: subscriptionsTable.valorMensal,
    annualPriceAtTransition: subscriptionsTable.annualPriceAtTransition,
    billingCycle: tenantsTable.billingCycle,
    leadId: dealsTable.leadId,
    campaignId: leadsTable.adCampaignId,
  }).from(subscriptionsTable)
    .innerJoin(dealsTable, eq(dealsTable.id, subscriptionsTable.sourceDealId))
    .innerJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .innerJoin(tenantsTable, eq(tenantsTable.id, subscriptionsTable.tenantId))
    .where(inArray(leadsTable.adCampaignId, campaignIds));
  const cohortSubscriptions = filters.intentTier
    ? subscriptionRows.filter((row) => Boolean(row.leadId && cohortLeadIdSet.has(row.leadId)))
    : subscriptionRows;
  const monthlyEquivalent = (row: typeof cohortSubscriptions[number]) => {
    if (row.billingCycle === "annual" && row.billingPhase === "regular" && Number(row.annualPriceAtTransition ?? 0) > 0) {
      return Number(row.annualPriceAtTransition);
    }
    return Number(row.valorMensal ?? 0);
  };
  const activeSubscriptions = cohortSubscriptions.filter((row) => row.status === "ativa");
  const delinquentSubscriptions = cohortSubscriptions.filter((row) => row.status === "inadimplente");
  const mrr = activeSubscriptions.reduce((sum, row) => sum + monthlyEquivalent(row), 0);
  const delinquentMrr = delinquentSubscriptions.reduce((sum, row) => sum + monthlyEquivalent(row), 0);
  const arr = mrr * 12;

  const behaviorConditions = [eq(webBehaviorEventsTable.tenantId, tenantId)];
  if (filters.platform || filters.campaignId || filters.landingPageId || filters.vertical) {
    behaviorConditions.push(inArray(webBehaviorEventsTable.adCampaignId, campaignIds));
  }
  if (scope.from) behaviorConditions.push(gte(webBehaviorEventsTable.createdAt, scope.from));
  behaviorConditions.push(lte(webBehaviorEventsTable.createdAt, scope.to));
  if (filters.intentTier) behaviorConditions.push(inArray(webBehaviorEventsTable.leadId, cohortLeadIds));
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

  const perfByCampaign = new Map(campaignPerformanceRows.map((row) => [row.campaignId, {
    spend: Number(row.spend ?? 0),
    clicks: Number(row.clicks ?? 0),
  }]));
  const leadsByCampaign = new Map<string, number>();
  for (const lead of cohortLeads) {
    if (!lead.adCampaignId) continue;
    leadsByCampaign.set(lead.adCampaignId, (leadsByCampaign.get(lead.adCampaignId) ?? 0) + 1);
  }
  const salesByCampaign = new Map<string, { sales: number; revenue: number }>();
  for (const sale of salesRows) {
    if (!sale.campaignId) continue;
    const current = salesByCampaign.get(sale.campaignId) ?? { sales: 0, revenue: 0 };
    current.sales += 1;
    current.revenue += Number(sale.valor ?? 0);
    salesByCampaign.set(sale.campaignId, current);
  }
  const rankings = selectedCampaigns.map((campaign) => {
    const perf = perfByCampaign.get(campaign.id) ?? { spend: 0, clicks: 0 };
    const salesData = salesByCampaign.get(campaign.id) ?? { sales: 0, revenue: 0 };
    const campaignLeads = leadsByCampaign.get(campaign.id) ?? 0;
    return {
      campaignId: campaign.id,
      label: campaign.itemLabel || campaign.vertical || campaign.id,
      platform: campaign.plataforma,
      vertical: campaign.vertical,
      spend: perf.spend,
      clicks: perf.clicks,
      leads: campaignLeads,
      sales: salesData.sales,
      revenue: salesData.revenue,
      cac: ratio(perf.spend, salesData.sales),
      roas: ratio(salesData.revenue, perf.spend),
    };
  }).sort((a, b) => b.revenue - a.revenue || (b.roas ?? -1) - (a.roas ?? -1)).slice(0, 10);

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
    activeSubscriptions: activeSubscriptions.length,
    delinquentSubscriptions: delinquentSubscriptions.length,
    renewals: renewalRows.length,
    annualUpgrades: annualUpgradeRows.length,
    churns: churnRows.length,
    renewalRevenue,
    recoveredRevenue,
    churnedMrr,
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
    avgCommercialFit,
    measuredCommercialFitLeads: commercialFits.length,
    commercialFitDistribution,
    commercialFitDefinition: "Score 0–100 baseado somente em empresa/PJ, segmento, porte, orçamento, urgência, objetivo e dor explicitamente registrados no CRM.",
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
    mrr,
    arr,
    delinquentMrr,
  };

  return {
    totals,
    metrics,
    rankings,
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
    financialNote: "MRR/ARR são posição atual das assinaturas ativas atribuídas ao recorte de campanha; renovações, churn e receita recuperada respeitam o período selecionado.",
  };
}
