import { and, eq } from "drizzle-orm";
import { restoreRequestFingerprint } from "./arqdor-recovery-fingerprint.js";
import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { db, archConceptProjectsTable } from "@workspace/db";

/** Requires the staged MULTI-04.2 migration. Not wired to any HTTP route. */
const restoreAudit = pgTable("arch_concept_restore_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  conceptId: text("concept_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  operationId: text("operation_id").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  baseUpdatedAt: timestamp("base_updated_at").notNull(),
  restoredUpdatedAt: timestamp("restored_updated_at").notNull(),
  previousSnapshot: jsonb("previous_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RestoreTransactionResult =
  | { status: "restored"; updatedAt: Date }
  | { status: "already_applied"; updatedAt: Date }
  | { status: "conflict" }
  | { status: "idempotency_mismatch" }
  | { status: "not_found" }
  | { status: "frozen" };

export async function restoreConceptWithAudit(input: {
  tenantId: string; conceptId: string; actorUserId: string;
  operationId: string; expectedUpdatedAt: Date;
  rooms: typeof archConceptProjectsTable.$inferInsert.rooms;
  openingOverrides: typeof archConceptProjectsTable.$inferInsert.openingOverrides;
}): Promise<RestoreTransactionResult> {
  if (!input.tenantId || !input.conceptId || !input.actorUserId ||
      !input.operationId || !Number.isFinite(input.expectedUpdatedAt.getTime())) {
    return { status: "conflict" };
  }
  const requestFingerprint = restoreRequestFingerprint({
    actorUserId: input.actorUserId,
    expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
    rooms: input.rooms,
    openingOverrides: input.openingOverrides,
  });
  return db.transaction(async tx => {
    const [project] = await tx.select().from(archConceptProjectsTable)
      .where(and(
        eq(archConceptProjectsTable.id, input.conceptId),
        eq(archConceptProjectsTable.tenantId, input.tenantId),
        eq(archConceptProjectsTable.ownerUserId, input.actorUserId),
      )).for("update").limit(1);
    if (!project) return { status: "not_found" } as const;

    const [previous] = await tx.select({ restoredUpdatedAt: restoreAudit.restoredUpdatedAt,
      requestFingerprint: restoreAudit.requestFingerprint })
      .from(restoreAudit).where(and(
        eq(restoreAudit.tenantId, input.tenantId),
        eq(restoreAudit.conceptId, input.conceptId),
        eq(restoreAudit.operationId, input.operationId),
      )).limit(1);
    if (previous) return previous.requestFingerprint === requestFingerprint
      ? { status: "already_applied", updatedAt: previous.restoredUpdatedAt } as const
      : { status: "idempotency_mismatch" } as const;
    if (project.status !== "draft") return { status: "frozen" } as const;
    if (project.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return { status: "conflict" } as const;
    }
    // Preserve the complete pre-restore row inside the same DB transaction.
    // A failure in audit insert or update rolls back both mutations.
    const nextRevision = new Date(Math.max(Date.now(), project.updatedAt.getTime() + 1));
    await tx.insert(restoreAudit).values({
      tenantId: input.tenantId, conceptId: input.conceptId,
      actorUserId: input.actorUserId, operationId: input.operationId,
      requestFingerprint,
      baseUpdatedAt: project.updatedAt, restoredUpdatedAt: nextRevision,
      previousSnapshot: project,
    });
    const [updated] = await tx.update(archConceptProjectsTable)
      .set({ rooms: input.rooms, openingOverrides: input.openingOverrides, updatedAt: nextRevision })
      .where(and(
        eq(archConceptProjectsTable.id, input.conceptId),
        eq(archConceptProjectsTable.tenantId, input.tenantId),
        eq(archConceptProjectsTable.ownerUserId, input.actorUserId),
        eq(archConceptProjectsTable.status, "draft"),
        eq(archConceptProjectsTable.updatedAt, input.expectedUpdatedAt),
      )).returning({ updatedAt: archConceptProjectsTable.updatedAt });
    if (!updated) throw new Error("ARQDOR_RESTORE_TRANSACTION_CONFLICT");
    return { status: "restored", updatedAt: updated.updatedAt } as const;
  });
}
