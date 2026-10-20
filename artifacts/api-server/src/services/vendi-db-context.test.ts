import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { transaction: mocks.transaction },
}));

import { withVendiTenantContext } from "./vendi-db-context.js";

describe("withVendiTenantContext", () => {
  const tx = { execute: mocks.execute };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    mocks.execute.mockResolvedValue(undefined);
  });

  it("sets transaction-local tenant context before running the operation", async () => {
    const operation = vi.fn(async () => "persisted");

    const result = await withVendiTenantContext("tenant-123", operation);

    expect(result).toBe("persisted");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith(tx);
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
      operation.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects an empty tenant before opening a database transaction", async () => {
    await expect(withVendiTenantContext("  ", async () => undefined))
      .rejects.toThrow("VENDI_TENANT_REQUIRED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not run the operation when setting database context fails", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("context function unavailable"));
    const operation = vi.fn(async () => undefined);

    await expect(withVendiTenantContext("tenant-123", operation))
      .rejects.toThrow("context function unavailable");
    expect(operation).not.toHaveBeenCalled();
  });
});
