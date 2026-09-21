const modelPromiseCache = new Map<string, Promise<any>>();
const pendingLoadQueue: Array<() => void> = [];
const MAX_CONCURRENT_MODEL_LOADS = 3;
let activeModelLoads = 0;

function drainModelLoadQueue() {
  while (activeModelLoads < MAX_CONCURRENT_MODEL_LOADS && pendingLoadQueue.length) {
    const next = pendingLoadQueue.shift();
    if (!next) break;
    activeModelLoads += 1;
    next();
  }
}

function queuedLoad<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    pendingLoadQueue.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeModelLoads = Math.max(0, activeModelLoads - 1);
          drainModelLoadQueue();
        });
    });
    drainModelLoadQueue();
  });
}

function cloneModel(root: any) {
  const clone = root.clone(true);
  clone.traverse?.((node: any) => {
    if (!node?.isMesh) return;
    if (node.geometry?.clone) node.geometry = node.geometry.clone();
    if (Array.isArray(node.material)) {
      node.material = node.material.map((material: any) => material?.clone?.() ?? material);
    } else if (node.material?.clone) {
      node.material = node.material.clone();
    }
  });
  return clone;
}

export async function loadCachedConceptModel(THREE: any, url: string) {
  if (!THREE?.GLTFLoader || !url) throw new Error("GLTFLoader indisponível");

  let pending = modelPromiseCache.get(url);
  if (!pending) {
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin?.("anonymous");
    pending = queuedLoad(() => new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf: any) => resolve(gltf?.scene ?? gltf?.scenes?.[0]),
        undefined,
        reject,
      );
    }));
    modelPromiseCache.set(url, pending);
  }

  const source = await pending;
  if (!source) throw new Error("Modelo 3D sem cena");
  return cloneModel(source);
}

export function clearConceptModelCache() {
  modelPromiseCache.clear();
}
