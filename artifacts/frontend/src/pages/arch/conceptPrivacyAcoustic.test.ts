import { describe, expect, it } from "vitest";
import { evaluatePrivacyAcousticZoning } from "./conceptPrivacyAcoustic";
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

describe("Etapa 84 — Privacy, Views & Acoustic Zoning", () => {
  it("penaliza dormitório compartilhando parede com garagem", () => {
    const result = evaluatePrivacyAcousticZoning([
      room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 0, width: 3, depth: 3 }),
      room({ id: "garage", kind: "garagem", label: "Garagem", x: 3, y: 0, width: 5.5, depth: 5.5 }),
    ], 12, 20);

    expect(result.issues.some((issue) => issue.id === "acoustic-adjacency-bed-garage" && issue.severity === "error")).toBe(true);
  });

  it("alerta suíte exposta muito próxima da frente do lote", () => {
    const result = evaluatePrivacyAcousticZoning([
      room({ id: "suite", kind: "suite", label: "Suíte", x: 1, y: 0.4, width: 3.5, depth: 3.5 }),
    ], 12, 20, { frontSide: "top" });

    expect(result.issues.some((issue) => issue.id === "privacy-front-exposure-suite")).toBe(true);
  });

  it("reconhece afastamento positivo entre dormitório e área social", () => {
    const result = evaluatePrivacyAcousticZoning([
      room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 10, width: 3, depth: 3 }),
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
    ], 12, 20);

    expect(result.strengths.some((item) => item.includes("bom afastamento"))).toBe(true);
  });

  it("integra privacidade/acústica ao acceptance gate", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 0, width: 3, depth: 3 }),
        room({ id: "garage", kind: "garagem", label: "Garagem", x: 3, y: 0, width: 5.5, depth: 5.5 }),
      ],
      site: { frontSide: "top" },
    });

    expect(result.privacyAcoustic.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id.startsWith("acoustic-adjacency-"))).toBe(true);
  });
});
