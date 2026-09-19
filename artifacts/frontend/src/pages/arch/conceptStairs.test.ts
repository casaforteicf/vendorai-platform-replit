import { describe, expect, it } from "vitest";
import {
  buildStairLandings,
  buildStairSlabOpenings,
  buildStairTreads,
  normalizeStairParameters,
  riserCountForTargetHeight,
  stairFootprintMetrics,
} from "./conceptStairs";

const stair = {
  id: "stair-1",
  floor: 0,
  x: 2,
  y: 3,
  width: 2.2,
  depth: 4.8,
};

describe("concept stairs", () => {
  it("usa U como configuração inicial para o envelope padrão da escada", () => {
    const params = normalizeStairParameters(stair);
    expect(params.stairShape).toBe("u");
  });

  it("deriva espelho e quantidade de pisos do mesmo contrato", () => {
    const params = normalizeStairParameters({
      ...stair,
      stairFloorToFloorHeight: 2.96,
      stairRiserCount: 17,
    });
    expect(params.riserHeight).toBeCloseTo(2.96 / 17, 6);
    expect(params.treadCount).toBe(16);
  });

  it("não permite altura piso a piso menor que a altura estrutural atual", () => {
    expect(normalizeStairParameters({ ...stair, stairFloorToFloorHeight: 2.4 }).stairFloorToFloorHeight).toBe(2.96);
  });

  it("recalcula degraus a partir de um espelho desejado", () => {
    expect(riserCountForTargetHeight(2.96, 0.175)).toBe(17);
  });

  it("gera os degraus 2D/3D a partir da mesma escada", () => {
    const treads = buildStairTreads({
      ...stair,
      stairShape: "straight" as const,
      stairDirection: "north" as const,
    });
    expect(treads.length).toBe(16);
    expect(treads[0].rise).toBeGreaterThan(0);
    expect(treads[treads.length - 1].rise).toBeLessThan(2.96);
  });

  it("gera abertura de laje vinculada ao pavimento superior", () => {
    const openings = buildStairSlabOpenings({
      ...stair,
      stairShape: "l" as const,
    });
    expect(openings.length).toBeGreaterThanOrEqual(3);
    expect(openings.every((opening) => opening.sourceFloor === 0 && opening.targetFloor === 1)).toBe(true);
    expect(openings.every((opening) => opening.width > 0 && opening.depth > 0)).toBe(true);
  });

  it("faz o patamar alterar a geometria compartilhada", () => {
    const compact = buildStairLandings({ ...stair, stairShape: "l" as const, stairLandingDepth: 0.8 });
    const wide = buildStairLandings({ ...stair, stairShape: "l" as const, stairLandingDepth: 1.4 });
    expect(compact.length).toBe(1);
    expect(wide[0].width * wide[0].depth).toBeGreaterThan(compact[0].width * compact[0].depth);
  });

  it("detecta quando o desenvolvimento disponível não comporta o piso especificado", () => {
    const metrics = stairFootprintMetrics({
      ...stair,
      depth: 2,
      stairTreadDepth: 0.36,
      stairRiserCount: 20,
    });
    expect(metrics.fitsTreadDepth).toBe(false);
  });
});
