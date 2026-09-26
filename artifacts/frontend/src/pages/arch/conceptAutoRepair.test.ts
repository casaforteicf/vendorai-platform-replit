import { describe, expect, it } from "vitest";
import { autoRepairConceptLayout } from "./conceptAutoRepair";
import type { ConceptRoomShape } from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 78 — Auto-Repair arquitetônico", () => {
  it("aproxima banheiro privativo da suíte quando existe posição válida", () => {
    const result = autoRepairConceptLayout({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "suite", kind: "suite", label: "Suíte master", x: 1, y: 1, width: 4, depth: 4 }),
        room({ id: "bath", kind: "banheiro", label: "Banheiro suíte master", x: 9, y: 8, width: 2, depth: 2.4 }),
      ],
    });

    expect(result.improved).toBe(true);
    expect(result.after.errors.length).toBeLessThan(result.before.errors.length);
    expect(result.actions.some((action) => action.type === "suite_bath" || action.type === "relayout")).toBe(true);
  });

  it("corrige ambiente que ultrapassa o limite do lote", () => {
    const result = autoRepairConceptLayout({
      lotWidth: 10,
      lotDepth: 10,
      floors: 1,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 8, y: 8, width: 4, depth: 4 }),
      ],
    });

    const living = result.rooms.find((item) => item.id === "living")!;
    expect(living.x + living.width).toBeLessThanOrEqual(10);
    expect(living.y + living.depth).toBeLessThanOrEqual(10);
    expect(result.after.errors.length).toBeLessThan(result.before.errors.length);
  });

  it("não aceita candidato que cria mais erros", () => {
    const result = autoRepairConceptLayout({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      ],
    });

    expect(result.after.errors.length).toBeLessThanOrEqual(result.before.errors.length);
    expect(result.after.score).toBeGreaterThanOrEqual(result.before.score);
  });

  it("ajusta largura funcional quando há espaço disponível", () => {
    const result = autoRepairConceptLayout({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 0, width: 2.1, depth: 3.2 }),
      ],
    });

    const bed = result.rooms.find((item) => item.id === "bed")!;
    expect(Math.min(bed.width, bed.depth)).toBeGreaterThanOrEqual(2.4);
    expect(result.after.score).toBeGreaterThan(result.before.score);
  });
});
