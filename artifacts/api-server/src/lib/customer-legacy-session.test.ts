import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { verifyLegacyPortalSession } from "./customer-legacy-session";

const token = "a".repeat(64);
describe("legacy customer portal session verifier", () => {
  it("rejects missing/malformed bearer without database access", async () => {
    const db = { query: vi.fn() };
    expect(await verifyLegacyPortalSession(db, undefined)).toBeNull();
    expect(await verifyLegacyPortalSession(db, "Bearer invalid")).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
  it("returns only original tenant and account from active, unexpired session", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ user_id: "legacy-1", tenant_id: "tenant-a" }] }) };
    expect(await verifyLegacyPortalSession(db, "Bearer " + token)).toEqual({ legacyPortalUserId: "legacy-1", tenantId: "tenant-a" });
    expect(db.query.mock.calls[0][1]).toEqual([createHash("sha256").update(token).digest("hex")]);
    expect(db.query.mock.calls[0][0]).toContain("s.expires_at > now()");
    expect(db.query.mock.calls[0][0]).toContain("u.status='ativo'");
  });
  it("rejects unknown/expired session with no account returned", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    expect(await verifyLegacyPortalSession(db, "Bearer " + token)).toBeNull();
  });
});
