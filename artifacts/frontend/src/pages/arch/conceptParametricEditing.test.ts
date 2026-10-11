import { describe, expect, it } from "vitest";
import {
  clampObjectToLot,
  clampRoomToLot,
  clampWallToLot,
  normalizeOpeningDimensions,
  sameRoomIdentity,
} from "./conceptParametricEditing";

describe("edição paramétrica segura · etapa 98", () => {
  it("reduz o lote sem perder IDs nem deixar ambientes para fora", () => {
    const before = [
      { id: "sala", kind: "sala", label: "Sala", floor: 0, x: 8, y: 18, width: 6, depth: 6 },
      { id: "suite", kind: "suite", label: "Suíte", floor: 0, x: 1, y: 1, width: 4, depth: 4 },
    ];
    const after = before.map((room) => clampRoomToLot(room, 10, 20));

    expect(sameRoomIdentity(before, after)).toBe(true);
    expect(after[0].x + after[0].width).toBeLessThanOrEqual(10);
    expect(after[0].y + after[0].depth).toBeLessThanOrEqual(20);
  });

  it("mantém paredes e objetos dentro do terreno", () => {
    const wall = clampWallToLot(
      { id: "w1", floor: 0, x1: -2, y1: 3, x2: 20, y2: 30, thickness: 1 },
      12,
      25,
    );
    const object = clampObjectToLot(
      { id: "sofa", x: 11.5, y: 24.5, width: 3, depth: 1.2 },
      12,
      25,
    );

    expect(wall.x1).toBe(0);
    expect(wall.x2).toBe(12);
    expect(wall.y2).toBe(25);
    expect(wall.thickness).toBe(0.5);
    expect(object.x + object.width).toBeLessThanOrEqual(12);
    expect(object.y + object.depth).toBeLessThanOrEqual(25);
  });

  it("usa 15 cm apenas como espessura inicial e preserva medidas existentes", () => {
    const base = { id: "parede", floor: 0, x1: 1, y1: 1, x2: 5, y2: 1 };
    expect(clampWallToLot(base, 10, 10).thickness).toBe(0.15);
    expect(clampWallToLot({ ...base, thickness: 0 }, 10, 10).thickness).toBe(0.15);
    expect(clampWallToLot({ ...base, thickness: Number.NaN }, 10, 10).thickness).toBe(0.15);
    expect(clampWallToLot({ ...base, thickness: 0.14 }, 10, 10).thickness).toBe(0.14);
    expect(clampWallToLot({ ...base, thickness: 0.2 }, 10, 10).thickness).toBe(0.2);
    expect(clampWallToLot({ ...base, thickness: 0.04 }, 10, 10).thickness).toBe(0.08);
  });

  it("normaliza portas e janelas sem parâmetros fisicamente inválidos", () => {
    const door = normalizeOpeningDimensions({ type: "door", width: 10, height: 5, sillHeight: 1 });
    const window = normalizeOpeningDimensions({ type: "window", width: 0.1, height: 0.1, sillHeight: 5 });

    expect(door.width).toBe(4);
    expect(door.height).toBe(2.8);
    expect(door.sillHeight).toBe(0);
    expect(window.width).toBe(0.5);
    expect(window.height).toBe(0.5);
    expect(window.sillHeight).toBe(2.2);
  });
});
