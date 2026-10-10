import { useEffect, useRef, useState } from "react";
import { unionOrthogonalWalls } from "./arqdorOrthogonalUnion";

export type ParametricWall = {
  id: string;
  start: [number, number]; end: [number, number];
  thickness: number; height: number;
  openings: Array<{ id: string; kind: "door" | "window"; offset: number; width: number; sill: number; height: number }>;
};

let engine: Promise<void> | null = null;
export function loadThree(): Promise<void> {
  if (!engine) engine = new Promise((resolve, reject) => {
    if ((window as any).THREE?.WebGLRenderer) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    let settled = false;
    const timeout = setTimeout(() => fail("Tempo esgotado ao carregar Three.js"), 12000);
    function fail(message: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      script.remove();
      reject(new Error(message));
    }
    script.onload = () => {
      if (settled) return;
      if (!(window as any).THREE?.WebGLRenderer) {
        fail("Three.js carregado sem WebGLRenderer");
        return;
      }
      settled = true;
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      resolve();
    };
    script.onerror = () => fail("Não foi possível carregar Three.js");
    document.head.appendChild(script);
  }).catch(error => { engine = null; throw error; });
  return engine;
}

export function buildWallGeometry(THREE: any, wall: ParametricWall) {
  if (!Array.isArray(wall.start) || !Array.isArray(wall.end) ||
      wall.start.length !== 2 || wall.end.length !== 2 ||
      ![...wall.start, ...wall.end].every(Number.isFinite))
    throw new Error("Coordenadas da parede inválidas");
  const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < .1 || length > 1000 ||
      !Number.isFinite(wall.height) || wall.height <= 0 || wall.height > 20 ||
      !Number.isFinite(wall.thickness) || wall.thickness < .05 || wall.thickness > 1 ||
      !Array.isArray(wall.openings) || wall.openings.length > 100)
    throw new Error("Parede inválida");
  for (const o of wall.openings) {
    if (!o || ![o.offset, o.width, o.sill, o.height].every(Number.isFinite) ||
        o.offset < 0 || o.width <= 0 || o.offset + o.width > length ||
        o.sill < 0 || o.height <= 0 || o.sill + o.height > wall.height)
      throw new Error("Vão inválido na parede");
  }
  // Diagonal preview must enforce the same opening-overlap rule as the
  // orthogonal union, otherwise switching wall orientation changes validity.
  for (let i = 0; i < wall.openings.length; i++) {
    const a = wall.openings[i];
    for (let j = i + 1; j < wall.openings.length; j++) {
      const b = wall.openings[j];
      if (a.offset < b.offset + b.width && a.offset + a.width > b.offset &&
          a.sill < b.sill + b.height && a.sill + a.height > b.sill)
        throw new Error("Aberturas sobrepostas na parede");
    }
  }
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
  try {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  } catch (error) {
    // Caller cannot register this geometry for teardown until we return it.
    geometry.dispose();
    throw error;
  }
}

export function shouldUseOrthogonalUnion(walls: ParametricWall[]): boolean {
  if (!Array.isArray(walls) || walls.some(w =>
    !w || !Array.isArray(w.start) || !Array.isArray(w.end) ||
    w.start.length !== 2 || w.end.length !== 2 ||
    ![...w.start, ...w.end].every(Number.isFinite)))
    throw new Error("Coordenadas da parede inválidas");
  return walls.every(w =>
    Math.abs(w.start[0] - w.end[0]) < 1e-8 ||
    Math.abs(w.start[1] - w.end[1]) < 1e-8);
}

export default function RenderStudioParametricWebgl({ walls, active }: { walls: ParametricWall[]; active: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    // An empty plan does not need to fetch Three.js or create a GPU context.
    if (Array.isArray(walls) && walls.length === 0) {
      setError("");
      return () => { disposed = true; };
    }
    loadThree().then(() => {
      if (disposed || !holder.current) return;
      // Validate and build union before allocating a WebGL context, so invalid
      // geometry does not leave a renderer/canvas attached after rejection.
      const orthogonal = shouldUseOrthogonalUnion(walls);
      const union = orthogonal && walls.length ? unionOrthogonalWalls(walls) : null;
      if (union && !union.topology.closedByEdgeIncidence) {
        setError(`A união 3D exige revisão: ${union.topology.boundaryEdges} arestas abertas, ${union.topology.nonmanifoldEdges} não-manifold e ${union.topology.orientationErrors} com orientação inconsistente; ${union.topology.connectedSolidComponents} componentes sólidos; volume ${union.topology.signedVolumeMatchesOccupancy ? "coerente" : "divergente"}.`);
        return;
      }
      const THREE = (window as any).THREE;
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf8fafc);
      scene.up?.set?.(0, 0, 1);
      const camera = new THREE.PerspectiveCamera(48, 1, .01, 3000);
      camera.up.set(0, 0, 1);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      const node = holder.current;
      const disposableResources: Array<{ dispose: () => void }> = [];
      let observer: ResizeObserver | null = null;
      // Register cleanup before any subsequent scene-building operation can
      // throw. The old handler was registered only after a successful render.
      let released = false;
      cleanup = () => {
        if (released) return;
        released = true;
        observer?.disconnect();
        for (const resource of disposableResources) resource.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      try {
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      node.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.9));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(8, -7, 16); scene.add(sun);
      if (union) {
        const positions: number[] = [];
        for (const face of union.faces) {
          const [a, b, c, d] = face.map(index => union.vertices[index]);
          positions.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
        const geometry = new THREE.BufferGeometry();
        disposableResources.push(geometry);
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0x94a3b8, side: THREE.DoubleSide, roughness: .8 });
        disposableResources.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = "uniao-ortogonal"; scene.add(mesh);
      } else for (const wall of walls) {
        const geometry = buildWallGeometry(THREE, wall);
        disposableResources.push(geometry);
        const material = new THREE.MeshStandardMaterial({
          color: wall.id === active ? 0x6ee7b7 : 0x94a3b8,
          side: THREE.DoubleSide, metalness: 0, roughness: .8,
        });
        disposableResources.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = wall.id; scene.add(mesh);
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
      observer = new ResizeObserver(resize); observer.observe(node);
      setError("");
      } catch (reason) {
        cleanup();
        cleanup = () => {};
        throw reason;
      }
    }).catch(reason => { if (!disposed) setError(reason instanceof Error ? reason.message : "Erro WebGL"); });
    return () => { disposed = true; cleanup(); };
  }, [walls, active]);
  return <div className="space-y-1">
    <div ref={holder} className="h-[320px] w-full overflow-hidden rounded bg-slate-50" aria-label="Malhas paramétricas WebGL em prévia" />
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> :
      walls.length === 0 ? <p className="text-xs text-slate-600">Adicione uma parede para visualizar o modelo 3D.</p> :
      <p className="text-xs text-slate-600">WebGL: paredes ortogonais combinadas em volume único; diagonais usam malhas individuais. Geometria ainda sujeita a revisão.</p>}
  </div>;
}
