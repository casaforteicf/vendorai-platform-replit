import { and, desc, eq, gte, isNotNull, like } from "drizzle-orm";
import type { Logger } from "pino";
import {
  adCampaignEventsTable,
  billingEventsTable,
  db,
  dealsTable,
  leadsTable,
  subscriptionsTable,
  tenantsTable,
} from "@workspace/db";
import { VENDORAI_LAUNCH_CAMPAIGN } from "../lib/commercialOffer.js";
import { ensureVendorAiLaunchSubscriptionForDeal } from "../lib/vendorai-subscription-lifecycle.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { canonicalDealValueSql } from "../lib/deal-value.js";

const LOOKBACK_DAYS = 30;
const MAX_ROWS_PER_RUN = 500;

function lookbackDate(): Date {
  return new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

function readMetadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function subscriptionIdFromCycleKey(value: string | null): string | null {
  if (!value?.startsWith("subscription:")) return null;
  const [, subscriptionId, date] = value.split(":");
  return subscriptionId && date ? subscriptionId : null;
}

async function loadSubscriptionAttribution(subscriptionId: string) {
  const [row] = await db
    .select({
      subscriptionId: subscriptionsTable.id,
      customerTenantId: subscriptionsTable.tenantId,
      sourceDealId: subscriptionsTable.sourceDealId,
      subscriptionStatus: subscriptionsTable.status,
      billingPhase: subscriptionsTable.billingPhase,
      monthlyValue: subscriptionsTable.valorMensal,
      annualPriceAtTransition: subscriptionsTable.annualPriceAtTransition,
      subscriptionUpdatedAt: subscriptionsTable.updatedAt,
      marketingTenantId: dealsTable.tenantId,
      leadId: dealsTable.leadId,
      campaignId: leadsTable.adCampaignId,
    })
    .from(subscriptionsTable)
    .innerJoin(dealsTable, eq(dealsTable.id, subscriptionsTable.sourceDealId))
    .innerJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .where(and(
      eq(subscriptionsTable.id, subscriptionId),
      eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN),
    ))
    .limit(1);
  return row ?? null;
}

/**
 * Converts consolidated commercial/financial state into idempotent lifecycle
 * events. CRM is still the sale source of truth; billing events are the source
 * of paid activation, renewal and annual upgrade; logical cancellation is the
 * source of churn. No marketing loop mutates financial truth here.
 */
export async function runCommercialLifecycleSync(log: Logger): Promise<void> {
  const since = lookbackDate();
  let salesRecorded = 0;
  let subscriptionsPrepared = 0;
  let subscriptionsStarted = 0;
  let trialsActivated = 0;
  let renewalsRecorded = 0;
  let annualUpgradesRecorded = 0;
  let churnRecorded = 0;

  const wonDeals = await db
    .select({
      dealId: dealsTable.id,
      tenantId: dealsTable.tenantId,
      leadId: dealsTable.leadId,
      value: canonicalDealValueSql,
      updatedAt: dealsTable.updatedAt,
      campaignId: leadsTable.adCampaignId,
      leadSource: leadsTable.source,
    })
    .from(dealsTable)
    .innerJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .where(and(
      eq(dealsTable.etapa, "ganho"),
      gte(dealsTable.updatedAt, since),
    ))
    .orderBy(desc(dealsTable.updatedAt))
    .limit(MAX_ROWS_PER_RUN);

  for (const row of wonDeals) {
    if (row.campaignId) {
      try {
        const event = await recordAdCampaignEvent({
          tenantId: row.tenantId,
          campaignId: row.campaignId,
          eventType: "sale_closed",
          severity: "success",
          message: "Venda fechada no CRM e atribuída à campanha.",
          dedupeKey: `deal:${row.dealId}:won`,
          metadata: {
            dealId: row.dealId,
            leadId: row.leadId,
            value: Number(row.value ?? 0),
            currency: "BRL",
            closedAt: row.updatedAt?.toISOString() ?? null,
          },
        });
        if (event) salesRecorded++;
      } catch (err) {
        log.warn({ err, dealId: row.dealId, campaignId: row.campaignId }, "commercial-lifecycle: sale_closed failed");
      }
    }

    if (row.leadSource === "trial_signup") {
      try {
        const subscription = await ensureVendorAiLaunchSubscriptionForDeal(row.dealId);
        if (subscription) subscriptionsPrepared++;

        if (subscription?.status === "ativa" && row.campaignId) {
          const event = await recordAdCampaignEvent({
            tenantId: row.tenantId,
            campaignId: row.campaignId,
            eventType: "subscription_started",
            severity: "success",
            message: "Pagamento confirmado e trial convertido em assinatura ativa.",
            dedupeKey: `deal:${row.dealId}:subscription_started`,
            metadata: {
              dealId: row.dealId,
              leadId: row.leadId,
              trialTenantId: subscription.tenantId,
              subscriptionId: subscription.id,
              value: Number(subscription.valorMensal ?? 0),
              currency: "BRL",
              paymentStatus: "paid",
              billingPhase: subscription.billingPhase,
              startedAt: subscription.updatedAt.toISOString(),
            },
          });
          if (event) subscriptionsStarted++;
        }
      } catch (err) {
        log.error({ err, dealId: row.dealId }, "commercial-lifecycle: trial subscription sync failed");
      }
    }
  }

  // Trial activated operationally: onboarding complete + integration or first
  // real lead. This is product value, not a paid subscription event.
  const trialStarts = await db
    .select({
      eventId: adCampaignEventsTable.id,
      marketingTenantId: adCampaignEventsTable.tenantId,
      campaignId: adCampaignEventsTable.campaignId,
      metadata: adCampaignEventsTable.metadata,
      createdAt: adCampaignEventsTable.createdAt,
    })
    .from(adCampaignEventsTable)
    .where(and(
      eq(adCampaignEventsTable.eventType, "trial_started"),
      gte(adCampaignEventsTable.createdAt, since),
    ))
    .orderBy(desc(adCampaignEventsTable.createdAt))
    .limit(MAX_ROWS_PER_RUN);

  for (const trialStart of trialStarts) {
    const trialTenantId = readMetadataString(trialStart.metadata, "trialTenantId");
    if (!trialTenantId) continue;
    const salesLeadId = readMetadataString(trialStart.metadata, "leadId");

    try {
      const [trialTenant] = await db
        .select({
          id: tenantsTable.id,
          onboardingConcluido: tenantsTable.onboardingConcluido,
          integracoesConcluido: tenantsTable.integracoesConcluido,
        })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, trialTenantId))
        .limit(1);
      if (!trialTenant?.onboardingConcluido) continue;

      let hasRealLead = false;
      if (!trialTenant.integracoesConcluido) {
        const [firstLead] = await db
          .select({ id: leadsTable.id })
          .from(leadsTable)
          .where(and(
            eq(leadsTable.tenantId, trialTenantId),
            eq(leadsTable.pipelineExempt, false),
          ))
          .limit(1);
        hasRealLead = Boolean(firstLead);
      }

      if (!trialTenant.integracoesConcluido && !hasRealLead) continue;

      const event = await recordAdCampaignEvent({
        tenantId: trialStart.marketingTenantId,
        campaignId: trialStart.campaignId,
        eventType: "trial_activated",
        severity: "success",
        message: "Trial atingiu ativação operacional no VendorAI.",
        dedupeKey: `trial:${trialTenantId}:activated`,
        metadata: {
          trialTenantId,
          leadId: salesLeadId,
          trialStartedEventId: trialStart.eventId,
          activationDefinition: "onboarding_complete_and_(integration_complete_or_first_real_lead)",
          integrationsComplete: trialTenant.integracoesConcluido,
          firstRealLead: hasRealLead,
          activatedAt: new Date().toISOString(),
        },
      });
      if (event) trialsActivated++;
    } catch (err) {
      log.warn({ err, trialTenantId, campaignId: trialStart.campaignId }, "commercial-lifecycle: trial_activated failed");
    }
  }

  // Every paid non-initial VendorAI cycle is a real renewal. The first paid
  // annual cycle additionally represents the annual upgrade; its dedupe key is
  // subscription-scoped so subsequent yearly renewals never re-emit upgrade.
  const paidCycles = await db
    .select({
      id: billingEventsTable.id,
      tenantId: billingEventsTable.tenantId,
      mes: billingEventsTable.mes,
      tipo: billingEventsTable.tipo,
      valor: billingEventsTable.valor,
      paidAt: billingEventsTable.paidAt,
    })
    .from(billingEventsTable)
    .where(and(
      eq(billingEventsTable.status, "paid"),
      isNotNull(billingEventsTable.paidAt),
      gte(billingEventsTable.paidAt, since),
      like(billingEventsTable.mes, "subscription:%"),
    ))
    .orderBy(desc(billingEventsTable.paidAt))
    .limit(MAX_ROWS_PER_RUN);

  for (const cycle of paidCycles) {
    if (cycle.tipo === "initial") continue;
    const subscriptionId = subscriptionIdFromCycleKey(cycle.mes);
    if (!subscriptionId) continue;

    try {
      const attribution = await loadSubscriptionAttribution(subscriptionId);
      if (!attribution?.campaignId) continue;

      const renewal = await recordAdCampaignEvent({
        tenantId: attribution.marketingTenantId,
        campaignId: attribution.campaignId,
        eventType: "subscription_renewed",
        severity: "success",
        message: cycle.tipo === "annual"
          ? "Renovação anual VendorAI confirmada financeiramente."
          : "Renovação mensal VendorAI confirmada financeiramente.",
        dedupeKey: `billing:${cycle.id}:subscription_renewed`,
        metadata: {
          subscriptionId,
          billingEventId: cycle.id,
          dealId: attribution.sourceDealId,
          leadId: attribution.leadId,
          customerTenantId: attribution.customerTenantId,
          cadence: cycle.tipo,
          billingPhase: attribution.billingPhase,
          value: Number(cycle.valor ?? 0),
          currency: "BRL",
          paidAt: cycle.paidAt?.toISOString() ?? null,
          cycleKey: cycle.mes,
        },
      });
      if (renewal) renewalsRecorded++;

      if (cycle.tipo === "annual") {
        const annualUpgrade = await recordAdCampaignEvent({
          tenantId: attribution.marketingTenantId,
          campaignId: attribution.campaignId,
          eventType: "annual_upgrade",
          severity: "success",
          message: "Primeira cobrança anual VendorAI confirmada; upgrade anual efetivado.",
          dedupeKey: `subscription:${subscriptionId}:annual_upgrade`,
          metadata: {
            subscriptionId,
            billingEventId: cycle.id,
            dealId: attribution.sourceDealId,
            leadId: attribution.leadId,
            customerTenantId: attribution.customerTenantId,
            monthlyEquivalent: Number(attribution.annualPriceAtTransition ?? 0),
            annualValue: Number(cycle.valor ?? 0),
            currency: "BRL",
            paidAt: cycle.paidAt?.toISOString() ?? null,
          },
        });
        if (annualUpgrade) annualUpgradesRecorded++;
      }
    } catch (err) {
      log.warn({ err, billingEventId: cycle.id, subscriptionId }, "commercial-lifecycle: renewal/annual sync failed");
    }
  }

  // Logical cancellation preserves all paid history and is the financial source
  // of churn for this lifecycle. Dedupe keeps the event stable across sync runs.
  const cancelledSubscriptions = await db
    .select({
      subscriptionId: subscriptionsTable.id,
      customerTenantId: subscriptionsTable.tenantId,
      sourceDealId: subscriptionsTable.sourceDealId,
      billingPhase: subscriptionsTable.billingPhase,
      monthlyValue: subscriptionsTable.valorMensal,
      cancelledAt: subscriptionsTable.updatedAt,
      marketingTenantId: dealsTable.tenantId,
      leadId: dealsTable.leadId,
      campaignId: leadsTable.adCampaignId,
    })
    .from(subscriptionsTable)
    .innerJoin(dealsTable, eq(dealsTable.id, subscriptionsTable.sourceDealId))
    .innerJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .where(and(
      eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN),
      eq(subscriptionsTable.status, "cancelada"),
      gte(subscriptionsTable.updatedAt, since),
    ))
    .orderBy(desc(subscriptionsTable.updatedAt))
    .limit(MAX_ROWS_PER_RUN);

  for (const sub of cancelledSubscriptions) {
    if (!sub.campaignId) continue;
    try {
      const event = await recordAdCampaignEvent({
        tenantId: sub.marketingTenantId,
        campaignId: sub.campaignId,
        eventType: "churn",
        severity: "warning",
        message: "Assinatura VendorAI cancelada; churn financeiro registrado.",
        dedupeKey: `subscription:${sub.subscriptionId}:churn`,
        metadata: {
          subscriptionId: sub.subscriptionId,
          dealId: sub.sourceDealId,
          leadId: sub.leadId,
          customerTenantId: sub.customerTenantId,
          billingPhase: sub.billingPhase,
          monthlyValue: Number(sub.monthlyValue ?? 0),
          currency: "BRL",
          churnSource: "financial_subscription_cancelled",
          cancelledAt: sub.cancelledAt.toISOString(),
        },
      });
      if (event) churnRecorded++;
    } catch (err) {
      log.warn({ err, subscriptionId: sub.subscriptionId }, "commercial-lifecycle: churn sync failed");
    }
  }

  if (
    salesRecorded > 0 || subscriptionsPrepared > 0 || subscriptionsStarted > 0 ||
    trialsActivated > 0 || renewalsRecorded > 0 || annualUpgradesRecorded > 0 || churnRecorded > 0
  ) {
    log.info(
      {
        salesRecorded,
        subscriptionsPrepared,
        subscriptionsStarted,
        trialsActivated,
        renewalsRecorded,
        annualUpgradesRecorded,
        churnRecorded,
      },
      "commercial-lifecycle: events synchronized",
    );
  }
}
