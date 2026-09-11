import cron from "node-cron";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db, webBehaviorEventsTable } from "@workspace/db";
import type { Logger } from "pino";
import { syncBehaviorIntentForLead } from "./behaviorIntentSync.js";

type Metadata = Record<string, unknown>;

type VisitorBinding = {
  tenantId: string;
  visitorId: string;
  leadIds: Set<string>;
};

function visitorIdFromMetadata(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const visitorId = (value as Metadata)["visitorId"];
  return typeof visitorId === "string" && visitorId.trim() ? visitorId.trim() : null;
}

/**
 * Une sessões do mesmo visitorId first-party depois que uma delas foi
 * legitimamente identificada por formulário/login/contato.
 *
 * Segurança: se o mesmo visitorId aparecer ligado a mais de um lead (ex.:
 * computador compartilhado), não fazemos stitching automático.
 */
export async function runVisitorIdentityStitching(log: Logger): Promise<void> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      tenantId: webBehaviorEventsTable.tenantId,
      leadId: webBehaviorEventsTable.leadId,
      metadata: webBehaviorEventsTable.metadata,
      createdAt: webBehaviorEventsTable.createdAt,
    })
    .from(webBehaviorEventsTable)
    .where(and(
      gte(webBehaviorEventsTable.createdAt, since),
      isNotNull(webBehaviorEventsTable.tenantId),
    ))
    .orderBy(desc(webBehaviorEventsTable.createdAt))
    .limit(30_000);

  const bindings = new Map<string, VisitorBinding>();
  for (const row of rows) {
    if (!row.tenantId) continue;
    const visitorId = visitorIdFromMetadata(row.metadata);
    if (!visitorId) continue;
    const key = `${row.tenantId}:${visitorId}`;
    const binding = bindings.get(key) ?? {
      tenantId: row.tenantId,
      visitorId,
      leadIds: new Set<string>(),
    };
    if (row.leadId) binding.leadIds.add(row.leadId);
    bindings.set(key, binding);
  }

  let linkedVisitors = 0;
  let updatedEvents = 0;
  let ambiguousVisitors = 0;

  for (const binding of bindings.values()) {
    if (binding.leadIds.size === 0) continue;
    if (binding.leadIds.size > 1) {
      ambiguousVisitors++;
      continue;
    }

    const leadId = Array.from(binding.leadIds)[0]!;
    const updated = await db
      .update(webBehaviorEventsTable)
      .set({ leadId })
      .where(and(
        eq(webBehaviorEventsTable.tenantId, binding.tenantId),
        isNull(webBehaviorEventsTable.leadId),
        gte(webBehaviorEventsTable.createdAt, since),
        sql`${webBehaviorEventsTable.metadata}->>'visitorId' = ${binding.visitorId}`,
      ))
      .returning({ id: webBehaviorEventsTable.id });

    if (!updated.length) continue;
    linkedVisitors++;
    updatedEvents += updated.length;

    void syncBehaviorIntentForLead(leadId, binding.tenantId).catch((error) => {
      log.warn({ error, leadId, tenantId: binding.tenantId }, "visitor-stitching: behavior sync failed");
    });
  }

  if (linkedVisitors || ambiguousVisitors) {
    log.info({ linkedVisitors, updatedEvents, ambiguousVisitors }, "visitor-stitching: cycle complete");
  }
}

export function startVisitorIdentityStitchingScheduler(log: Logger): void {
  // Primeira passada logo após o worker subir e depois a cada 5 minutos.
  setTimeout(() => void runVisitorIdentityStitching(log), 20_000);
  cron.schedule("*/5 * * * *", () => {
    void runVisitorIdentityStitching(log);
  });
}
