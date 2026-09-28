import { describe, expect, it } from "vitest";
import { buildConceptDxf, conceptDxfFilename } from "../lib/arqdor-concept-dxf.js";

describe("Arqdor Concept DXF", () => {
  it("exporta paredes, ambientes, aberturas e textos por pavimento em milímetros", () => {
    const dxf = buildConceptDxf({
      title: "Casa Teste",
      rooms: [
        { id: "sala", label: "Sala", kind: "sala", floor: 0, x: 1, y: 2, width: 4, depth: 3 },
      ],
      customWalls: [
        { id: "w1", floor: 0, x1: 1, y1: 2, x2: 5, y2: 2, thickness: 0.14 },
      ],
      customOpenings: [
        { id: "o1", wallId: "w1", floor: 0, offset: 0.5, width: 1.2, type: "door" },
      ],
    });

    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("ARQ_PAREDES_P1");
    expect(dxf).toContain("ARQ_ABERTURAS_P1");
    expect(dxf).toContain("ARQ_TEXTOS_P1");
    expect(dxf).toContain("\n1000\n");
    expect(dxf).toContain("\n5000\n");
    expect(dxf).toContain("\nSala\n");
    expect(dxf.endsWith("0\nEOF\n")).toBe(true);
  });

  it("usa contorno dos ambientes quando ainda não existem paredes customizadas", () => {
    const dxf = buildConceptDxf({
      rooms: [{ label: "Quarto", floor: 1, x: 0, y: 0, width: 3, depth: 3 }],
      customWalls: [],
      customOpenings: [],
    });

    expect(dxf).toContain("ARQ_PAREDES_P2");
    expect(dxf).toContain("ARQ_TEXTOS_P2");
  });

  it("gera nome de arquivo seguro", () => {
    expect(conceptDxfFilename("Casa São João / V2")).toBe("casa_sao_joao_v2.dxf");
  });
});
