import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Logger } from "pino";
import {
  adCampaignEventsTable,
  db,
  dealsTable,
  leadsTable,
  tenantsTable,
} from "@workspace/db";
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
 * Converte estados comerciais já consolidados do CRM em eventos de marketing
 * idempotentes. O CRM continua sendo a fonte de verdade; este job apenas cria
 * a trilha de eventos que depois alimenta Ads Intelligence, CAPI/Google e o
 * Launch Command Center.
 */
export async function runCommercialLifecycleSync(log: Logger): Promise<void> {
  const since = lookbackDate();
  let salesRecorded = 0;
  let trialsActivated = 0;

  // 1) Venda atribuída: qualquer caminho que tenha deixado o deal em "ganho"
  // converge aqui. onConflictDoNothing + dedupeKey tornam o processo seguro
  // mesmo com várias réplicas ou execuções repetidas.
  const wonDeals = await db
    .select({
      dealId: dealsTable.id,
      tenantId: dealsTable.tenantId,
      leadId: dealsTable.leadId,
      value: dealsTable.valor,
      updatedAt: dealsTable.updatedAt,
      campaignId: leadsTable.adCampaignId,
    })
    .from(dealsTable)
    .innerJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .where(and(
      eq(dealsTable.etapa, "ganho"),
      isNotNull(leadsTable.adCampaignId),
      gte(dealsTable.updatedAt, since),
    ))
    .orderBy(desc(dealsTable.updatedAt))
    .limit(MAX_ROWS_PER_RUN);

  for (const row of wonDeals) {
    if (!row.campaignId) continue;
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

  // 2) Trial ativado: trial_started já traz o tenant criado no metadata.
  // Ativação operacional = onboarding concluído + (integrações concluídas OU
  // pelo menos um lead real criado no tenant). Não usamos apenas login/pageview.
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

  if (salesRecorded > 0 || trialsActivated > 0) {
    log.info({ salesRecorded, trialsActivated }, "commercial-lifecycle: events synchronized");
  }
}
