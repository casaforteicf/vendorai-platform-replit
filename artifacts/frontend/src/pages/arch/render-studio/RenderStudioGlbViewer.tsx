import { useEffect, useRef, useState } from "react";
import { renderAuthHeader } from "./renderStudioApi";

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/";
const scripts = [CDN + "three.min.js", CDN + "examples/js/controls/OrbitControls.min.js", CDN + "examples/js/loaders/GLTFLoader.min.js"];
const cachedScripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = cachedScripts.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const element = existing ?? document.createElement("script");
    if (element.dataset.loaded === "true") { resolve(); return; }
    element.addEventListener("load", () => { element.dataset.loaded = "true"; resolve(); }, { once: true });
    element.addEventListener("error", () => reject(new Error("Falha ao carregar o visualizador 3D")), { once: true });
    if (!existing) { element.src = src; element.async = true; document.head.appendChild(element); }
  });
  cachedScripts.set(src, promise);
  promise.catch(() => cachedScripts.delete(src));
  return promise;
}

type Props = { url: string; modelId: string; onSelect: (name: string | null) => void };
export default function RenderStudioGlbViewer({ url, modelId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  const [status, setStatus] = useState("Carregando modelo 3D…");
  const [error, setError] = useState("");
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const holder = container.current;
    if (!holder) return;
    let cancelled = false;
    let cleanup = () => {};
    const controller = new AbortController();
    setError(""); setStatus("Carregando modelo 3D…"); selectRef.current(null);

    (async () => {
      const response = await fetch(`${url}/${encodeURIComponent(modelId)}/file`, {
        headers: renderAuthHeader(), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Não foi possível abrir o GLB (${response.status})`);
      const bytes = await response.arrayBuffer();
      for (const script of scripts) {
        await loadScript(script);
        if (cancelled) return;
      }
      if (cancelled) return;
      const THREE = (window as any).THREE;
      if (!THREE?.GLTFLoader || !THREE?.OrbitControls) throw new Error("Visualizador 3D indisponível");
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf2f5f4);
      const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      holder.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9ba8a5, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(10, 20, 10); scene.add(sun);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let root: any = null;
      let frame = 0;
      let observer: ResizeObserver | null = null;
      const onClick = (event: MouseEvent) => {
        if (!root) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(root, true)[0];
        selectRef.current(hit?.object?.name || hit?.object?.parent?.name || (hit ? "Superfície sem nome" : null));
      };
      renderer.domElement.addEventListener("click", onClick);
      cleanup = () => {
        cancelAnimationFrame(frame);
        observer?.disconnect();
        renderer.domElement.removeEventListener("click", onClick);
        controls.dispose();
        root?.traverse((node: any) => {
          node.geometry?.dispose?.();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((material: any) => material?.dispose?.());
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
      const gltf: any = await new Promise((resolve, reject) => {
        new THREE.GLTFLoader().parse(bytes, "", resolve, reject);
      });
      if (cancelled) { cleanup(); return; }
      root = gltf.scene;
      scene.add(root);
      const bounds = new THREE.Box3().setFromObject(root);
      if (bounds.isEmpty()) throw new Error("Este GLB não contém geometria visível");
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.1);
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(radius * 1.5, radius * 1.1, radius * 1.5));
      camera.near = Math.max(radius / 10000, 0.001);
      camera.far = radius * 100;
      camera.updateProjectionMatrix();
      controls.update();
      const resize = () => {
        const width = Math.max(holder.clientWidth, 1), height = Math.max(holder.clientHeight, 1);
        camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
      };
      observer = new ResizeObserver(resize); observer.observe(holder); resize();
      const animate = () => { if (cancelled) return; frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
      animate(); setStatus("");
    })().catch((reason: unknown) => {
      if (!cancelled) { cleanup(); setStatus(""); setError(reason instanceof Error ? reason.message : "Falha ao visualizar GLB"); }
    });
    return () => { cancelled = true; controller.abort(); cleanup(); };
  }, [url, modelId]);

  return <section aria-label="Visualizador tridimensional do modelo" className="space-y-2">
    <div ref={container} className="relative h-[320px] w-full overflow-hidden rounded-lg border border-emerald-200 bg-slate-100 sm:h-[440px]" />
    {status ? <p role="status" className="text-sm text-slate-600">{status}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <p className="text-xs text-slate-600">Arraste para orbitar, use a roda do mouse para aproximar e clique em uma superfície para identificá-la. Prévia visual, sem aprovação técnica de geometria ou escala.</p>
  </section>;
}
