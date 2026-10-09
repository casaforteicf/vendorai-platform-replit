import { describe, expect, it } from "vitest";
import { convertedOpening, openingPlacementError } from "./conceptOpeningPlacement";

describe("conversão de portas e janelas", () => {
  it("valida a largura final da janela antes de substituir uma porta estreita", () => {
    const door = { type: "door" as const, offset: 0.1, width: 0.5 };
    expect(openingPlacementError(door, [], 3)).toBeNull();
    expect(openingPlacementError(convertedOpening(door, "window"), [], 3)).toContain("não cabe");
    expect(door.width).toBe(0.5);
  });
  it("detecta colisão vertical criada ao converter janela alta em porta", () => {
    const upper = { type: "window" as const, offset: 0.5, width: 1, height: 0.5, sillHeight: 2.2 };
    const lower = { type: "window" as const, offset: 0.5, width: 1, height: 0.8, sillHeight: 0.5 };
    expect(openingPlacementError(upper, [lower], 4)).toBeNull();
    expect(openingPlacementError(convertedOpening(upper, "door"), [lower], 4)).toContain("sobrepõe");
  });
  it("define peitoril e estilo coerentes ao converter", () => {
    const window = convertedOpening({ type: "door", offset: 0.5, width: 1 }, "window");
    expect(window).toMatchObject({ type: "window", height: 1.2, sillHeight: 0.9, openingStyle: "sliding" });
    expect(convertedOpening(window, "door")).toMatchObject({ type: "door", height: 2.1, sillHeight: 0, openingStyle: "hinged" });
  });
  it("rejeita medidas verticais inválidas", () => {
    expect(openingPlacementError({ type: "window", offset: 0.5, height: NaN }, [], 4)).toContain("inválidas");
    expect(openingPlacementError({ type: "window", offset: 0.5, sillHeight: -1 }, [], 4)).toContain("inválidas");
  });
});
