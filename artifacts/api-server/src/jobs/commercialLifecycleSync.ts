import { and, desc, eq, gte } from "drizzle-orm";
import type { Logger } from "pino";
import {
  adCampaignEventsTable,
  db,
  dealsTable,
  leadsTable,
  tenantsTable,
} from "@workspace/db";
import { ensureTenantPlanAndCommission } from "../lib/deal-closure-commission.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

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

/**
 * Converte estados comerciais/financeiros consolidados em eventos de lifecycle.
 * CRM continua sendo a fonte de venda; chargeStatus=paid é a fonte mínima para
 * ativação paga do trial. Isso evita tratar deal ganho como pagamento recebido.
 */
export async function runCommercialLifecycleSync(log: Logger): Promise<void> {
  const since = lookbackDate();
  let salesRecorded = 0;
  let subscriptionsStarted = 0;
  let trialsActivated = 0;

  // 1) Deals ganhos recentes. Não filtramos por campanha aqui porque a ativação
  // paga de um trial orgânico também precisa acontecer. Eventos de marketing só
  // são gravados quando campaignId existe.
  const wonDeals = await db
    .select({
      dealId: dealsTable.id,
      tenantId: dealsTable.tenantId,
      leadId: dealsTable.leadId,
      value: dealsTable.valor,
      updatedAt: dealsTable.updatedAt,
      chargeStatus: dealsTable.chargeStatus,
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
    // Venda comercial: útil mesmo antes da liquidação para diagnóstico do funil.
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

    // Trial pago: somente o sinal financeiro reabre/converte a conta testada.
    if (row.leadSource === "trial_signup" && row.chargeStatus === "paid") {
      try {
        const activation = await ensureTenantPlanAndCommission(row.dealId, log, { activateTrial: true });
        if (activation.tenantId && row.campaignId) {
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
              trialTenantId: activation.tenantId,
              value: Number(row.value ?? 0),
              currency: "BRL",
              paymentStatus: "paid",
              startedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
            },
          });
          if (event) subscriptionsStarted++;
        }
      } catch (err) {
        log.error({ err, dealId: row.dealId }, "commercial-lifecycle: paid trial activation failed");
      }
    }
  }

  // 2) Trial ativado operacionalmente: onboarding completo + integração ou
  // primeiro lead real. É valor de produto, não assinatura paga.
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

  if (salesRecorded > 0 || subscriptionsStarted > 0 || trialsActivated > 0) {
    log.info({ salesRecorded, subscriptionsStarted, trialsActivated }, "commercial-lifecycle: events synchronized");
  }
}
