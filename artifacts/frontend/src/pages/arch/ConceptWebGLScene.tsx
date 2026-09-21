import { useEffect, useMemo, useRef, useState } from "react";
import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptPlanObject } from "./ConceptPlan2D";

type LightingMode = "day" | "sunset" | "night";

type Props = {
  lotWidth: number;
  lotDepth: number;
  activeFloor: number;
  levels: ConceptModelLevel[];
  objects: ConceptPlanObject[];
  selectedObjectId?: string | null;
  showAllFloors: boolean;
  interiorMode: boolean;
  showRoof: boolean;
  lightingMode: LightingMode;
  onReady?: (ready: boolean) => void;
  onSelectObject?: (objectId: string | null) => void;
  onObjectChange?: (objectId: string, patch: Partial<Pick<ConceptPlanObject, "x" | "y" | "rotation">>) => void;
  onObjectEditStart?: () => void;
  onObjectEditEnd?: () => void;
};

type Runtime = {
  THREE: any;
  scene: any;
  camera: any;
  renderer: any;
  controls: any;
  transform: any;
  modelRoot: any;
  raycaster: any;
  pointer: any;
  objectGroups: Map<string, any>;
  pickables: any[];
  animationFrame: number;
};

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const ORBIT_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/OrbitControls.min.js";
const TRANSFORM_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/TransformControls.min.js";

function loadScript(src: string) {
  const key = `__arqdor_script_${src}`;
  const w = window as any;
  if (w[key]) return w[key] as Promise<void>;

  w[key] = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });

  return w[key] as Promise<void>;
}

function materialColor(id?: string) {
  const map: Record<string, number> = {
    "pintura-branca": 0xf8fafc,
    "pintura-cinza": 0xcbd5e1,
    "cimento-aparente": 0x9ca3af,
    "madeira-ripada": 0xb98a5f,
    "pedra-cinza": 0x78716c,
    "preto-fosco-parede": 0x1f2937,
    "porcelanato-claro": 0xe7e5e4,
    "cimento-queimado": 0xd1d5db,
    "madeira-carvalho": 0xdbc5a5,
    "madeira-nogueira": 0x9a775d,
    "pedra-natural": 0xd6d3d1,
    "ceramica-clara": 0xf5f5f4,
    "vinilico-claro": 0xe5d3b3,
    "tecido-cinza": 0xcbd5e1,
    "tecido-bege": 0xe7e5e4,
    "linho-claro": 0xf5f5f4,
    "madeira-clara": 0xd6c2a8,
    "madeira-escura": 0x8b6b52,
    "preto-fosco": 0x334155,
    "branco-fosco": 0xffffff,
    "folhagem-verde": 0x86a97a,
  };
  return id ? map[id] ?? 0xd8dee7 : 0xd8dee7;
}

function disposeTree(root: any) {
  root?.traverse?.((node: any) => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach((m: any) => m?.dispose?.());
    else node.material?.dispose?.();
    node.texture?.dispose?.();
  });
}

export default function ConceptWebGLScene({
  lotWidth,
  lotDepth,
  activeFloor,
  levels,
  objects,
  selectedObjectId = null,
  showAllFloors,
  interiorMode,
  showRoof,
  lightingMode,
  onReady,
  onSelectObject,
  onObjectChange,
  onObjectEditStart,
  onObjectEditEnd,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "fallback">("loading");

  const visibleFloors = useMemo(() => {
    if (interiorMode || !showAllFloors) return new Set([activeFloor]);
    return new Set(levels.map((level) => level.floor));
  }, [activeFloor, interiorMode, levels, showAllFloors]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await loadScript(THREE_SRC);
        await loadScript(ORBIT_SRC);
        try {
          await loadScript(TRANSFORM_SRC);
        } catch {
          // TransformControls is an enhancement. Orbit + real WebGL still remain available.
        }

        if (cancelled || !hostRef.current) return;
        const THREE = (window as any).THREE;
        if (!THREE?.WebGLRenderer || !THREE?.OrbitControls) throw new Error("WebGL engine unavailable");

        const host = hostRef.current;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 500);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.domElement.className = "h-full w-full touch-none";
        host.replaceChildren(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.enablePan = true;
        controls.screenSpacePanning = true;
        controls.minDistance = 4;
        controls.maxDistance = 120;
        controls.maxPolarAngle = Math.PI / 2.04;

        const modelRoot = new THREE.Group();
        scene.add(modelRoot);

        const transform = THREE.TransformControls
          ? new THREE.TransformControls(camera, renderer.domElement)
          : null;
        if (transform) {
          transform.setMode("translate");
          transform.setSpace("world");
          transform.showY = false;
          transform.size = 0.8;
          transform.addEventListener("dragging-changed", (event: any) => {
            controls.enabled = !event.value;
            if (event.value) onObjectEditStart?.();
          });
          transform.addEventListener("mouseUp", () => {
            const target = transform.object;
            const objectId = target?.userData?.objectId;
            if (objectId && onObjectChange) {
              const width = Number(target?.userData?.modelWidth ?? 0.6);
              const depth = Number(target?.userData?.modelDepth ?? 0.6);
              const x = Math.max(0, Math.min(lotWidth - width, target.position.x + lotWidth / 2 - width / 2));
              const y = Math.max(0, Math.min(lotDepth - depth, target.position.z + lotDepth / 2 - depth / 2));
              onObjectChange(objectId, {
                x: Math.round(x * 20) / 20,
                y: Math.round(y * 20) / 20,
              });
            }
            onObjectEditEnd?.();
          });
          scene.add(transform);
        }

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        const runtime: Runtime = {
          THREE,
          scene,
          camera,
          renderer,
          controls,
          transform,
          modelRoot,
          raycaster,
          pointer,
          objectGroups: new Map(),
          pickables: [],
          animationFrame: 0,
        };
        runtimeRef.current = runtime;

        const resize = () => {
          const rect = host.getBoundingClientRect();
          const width = Math.max(1, rect.width);
          const height = Math.max(1, rect.height);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        const radius = Math.max(11, Math.hypot(lotWidth, lotDepth) * 0.82);
        camera.position.set(radius * 0.72, radius * 0.58, radius * 0.78);
        controls.target.set(0, Math.max(1.5, levels.length * 1.15), 0);
        controls.update();

        const handlePointer = (event: PointerEvent) => {
          if (!runtimeRef.current || runtime.transform?.dragging) return;
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(runtime.pickables, true)[0];
          let current = hit?.object;
          while (current && !current.userData?.objectId) current = current.parent;
          onSelectObject?.(current?.userData?.objectId ?? null);
        };
        renderer.domElement.addEventListener("click", handlePointer);

        const loop = () => {
          controls.update();
          renderer.render(scene, camera);
          runtime.animationFrame = requestAnimationFrame(loop);
        };
        loop();

        (runtime as any).observer = observer;
        (runtime as any).handlePointer = handlePointer;

        setEngineState("ready");
        onReady?.(true);
      } catch {
        if (!cancelled) {
          setEngineState("fallback");
          onReady?.(false);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      cancelAnimationFrame(runtime.animationFrame);
      (runtime as any).observer?.disconnect?.();
      runtime.renderer.domElement.removeEventListener("click", (runtime as any).handlePointer);
      runtime.controls?.dispose?.();
      runtime.transform?.dispose?.();
      disposeTree(runtime.modelRoot);
      runtime.renderer?.dispose?.();
      runtime.renderer?.forceContextLoss?.();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready") return;

    const { THREE, scene, modelRoot, transform } = runtime;
    transform?.detach?.();
    disposeTree(modelRoot);
    modelRoot.clear();
    runtime.objectGroups.clear();
    runtime.pickables = [];

    scene.background = new THREE.Color(
      lightingMode === "night" ? 0x111827 : lightingMode === "sunset" ? 0xe8a47f : 0xdfe9f3,
    );

    for (const child of [...scene.children]) {
      if (child.userData?.arqdorLight || child.userData?.arqdorGround) {
        scene.remove(child);
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      }
    }

    const hemi = new THREE.HemisphereLight(
      lightingMode === "night" ? 0x9fb5d8 : 0xffffff,
      lightingMode === "sunset" ? 0x6b4a3a : 0x88939f,
      lightingMode === "night" ? 0.7 : 1.15,
    );
    hemi.userData.arqdorLight = true;
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(
      lightingMode === "sunset" ? 0xffc28f : lightingMode === "night" ? 0xbfd3ff : 0xffffff,
      lightingMode === "night" ? 1.0 : 1.65,
    );
    sun.position.set(-lotWidth * 0.75, 18, -lotDepth * 0.45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.userData.arqdorLight = true;
    scene.add(sun);

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: lightingMode === "night" ? 0x263241 : 0xd9e1e6,
      roughness: 0.92,
      metalness: 0,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(60, lotWidth + 30), Math.max(60, lotDepth + 30)),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    ground.userData.arqdorGround = true;
    scene.add(ground);

    const lot = new THREE.Mesh(
      new THREE.BoxGeometry(lotWidth, 0.08, lotDepth),
      new THREE.MeshStandardMaterial({ color: 0xcfd8de, roughness: 0.9 }),
    );
    lot.position.set(0, -0.01, 0);
    lot.receiveShadow = true;
    modelRoot.add(lot);

    const makeMat = (color: number, transparent = false, opacity = 1) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.03,
        transparent,
        opacity,
      });

    const makeBox = (
      parent: any,
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      color: number,
      options?: { transparent?: boolean; opacity?: number },
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.02, width), Math.max(0.02, height), Math.max(0.02, depth)),
        makeMat(color, options?.transparent, options?.opacity),
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const addWall = (parent: any, wall: any, floor: number, materialId?: string, custom = false) => {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const length = Math.max(0.05, Math.hypot(dx, dy));
      const thickness = Math.max(0.08, wall.thickness ?? 0.14);
      const baseY = floor * 2.96 + 0.16;
      const mesh = makeBox(
        parent,
        length,
        2.8,
        thickness,
        (wall.x1 + wall.x2) / 2 - lotWidth / 2,
        baseY + 1.4,
        (wall.y1 + wall.y2) / 2 - lotDepth / 2,
        materialColor(materialId ?? "pintura-branca"),
        { transparent: interiorMode, opacity: interiorMode ? 0.58 : 1 },
      );
      mesh.rotation.y = -Math.atan2(dy, dx);
      mesh.userData.wallId = wall.id;
      mesh.userData.customWall = custom;
      return mesh;
    };

    for (const level of levels) {
      if (!visibleFloors.has(level.floor)) continue;
      const floorBase = level.floor * 2.96;

      for (const space of level.closedSpaces ?? []) {
        const floorMaterial = materialColor(level.floorMaterials?.[space.id]);
        for (const cell of space.cells ?? []) {
          makeBox(
            modelRoot,
            cell.width,
            0.12,
            cell.height,
            cell.x + cell.width / 2 - lotWidth / 2,
            floorBase + 0.06,
            cell.y + cell.height / 2 - lotDepth / 2,
            floorMaterial,
          );
        }
      }

      for (const wall of level.walls ?? []) addWall(modelRoot, wall, level.floor, level.wallMaterials?.[wall.id], false);
      for (const wall of level.customWalls ?? []) addWall(modelRoot, wall, level.floor, level.wallMaterials?.[wall.id], true);

      for (const opening of level.openings ?? []) {
        const width = Math.max(0.5, opening.width ?? (opening.type === "door" ? 0.9 : 1.2));
        const height = Math.max(0.5, opening.height ?? (opening.type === "door" ? 2.1 : 1.2));
        const sill = opening.type === "door" ? 0.02 : Math.max(0.2, opening.sillHeight ?? 0.9);
        const glass = opening.type === "window";
        const mesh = makeBox(
          modelRoot,
          opening.orientation === "horizontal" ? width : 0.06,
          height,
          opening.orientation === "vertical" ? width : 0.06,
          opening.x - lotWidth / 2,
          floorBase + sill + height / 2,
          opening.y - lotDepth / 2,
          glass ? (lightingMode === "night" ? 0xffd77a : 0x9dd2ef) : 0x8b5e3c,
          { transparent: glass, opacity: glass ? 0.56 : 1 },
        );
        mesh.userData.openingId = opening.id;
      }
    }

    for (const object of objects) {
      if (!visibleFloors.has(object.floor)) continue;
      const root = new THREE.Group();
      root.userData.objectId = object.id;
      root.userData.modelWidth = object.width;
      root.userData.modelDepth = object.depth;
      root.position.set(
        object.x + object.width / 2 - lotWidth / 2,
        object.floor * 2.96 + 0.16,
        object.y + object.depth / 2 - lotDepth / 2,
      );
      root.rotation.y = -(object.rotation * Math.PI) / 180;
      modelRoot.add(root);
      runtime.objectGroups.set(object.id, root);
      runtime.pickables.push(root);

      const selected = object.id === selectedObjectId;
      const baseColor = selected ? 0xf97316 : materialColor(object.materialId);
      const addLocalBox = (w: number, h: number, d: number, x: number, y: number, z: number, color = baseColor) =>
        makeBox(root, w, h, d, x, y, z, color);

      if (object.kind === "sofa") {
        addLocalBox(object.width * 0.9, 0.34, object.depth * 0.7, 0, 0.30, object.depth * 0.06);
        addLocalBox(object.width * 0.9, 0.58, object.depth * 0.16, 0, 0.58, -object.depth * 0.37);
        addLocalBox(object.width * 0.12, 0.52, object.depth * 0.78, -object.width * 0.44, 0.43, 0);
        addLocalBox(object.width * 0.12, 0.52, object.depth * 0.78, object.width * 0.44, 0.43, 0);
      } else if (object.kind === "bed") {
        addLocalBox(object.width * 0.96, 0.20, object.depth * 0.88, 0, 0.16, object.depth * 0.02);
        addLocalBox(object.width * 0.92, 0.22, object.depth * 0.80, 0, 0.36, object.depth * 0.04, selected ? baseColor : 0xf5f1ea);
        addLocalBox(object.width * 0.96, 0.95, object.depth * 0.08, 0, 0.56, -object.depth * 0.46);
      } else if (object.kind === "table") {
        addLocalBox(object.width * 0.96, 0.10, object.depth * 0.96, 0, 0.74, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          addLocalBox(0.08, 0.70, 0.08, sx * object.width * 0.38, 0.35, sz * object.depth * 0.38);
        }
      } else if (object.kind === "chair") {
        addLocalBox(object.width * 0.82, 0.12, object.depth * 0.68, 0, 0.48, object.depth * 0.05);
        addLocalBox(object.width * 0.82, 0.44, object.depth * 0.12, 0, 0.72, -object.depth * 0.35);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          addLocalBox(0.06, 0.44, 0.06, sx * object.width * 0.34, 0.22, sz * object.depth * 0.28);
        }
      } else if (object.kind === "cabinet") {
        addLocalBox(object.width, 2.05, object.depth, 0, 1.03, 0);
      } else if (object.kind === "tv") {
        addLocalBox(object.width * 0.92, 1.0, Math.max(0.05, object.depth * 0.20), 0, 0.82, 0, selected ? baseColor : 0x111827);
      } else if (object.kind === "plant") {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(object.width * 0.22, object.width * 0.30, 0.42, 18),
          makeMat(selected ? baseColor : 0x8b6b52),
        );
        pot.position.y = 0.21;
        pot.castShadow = true;
        root.add(pot);
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(0.22, object.width * 0.42), 18, 12),
          makeMat(selected ? baseColor : 0x5f8a4f),
        );
        crown.scale.set(1, 1.35, 1);
        crown.position.y = 0.88;
        crown.castShadow = true;
        root.add(crown);
      } else if (object.kind === "lamp") {
        addLocalBox(object.width * 0.58, 0.08, object.depth * 0.58, 0, 0.04, 0);
        addLocalBox(0.05, 1.18, 0.05, 0, 0.63, 0, selected ? baseColor : 0x334155);
        const shade = new THREE.Mesh(
          new THREE.CylinderGeometry(object.width * 0.22, object.width * 0.34, 0.38, 18),
          makeMat(selected ? baseColor : 0xf3e1b7),
        );
        shade.position.y = 1.35;
        shade.castShadow = true;
        root.add(shade);
      } else if (object.kind === "rug") {
        addLocalBox(object.width, 0.035, object.depth, 0, 0.025, 0);
      }

      root.traverse((node: any) => {
        if (node.isMesh) {
          node.userData.objectId = object.id;
          runtime.pickables.push(node);
        }
      });
    }

    if (showRoof && !interiorMode && showAllFloors) {
      const highestFloor = Math.max(0, ...levels.map((level) => level.floor));
      const roofY = highestFloor * 2.96 + 3.02;
      const roof = makeBox(
        modelRoot,
        Math.max(1, lotWidth * 0.82),
        0.18,
        Math.max(1, lotDepth * 0.62),
        0,
        roofY,
        0,
        0x5b4338,
      );
      roof.castShadow = true;
    }

    if (transform && selectedObjectId) {
      const selected = runtime.objectGroups.get(selectedObjectId);
      if (selected) transform.attach(selected);
    }
  }, [
    activeFloor,
    engineState,
    interiorMode,
    levels,
    lightingMode,
    lotDepth,
    lotWidth,
    objects,
    selectedObjectId,
    showAllFloors,
    showRoof,
    visibleFloors,
  ]);

  return (
    <div className="absolute inset-0 z-[1] bg-slate-200">
      <div ref={hostRef} className="h-full w-full" />
      {engineState === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-900/85 text-white">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center shadow-2xl backdrop-blur">
            <div className="text-sm font-bold">Inicializando 3D Pro</div>
            <div className="mt-1 text-xs text-slate-300">WebGL · perspectiva · luz · sombras · gizmo</div>
          </div>
        </div>
      )}
      {engineState === "fallback" && (
        <div className="pointer-events-none absolute left-4 top-24 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 shadow">
          3D Pro indisponível neste navegador. Exibindo modo compatível.
        </div>
      )}
      {engineState === "ready" && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] font-semibold text-white shadow-xl backdrop-blur">
          3D Pro · WebGL · arraste para orbitar · roda/pinça para zoom · selecione objeto para mover
        </div>
      )}
    </div>
  );
}
