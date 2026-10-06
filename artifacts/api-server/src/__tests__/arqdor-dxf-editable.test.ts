import { describe, expect, it } from "vitest";
import { parseDxfEditableGeometry } from "../lib/arqdor-dxf-editable.js";

function dxf(lines: Array<string | number>) {
  return lines.join("\n") + "\n";
}

describe("parseDxfEditableGeometry", () => {
  it("imports wall LINE entities in millimeters and normalizes origin", () => {
    const input = dxf([
      0, "SECTION", 2, "HEADER",
      9, "$INSUNITS", 70, 4,
      0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "LINE", 8, "ARQ_PAREDES_P1", 10, 1000, 20, 2000, 11, 5000, 21, 2000,
      0, "LINE", 8, "ARQ_PAREDES_P1", 10, 5000, 20, 2000, 11, 5000, 21, 6000,
      0, "ENDSEC", 0, "EOF",
    ]);

    const result = parseDxfEditableGeometry(input);
    expect(result.unit).toBe("mm");
    expect(result.walls).toHaveLength(2);
    expect(result.walls[0]).toMatchObject({
      floor: 0,
      x1: 0,
      y1: 0,
      x2: 4,
      y2: 0,
    });
    expect(result.bounds).toEqual({ width: 4, depth: 4 });
  });

  it("warns when no explicit wall layer exists", () => {
    const input = dxf([
      0, "SECTION", 2, "HEADER", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "LINE", 8, "0", 10, 0, 20, 0, 11, 3, 21, 0,
      0, "ENDSEC", 0, "EOF",
    ]);

    const result = parseDxfEditableGeometry(input);
    expect(result.walls).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("camada explícita de paredes");
    expect(result.warnings.join(" ")).toContain("Unidade do DXF");
  });
});
