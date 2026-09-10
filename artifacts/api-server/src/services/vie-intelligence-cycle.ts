import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { collectActiveRssSources } from "./vie-rss-collector.js";
import { classifyRecentVieNewsForTenant } from "./vie-news-relevance.js";
import { ensureLocalNewsSourcesForActiveTenants } from "./vie-local-news.js";

const VIE_CYCLE_INTERVAL_MS = 6 * 60 * 60 * 1000;

let cycleTimer: NodeJS.Timeout | null = null;
let cycleRunning = false;

export type VieIntelligenceCycleResult = {
  sources: number;
  fetched: number;
  upsertedItems: number;
  sourceErrors: number;
  tenants: number;
  evaluated: number;
  relevant: number;
  upsertedCases: number;
  tenantErrors: number;
  localities: number;
};

export async function runVieIntelligenceCycle(log: Logger): Promise<VieIntelligenceCycleResult> {
  if (cycleRunning) {
    log.info("vie-cycle: execução anterior ainda ativa; rodada ignorada");
    return {
      sources: 0,
      fetched: 0,
      upsertedItems: 0,
      sourceErrors: 0,
      tenants: 0,
      evaluated: 0,
      relevant: 0,
      upsertedCases: 0,
      tenantErrors: 0,
      localities: 0,
    };
  }

  cycleRunning = true;
  const summary: VieIntelligenceCycleResult = {
    sources: 0,
    fetched: 0,
    upsertedItems: 0,
    sourceErrors: 0,
    tenants: 0,
    evaluated: 0,
    relevant: 0,
    upsertedCases: 0,
    tenantErrors: 0,
    localities: 0,
  };

  try {
    log.info("vie-cycle: iniciando coleta e classificação");

    try {
      const local = await ensureLocalNewsSourcesForActiveTenants();
      summary.localities = local.localities;
      log.info(local, "vie-cycle: fontes locais sincronizadas");
    } catch (error) {
      log.warn({ error }, "vie-cycle: não foi possível sincronizar fontes locais");
    }

    const sourceResults = await collectActiveRssSources();
    summary.sources = sourceResults.length;
    summary.fetched = sourceResults.reduce((total, item) => total + item.fetched, 0);
    summary.upsertedItems = sourceResults.reduce((total, item) => total + item.upserted, 0);
    summary.sourceErrors = sourceResults.filter((item) => Boolean(item.error)).length;

    const tenants = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.status, "active"));

    summary.tenants = tenants.length;

    for (const tenant of tenants) {
      try {
        const result = await classifyRecentVieNewsForTenant(tenant.id, 72);
        summary.evaluated += result.evaluated;
        summary.relevant += result.relevant;
        summary.upsertedCases += result.upserted;
      } catch (error) {
        summary.tenantErrors += 1;
        log.warn({ error, tenantId: tenant.id }, "vie-cycle: classificação do tenant falhou");
      }
    }

    log.info(summary, "vie-cycle: rodada concluída");
    return summary;
  } catch (error) {
    log.error({ error }, "vie-cycle: falha não tratada na rodada");
    throw error;
  } finally {
    cycleRunning = false;
  }
}

export function startVieIntelligenceCycle(log: Logger): void {
  if (cycleTimer || process.env["NODE_ENV"] === "test") return;

  void runVieIntelligenceCycle(log).catch((error) => {
    log.error({ error }, "vie-cycle: falha na execução inicial");
  });

  cycleTimer = setInterval(() => {
    void runVieIntelligenceCycle(log).catch((error) => {
      log.error({ error }, "vie-cycle: falha na execução periódica");
    });
  }, VIE_CYCLE_INTERVAL_MS);
  cycleTimer.unref?.();

  log.info({ intervalMs: VIE_CYCLE_INTERVAL_MS }, "vie-cycle: ciclo automático iniciado");
}
