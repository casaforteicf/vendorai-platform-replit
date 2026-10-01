import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./agent-activation.js", () => ({ isAgentActive: vi.fn() }));
import { isAgentActive } from "./agent-activation.js";
import { assertAutomatedSendAllowed } from "./agent-send-guard.js";
const active = vi.mocked(isAgentActive);
beforeEach(() => { active.mockReset(); });
describe("central automated send guard", () => {
  it.each(["sdr", "closer", "financeiro", "cobranca", "service", "scheduler",
    "relacionamento", "reception", "pharmacy", "prospector"])(
    "blocks disabled %s before a channel provider can be called", async (agentName) => {
      active.mockResolvedValue(false);
      await expect(assertAutomatedSendAllowed({ tenantId: "tenant-a", agentName })).rejects.toThrow("AGENT_DISABLED");
      expect(active).toHaveBeenCalledWith("tenant-a", agentName);
    });
  it("never reuses tenant A authorization for tenant B", async () => {
    active.mockImplementation(async (tenant) => tenant === "tenant-a");
    await expect(assertAutomatedSendAllowed({ tenantId: "tenant-a", agentName: "sdr" })).resolves.toBeUndefined();
    await expect(assertAutomatedSendAllowed({ tenantId: "tenant-b", agentName: "sdr" })).rejects.toThrow("AGENT_DISABLED");
  });
  it("rechecks activation after a queued message was generated", async () => {
    active.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await assertAutomatedSendAllowed({ tenantId: "tenant-a", agentName: "sdr" });
    await expect(assertAutomatedSendAllowed({ tenantId: "tenant-a", agentName: "sdr" })).rejects.toThrow("AGENT_DISABLED");
  });
  it("blocks human takeover even when the agent is enabled", async () => {
    active.mockResolvedValue(true);
    await expect(assertAutomatedSendAllowed({ tenantId: "tenant-a", agentName: "sdr", humanLock: "human" })).rejects.toThrow("AGENT_BLOCKED");
    expect(active).not.toHaveBeenCalled();
  });
  it("blocks a permanently disabled contact", async () => {
    await expect(assertAutomatedSendAllowed({ tenantId: "tenant-a", agentName: "sdr", disabled: true })).rejects.toThrow("AGENT_BLOCKED");
  });
  it("preserves manual operator messages", async () => {
    await expect(assertAutomatedSendAllowed({ tenantId: "tenant-a", humanLock: "human", disabled: true })).resolves.toBeUndefined();
    expect(active).not.toHaveBeenCalled();
  });
  it("fails closed when the activation database cannot be read", async () => {
    active.mockRejectedValue(new Error("database unavailable"));
    await expect(assertAutomatedSendAllowed({ tenantId: "tenant-a", agentName: "sdr" })).rejects.toThrow("database unavailable");
  });
});
