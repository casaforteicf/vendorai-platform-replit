import { describe, expect, it } from "vitest";
import { validateArchitecturalConcept, type ArchitecturalValidationInput } from "./conceptValidation";

function baseInput(patch: Partial<ArchitecturalValidationInput> = {}): ArchitecturalValidationInput {
  return {
    rooms: [],
    walls: [],
    lotWidth: 12,
    lotDepth: 20,
    floor: 0,
    floors: 1,
    wallFirstActive: false,
    wallCount: 0,
    spaces: [],
    openings: [],
    objects: [],
    ...patch,
  };
}

describe("architectural concept validation", () => {
  it("não exige nova escada no último pavimento", () => {
    const issues = validateArchitecturalConcept(baseInput({
      floor: 1,
      floors: 2,
      rooms: [
        { id: "s", kind: "sala", label: "Sala", floor: 1, x: 0, y: 0, width: 4, depth: 4 },
      ],
    }));
    expect(issues.some((issue) => issue.id === "stair-required-1")).toBe(false);
  });

  it("exige escada quando existe pavimento acima", () => {
    const issues = validateArchitecturalConcept(baseInput({
      floors: 2,
      rooms: [
        { id: "s", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 4, depth: 4 },
        { id: "q", kind: "quarto", label: "Quarto", floor: 1, x: 0, y: 0, width: 3, depth: 3 },
      ],
    }));
    expect(issues.some((issue) => issue.id === "stair-required-0")).toBe(true);
  });

  it("detecta móvel atravessando uma parede", () => {
    const issues = validateArchitecturalConcept(baseInput({
      rooms: [{ id: "s", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 6, depth: 6 }],
      walls: [{ id: "w", x1: 3, y1: 0, x2: 3, y2: 6, thickness: 0.15 }],
      objects: [
        { id: "a", name: "Sofá", category: "estar", symbol: "sofa", floor: 0, x: 3, y: 3, width: 2, depth: 1, height: 0.8, rotationDeg: 0 },
      ],
    }));
    expect(issues.some((issue) => issue.id === "object-wall-a-w")).toBe(true);
  });

  it("detecta colisão real entre móveis", () => {
    const issues = validateArchitecturalConcept(baseInput({
      rooms: [{ id: "s", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 8, depth: 8 }],
      objects: [
        { id: "a", name: "Sofá", category: "estar", symbol: "sofa", floor: 0, x: 3, y: 3, width: 2, depth: 1, height: 0.8, rotationDeg: 0 },
        { id: "b", name: "Rack", category: "armazenamento", symbol: "wardrobe", floor: 0, x: 3.2, y: 3, width: 1.8, depth: 0.5, height: 0.6, rotationDeg: 0 },
      ],
    }));
    expect(issues.some((issue) => issue.id === "object-collision-a-b")).toBe(true);
  });

  it("não trata cadeira sob mesa como colisão estrutural", () => {
    const issues = validateArchitecturalConcept(baseInput({
      rooms: [{ id: "s", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 8, depth: 8 }],
      objects: [
        { id: "a", name: "Mesa", category: "jantar", symbol: "table", floor: 0, x: 3, y: 3, width: 1.8, depth: 0.9, height: 0.76, rotationDeg: 0 },
        { id: "b", name: "Cadeira", category: "jantar", symbol: "chair", floor: 0, x: 3, y: 3.3, width: 0.48, depth: 0.52, height: 0.88, rotationDeg: 0 },
      ],
    }));
    expect(issues.some((issue) => issue.id === "object-collision-a-b")).toBe(false);
  });

  it("detecta vãos sobrepostos na mesma parede", () => {
    const issues = validateArchitecturalConcept(baseInput({
      openings: [
        { id: "d1", type: "door", x: 2, y: 0, orientation: "horizontal", roomId: "r", wallId: "w", width: 0.9 },
        { id: "d2", type: "door", x: 2.4, y: 0, orientation: "horizontal", roomId: "r", wallId: "w", width: 0.9 },
      ],
    }));
    expect(issues.some((issue) => issue.id === "opening-overlap-d1-d2")).toBe(true);
  });

  it("detecta móvel interferindo na faixa de uma porta", () => {
    const issues = validateArchitecturalConcept(baseInput({
      rooms: [{ id: "s", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 6, depth: 6 }],
      openings: [
        { id: "d1", type: "door", x: 3, y: 0, orientation: "horizontal", roomId: "s", width: 0.9 },
      ],
      objects: [
        { id: "a", name: "Sofá", category: "estar", symbol: "sofa", floor: 0, x: 3, y: 0.5, width: 1.8, depth: 0.7, height: 0.8, rotationDeg: 0 },
      ],
    }));
    expect(issues.some((issue) => issue.id === "door-clearance-d1-a")).toBe(true);
  });

  it("aplica referências dimensionais sem tratá-las como erro bloqueante", () => {
    const issues = validateArchitecturalConcept(baseInput({
      rooms: [{ id: "q", kind: "quarto", label: "Quarto", floor: 0, x: 0, y: 0, width: 2.1, depth: 3, }],
    }));
    const dimension = issues.find((issue) => issue.id === "dimension-width-room-q");
    expect(dimension?.severity).toBe("warning");
  });

  it("aponta parede livre sem nenhum espaço fechado", () => {
    const issues = validateArchitecturalConcept(baseInput({
      wallFirstActive: true,
      wallCount: 1,
      walls: [{ id: "w", x1: 0, y1: 0, x2: 4, y2: 0 }],
    }));
    expect(issues.some((issue) => issue.id === "wall-first-no-space-0")).toBe(true);
  });

  it("valida espaços de parede livre sem depender dos rooms legados", () => {
    const issues = validateArchitecturalConcept(baseInput({
      wallFirstActive: true,
      wallCount: 4,
      spaces: [{
        id: "space-1",
        label: "Circulação",
        kind: "circulacao",
        area: 3,
        centroid: { x: 1, y: 2 },
        bounds: { x: 0, y: 0, width: 0.7, height: 4 },
        cells: [{ x: 0, y: 0, width: 0.7, height: 4 }],
      }],
    }));
    expect(issues.some((issue) => issue.id === "dimension-width-space-space-1")).toBe(true);
  });
});
