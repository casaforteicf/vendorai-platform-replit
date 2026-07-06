import { and, eq, or, asc, isNull } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/**
 * Picks the next active vendedor for a tenant using round-robin rotation.
 * Sellers with lastAssignedAt = null (never assigned) get priority.
 * Among those with a date, the one with the oldest date goes first.
 * Updates lastAssignedAt on the selected seller.
 * Returns the seller's userId, or null if no active sellers exist.
 */
export async function pickNextVendedor(tenantId: string): Promise<string | null> {
  const sellers = await db
    .select({ id: usersTable.id, lastAssignedAt: usersTable.lastAssignedAt })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.tenantId, tenantId),
        eq(usersTable.active, true),
        or(
          eq(usersTable.platformRole, "tenant_seller"),
          eq(usersTable.userFunction, "vendedor")
        )
      )
    )
    .orderBy(asc(usersTable.lastAssignedAt))
    .limit(1);

  if (!sellers.length || !sellers[0]) return null;

  const seller = sellers[0];

  await db
    .update(usersTable)
    .set({ lastAssignedAt: new Date() })
    .where(eq(usersTable.id, seller.id));

  return seller.id;
}
