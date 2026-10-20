import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

type VendiTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Runs tenant-scoped Vendi queries with transaction-local RLS context. */
export async function withVendiTenantContext<T>(
  tenantId: string,
  operation: (tx: VendiTransaction) => PromiseLike<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT app_security.set_tenant_context(${tenantId}, false)`);
    return await operation(tx);
  });
}
