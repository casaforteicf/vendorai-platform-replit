type Furniture = { kind: string; label?: string; floor: number; x: number; y: number; width: number; depth: number; rotation: number };
const solidKinds = new Set(["sofa", "bed", "table", "chair", "cabinet", "appliance", "sanitary", "outdoor"]);
function corners(object: Furniture) {
  const angle = object.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const cx = object.x + object.width / 2, cy = object.y + object.depth / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({
    x: cx + sx * object.width / 2 * cos - sy * object.depth / 2 * sin,
    y: cy + sx * object.width / 2 * sin + sy * object.depth / 2 * cos,
  }));
}
function isSolid(object: Furniture) {
  return solidKinds.has(object.kind) && [object.floor, object.x, object.y, object.width, object.depth, object.rotation].every(Number.isFinite) && object.width > 0 && object.depth > 0;
}
/** Rectangular footprints; touching edges are permitted. */
export function furnitureOverlaps(a: Furniture, b: Furniture): boolean {
  if (!isSolid(a) || !isSolid(b) || a.floor !== b.floor) return false;
  const first = corners(a), second = corners(b);
  for (const polygon of [first, second]) {
    for (let i = 0; i < 2; i++) {
      const edge = { x: polygon[i + 1].x - polygon[i].x, y: polygon[i + 1].y - polygon[i].y };
      const length = Math.hypot(edge.x, edge.y);
      const axis = { x: -edge.y / length, y: edge.x / length };
      const project = (points: typeof first) => points.map(point => point.x * axis.x + point.y * axis.y);
      const pa = project(first), pb = project(second);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-8) return false;
    }
  }
  return true;
}
export function furnitureLayoutCollisionError(proposed: Furniture[], existing: Furniture[]): string | null {
  for (let i = 0; i < proposed.length; i++) {
    const object = proposed[i];
    const collision = [...existing, ...proposed.slice(0, i)].find(other => furnitureOverlaps(object, other));
    if (collision) return `O layout sobrepõe ${object.label || "um móvel"} a ${collision.label || "outro móvel"}. Ajuste os móveis existentes ou gere outra opção.`;
  }
  return null;
}

/** Require a clear band around solid furniture, in its local orientation. */
export function furnitureHasClearance(a: Furniture, b: Furniture, gap: number): boolean {
  if (!Number.isFinite(gap) || gap < 0) return false;
  return !furnitureOverlaps({ ...a, x: a.x - gap, y: a.y - gap, width: a.width + gap * 2, depth: a.depth + gap * 2 }, b);
}
