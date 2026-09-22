import { describe, expect, it } from "vitest";
import {
  isConstructionRelevantSegment,
  isProspectorSourceEnabled,
  prospectorSourceCatalogForTenant,
  resolveProspectorEnabledSources,
} from "./prospector-sources.js";

describe("Prospector source catalog", () => {
  it("keeps universal implemented/manual sources enabled by default", () => {
    const enabled = resolveProspectorEnabledSources(undefined, "farmácia");
    expect(enabled).toContain("google_places");
    expect(enabled).toContain("cnpj_cnae");
    expect(enabled).toContain("meta_ads");
    expect(enabled).toContain("revenue_scout");
    expect(enabled).toContain("imported_lists");
    expect(enabled).not.toContain("construction_radar");
    expect(enabled).not.toContain("linkedin");
  });

  it("recommends and enables Radar de Obras only for compatible segments by default", () => {
    expect(isConstructionRelevantSegment("Construtora residencial")).toBe(true);
    expect(isConstructionRelevantSegment("Esquadrias de PVC")).toBe(true);
    expect(isConstructionRelevantSegment("Farmácia")).toBe(false);

    const construction = resolveProspectorEnabledSources(undefined, "Arquitetura e interiores");
    expect(construction).toContain("construction_radar");

    const pharmacy = prospectorSourceCatalogForTenant({
      enabled: resolveProspectorEnabledSources(undefined, "Farmácia"),
      segment: "Farmácia",
    });
    expect(pharmacy.find((source) => source.key === "construction_radar")?.visible).toBe(false);
  });

  it("honors explicit tenant choices without enabling planned providers", () => {
    const enabled = resolveProspectorEnabledSources(
      ["google_places", "construction_radar", "linkedin", "invalid"],
      "Farmácia",
    );
    expect(enabled).toEqual(["google_places", "construction_radar"]);
    expect(isProspectorSourceEnabled("construction_radar", enabled, "Farmácia")).toBe(true);
    expect(isProspectorSourceEnabled("linkedin", enabled, "Farmácia")).toBe(false);
  });

  it("keeps explicitly enabled Radar visible even outside construction", () => {
    const catalog = prospectorSourceCatalogForTenant({
      enabled: ["construction_radar"],
      segment: "Distribuidora",
    });
    const radar = catalog.find((source) => source.key === "construction_radar");
    expect(radar?.visible).toBe(true);
    expect(radar?.recommended).toBe(false);
    expect(radar?.enabled).toBe(true);
  });
});
