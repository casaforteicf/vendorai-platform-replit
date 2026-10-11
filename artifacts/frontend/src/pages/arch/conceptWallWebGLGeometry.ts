import type { IndexedWallMesh } from "./conceptWallBoxMesh";

/** Maps architectural (x, y-plan, z-elevation) to Three.js (x, y-up, z-depth).
 * Reflection of one axis requires flipping triangle winding to keep normals outward.
 */
export function wallMeshToWebGL(mesh: IndexedWallMesh, lotWidth: number, lotDepth: number) {
  if (![lotWidth, lotDepth].every(Number.isFinite) || lotWidth <= 0 || lotDepth <= 0 ||
      mesh.positions.length % 3 !== 0 || mesh.indices.length % 3 !== 0 ||
      !mesh.positions.every(Number.isFinite) ||
      mesh.indices.some(i => !Number.isInteger(i) || i < 0 || i >= mesh.positions.length / 3)) {
    throw new Error(`WALL_WEBGL_INVALID:${mesh.wallId}`);
  }
  const positions: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions.push(mesh.positions[i] - lotWidth / 2, mesh.positions[i + 2], mesh.positions[i + 1] - lotDepth / 2);
  }
  const indices: number[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    indices.push(mesh.indices[i], mesh.indices[i + 2], mesh.indices[i + 1]);
  }
  return { positions, indices, wallId: mesh.wallId, floor: mesh.floor };
}
