import type { EditableWall } from "./conceptParametricEditing";

/** Validação não destrutiva. Nunca corrige ou descarta geometria automaticamente. */
export type WallPreflightIssue = {
  wallId: string;
  code: "INVALID_LOT" | "INVALID_WALL_ID" | "DUPLICATE_ID" | "INVALID_COORDINATE" | "OUTSIDE_LOT" | "ZERO_LENGTH" | "INVALID_THICKNESS" | "INVALID_FLOOR" | "INVALID_TOLERANCE";
};

export function validateConceptWalls(
  walls: readonly EditableWall[],
  lotWidth: number,
  lotDepth: number,
  tolerance = 0.001,
): WallPreflightIssue[] {
  const issues: WallPreflightIssue[] = [];
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 0.01) {
    return [{ wallId: "", code: "INVALID_TOLERANCE" }];
  }
  if (!Number.isFinite(lotWidth) || !Number.isFinite(lotDepth) || lotWidth <= 0 || lotDepth <= 0) {
    return [{ wallId: "", code: "INVALID_LOT" }];
  }
  const seen = new Set<string>();
  for (const wall of walls) {
    const id = wall.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      issues.push({ wallId: id ?? "", code: "INVALID_WALL_ID" });
    } else if (seen.has(id)) {
      issues.push({ wallId: id, code: "DUPLICATE_ID" });
    }
    if (typeof id === "string" && id.trim().length > 0) seen.add(id);
    if (!Number.isInteger(wall.floor) || wall.floor < 0) {
      issues.push({ wallId: id, code: "INVALID_FLOOR" });
    }
    const coords = [wall.x1, wall.y1, wall.x2, wall.y2];
    if (coords.some((v) => !Number.isFinite(v))) {
      issues.push({ wallId: id, code: "INVALID_COORDINATE" });
      continue;
    }
    if (
      wall.x1 < -tolerance || wall.x2 < -tolerance ||
      wall.y1 < -tolerance || wall.y2 < -tolerance ||
      wall.x1 > lotWidth + tolerance || wall.x2 > lotWidth + tolerance ||
      wall.y1 > lotDepth + tolerance || wall.y2 > lotDepth + tolerance
    ) issues.push({ wallId: id, code: "OUTSIDE_LOT" });
    if (Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) <= tolerance)
      issues.push({ wallId: id, code: "ZERO_LENGTH" });
    if (wall.thickness !== undefined &&
      (!Number.isFinite(wall.thickness) || wall.thickness < 0.08 || wall.thickness > 0.5))
      issues.push({ wallId: id, code: "INVALID_THICKNESS" });
  }
  return issues;
}
