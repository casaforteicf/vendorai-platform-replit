import { and, eq } from "drizzle-orm";
import { db, apiUsageTable, tenantsTable, plansTable, notificationsTable } from "@workspace/db";
import type { Logger } from "pino";

const DEFAULT_LIMIT = 1000;

export async function checkApiQuota(
  tenantId: string,
  apiName: "google_places",
  log?: Logger,
): Promise<void> {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  // ── Buscar ou criar registro de uso do mês ──────────────────────────────────
  const [existing] = await db
    .select()
    .from(apiUsageTable)
    .where(
      and(
        eq(apiUsageTable.tenantId, tenantId),
        eq(apiUsageTable.apiName, apiName),
        eq(apiUsageTable.month, month),
        eq(apiUsageTable.year, year),
      ),
    )
    .limit(1);

  let usage = existing;

  if (!usage) {
    // Busca limite do plano do tenant
    const [tenant] = await db
      .select({ planId: tenantsTable.planId })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1);

    let limit = DEFAULT_LIMIT;
    if (tenant?.planId) {
      const [plan] = await db
        .select({ placesApiLimit: plansTable.placesApiLimit })
        .from(plansTable)
        .where(eq(plansTable.id, tenant.planId))
        .limit(1);
      if (plan?.placesApiLimit) limit = plan.placesApiLimit;
    }

    const [inserted] = await db
      .insert(apiUsageTable)
      .values({ tenantId, apiName, month, year, requestsUsed: 0, requestsLimit: limit })
      .onConflictDoNothing()
      .returning();

    // Se houve conflito (race condition), buscar o existente
    if (!inserted) {
      const [found] = await db
        .select()
        .from(apiUsageTable)
        .where(
          and(
            eq(apiUsageTable.tenantId, tenantId),
            eq(apiUsageTable.apiName, apiName),
            eq(apiUsageTable.month, month),
            eq(apiUsageTable.year, year),
          ),
        )
        .limit(1);
      if (found) usage = found;
    } else {
      usage = inserted;
    }
  }

  if (!usage) {
    log?.warn({ tenantId, apiName }, "api-quota: could not resolve usage row, allowing");
    return;
  }

  // ── Verificar limite ────────────────────────────────────────────────────────
  if (usage.requestsUsed >= usage.requestsLimit) {
    const resetsAt = new Date(year, month, 1).toLocaleDateString("pt-BR");
    throw Object.assign(
      new Error(
        `Limite mensal de prospecção atingido (${usage.requestsLimit} buscas). Renova em ${resetsAt}.`,
      ),
      { status: 429 },
    );
  }

  // ── Incrementar contador ────────────────────────────────────────────────────
  const newUsed = usage.requestsUsed + 1;
  await db
    .update(apiUsageTable)
    .set({ requestsUsed: newUsed, updatedAt: new Date() })
    .where(eq(apiUsageTable.id, usage.id));

  // ── Alerta de 80% ──────────────────────────────────────────────────────────
  const threshold80 = Math.floor(usage.requestsLimit * 0.8);
  if (newUsed === threshold80) {
    const resetsAt = new Date(year, month, 1).toLocaleDateString("pt-BR");
    await db
      .insert(notificationsTable)
      .values({
        tenantId,
        title: "Limite de prospecção quase atingido",
        message: `Você usou ${newUsed} de ${usage.requestsLimit} buscas mensais (80%). Considere fazer upgrade do plano para aumentar sua cota. Renova em ${resetsAt}.`,
        type: "warning",
        category: "billing",
      })
      .onConflictDoNothing();
    log?.info({ tenantId, newUsed, limit: usage.requestsLimit }, "api-quota: 80% threshold reached, notification created");
  }
}

/** Leitura pública do uso — sem side effects. */
export async function getApiUsage(
  tenantId: string,
  apiName: "google_places",
): Promise<{ used: number; limit: number; resetsAt: string }> {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  const [row] = await db
    .select()
    .from(apiUsageTable)
    .where(
      and(
        eq(apiUsageTable.tenantId, tenantId),
        eq(apiUsageTable.apiName, apiName),
        eq(apiUsageTable.month, month),
        eq(apiUsageTable.year, year),
      ),
    )
    .limit(1);

  const resetsAt = new Date(year, month, 1).toLocaleDateString("pt-BR");
  return {
    used:     row?.requestsUsed  ?? 0,
    limit:    row?.requestsLimit ?? DEFAULT_LIMIT,
    resetsAt,
  };
}
