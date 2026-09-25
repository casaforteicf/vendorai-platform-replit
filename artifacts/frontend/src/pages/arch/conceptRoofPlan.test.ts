import { describe, expect, it } from "vitest";
import { buildRoofPlan } from "./conceptRoofPlan";

const area = (items: Array<{ width: number; height: number }>) => items.reduce((sum, item) => sum + item.width * item.height, 0);

describe("cobertura por pavimento", () => {
  it("térrea: laje cobre toda a planta e platibanda contorna só o perímetro", () => {
    const plan = buildRoofPlan([{ floor: 0, cells: [{ x: 0, y: 0, width: 5, height: 4 }, { x: 5, y: 0, width: 3, height: 4 }] }]);
    expect(area(plan.slabs)).toBeCloseTo(32, 1);
    const perimeter = plan.edges.reduce((sum, edge) => sum + Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1), 0);
    expect(perimeter).toBeCloseTo(24, 1);
  });

  it("sobrado: térreo sob o pavimento superior não recebe laje; parte descoberta recebe", () => {
    const plan = buildRoofPlan([
      { floor: 0, cells: [{ x: 0, y: 0, width: 8, height: 10 }] },
      { floor: 1, cells: [{ x: 0, y: 0, width: 8, height: 6 }] },
    ]);
    expect(area(plan.slabs.filter((slab) => slab.floor === 0))).toBeCloseTo(32, 1);
    expect(area(plan.slabs.filter((slab) => slab.floor === 1))).toBeCloseTo(48, 1);
    // platibanda do térreo não passa por baixo da parede do superior
    const groundEdges = plan.edges.filter((edge) => edge.floor === 0);
    expect(groundEdges.every((edge) => Math.max(edge.y1, edge.y2) >= 6 - 0.01)).toBe(true);
  });
});

describe("junção das lajes", () => {
  it("um cômodo retangular vira uma única laje", () => {
    const plan = buildRoofPlan([{ floor: 0, cells: [{ x: 0, y: 0, width: 4, height: 3 }] }]);
    expect(plan.slabs).toHaveLength(1);
  });
});

describe("vazio interno", () => {
  it("escada cercada por cômodos recebe laje e não gera platibanda em volta", () => {
    const cells = [
      { x: 0, y: 0, width: 6, height: 2 },
      { x: 0, y: 4, width: 6, height: 2 },
      { x: 0, y: 2, width: 2, height: 2 },
      { x: 4, y: 2, width: 2, height: 2 },
    ];
    const plan = buildRoofPlan([{ floor: 0, cells }]);
    expect(area(plan.slabs)).toBeCloseTo(36, 1);
    const perimeter = plan.edges.reduce((sum, edge) => sum + Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1), 0);
    expect(perimeter).toBeCloseTo(24, 1);
  });
});
