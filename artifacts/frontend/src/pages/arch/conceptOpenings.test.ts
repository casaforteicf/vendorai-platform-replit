import { describe, expect, it } from "vitest";
import {
  OPENING_PRESETS,
  OPENING_WALL_HEIGHT,
  clampOpeningOffset,
  clampOpeningWidthForWall,
  defaultOpeningParameters,
  normalizeOpeningParameters,
} from "./conceptOpenings";

describe("concept openings", () => {
  it("usa defaults únicos para portas e janelas", () => {
    expect(defaultOpeningParameters("door")).toMatchObject({
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
      openingStyle: "hinged",
    });
    expect(defaultOpeningParameters("window")).toMatchObject({
      width: 1.2,
      height: 1.2,
      sillHeight: 0.9,
      openingStyle: "sliding",
    });
  });

  it("mantém altura + peitoril dentro da altura real da parede", () => {
    const opening = normalizeOpeningParameters("window", {
      height: 2.8,
      sillHeight: 2.2,
    });
    expect(opening.height + opening.sillHeight).toBeLessThanOrEqual(OPENING_WALL_HEIGHT);
    expect(opening.height).toBeGreaterThanOrEqual(0.5);
  });

  it("limita largura e offset para o vão permanecer dentro da parede", () => {
    const width = clampOpeningWidthForWall(4, 2);
    const left = clampOpeningOffset(0, width, 2);
    const right = clampOpeningOffset(1, width, 2);

    expect(width).toBeLessThan(2);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(1);
    expect(left).toBeCloseTo(1 - right, 6);
  });

  it("mantém todos os presets normalizáveis pelo mesmo contrato", () => {
    for (const preset of OPENING_PRESETS) {
      const normalized = normalizeOpeningParameters(preset.type, preset);
      expect(normalized.width).toBeGreaterThanOrEqual(0.5);
      expect(normalized.height).toBeGreaterThanOrEqual(0.5);
      expect(normalized.height + normalized.sillHeight).toBeLessThanOrEqual(OPENING_WALL_HEIGHT);
      expect(normalized.openingStyle).toBe(preset.openingStyle);
      expect(normalized.leafCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("normaliza a especificação técnica sem criar outro objeto de esquadria", () => {
    const normalized = normalizeOpeningParameters("window", {
      manufacturer: "  Fabricante X  ",
      productLine: " Linha 70 ",
      profile: " 70 mm ",
      frameMaterial: "pvc",
      frameColor: " Branco ",
      glassType: "insulated",
      glassThicknessMm: 20,
      leafCount: 2.6,
      unitCost: 1850.5,
      components: " Marco, folhas, ferragens ",
    });

    expect(normalized).toMatchObject({
      manufacturer: "Fabricante X",
      productLine: "Linha 70",
      profile: "70 mm",
      frameMaterial: "pvc",
      frameColor: "Branco",
      glassType: "insulated",
      glassThicknessMm: 20,
      leafCount: 3,
      unitCost: 1850.5,
      components: "Marco, folhas, ferragens",
    });
  });
});
