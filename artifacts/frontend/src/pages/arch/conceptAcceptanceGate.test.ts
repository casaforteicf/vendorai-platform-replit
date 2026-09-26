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
        // Usa uma lavanderia estreita para isolar o warning de largura funcional.
        // Diferente de dormitórios, cozinha ou garagem, ela não introduz aqui
        // um erro adicional de acesso, abertura natural ou manobra de veículo.
        room({ id: "laundry", kind: "lavanderia", label: "Lavanderia", x: 0, y: 0, width: 1.45, depth: 3 }),
      ],
    });

    expect(result.status).toBe("review");
    expect(result.majorWarnings.some((issue) => issue.id.includes("functional-width-laundry"))).toBe(true);
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
