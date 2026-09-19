import { describe, expect, it } from "vitest";
import {
  collectConceptMaterials,
  conceptFloorElevation,
  conceptMaterialRows,
  conceptObjectRows,
  type ConceptPromotedMaterialRef,
  type ConceptPromotedMaterialScheme,
} from "./arch-concept-promotion.js";

const material = (
  id: string,
  category: string,
  color = "#ffffff",
): ConceptPromotedMaterialRef => ({
  id,
  name: id,
  category,
  color,
  pattern: category === "roof" ? "tile" : "solid",
});

function scheme(): ConceptPromotedMaterialScheme {
  return {
    floor: material("floor-main", "floor", "#ddd9d1"),
    floorByLevel: {},
    interiorWall: material("wall-in", "interior_wall", "#eeeae1"),
    exteriorWall: material("wall-out", "exterior_wall", "#e7e3db"),
    roof: material("roof-main", "roof", "#55504e"),
    stair: material("stair-main", "stair", "#b69469"),
  };
}

describe("Arqdor Concept promotion helpers", () => {
  it("calcula elevação acumulando o piso-a-piso das escadas", () => {
    expect(conceptFloorElevation([
      { floor: 0, kind: "escada", stairFloorToFloorHeight: 3.1 },
      { floor: 1, kind: "escada", stairFloorToFloorHeight: 3.25 },
    ], 2)).toBeCloseTo(6.35);
  });

  it("usa 2,96 m quando não existe escada válida no pavimento", () => {
    expect(conceptFloorElevation([], 2)).toBeCloseTo(5.92);
    expect(conceptFloorElevation([
      { floor: 0, kind: "escada", stairFloorToFloorHeight: 2.5 },
    ], 1)).toBeCloseTo(2.96);
  });

  it("gera linhas de arq_objects preservando transformação e origem", () => {
    const rows = conceptObjectRows([
      {
        id: "concept-object-sofa",
        presetId: "sofa-3",
        name: "Sofá",
        category: "estar",
        symbol: "sofa",
        floor: 1,
        x: 4,
        y: 5,
        width: 2.2,
        depth: 0.9,
        height: 0.85,
        rotationDeg: 90,
        material: "Linho",
        color: "#cdbfae",
        catalogProductId: "catalog-1",
      },
    ], [
      { floor: 0, kind: "escada", stairFloorToFloorHeight: 3.1 },
    ]);

    expect(rows[0]).toMatchObject({
      objectClientId: "concept-object-sofa",
      dimensions: { width: 2.2, height: 0.85, depth: 0.9, unit: "m" },
      position: { x: 4, y: 5, z: 3.1, rotationDeg: 90, floor: 1 },
      componentId: "sofa-3",
    });
    expect(rows[0]?.designIntent).toContain("source:arqdor_concept");
    expect(rows[0]?.designIntent).toContain("preset:sofa-3");
    expect(rows[0]?.designIntent).toContain("symbol:sofa");
    expect(rows[0]?.designIntent).toContain("catalog_product:catalog-1");
  });

  it("deduplica o mesmo material usado no piso geral e em um pavimento", () => {
    const input = scheme();
    input.floorByLevel = { "1": input.floor };

    const rows = collectConceptMaterials(input);
    const floor = rows.find((entry) => entry.material.id === "floor-main");

    expect(rows).toHaveLength(5);
    expect(floor?.usedBy).toEqual([
      "surface:floor:default",
      "surface:floor:1",
    ]);
  });

  it("gera linhas de arq_materials com origem, padrão e paleta", () => {
    const input = scheme();
    input.exteriorWall = {
      ...input.exteriorWall,
      secondaryColor: "#d0cbc0",
      edgeColor: "#999188",
      manufacturer: "Fabricante teste",
      finish: "Fosco",
      libraryMaterialId: "library-123",
    };

    const row = conceptMaterialRows(input)
      .find((entry) => entry.materialClientId === "concept-material-wall-out");

    expect(row).toMatchObject({
      name: "wall-out",
      category: "exterior_wall",
      manufacturer: "Fabricante teste",
      finish: "Fosco",
      palette: ["#e7e3db", "#d0cbc0", "#999188"],
    });
    expect(row?.usedByObjects).toContain("source:arqdor_concept");
    expect(row?.usedByObjects).toContain("library_material:library-123");
    expect(row?.usedByObjects).toContain("surface:exterior_wall");
  });
});
