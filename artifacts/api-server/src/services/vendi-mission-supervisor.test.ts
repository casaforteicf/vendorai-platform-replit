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
    expect(ids).toContain("prospector.search_companies");
    expect(ids).toContain("prospector.search_construction_signals");
    expect(ids).toContain("prospector.autonomous_cycle");
    expect(ids).toContain("prospector.sources_catalog");
    expect(ids).toContain("prospector.sources_health");
    expect(ids).toContain("prospector.source_performance");
    expect(ids).toContain("prospector.autonomous_preview");
    expect(ids).toContain("prospector.revenue_scout");
    expect(ids).toContain("agents.dispatch");
    expect(ids).toContain("web.discover");
    expect(ids).toContain("agenda.appointments.list");
    expect(ids).toContain("finance.integrations.health");
    expect(ids).toContain("proposals.auto_quote");
    expect(ids).toContain("works.list");
    expect(ids).toContain("purchasing.request.create");
    expect(ids).toContain("arqdor.projects.list");
    expect(ids).toContain("customer_intelligence.relationship_events");
    expect(ids).toContain("customer_intelligence.list");
    expect(ids).toContain("media.assets.list");
    expect(ids).toContain("omnichannel.send");
  });
});
