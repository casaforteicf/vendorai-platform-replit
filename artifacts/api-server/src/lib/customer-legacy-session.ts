import { createHash } from "node:crypto";

/**
 * Read-only legacy portal session verification, independent of proposal token.
 * This establishes ONLY which existing tenant-scoped portal user owns the token.
 * It never grants global identity membership or another tenant's resources.
 */
export type PortalSessionQuery = {
  query: (sql: string, parameters: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};
export type VerifiedLegacyPortalSession = {
  legacyPortalUserId: string;
  tenantId: string;
};

export async function verifyLegacyPortalSession(
  db: PortalSessionQuery,
  bearer: string | undefined,
): Promise<VerifiedLegacyPortalSession | null> {
  if (typeof bearer !== "string" || !/^Bearer [a-f0-9]{64}$/.test(bearer)) return null;
  const rawToken = bearer.slice(7);
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const result = await db.query(
    `SELECT u.id AS user_id, u.tenant_id
       FROM public.customer_portal_sessions s
       JOIN public.customer_portal_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at > now() AND u.status='ativo'
      LIMIT 1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row || typeof row.user_id !== "string" || typeof row.tenant_id !== "string") return null;
  return { legacyPortalUserId: row.user_id, tenantId: row.tenant_id };
}
