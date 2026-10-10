import { describe, expect, it } from "vitest";
import { authorizeContextDiscovery } from "./ui-context-policy.js";

const principal = { sub: "u1", tenantId: "t1", actorType: "human", accessScope: "tenant" };
const membership = { userId: "u1", tenantId: "t1", active: true };

describe("UI-01.5 context discovery access policy", () => {
  it("allows a validated human membership in the session tenant", () => {
    expect(authorizeContextDiscovery(principal, membership)).toEqual({ allowed: true, userId: "u1", tenantId: "t1" });
  });
  it("rejects mismatched tenant or user", () => {
    expect(authorizeContextDiscovery(principal, { ...membership, tenantId: "t2" }).allowed).toBe(false);
    expect(authorizeContextDiscovery(principal, { ...membership, userId: "u2" }).allowed).toBe(false);
  });
  it("rejects inactive, absent, preproject, obra and agent access", () => {
    expect(authorizeContextDiscovery(principal, { ...membership, active: false }).allowed).toBe(false);
    expect(authorizeContextDiscovery(principal, null).allowed).toBe(false);
    expect(authorizeContextDiscovery({ ...principal, accessScope: "preprojeto" }, membership).allowed).toBe(false);
    expect(authorizeContextDiscovery({ ...principal, accessScope: "obra" }, membership).allowed).toBe(false);
    expect(authorizeContextDiscovery({ ...principal, actorType: "ai" }, membership).allowed).toBe(false);
  });
  it("denies invalid session identities", () => {
    expect(authorizeContextDiscovery({ tenantId: "t1" }, membership).allowed).toBe(false);
    expect(authorizeContextDiscovery(undefined, membership).allowed).toBe(false);
  });
});
