/**
 * Monthly billing engine — called by the day-5 cron job.
 *
 * Logic:
 *  - For every active tenant with mensalidadeValor set, compute the charge for
 *    the previous calendar month.
 *  - First billing (mes = month right after tenant activation): charge 50% (meio mês fixo).
 *  - Subsequent billings: charge 100% of mensalidadeValor.
 *  - Split: if tenant has a partner with asaasWalletId, apply 50/50 split.
 *  - Idempotent: skip if a billing_event for this tenantId+mes already exists.
 */
import type { Logger } from "pino";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  tenantsTable,
  partnersTable,
  billingEventsTable,
} from "@workspace/db";
import {
  isAsaasConfigured,
  createOrGetCustomer,
  createCharge,
} from "./asaas.js";

function prevMonthKey(ref: Date): string {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isFirstBilling(tenantCreatedAt: Date, mes: string): boolean {
  const [year, month] = mes.split("-").map(Number) as [number, number];
  const activationMes = `${tenantCreatedAt.getFullYear()}-${String(tenantCreatedAt.getMonth() + 1).padStart(2, "0")}`;
  const [aYear, aMonth] = activationMes.split("-").map(Number) as [number, number];
  return year === aYear && month === aMonth + 1;
}

export async function runMonthlyBilling(log: Logger): Promise<void> {
  log.info("billing/monthly: starting");

  if (!(await isAsaasConfigured())) {
    log.warn("billing/monthly: ASAAS_API_KEY not configured — skipping");
    return;
  }

  const now = new Date();
  const mes = prevMonthKey(now);

  const tenants = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      mensalidadeValor: tenantsTable.mensalidadeValor,
      partnerId: tenantsTable.partnerId,
      createdAt: tenantsTable.createdAt,
    })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.status, "active"),
        isNotNull(tenantsTable.mensalidadeValor),
      ),
    );

  log.info({ count: tenants.length, mes }, "billing/monthly: tenants to bill");

  for (const tenant of tenants) {
    try {
      const valorBase = Number(tenant.mensalidadeValor);
      if (!valorBase || valorBase <= 0) continue;

      const existing = await db
        .select({ id: billingEventsTable.id })
        .from(billingEventsTable)
        .where(
          and(
            eq(billingEventsTable.tenantId, tenant.id),
            eq(billingEventsTable.mes, mes),
            eq(billingEventsTable.tipo, "monthly"),
          ),
        )
        .then((rows) => rows[0]);

      if (existing) {
        log.debug({ tenantId: tenant.id, mes }, "billing/monthly: already billed — skip");
        continue;
      }

      const firstBilling = isFirstBilling(tenant.createdAt, mes);
      const valor = firstBilling ? valorBase * 0.5 : valorBase;

      let partnerWalletId: string | null = null;
      if (tenant.partnerId) {
        const [partner] = await db
          .select({ asaasWalletId: partnersTable.asaasWalletId })
          .from(partnersTable)
          .where(eq(partnersTable.id, tenant.partnerId));
        partnerWalletId = partner?.asaasWalletId ?? null;
      }

      const customer = await createOrGetCustomer({ name: tenant.name });

      const dueDate = new Date(now.getFullYear(), now.getMonth(), 5);
      const dueDateStr = dueDate.toISOString().split("T")[0]!;

      const charge = await createCharge({
        customer: customer.id,
        billingType: "PIX",
        value: valor,
        dueDate: dueDateStr,
        description: `Mensalidade ${mes}${firstBilling ? " (meio mês)" : ""}`,
        externalReference: `monthly:${tenant.id}:${mes}`,
        split: partnerWalletId
          ? [{ walletId: partnerWalletId, percentualValue: 50 }]
          : undefined,
      });

      await db.insert(billingEventsTable).values({
        tenantId: tenant.id,
        mes,
        tipo: "monthly",
        valor: String(valor),
        asaasChargeId: charge.id,
        asaasCustomerId: customer.id,
        status: "pending",
        dueDate,
      });

      log.info(
        { tenantId: tenant.id, mes, valor, firstBilling, chargeId: charge.id, split: !!partnerWalletId },
        "billing/monthly: charge created",
      );
    } catch (err) {
      log.error({ err, tenantId: tenant.id, mes }, "billing/monthly: tenant failed (non-fatal)");
    }
  }

  log.info({ mes }, "billing/monthly: cycle complete");
}
