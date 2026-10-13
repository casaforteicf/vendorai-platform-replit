import { and, eq } from "drizzle-orm";
import { db, archConceptProjectsTable } from "@workspace/db";

/**
 * MULTI-04 — isolated compare-and-swap for Arqdor concept recovery.
 * This is a narrow core primitive; it does not accept raw backup JSON,
 * authenticate callers, or modify server-owned configuration.
 * HTTP route must perform authentication, validation, idempotency and durable
 * snapshot/audit logging BEFORE using this for any customer-facing restore.
 */
export async function compareAndSwapConceptRecovery(input: {
  projectId: string;
  tenantId: string;
  ownerUserId: string;
  expectedUpdatedAt: Date;
  rooms: typeof archConceptProjectsTable.$inferInsert.rooms;
  openingOverrides: typeof archConceptProjectsTable.$inferInsert.openingOverrides;
}): Promise<{ status: "updated"; revision: Date } | { status: "conflict" }> {
  if (!input.projectId || !input.tenantId || !input.ownerUserId ||
      !Number.isFinite(input.expectedUpdatedAt.getTime())) {
    return { status: "conflict" };
  }
  const [updated] = await db.update(archConceptProjectsTable)
    .set({ rooms: input.rooms, openingOverrides: input.openingOverrides,
      updatedAt: new Date(Math.max(Date.now(), input.expectedUpdatedAt.getTime() + 1)) })
    .where(and(
      eq(archConceptProjectsTable.id, input.projectId),
      eq(archConceptProjectsTable.tenantId, input.tenantId),
      eq(archConceptProjectsTable.ownerUserId, input.ownerUserId),
      eq(archConceptProjectsTable.status, "draft"),
      eq(archConceptProjectsTable.updatedAt, input.expectedUpdatedAt),
    ))
    .returning({ updatedAt: archConceptProjectsTable.updatedAt });
  return updated ? { status: "updated", revision: updated.updatedAt } : { status: "conflict" };
}
