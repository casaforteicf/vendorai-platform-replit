import type { EditableWall } from "./conceptParametricEditing";
import { validateConceptWalls, type WallPreflightIssue } from "./conceptWallPreflight";
import { inspectWallNetwork, type WallOverlap } from "./conceptWallNetworkInspection";
import type { WallJunction } from "./conceptWallJunctions";

export type ConceptWallDiagnostic = {
  issues: WallPreflightIssue[];
  junctions: WallJunction[];
  overlaps: WallOverlap[];
  affectedWallIds: string[];
  hasBlockingIssues: boolean;
};

/** Computed view-model for the editor. Does not alter or persist the model. */
export function buildConceptWallDiagnostics(
  walls: readonly EditableWall[],
  bounds: { width: number; depth: number },
): ConceptWallDiagnostic {
  const issues = validateConceptWalls(walls, bounds.width, bounds.depth);
  const { junctions, overlaps } = inspectWallNetwork(walls);
  const affected = new Set<string>();
  for (const issue of issues) if (issue.wallId) affected.add(issue.wallId);
  for (const item of overlaps) {
    affected.add(item.firstWallId);
    affected.add(item.secondWallId);
  }
  return {
    issues,
    junctions,
    overlaps,
    affectedWallIds: [...affected].sort(),
    hasBlockingIssues: issues.length > 0 || overlaps.length > 0,
  };
}
