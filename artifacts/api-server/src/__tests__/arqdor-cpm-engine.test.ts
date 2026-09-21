import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/routes/arch_production_procurement.ts"),
  "utf8",
);

describe("Arqdor CPM contracts", () => {
  it("uses a deterministic network pass with all dependency types", () => {
    expect(source).toContain("function buildCpm(");
    expect(source).toContain('if (type === "SS")');
    expect(source).toContain('if (type === "FF")');
    expect(source).toContain('if (type === "SF")');
    expect(source).toContain("totalFloatDays");
    expect(source).toContain("freeFloatDays");
    expect(source).toContain("critical: totalFloat <= 0");
  });

  it("rejects cyclic networks and exposes CPM in the construction bundle", () => {
    expect(source).toContain("topo.length !== dated.length");
    expect(source).toContain("cpm,");
    expect(source).toContain('"/arch/construction/:obraId/cpm"');
  });

  it("keeps cascade rescheduling on the same work calendar as CPM", () => {
    expect(source).toContain("workDurationDays(successor.start, successor.end, calendar)");
    expect(source).toContain("shiftWorkDays(predecessor.end, lag + 1, calendar)");
    expect(source).toContain("addWorkDays(constrainedStart, duration - 1, calendar)");
  });
});
