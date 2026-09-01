import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  billingEventsTable,
  db,
  notificationsTable,
  plansTable,
  subscriptionsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import {
  createCharge,
  createOrGetCustomer,
  findChargeByExternalReference,
  isAsaasConfigured,
  type AsaasChargeOutput,
} from "../lib/asaas.js";
import {
  resolveCommercialBillingPhase,
  VENDORAI_LAUNCH_CAMPAIGN,
} from "../lib/commercialOffer.js";
import { resolveVendorAiSubscriptionPrice } from "../lib/vendorai-subscription-lifecycle.js";
import { sendVendorAiSubscriptionChargeEmail } from "../lib/trial-email.js";

const MAX_SUBSCRIPTIONS_PER_RUN = 100;
const STALE_CLAIM_MS = 10 * 60 * 1000;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function vendorAiSubscriptionCycleKey(subscriptionId: string, dueDate: Date): string {
  return `subscription:${subscriptionId}:${dateKey(dueDate)}`;
}

function maxToday(date: Date): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const requested = new Date(date);
  requested.setUTCHours(0, 0, 0, 0);
  return requested < today ? today : requested;
}

function phaseLabel(phase: string): string {
  if (phase === "promo_1") return "promocional 1 (R$ 497)";
  if (phase === "promo_2") return "promocional 2 (R$ 990)";
  if (phase === "regular") return "preço regular do plano";
  return phase;
}

function localStatusFromAsaas(charge: AsaasChargeOutput): "pending" | "paid" | "overdue" {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(charge.status)) return "paid";
  if (charge.status === "OVERDUE") return "overdue";
  return "pending";
}

/**
 * Application-managed recurring billing for the VendorAI launch offer.
 *
 * It intentionally does NOT replace legacy `runMonthlyBilling()`: old tenant
 * contracts keep using tenant.mensalidadeValor. Only subscriptions carrying the
 * launch campaign code enter this worker.
 *
 * Safety:
 * - disabled by default (`VENDORAI_SUBSCRIPTION_BILLING_ENABLED=true` to enable);
 * - platform Asaas key only (tenant paying VendorAI);
 * - one stable cycle key per subscription due date;
 * - recovers remote charge by externalReference before creating another;
 * - next due date advances only after a confirmed payment event/sync.
 */
export async function runVendorAiSubscriptionBilling(log: Logger): Promise<void> {
  if (process.env["VENDORAI_SUBSCRIPTION_BILLING_ENABLED"] !== "true") {
    log.debug("vendorai-subscription-billing: disabled by feature flag");
    return;
  }
  if (!(await isAsaasConfigured())) {
    log.warn("vendorai-subscription-billing: platform ASAAS_API_KEY não configurada");
    return;
  }

  const now = new Date();
  const dueSubscriptions = await db
    .select({
      id: subscriptionsTable.id,
      tenantId: subscriptionsTable.tenantId,
      plano: subscriptionsTable.plano,
      status: subscriptionsTable.status,
      proximaCobranca: subscriptionsTable.proximaCobranca,
      trialEndsAt: subscriptionsTable.trialEndsAt,
      promoPhase1Price: subscriptionsTable.promoPhase1Price,
      promoPhase1EndsAt: subscriptionsTable.promoPhase1EndsAt,
      promoPhase2Price: subscriptionsTable.promoPhase2Price,
      promoPhase2EndsAt: subscriptionsTable.promoPhase2EndsAt,
      regularPriceAtTransition: subscriptionsTable.regularPriceAtTransition,
      asaasCustomerId: subscriptionsTable.asaasCustomerId,
      tenantName: tenantsTable.name,
      catalogMonthlyPriceCents: plansTable.monthlyPriceCents,
    })
    .from(subscriptionsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, subscriptionsTable.tenantId))
    .innerJoin(plansTable, sql`${plansTable.slug} = ${subscriptionsTable.plano}`)
    .where(and(
      eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN),
      inArray(subscriptionsTable.status, ["trial", "ativa"]),
      isNotNull(subscriptionsTable.proximaCobranca),
      lte(subscriptionsTable.proximaCobranca, now),
    ))
    .limit(MAX_SUBSCRIPTIONS_PER_RUN);

  let created = 0;
  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of dueSubscriptions) {
    if (!sub.proximaCobranca || !sub.trialEndsAt || !sub.promoPhase1EndsAt || !sub.promoPhase2EndsAt) {
      log.error({ subscriptionId: sub.id }, "vendorai-subscription-billing: schedule incompleto");
      failed++;
      continue;
    }

    try {
      const logicalDue = sub.proximaCobranca;
      const phase = resolveCommercialBillingPhase({
        trialEndsAt: sub.trialEndsAt,
        promoPhase1EndsAt: sub.promoPhase1EndsAt,
        promoPhase2EndsAt: sub.promoPhase2EndsAt,
      }, logicalDue);

      if (phase === "trial") {
        await db.update(subscriptionsTable).set({
          proximaCobranca: sub.trialEndsAt,
          updatedAt: now,
        }).where(eq(subscriptionsTable.id, sub.id));
        skipped++;
        continue;
      }

      const pricing = resolveVendorAiSubscriptionPrice({
        phase,
        promoPhase1Price: sub.promoPhase1Price,
        promoPhase2Price: sub.promoPhase2Price,
        regularPriceAtTransition: sub.regularPriceAtTransition,
        catalogMonthlyPriceCents: sub.catalogMonthlyPriceCents,
      });
      const amount = Number(pricing.price);
      if (!(amount > 0)) throw new Error(`Preço inválido para ${phase}`);

      const chargeDue = maxToday(logicalDue);
      const cycleKey = vendorAiSubscriptionCycleKey(sub.id, logicalDue);
      let claimedByThisRun = false;

      let [billingEvent] = await db
        .select()
        .from(billingEventsTable)
        .where(eq(billingEventsTable.mes, cycleKey))
        .limit(1);

      if (!billingEvent) {
        const [claimed] = await db
          .insert(billingEventsTable)
          .values({
            tenantId: sub.tenantId,
            mes: cycleKey,
            tipo: sub.status === "trial" ? "initial" : "monthly",
            valor: pricing.price,
            status: "pending",
            dueDate: chargeDue,
          })
          .onConflictDoNothing()
          .returning();
        if (claimed) {
          billingEvent = claimed;
          claimedByThisRun = true;
        } else {
          [billingEvent] = await db
            .select()
            .from(billingEventsTable)
            .where(eq(billingEventsTable.mes, cycleKey))
            .limit(1);
        }
      }

      if (!billingEvent) throw new Error("Não foi possível adquirir o ciclo de cobrança");
      if (billingEvent.asaasChargeId) {
        skipped++;
        continue;
      }

      const remotelyExisting = await findChargeByExternalReference(cycleKey);
      if (remotelyExisting) {
        const recoveredStatus = localStatusFromAsaas(remotelyExisting);
        await db.update(billingEventsTable).set({
          asaasChargeId: remotelyExisting.id,
          valor: pricing.price,
          status: recoveredStatus,
          dueDate: chargeDue,
          ...(recoveredStatus === "paid" ? { paidAt: new Date() } : {}),
        }).where(eq(billingEventsTable.id, billingEvent.id));

        // Critical crash-recovery path: the remote payment may have been
        // created before the previous process persisted the subscription phase
        // and regular-price snapshot. Reconcile those fields here as well so a
        // later catalog price change can never rewrite an agreement already in
        // the regular phase.
        await db.update(subscriptionsTable).set({
          billingPhase: phase,
          valorMensal: pricing.price,
          ...(pricing.regularSnapshot && !sub.regularPriceAtTransition
            ? { regularPriceAtTransition: pricing.regularSnapshot }
            : {}),
          updatedAt: now,
        }).where(eq(subscriptionsTable.id, sub.id));

        recovered++;
        continue;
      }

      // A fresh claim owned by another replica must not be raced. A stale claim
      // is safe to recover because we already queried Asaas by externalReference.
      const isFreshClaim = now.getTime() - billingEvent.createdAt.getTime() < STALE_CLAIM_MS;
      if (!claimedByThisRun && isFreshClaim) {
        skipped++;
        continue;
      }

      const [admin] = await db
        .select({ email: usersTable.email, name: usersTable.name, telefone: usersTable.telefone })
        .from(usersTable)
        .where(and(
          eq(usersTable.tenantId, sub.tenantId),
          eq(usersTable.role, "admin"),
          eq(usersTable.active, true),
        ))
        .limit(1);
      if (!admin?.email) throw new Error("Tenant sem usuário admin com e-mail para cobrança");

      const customerId = sub.asaasCustomerId ?? (await createOrGetCustomer({
        name: sub.tenantName || admin.name,
        email: admin.email,
        phone: admin.telefone ?? undefined,
      })).id;

      // Reconcile one more time immediately before POST. This closes the stale
      // claim window where another attempt may have created the charge after the
      // first lookup but before this worker became eligible to retry.
      const beforeCreate = await findChargeByExternalReference(cycleKey);
      const charge = beforeCreate ?? await createCharge({
        customer: customerId,
        billingType: "UNDEFINED",
        value: amount,
        dueDate: dateKey(chargeDue),
        description: `VendorAI — ${sub.plano} — ${phaseLabel(phase)}`,
        externalReference: cycleKey,
      });
      const chargeStatus = localStatusFromAsaas(charge);

      await db.update(billingEventsTable).set({
        asaasChargeId: charge.id,
        asaasCustomerId: customerId,
        valor: pricing.price,
        status: chargeStatus,
        dueDate: chargeDue,
        ...(chargeStatus === "paid" ? { paidAt: new Date() } : {}),
      }).where(eq(billingEventsTable.id, billingEvent.id));

      await db.update(subscriptionsTable).set({
        asaasCustomerId: customerId,
        billingPhase: phase,
        valorMensal: pricing.price,
        ...(pricing.regularSnapshot && !sub.regularPriceAtTransition
          ? { regularPriceAtTransition: pricing.regularSnapshot }
          : {}),
        updatedAt: now,
      }).where(eq(subscriptionsTable.id, sub.id));

      const invoiceUrl = charge.invoiceUrl || charge.bankSlipUrl;
      if (invoiceUrl && chargeStatus !== "paid") {
        await sendVendorAiSubscriptionChargeEmail({
          to: admin.email,
          name: admin.name,
          companyName: sub.tenantName,
          amount: pricing.price,
          dueDate: chargeDue,
          invoiceUrl,
          phaseLabel: phaseLabel(phase),
        }).catch((err) => log.warn({ err, subscriptionId: sub.id }, "vendorai-subscription-billing: e-mail falhou"));
      }

      await db.insert(notificationsTable).values({
        tenantId: sub.tenantId,
        type: "info",
        category: "billing",
        title: chargeStatus === "paid" ? "Mensalidade VendorAI confirmada" : "Mensalidade VendorAI disponível",
        message: `Cobrança de ${Number(pricing.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} processada para a fase ${phaseLabel(phase)}.`,
      });

      if (beforeCreate) recovered++;
      else created++;
    } catch (err) {
      failed++;
      log.error({ err, subscriptionId: sub.id, tenantId: sub.tenantId }, "vendorai-subscription-billing: subscription failed");
    }
  }

  if (dueSubscriptions.length > 0) {
    log.info({ due: dueSubscriptions.length, created, recovered, skipped, failed }, "vendorai-subscription-billing: complete");
  }
}
