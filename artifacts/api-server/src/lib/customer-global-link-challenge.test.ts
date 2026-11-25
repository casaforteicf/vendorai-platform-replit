import { describe, expect, it } from "vitest";
import { newCustomerLinkChallenge, verifyCustomerLinkChallenge } from "./customer-global-link-challenge";

describe("customer linking challenge", () => {
  const now = new Date("2026-10-29T19:00:00.000Z");
  const requested = { globalIdentityId: "identity-1", legacyPortalUserId: "legacy-1", tenantId: "tenant-a" };
  const challenge = newCustomerLinkChallenge(now);
  const saved = { tokenHash: challenge.tokenHash, ...requested, expiresAt: challenge.expiresAt, consumedAt: null as Date | null };

  it("issues unpredictable opaque 256-bit tokens and hashes them", () => {
    expect(challenge.token).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge.tokenHash).not.toBe(challenge.token);
    expect(newCustomerLinkChallenge(now).token).not.toBe(challenge.token);
  });
  it("accepts matching unexpired single-use challenge metadata", () => {
    expect(verifyCustomerLinkChallenge(challenge.token, saved, requested, now)).toBe(true);
  });
  it("rejects cross-tenant and cross-user substitution", () => {
    expect(verifyCustomerLinkChallenge(challenge.token, saved, { ...requested, tenantId: "tenant-b" }, now)).toBe(false);
    expect(verifyCustomerLinkChallenge(challenge.token, saved, { ...requested, legacyPortalUserId: "legacy-2" }, now)).toBe(false);
    expect(verifyCustomerLinkChallenge(challenge.token, saved, { ...requested, globalIdentityId: "identity-2" }, now)).toBe(false);
  });
  it("rejects replay, expiration, invalid and modified tokens", () => {
    expect(verifyCustomerLinkChallenge(challenge.token, { ...saved, consumedAt: now }, requested, now)).toBe(false);
    expect(verifyCustomerLinkChallenge(challenge.token, saved, requested, challenge.expiresAt)).toBe(false);
    expect(verifyCustomerLinkChallenge("invalid", saved, requested, now)).toBe(false);
    expect(verifyCustomerLinkChallenge("0".repeat(64), saved, requested, now)).toBe(false);
  });
});
