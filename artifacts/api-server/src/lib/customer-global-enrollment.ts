import { randomUUID } from "node:crypto";
import { createEmailVerificationToken, consumeGlobalEmailVerification } from "./customer-global-email-verification.js";
import { sendGlobalCustomerVerificationEmail } from "./customer-global-email-delivery.js";
import type { GlobalAuthDb } from "./customer-global-auth.js";

type Tx = GlobalAuthDb & { release(): void };
type Database = { connect(): Promise<Tx> };
export type EnrollmentResult = "accepted" | "delivery_failed";

/**
 * Dormant application service, not registered in HTTP.
 * Requires separate per-IP/account rate limiting at the HTTP gateway.
 * DB transaction serializes requests by normalized email and provides a
 * 15-minute resend cooldown. Existing active accounts aren't re-enrolled.
 */
export async function requestGlobalCustomerEnrollment(input: {
  email: string;
  displayName: string;
  db: Database;
  deliver: (to: string, token: string) => Promise<boolean>;
}): Promise<EnrollmentResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 ||
      !input.displayName.trim() || input.displayName.length > 160) {
    return "accepted"; // never reveal account existence
  }
  const client = await input.db.connect();
  let token: string | null = null;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [email]);
    const existing = await client.query(
      `SELECT id::text AS id, status FROM public.customer_global_identities
       WHERE email_normalized=$1 FOR UPDATE`, [email]);
    const account = existing.rows[0];
    if (account && account.status !== "pending") {
      await client.query("COMMIT");
      return "accepted";
    }
    const identityId = typeof account?.id === "string" ? account.id : randomUUID();
    if (!account) {
      await client.query(
        `INSERT INTO public.customer_global_identities(id,email_normalized,display_name,status)
         VALUES ($1::uuid,$2,$3,'pending')`,
        [identityId,email,input.displayName.trim()]);
    }
    const recent = await client.query(
      `SELECT id FROM public.customer_global_email_verifications
       WHERE global_identity_id=$1::uuid AND created_at>now()-interval '15 minutes'
       LIMIT 1`, [identityId]);
    if (recent.rows.length) {
      await client.query("COMMIT");
      return "accepted";
    }
    const challenge = createEmailVerificationToken();
    await client.query(
      `INSERT INTO public.customer_global_email_verifications(global_identity_id,token_hash,expires_at)
       VALUES($1::uuid,$2,now()+interval '15 minutes')`,
      [identityId,challenge.hash]);
    token = challenge.token;
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve root error */ }
    throw error;
  } finally {
    client.release();
  }
  if (!token) return "accepted";
  const sent = await input.deliver(email,token);
  return sent ? "accepted" : "delivery_failed";
}

/** Call only with an already provisioned restricted database role. */
export async function confirmGlobalCustomerEnrollment(db: GlobalAuthDb, token: string) {
  return consumeGlobalEmailVerification(db,token);
}

/** Adaptor to the Vendor.ai mail provider; do not log or expose the code. */
export function productionGlobalCustomerEmailDelivery(to: string, token: string) {
  return sendGlobalCustomerVerificationEmail({
    to, code: token,
    resendApiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    fromDomain: process.env.RESEND_FROM_DOMAIN,
  });
}
