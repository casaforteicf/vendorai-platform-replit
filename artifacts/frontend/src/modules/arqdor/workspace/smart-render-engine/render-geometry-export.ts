/** CPU-readable triangle transfer for a future physical render adapter.
 * No changes to source scene. Coordinates are transformed into world-space.
 * Stops on a triangle budget rather than accidentally allocating unbounded memory.
 */
export type TriangleMeshPayload = Readonly<{
  meshId: string;
  materialId: string | null;
  positions: readonly number[]; // xyz per triangle corner in world coordinates
  normals: readonly number[]; // xyz per corner, world-space
  uvs: readonly number[]; // uv per corner; zeros if missing
  triangles: number;
}>;
export type GeometryTransfer = Readonly<{
  schemaVersion: 1; meshes: readonly TriangleMeshPayload[];
  totalTriangles: number; truncated: boolean; warnings: readonly string[];
}>;
export function exportRenderGeometry(root: any, options: { maxTriangles?: number } = {}): GeometryTransfer {
  if (!root?.traverse) throw new Error("ARQDOR: objeto raiz 3D indisponível");
  const maxTriangles = Math.max(1, Math.floor(options.maxTriangles ?? 250_000));
  if (!Number.isSafeInteger(maxTriangles)) throw new Error("ARQDOR: orçamento de triângulos inválido");
  root.updateMatrixWorld?.(true);
  const meshes: TriangleMeshPayload[] = [];
  const warnings: string[] = [];
  let totalTriangles = 0;
  let truncated = false;
  root.traverse((object: any) => {
    if (truncated || !object?.isMesh || !object.visible) return;
    if (object.isInstancedMesh || object.isSkinnedMesh || object.morphTargetInfluences?.some((weight: number) => weight !== 0)) {
      warnings.push(`Malha ${object.uuid || object.name} exige expansão de instâncias/deformações; não exportada`);
      truncated = true;
      return;
    }
    if (Array.isArray(object.material) && object.material.length > 1) {
      warnings.push(`Malha ${object.uuid || object.name} exige separação de grupos de materiais; não exportada`);
      truncated = true;
      return;
    }
    const geometry = object.geometry;
    const position = geometry?.attributes?.position;
    if (!position || position.itemSize < 3) {
      warnings.push(`Malha ${object.uuid || object.name || "sem-id"} sem atributo de posição válido`);
      truncated = true;
      return;
    }
    const index = geometry.index;
    const cornerCount = index ? index.count : position.count;
    if (!Number.isInteger(cornerCount) || cornerCount < 0 || cornerCount % 3 !== 0) {
      warnings.push(`Malha ${object.uuid || object.name || "sem-id"} com triângulos incompletos; rejeitada`);
      truncated = true;
      return;
    }
    const triangles = cornerCount / 3;
    if (totalTriangles + triangles > maxTriangles) {
      truncated = true;
      warnings.push(`Limite de ${maxTriangles} triângulos atingido; exportação parcial não deve ser renderizada`);
      return;
    }
    const matrix = object.matrixWorld;
    if (!matrix?.elements || matrix.elements.some((n: number) => !Number.isFinite(n))) {
      warnings.push("Matriz de transformação inválida");
      truncated = true;
      return;
    }
    const determinant = object.matrixWorld.determinant?.();
    if (typeof determinant !== "number" || !Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
      warnings.push("Matriz não inversível, render físico bloqueado");
      truncated = true;
      return;
    }
    const normalMatrix = object.matrixWorld.clone().invert().transpose();
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    if (!normal || !uv) {
      warnings.push(`Malha ${object.uuid || object.name || "sem-id"} sem normais ou UVs completas`);
      truncated = true;
      return;
    }
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const m = matrix.elements, nm = normalMatrix.elements;
    for (let i = 0; i < cornerCount; i++) {
      const vertex = index ? index.getX(i) : i;
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      if (![x,y,z].every(Number.isFinite)) {
        warnings.push("Vértice inválido; geometria rejeitada");
        truncated = true;
        break;
      }
      positions.push(m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]);
      if (normal) {
        const nx = normal.getX(vertex), ny = normal.getY(vertex), nz = normal.getZ(vertex);
        const a = nm[0]*nx+nm[4]*ny+nm[8]*nz;
        const b = nm[1]*nx+nm[5]*ny+nm[9]*nz;
        const c = nm[2]*nx+nm[6]*ny+nm[10]*nz;
        const length = Math.hypot(a,b,c) || 1;
        normals.push(a/length,b/length,c/length);
      } else normals.push(0,0,0);
      uvs.push(uv ? uv.getX(vertex) : 0, uv ? uv.getY(vertex) : 0);
    }
    if (truncated) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    meshes.push({ meshId: String(object.uuid || object.name || meshes.length), materialId: material?.uuid || null,
      positions, normals, uvs, triangles });
    totalTriangles += triangles;
  });
  return { schemaVersion: 1, meshes, totalTriangles, truncated, warnings };
}
