import { describe, expect, it } from "vitest";
import { evaluateProjectMasterAcceptance } from "../lib/arqdor-project-master-validation.js";

describe("Projeto Mestre — gate server-side", () => {
  it("bloqueia sobreposição e ambiente isolado", () => {
    const result = evaluateProjectMasterAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        { id: "sala", kind: "sala", label: "Sala", floor: 0, x: 1, y: 1, width: 5, depth: 4 },
        { id: "cozinha", kind: "cozinha", label: "Cozinha", floor: 0, x: 4, y: 2, width: 3, depth: 3 },
        { id: "quarto", kind: "quarto", label: "Quarto", floor: 0, x: 9, y: 12, width: 2.8, depth: 3 },
      ],
    });
    expect(result.status).toBe("blocked");
    expect(result.blockingIssueIds.some((id) => id.startsWith("overlap-"))).toBe(true);
    expect(result.blockingIssueIds.some((id) => id.startsWith("isolated-"))).toBe(true);
  });

  it("bloqueia banheiro de suíte separado", () => {
    const result = evaluateProjectMasterAcceptance({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      rooms: [
        { id: "sala", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 5, depth: 4 },
        { id: "suite", kind: "suite", label: "Suíte casal", floor: 0, x: 5, y: 0, width: 4, depth: 4 },
        { id: "banho", kind: "banheiro", label: "Banheiro suíte casal", floor: 0, x: 9, y: 6, width: 1.5, depth: 2.2 },
      ],
    });
    expect(result.status).toBe("blocked");
    expect(result.errors.some((issue) => issue.id.startsWith("suite-bath-adjacency-"))).toBe(true);
  });

  it("mantém avisos funcionais como revisão, sem aprovar silenciosamente", () => {
    const result = evaluateProjectMasterAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [
        { id: "sala", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 5, depth: 4 },
        { id: "q1", kind: "quarto", label: "Quarto 1", floor: 0, x: 5, y: 0, width: 2.2, depth: 3 },
        { id: "q2", kind: "quarto", label: "Quarto 2", floor: 0, x: 7.2, y: 0, width: 2.2, depth: 3 },
      ],
    });
    expect(result.status).not.toBe("approved");
    expect(result.majorWarnings.length).toBeGreaterThan(0);
  });
});
