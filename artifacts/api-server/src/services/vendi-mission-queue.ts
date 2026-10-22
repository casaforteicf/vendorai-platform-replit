import { and, asc, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  vendiMissionsTable,
} from "@workspace/db";
import { executeVendiMission } from "./vendi-mission-supervisor.js";
import { withVendiTenantContext } from "./vendi-db-context.js";
import { getPostgresDiagnostic } from "../routes/vendi-db-errors.js";

const POLL_MS = 5_000;
let timer: ReturnType<typeof setInterval> | null = null;
let cycleRunning = false;
let nextTenantOffset = 0;

async function claimNextQueuedMission() {
  const tenants = await db.select({ id: tenantsTable.id }).from(tenantsTable);
  if (!tenants.length) return null;

  for (let offset = 0; offset < tenants.length; offset++) {
    const index = (nextTenantOffset + offset) % tenants.length;
    const tenantId = tenants[index]!.id;
    const claimed = await withVendiTenantContext(tenantId, async (tx) => {
      const [candidate] = await tx
        .select({ id: vendiMissionsTable.id })
        .from(vendiMissionsTable)
        .where(and(
          eq(vendiMissionsTable.tenantId, tenantId),
          eq(vendiMissionsTable.status, "queued"),
        ))
        .orderBy(desc(vendiMissionsTable.priority), asc(vendiMissionsTable.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return null;

      const [mission] = await tx.update(vendiMissionsTable)
        .set({
          status: "running",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(vendiMissionsTable.id, candidate.id),
          eq(vendiMissionsTable.tenantId, tenantId),
          eq(vendiMissionsTable.status, "queued"),
        ))
        .returning({ id: vendiMissionsTable.id, tenantId: vendiMissionsTable.tenantId });
      return mission ?? null;
    });

    if (claimed) {
      nextTenantOffset = (index + 1) % tenants.length;
      return claimed;
    }
  }
  nextTenantOffset = (nextTenantOffset + 1) % tenants.length;
  return null;
}

async function runQueueCycle(log: Logger) {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    const mission = await claimNextQueuedMission();
    if (!mission) return;
    try {
      const result = await executeVendiMission({ tenantId: mission.tenantId, missionId: mission.id, claimed: true });
      log.info({ missionId: mission.id, status: result.status }, "vendi/mission-queue: mission processed");
    } catch (error) {
      const diagnostic = getPostgresDiagnostic(error);
      const message = diagnostic.code ? `POSTGRES_${diagnostic.code}` : "VENDI_MISSION_FAILED";
      await withVendiTenantContext(mission.tenantId, (tx) => tx.update(vendiMissionsTable)
        .set({ status: "failed", lastError: message, updatedAt: new Date() })
        .where(and(
          eq(vendiMissionsTable.id, mission.id),
          eq(vendiMissionsTable.tenantId, mission.tenantId),
        )));
      log.error({ missionId: mission.id, code: diagnostic.code ?? "UNKNOWN" }, "vendi/mission-queue: mission failed");
    }
  } catch (error) {
    log.error({ code: getPostgresDiagnostic(error).code ?? "UNKNOWN" }, "vendi/mission-queue: cycle failed");
  } finally {
    cycleRunning = false;
  }
}

export function startVendiMissionQueueWorker(log: Logger) {
  if (timer) return;
  if (String(process.env["VENDORAI_DISABLE_BACKGROUND_JOBS"] ?? "").toLowerCase() === "1") {
    log.info("vendi/mission-queue: disabled by VENDORAI_DISABLE_BACKGROUND_JOBS");
    return;
  }
  if (String(process.env["VENDI_MISSION_QUEUE_ENABLED"] ?? "true").toLowerCase() === "false") {
    log.info("vendi/mission-queue: disabled by VENDI_MISSION_QUEUE_ENABLED");
    return;
  }
  void runQueueCycle(log);
  timer = setInterval(() => { void runQueueCycle(log); }, POLL_MS);
  timer.unref();
  log.info({ pollMs: POLL_MS }, "vendi/mission-queue: worker started");
}
