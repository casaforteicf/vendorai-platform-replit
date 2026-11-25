import { createHash, randomBytes } from "node:crypto";
import type { PortalSessionQuery } from "./customer-legacy-session.js";

/** Global portal identity session. Not an access grant to any tenant. */
export function generateGlobalCustomerSession() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

export async function validateGlobalCustomerSession(
  db: PortalSessionQuery,
  bearer: string | undefined,
): Promise<{ globalIdentityId: string } | null> {
  if (!bearer || !/^Bearer [0-9a-f]{64}$/.test(bearer)) return null;
  const tokenHash = createHash("sha256").update(bearer.slice(7)).digest("hex");
  const result = await db.query(
    `SELECT i.id::text AS identity_id
       FROM public.customer_global_sessions s
       JOIN public.customer_global_identities i ON i.id=s.global_identity_id
      WHERE s.token_hash=$1 AND s.expires_at > now()
        AND s.revoked_at IS NULL AND i.status='active'
        AND i.email_verified_at IS NOT NULL
      LIMIT 1`,
    [tokenHash],
  );
  const identityId = result.rows[0]?.identity_id;
  return typeof identityId === "string" ? { globalIdentityId: identityId } : null;
}

/** Both independent tokens must be supplied; never infer identity from matching email. */
export async function resolveDualCustomerSessions(
  db: PortalSessionQuery,
  globalBearer: string | undefined,
  legacyBearer: string | undefined,
  verifyLegacy: (db: PortalSessionQuery, bearer: string | undefined) => Promise<{legacyPortalUserId:string;tenantId:string}|null>,
) {
  if (!globalBearer || !legacyBearer || globalBearer === legacyBearer) return null;
  const [global, legacy] = await Promise.all([
    validateGlobalCustomerSession(db, globalBearer),
    verifyLegacy(db, legacyBearer),
  ]);
  if (!global || !legacy) return null;
  return { ...global, ...legacy, globalSessionVerified: true as const, legacySessionVerified: true as const };
}
