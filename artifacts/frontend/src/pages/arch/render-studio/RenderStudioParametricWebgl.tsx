import { useEffect, useRef, useState } from "react";

export type ParametricWall = {
  id: string;
  start: [number, number]; end: [number, number];
  thickness: number; height: number;
  openings: Array<{ id: string; kind: "door" | "window"; offset: number; width: number; sill: number; height: number }>;
};

let engine: Promise<void> | null = null;
function loadThree(): Promise<void> {
  if (!engine) engine = new Promise((resolve, reject) => {
    if ((window as any).THREE?.WebGLRenderer) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar Three.js"));
    document.head.appendChild(script);
  }).catch(error => { engine = null; throw error; });
  return engine;
}

function buildWallGeometry(THREE: any, wall: ParametricWall) {
  const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < .1) throw new Error("Parede inválida");
  const ux = dx / length, uy = dy / length, nx = -uy, ny = ux;
  const xs = [...new Set([0, length, ...wall.openings.flatMap(o => [o.offset, o.offset + o.width])])].sort((a, b) => a - b);
  const zs = [...new Set([0, wall.height, ...wall.openings.flatMap(o => [o.sill, o.sill + o.height])])].sort((a, b) => a - b);
  if (xs.length * zs.length > 10000) throw new Error("Malha excede limite de subdivisões");
  const filled = (i: number, j: number) => {
    const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
    return !wall.openings.some(o => x > o.offset && x < o.offset + o.width && z > o.sill && z < o.sill + o.height);
  };
  const positions: number[] = [];
  const point = (x: number, side: number, z: number): [number, number, number] =>
    [wall.start[0] + ux * x + nx * side * wall.thickness / 2,
     wall.start[1] + uy * x + ny * side * wall.thickness / 2, z];
  const quad = (a: number[], b: number[], c: number[], d: number[]) =>
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    if (!filled(i, j)) continue;
    const [a, b, lo, hi] = [xs[i], xs[i + 1], zs[j], zs[j + 1]];
    quad(point(a, 1, lo), point(b, 1, lo), point(b, 1, hi), point(a, 1, hi));
    quad(point(a, -1, hi), point(b, -1, hi), point(b, -1, lo), point(a, -1, lo));
    if (i === 0 || !filled(i - 1, j))
      quad(point(a, -1, lo), point(a, 1, lo), point(a, 1, hi), point(a, -1, hi));
    if (i === xs.length - 2 || !filled(i + 1, j))
      quad(point(b, 1, lo), point(b, -1, lo), point(b, -1, hi), point(b, 1, hi));
    if (j === 0 || !filled(i, j - 1))
      quad(point(a, -1, lo), point(b, -1, lo), point(b, 1, lo), point(a, 1, lo));
    if (j === zs.length - 2 || !filled(i, j + 1))
      quad(point(a, 1, hi), point(b, 1, hi), point(b, -1, hi), point(a, -1, hi));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export default function RenderStudioParametricWebgl({ walls, active }: { walls: ParametricWall[]; active: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    loadThree().then(() => {
      if (disposed || !holder.current) return;
      const THREE = (window as any).THREE;
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf8fafc);
      scene.up?.set?.(0, 0, 1);
      const camera = new THREE.PerspectiveCamera(48, 1, .01, 3000);
      camera.up.set(0, 0, 1);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      const node = holder.current;
      node.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(8, -7, 16); scene.add(sun);
      const geometryObjects: any[] = [];
      for (const wall of walls) {
        const geometry = buildWallGeometry(THREE, wall);
        const material = new THREE.MeshStandardMaterial({
          color: wall.id === active ? 0x6ee7b7 : 0x94a3b8,
          side: THREE.DoubleSide, metalness: 0, roughness: .8,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = wall.id; scene.add(mesh); geometryObjects.push(mesh);
      }
      const bounds = new THREE.Box3().setFromObject(scene);
      const center = bounds.getCenter(new THREE.Vector3());
      const dimensions = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(dimensions.x, dimensions.y, dimensions.z, 1);
      camera.position.set(center.x + radius * 1.5, center.y - radius * 1.7, center.z + radius * 1.3);
      camera.lookAt(center);
      const resize = () => {
        if (!node.isConnected) return;
        const width = node.clientWidth || 320, height = 320;
        camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
        renderer.render(scene, camera);
      };
      resize();
      const observer = new ResizeObserver(resize); observer.observe(node);
      cleanup = () => {
        observer.disconnect();
        for (const mesh of geometryObjects) { mesh.geometry.dispose(); mesh.material.dispose(); }
        renderer.dispose(); renderer.domElement.remove();
      };
      setError("");
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : "Erro WebGL"); });
    return () => { disposed = true; cleanup(); };
  }, [walls, active]);
  return <div className="space-y-1">
    <div ref={holder} className="h-[320px] w-full overflow-hidden rounded bg-slate-50" aria-label="Malhas paramétricas WebGL em prévia" />
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> :
      <p className="text-xs text-slate-600">WebGL: malhas individuais com vãos. Uniões entre paredes ainda não resolvidas.</p>}
  </div>;
}
