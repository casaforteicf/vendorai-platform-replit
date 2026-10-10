import { expect, it } from "vitest";
import { reconcileWallOpenings } from "./conceptWallOpeningReconciliation";
const wall = { id: "w", x1: 0, y1: 0, x2: 4, y2: 0 };
const door = { id: "d", wallId: "w", type: "door" as const, offset: 0.25, width: 0.9 };
it("mantém distância ao início quando só o final muda", () => {
  const result = reconcileWallOpenings([wall], [{ ...wall, x2: 5 }], [door]);
  expect("openings" in result && result.openings[0].offset).toBe(0.2);
});
it("mantém distância ao final quando só o início muda", () => {
  const result = reconcileWallOpenings([wall], [{ ...wall, x1: -1 }], [door]);
  expect("openings" in result && result.openings[0].offset).toBe(0.4);
});
it("mantém posição relativa em translação de ambos os extremos", () => {
  const result = reconcileWallOpenings([wall], [{ ...wall, y1: 1, y2: 1 }], [door]);
  expect("openings" in result && result.openings[0].offset).toBe(0.25);
});
it("rejeita parede curta sem reduzir a largura da porta", () => {
  expect(reconcileWallOpenings([wall], [{ ...wall, x2: 0.8 }], [door])).toHaveProperty("error");
  expect(door.width).toBe(0.9);
});
it("rejeita encurtamento que aproxima duas aberturas até colidirem", () => {
  expect(reconcileWallOpenings([wall], [{ ...wall, x2: 1.4 }], [door, { ...door, id: "d2", offset: 0.75 }])).toHaveProperty("error");
});

it("rejeita encurtamento que exigiria deslocar silenciosamente uma abertura", () => {
  const nearEnd = { ...door, offset: 0.85 };
  const result = reconcileWallOpenings([wall], [{ ...wall, x2: 3.5 }], [nearEnd]);
  expect(result).toHaveProperty("error");
  expect(nearEnd.offset).toBe(0.85);
});
