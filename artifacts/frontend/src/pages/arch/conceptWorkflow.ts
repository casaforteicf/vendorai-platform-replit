export type ConceptIssueLike = {
  severity: "error" | "warning";
};

export function blockingConceptIssues<T extends ConceptIssueLike>(issues: T[]): T[] {
  return issues.filter((issue) => issue.severity === "error");
}

export function canAdvanceConceptLayout(issues: ConceptIssueLike[]): boolean {
  return blockingConceptIssues(issues).length === 0;
}

export function buildCompletedRenderPatch<T extends Record<string, unknown>>(conceptRender: T) {
  return {
    currentStep: 5,
    conceptRender,
  } as const;
}
