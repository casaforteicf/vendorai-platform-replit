import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  db,
  activitiesTable,
  agentConfigsTable,
  customerIntelligenceTable,
  leadsTable,
  tenantsTable,
  vendiMissionsTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { executeVendiMission } from "./vendi-mission-supervisor.js";

const OPEN_MISSION_STATUSES = ["planning", "running", "paused_approval"] as const;

function observationBucket(now = new Date()) {
  const bucket = new Date(now);
  bucket.setMinutes(Math.floor(bucket.getMinutes() / 30) * 30, 0, 0);
  return bucket.toISOString();
}

async function createAndRunMission(input: {
  tenantId: string;
  sourceRefId: string;
  objective: string;
  priority: number;
  context: Record<string, unknown>;
  log: Logger;
}) {
  const [existing] = await db
    .select({ id: vendiMissionsTable.id, status: vendiMissionsTable.status })
    .from(vendiMissionsTable)
    .where(and(
      eq(vendiMissionsTable.tenantId, input.tenantId),
      eq(vendiMissionsTable.sourceRefId, input.sourceRefId),
      inArray(vendiMissionsTable.status, [...OPEN_MISSION_STATUSES]),
    ))
    .limit(1);

  if (existing) return { created: false, missionId: existing.id, status: existing.status };

  const [mission] = await db.insert(vendiMissionsTable).values({
    tenantId: input.tenantId,
    source: "system",
    sourceRefId: input.sourceRefId,
    objective: input.objective,
    priority: input.priority,
    riskPolicy: "standard",
    context: input.context,
    status: "planning",
  }).returning({ id: vendiMissionsTable.id });

  if (!mission) throw new Error("VENDI_OBSERVER_MISSION_CREATE_FAILED");

  const execution = await executeVendiMission({
    tenantId: input.tenantId,
    missionId: mission.id,
  });

  input.log.info({
    tenantId: input.tenantId,
    missionId: mission.id,
    executionStatus: execution.status,
  }, "vendi/observer: mission executed");

  return { created: true, missionId: mission.id, status: execution.status };
}

export async function runVendiOperationalObserver(log: Logger) {
  const now = new Date();
  const bucket = observationBucket(now);

  const tenants = await db
    .select({
      tenantId: tenantsTable.id,
      slug: tenantsTable.slug,
      autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
    })
    .from(tenantsTable)
    .innerJoin(agentConfigsTable, eq(agentConfigsTable.tenantId, tenantsTable.id))
    .where(and(
      eq(tenantsTable.status, "active"),
      sql`${agentConfigsTable.autonomyEnabledAt} IS NOT NULL`,
    ));

  let observed = 0;
  let missionsCreated = 0;
  let approvalsPending = 0;
  let failed = 0;

  for (const tenant of tenants) {
    observed++;
    try {
      const [overdue] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.tenantId, tenant.tenantId),
          inArray(activitiesTable.status, ["pendente", "planejado"]),
          lt(activitiesTable.dataVencimento, now),
        ));

      const [unassigned] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leadsTable)
        .where(and(
          eq(leadsTable.tenantId, tenant.tenantId),
          isNull(leadsTable.assignedTo),
          isNull(leadsTable.naoLeadTipo),
        ));

      const [highChurn] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customerIntelligenceTable)
        .innerJoin(leadsTable, eq(leadsTable.id, customerIntelligenceTable.leadId))
        .where(and(
          eq(customerIntelligenceTable.tenantId, tenant.tenantId),
          sql`${customerIntelligenceTable.churnRisk} >= 70`,
          isNull(leadsTable.naoLeadTipo),
        ));

      const snapshot = {
        overdueTasks: Number(overdue?.count ?? 0),
        unassignedLeads: Number(unassigned?.count ?? 0),
        highChurnCustomers: Number(highChurn?.count ?? 0),
      };

      const totalAttention = snapshot.overdueTasks + snapshot.unassignedLeads + snapshot.highChurnCustomers;
      if (totalAttention === 0) continue;

      const priority =
        snapshot.unassignedLeads > 0 || snapshot.highChurnCustomers > 0
          ? 80
          : snapshot.overdueTasks >= 10
            ? 70
            : 60;

      const result = await createAndRunMission({
        tenantId: tenant.tenantId,
        sourceRefId: `operational-observer:${bucket}`,
        objective: [
          "Faça a triagem operacional autônoma deste tenant.",
          "Analise as exceções informadas e use somente as ferramentas oficiais do Vendi.",
          "Resolva automaticamente apenas ações de baixo/médio risco permitidas pela política.",
          "Não faça gasto, publicação externa, contato externo de alto risco, exclusão ou mudança crítica sem aprovação.",
          "Quando não houver ferramenta segura para corrigir diretamente, diagnostique, produza evidências e deixe a próxima ação pronta.",
          "Confirme o resultado de cada ação executada antes de considerar a missão concluída.",
        ].join(" "),
        priority,
        context: {
          observer: "vendi_operational_observer",
          bucket,
          snapshot,
          tenantSlug: tenant.slug,
        },
        log,
      });

      if (result.created) missionsCreated++;
      if (result.status === "paused_approval") approvalsPending++;
    } catch (error) {
      failed++;
      log.error({ err: error, tenantId: tenant.tenantId }, "vendi/observer: tenant scan failed");
    }
  }

  const result = { observed, missionsCreated, approvalsPending, failed, bucket };
  log.info(result, "vendi/observer: scan complete");
  return result;
}
