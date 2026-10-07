import { describe, expect, it } from "vitest";
import { buildImportedArchitectural3DProfile } from "../lib/arqdor-imported-3d.js";

describe("Arqdor imported architectural 3D profile", () => {
  it("converte inclinação percentual da cobertura em graus e usa altura explícita do corte", () => {
    const preview = buildImportedArchitectural3DProfile({
      memory: {
        summary: "Projeto técnico",
        projectType: "residencial",
        totalAreaM2: 377.23,
        floors: 1,
        rooms: [],
        openings: [],
        materials: [],
        roof: {
          material: "telha shingle",
          slopePercent: 60,
          type: "cobertura aparente",
        },
        technicalNotes: [],
        inconsistencies: [],
        sourcePages: [],
        floorPlans: [],
        facades: [{
          page: 3,
          label: "Fachada frontal",
          orientation: "front",
          confidence: 0.95,
          style: null,
          materials: [{ name: "tijolinho natural branco" }],
          openings: [],
          architecturalFeatures: [{ kind: "arch" }],
          heights: [],
          evidence: ["elevação frontal"],
        }],
        sections: [{
          page: 2,
          label: "Corte AA",
          confidence: 0.95,
          levels: [],
          heights: [{ peDireitoM: 2.8 }],
          roof: { slopePercent: 60, material: "telha shingle" },
          evidence: ["cota vertical explícita"],
        }],
      },
    });

    expect(preview.canApply).toBe(true);
    expect(preview.floors[0]?.wallHeightM).toBe(2.8);
    expect(preview.roof.slopePercent).toBe(60);
    expect(preview.roof.pitchDegrees).toBeCloseTo(30.964, 2);
    expect(preview.facades[0]?.orientation).toBe("front");
  });

  it("não inventa altura quando o corte não fornece medida vertical", () => {
    const preview = buildImportedArchitectural3DProfile({
      memory: {
        summary: "",
        projectType: null,
        totalAreaM2: null,
        floors: 1,
        rooms: [],
        openings: [],
        materials: [],
        roof: null,
        technicalNotes: [],
        inconsistencies: [],
        sourcePages: [],
        floorPlans: [],
        facades: [],
        sections: [{
          page: 2,
          label: "Corte",
          confidence: 0.8,
          levels: [],
          heights: [],
          roof: null,
          evidence: [],
        }],
      },
    });

    expect(preview.floors[0]?.wallHeightM).toBeNull();
    expect(preview.canApply).toBe(false);
    expect(preview.warnings.length).toBeGreaterThan(0);
  });
});
