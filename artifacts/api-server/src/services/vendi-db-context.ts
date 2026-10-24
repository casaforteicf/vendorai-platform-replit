import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type VendiTenantTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs tenant-scoped Vendi queries in one transaction and sets the exact GUC
 * consumed by app_security.current_tenant_id(). Transaction-local scope keeps
 * tenant context from leaking across pooled connections.
 */
export async function withVendiTenantContext<T>(
  tenantId: string,
  operation: (tx: VendiTenantTransaction) => Promise<T>,
): Promise<T> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) throw new Error("VENDI_TENANT_REQUIRED");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT app_security.set_tenant_context(${normalizedTenantId}, false)`);
    return operation(tx);
  });
}
