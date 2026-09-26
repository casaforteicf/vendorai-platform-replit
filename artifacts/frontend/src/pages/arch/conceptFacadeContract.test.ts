import { describe, expect, it } from "vitest";
import { buildFacadeGeometryContract } from "./conceptFacadeContract";

describe("contrato geométrico da fachada · etapa 95", () => {
  it("deriva a fachada da geometria real e preserva aberturas/cobertura", () => {
    const contract = buildFacadeGeometryContract({
      placement: {
        frontSide: "top",
        setbacks: { front: 4, rear: 2, left: 1.5, right: 1.5 },
      } as any,
      roof: "platibanda",
      rooms: [
        { id: "sala", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 5, depth: 4 },
        { id: "garagem", kind: "garagem", label: "Garagem", floor: 0, x: 5, y: 0, width: 5, depth: 4 },
      ] as any,
      levels: [{
        floor: 0,
        walls: [
          { id: "w-front", x1: 0, y1: 0, x2: 10, y2: 0 },
          { id: "w-back", x1: 0, y1: 4, x2: 10, y2: 4 },
        ],
        customWalls: [],
        closedSpaces: [],
        openings: [
          { id: "win-1", type: "window", orientation: "horizontal", x: 2.5, y: 0, width: 2, height: 1.4, sillHeight: 0.8 },
          { id: "door-1", type: "door", orientation: "horizontal", x: 7.5, y: 0, width: 2.4, height: 2.2, sillHeight: 0 },
        ],
        labels: {},
        stairs: [],
      }] as any,
    });

    expect(contract.version).toBe("master_facade_v1");
    expect(contract.frontSide).toBe("top");
    expect(contract.roof).toBe("platibanda");
    expect(contract.derivedFacade.floors).toBe(1);
    expect(contract.derivedFacade.width).toBeCloseTo(10);
    expect(contract.openings).toHaveLength(2);
    expect(contract.openings.map((item) => item.id)).toEqual(["win-1", "door-1"]);
    expect(contract.roomFootprints).toHaveLength(2);
  });

  it("não inclui piscina como volume construído da fachada", () => {
    const contract = buildFacadeGeometryContract({
      placement: {
        frontSide: "top",
        setbacks: { front: 4, rear: 2, left: 1.5, right: 1.5 },
      } as any,
      roof: "aparente",
      rooms: [
        { id: "casa", kind: "sala", label: "Sala", floor: 0, x: 1, y: 1, width: 6, depth: 5 },
        { id: "pool", kind: "piscina", label: "Piscina", floor: 0, x: 1, y: 12, width: 6, depth: 3 },
      ] as any,
      levels: [{
        floor: 0,
        walls: [{ id: "w", x1: 1, y1: 1, x2: 7, y2: 1 }],
        customWalls: [],
        closedSpaces: [],
        openings: [],
        labels: {},
        stairs: [],
      }] as any,
    });

    expect(contract.roomFootprints.map((room) => room.id)).toEqual(["casa"]);
    expect(contract.roof).toBe("aparente");
  });
});
