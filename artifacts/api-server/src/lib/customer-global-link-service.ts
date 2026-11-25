import { hashCustomerLinkChallenge } from "./customer-global-link-challenge.js";

/**
 * Privileged-only, not mounted in HTTP routes. Caller MUST have independently
 * authenticated both identity and legacy account and verified challenge delivery.
 * DB role must be a narrowly scoped authorized role; public/vendorai_app has no grants.
 */
export type LinkTx = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};
export type LinkPool = {
  connect: () => Promise<LinkTx & { release: () => void }>;
};
export type ConsumeLinkInput = {
  globalIdentityId: string;
  tenantId: string;
  legacyPortalUserId: string;
  challengeToken: string;
};

export async function consumeVerifiedCustomerLink(
  pool: LinkPool,
  input: ConsumeLinkInput,
): Promise<"linked" | "invalid_or_expired" | "conflict"> {
  if (!input.globalIdentityId || !input.tenantId || !input.legacyPortalUserId ||
      !/^[a-f0-9]{64}$/.test(input.challengeToken)) return "invalid_or_expired";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the challenge row; concurrent consumers cannot use the same token twice.
    const consumed = await client.query(
      `UPDATE public.customer_global_link_challenges c
         SET consumed_at=now()
       WHERE c.token_hash=$1
         AND c.global_identity_id=$2::uuid
         AND c.tenant_id=$3
         AND c.legacy_portal_user_id=$4
         AND c.consumed_at IS NULL
         AND c.expires_at > now()
         AND EXISTS (SELECT 1 FROM public.customer_global_identities i
                      WHERE i.id=c.global_identity_id AND i.status='active'
                        AND i.email_verified_at IS NOT NULL)
       RETURNING c.id`,
      [hashCustomerLinkChallenge(input.challengeToken), input.globalIdentityId, input.tenantId, input.legacyPortalUserId],
    );
    if (consumed.rowCount !== 1) {
      await client.query("ROLLBACK");
      return "invalid_or_expired";
    }
    // Check ownership again in the same transaction; trigger adds a second guard.
    const linked = await client.query(
      `INSERT INTO public.customer_global_tenant_links
         (global_identity_id, tenant_id, legacy_portal_user_id, status, verified_at, verification_method)
       SELECT $1::uuid, $2, u.id, 'verified', now(), 'dual_authenticated_challenge'
         FROM public.customer_portal_users u
        WHERE u.id=$3 AND u.tenant_id=$2 AND u.status='ativo'
       ON CONFLICT (legacy_portal_user_id) DO NOTHING
       RETURNING id`,
      [input.globalIdentityId, input.tenantId, input.legacyPortalUserId],
    );
    if (linked.rowCount !== 1) {
      await client.query("ROLLBACK");
      return "conflict";
    }
    await client.query("COMMIT");
    return "linked";
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
