import { describe, expect, it } from "vitest";
import { identifyWallJunctions } from "./conceptWallTopologyDiagnostics";

describe("pré-projeto: diagnóstico de encontros por pavimento", () => {
  it("detecta um cruzamento em quatro segmentos sem alterar paredes", () => {
    const walls = [
      { id: "h", floor: 0, x1: 0, y1: 2, x2: 4, y2: 2 },
      { id: "v", floor: 0, x1: 2, y1: 0, x2: 2, y2: 4 },
    ];
    const snapshot = JSON.stringify(walls);
    expect(identifyWallJunctions(walls).find((node) => node.x === 2 && node.y === 2))
      .toMatchObject({ floor: 0, kind: "cross", segmentCount: 4, sourceWallIds: ["h", "v"] });
    expect(JSON.stringify(walls)).toBe(snapshot);
  });

  it("detecta encontro T e mantém os pavimentos isolados", () => {
    const walls = [
      { id: "h", floor: 0, x1: 0, y1: 2, x2: 4, y2: 2 },
      { id: "v", floor: 0, x1: 2, y1: 0, x2: 2, y2: 2 },
      { id: "upper", floor: 1, x1: 0, y1: 2, x2: 4, y2: 2 },
    ];
    const nodes = identifyWallJunctions(walls);
    expect(nodes.find((node) => node.floor === 0 && node.x === 2 && node.y === 2)?.kind).toBe("tee");
    expect(nodes.filter((node) => node.floor === 1)).toHaveLength(2);
    expect(nodes.every((node) => node.floor !== 1 || node.kind === "end")).toBe(true);
  });
});
