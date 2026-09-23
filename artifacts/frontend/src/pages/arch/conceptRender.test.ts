import { describe, expect, it } from "vitest";
import { buildConceptRenderBrief } from "./conceptRender";

const facade = {
  style: "contemporaneo",
  roof: "platibanda",
  primaryMaterial: "pintura",
  accentMaterial: "madeira",
  facadeTone: "claro",
  frameTone: "preto",
  landscaping: "medio",
} as const;

describe("Arqdor photoreal render brief", () => {
  it("locks interior geometry, objects and material assignments", () => {
    const brief = buildConceptRenderBrief({
      lotWidth: 12,
      lotDepth: 30,
      floors: 1,
      desiredArea: 145,
      facade,
      renderView: "interior",
      lightingMode: "night",
      rooms: [
        {
          id: "room-1",
          kind: "sala",
          label: "Sala",
          width: 5,
          depth: 4,
          floor: 0,
          x: 1,
          y: 2,
        },
      ],
      objects: [
        {
          kind: "sofa",
          label: "Sofá 3 lugares",
          floor: 0,
          x: 2.5,
          y: 3.25,
          width: 2.2,
          depth: 0.9,
          rotation: 90,
          materialId: "tecido-bege",
        },
      ],
      wallMaterialIds: ["madeira-ripada", "madeira-ripada"],
      floorMaterialIds: ["madeira-carvalho"],
    });

    expect(brief).toContain("CRITICAL PRESERVATION");
    expect(brief).toContain("Do not redesign the layout");
    expect(brief).toContain("Sofá 3 lugares");
    expect(brief).toContain("rotation 90°");
    expect(brief).toContain("tecido-bege");
    expect(brief).toContain("madeira-ripada");
    expect(brief).toContain("madeira-carvalho");
    expect(brief).toContain("nighttime architectural visualization");
  });

  it("locks exact exterior wall topology and openings", () => {
    const brief = buildConceptRenderBrief({
      lotWidth: 12,
      lotDepth: 30,
      floors: 2,
      desiredArea: 210,
      facade,
      renderView: "exterior",
      rooms: [],
      geometryLock: {
        frontSide: "bottom",
        exteriorWalls: [
          { floor: 0, x1: 1, y1: 2, x2: 9, y2: 2 },
          { floor: 1, x1: 2, y1: 3, x2: 8, y2: 3 },
        ],
        openings: [
          { floor: 0, type: "door", x: 3, y: 2, width: 1.1, height: 2.2, sillHeight: 0 },
          { floor: 1, type: "window", x: 6, y: 3, width: 1.8, height: 1.2, sillHeight: 0.9 },
        ],
      },
    });

    expect(brief).toContain("GEOMETRY FRONT LOCK");
    expect(brief).toContain("EXACT WALL TOPOLOGY LOCK");
    expect(brief).toContain("EXACT OPENING LOCK");
    expect(brief).toContain("SILHOUETTE LOCK");
    expect(brief).toContain("CROP LOCK");
  });

  it("does not invent a pool when the project has none", () => {
    const brief = buildConceptRenderBrief({
      lotWidth: 10,
      lotDepth: 25,
      floors: 1,
      desiredArea: 100,
      facade,
      renderView: "exterior",
      rooms: [],
    });

    expect(brief).toContain("Do not invent a swimming pool");
    expect(brief).toContain("Do not invent a different house");
  });
});
