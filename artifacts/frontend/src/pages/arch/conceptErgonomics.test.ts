import { describe, expect, it } from "vitest";
import { evaluateConceptErgonomics, evaluateRoomErgonomics } from "./conceptErgonomics";
import { evaluateConceptAcceptance } from "./conceptAcceptance";
import type { ConceptRoomShape } from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 80 — Furniture & Ergonomics Gate", () => {
  it("reprova dormitório estreito mesmo quando a área total parece suficiente", () => {
    const result = evaluateRoomErgonomics(
      room({ id: "bed", kind: "quarto", label: "Quarto", width: 2.2, depth: 4.2 }),
    );

    expect(result.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id === "ergonomics-bed-quarto")).toBe(true);
  });

  it("aceita envelope funcional quando o quarto pode ser usado em orientação rotacionada", () => {
    const result = evaluateRoomErgonomics(
      room({ id: "bed", kind: "quarto", label: "Quarto", width: 3.1, depth: 2.8 }),
    );

    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("identifica banheiro sem envelope mínimo para louças e circulação", () => {
    const result = evaluateRoomErgonomics(
      room({ id: "bath", kind: "banheiro", label: "Banheiro", width: 1.1, depth: 2.4 }),
    );

    expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("leva ergonomia para o quality gate consolidado", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "bed", kind: "quarto", label: "Quarto", width: 2.2, depth: 4.2, x: 0, y: 0 }),
      ],
    });

    expect(result.ergonomics.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id.startsWith("ergonomics-"))).toBe(true);
  });

  it("calcula score global pelos ambientes que realmente exigem mobiliário", () => {
    const result = evaluateConceptErgonomics([
      room({ id: "living", kind: "sala", label: "Sala", width: 3.5, depth: 4 }),
      room({ id: "stairs", kind: "escada", label: "Escada", width: 1.2, depth: 4 }),
    ]);

    expect(result.score).toBe(100);
    expect(result.rooms.find((item) => item.roomId === "stairs")?.score).toBe(100);
  });
});
