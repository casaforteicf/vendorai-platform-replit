import { describe, expect, it } from "vitest";
import { measuredWallEnd } from "./conceptWallDrawing";

const bounds = { width: 12, depth: 30 };
describe("medidas exatas durante desenho de paredes", () => {
  it("aceita vírgula, zeros e centímetros sem arredondar para a grade", () => {
    expect(measuredWallEnd({ x: 1, y: 2 }, { x: 4, y: 2 }, "10,00", bounds)).toEqual({ end: { x: 11, y: 2 } });
    expect(measuredWallEnd({ x: 1, y: 2 }, { x: 4, y: 2 }, "4.12", bounds)).toEqual({ end: { x: 5.12, y: 2 } });
  });
  it("mantém direção e comprimento em paredes diagonais", () => {
    const result = measuredWallEnd({ x: 1, y: 2 }, { x: 4, y: 6 }, "5", bounds);
    expect(result).toEqual({ end: { x: 4, y: 6 } });
  });
  it("bloqueia uma medida fora da área em vez de encurtar a parede", () => {
    expect(measuredWallEnd({ x: 10, y: 2 }, { x: 11, y: 2 }, "4,20", bounds)).toHaveProperty("error");
  });
  it("exige direção explícita e rejeita comprimento inválido", () => {
    expect(measuredWallEnd({ x: 1, y: 2 }, { x: 1, y: 2 }, "4,20", bounds)).toHaveProperty("error");
    for (const input of ["", "0", "0,49", "4m", "NaN", "1,2.3"]) expect(measuredWallEnd({ x: 1, y: 2 }, { x: 4, y: 2 }, input, bounds)).toHaveProperty("error");
  });
});
