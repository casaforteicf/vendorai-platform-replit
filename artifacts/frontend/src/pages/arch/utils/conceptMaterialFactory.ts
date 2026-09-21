import type { ConceptPBRMaterialDefinition } from "../catalogs/conceptMaterialCatalog";

const textureCache = new Map<string, any>();

function texture(THREE: any, url?: string) {
  if (!url) return undefined;
  const cached = textureCache.get(url);
  if (cached) return cached;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin?.("anonymous");
  const value = loader.load(url);
  value.wrapS = THREE.RepeatWrapping;
  value.wrapT = THREE.RepeatWrapping;
  if ("colorSpace" in value && THREE.SRGBColorSpace && /_diff_|basecolor/i.test(url)) {
    value.colorSpace = THREE.SRGBColorSpace;
  } else if ("encoding" in value && THREE.sRGBEncoding && /_diff_|basecolor/i.test(url)) {
    value.encoding = THREE.sRGBEncoding;
  }
  textureCache.set(url, value);
  return value;
}

function cloneTexture(source: any, repeat: [number, number], rotation = 0) {
  if (!source?.clone) return source;
  const value = source.clone();
  value.needsUpdate = true;
  value.repeat?.set?.(repeat[0], repeat[1]);
  value.center?.set?.(0.5, 0.5);
  value.rotation = rotation;
  return value;
}

export function createConceptPBRMaterial(
  THREE: any,
  definition: ConceptPBRMaterialDefinition,
  options?: { repeatScale?: number; rotation?: number },
) {
  const repeatScale = Math.max(0.1, options?.repeatScale ?? 1);
  const repeat: [number, number] = [
    definition.repeat[0] * repeatScale,
    definition.repeat[1] * repeatScale,
  ];
  const rotation = options?.rotation ?? 0;

  const map = cloneTexture(texture(THREE, definition.baseColorMap), repeat, rotation);
  const normalMap = cloneTexture(texture(THREE, definition.normalMap), repeat, rotation);
  const roughnessMap = cloneTexture(texture(THREE, definition.roughnessMap), repeat, rotation);
  const aoMap = cloneTexture(texture(THREE, definition.aoMap), repeat, rotation);

  const material = new THREE.MeshStandardMaterial({
    color: definition.color ?? 0xffffff,
    map,
    normalMap,
    roughnessMap,
    aoMap,
    roughness: definition.roughness,
    metalness: definition.metalness,
  });
  if (normalMap && material.normalScale?.setScalar) {
    material.normalScale.setScalar(definition.normalScale ?? 1);
  }
  return material;
}

export function clearConceptTextureCache() {
  textureCache.clear();
}
