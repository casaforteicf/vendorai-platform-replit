/**
 * Read-only scene snapshot for integrating the current Three.js viewer with a physical renderer.
 * No renderer is imported here: all geometry is preserved in source coordinates.
 */
export type Vec3 = readonly [number, number, number];
export type RenderMaterial = Readonly<{
  id: string; baseColor: string; metalness: number; roughness: number;
  opacity: number; doubleSided: boolean;
}>;
export type RenderMesh = Readonly<{
  id: string; materialIds: readonly string[]; triangleCount: number;
  worldMatrix: readonly number[]; geometryType: string;
}>;
export type RenderSceneSnapshot = Readonly<{
  schemaVersion: 1; capturedAt: string; sceneId: string;
  camera: Readonly<{ position: Vec3; target: Vec3; fov: number }>;
  meshes: readonly RenderMesh[]; materials: readonly RenderMaterial[];
  warnings: readonly string[]; geometryLocked: true;
}>;
const finite = (n: unknown, fallback: number) => typeof n === "number" && Number.isFinite(n) ? n : fallback;
const clamp = (n: unknown, fallback: number) => Math.max(0, Math.min(1, finite(n, fallback)));
function point3(value: any): Vec3 {
  return [finite(value?.x, 0), finite(value?.y, 0), finite(value?.z, 0)];
}
function colorHex(material: any): string {
  return material?.color?.getHexString ? "#" + material.color.getHexString() : "#ffffff";
}
function triangleCount(geometry: any): number {
  const count = geometry?.index?.count ?? geometry?.attributes?.position?.count ?? 0;
  return Math.max(0, Math.floor(finite(count, 0) / 3));
}
export function captureRenderScene(input: {
  scene: any; camera: any; controls?: any; sceneId: string;
}): RenderSceneSnapshot {
  if (!input.scene?.traverse || !input.camera) throw new Error("ARQDOR: cena/câmera 3D indisponível");
  input.scene.updateMatrixWorld?.(true);
  input.camera.updateMatrixWorld?.(true);
  const meshes: RenderMesh[] = [];
  const materials = new Map<string, RenderMaterial>();
  const warnings: string[] = [];
  input.scene.traverse((object: any) => {
    if (!object?.isMesh || object.visible === false) return;
    const geometry = object.geometry;
    if (!geometry?.attributes?.position) {
      warnings.push(`Malha ${object.uuid || object.name || "sem-id"} sem posições; ignorada`);
      return;
    }
    const id = String(object.uuid || object.name || `mesh-${meshes.length}`);
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const ids: string[] = [];
    source.forEach((m: any, index: number) => {
      if (!m) return;
      const materialId = String(m.uuid || `${id}-material-${index}`);
      ids.push(materialId);
      if (!materials.has(materialId)) {
        materials.set(materialId, {
          id: materialId,
          baseColor: colorHex(m),
          metalness: clamp(m.metalness, 0),
          roughness: clamp(m.roughness, 1),
          opacity: clamp(m.opacity, 1),
          doubleSided: m.side === 2,
        });
      }
    });
    const matrix = object.matrixWorld?.elements;
    if (!matrix || matrix.length !== 16 || Array.from(matrix).some((v) => !Number.isFinite(v))) {
      warnings.push(`Malha ${id} com transformação inválida; ignorada`);
      return;
    }
    meshes.push({
      id, materialIds: ids, triangleCount: triangleCount(geometry),
      geometryType: String(geometry.type || "BufferGeometry"),
      worldMatrix: Array.from(matrix) as number[],
    });
  });
  const target = input.controls?.target || input.camera.getWorldDirection?.({ x: 0, y: 0, z: -1, add(v: any) { this.x += v.x; this.y += v.y; this.z += v.z; return this; } });
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    sceneId: input.sceneId,
    camera: { position: point3(input.camera.position), target: point3(target), fov: finite(input.camera.fov, 50) },
    meshes, materials: Array.from(materials.values()), warnings, geometryLocked: true,
  };
}
