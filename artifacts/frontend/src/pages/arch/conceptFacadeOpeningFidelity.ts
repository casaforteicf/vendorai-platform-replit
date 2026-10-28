/**
 * Compare the old facade's generated opening list to a derived view built
 * with preserveOpeningGeometry=true. The test is geometric; not image QA.
 */
export type FacadeOpeningForFidelity = {
  id: string; floor: number; type: 'door' | 'window';
  axis: number; width: number; height: number; sillHeight: number;
};
export type FacadeOpeningIssue = {
  openingId: string;
  reason: 'MISSING' | 'NEW' | 'CHANGED' | 'DUPLICATE';
};
const METRE_TOLERANCE = 0.001;
const near = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= METRE_TOLERANCE;

export function compareFacadeOpeningFidelity(
  expected: { openings: FacadeOpeningForFidelity[] },
  rendered: { openings: FacadeOpeningForFidelity[] },
): { valid: boolean; issues: FacadeOpeningIssue[] } {
  const issues: FacadeOpeningIssue[] = [];
  const count = (arr: FacadeOpeningForFidelity[]) => {
    const map = new Map<string, number>();
    arr.forEach(item => map.set(item.id, (map.get(item.id) ?? 0) + 1));
    return map;
  };
  const expectedCount = count(expected.openings);
  const renderedCount = count(rendered.openings);
  const old = new Map(expected.openings.map(item => [item.id, item]));
  const now = new Map(rendered.openings.map(item => [item.id, item]));
  for (const [id, copies] of expectedCount) {
    if (copies !== 1 || (renderedCount.get(id) ?? 0) > 1)
      issues.push({ openingId: id, reason: 'DUPLICATE' });
    const source = old.get(id)!;
    const current = now.get(id);
    if (!current) {
      issues.push({ openingId: id, reason: 'MISSING' });
    } else if (current.floor !== source.floor || current.type !== source.type ||
      !near(current.axis, source.axis) || !near(current.width, source.width) ||
      !near(current.height, source.height) || !near(current.sillHeight, source.sillHeight)) {
      issues.push({ openingId: id, reason: 'CHANGED' });
    }
  }
  for (const id of renderedCount.keys()) {
    if (!expectedCount.has(id)) issues.push({ openingId: id, reason: 'NEW' });
  }
  return { valid: issues.length === 0, issues };
}
