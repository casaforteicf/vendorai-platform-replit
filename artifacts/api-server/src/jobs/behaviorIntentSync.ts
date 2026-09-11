import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { Logger } from "pino";
import {
  activitiesTable,
  adCampaignsTable,
  campaignSentLogsTable,
  campaignsTable,
  db,
  dealsTable,
  knowledgeBaseTable,
  leadEventsTable,
  leadsTable,
  notificationsTable,
  webBehaviorEventsTable,
} from "@workspace/db";

const LOOKBACK_DAYS = 30;
const MAX_LEADS_PER_RUN = 250;
const HOT_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const HOT_ACTIVITY_TITLE = "Sinal digital: contato recomendado";

export type BehaviorIntentTier = "baixo" | "medio" | "alto" | "muito_alto";
export type CommercialJourneyStage = "descoberta" | "aquecimento" | "quente" | "oportunidade";

type EventMetadata = Record<string, unknown>;

type BehaviorEventInput = {
  eventType: string;
  path: string | null;
  engagedMs: number | null;
  scrollDepth: number | null;
  anonymousSessionId?: string | null;
  metadata?: unknown;
  createdAt?: Date | string | null;
  adCampaignId?: string | null;
};

export type BehaviorIntentSummary = {
  score: number;
  tier: BehaviorIntentTier;
  tierLabel: string;
  recommendedAction: string;
  reasons: string[];
  signals: {
    pageViews: number;
    ctaClicks: number;
    formStarts: number;
    formSubmits: number;
    maxEngagedMs: number;
    maxScrollDepth: number;
    pricingViews: number;
    highIntentViews: number;
    sessions: number;
    returning: boolean;
    abandonedForm: boolean;
  };
  computedAt: string;
};

export type CommercialJourneySnapshot = {
  stage: CommercialJourneyStage;
  score: number;
  summary: string;
  recommendedAction: string;
  nextFollowUpAt: string;
  topInterestPath: string | null;
  audienceTags: string[];
  signals: string[];
  pages: Array<{ path: string; views: number; engagedMs: number; maxScrollDepth: number }>;
  clicks: Array<{ label: string; href: string | null; path: string | null; at: string | null }>;
  recommendedMaterials: Array<{ id: string; title: string; category: string; tags: string[] }>;
  materialGap: string | null;
  campaignHistory: Array<{
    kind: "crm" | "paid";
    id: string;
    name: string;
    status: string;
    channel: string | null;
    firstInteractionAt: string | null;
    lastInteractionAt: string | null;
    converted: boolean;
  }>;
  computedAt: string;
};

function metadataRecord(value: unknown): EventMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as EventMetadata : {};
}

function metadataString(value: unknown, key: string): string | null {
  const raw = metadataRecord(value)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function classifyIntent(score: number): Pick<BehaviorIntentSummary, "tier" | "tierLabel" | "recommendedAction"> {
  if (score >= 80) {
    return {
      tier: "muito_alto",
      tierLabel: "Intenção muito alta",
      recommendedAction: "Contato comercial imediato com contexto da navegação. Priorizar resposta, proposta ou agendamento conforme o estágio do lead.",
    };
  }
  if (score >= 60) {
    return {
      tier: "alto",
      tierLabel: "Intenção alta",
      recommendedAction: "Priorizar contato comercial hoje e usar os sinais digitais para personalizar a abordagem do SDR.",
    };
  }
  if (score >= 35) {
    return {
      tier: "medio",
      tierLabel: "Intenção média",
      recommendedAction: "Nutrir com material de valor relacionado ao interesse e manter follow-up ativo, antecipando o contato se houver novo sinal.",
    };
  }
  return {
    tier: "baixo",
    tierLabel: "Intenção baixa",
    recommendedAction: "Manter em audiência de remarketing e nutrição leve. Aguardar novos sinais antes de pressionar a venda.",
  };
}

function stageForScore(score: number): CommercialJourneyStage {
  if (score >= 80) return "oportunidade";
  if (score >= 60) return "quente";
  if (score >= 35) return "aquecimento";
  return "descoberta";
}

function isPricingOrDecisionPath(path: string | null) {
  return /\/(pricing|planos|precos|preços|orcamento|orçamento|proposta|checkout)(\/|\?|$)/i.test(path ?? "");
}

function isHighIntentPath(path: string | null) {
  return isPricingOrDecisionPath(path) || /\/(contato|demo|agendar|consultoria|produto|solucoes|soluções)(\/|\?|$)/i.test(path ?? "");
}

export function buildBehaviorIntentSummary(events: BehaviorEventInput[]): BehaviorIntentSummary {
  const sessionKeys = new Set(events.map((event) => event.anonymousSessionId).filter((value): value is string => Boolean(value)));
  const signals = {
    pageViews: 0,
    ctaClicks: 0,
    formStarts: 0,
    formSubmits: 0,
    maxEngagedMs: 0,
    maxScrollDepth: 0,
    pricingViews: 0,
    highIntentViews: 0,
    sessions: Math.max(1, sessionKeys.size || (events.length ? 1 : 0)),
    returning: sessionKeys.size > 1,
    abandonedForm: false,
  };

  for (const event of events) {
    if (event.eventType === "page_view" || event.eventType === "screen_view") {
      signals.pageViews++;
      if (isPricingOrDecisionPath(event.path)) signals.pricingViews++;
      if (isHighIntentPath(event.path)) signals.highIntentViews++;
    } else if (event.eventType === "cta_click") {
      signals.ctaClicks++;
    } else if (event.eventType === "form_start") {
      signals.formStarts++;
    } else if (event.eventType === "form_submit") {
      signals.formSubmits++;
    } else if (event.eventType === "engagement") {
      signals.maxEngagedMs = Math.max(signals.maxEngagedMs, event.engagedMs ?? 0);
      signals.maxScrollDepth = Math.max(signals.maxScrollDepth, event.scrollDepth ?? 0);
    }
  }
  signals.abandonedForm = signals.formStarts > signals.formSubmits && signals.formSubmits === 0;

  let rawScore = 0;
  const reasons: string[] = [];

  if (signals.pageViews > 0) {
    const points = Math.min(10, signals.pageViews * 2);
    rawScore += points;
    reasons.push(`${signals.pageViews} página(s) visitada(s) (+${points})`);
  }
  if (signals.returning) {
    const points = Math.min(15, 5 + Math.max(0, signals.sessions - 2) * 5);
    rawScore += points;
    reasons.push(`Retornou ao site em ${signals.sessions} sessões (+${points})`);
  }
  if (signals.pricingViews > 0) {
    rawScore += 15;
    reasons.push("Visitou preço/orçamento/proposta (+15)");
  } else if (signals.highIntentViews > 0) {
    rawScore += 8;
    reasons.push("Visitou página de alta intenção (+8)");
  }
  if (signals.ctaClicks > 0) {
    const points = Math.min(20, signals.ctaClicks * 10);
    rawScore += points;
    reasons.push(`${signals.ctaClicks} clique(s) em CTA (+${points})`);
  }
  if (signals.formStarts > 0) {
    rawScore += 15;
    reasons.push("Iniciou formulário (+15)");
  }
  if (signals.formSubmits > 0) {
    rawScore += 25;
    reasons.push("Enviou formulário (+25)");
  } else if (signals.abandonedForm) {
    rawScore += 10;
    reasons.push("Iniciou e não concluiu formulário (+10)");
  }
  if (signals.maxEngagedMs >= 120_000) {
    rawScore += 15;
    reasons.push("Permaneceu 2 min+ em uma página (+15)");
  } else if (signals.maxEngagedMs >= 60_000) {
    rawScore += 10;
    reasons.push("Permaneceu 1 min+ em uma página (+10)");
  } else if (signals.maxEngagedMs >= 30_000) {
    rawScore += 5;
    reasons.push("Engajamento de pelo menos 30s (+5)");
  }
  if (signals.maxScrollDepth >= 75) {
    rawScore += 8;
    reasons.push("Atingiu 75%+ de profundidade (+8)");
  } else if (signals.maxScrollDepth >= 50) {
    rawScore += 4;
    reasons.push("Atingiu 50%+ de profundidade (+4)");
  }

  const score = Math.min(100, rawScore);
  return {
    score,
    ...classifyIntent(score),
    reasons,
    signals,
    computedAt: new Date().toISOString(),
  };
}

function buildPageSignals(events: BehaviorEventInput[]) {
  const pages = new Map<string, { path: string; views: number; engagedMs: number; maxScrollDepth: number }>();
  for (const event of events) {
    const metadataPath = metadataString(event.metadata, "pagePath");
    const path = metadataPath ?? event.path ?? null;
    if (!path) continue;
    const current = pages.get(path) ?? { path, views: 0, engagedMs: 0, maxScrollDepth: 0 };
    if (event.eventType === "page_view" || event.eventType === "screen_view") current.views += 1;
    if (event.eventType === "engagement") {
      current.engagedMs += Math.max(0, event.engagedMs ?? 0);
      current.maxScrollDepth = Math.max(current.maxScrollDepth, event.scrollDepth ?? 0);
    }
    pages.set(path, current);
  }
  return Array.from(pages.values())
    .sort((a, b) => {
      const aWeight = a.engagedMs + a.views * 15_000 + (isHighIntentPath(a.path) ? 60_000 : 0);
      const bWeight = b.engagedMs + b.views * 15_000 + (isHighIntentPath(b.path) ? 60_000 : 0);
      return bWeight - aWeight;
    })
    .slice(0, 8);
}

function buildClickSignals(events: BehaviorEventInput[]) {
  return events
    .filter((event) => event.eventType === "cta_click")
    .map((event) => ({
      label: metadataString(event.metadata, "label") ?? metadataString(event.metadata, "trackKey") ?? "CTA",
      href: metadataString(event.metadata, "href"),
      path: event.path,
      at: iso(event.createdAt),
    }))
    .slice(0, 12);
}

function buildAudienceTags(summary: BehaviorIntentSummary, stage: CommercialJourneyStage) {
  const tags = new Set<string>(["all_site_visitors_30d", `stage:${stage}`]);
  if (summary.signals.returning) tags.add("returning_visitors");
  if (summary.signals.pricingViews > 0) tags.add("pricing_visitors");
  if (summary.signals.ctaClicks > 0) tags.add("cta_engaged");
  if (summary.signals.abandonedForm) tags.add("form_abandoners");
  if (summary.score >= 60) tags.add("high_intent");
  if (summary.signals.formSubmits > 0) tags.add("converted_form");
  return Array.from(tags);
}

function buildCommercialSummary(summary: BehaviorIntentSummary, topPath: string | null, clicks: ReturnType<typeof buildClickSignals>) {
  const parts: string[] = [];
  if (summary.signals.returning) parts.push(`retornou em ${summary.signals.sessions} sessões`);
  if (topPath) parts.push(`maior interesse em ${topPath}`);
  if (summary.signals.pricingViews > 0) parts.push("visitou preço/orçamento/proposta");
  if (clicks[0]?.label) parts.push(`clicou em “${clicks[0].label}”`);
  if (summary.signals.abandonedForm) parts.push("iniciou formulário e não concluiu");
  if (summary.signals.formSubmits > 0) parts.push("converteu em formulário");
  if (!parts.length) parts.push(`${summary.signals.pageViews} página(s) visitada(s)`);
  return `Lead ${stageForScore(summary.score) === "descoberta" ? "em descoberta" : `em ${stageForScore(summary.score)}`}: ${parts.join(", ")}.`;
}

function interestTagFromPath(path: string | null) {
  if (!path) return null;
  const clean = path.split("?")[0].split("/").filter(Boolean).pop();
  return clean ? `interest:${clean.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}` : null;
}

async function recommendMaterials(tenantId: string, stage: CommercialJourneyStage, topPath: string | null) {
  const items = await db
    .select({
      id: knowledgeBaseTable.id,
      title: knowledgeBaseTable.titulo,
      category: knowledgeBaseTable.categoria,
      tags: knowledgeBaseTable.tags,
    })
    .from(knowledgeBaseTable)
    .where(and(eq(knowledgeBaseTable.tenantId, tenantId), eq(knowledgeBaseTable.ativo, true)))
    .limit(200);

  const interestTag = interestTagFromPath(topPath);
  const scored = items.map((item) => {
    const tags = item.tags ?? [];
    const normalizedCategory = item.category.toLocaleLowerCase("pt-BR");
    let score = 0;
    if (tags.includes("nurture") || tags.includes("nutricao") || tags.includes("nutrição")) score += 5;
    if (tags.includes(`stage:${stage}`)) score += 5;
    if (interestTag && tags.includes(interestTag)) score += 4;
    if (/nutri|vendas|comercial|marketing|case|faq|produto/.test(normalizedCategory)) score += 2;
    return { ...item, tags, score };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, ...item }) => item);

  return scored;
}

async function loadCampaignHistory(leadId: string, tenantId: string, events: BehaviorEventInput[]): Promise<CommercialJourneySnapshot["campaignHistory"]> {
  const sentRows = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.nome,
      status: campaignsTable.status,
      channel: campaignsTable.tipo,
      sentAt: campaignSentLogsTable.sentAt,
      readAt: campaignSentLogsTable.readAt,
      convertedAt: campaignSentLogsTable.convertedAt,
    })
    .from(campaignSentLogsTable)
    .innerJoin(campaignsTable, eq(campaignSentLogsTable.campaignId, campaignsTable.id))
    .where(and(eq(campaignSentLogsTable.leadId, leadId), eq(campaignsTable.tenantId, tenantId)))
    .orderBy(desc(campaignSentLogsTable.sentAt))
    .limit(20);

  const adIds = Array.from(new Set(events.map((event) => event.adCampaignId).filter((value): value is string => Boolean(value))));
  const ads = adIds.length
    ? await db
      .select({
        id: adCampaignsTable.id,
        name: adCampaignsTable.itemLabel,
        status: adCampaignsTable.status,
        channel: adCampaignsTable.plataforma,
        createdAt: adCampaignsTable.createdAt,
        updatedAt: adCampaignsTable.updatedAt,
      })
      .from(adCampaignsTable)
      .where(and(eq(adCampaignsTable.tenantId, tenantId), inArray(adCampaignsTable.id, adIds)))
    : [];

  const crm = sentRows.map((row) => ({
    kind: "crm" as const,
    id: row.id,
    name: row.name,
    status: row.convertedAt ? "converted" : row.readAt ? "read" : String(row.status),
    channel: row.channel,
    firstInteractionAt: iso(row.sentAt),
    lastInteractionAt: iso(row.convertedAt ?? row.readAt ?? row.sentAt),
    converted: Boolean(row.convertedAt),
  }));
  const paid = ads.map((row) => ({
    kind: "paid" as const,
    id: row.id,
    name: row.name || `Campanha ${row.channel}`,
    status: String(row.status),
    channel: row.channel,
    firstInteractionAt: iso(row.createdAt),
    lastInteractionAt: iso(row.updatedAt),
    converted: false,
  }));

  return [...crm, ...paid]
    .sort((a, b) => String(b.lastInteractionAt ?? "").localeCompare(String(a.lastInteractionAt ?? "")))
    .slice(0, 25);
}

async function notifyHotBehaviorIntent(input: {
  leadId: string;
  tenantId: string;
  leadName: string;
  summary: BehaviorIntentSummary;
}) {
  if (input.summary.score < 60) return;

  const [recent] = await db
    .select({ id: leadEventsTable.id })
    .from(leadEventsTable)
    .where(and(
      eq(leadEventsTable.leadId, input.leadId),
      eq(leadEventsTable.tipo, "visitor_intent_hot"),
      gte(leadEventsTable.createdAt, new Date(Date.now() - HOT_ALERT_COOLDOWN_MS)),
    ))
    .limit(1);

  if (recent) return;

  const reasonSummary = input.summary.reasons.slice(0, 3).join("; ");
  const description = `🔥 Behavior Intent ${input.summary.score}/100 (${input.summary.tierLabel}). ${reasonSummary || input.summary.recommendedAction}`;
  const now = new Date();

  await db.insert(leadEventsTable).values({
    leadId: input.leadId,
    tipo: "visitor_intent_hot",
    descricao: description,
    scoreBoost: 0,
    notifiedAt: now,
  });

  await db.insert(notificationsTable).values({
    tenantId: input.tenantId,
    title: "🔥 Oportunidade quente agora",
    message: `${input.leadName}: intenção ${input.summary.score}/100. ${input.summary.recommendedAction}`,
    type: "info",
  });
}

async function ensureCommercialTask(input: {
  tenantId: string;
  leadId: string;
  assignedTo: string | null;
  dealId: string | null;
  dueAt: Date;
  description: string;
}) {
  const [existing] = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.tenantId, input.tenantId),
      eq(activitiesTable.leadId, input.leadId),
      eq(activitiesTable.titulo, HOT_ACTIVITY_TITLE),
      eq(activitiesTable.status, "pendente"),
      gte(activitiesTable.createdAt, new Date(Date.now() - HOT_ALERT_COOLDOWN_MS)),
    ))
    .limit(1);
  if (existing) return;

  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: input.leadId,
    dealId: input.dealId,
    tipo: "tarefa",
    titulo: HOT_ACTIVITY_TITLE,
    descricao: input.description,
    status: "pendente",
    dataVencimento: input.dueAt,
    responsavelId: input.assignedTo,
  });
}

/**
 * Recalcula comportamento e transforma navegação em contexto comercial persistente.
 * Behavior Intent continua separado do Revenue Scout; o novo commercialJourney alimenta
 * SDR, follow-up, campanhas e Pipeline sem apagar histórico quando uma campanha termina.
 */
export async function syncBehaviorIntentForLead(
  leadId: string,
  tenantId: string,
): Promise<BehaviorIntentSummary | null> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [lead] = await db
    .select({
      id: leadsTable.id,
      tenantId: leadsTable.tenantId,
      nome: leadsTable.nome,
      assignedTo: leadsTable.assignedTo,
      proximaAcao: leadsTable.proximaAcao,
      discoveryData: leadsTable.discoveryData,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) return null;

  const events = await db
    .select({
      anonymousSessionId: webBehaviorEventsTable.anonymousSessionId,
      eventType: webBehaviorEventsTable.eventType,
      path: webBehaviorEventsTable.path,
      engagedMs: webBehaviorEventsTable.engagedMs,
      scrollDepth: webBehaviorEventsTable.scrollDepth,
      metadata: webBehaviorEventsTable.metadata,
      createdAt: webBehaviorEventsTable.createdAt,
      adCampaignId: webBehaviorEventsTable.adCampaignId,
    })
    .from(webBehaviorEventsTable)
    .where(and(
      eq(webBehaviorEventsTable.leadId, lead.id),
      eq(webBehaviorEventsTable.tenantId, lead.tenantId),
      gte(webBehaviorEventsTable.createdAt, since),
    ))
    .orderBy(desc(webBehaviorEventsTable.createdAt))
    .limit(1000) as BehaviorEventInput[];

  if (events.length === 0) return null;

  const behaviorIntent = buildBehaviorIntentSummary(events);
  const stage = stageForScore(behaviorIntent.score);
  const pages = buildPageSignals(events);
  const clicks = buildClickSignals(events);
  const topInterestPath = pages[0]?.path ?? null;
  const audienceTags = buildAudienceTags(behaviorIntent, stage);
  const recommendedMaterials = await recommendMaterials(tenantId, stage, topInterestPath);
  const campaignHistory = await loadCampaignHistory(lead.id, lead.tenantId, events);
  const summary = buildCommercialSummary(behaviorIntent, topInterestPath, clicks);
  const delayMs = behaviorIntent.score >= 80 ? 0 : behaviorIntent.score >= 60 ? 4 * 60 * 60 * 1000 : behaviorIntent.score >= 35 ? 24 * 60 * 60 * 1000 : 72 * 60 * 60 * 1000;
  const nextFollowUpAt = new Date(Date.now() + delayMs);
  const materialGap = recommendedMaterials.length
    ? null
    : `Criar material de valor para ${stage}${topInterestPath ? ` relacionado a ${topInterestPath}` : ""}.`;

  const commercialJourney: CommercialJourneySnapshot = {
    stage,
    score: behaviorIntent.score,
    summary,
    recommendedAction: behaviorIntent.recommendedAction,
    nextFollowUpAt: nextFollowUpAt.toISOString(),
    topInterestPath,
    audienceTags,
    signals: behaviorIntent.reasons,
    pages,
    clicks,
    recommendedMaterials,
    materialGap,
    campaignHistory,
    computedAt: new Date().toISOString(),
  };

  const [currentDeal] = await db
    .select({ id: dealsTable.id, etapa: dealsTable.etapa })
    .from(dealsTable)
    .where(and(eq(dealsTable.tenantId, lead.tenantId), eq(dealsTable.leadId, lead.id)))
    .orderBy(desc(dealsTable.createdAt))
    .limit(1);

  const firstMaterial = recommendedMaterials[0]?.title;
  const autoNextAction = `[AUTO DIGITAL] ${behaviorIntent.recommendedAction}${firstMaterial ? ` Material sugerido: ${firstMaterial}.` : ""}`;
  const mayReplaceNextAction = !lead.proximaAcao || lead.proximaAcao.startsWith("[AUTO DIGITAL]");

  await db
    .update(leadsTable)
    .set({
      discoveryData: {
        ...(lead.discoveryData ?? {}),
        behaviorIntent,
        commercialJourney,
      },
      ...(mayReplaceNextAction ? { proximaAcao: autoNextAction } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, lead.tenantId)));

  if (currentDeal && ["novo", "em_aquecimento", "qualificado"].includes(currentDeal.etapa)) {
    await db.update(dealsTable).set({
      aquecimentoTipo: "behavior_intent",
      relationshipStage: stage,
      aiBriefing: `${summary} Próxima ação: ${behaviorIntent.recommendedAction}${firstMaterial ? ` Material sugerido: ${firstMaterial}.` : ""}`,
      updatedAt: new Date(),
    }).where(and(eq(dealsTable.id, currentDeal.id), eq(dealsTable.tenantId, lead.tenantId)));
  }

  if (behaviorIntent.score >= 60) {
    await ensureCommercialTask({
      tenantId: lead.tenantId,
      leadId: lead.id,
      assignedTo: lead.assignedTo,
      dealId: currentDeal?.id ?? null,
      dueAt: nextFollowUpAt,
      description: `${summary} ${behaviorIntent.recommendedAction}${firstMaterial ? ` Material sugerido: ${firstMaterial}.` : materialGap ? ` ${materialGap}` : ""}`,
    });
  }

  await notifyHotBehaviorIntent({
    leadId: lead.id,
    tenantId: lead.tenantId,
    leadName: lead.nome,
    summary: behaviorIntent,
  });

  return behaviorIntent;
}

/**
 * Varredura de segurança para manter scores e jornada comercial sincronizados caso
 * um evento seja vinculado fora do caminho síncrono.
 */
export async function runBehaviorIntentSync(log: Logger): Promise<void> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const leadRows = await db
    .selectDistinct({
      leadId: webBehaviorEventsTable.leadId,
      tenantId: webBehaviorEventsTable.tenantId,
    })
    .from(webBehaviorEventsTable)
    .where(and(
      isNotNull(webBehaviorEventsTable.leadId),
      gte(webBehaviorEventsTable.createdAt, since),
    ))
    .limit(MAX_LEADS_PER_RUN);

  let updated = 0;
  for (const row of leadRows) {
    if (!row.leadId || !row.tenantId) continue;
    try {
      const result = await syncBehaviorIntentForLead(row.leadId, row.tenantId);
      if (result) updated++;
    } catch (err) {
      log.warn({ err, leadId: row.leadId, tenantId: row.tenantId }, "behavior-intent: lead sync failed");
    }
  }

  if (updated > 0) {
    log.info({ updated }, "behavior-intent: commercial journeys synchronized");
  }
}
