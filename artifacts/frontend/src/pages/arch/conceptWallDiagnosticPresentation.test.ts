import { describe, expect, it } from "vitest";
import { describeWallDiagnostics } from "./conceptWallDiagnosticPresentation";
import type { ConceptWallDiagnostic } from "./conceptWallDiagnostics";

describe("apresentação do diagnóstico arquitetônico", () => {
  it("mapeia erros e permite identificar paredes afetadas", () => {
    const report: ConceptWallDiagnostic = {
      issues: [{ wallId: "w1", code: "OUTSIDE_LOT" }],
      overlaps: [{ firstWallId: "w1", secondWallId: "w2", floor: 0, start: { x: 1, y: 1 }, end: { x: 3, y: 1 }, length: 2 }],
      junctions: [{ firstWallId: "w2", secondWallId: "w3", floor: 0, x: 3, y: 1, kind: "tee" }],
      affectedWallIds: ["w1", "w2"], hasBlockingIssues: true,
    };
    const items = describeWallDiagnostics(report);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ label: "Parede fora dos limites do terreno", wallIds: ["w1"], severity: "error" });
    expect(items[1]).toMatchObject({ wallIds: ["w1", "w2"], severity: "error" });
    expect(items[2]).toMatchObject({ label: "Encontro em T", severity: "info" });
  });
});
