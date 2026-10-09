import { openingsOverlap, openingFitsWall } from "./conceptOpeningPlacement";
type Wall = { id: string; x1: number; y1: number; x2: number; y2: number };
type Opening = { id: string; wallId: string; offset: number; type: "door" | "window"; width?: number; height?: number; sillHeight?: number };
export function reconcileWallOpenings<T extends Opening>(before: Wall[], after: Wall[], openings: T[]): { openings: T[] } | { error: string } {
  const updated = new Map<string, T>();
  for (const next of after) {
    const previous = before.find(w => w.id === next.id);
    if (!previous) continue;
    const startChanged = Math.hypot(next.x1 - previous.x1, next.y1 - previous.y1) > 0.001;
    const endChanged = Math.hypot(next.x2 - previous.x2, next.y2 - previous.y2) > 0.001;
    if (!startChanged && !endChanged) continue;
    const oldLength = Math.hypot(previous.x2 - previous.x1, previous.y2 - previous.y1);
    const length = Math.hypot(next.x2 - next.x1, next.y2 - next.y1);
    const attached = openings.filter(o => o.wallId === next.id);
    const candidates: T[] = [];
    for (const opening of attached) {
      const width = opening.width ?? (opening.type === "door" ? 0.9 : 1.2);
      if (!Number.isFinite(length) || length < Math.max(0.5, width + 0.1)) return { error: "A parede ficaria curta demais para suas aberturas." };
      let offset = opening.offset;
      if (startChanged && !endChanged) offset = 1 - (1 - offset) * oldLength / length;
      if (endChanged && !startChanged) offset = offset * oldLength / length;
      const half = width / 2 / length;
      offset = Math.max(half, Math.min(1 - half, offset));
      const candidate = { ...opening, offset };
      if (!openingFitsWall(candidate, length) || candidates.some(other => openingsOverlap(candidate, other, length))) return { error: "Essa alteração faria as aberturas se sobreporem." };
      candidates.push(candidate);
      updated.set(candidate.id, candidate);
    }
  }
  return { openings: openings.map(o => updated.get(o.id) ?? o) };
}
