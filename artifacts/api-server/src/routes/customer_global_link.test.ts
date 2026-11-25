import { describe, expect, it, vi } from "vitest";
import { createCustomerGlobalLinkRouter } from "./customer_global_link";
import type { LinkPool } from "../lib/customer-global-link-service";

function makeHarness(enabled: boolean, actor: unknown) {
  const connect = vi.fn();
  const resolver = vi.fn(async () => actor as never);
  const router = createCustomerGlobalLinkRouter({
    enabled: () => enabled,
    resolveVerifiedActor: resolver,
    privilegedPool: { connect } as unknown as LinkPool,
  });
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === "/customer-global/link/confirm");
  const handler = layer.route.stack[0].handle;
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const setHeader = vi.fn();
  const res = { status, json, setHeader };
  return { handler, res, status, json, connect, resolver };
}
describe("customer global link endpoint fail-closed", () => {
  it("does not resolve identity or access DB when disabled", async () => {
    const h = makeHarness(false, null);
    await h.handler({ body: { challengeToken: "a".repeat(64) } }, h.res);
    expect(h.status).toHaveBeenCalledWith(404);
    expect(h.resolver).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
  });
  it("rejects user-supplied tenant and account identifiers", async () => {
    const h = makeHarness(true, null);
    await h.handler({ body: { challengeToken: "a".repeat(64), tenantId: "other" } }, h.res);
    expect(h.status).toHaveBeenCalledWith(422);
    expect(h.connect).not.toHaveBeenCalled();
  });
  it("rejects lack of dual authenticated session", async () => {
    const h = makeHarness(true, { globalIdentityId: "global", tenantId: "A", legacyPortalUserId: "legacy", globalSessionVerified: true, legacySessionVerified: false });
    await h.handler({ body: { challengeToken: "a".repeat(64) } }, h.res);
    expect(h.status).toHaveBeenCalledWith(401);
    expect(h.connect).not.toHaveBeenCalled();
  });
});
