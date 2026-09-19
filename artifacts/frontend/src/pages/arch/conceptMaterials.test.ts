import { describe, expect, it } from "vitest";
import {
  conceptFloorMaterial,
  defaultConceptMaterialScheme,
  legacyFacadePrimaryMaterial,
  materialFromLibrary,
  materialOptionsFor,
  normalizeConceptMaterialScheme,
  sanitizeConceptMaterialSchemeForFloors,
  uniqueSchemeMaterials,
} from "./conceptMaterials";

describe("concept materials", () => {
  it("cria esquema completo de materiais", () => {
    const scheme = defaultConceptMaterialScheme();
    expect(scheme.floor.id).toBeTruthy();
    expect(scheme.interiorWall.id).toBeTruthy();
    expect(scheme.exteriorWall.id).toBeTruthy();
    expect(scheme.roof.id).toBeTruthy();
    expect(scheme.stair.id).toBeTruthy();
  });

  it("permite piso diferente por pavimento sem duplicar a regra geral", () => {
    const defaults = defaultConceptMaterialScheme();
    const wood = materialOptionsFor("floor").find((item) => item.pattern === "wood")!;
    const scheme = normalizeConceptMaterialScheme({
      ...defaults,
      floorByLevel: { "1": wood },
    });
    expect(conceptFloorMaterial(scheme, 0).id).toBe(defaults.floor.id);
    expect(conceptFloorMaterial(scheme, 1).id).toBe(wood.id);
  });

  it("normaliza cores inválidas e gloss", () => {
    const defaults = defaultConceptMaterialScheme();
    const scheme = normalizeConceptMaterialScheme({
      ...defaults,
      roof: { ...defaults.roof, color: "red", gloss: 9 },
    });
    expect(scheme.roof.color).toBe(defaults.roof.color);
    expect(scheme.roof.gloss).toBe(1);
  });

  it("resolve materiais da biblioteca inicial", () => {
    const defaults = defaultConceptMaterialScheme();
    const stone = materialOptionsFor("exteriorWall").find((item) => item.pattern === "stone")!;
    expect(materialFromLibrary(stone.id, defaults.exteriorWall).id).toBe(stone.id);
  });

  it("espelha o material externo para o campo legado da fachada", () => {
    const stone = materialOptionsFor("exteriorWall").find((item) => item.pattern === "stone")!;
    const concrete = materialOptionsFor("exteriorWall").find((item) => item.pattern === "concrete")!;
    expect(legacyFacadePrimaryMaterial(stone)).toBe("pedra");
    expect(legacyFacadePrimaryMaterial(concrete)).toBe("concreto");
  });

  it("remove overrides de piso de pavimentos que não existem mais", () => {
    const defaults = defaultConceptMaterialScheme();
    const wood = materialOptionsFor("floor").find((item) => item.pattern === "wood")!;
    const sanitized = sanitizeConceptMaterialSchemeForFloors({
      ...defaults,
      floorByLevel: { "0": wood, "2": wood },
    }, 2);
    expect(sanitized.floorByLevel["0"]?.id).toBe(wood.id);
    expect(sanitized.floorByLevel["2"]).toBeUndefined();
  });

  it("retorna materiais únicos para sincronização com arq_materials", () => {
    const scheme = defaultConceptMaterialScheme();
    const unique = uniqueSchemeMaterials(scheme);
    expect(new Set(unique.map((item) => item.id)).size).toBe(unique.length);
  });
});
