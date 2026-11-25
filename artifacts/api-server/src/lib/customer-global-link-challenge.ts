import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Challenge primitives for linking a legacy portal account to a global identity.
 * No HTTP route is registered here. A trusted backend must first authenticate
 * BOTH the global identity session and the target legacy tenant account.
 * Challenge hashes (never plaintext challenges) belong in persistent storage.
 */
export const CUSTOMER_LINK_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function newCustomerLinkChallenge(now: Date = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid timestamp");
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashCustomerLinkChallenge(token),
    expiresAt: new Date(now.getTime() + CUSTOMER_LINK_CHALLENGE_TTL_MS),
  };
}

export function hashCustomerLinkChallenge(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Pure validation only. A database transaction must atomically consume a challenge. */
export function verifyCustomerLinkChallenge(
  token: string,
  stored: {
    tokenHash: string;
    globalIdentityId: string;
    legacyPortalUserId: string;
    tenantId: string;
    expiresAt: Date;
    consumedAt: Date | null;
  },
  requested: { globalIdentityId: string; legacyPortalUserId: string; tenantId: string },
  now: Date = new Date(),
): boolean {
  if (!/^[0-9a-f]{64}$/.test(token) ||
      !/^[0-9a-f]{64}$/.test(stored.tokenHash) ||
      !Number.isFinite(now.getTime())) return false;
  const received = Buffer.from(hashCustomerLinkChallenge(token), "hex");
  const expected = Buffer.from(stored.tokenHash, "hex");
  return timingSafeEqual(received, expected) &&
    stored.globalIdentityId === requested.globalIdentityId &&
    stored.legacyPortalUserId === requested.legacyPortalUserId &&
    stored.tenantId === requested.tenantId &&
    stored.consumedAt === null &&
    Number.isFinite(stored.expiresAt.getTime()) &&
    stored.expiresAt.getTime() > now.getTime();
}
