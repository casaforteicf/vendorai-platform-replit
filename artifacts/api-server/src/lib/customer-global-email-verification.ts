import { createHash, randomBytes } from "node:crypto";
import type { GlobalAuthDb } from "./customer-global-auth.js";

export function createEmailVerificationToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

/** Privileged service only. The caller must check signup intent, rate limits
 * and arrange delivery to the verified destination. Never log the raw token.
 */
export async function issueGlobalEmailVerification(db: GlobalAuthDb, identityId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identityId)) return null;
  const credentials = createEmailVerificationToken();
  const result = await db.query(
    `INSERT INTO public.customer_global_email_verifications(global_identity_id,token_hash,expires_at)
     SELECT id,$2,now() + interval '15 minutes'
       FROM public.customer_global_identities
      WHERE id=$1::uuid AND status='pending' AND email_verified_at IS NULL
     RETURNING id`,
    [identityId,credentials.hash],
  );
  return result.rowCount===1 ? credentials.token : null;
}

/** Atomic consume: simultaneous requests cannot activate twice.
 * No session or tenant link is issued by this function.
 */
export async function consumeGlobalEmailVerification(db: GlobalAuthDb, token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const digest=createHash("sha256").update(token).digest("hex");
  // A single SQL statement atomically claims the token and activates
  // the correct identity; no auth credentials or memberships are created.
  const result=await db.query(
    `WITH claimed AS (
       UPDATE public.customer_global_email_verifications v
          SET consumed_at=now()
        WHERE v.token_hash=$1 AND v.consumed_at IS NULL AND v.expires_at>now()
          AND EXISTS (SELECT 1 FROM public.customer_global_identities i
                       WHERE i.id=v.global_identity_id AND i.status='pending'
                         AND i.email_verified_at IS NULL)
        RETURNING v.global_identity_id
     )
     UPDATE public.customer_global_identities i
        SET email_verified_at=now(), status='active', updated_at=now()
       FROM claimed c
      WHERE i.id=c.global_identity_id AND i.status='pending'
        AND i.email_verified_at IS NULL
     RETURNING i.id`,
    [digest],
  );
  return result.rowCount===1;
}
