import { describe, expect, it, vi } from "vitest";
import { consumeVerifiedCustomerLink, type LinkPool } from "./customer-global-link-service";

function fakePool(outcomes: number[]) {
  const queries: string[] = [];
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    return { rows: [], rowCount: sql === "BEGIN" || sql === "ROLLBACK" || sql === "COMMIT" ? null : (outcomes.shift() ?? 0) };
  });
  const pool: LinkPool = { connect: async () => ({ query, release }) };
  return { pool, queries, release };
}
const input = { globalIdentityId: "11111111-1111-4111-8111-111111111111", tenantId: "tenant-A", legacyPortalUserId: "legacy-1", challengeToken: "a".repeat(64) };

describe("consume verified portal link transaction", () => {
  it("rejects missing proof before connecting", async () => {
    const f = fakePool([]);
    expect(await consumeVerifiedCustomerLink(f.pool, { ...input, challengeToken: "no" })).toBe("invalid_or_expired");
    expect(f.queries).toEqual([]);
  });
  it("consumes and inserts exactly once in a single transaction", async () => {
    const f = fakePool([1, 1]);
    expect(await consumeVerifiedCustomerLink(f.pool, input)).toBe("linked");
    expect(f.queries[0]).toBe("BEGIN");
    expect(f.queries[1]).toContain("consumed_at IS NULL");
    expect(f.queries[1]).toContain("email_verified_at IS NOT NULL");
    expect(f.queries[2]).toContain("u.tenant_id=$2");
    expect(f.queries.at(-1)).toBe("COMMIT");
    expect(f.release).toHaveBeenCalledOnce();
  });
  it("rolls back a used or expired challenge", async () => {
    const f = fakePool([0]);
    expect(await consumeVerifiedCustomerLink(f.pool, input)).toBe("invalid_or_expired");
    expect(f.queries.at(-1)).toBe("ROLLBACK");
    expect(f.queries.some(q => q.includes("INSERT INTO"))).toBe(false);
  });
  it("rolls back when linked account belongs to a different identity", async () => {
    const f = fakePool([1, 0]);
    expect(await consumeVerifiedCustomerLink(f.pool, input)).toBe("conflict");
    expect(f.queries.at(-1)).toBe("ROLLBACK");
  });
});
