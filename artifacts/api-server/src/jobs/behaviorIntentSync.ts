import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Logger } from "pino";
import { db, leadsTable, webBehaviorEventsTable } from "@workspace/db";

const LOOKBACK_DAYS = 30;
const MAX_LEADS_PER_RUN = 250;

export type BehaviorIntentSummary = {
  score: number;
  reasons: string[];
  signals: {
    pageViews: number;
    ctaClicks: number;
    formStarts: number;
    formSubmits: number;
    maxEngagedMs: number;
    maxScrollDepth: number;
    pricingViews: number;
  };
  computedAt: string;
};

function buildSummary(events: Array<{
  eventType: string;
  path: string | null;
  engagedMs: number | null;
  scrollDepth: number | null;
}>): BehaviorIntentSummary {
  const signals = {
    pageViews: 0,
    ctaClicks: 0,
    formStarts: 0,
    formSubmits: 0,
    maxEngagedMs: 0,
    maxScrollDepth: 0,
    pricingViews: 0,
  };

  for (const event of events) {
    if (event.eventType === "page_view") {
      signals.pageViews++;
      if (/\/(pricing|planos|precos|preços)(\/|\?|$)/i.test(event.path ?? "")) {
        signals.pricingViews++;
      }
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

  let score = 0;
  const reasons: string[] = [];

  if (signals.pageViews > 0) {
    const points = Math.min(10, signals.pageViews * 2);
    score += points;
    reasons.push(`${signals.pageViews} página(s) visitada(s) (+${points})`);
  }
  if (signals.pricingViews > 0) {
    score += 15;
    reasons.push("Visitou página de planos/preços (+15)");
  }
  if (signals.ctaClicks > 0) {
    const points = Math.min(20, signals.ctaClicks * 10);
    score += points;
    reasons.push(`${signals.ctaClicks} clique(s) em CTA (+${points})`);
  }
  if (signals.formStarts > 0) {
    score += 15;
    reasons.push("Iniciou formulário (+15)");
  }
  if (signals.formSubmits > 0) {
    score += 25;
    reasons.push("Enviou formulário (+25)");
  }
  if (signals.maxEngagedMs >= 60_000) {
    score += 10;
    reasons.push("Engajamento de pelo menos 60s (+10)");
  } else if (signals.maxEngagedMs >= 30_000) {
    score += 5;
    reasons.push("Engajamento de pelo menos 30s (+5)");
  }
  if (signals.maxScrollDepth >= 75) {
    score += 8;
    reasons.push("Atingiu 75%+ de profundidade (+8)");
  } else if (signals.maxScrollDepth >= 50) {
    score += 4;
    reasons.push("Atingiu 50%+ de profundidade (+4)");
  }

  return {
    score: Math.min(100, score),
    reasons,
    signals,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Recalcula o Behavior Intent de um único lead logo após uma sessão anônima
 * ser identificada. O tenant faz parte da condição para impedir qualquer
 * associação cruzada entre empresas.
 *
 * Atualiza somente discoveryData.behaviorIntent. Não toca em intentScore
 * (Revenue Scout), propensityScore ou fit comercial.
 */
export async function syncBehaviorIntentForLead(
  leadId: string,
  tenantId: string,
): Promise<BehaviorIntentSummary | null> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const [lead] = await db
    .select({ id: leadsTable.id, tenantId: leadsTable.tenantId, discoveryData: leadsTable.discoveryData })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) return null;

  const events = await db
    .select({
      eventType: webBehaviorEventsTable.eventType,
      path: webBehaviorEventsTable.path,
      engagedMs: webBehaviorEventsTable.engagedMs,
      scrollDepth: webBehaviorEventsTable.scrollDepth,
    })
    .from(webBehaviorEventsTable)
    .where(and(
      eq(webBehaviorEventsTable.leadId, lead.id),
      eq(webBehaviorEventsTable.tenantId, lead.tenantId),
      gte(webBehaviorEventsTable.createdAt, since),
    ))
    .orderBy(desc(webBehaviorEventsTable.createdAt))
    .limit(500);

  if (events.length === 0) return null;
  const behaviorIntent = buildSummary(events);
  await db
    .update(leadsTable)
    .set({
      discoveryData: {
        ...(lead.discoveryData ?? {}),
        behaviorIntent,
      },
      updatedAt: new Date(),
    })
    .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, lead.tenantId)));

  return behaviorIntent;
}

/**
 * Varredura de segurança para manter scores sincronizados caso um evento seja
 * vinculado fora do caminho síncrono. Continua separada do Revenue Scout.
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
    if (!row.leadId) continue;
    try {
      const result = await syncBehaviorIntentForLead(row.leadId, row.tenantId);
      if (result) updated++;
    } catch (err) {
      log.warn({ err, leadId: row.leadId, tenantId: row.tenantId }, "behavior-intent: lead sync failed");
    }
  }

  if (updated > 0) {
    log.info({ updated }, "behavior-intent: scores synchronized");
  }
}
