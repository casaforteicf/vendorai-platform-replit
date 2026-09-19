import { describe, expect, it } from "vitest";
import {
  CONCEPT_OBJECT_PRESETS,
  conceptObjectCorners,
  createConceptObjectFromPreset,
  normalizeConceptObject,
  normalizeObjectRotation,
  sanitizeConceptObjectForPersistence,
} from "./conceptObjects";

describe("concept objects", () => {
  it("normaliza rotação em 0–360", () => {
    expect(normalizeObjectRotation(450)).toBe(90);
    expect(normalizeObjectRotation(-90)).toBe(270);
  });

  it("cria objeto a partir de um único preset", () => {
    const preset = CONCEPT_OBJECT_PRESETS.find((item) => item.id === "bed-queen")!;
    const object = createConceptObjectFromPreset(preset, 1, 4, 5, "obj-1");
    expect(object.presetId).toBe("bed-queen");
    expect(object.floor).toBe(1);
    expect(object.width).toBe(1.58);
  });

  it("mantém o objeto dentro do terreno considerando rotação", () => {
    const object = normalizeConceptObject({
      id: "obj-1",
      name: "Mesa",
      category: "jantar",
      symbol: "table",
      floor: 0,
      x: 0,
      y: 0,
      width: 2,
      depth: 1,
      height: 0.76,
      rotationDeg: 90,
    }, 10, 10);
    expect(object.x).toBeGreaterThanOrEqual(0.5);
    expect(object.y).toBeGreaterThanOrEqual(1);
  });

  it("preserva espaço durante a edição e limpa no salvamento", () => {
    const editing = normalizeConceptObject({
      id: "obj-1",
      name: "Mesa ",
      category: "jantar",
      symbol: "table",
      floor: 0,
      x: 3,
      y: 3,
      width: 1,
      depth: 1,
      height: 0.7,
      rotationDeg: 0,
      material: " madeira ",
    }, 10, 10);
    expect(editing.name).toBe("Mesa ");
    const persisted = sanitizeConceptObjectForPersistence(editing, 10, 10);
    expect(persisted.name).toBe("Mesa");
    expect(persisted.material).toBe("madeira");
  });

  it("reduz um objeto rotacionado grande para caber no terreno", () => {
    const object = normalizeConceptObject({
      id: "obj-large",
      name: "Grande",
      category: "decoracao",
      symbol: "generic",
      floor: 0,
      x: 5,
      y: 5,
      width: 10,
      depth: 10,
      height: 1,
      rotationDeg: 45,
    }, 10, 10);
    const corners = conceptObjectCorners(object);
    expect(Math.min(...corners.map((point) => point.x))).toBeGreaterThanOrEqual(-0.0001);
    expect(Math.max(...corners.map((point) => point.x))).toBeLessThanOrEqual(10.0001);
    expect(Math.min(...corners.map((point) => point.y))).toBeGreaterThanOrEqual(-0.0001);
    expect(Math.max(...corners.map((point) => point.y))).toBeLessThanOrEqual(10.0001);
  });

  it("gera o mesmo footprint rotacionado consumido por 2D e 3D", () => {
    const object = {
      id: "obj-1",
      name: "Sofá",
      category: "estar" as const,
      symbol: "sofa" as const,
      floor: 0,
      x: 5,
      y: 5,
      width: 2,
      depth: 1,
      height: 0.8,
      rotationDeg: 90,
    };
    const corners = conceptObjectCorners(object);
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 6);
  });
});
