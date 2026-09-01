import { and, desc, eq, like } from "drizzle-orm";
import type { Logger } from "pino";
import {
  billingEventsTable,
  db,
  dealsTable,
  leadsTable,
  subscriptionsTable,
  tenantsTable,
} from "@workspace/db";
import { VENDORAI_LAUNCH_CAMPAIGN } from "../lib/commercialOffer.js";
import {
  addCalendarMonth,
  addCalendarYear,
  logicalDueFromVendorAiCycleKey,
} from "../lib/vendorai-subscription-rules.js";
import { ensureTenantPlanAndCommission } from "../lib/deal-closure-commission.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

const MAX_SUBSCRIPTIONS_PER_RUN = 200;

/**
 * Reconciles the Asaas webhook result (billing_events) with subscriptions.
 * The webhook remains the financial source of truth; this job only advances
 * product state after the persisted event is paid/overdue.
 */
export async function runVendorAiSubscriptionPaymentSync(log: Logger): Promise<void> {
  const subscriptions = await db
    .select({
      id: subscriptionsTable.id,
      tenantId: subscriptionsTable.tenantId,
      status: subscriptionsTable.status,
      sourceDealId: subscriptionsTable.sourceDealId,
      proximaCobranca: subscriptionsTable.proximaCobranca,
      trialEndsAt: subscriptionsTable.trialEndsAt,
      tenantIsDemo: tenantsTable.isDemo,
    })
    .from(subscriptionsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, subscriptionsTable.tenantId))
    .where(eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN))
    .limit(MAX_SUBSCRIPTIONS_PER_RUN);

  let activated = 0;
  let recovered = 0;
  let overdue = 0;

  for (const sub of subscriptions) {
    if (sub.status === "cancelada") continue;

    try {
      const [event] = await db
        .select()
        .from(billingEventsTable)
        .where(and(
          eq(billingEventsTable.tenantId, sub.tenantId),
          like(billingEventsTable.mes, `subscription:${sub.id}:%`),
        ))
        .orderBy(desc(billingEventsTable.createdAt))
        .limit(1);
      if (!event) continue;

      if (event.status === "overdue") {
        if (sub.status !== "inadimplente") {
          await db.update(subscriptionsTable).set({
            status: "inadimplente",
            updatedAt: new Date(),
          }).where(eq(subscriptionsTable.id, sub.id));
          overdue++;
        }
        continue;
      }

      if (event.status !== "paid") continue;

      const logicalDue = logicalDueFromVendorAiCycleKey(event.mes) ?? event.dueDate;
      if (!logicalDue) {
        log.error({ subscriptionId: sub.id, billingEventId: event.id }, "vendorai-subscription-payment-sync: ciclo sem data lógica");
        continue;
      }

      // Preserve the contractual billing calendar. A late payment settles the
      // overdue cycle, but does not silently move every future due date. The
      // trial-end day is the anchor so Jan-31 → Feb-28/29 → Mar-31 instead of
      // drifting permanently to the 28th. Annual cycles advance twelve months.
      const anchorDay = sub.trialEndsAt?.getUTCDate() ?? logicalDue.getUTCDate();
      const computedNextDue = event.tipo === "annual"
        ? addCalendarYear(logicalDue, anchorDay)
        : addCalendarMonth(logicalDue, anchorDay);
      const shouldAdvance = !sub.proximaCobranca || sub.proximaCobranca.getTime() <= logicalDue.getTime();
      const needsTrialActivation = Boolean(sub.sourceDealId && sub.tenantIsDemo);
      const isRecovery = sub.status === "inadimplente";

      // Financial truth is reflected on the originating deal on every paid
      // reconciliation. Activation itself is keyed from the tenant's real demo
      // state, not from subscription.status: the first charge may have gone
      // trial → inadimplente → paid and still needs to convert that same tenant.
      if (sub.sourceDealId) {
        await db.update(dealsTable).set({
          chargeStatus: "paid",
          updatedAt: new Date(),
        }).where(eq(dealsTable.id, sub.sourceDealId));
      }
      if (sub.sourceDealId && needsTrialActivation) {
        await ensureTenantPlanAndCommission(sub.sourceDealId, log, { activateTrial: true });
      }

      if (needsTrialActivation || isRecovery || shouldAdvance || sub.status === "trial") {
        await db.update(subscriptionsTable).set({
          status: "ativa",
          ...(shouldAdvance ? { proximaCobranca: computedNextDue } : {}),
          updatedAt: new Date(),
        }).where(eq(subscriptionsTable.id, sub.id));
      }

      // Revenue recovery must be backed by actual money, never by lead intent.
      // We emit it only when the persisted subscription was delinquent before
      // this paid reconciliation. Event idempotency is tied to the paid cycle.
      if (isRecovery && sub.sourceDealId) {
        const [attribution] = await db
          .select({
            marketingTenantId: dealsTable.tenantId,
            leadId: dealsTable.leadId,
            campaignId: leadsTable.adCampaignId,
          })
          .from(dealsTable)
          .leftJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
          .where(eq(dealsTable.id, sub.sourceDealId))
          .limit(1);

        if (attribution?.campaignId) {
          await recordAdCampaignEvent({
            tenantId: attribution.marketingTenantId,
            campaignId: attribution.campaignId,
            eventType: "subscription_recovered",
            severity: "success",
            message: "Pagamento em atraso recuperado e assinatura VendorAI reativada.",
            dedupeKey: `billing:${event.id}:subscription_recovered`,
            metadata: {
              subscriptionId: sub.id,
              billingEventId: event.id,
              dealId: sub.sourceDealId,
              leadId: attribution.leadId,
              customerTenantId: sub.tenantId,
              cadence: event.tipo,
              value: Number(event.valor ?? 0),
              currency: "BRL",
              recoveredAt: event.paidAt?.toISOString() ?? new Date().toISOString(),
              cycleKey: event.mes,
            },
          });
        }
      }

      if (needsTrialActivation) activated++;
      else if (isRecovery) recovered++;
    } catch (err) {
      log.error({ err, subscriptionId: sub.id, tenantId: sub.tenantId }, "vendorai-subscription-payment-sync: failed");
    }
  }

  if (activated > 0 || recovered > 0 || overdue > 0) {
    log.info({ activated, recovered, overdue }, "vendorai-subscription-payment-sync: complete");
  }
}
