import { prepareWallSolids, type SolidWall, type SolidOpening, type WallBox } from "./conceptWallSolids";
import { wallBoxesToMeshes, type IndexedWallMesh } from "./conceptWallBoxMesh";
import { buildOrthogonalWallUnion, type WallUnionResult } from "./conceptWallUnion";

export type WallMeshPipelineResult = {
  boxes: WallBox[];
  meshes: IndexedWallMesh[];
  warnings: string[];
  valid: boolean;
};

/**
 * Read-only adapter between parametric wall solids and indexed 3D geometry.
 * Warnings prevent the result from being advertised as a complete BIM model.
 * This is NOT a Boolean union, watertight building envelope, or persistence API.
 */
export function buildWallMeshPipeline(
  walls: SolidWall[],
  openings: SolidOpening[],
): WallMeshPipelineResult {
  const prepared = prepareWallSolids(walls, openings);
  const warnings = [...prepared.warnings];
  const meshes: IndexedWallMesh[] = [];

  for (const box of prepared.boxes) {
    try {
      const generated = wallBoxesToMeshes([box]);
      const mesh = generated[0];
      if (!mesh || mesh.positions.length !== 24 || mesh.indices.length !== 36 ||
          !mesh.positions.every(Number.isFinite) ||
          mesh.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= 8)) {
        warnings.push(`WALL_MESH_INVALID:${box.wallId}`);
        continue;
      }
      meshes.push(mesh);
    } catch {
      warnings.push(`WALL_MESH_INVALID:${box.wallId}`);
    }
  }

  return {
    boxes: prepared.boxes,
    meshes,
    warnings,
    valid: warnings.length === 0 && meshes.length === prepared.boxes.length,
  };
}

/**
 * Optional combined boundary. Keep this separate from per-wall pickable meshes
 * until integrated visual and editing tests verify junction selection semantics.
 */
export function buildWallUnionPipeline(walls: SolidWall[], openings: SolidOpening[]): WallUnionResult {
  const prepared = prepareWallSolids(walls, openings);
  if (prepared.warnings.length) return { meshes: [], warnings: prepared.warnings };
  return buildOrthogonalWallUnion(prepared.boxes);
}
