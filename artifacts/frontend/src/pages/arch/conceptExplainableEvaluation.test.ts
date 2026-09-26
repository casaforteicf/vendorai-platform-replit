import { describe, expect, it } from "vitest";
import { evaluateConceptAcceptance } from "./conceptAcceptance";
import { autoRepairConceptLayout } from "./conceptAutoRepair";
import { buildExplainableFindings } from "./conceptExplainableEvaluation";
import type { ConceptRoomShape } from "./conceptGeometry";

describe("avaliação arquitetônica explicável · etapa 99", () => {
  it("explica problema, impacto e correção encontrada pelo auto-repair", () => {
    const rooms: ConceptRoomShape[] = [
      { id: "sala", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 4, depth: 4 },
      { id: "quarto", kind: "quarto", label: "Quarto", floor: 0, x: 4, y: 0, width: 2.2, depth: 3.4 },
    ];
    const acceptance = evaluateConceptAcceptance({ rooms, lotWidth: 12, lotDepth: 20, floors: 1 });
    const repair = autoRepairConceptLayout({ rooms, lotWidth: 12, lotDepth: 20, floors: 1, maxPasses: 2 });
    const findings = buildExplainableFindings(acceptance, repair);

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.problem.length > 0)).toBe(true);
    expect(findings.every((finding) => finding.impact.length > 0)).toBe(true);
    expect(findings.every((finding) => finding.proposal.length > 0)).toBe(true);
  });

  it("só marca como acionável quando existe correção melhor e vinculada ao problema", () => {
    const rooms: ConceptRoomShape[] = [
      { id: "sala", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 4, depth: 4 },
      { id: "suite", kind: "suite", label: "Suíte casal", floor: 0, x: 4, y: 0, width: 3.2, depth: 3.2 },
      { id: "banho", kind: "banheiro", label: "Banheiro suíte casal", floor: 0, x: 8.5, y: 8, width: 1.4, depth: 2.2 },
    ];
    const acceptance = evaluateConceptAcceptance({ rooms, lotWidth: 14, lotDepth: 20, floors: 1 });
    const repair = autoRepairConceptLayout({ rooms, lotWidth: 14, lotDepth: 20, floors: 1, maxPasses: 3 });
    const findings = buildExplainableFindings(acceptance, repair);
    const actionable = findings.filter((finding) => finding.actionable);

    if (repair.improved && repair.actions.length) {
      expect(actionable.length).toBeGreaterThan(0);
      expect(actionable.some((finding) => finding.exactChanges.length > 0)).toBe(true);
    } else {
      expect(actionable).toHaveLength(0);
    }
  });
});
