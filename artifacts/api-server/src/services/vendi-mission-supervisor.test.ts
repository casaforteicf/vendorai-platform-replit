import { describe, expect, it } from "vitest";
import { toolNeedsApproval } from "./vendi-mission-supervisor.js";
import { listVendiTools } from "./vendi-tool-registry.js";

describe("Vendi orchestration policy", () => {
  it("requires approval for high-risk tools under standard policy", () => {
    expect(toolNeedsApproval("low", "standard")).toBe(false);
    expect(toolNeedsApproval("medium", "standard")).toBe(false);
    expect(toolNeedsApproval("high", "standard")).toBe(true);
  });

  it("blocks mutations under read-only policy", () => {
    expect(toolNeedsApproval("low", "read_only")).toBe(false);
    expect(toolNeedsApproval("medium", "read_only")).toBe(true);
    expect(toolNeedsApproval("high", "read_only")).toBe(true);
  });

  it("registers unique executable capabilities across core domains", () => {
    const tools = listVendiTools();
    const ids = tools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("crm.leads.list");
    expect(ids).toContain("marketing.ads.overview");
    expect(ids).toContain("prospector.revenue_scout");
    expect(ids).toContain("agents.dispatch");
    expect(ids).toContain("web.discover");
  });
});
