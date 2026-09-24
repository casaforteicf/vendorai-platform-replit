import { describe, expect, it } from "vitest";
import {
  buildConceptGeometry,
  nudgeOpening,
  validateConceptLayout,
  type ConceptRoomShape,
} from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("conceptGeometry stability", () => {
  it("creates a door between adjacent rooms and excludes pools from wall geometry", () => {
    const rooms = [
      room({ id: "sala", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "cozinha", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
      room({ id: "pool", kind: "piscina", label: "Piscina", x: 8, y: 0, width: 5, depth: 3 }),
    ];

    const geometry = buildConceptGeometry(rooms, 20, 20, 0);

    expect(geometry.openings.some((opening) => opening.type === "door")).toBe(true);
    expect(geometry.walls.some((wall) => wall.roomIds.includes("pool"))).toBe(false);
  });

  it("flags rooms outside the lot and overlapping rooms", () => {
    const rooms = [
      room({ id: "a", kind: "sala", label: "Sala", x: 8, y: 8, width: 4, depth: 4 }),
      room({ id: "b", kind: "cozinha", label: "Cozinha", x: 9, y: 9, width: 3, depth: 3 }),
    ];

    const issues = validateConceptLayout(rooms, 10, 10, 0);

    expect(issues.some((issue) => issue.id === "outside-a")).toBe(true);
    expect(issues.some((issue) => issue.id === "outside-b")).toBe(true);
    expect(issues.some((issue) => issue.id === "overlap-a-b")).toBe(true);
  });

  it("requires stairs when another floor exists", () => {
    const rooms = [
      room({ id: "ground", kind: "sala", label: "Sala", floor: 0 }),
      room({ id: "upper", kind: "quarto", label: "Quarto", floor: 1 }),
    ];

    const issues = validateConceptLayout(rooms, 20, 20, 0);
    expect(issues.some((issue) => issue.id === "stair-missing-0")).toBe(true);
  });

  it("flags misaligned stairs between floors", () => {
    const rooms = [
      room({ id: "stair-0", kind: "escada", label: "Escada térrea", floor: 0, x: 1, y: 1, width: 2, depth: 4 }),
      room({ id: "stair-1", kind: "escada", label: "Escada superior", floor: 1, x: 8, y: 8, width: 2, depth: 4 }),
    ];

    const issues = validateConceptLayout(rooms, 20, 20, 1);
    expect(issues.some((issue) => issue.id === "stair-align-stair-1")).toBe(true);
  });

  it("keeps opening nudges inside lot bounds", () => {
    const horizontal = nudgeOpening(
      { id: "w1", type: "window", x: 9.8, y: 2, orientation: "horizontal", roomId: "a" },
      5,
      10,
      10,
    );
    const vertical = nudgeOpening(
      { id: "w2", type: "window", x: 2, y: 0.2, orientation: "vertical", roomId: "a" },
      -5,
      10,
      10,
    );

    expect(horizontal.x).toBe(10);
    expect(vertical.y).toBe(0);
  });
});

describe("validação da garagem com recuo e frente do lote", () => {
  it("não acusa garagem logo após o recuo frontal", () => {
    const rooms = [{ id: "g", kind: "garagem", label: "Garagem", floor: 0, x: 1.5, y: 4, width: 5.8, depth: 5.5 }];
    const issues = validateConceptLayout(rooms as never, 12, 30, 0, { frontSide: "top", setbackFront: 4 });
    expect(issues.some((issue) => issue.id.startsWith("garage-access"))).toBe(false);
  });

  it("mede a partir do lado da frente escolhido", () => {
    const rooms = [{ id: "g", kind: "garagem", label: "Garagem", floor: 0, x: 1.5, y: 20.5, width: 5.8, depth: 5.5 }];
    expect(validateConceptLayout(rooms as never, 12, 30, 0, { frontSide: "bottom", setbackFront: 4 })
      .some((issue) => issue.id.startsWith("garage-access"))).toBe(false);
    expect(validateConceptLayout(rooms as never, 12, 30, 0, { frontSide: "top", setbackFront: 4 })
      .some((issue) => issue.id.startsWith("garage-access"))).toBe(true);
  });
});
