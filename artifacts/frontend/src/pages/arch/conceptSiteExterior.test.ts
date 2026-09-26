import { describe, expect, it } from "vitest";
import { buildSiteExteriorPlan } from "./conceptSiteExterior";
import { DEFAULT_SITE_PLACEMENT } from "./conceptSitePlacement";

describe("implantação externa completa · etapa 97", () => {
  it("gera acesso de veículos, pedestres, deck e jardim sem sair do lote", () => {
    const plan = buildSiteExteriorPlan([
      { kind: "sala", label: "Sala", x: 2, y: 5, width: 5, depth: 4 },
      { kind: "garagem", label: "Garagem", x: 8, y: 4, width: 4, depth: 5 },
      { kind: "gourmet", label: "Gourmet", x: 2, y: 12, width: 4, depth: 3 },
      { kind: "piscina", label: "Piscina", x: 7, y: 14, width: 5, depth: 3 },
    ], 15, 25, DEFAULT_SITE_PLACEMENT);

    expect(plan.zones.some((zone) => zone.kind === "driveway")).toBe(true);
    expect(plan.zones.some((zone) => zone.kind === "pedestrian")).toBe(true);
    expect(plan.zones.some((zone) => zone.kind === "deck")).toBe(true);
    expect(plan.zones.some((zone) => zone.kind === "pool_buffer")).toBe(true);
    expect(plan.zones.some((zone) => zone.kind === "garden")).toBe(true);
    for (const zone of plan.zones) {
      expect(zone.x).toBeGreaterThanOrEqual(0);
      expect(zone.y).toBeGreaterThanOrEqual(0);
      expect(zone.x + zone.width).toBeLessThanOrEqual(15.001);
      expect(zone.y + zone.depth).toBeLessThanOrEqual(25.001);
    }
  });

  it("não inventa piscina quando ela não existe", () => {
    const plan = buildSiteExteriorPlan([
      { kind: "sala", label: "Sala", x: 2, y: 5, width: 5, depth: 4 },
      { kind: "garagem", label: "Garagem", x: 8, y: 4, width: 4, depth: 5 },
    ], 15, 25, DEFAULT_SITE_PLACEMENT);

    expect(plan.hasPool).toBe(false);
    expect(plan.zones.some((zone) => zone.kind === "pool_buffer")).toBe(false);
  });
});
