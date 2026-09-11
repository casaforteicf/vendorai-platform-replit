import { and, desc, eq, gte, inArray, isNotNull, not } from "drizzle-orm";
import type { Logger } from "pino";
import {
  contentLibraryTable,
  db,
  dealsTable,
  leadEventsTable,
  leadsTable,
  notificationsTable,
  webBehaviorEventsTable,
} from "@workspace/db";

const LOOKBACK_DAYS = 30;
const MAX_LEADS_PER_RUN = 250;
const HOT_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const HIGH_INTENT_PATH = /(pre[cç]os?|pricing|planos?|orcamento|or[cç]amento|proposta|checkout|contato|demo|agendar)/i;

export type BehaviorIntentTier = "baixo" | "medio" | "alto" | "muito_alto";
export type CommercialJourneyStage = "observacao" | "remarketing" | "nutricao" | "oportunidade" | "prioridade";

export type BehaviorIntentSummary = {
  score: number;
  tier: BehaviorIntentTier;
  tierLabel: string;
  commercialStage: CommercialJourneyStage;
  commercialStageLabel: string;
  recommendedAction: string;
  summary: string;
  reasons: string[];
  audienceTags: string[];
  campaigns: string[];
  topPages: Array<{ path: string; views: number; engagedMs: number }>;
  clicks: Array<{ label: string; href: string | null; path: string | null; at: string | null }>;
  recommendedMaterials: Array<{ id: string; title: string; type: string; theme: string | null }>;
  signals: {
    pageViews: number;
    uniquePages: number;
    ctaClicks: number;
    formStarts: number;
    formSubmits: number;
    formAbandons: number;
    maxEngagedMs: number;
    totalEngagedMs: number;
    maxScrollDepth: number;
    pricingViews: number;
    highIntentViews: number;
    returningSessions: number;
  };
  computedAt: string;
};

type IntentEvent = {
  eventType: string;
  path: string | null;
  engagedMs: number | null;
  scrollDepth: number | null;
  anonymousSessionId?: string | null;
  metadata?: unknown;
  createdAt?: Date | string | null;
};

type Metadata = Record<string, unknown>;

function asMetadata(value: unknown): Metadata {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Metadata : {};
}

function metadataString(value: unknown, key: string): string | null {
  const raw = asMetadata(value)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function commercialClassification(score: number): Pick<BehaviorIntentSummary, "tier" | "tierLabel" | "commercialStage" | "commercialStageLabel" | "recommendedAction"> {
  if (score >= 80) {
    return {
      tier: "muito_alto",
      tierLabel: "Intenção muito alta",
      commercialStage: "prioridade",
      commercialStageLabel: "Prioridade imediata",
      recommendedAction: "SDR deve abordar agora usando o contexto da navegação, a página de maior interesse e o último clique relevante.",
    };
  }
  if (score >= 60) {
    return {
      tier: "alto",
      tierLabel: "Intenção alta",
      commercialStage: "oportunidade",
      commercialStageLabel: "Oportunidade comercial",
      recommendedAction: "Priorizar contato comercial hoje e manter follow-up ativo. Se já houver negócio, avançar a qualificação.",
    };
  }
  if (score >= 35) {
    return {
      tier: "medio",
      tierLabel: "Intenção média",
      commercialStage: "nutricao",
      commercialStageLabel: "Em aquecimento",
      recommendedAction: "Nutrir com material de valor relacionado ao interesse observado e acompanhar a próxima visita para decidir o momento da abordagem.",
    };
  }
  if (score >= 15) {
    return {
      tier: "baixo",
      tierLabel: "Intenção inicial",
      commercialStage: "remarketing",
      commercialStageLabel: "Remarketing",
      recommendedAction: "Manter em audiência de remarketing e observar recorrência, páginas de alta intenção e cliques antes de uma abordagem comercial direta.",
    };
  }
  return {
    tier: "baixo",
    tierLabel: "Intenção baixa",
    commercialStage: "observacao",
    commercialStageLabel: "Observação",
    recommendedAction: "Continuar rastreando e manter o visitante elegível para audiências gerais de remarketing.",
  };
}

function buildPageStats(events: IntentEvent[]) {
  const pages = new Map<string, { views: number; engagedMs: number }>();
  for (const event of events) {
    const path = event.path || "/";
    const current = pages.get(path) ?? { views: 0, engagedMs: 0 };
    if (event.eventType === "page_view" || event.eventType === "screen_view") current.views += 1;
    if (event.eventType === "engagement") current.engagedMs = Math.max(current.engagedMs, event.engagedMs ?? 0);
    pages.set(path, current);
  }
  return Array.from(pages.entries())
    .filter(([, value]) => value.views > 0 || value.engagedMs > 0)
    .map(([path, value]) => ({ path, ...value }))
    .sort((a, b) => (b.engagedMs + b.views * 15_000) - (a.engagedMs + a.views * 15_000));
}

function buildClicks(events: IntentEvent[]) {
  return events
    .filter((event) => event.eventType === "cta_click")
    .map((event) => ({
      label: metadataString(event.metadata, "label") || "CTA",
      href: metadataString(event.metadata, "href"),
      path: event.path ?? null,
      at: event.createdAt ? new Date(event.createdAt).toISOString() : null,
    }))
    .slice(0, 20);
}

function buildAudienceTags(signals: BehaviorIntentSummary["signals"], topPages: BehaviorIntentSummary["topPages"]) {
  const tags = new Set<string>(["Todos os visitantes", "Remarketing 30d"]);
  if (signals.returningSessions > 1) tags.add("Visitantes recorrentes");
  if (signals.pricingViews > 0) tags.add("Visitou preços");
  if (signals.highIntentViews > 0) tags.add("Alta intenção");
  if (signals.ctaClicks > 0) tags.add("Clicou em CTA");
  if (signals.formStarts > signals.formSubmits) tags.add("Abandonou formulário");
  if (signals.formSubmits > 0) tags.add("Converteu");
  for (const page of topPages.slice(0, 2)) {
    const slug = page.path.split("?")[0].split("/").filter(Boolean).pop();
    if (slug && !HIGH_INTENT_PATH.test(slug)) tags.add(`Interesse: ${slug}`);
  }
  return Array.from(tags);
}

function buildSummaryText(
  score: number,
  signals: BehaviorIntentSummary["signals"],
  topPages: BehaviorIntentSummary["topPages"],
  clicks: BehaviorIntentSummary["clicks"],
) {
  const parts: string[] = [];
  if (signals.returningSessions > 1) parts.push(`retornou em ${signals.returningSessions} sessões`);
  if (topPages[0]) {
    const seconds = Math.round(topPages[0].engagedMs / 1000);
    parts.push(`maior interesse em ${topPages[0].path}${seconds > 0 ? ` (${seconds}s)` : ""}`);
  }
  if (signals.pricingViews > 0) parts.push("consultou preços/planos");
  if (clicks[0]) parts.push(`clicou em “${clicks[0].label}”`);
  if (signals.formStarts > signals.formSubmits) parts.push("iniciou formulário e não concluiu");
  if (signals.formSubmits > 0) parts.push("converteu por formulário");
  return parts.length
    ? `Score ${score}/100: ${parts.join(", ")}.`
    : `Score ${score}/100: ainda há poucos sinais comerciais; manter rastreamento e remarketing.`;
}

export function buildBehaviorIntentSummary(events: IntentEvent[]): BehaviorIntentSummary {
  const sessions = new Set<string>();
  const campaigns = new Set<string>();
  const pageStats = buildPageStats(events);
  const clicks = buildClicks(events);
  const signals: BehaviorIntentSummary["signals"] = {
    pageViews: 0,
    uniquePages: 0,
    ctaClicks: 0,
    formStarts: 0,
    formSubmits: 0,
    formAbandons: 0,
    maxEngagedMs: 0,
    totalEngagedMs: 0,
    maxScrollDepth: 0,
    pricingViews: 0,
    highIntentViews: 0,
    returningSessions: 0,
  };

  for (const event of events) {
    if (event.anonymousSessionId) sessions.add(event.anonymousSessionId);
    const campaign = metadataString(event.metadata, "utmCampaign") || metadataString(event.metadata, "campaign");
    if (campaign) campaigns.add(campaign);

    if (event.eventType === "page_view" || event.eventType === "screen_view") {
      signals.pageViews += 1;
      if (/\/(pricing|planos|precos|preços)(\/|\?|$)/i.test(event.path ?? "")) signals.pricingViews += 1;
      if (HIGH_INTENT_PATH.test(event.path ?? "")) signals.highIntentViews += 1;
    } else if (event.eventType === "cta_click") {
      signals.ctaClicks += 1;
    } else if (event.eventType === "form_start") {
      signals.formStarts += 1;
    } else if (event.eventType === "form_submit" || event.eventType === "signup" || event.eventType === "conversion") {
      signals.formSubmits += 1;
    } else if (event.eventType === "engagement") {
      signals.maxEngagedMs = Math.max(signals.maxEngagedMs, event.engagedMs ?? 0);
      signals.maxScrollDepth = Math.max(signals.maxScrollDepth, event.scrollDepth ?? 0);
    }
  }

  signals.uniquePages = pageStats.length;
  signals.totalEngagedMs = pageStats.reduce((sum, page) => sum + page.engagedMs, 0);
  signals.formAbandons = Math.max(0, signals.formStarts - signals.formSubmits);
  signals.returningSessions = sessions.size;

  let rawScore = 0;
  const reasons: string[] = [];

  if (signals.pageViews > 0) {
    const points = Math.min(10, signals.pageViews * 2);
    rawScore += points;
    reasons.push(`${signals.pageViews} página(s) visitada(s) (+${points})`);
  }
  if (signals.returningSessions > 1) {
    const points = Math.min(15, (signals.returningSessions - 1) * 6);
    rawScore += points;
    reasons.push(`${signals.returningSessions} sessões no período (+${points})`);
  }
  if (signals.pricingViews > 0) {
    rawScore += 20;
    reasons.push("Visitou preços/planos (+20)");
  } else if (signals.highIntentViews > 0) {
    rawScore += 10;
    reasons.push("Visitou página de alta intenção (+10)");
  }
  if (signals.ctaClicks > 0) {
    const points = Math.min(20, signals.ctaClicks * 10);
    rawScore += points;
    reasons.push(`${signals.ctaClicks} clique(s) em CTA (+${points})`);
  }
  if (signals.formStarts > 0) {
    rawScore += 10;
    reasons.push("Iniciou formulário (+10)");
  }
  if (signals.formSubmits > 0) {
    rawScore += 25;
    reasons.push("Converteu por formulário (+25)");
  } else if (signals.formAbandons > 0) {
    rawScore += 8;
    reasons.push("Abandonou formulário, sinal de intenção incompleta (+8)");
  }
  if (signals.totalEngagedMs >= 180_000) {
    rawScore += 12;
    reasons.push("3min+ de tempo ativo nas páginas (+12)");
  } else if (signals.totalEngagedMs >= 60_000) {
    rawScore += 8;
    reasons.push("1min+ de tempo ativo nas páginas (+8)");
  } else if (signals.totalEngagedMs >= 30_000) {
    rawScore += 4;
    reasons.push("30s+ de tempo ativo (+4)");
  }
  if (signals.maxScrollDepth >= 75) {
    rawScore += 5;
    reasons.push("Atingiu 75%+ de profundidade (+5)");
  }

  const score = Math.min(100, rawScore);
  const classification = commercialClassification(score);
  const topPages = pageStats.slice(0, 8);
  const audienceTags = buildAudienceTags(signals, topPages);
  const summary = buildSummaryText(score, signals, topPages, clicks);

  return {
    score,
    ...classification,
    summary,
    reasons,
    audienceTags,
    campaigns: Array.from(campaigns),
    topPages,
    clicks,
    recommendedMaterials: [],
    signals,
    computedAt: new Date().toISOString(),
  };
}

async function resolveRecommendedMaterials(
  tenantId: string,
  summary: BehaviorIntentSummary,
): Promise<BehaviorIntentSummary["recommendedMaterials"]> {
  const rows = await db
    .select({
      id: contentLibraryTable.id,
      title: contentLibraryTable.title,
      type: contentLibraryTable.type,
      theme: contentLibraryTable.theme,
      savedAt: contentLibraryTable.savedAt,
    })
    .from(contentLibraryTable)
    .where(eq(contentLibraryTable.tenantId, tenantId))
    .orderBy(desc(contentLibraryTable.savedAt))
    .limit(80);

  if (!rows.length) return [];
  const interestTerms = summary.topPages
    .slice(0, 3)
    .flatMap((page) => page.path.toLocaleLowerCase("pt-BR").split(/[^a-z0-9áàâãéêíóôõúç]+/i))
    .filter((term) => term.length >= 4);
  const stageTerms = summary.commercialStage === "prioridade" || summary.commercialStage === "oportunidade"
    ? ["case", "proposta", "comparativo", "preço", "preco", "resultado", "depoimento"]
    : summary.commercialStage === "nutricao"
      ? ["guia", "como", "benefício", "beneficio", "comparativo", "dica", "faq"]
      : ["guia", "dica", "conteúdo", "conteudo", "benefício", "beneficio"];

  return rows
    .map((row) => {
      const haystack = `${row.title ?? ""} ${row.theme ?? ""}`.toLocaleLowerCase("pt-BR");
      const score = interestTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 3 : 0), 0)
        + stageTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score || b.row.savedAt.getTime() - a.row.savedAt.getTime())
    .slice(0, 3)
    .map(({ row }) => ({
      id: row.id,
      title: row.title || row.theme || "Material de valor",
      type: row.type,
      theme: row.theme,
    }));
}

function mergeCampaignHistory(
  discoveryData: Record<string, unknown>,
  campaigns: string[],
  nowIso: string,
) {
  const current = Array.isArray(discoveryData["campaignHistory"])
    ? discoveryData["campaignHistory"] as Array<Record<string, unknown>>
    : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of current) {
    const key = typeof item.key === "string" ? item.key : null;
    if (key) byKey.set(key, { ...item, status: "previous" });
  }
  for (const key of campaigns) {
    const existing = byKey.get(key);
    byKey.set(key, {
      key,
      firstSeenAt: typeof existing?.firstSeenAt === "string" ? existing.firstSeenAt : nowIso,
      lastSeenAt: nowIso,
      touches: Number(existing?.touches ?? 0) + 1,
      status: "active",
    });
  }
  return Array.from(byKey.values())
    .sort((a, b) => String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? "")))
    .slice(0, 20);
}

function nutritionNotes(existing: string | null, summary: BehaviorIntentSummary) {
  const markerStart = "[SINAIS DIGITAIS]";
  const markerEnd = "[/SINAIS DIGITAIS]";
  const block = [
    markerStart,
    summary.summary,
    `Momento: ${summary.commercialStageLabel}`,
    `Próxima ação: ${summary.recommendedAction}`,
    summary.audienceTags.length ? `Audiências: ${summary.audienceTags.join(", ")}` : null,
    summary.recommendedMaterials.length ? `Materiais sugeridos: ${summary.recommendedMaterials.map((item) => item.title).join(" | ")}` : null,
    markerEnd,
  ].filter(Boolean).join("\n");

  const current = existing ?? "";
  const pattern = /\[SINAIS DIGITAIS\][\s\S]*?\[\/SINAIS DIGITAIS\]/m;
  return pattern.test(current)
    ? current.replace(pattern, block).trim()
    : [current.trim(), block].filter(Boolean).join("\n\n");
}

async function ensurePipelineContext(input: {
  tenantId: string;
  leadId: string;
  leadName: string;
  assignedTo: string | null;
  summary: BehaviorIntentSummary;
}) {
  if (input.summary.score < 60) return;

  const [activeDeal] = await db
    .select({ id: dealsTable.id, etapa: dealsTable.etapa })
    .from(dealsTable)
    .where(and(
      eq(dealsTable.tenantId, input.tenantId),
      eq(dealsTable.leadId, input.leadId),
      not(inArray(dealsTable.etapa, ["ganho", "perdido", "entregue"])),
    ))
    .orderBy(desc(dealsTable.createdAt))
    .limit(1);

  const desiredStage = input.summary.score >= 80 ? "qualificado" : "em_aquecimento";
  const briefing = `${input.summary.summary} ${input.summary.recommendedAction}`;
  const probability = Math.min(95, Math.max(35, input.summary.score));

  if (!activeDeal) {
    await db.insert(dealsTable).values({
      tenantId: input.tenantId,
      leadId: input.leadId,
      titulo: input.leadName,
      etapa: desiredStage,
      assignedTo: input.assignedTo,
      probabilidade: probability,
      aquecimentoTipo: "behavior_intent",
      relationshipStage: input.summary.commercialStage,
      aiBriefing: briefing,
      aiBriefingGeneratedAt: new Date(),
    });
    return;
  }

  const shouldPromote = activeDeal.etapa === "novo"
    || activeDeal.etapa === "em_aquecimento"
    || activeDeal.etapa === "qualificado";

  await db
    .update(dealsTable)
    .set({
      ...(shouldPromote ? { etapa: desiredStage } : {}),
      probabilidade: probability,
      aquecimentoTipo: "behavior_intent",
      relationshipStage: input.summary.commercialStage,
      aiBriefing: briefing,
      aiBriefingGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, activeDeal.id));
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

  const description = `🔥 ${input.summary.commercialStageLabel} · ${input.summary.summary} ${input.summary.recommendedAction}`;
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
    title: input.summary.score >= 80 ? "🔥 Lead para atendimento agora" : "🔥 Oportunidade quente",
    message: `${input.leadName}: ${input.summary.summary} ${input.summary.recommendedAction}`,
    type: "info",
  });
}

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
      status: leadsTable.status,
      proximaAcao: leadsTable.proximaAcao,
      notasNutricao: leadsTable.notasNutricao,
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
    })
    .from(webBehaviorEventsTable)
    .where(and(
      eq(webBehaviorEventsTable.leadId, lead.id),
      eq(webBehaviorEventsTable.tenantId, lead.tenantId),
      gte(webBehaviorEventsTable.createdAt, since),
    ))
    .orderBy(desc(webBehaviorEventsTable.createdAt))
    .limit(1000);

  if (events.length === 0) return null;
  const behaviorIntent = buildBehaviorIntentSummary(events);
  behaviorIntent.recommendedMaterials = await resolveRecommendedMaterials(tenantId, behaviorIntent);

  const discoveryData = (lead.discoveryData ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const campaignHistory = mergeCampaignHistory(discoveryData, behaviorIntent.campaigns, nowIso);
  const latestPath = events.find((event) => Boolean(event.path))?.path ?? null;
  const commercialJourney = {
    score: behaviorIntent.score,
    stage: behaviorIntent.commercialStage,
    stageLabel: behaviorIntent.commercialStageLabel,
    summary: behaviorIntent.summary,
    nextBestAction: behaviorIntent.recommendedAction,
    audienceTags: behaviorIntent.audienceTags,
    campaigns: behaviorIntent.campaigns,
    campaignHistory,
    topPages: behaviorIntent.topPages,
    clicks: behaviorIntent.clicks,
    recommendedMaterials: behaviorIntent.recommendedMaterials,
    latestPath,
    lastSignalAt: nowIso,
  };

  await db
    .update(leadsTable)
    .set({
      discoveryData: {
        ...discoveryData,
        behaviorIntent,
        commercialJourney,
        campaignHistory,
      },
      proximaAcao: behaviorIntent.recommendedAction,
      notasNutricao: nutritionNotes(lead.notasNutricao, behaviorIntent),
      status: behaviorIntent.score >= 35 && ["novo", "aquecimento"].includes(lead.status)
        ? "aquecimento"
        : lead.status,
      updatedAt: new Date(),
    })
    .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, lead.tenantId)));

  await ensurePipelineContext({
    tenantId: lead.tenantId,
    leadId: lead.id,
    leadName: lead.nome,
    assignedTo: lead.assignedTo,
    summary: behaviorIntent,
  });

  await notifyHotBehaviorIntent({
    leadId: lead.id,
    tenantId: lead.tenantId,
    leadName: lead.nome,
    summary: behaviorIntent,
  });

  return behaviorIntent;
}

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
      if (result) updated += 1;
    } catch (err) {
      log.warn({ err, leadId: row.leadId, tenantId: row.tenantId }, "behavior-intent: lead sync failed");
    }
  }

  if (updated > 0) log.info({ updated }, "behavior-intent: commercial journeys synchronized");
}
