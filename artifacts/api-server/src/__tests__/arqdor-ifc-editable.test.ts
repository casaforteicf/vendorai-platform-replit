import { describe, expect, it } from "vitest";
import { buildConceptIfc } from "../lib/arqdor-concept-ifc.js";
import { parseIfcEditableGeometry } from "../lib/arqdor-ifc-editable.js";

describe("Arqdor IFC editable geometry", () => {
  it("converte IFC exportado pelo Arqdor novamente em paredes editáveis", () => {
    const ifc = buildConceptIfc({
      title: "Casa roundtrip",
      floors: 2,
      customWalls: [
        { id: "w1", floor: 0, x1: 1, y1: 2, x2: 5, y2: 2, thickness: 0.14 },
        { id: "w2", floor: 1, x1: 0, y1: 0, x2: 0, y2: 4, thickness: 0.18 },
      ],
    });

    const geometry = parseIfcEditableGeometry(ifc);
    expect(geometry.walls).toHaveLength(2);
    expect(geometry.storeys).toHaveLength(2);
    expect(geometry.walls.map((wall) => wall.floor).sort()).toEqual([0, 1]);
    expect(geometry.bounds.width).toBeGreaterThan(0);
    expect(geometry.bounds.depth).toBeGreaterThan(0);
    expect(geometry.walls[0]?.thickness).toBeGreaterThanOrEqual(0.08);
  });

  it("recusa IFC sem paredes compatíveis", () => {
    const ifc = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('x',$,'Vazio',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`;
    expect(() => parseIfcEditableGeometry(ifc)).toThrow(/não encontrei paredes/i);
  });
});
