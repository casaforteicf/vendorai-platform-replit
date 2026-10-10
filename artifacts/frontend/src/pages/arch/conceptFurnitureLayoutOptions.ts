type Footprint = { kind: string; floor: number; x: number; y: number; width: number; depth: number; rotation: number };
const rounded = (value: number) => Math.round(value * 1000) / 1000;
function layoutKey(objects: readonly Footprint[]) {
  return JSON.stringify(objects.map(object => [object.kind, object.floor, rounded(object.x), rounded(object.y), rounded(object.width), rounded(object.depth), rounded(((object.rotation % 360) + 360) % 360)])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
/** Keep the best score for each distinct arrangement, independent of generated IDs. */
export function uniqueFurnitureLayouts<T extends { objects: Footprint[]; score: number }>(variants: T[], limit = 3): T[] {
  const seen = new Set<string>();
  return [...variants].sort((a, b) => b.score - a.score).filter(variant => {
    if (!variant.objects.length) return false;
    const key = layoutKey(variant.objects);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(0, Math.floor(limit)));
}
