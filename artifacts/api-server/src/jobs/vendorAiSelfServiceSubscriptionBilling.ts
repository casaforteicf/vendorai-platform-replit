import { and, eq, inArray, isNotNull, lte, ne } from "drizzle-orm";
import type { Logger } from "pino";
import {
  billingEventsTable,
  db,
  subscriptionsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import {
  createCharge,
  createOrGetCustomer,
  findChargeByExternalReference,
  isAsaasConfigured,
} from "../lib/asaas.js";
import { VENDORAI_LAUNCH_CAMPAIGN } from "../lib/commercialOffer.js";
import { addCalendarMonth, addCalendarYear } from "../lib/vendorai-subscription-rules.js";

const MAX_PER_RUN = 100;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cycleKey(subscriptionId: string, due: Date) {
  return `subscription:${subscriptionId}:${dateKey(due)}`;
}

function localStatus(status: string): "pending" | "paid" | "overdue" {
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status)) return "paid";
  if (status === "OVERDUE") return "overdue";
  return "pending";
}

function resolveAmount(input: {
  due: Date;
  billingCycle: string | null;
  valorMensal: string;
  promoPhase1Price: string | null;
  promoPhase1EndsAt: Date | null;
  regularPriceAtTransition: string | null;
}) {
  const promoActive = Boolean(
    input.promoPhase1Price &&
    input.promoPhase1EndsAt &&
    input.due.getTime() < input.promoPhase1EndsAt.getTime(),
  );
  const monthly = Number(promoActive ? input.promoPhase1Price : input.regularPriceAtTransition ?? input.valorMensal);
  if (!(monthly > 0)) throw new Error("Preço de renovação inválido");
  return input.billingCycle === "annual" ? monthly * 12 : monthly;
}

function nextDue(due: Date, billingCycle: string | null) {
  const anchorDay = due.getUTCDate();
  return billingCycle === "annual" ? addCalendarYear(due, anchorDay) : addCalendarMonth(due, anchorDay);
}

async function reflectRemoteStatus(input: {
  subscriptionId: string;
  due: Date;
  billingCycle: string | null;
  localStatus: "pending" | "paid" | "overdue";
  now: Date;
}) {
  if (input.localStatus === "paid") {
    await db.update(subscriptionsTable).set({
      status: "ativa",
      proximaCobranca: nextDue(input.due, input.billingCycle),
      updatedAt: input.now,
    }).where(eq(subscriptionsTable.id, input.subscriptionId));
  } else if (input.localStatus === "overdue") {
    await db.update(subscriptionsTable).set({
      status: "inadimplente",
      updatedAt: input.now,
    }).where(eq(subscriptionsTable.id, input.subscriptionId));
  }
}

/**
 * Gera e reconcilia cobranças recorrentes das assinaturas adquiridas pelo checkout das LPs.
 * O worker legado continua responsável pela campanha de lançamento. Ambos usam a mesma
 * tabela de assinatura, billing_events e a mesma conta plataforma Asaas.
 */
export async function runVendorAiSelfServiceSubscriptionBilling(log: Logger): Promise<void> {
  if (process.env["VENDORAI_SUBSCRIPTION_BILLING_ENABLED"] !== "true") return;
  if (!(await isAsaasConfigured())) return;

  const now = new Date();
  const rows = await db
    .select({
      id: subscriptionsTable.id,
      tenantId: subscriptionsTable.tenantId,
      campaignCode: subscriptionsTable.campaignCode,
      billingProvider: subscriptionsTable.billingProvider,
      proximaCobranca: subscriptionsTable.proximaCobranca,
      valorMensal: subscriptionsTable.valorMensal,
      promoPhase1Price: subscriptionsTable.promoPhase1Price,
      promoPhase1EndsAt: subscriptionsTable.promoPhase1EndsAt,
      regularPriceAtTransition: subscriptionsTable.regularPriceAtTransition,
      asaasCustomerId: subscriptionsTable.asaasCustomerId,
      tenantName: tenantsTable.name,
      billingCycle: tenantsTable.billingCycle,
    })
    .from(subscriptionsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, subscriptionsTable.tenantId))
    .where(and(
      ne(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN),
      eq(subscriptionsTable.billingProvider, "asaas"),
      inArray(subscriptionsTable.status, ["trial", "ativa", "inadimplente"]),
      isNotNull(subscriptionsTable.proximaCobranca),
      lte(subscriptionsTable.proximaCobranca, now),
    ))
    .limit(MAX_PER_RUN);

  let created = 0;
  let recovered = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of rows) {
    if (!sub.proximaCobranca) continue;
    try {
      const due = sub.proximaCobranca;
      const key = cycleKey(sub.id, due);
      const amount = resolveAmount({ ...sub, due });

      let [event] = await db.select().from(billingEventsTable).where(eq(billingEventsTable.mes, key)).limit(1);
      if (event?.status === "paid") {
        await reflectRemoteStatus({ subscriptionId: sub.id, due, billingCycle: sub.billingCycle, localStatus: "paid", now });
        skipped++;
        continue;
      }
      if (event?.status === "cancelled") {
        skipped++;
        continue;
      }

      const remote = await findChargeByExternalReference(key).catch(() => null);
      if (remote) {
        const status = localStatus(remote.status);
        if (!event) {
          [event] = await db.insert(billingEventsTable).values({
            tenantId: sub.tenantId,
            mes: key,
            tipo: sub.billingCycle === "annual" ? "annual" : "monthly",
            valor: amount.toFixed(2),
            status,
            dueDate: due,
            asaasChargeId: remote.id,
            asaasCustomerId: sub.asaasCustomerId,
            ...(status === "paid" ? { paidAt: now } : {}),
          }).returning();
        } else {
          await db.update(billingEventsTable).set({
            status,
            asaasChargeId: remote.id,
            ...(status === "paid" ? { paidAt: now } : {}),
          }).where(eq(billingEventsTable.id, event.id));
        }
        await reflectRemoteStatus({ subscriptionId: sub.id, due, billingCycle: sub.billingCycle, localStatus: status, now });
        recovered++;
        continue;
      }

      if (!event) {
        [event] = await db.insert(billingEventsTable).values({
          tenantId: sub.tenantId,
          mes: key,
          tipo: sub.billingCycle === "annual" ? "annual" : "monthly",
          valor: amount.toFixed(2),
          status: "pending",
          dueDate: due,
        }).onConflictDoNothing().returning();
        if (!event) {
          skipped++;
          continue;
        }
      }
      if (event.asaasChargeId) {
        skipped++;
        continue;
      }

      const [admin] = await db.select({
        email: usersTable.email,
        name: usersTable.name,
        telefone: usersTable.telefone,
      }).from(usersTable).where(and(
        eq(usersTable.tenantId, sub.tenantId),
        eq(usersTable.role, "admin"),
        eq(usersTable.active, true),
      )).limit(1);
      if (!admin?.email) throw new Error("Tenant sem admin com e-mail para cobrança");

      const customerId = sub.asaasCustomerId ?? (await createOrGetCustomer({
        name: sub.tenantName || admin.name,
        email: admin.email,
        phone: admin.telefone ?? undefined,
      })).id;

      const charge = await createCharge({
        customer: customerId,
        billingType: "UNDEFINED",
        value: amount,
        dueDate: dateKey(now),
        description: `VendorAI — renovação ${sub.billingCycle === "annual" ? "anual" : "mensal"}`,
        externalReference: key,
      });
      const status = localStatus(charge.status);

      await db.update(billingEventsTable).set({
        asaasChargeId: charge.id,
        asaasCustomerId: customerId,
        status,
        dueDate: now,
        ...(status === "paid" ? { paidAt: now } : {}),
      }).where(eq(billingEventsTable.id, event.id));
      await db.update(subscriptionsTable).set({ asaasCustomerId: customerId, updatedAt: now }).where(eq(subscriptionsTable.id, sub.id));
      await reflectRemoteStatus({ subscriptionId: sub.id, due, billingCycle: sub.billingCycle, localStatus: status, now });
      created++;
    } catch (err) {
      failed++;
      log.error({ err, subscriptionId: sub.id, tenantId: sub.tenantId }, "vendorai-selfservice-billing: failed");
    }
  }

  if (rows.length > 0) log.info({ due: rows.length, created, recovered, skipped, failed }, "vendorai-selfservice-billing: complete");
}
