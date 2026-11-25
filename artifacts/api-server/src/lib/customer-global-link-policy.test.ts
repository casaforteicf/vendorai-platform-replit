import { describe, expect, it } from "vitest";
import { evaluateCustomerLink, canReadCustomerResource } from "./customer-global-link-policy";

const now = new Date("2026-10-29T19:00:00.000Z");
const account = { id: "portal-a", tenantId: "tenant-A" };
const proof = {
  legacyPortalUserId: "portal-a",
  tenantId: "tenant-A",
  sessionVerified: true,
  challengeVerified: true,
  proofConsumed: false,
  verifiedAt: new Date(now.getTime() - 1000),
};
describe("customer global identity link policy", () => {
  it("requires independent verified session and challenge", () => {
    expect(evaluateCustomerLink("global-1", account, { ...proof, sessionVerified: false }, now)).toMatchObject({ allowed: false });
    expect(evaluateCustomerLink("global-1", account, { ...proof, challengeVerified: false }, now)).toMatchObject({ allowed: false });
  });
  it("rejects cross tenant and account substitution", () => {
    expect(evaluateCustomerLink("global-1", account, { ...proof, tenantId: "tenant-B" }, now)).toEqual({ allowed: false, reason: "TENANT_MISMATCH" });
    expect(evaluateCustomerLink("global-1", account, { ...proof, legacyPortalUserId: "portal-b" }, now)).toEqual({ allowed: false, reason: "TENANT_MISMATCH" });
  });
  it("rejects replay and stale/future verification", () => {
    expect(evaluateCustomerLink("global-1", account, { ...proof, proofConsumed: true }, now)).toEqual({ allowed: false, reason: "PROOF_REUSED" });
    expect(evaluateCustomerLink("global-1", account, { ...proof, verifiedAt: new Date(now.getTime() - 700000) }, now)).toEqual({ allowed: false, reason: "PROOF_EXPIRED" });
    expect(evaluateCustomerLink("global-1", account, { ...proof, verifiedAt: new Date(now.getTime() + 1000) }, now)).toEqual({ allowed: false, reason: "PROOF_EXPIRED" });
  });
  it("allows only fully verified timely evidence", () => {
    expect(evaluateCustomerLink("global-1", account, proof, now)).toEqual({ allowed: true, status: "verified" });
  });
});
describe("customer global resource authorization", () => {
  const ok = { identityVerified: true, linkStatus: "verified" as const, linkedTenantId: "tenant-A", resourceTenantId: "tenant-A", resourceGrant: true };
  it("requires explicit resource grant even within the same tenant", () => {
    expect(canReadCustomerResource({ ...ok, resourceGrant: false })).toBe(false);
  });
  it("never allows cross-tenant reads", () => {
    expect(canReadCustomerResource({ ...ok, resourceTenantId: "tenant-B" })).toBe(false);
  });
  it("rejects unverified identities or revoked links", () => {
    expect(canReadCustomerResource({ ...ok, identityVerified: false })).toBe(false);
    expect(canReadCustomerResource({ ...ok, linkStatus: "revoked" })).toBe(false);
  });
  it("allows authorized same-tenant resource", () => {
    expect(canReadCustomerResource(ok)).toBe(true);
  });
});
