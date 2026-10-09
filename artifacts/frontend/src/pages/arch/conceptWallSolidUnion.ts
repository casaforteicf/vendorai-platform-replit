import { splitWallVoids } from "./conceptWallVoids";
type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; thickness?: number };
type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
const epsilon = 1e-9;
function subtract(a: Box, b: Box): Box[] {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1);
  const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
  if (x1 - x0 <= epsilon || y1 - y0 <= epsilon || z1 - z0 <= epsilon) return [a];
  return [
    { ...a, x1: x0 }, { ...a, x0: x1 },
    { ...a, x0, x1, y1: y0 }, { ...a, x0, x1, y0: y1 },
    { x0, x1, y0, y1, z0: a.z0, z1: z0 }, { x0, x1, y0, y1, z0: z1, z1: a.z1 },
  ].filter(box => box.x1 - box.x0 > epsilon && box.y1 - box.y0 > epsilon && box.z1 - box.z0 > epsilon);
}

// A disjoint partition of the solid union; the first wall owns shared volumes.
// Diagonal walls retain their original pieces until general polygon union is available.
export function partitionOrthogonalWallSolids<W extends Wall>(walls: W[], openings: Parameters<typeof splitWallVoids>[1], height: number) {
  const occupied: Box[] = [];
  const result: ReturnType<typeof splitWallVoids<W>> = [];
  for (const wall of walls) {
    const horizontal = Math.abs(wall.y2 - wall.y1) < epsilon;
    const vertical = Math.abs(wall.x2 - wall.x1) < epsilon;
    const pieces = splitWallVoids(wall, openings, height);
    if (!horizontal && !vertical) { result.push(...pieces); continue; }
    for (const piece of pieces) {
      const thickness = Math.max(0.08, piece.wall.thickness ?? 0.15);
      const box = { x0: Math.min(piece.wall.x1, piece.wall.x2) - (vertical ? thickness / 2 : 0), x1: Math.max(piece.wall.x1, piece.wall.x2) + (vertical ? thickness / 2 : 0), y0: Math.min(piece.wall.y1, piece.wall.y2) - (horizontal ? thickness / 2 : 0), y1: Math.max(piece.wall.y1, piece.wall.y2) + (horizontal ? thickness / 2 : 0), z0: piece.zMin, z1: piece.zMax };
      let remaining = [box];
      for (const previous of occupied) {
        remaining = remaining.flatMap(candidate => subtract(candidate, previous));
        if (!remaining.length) break;
      }
      for (const part of remaining) {
        const segment = horizontal
          ? { ...piece.wall, x1: part.x0, x2: part.x1, y1: (part.y0 + part.y1) / 2, y2: (part.y0 + part.y1) / 2, thickness: part.y1 - part.y0 }
          : { ...piece.wall, x1: (part.x0 + part.x1) / 2, x2: (part.x0 + part.x1) / 2, y1: part.y0, y2: part.y1, thickness: part.x1 - part.x0 };
        result.push({ ...piece, wall: segment, zMin: part.z0, zMax: part.z1 });
        occupied.push(part);
      }
    }
  }
  return result;
}
