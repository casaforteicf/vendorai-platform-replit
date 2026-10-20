import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as string[],
  setContext: vi.fn(),
  transaction: vi.fn(),
  tx: {
    execute: vi.fn(async (statement: unknown) => {
      state.calls.push("set_context");
      state.setContext(statement);
    }),
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    transaction: (callback: (tx: unknown) => Promise<unknown>) => {
      state.transaction();
      return callback(state.tx);
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: [...strings],
    values,
  }),
}));

import { withVendiTenantContext } from "./vendi-tenant-context.js";

describe("withVendiTenantContext", () => {
  beforeEach(() => {
    state.calls.length = 0;
    vi.clearAllMocks();
  });

  it("sets transaction-local tenant context before running the query", async () => {
    const result = await withVendiTenantContext("tenant-123", async (tx) => {
      state.calls.push("query");
      expect(tx).toBe(state.tx);
      return "saved";
    });

    expect(result).toBe("saved");
    expect(state.transaction).toHaveBeenCalledOnce();
    expect(state.calls).toEqual(["set_context", "query"]);
    expect(state.setContext).toHaveBeenCalledOnce();
    expect(state.setContext.mock.calls[0]?.[0]).toEqual({
      strings: ["SELECT app_security.set_tenant_context(", ", false)"],
      values: ["tenant-123"],
    });
  });
});
