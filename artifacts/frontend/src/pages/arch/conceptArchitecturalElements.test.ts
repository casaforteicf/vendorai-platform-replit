import { describe, it, expect } from "vitest";
import { createSlab, slabNetArea, createStraightStair, createRoof, openingSchedule } from "./conceptArchitecturalElements";

describe("laje paramétrica", () => {
  const slab = { id: "s1", floor: 0, x: 0, y: 0, width: 5, depth: 4, thickness: 0.15, elevation: 2.8, voids: [{ x: 1, y: 1, width: 1, depth: 2 }] };
  it("subtrai aberturas da área e preserva o modelo original", () => {
    const result = createSlab(slab);
    expect(result).toHaveProperty("value");
    if ("value" in result) {
      expect(slabNetArea(result.value)).toBe(18);
      result.value.voids[0].x = 2;
      expect(slab.voids[0].x).toBe(1);
    }
  });
  it("rejeita abertura externa ou sobreposta", () => {
    expect(createSlab({ ...slab, voids: [{ x: 4.5, y: 1, width: 1, depth: 1 }] })).toHaveProperty("error");
    expect(createSlab({ ...slab, voids: [slab.voids[0], { x: 1.5, y: 1.5, width: 1, depth: 1 }] })).toHaveProperty("error");
  });
});
describe("escada reta", () => {
  it("calcula espelhos e pisos sem deformar o desnível", () => {
    const result = createStraightStair({ id: "e", floor: 0, x: 0, y: 0, width: 1, run: 4.5, rise: 2.8 });
    expect(result).toHaveProperty("value");
    if ("value" in result) expect(result.value.steps * result.value.riser).toBeCloseTo(2.8);
  });
  it("rejeita desenvolvimento horizontal insuficiente", () => {
    expect(createStraightStair({ id: "e", floor: 0, x: 0, y: 0, width: 1, run: 1, rise: 2.8 })).toHaveProperty("error");
  });
});
describe("coberturas", () => {
  it("calcula cumeeira e beiral de duas águas", () => {
    const r = createRoof({ id: "r", x: 0, y: 0, width: 8, depth: 6, elevation: 3, overhang: 0.5, pitchDegrees: 30, type: "gable" });
    expect(r).toHaveProperty("value");
    if ("value" in r) {
      expect(r.value.ridgeHeight).toBeCloseTo(3 + 3 * Math.tan(Math.PI / 6));
      expect(r.value.footprint).toEqual({ x: -0.5, y: -0.5, width: 9, depth: 7 });
    }
  });
  it("rejeita inclinação incompatível em cobertura plana", () => {
    expect(createRoof({ id: "r", x: 0, y: 0, width: 8, depth: 6, elevation: 3, overhang: 0, pitchDegrees: 5, type: "flat" })).toHaveProperty("error");
  });
});
describe("quadro preliminar de esquadrias", () => {
  it("agrupa tipologias iguais preservando quantidade", () => {
    const result = openingSchedule([
      { id: "1", wallId: "w1", type: "window", width: 1.2, height: 1, sillHeight: 0.9, quantity: 1 },
      { id: "2", wallId: "w2", type: "window", width: 1.2, height: 1, sillHeight: 0.9, quantity: 2 },
      { id: "3", wallId: "w2", type: "door", width: 0.9, height: 2.1, sillHeight: 0, quantity: 1 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find(item => item.type === "window")?.quantity).toBe(3);
  });
});
