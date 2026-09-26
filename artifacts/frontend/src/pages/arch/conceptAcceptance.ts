import { validateConceptLayout, type ConceptRoomShape, type LayoutIssue } from "./conceptGeometry";
import { evaluateConceptErgonomics, type ErgonomicResult } from "./conceptErgonomics";

export type ConceptAcceptanceStatus = "approved" | "review" | "blocked";

export type ConceptAcceptanceResult = {
  status: ConceptAcceptanceStatus;
  score: number;
  issues: LayoutIssue[];
  errors: LayoutIssue[];
  warnings: LayoutIssue[];
  majorWarnings: LayoutIssue[];
  blockingIssueIds: string[];
  ergonomics: ErgonomicResult;
};

const MAJOR_WARNING_PREFIXES = [
  "private-access-",
  "natural-opening-",
  "functional-width-",
  "circulation-missing-",
  "service-private-adjacency-",
  "garage-access-",
];

function isMajorWarning(issue: LayoutIssue) {
  return issue.severity === "warning" && MAJOR_WARNING_PREFIXES.some((prefix) => issue.id.includes(prefix));
}

/**
 * Etapa 77 — gate único de aceite do pré-projeto.
 *
 * Regras:
 * - qualquer erro geométrico/funcional bloqueia a alternativa;
 * - avisos funcionais relevantes exigem revisão;
 * - acúmulo de avisos também impede "aprovação silenciosa";
 * - score é explicativo e nunca substitui as issues detalhadas.
 */
export function evaluateConceptAcceptance(input: {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  floors: number;
  site?: { frontSide?: "top" | "bottom" | "left" | "right"; setbackFront?: number };
}): ConceptAcceptanceResult {
  const issues: LayoutIssue[] = [];

  for (let floor = 0; floor < Math.max(1, input.floors); floor += 1) {
    issues.push(
      ...validateConceptLayout(input.rooms, input.lotWidth, input.lotDepth, floor, input.site)
        .map((issue) => ({
          ...issue,
          id: `floor-${floor}-${issue.id}`,
          message: `Pavimento ${floor + 1}: ${issue.message}`,
        })),
    );
  }

  const ergonomics = evaluateConceptErgonomics(input.rooms);
  for (const ergonomic of ergonomics.issues) {
    issues.push({
      id: ergonomic.id,
      severity: ergonomic.severity,
      roomId: ergonomic.roomId,
      message: ergonomic.message,
    });
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const majorWarnings = warnings.filter(isMajorWarning);

  const rawScore =
    100
    - errors.length * 30
    - majorWarnings.length * 12
    - (warnings.length - majorWarnings.length) * 5;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  let status: ConceptAcceptanceStatus = "approved";
  if (errors.length > 0 || score < 60) {
    status = "blocked";
  } else if (majorWarnings.length > 0 || warnings.length >= 3 || score < 85) {
    status = "review";
  }

  return {
    status,
    score,
    issues,
    errors,
    warnings,
    majorWarnings,
    blockingIssueIds: errors.map((issue) => issue.id),
    ergonomics,
  };
}
