import { describe, expect, it } from "vitest";
import {
  buildRoofFaces,
  buildRoofPlanGuides,
  defaultRoofParameters,
  expandRoofBounds,
  normalizeRoofParameters,
  roofFacadeRise,
} from "./conceptRoof";

const bounds = { minX: 1, minY: 2, maxX: 11, maxY: 8 };

describe("concept roof", () => {
  it("mantém parâmetros padrão prontos para troca entre estratégias", () => {
    const roof = defaultRoofParameters("platibanda");
    expect(roof.roof).toBe("platibanda");
    expect(roof.roofWaters).toBe(2);
    expect(roof.roofPitchDeg).toBeGreaterThan(0);
    expect(roof.roofOverhang).toBeGreaterThan(0);
  });

  it("normaliza inclinação, beiral, platibanda e proporção mista", () => {
    const roof = normalizeRoofParameters({
      roof: "misto",
      roofPitchDeg: 90,
      roofOverhang: -1,
      roofParapetHeight: 3,
      roofMixedRatio: 0.95,
    });
    expect(roof.roofPitchDeg).toBe(55);
    expect(roof.roofOverhang).toBe(0);
    expect(roof.roofParapetHeight).toBe(1.5);
    expect(roof.roofMixedRatio).toBe(0.8);
  });

  it("faz o beiral expandir o mesmo envelope usado no desenho", () => {
    expect(expandRoofBounds(bounds, 0.5)).toEqual({
      minX: 0.5,
      minY: 1.5,
      maxX: 11.5,
      maxY: 8.5,
    });
  });

  it("gera duas águas a partir da mesma inclinação e orientação", () => {
    const faces = buildRoofFaces(bounds, 3, {
      roof: "aparente",
      roofWaters: 2,
      roofPitchDeg: 30,
      roofRidgeOrientation: "x",
      roofOverhang: 0,
    });
    expect(faces.length).toBe(2);
    expect(Math.max(...faces.flatMap((face) => face.points.map((point) => point.z)))).toBeGreaterThan(3);
  });

  it("gera quatro águas e respectivas linhas de espigão no plano", () => {
    const guides = buildRoofPlanGuides(bounds, {
      roof: "aparente",
      roofWaters: 4,
      roofRidgeOrientation: "x",
      roofOverhang: 0.4,
    });
    expect(guides.filter((guide) => guide.kind === "ridge").length).toBe(1);
    expect(guides.filter((guide) => guide.kind === "hip").length).toBe(4);
  });

  it("faz a inclinação alterar a altura real da cobertura", () => {
    const low = roofFacadeRise(10, 6, { roof: "aparente", roofWaters: 2, roofPitchDeg: 10, roofRidgeOrientation: "y" });
    const high = roofFacadeRise(10, 6, { roof: "aparente", roofWaters: 2, roofPitchDeg: 40, roofRidgeOrientation: "y" });
    expect(high).toBeGreaterThan(low);
  });

  it("mistura platibanda e telhado no mesmo objeto de cobertura", () => {
    const faces = buildRoofFaces(bounds, 3, {
      roof: "misto",
      roofWaters: 2,
      roofPitchDeg: 25,
      roofMixedRatio: 0.4,
    });
    expect(faces.some((face) => face.role === "parapet")).toBe(true);
    expect(faces.some((face) => face.role === "roof")).toBe(true);
  });
});
