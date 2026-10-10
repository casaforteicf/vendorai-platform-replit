type Footprint = { kind: string; floor: number; x: number; y: number; width: number; depth: number; rotation: number };
const rounded = (value: number) => Math.round(value * 1000) / 1000;
function layoutKey(objects: readonly Footprint[]) {
  return JSON.stringify(objects.map(object => [object.kind, object.floor, rounded(object.x), rounded(object.y), rounded(object.width), rounded(object.depth), rounded(((object.rotation % 360) + 360) % 360)])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
/** Prefer fewer omitted items, then score; generated IDs do not distinguish arrangements. */
export function uniqueFurnitureLayouts<T extends { objects: Footprint[]; score: number; missingLabels?: string[] }>(variants: T[], limit = 3): T[] {
  const seen = new Set<string>();
  return [...variants].sort((a, b) => (a.missingLabels?.length ?? 0) - (b.missingLabels?.length ?? 0) || b.score - a.score).filter(variant => {
    if (!variant.objects.length) return false;
    const key = layoutKey(variant.objects);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(0, Math.floor(limit)));
}

/** Percentage of requested items actually present; this is not architectural quality. */
export function furnitureLayoutCompletion(option: { objects: readonly unknown[]; missingLabels: readonly string[] }): number {
  const total = option.objects.length + option.missingLabels.length;
  return total ? Math.round(option.objects.length / total * 100) : 0;
}
