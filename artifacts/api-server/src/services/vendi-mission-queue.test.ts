import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Logger } from "pino";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), context: vi.fn(), select: vi.fn(), set: vi.fn() }));
vi.mock("@workspace/db", () => ({
  db: { select: mocks.select }, tenantsTable: { id: "tenantId" },
  vendiMissionsTable: { id: "id", tenantId: "tenantId", status: "status", priority: "priority", createdAt: "createdAt" },
}));
vi.mock("./vendi-mission-supervisor.js", () => ({ executeVendiMission: mocks.execute }));
vi.mock("./vendi-db-context.js", () => ({ withVendiTenantContext: mocks.context }));
vi.mock("../routes/vendi-db-errors.js", () => ({ getPostgresDiagnostic: () => ({ code: null }) }));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  vi.stubEnv("VENDORAI_DISABLE_BACKGROUND_JOBS", "0"); vi.stubEnv("VENDI_MISSION_QUEUE_ENABLED", "true");
  mocks.execute.mockReset().mockResolvedValue({ status: "completed" }); mocks.set.mockReset();
  mocks.select.mockReturnValue({ from: async () => [{ id: "tenant-test" }] });
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ for: async () => [{ id: "mission-test" }] }) }) }) }) }),
    update: () => ({ set: mocks.set.mockImplementation(() => ({ where: () => ({ returning: async () => [{ id: "mission-test", tenantId: "tenant-test" }] }) })) }),
  };
  mocks.context.mockReset().mockImplementation(async (_tenantId, fn) => fn(tx));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
it("executes the claimed mission with its ID and tenant context", async () => {
  const { startVendiMissionQueueWorker } = await import("./vendi-mission-queue.js");
  const log = { info: vi.fn(), error: vi.fn() }; startVendiMissionQueueWorker(log as unknown as Logger);
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.execute).toHaveBeenCalledWith({ tenantId: "tenant-test", missionId: "mission-test", claimed: true });
  expect(mocks.context).toHaveBeenCalledWith("tenant-test", expect.any(Function)); expect(log.error).not.toHaveBeenCalled();
});
it("records execution failures in the same tenant context", async () => {
  mocks.execute.mockRejectedValue(new Error("execution failed"));
  const { startVendiMissionQueueWorker } = await import("./vendi-mission-queue.js");
  const log = { info: vi.fn(), error: vi.fn() }; startVendiMissionQueueWorker(log as unknown as Logger);
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.context).toHaveBeenLastCalledWith("tenant-test", expect.any(Function));
  expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", lastError: "VENDI_MISSION_FAILED" }));
  expect(log.error).toHaveBeenCalled();
});
