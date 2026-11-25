import bcrypt from "bcryptjs";
import { generateGlobalCustomerSession } from "./customer-global-session.js";

export type GlobalAuthDb = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string,unknown>[]; rowCount: number | null }>;
};

/** Privileged service only: NOT exposed through HTTP or legacy login.
 * Identity creation and email verification are separate, pending workflows.
 */
export async function authenticateGlobalCustomer(db: GlobalAuthDb, email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
      normalized.length > 320 || !password || password.length > 200) return null;
  const result = await db.query(
    `SELECT i.id::text AS identity_id,c.password_hash
       FROM public.customer_global_identities i
       JOIN public.customer_global_credentials c ON c.global_identity_id=i.id
      WHERE i.email_normalized=$1 AND i.status='active'
        AND i.email_verified_at IS NOT NULL AND c.disabled_at IS NULL LIMIT 1`,
    [normalized]);
  const account = result.rows[0];
  // bcrypt still runs for an unknown account to reduce timing enumeration.
  const dummyHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7F3QvJLyfLSAFRC1TFYOGMBZ1jlqVnS";
  const matched = await bcrypt.compare(password, typeof account?.password_hash === "string" ? account.password_hash : dummyHash);
  if (!matched || typeof account?.identity_id !== "string") return null;
  const token = generateGlobalCustomerSession();
  await db.query(
    `INSERT INTO public.customer_global_sessions (global_identity_id,token_hash,expires_at)
     VALUES ($1::uuid,$2,now()+interval '12 hours')`,
    [account.identity_id, token.tokenHash]);
  return { globalIdentityId: account.identity_id, sessionToken: token.token };
}

/** Must ONLY be called following independently verified email ownership and
 * explicit consent. Does not link legacy accounts or alter their credentials.
 */
export async function setInitialGlobalPassword(db: GlobalAuthDb, identityId: string, password: string) {
  if (!/^[0-9a-f-]{36}$/i.test(identityId) || password.length < 12 || password.length > 200) return false;
  const hash = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO public.customer_global_credentials(global_identity_id,password_hash)
     SELECT id,$2 FROM public.customer_global_identities
      WHERE id=$1::uuid AND status='active' AND email_verified_at IS NOT NULL
     ON CONFLICT(global_identity_id) DO NOTHING RETURNING global_identity_id`,
    [identityId,hash]);
  return result.rowCount===1;
}
