/** Older editors omit parametric geometry; only an explicit snapshot may replace it. */
export function preserveArchitecturalSnapshot(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const next = { ...incoming };
  if (next.architecturalModel === undefined && current.architecturalModel !== undefined) {
    next.architecturalModel = current.architecturalModel;
  }
  return next;
}
