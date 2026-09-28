import { describe, expect, it } from "vitest";
import { parseAsciiDxf } from "../lib/arqdor-dxf-import.js";

describe("Arqdor DXF import", () => {
  it("converte LINE em parede editável e respeita milímetros", () => {
    const dxf = [
      "0","SECTION","2","HEADER","9","$INSUNITS","70","4","0","ENDSEC",
      "0","SECTION","2","ENTITIES",
      "0","LINE","8","ARQ_PAREDES_P1","10","1000","20","2000","11","5000","21","2000",
      "0","ENDSEC","0","EOF",
    ].join("\n");

    const result = parseAsciiDxf(dxf);
    expect(result.unit).toBe("mm");
    expect(result.walls).toHaveLength(1);
    expect(result.walls[0]).toMatchObject({ floor: 0, x1: 0, y1: 0, x2: 4, y2: 0 });
    expect(result.bounds.width).toBe(4);
  });

  it("ignora segmento diagonal e mantém ortogonais", () => {
    const dxf = [
      "0","SECTION","2","ENTITIES",
      "0","LINE","8","P1","10","0","20","0","11","4","21","0",
      "0","LINE","8","P1","10","0","20","0","11","4","21","4",
      "0","ENDSEC","0","EOF",
    ].join("\n");

    const result = parseAsciiDxf(dxf);
    expect(result.walls).toHaveLength(1);
    expect(result.skippedDiagonal).toBe(1);
    expect(result.warnings.join(" ")).toContain("diagonais");
  });
});
