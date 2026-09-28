import { describe, expect, it } from "vitest";
import { fitReferenceImageToLot } from "../lib/arqdor-reference-calibration.js";

describe("Arqdor reference calibration", () => {
  it("preserva proporção e centraliza imagem horizontal dentro do lote", () => {
    const result = fitReferenceImageToLot(2000, 1000, 12, 30);
    expect(result.widthMeters).toBeCloseTo(12, 6);
    expect(result.depthMeters).toBeCloseTo(6, 6);
    expect(result.offsetX).toBeCloseTo(0, 6);
    expect(result.offsetY).toBeCloseTo(12, 6);
  });

  it("preserva proporção e centraliza imagem vertical dentro do lote", () => {
    const result = fitReferenceImageToLot(1000, 2000, 20, 10);
    expect(result.widthMeters).toBeCloseTo(5, 6);
    expect(result.depthMeters).toBeCloseTo(10, 6);
    expect(result.offsetX).toBeCloseTo(7.5, 6);
    expect(result.offsetY).toBeCloseTo(0, 6);
  });

  it("rejeita dimensões inválidas", () => {
    expect(() => fitReferenceImageToLot(0, 1000, 12, 30)).toThrow(/maiores que zero/i);
  });
});
