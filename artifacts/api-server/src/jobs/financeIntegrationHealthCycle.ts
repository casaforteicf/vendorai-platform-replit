import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { db, tenantsTable } from "@workspace/db";
import { runAllFinanceIntegrationHealthChecks } from "../services/finance-integration-health.js";

export type FinanceIntegrationHealthCycleSummary = {
  tenantsChecked: number;
  integrationsChecked: number;
  healthyIntegrations: number;
  warningIntegrations: number;
  errorIntegrations: number;
};

let running = false;

export async function runFinanceIntegrationHealthCycle(log: Logger): Promise<FinanceIntegrationHealthCycleSummary> {
  if (running) {
    log.warn("finance-integration-health-cycle: previous cycle still running; skipping overlap");
    return { tenantsChecked: 0, integrationsChecked: 0, healthyIntegrations: 0, warningIntegrations: 0, errorIntegrations: 0 };
  }

  running = true;
  const summary: FinanceIntegrationHealthCycleSummary = {
    tenantsChecked: 0,
    integrationsChecked: 0,
    healthyIntegrations: 0,
    warningIntegrations: 0,
    errorIntegrations: 0,
  };

  try {
    const tenants = await db
      .select({ id: tenantsTable.id, slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(eq(tenantsTable.status, "active"));

    for (const tenant of tenants) {
      try {
        const results = await runAllFinanceIntegrationHealthChecks(tenant.id);
        summary.tenantsChecked += 1;
        summary.integrationsChecked += results.length;
        summary.healthyIntegrations += results.filter((item) => item.status === "connected").length;
        summary.warningIntegrations += results.filter((item) => item.status === "partial").length;
        summary.errorIntegrations += results.filter((item) => item.status === "error" || item.status === "expired").length;

        log.debug(
          {
            tenantId: tenant.id,
            slug: tenant.slug,
            checked: results.length,
            healthy: results.filter((item) => item.status === "connected").length,
            errors: results.filter((item) => item.status === "error" || item.status === "expired").length,
          },
          "finance-integration-health-cycle: tenant checked",
        );
      } catch (err) {
        log.error({ err, tenantId: tenant.id, slug: tenant.slug }, "finance-integration-health-cycle: tenant failed");
      }
    }

    log.info(summary, "finance-integration-health-cycle: complete");
    return summary;
  } finally {
    running = false;
  }
}
