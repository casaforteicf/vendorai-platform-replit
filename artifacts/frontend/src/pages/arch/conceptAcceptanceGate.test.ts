import { describe, expect, it } from "vitest";
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

describe("Etapa 77 — quality gate do pré-projeto", () => {
  it("bloqueia alternativa com erro arquitetônico", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "suite", kind: "suite", label: "Suíte master", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "hall", kind: "circulacao", label: "Hall", x: 4, y: 0, width: 1.2, depth: 4 }),
        room({ id: "bath", kind: "banheiro", label: "Banheiro suíte master", x: 5.2, y: 0, width: 2, depth: 2.4 }),
      ],
    });

    expect(result.status).toBe("blocked");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it("exige revisão quando há aviso funcional importante", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        // Usa uma garagem estreita para isolar o warning de largura funcional.
        // Um quarto isolado introduz corretamente gates adicionais de acesso,
        // circulação e abertura natural, que não pertencem a este teste.
        room({ id: "garage", kind: "garagem", label: "Garagem", x: 0, y: 0, width: 2.1, depth: 5.5 }),
      ],
    });

    expect(result.status).toBe("review");
    expect(result.majorWarnings.some((issue) => issue.id.includes("functional-width-garage"))).toBe(true);
  });

  it("aprova uma solução simples sem erros ou avisos funcionais", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      ],
    });

    expect(result.status).toBe("approved");
    expect(result.score).toBe(100);
    expect(result.errors).toHaveLength(0);
  });

  it("bloqueia quando o acúmulo de problemas derruba o score", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 5,
      lotDepth: 5,
      floors: 1,
      rooms: [
        room({ id: "a", kind: "quarto", label: "Quarto A", x: 0, y: 0, width: 2, depth: 2 }),
        room({ id: "b", kind: "quarto", label: "Quarto B", x: 1, y: 1, width: 2, depth: 2 }),
        room({ id: "c", kind: "suite", label: "Suíte", x: 4, y: 4, width: 3, depth: 3 }),
      ],
    });

    expect(result.status).toBe("blocked");
    expect(result.score).toBeLessThan(60);
  });
});
