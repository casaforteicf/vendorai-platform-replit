type Opening = { offset: number; width?: number; type: "door" | "window"; height?: number; sillHeight?: number };
const size = (o: Opening) => o.width ?? (o.type === "door" ? 0.9 : 1.2);
const bottom = (o: Opening) => o.type === "door" ? 0 : o.sillHeight ?? 0.9;
const top = (o: Opening) => bottom(o) + (o.height ?? (o.type === "door" ? 2.1 : 1.2));
export function openingFitsWall(candidate: Opening, length: number) {
  const half = size(candidate) / 2;
  const center = candidate.offset * length;
  return Number.isFinite(length) && Number.isFinite(center) && Number.isFinite(half) && half > 0 && center - half >= -1e-9 && center + half <= length + 1e-9;
}
export function openingsOverlap(a: Opening, b: Opening, length: number) {
  return Math.abs(a.offset - b.offset) * length < (size(a) + size(b)) / 2 - 1e-9 && bottom(a) < top(b) - 1e-9 && bottom(b) < top(a) - 1e-9;
}
export function openingPlacementError(candidate: Opening, existing: Opening[], length: number): string | null {
  const height = candidate.height ?? (candidate.type === "door" ? 2.1 : 1.2);
  const sill = bottom(candidate);
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(sill) || sill < 0) return "As medidas da abertura são inválidas.";
  if (!openingFitsWall(candidate, length)) return "A abertura não cabe nessa posição da parede.";
  if (existing.some(other => openingsOverlap(candidate, other, length))) return "A abertura sobrepõe outra abertura.";
  return null;
}
export function convertedOpening<T extends Opening>(opening: T, type: Opening["type"]): T & { openingStyle: "hinged" | "sliding" } {
  return {
    ...opening, type,
    width: type === "door" ? Math.min(opening.width ?? 0.9, 1.4) : Math.max(opening.width ?? 1.2, 0.8),
    height: type === "door" ? 2.1 : 1.2,
    sillHeight: type === "door" ? 0 : 0.9,
    openingStyle: type === "door" ? "hinged" : "sliding",
  };
}
export function freeOpeningOffset(candidate: Opening, existing: Opening[], length: number): number | null {
  if (!Number.isFinite(length) || length < size(candidate) + 0.1) return null;
  const half = size(candidate) / 2;
  const centers = [candidate.offset * length, length / 2, half + 0.05, length - half - 0.05];
  for (const opening of existing) {
    centers.push(opening.offset * length + size(opening) / 2 + half + 0.1);
    centers.push(opening.offset * length - size(opening) / 2 - half - 0.1);
  }
  centers.sort((a, b) => Math.abs(a - candidate.offset * length) - Math.abs(b - candidate.offset * length));
  for (const center of centers) {
    if (center - half < 0.05 - 1e-9 || center + half > length - 0.05 + 1e-9) continue;
    const offset = center / length;
    if (!existing.some(o => openingsOverlap({ ...candidate, offset }, o, length))) return offset;
  }
  return null;
}
