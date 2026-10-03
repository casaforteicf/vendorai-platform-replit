import pino from "pino";
import { and, eq, isNull } from "drizzle-orm";
import { db, customerIntelligenceTable, leadsTable } from "@workspace/db";
import { analyzeLeadIntelligence } from "../lib/analyze-intelligence.js";

const log = pino({ name: "value-first-backfill" });

async function main() {
  const tenantId = process.env.TENANT_ID?.trim();
  const limit = Math.min(500, Math.max(1, Number(process.env.LIMIT ?? 100)));

  const baseQuery = db
    .select({
      tenantId: customerIntelligenceTable.tenantId,
      leadId: customerIntelligenceTable.leadId,
    })
    .from(customerIntelligenceTable)
    .innerJoin(leadsTable, and(
      eq(leadsTable.id, customerIntelligenceTable.leadId),
      eq(leadsTable.tenantId, customerIntelligenceTable.tenantId),
    ));

  const rows = tenantId
    ? await baseQuery.where(and(
        isNull(customerIntelligenceTable.outreachPlan),
        isNull(leadsTable.excluidoEm),
        eq(customerIntelligenceTable.tenantId, tenantId),
      )).limit(limit)
    : await baseQuery.where(and(
        isNull(customerIntelligenceTable.outreachPlan),
        isNull(leadsTable.excluidoEm),
      )).limit(limit);

  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await analyzeLeadIntelligence({
        tenantId: row.tenantId,
        leadId: row.leadId,
        log,
        triggeredBy: "system",
      });
      updated++;
    } catch (error) {
      failed++;
      log.warn({ err: error, ...row }, "value-first-backfill: lead failed");
    }
  }

  log.info({ selected: rows.length, updated, failed, tenantId: tenantId ?? "all" }, "value-first-backfill: complete");
}

main().catch((error) => {
  log.error({ err: error }, "value-first-backfill: fatal");
  process.exitCode = 1;
});
