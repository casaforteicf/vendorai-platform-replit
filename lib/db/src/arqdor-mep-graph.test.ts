import { describe, expect, it } from "vitest";
import { validateMepNetwork, type MepGraphNode } from "./arqdor-mep-graph";

const scope = { tenantId: "tenant-a", projectId: "house-a", networkId: "circuit-1" };
const nodes: MepGraphNode[] = [
  { ...scope, id: "socket", xMm: 1000, yMm: 500, zMm: 300 },
  { ...scope, id: "panel", xMm: 500, yMm: 100, zMm: 1500 },
];

describe("Arqdor MEP graph integrity", () => {
  it("accepts a same-project connected network", () => {
    expect(validateMepNetwork(scope, nodes, [{
      ...scope, id: "run-1", fromNodeId: "panel", toNodeId: "socket", nominalSizeMm: 20,
    }])).toEqual([]);
  });

  it("rejects unknown endpoints", () => {
    const issues = validateMepNetwork(scope, nodes, [{
      ...scope, id: "run-2", fromNodeId: "panel", toNodeId: "missing",
    }]);
    expect(issues).toContainEqual({ code: "missing_endpoint", elementId: "run-2" });
  });

  it("rejects cross-tenant references", () => {
    const issues = validateMepNetwork(scope, [{ ...nodes[0], tenantId: "tenant-b" }, nodes[1]], [{
      ...scope, id: "run-3", fromNodeId: "panel", toNodeId: "socket",
    }]);
    expect(issues.some(issue => issue.code === "cross_scope_endpoint")).toBe(true);
  });

  it("rejects self-loops and nonpositive nominal sizes", () => {
    const issues = validateMepNetwork(scope, nodes, [{
      ...scope, id: "run-4", fromNodeId: "panel", toNodeId: "panel", nominalSizeMm: 0,
    }]);
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["self_loop", "invalid_size"]));
  });
});
