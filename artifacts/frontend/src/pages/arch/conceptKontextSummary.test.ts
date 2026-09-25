import { describe, expect, it } from "vitest";
import { buildConceptKontextSummary } from "./conceptRender";

describe("resumo curto do render", () => {
  const base = {
    floors: 2,
    facadeWidth: 12,
    facade: { style: "contemporaneo", roof: "platibanda", primaryMaterial: "pintura", accentMaterial: "madeira", facadeTone: "claro", frameTone: "preto", landscaping: "medio" } as never,
    facadeDesign: {
      surfaceMaterials: { main: "paint-offwhite", accent: "wood-natural", garage: "metal-black", entrance: "wood-natural", paving: "concrete-light", frames: "metal-black" },
      volumes: [], lighting: "day", showLandscaping: true,
    } as never,
    lightingMode: "night" as const,
    frontOpenings: [
      { floor: 0, type: "door" as const }, { floor: 0, type: "window" as const },
      { floor: 1, type: "window" as const }, { floor: 1, type: "window" as const },
    ],
    hasGarage: true,
  };

  it("cabe na janela de leitura do motor (bem abaixo de 512 tokens)", () => {
    const text = buildConceptKontextSummary(base);
    expect(text.length).toBeLessThan(900);
  });

  it("descreve materiais, aberturas por pavimento e a luz pedida", () => {
    const text = buildConceptKontextSummary(base);
    expect(text).toContain("off-white");
    expect(text).toContain("wood");
    expect(text).toContain("ground floor: 1 window, 1 door");
    expect(text).toContain("floor 2: 2 windows");
    expect(text).toMatch(/Light: night/);
  });
});
