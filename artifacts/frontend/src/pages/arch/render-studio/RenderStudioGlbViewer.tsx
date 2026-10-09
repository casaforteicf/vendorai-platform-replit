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
  const [surface, setSurface] = useState("");
  const [color, setColor] = useState("#d5ddd8");
  const [lightPower, setLightPower] = useState(1.2);
  const [materialColors, setMaterialColors] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const meshKeys = useRef(new WeakMap<object, string>());
  const [savedViews, setSavedViews] = useState<Array<{ name: string; position: number[]; target: number[] }>>([]);
  const runtime = useRef<{ selection: any; camera: any; controls: any; sun: any } | null>(null);
  const selectedObject = useRef<any>(null);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const holder = container.current;
    if (!holder) return;
    let cancelled = false;
    let cleanup = () => {};
    const controller = new AbortController();
    setError(""); setStatus("Carregando modelo 3D…"); setSaveMessage(""); selectRef.current(null); setSurface(""); setSavedViews([]); setMaterialColors({}); selectedObject.current = null; runtime.current = null;

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
      sun.position.set(10, 20, 10); scene.add(sun); sun.intensity = lightPower;
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
        selectedObject.current = hit?.object ?? null;
        const name = hit?.object?.name || hit?.object?.parent?.name || (hit ? "Superfície sem nome" : null);
        setSurface(name ?? ""); selectRef.current(name);
        const material = hit?.object?.material;
        const first = Array.isArray(material) ? material[0] : material;
        if (first?.color) setColor(`#${first.color.getHexString()}`);
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
        runtime.current = null; selectedObject.current = null;
      };
      const gltf: any = await new Promise((resolve, reject) => {
        new THREE.GLTFLoader().parse(bytes, "", resolve, reject);
      });
      if (cancelled) { cleanup(); return; }
      root = gltf.scene;
      // Stable mesh paths are generated from traversal order, not runtime UUIDs.
      let meshIndex = 0;
      root.traverse((node: any) => { if (node.isMesh) meshKeys.current.set(node, String(meshIndex++).padStart(36, "0")); });
      scene.add(root);
      const sceneResponse = await fetch(`${url}/${encodeURIComponent(modelId)}/scene-settings`, { headers: renderAuthHeader(), signal: controller.signal });
      if (!sceneResponse.ok) throw new Error(`Falha ao recuperar configurações (${sceneResponse.status})`);
      const saved = await sceneResponse.json();
      if (cancelled) return;
      const settings = saved.settings as { sunlight?: number; materials?: Record<string, string>; cameras?: Array<{ name: string; position: number[]; target: number[] }> };
      const importedColors = settings.materials ?? {};
      setMaterialColors(importedColors);
      setSavedViews(settings.cameras ?? []);
      if (typeof settings.sunlight === "number") { sun.intensity = settings.sunlight; setLightPower(settings.sunlight); }
      root.traverse((node: any) => {
        const meshKey = meshKeys.current.get(node);
        const savedColor = meshKey && importedColors[meshKey];
        if (!savedColor || !node.isMesh) return;
        const paint = (material: any) => { const clone = material.clone(); clone.color?.set(savedColor); return clone; };
        node.material = Array.isArray(node.material) ? node.material.map(paint) : paint(node.material);
      });
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
      runtime.current = { selection: null, camera, controls, sun };
      animate(); setStatus("");
    })().catch((reason: unknown) => {
      if (!cancelled) { cleanup(); setStatus(""); setError(reason instanceof Error ? reason.message : "Falha ao visualizar GLB"); }
    });
    return () => { cancelled = true; controller.abort(); cleanup(); };
  }, [url, modelId]);

  function applyColor(next: string) {
    setColor(next);
    const mesh = selectedObject.current;
    if (!mesh?.isMesh) return;
    // Clone per mesh: never modify shared imported material across unrelated surfaces.
    const apply = (material: any) => { const copy = material.clone(); if (copy.color) copy.color.set(next); return copy; };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
    const meshKey = meshKeys.current.get(mesh);
    if (meshKey) setMaterialColors(previous => ({ ...previous, [meshKey]: next }));
    setSaveMessage("Alterações ainda não salvas");
  }
  function saveView() {
    const current = runtime.current;
    if (!current) return;
    setSavedViews(previous => [...previous, { name: `Câmera ${previous.length + 1}`, position: current.camera.position.toArray(), target: current.controls.target.toArray() }]);
    setSaveMessage("Alterações ainda não salvas");
  }
  function restoreView(view: { position: number[]; target: number[] }) {
    const current = runtime.current;
    if (!current) return;
    current.camera.position.fromArray(view.position); current.controls.target.fromArray(view.target); current.controls.update();
  }
  useEffect(() => { if (runtime.current) runtime.current.sun.intensity = lightPower; }, [lightPower]);
  async function persistSettings() {
    if (!runtime.current) return;
    setSavingSettings(true); setSaveMessage("");
    try {
      const response = await fetch(`${url}/${encodeURIComponent(modelId)}/scene-settings`, {
        method: "PUT", headers: { ...renderAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ sunlight: lightPower, materials: materialColors, cameras: savedViews }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar a cena");
      setSaveMessage("Cena salva para esta versão do modelo");
    } catch (reason) { setSaveMessage(reason instanceof Error ? reason.message : "Falha ao salvar"); }
    finally { setSavingSettings(false); }
  }

  return <section aria-label="Visualizador tridimensional do modelo" className="space-y-2">
    <div ref={container} className="relative h-[320px] w-full overflow-hidden rounded-lg border border-emerald-200 bg-slate-100 sm:h-[440px]" />
    {status ? <p role="status" className="text-sm text-slate-600">{status}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm"><span className="block">Cor da superfície — prévia temporária</span>
        <input aria-label="Cor da superfície selecionada" type="color" value={color} disabled={!surface}
          onChange={event => applyColor(event.target.value)} className="h-10 w-20 cursor-pointer" />
        <span className="block text-xs text-slate-500">{surface || "Clique primeiro em uma superfície"}</span>
      </label>
      <label className="space-y-1 text-sm"><span className="block">Intensidade do sol: {lightPower.toFixed(1)}</span>
        <input type="range" min="0" max="4" step="0.1" value={lightPower}
          onChange={event => { setLightPower(Number(event.target.value)); setSaveMessage("Alterações ainda não salvas"); }} className="w-full accent-emerald-700" />
      </label>
      <div className="space-y-2 sm:col-span-2">
        <button type="button" onClick={saveView} disabled={!!status || !!error}
          className="rounded-md border border-emerald-700 px-3 py-2 text-sm text-emerald-800 disabled:opacity-50">Salvar enquadramento</button>
        <div className="flex flex-wrap gap-2">{savedViews.map((view, index) =>
          <button key={index} type="button" onClick={() => restoreView(view)}
            className="rounded-md bg-emerald-50 px-3 py-1 text-sm text-emerald-800">{view.name}</button>)}</div>
        <button type="button" onClick={() => void persistSettings()} disabled={savingSettings || !!status || !!error}
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50">{savingSettings ? "Salvando…" : "Salvar configurações da cena"}</button>
        {saveMessage ? <p role="status" className="text-xs text-emerald-800">{saveMessage}</p> : null}
        <p className="text-xs text-amber-800">Configurações armazenadas separadamente por versão. O GLB original não é modificado; integração com Blender ainda pendente.</p>
      </div>
    </div>
    <p className="text-xs text-slate-600">Arraste para orbitar, use a roda do mouse para aproximar e clique em uma superfície para identificá-la. Prévia visual, sem aprovação técnica de geometria ou escala.</p>
  </section>;
}
