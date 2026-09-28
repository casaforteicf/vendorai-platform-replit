import { describe, expect, it } from "vitest";
import { buildConceptIfc, conceptIfcFilename } from "../lib/arqdor-concept-ifc.js";
import { parseIfcMetadata } from "../lib/arqdor-ifc-metadata.js";

describe("Arqdor Concept IFC", () => {
  it("exporta IFC4 reconhecível pelo parser com pavimentos e paredes", () => {
    const ifc = buildConceptIfc({
      title: "Casa BIM",
      floors: 2,
      customWalls: [
        { id: "w1", floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, thickness: 0.14 },
        { id: "w2", floor: 1, x1: 0, y1: 0, x2: 4, y2: 0, thickness: 0.14 },
      ],
      rooms: [],
    });

    expect(ifc).toContain("FILE_SCHEMA(('IFC4'))");
    expect(ifc).toContain("IFCWALL");
    expect(ifc).toContain("IFCBUILDINGSTOREY");

    const parsed = parseIfcMetadata(ifc);
    expect(parsed.schema).toBe("IFC4");
    expect(parsed.storeys).toHaveLength(2);
    expect(parsed.counts.walls).toBe(2);
    expect(parsed.unit).toBe("m");
  });

  it("deriva paredes dos ambientes quando o modelo ainda não usa wall-first", () => {
    const ifc = buildConceptIfc({
      title: "Casa por ambientes",
      floors: 1,
      rooms: [{ label: "Sala", floor: 0, x: 0, y: 0, width: 4, depth: 3 }],
      customWalls: [],
    });

    const parsed = parseIfcMetadata(ifc);
    expect(parsed.counts.walls).toBe(4);
  });

  it("gera nome de arquivo seguro", () => {
    expect(conceptIfcFilename("Casa São João / BIM")).toBe("casa_sao_joao_bim.ifc");
  });
});
