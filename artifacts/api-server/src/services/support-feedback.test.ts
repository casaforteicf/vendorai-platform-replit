import { describe, expect, it } from "vitest";
import {
  classifySupportResolution,
  extractSupportRating,
} from "./support-feedback.js";

describe("support feedback flow", () => {
  it("classifica confirmação de resolução", () => {
    expect(classifySupportResolution("Sim, resolveu")).toBe("sim");
    expect(classifySupportResolution("Melhorou parcialmente")).toBe("parcial");
    expect(classifySupportResolution("Não resolveu")).toBe("nao");
  });

  it("lê nota final sem confundir código AST", () => {
    expect(extractSupportRating("5")).toBe(5);
    expect(extractSupportRating("NOTA 4 AST-ABC12-9XYZ")).toBe(4);
    expect(extractSupportRating("AST-ABC12-9XYZ")).toBeNull();
  });

  it("não aceita nota fora da escala CSAT 1 a 5", () => {
    expect(extractSupportRating("nota 10")).toBeNull();
    expect(extractSupportRating("0")).toBeNull();
  });
});
