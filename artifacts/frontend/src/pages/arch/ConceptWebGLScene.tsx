import { useEffect, useMemo, useRef, useState } from "react";
import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptPlanObject } from "./ConceptPlan2D";
import { getConceptModelDefinition } from "./catalogs/conceptModelCatalog";
import { getConceptPBRMaterial } from "./catalogs/conceptMaterialCatalog";
import { loadCachedConceptModel } from "./utils/conceptModelLoader";
import { createConceptPBRMaterial } from "./utils/conceptMaterialFactory";

type LightingMode = "day" | "sunset" | "night";

type Props = {
  lotWidth: number;
  lotDepth: number;
  activeFloor: number;
  levels: ConceptModelLevel[];
  objects: ConceptPlanObject[];
  selectedObjectId?: string | null;
  selectedWallId?: string | null;
  selectedCustomWallId?: string | null;
  selectedClosedSpaceId?: string | null;
  selectedOpeningId?: string | null;
  showAllFloors: boolean;
  interiorMode: boolean;
  showRoof: boolean;
  roof: "platibanda" | "aparente" | "misto";
  lightingMode: LightingMode;
  cameraPresetDegrees: number;
  cameraZoom: number;
  transformMode?: "translate" | "rotate";
  paintTool?: null | { target: "object" | "wall" | "floor"; materialId: string; name: string; swatch: string };
  onReady?: (ready: boolean) => void;
  onSelectObject?: (objectId: string | null) => void;
  onSelectWall?: (wallId: string | null) => void;
  onSelectCustomWall?: (wallId: string | null) => void;
  onSelectClosedSpace?: (spaceId: string | null) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onPaintObject?: (objectId: string, materialId: string) => void;
  onPaintWall?: (wallId: string, materialId: string) => void;
  onPaintFloor?: (spaceId: string, materialId: string) => void;
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
  cameraGoal: null | {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
};

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const ORBIT_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/OrbitControls.min.js";
const TRANSFORM_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/TransformControls.min.js";
const GLTF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/loaders/GLTFLoader.min.js";

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
  selectedWallId = null,
  selectedCustomWallId = null,
  selectedClosedSpaceId = null,
  selectedOpeningId = null,
  showAllFloors,
  interiorMode,
  showRoof,
  roof,
  lightingMode,
  cameraPresetDegrees,
  cameraZoom,
  transformMode = "translate",
  paintTool = null,
  onReady,
  onSelectObject,
  onSelectWall,
  onSelectCustomWall,
  onSelectClosedSpace,
  onSelectOpening,
  onPaintObject,
  onPaintWall,
  onPaintFloor,
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
        try {
          await loadScript(GLTF_SRC);
        } catch {
          // Real catalog assets are optional. Parametric geometry remains as fallback.
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
        if ("physicallyCorrectLights" in renderer) renderer.physicallyCorrectLights = true;
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
              const rotation = ((-target.rotation.y * 180 / Math.PI) % 360 + 360) % 360;
              onObjectChange(objectId, {
                x: Math.round(x * 20) / 20,
                y: Math.round(y * 20) / 20,
                rotation: (Math.round(rotation / 5) * 5) % 360,
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
          cameraGoal: null,
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
          while (
            current &&
            !current.userData?.objectId &&
            !current.userData?.wallId &&
            !current.userData?.spaceId &&
            !current.userData?.openingId
          ) current = current.parent;

          const objectId = current?.userData?.objectId as string | undefined;
          const wallId = current?.userData?.wallId as string | undefined;
          const spaceId = current?.userData?.spaceId as string | undefined;
          const openingId = current?.userData?.openingId as string | undefined;

          if (paintTool) {
            if (paintTool.target === "object" && objectId) onPaintObject?.(objectId, paintTool.materialId);
            if (paintTool.target === "wall" && wallId) onPaintWall?.(wallId, paintTool.materialId);
            if (paintTool.target === "floor" && spaceId) onPaintFloor?.(spaceId, paintTool.materialId);
            return;
          }

          if (objectId) {
            onSelectObject?.(objectId);
            onSelectWall?.(null);
            onSelectCustomWall?.(null);
            onSelectClosedSpace?.(null);
            onSelectOpening?.(null);
          } else if (wallId) {
            onSelectObject?.(null);
            if (current?.userData?.customWall) {
              onSelectCustomWall?.(wallId);
              onSelectWall?.(null);
            } else {
              onSelectWall?.(wallId);
              onSelectCustomWall?.(null);
            }
            onSelectClosedSpace?.(null);
            onSelectOpening?.(null);
          } else if (spaceId) {
            onSelectObject?.(null);
            onSelectWall?.(null);
            onSelectCustomWall?.(null);
            onSelectClosedSpace?.(spaceId);
            onSelectOpening?.(null);
          } else if (openingId) {
            onSelectObject?.(null);
            onSelectWall?.(null);
            onSelectCustomWall?.(null);
            onSelectClosedSpace?.(null);
            onSelectOpening?.(openingId);
          } else {
            onSelectObject?.(null);
            onSelectWall?.(null);
            onSelectCustomWall?.(null);
            onSelectClosedSpace?.(null);
            onSelectOpening?.(null);
          }
        };
        renderer.domElement.addEventListener("click", handlePointer);

        controls.addEventListener("start", () => {
          runtime.cameraGoal = null;
        });

        const loop = () => {
          if (runtime.cameraGoal) {
            const goal = runtime.cameraGoal;
            camera.position.x += (goal.position.x - camera.position.x) * 0.14;
            camera.position.y += (goal.position.y - camera.position.y) * 0.14;
            camera.position.z += (goal.position.z - camera.position.z) * 0.14;
            controls.target.x += (goal.target.x - controls.target.x) * 0.14;
            controls.target.y += (goal.target.y - controls.target.y) * 0.14;
            controls.target.z += (goal.target.z - controls.target.z) * 0.14;
            const cameraDelta = Math.hypot(
              goal.position.x - camera.position.x,
              goal.position.y - camera.position.y,
              goal.position.z - camera.position.z,
            );
            const targetDelta = Math.hypot(
              goal.target.x - controls.target.x,
              goal.target.y - controls.target.y,
              goal.target.z - controls.target.z,
            );
            if (cameraDelta < 0.025 && targetDelta < 0.025) runtime.cameraGoal = null;
          }
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
    const radius = Math.max(9, Math.hypot(lotWidth, lotDepth) * 0.82) / Math.max(0.6, cameraZoom);
    const radians = (cameraPresetDegrees * Math.PI) / 180;
    const elevation = Math.max(5.5, radius * 0.54);
    runtime.cameraGoal = {
      position: {
        x: Math.sin(radians) * radius,
        y: elevation,
        z: Math.cos(radians) * radius,
      },
      target: {
        x: 0,
        y: Math.max(1.5, levels.length * 1.15),
        z: 0,
      },
    };
  }, [cameraPresetDegrees, cameraZoom, engineState, levels.length, lotDepth, lotWidth]);

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
      options?: {
        transparent?: boolean;
        opacity?: number;
        materialId?: string;
        repeatScale?: number;
        textureRotation?: number;
      },
    ) => {
      const pbrDefinition = getConceptPBRMaterial(options?.materialId);
      const material = pbrDefinition
        ? createConceptPBRMaterial(THREE, pbrDefinition, {
            repeatScale: options?.repeatScale,
            rotation: options?.textureRotation,
          })
        : makeMat(color, options?.transparent, options?.opacity);
      if (options?.transparent) {
        material.transparent = true;
        material.opacity = options.opacity ?? 1;
        material.depthWrite = (options.opacity ?? 1) >= 0.98;
      }
      const geometry = new THREE.BoxGeometry(
        Math.max(0.02, width),
        Math.max(0.02, height),
        Math.max(0.02, depth),
      );
      if (geometry.attributes?.uv && !geometry.attributes?.uv2) {
        geometry.setAttribute("uv2", geometry.attributes.uv);
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const loadCatalogModel = (object: ConceptPlanObject, root: any) => {
      const definition = getConceptModelDefinition(object);
      if (!definition?.url || !THREE.GLTFLoader) return;

      void loadCachedConceptModel(THREE, definition.url)
        .then((model: any) => {
          if (runtime.objectGroups.get(object.id) !== root || !model) return;

          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);

          const safeX = Math.max(0.01, size.x);
          const safeY = Math.max(0.01, size.y);
          const safeZ = Math.max(0.01, size.z);
          const targetHeight = definition.targetHeight ?? {
            sofa: 0.90,
            bed: 0.65,
            table: 0.80,
            chair: 0.95,
            cabinet: 2.10,
            tv: 1.30,
            plant: 1.40,
            lamp: 1.60,
            rug: 0.08,
            outlet: 0.22,
            switch: 1.10,
            light_point: 2.60,
            water_point: 0.55,
            drain_point: 0.08,
            shower_point: 2.10,
            faucet_point: 1.05,
          }[object.kind] ?? 1;

          const scale = Math.min(
            object.width / safeX,
            object.depth / safeZ,
            targetHeight / safeY,
          );

          model.scale.setScalar(Math.max(0.001, scale));
          model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
          model.traverse((node: any) => {
            if (!node?.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            node.userData.objectId = object.id;
            runtime.pickables.push(node);
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            for (const material of materials) {
              if (!material) continue;
              if ("envMapIntensity" in material) material.envMapIntensity = 0.95;
              material.needsUpdate = true;
            }
          });

          const fallbackNodes = new Set<any>();
          for (const child of [...root.children]) {
            child.traverse?.((node: any) => fallbackNodes.add(node));
            root.remove(child);
            disposeTree(child);
          }
          runtime.pickables = runtime.pickables.filter((node) => !fallbackNodes.has(node));
          root.add(model);
          root.userData.realModel = true;
          root.userData.modelSource = definition.source;
        })
        .catch(() => {
          root.userData.realModel = false;
          // Mantém a geometria paramétrica quando o asset remoto estiver indisponível.
        });
    };

    const addWall = (
      parent: any,
      wall: any,
      floor: number,
      openingsForFloor: ConceptModelLevel["openings"],
      materialId?: string,
      custom = false,
    ) => {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const length = Math.max(0.05, Math.hypot(dx, dy));
      const thickness = Math.max(0.08, wall.thickness ?? 0.14);
      const baseY = floor * 2.96 + 0.16;
      const horizontal = Math.abs(dy) < 0.03;
      const vertical = Math.abs(dx) < 0.03;
      const color = materialColor(materialId ?? "pintura-branca");

      const addPiece = (
        alongStart: number,
        alongEnd: number,
        yStart: number,
        yEnd: number,
      ) => {
        const pieceLength = alongEnd - alongStart;
        const pieceHeight = yEnd - yStart;
        if (pieceLength < 0.035 || pieceHeight < 0.035) return;

        let mesh: any;
        if (horizontal) {
          const y = (wall.y1 + wall.y2) / 2;
          mesh = makeBox(
            parent,
            pieceLength,
            pieceHeight,
            thickness,
            alongStart + pieceLength / 2 - lotWidth / 2,
            baseY + yStart + pieceHeight / 2,
            y - lotDepth / 2,
            color,
            { transparent: interiorMode, opacity: interiorMode ? 0.58 : 1, materialId, repeatScale: 1 },
          );
        } else if (vertical) {
          const x = (wall.x1 + wall.x2) / 2;
          mesh = makeBox(
            parent,
            thickness,
            pieceHeight,
            pieceLength,
            x - lotWidth / 2,
            baseY + yStart + pieceHeight / 2,
            alongStart + pieceLength / 2 - lotDepth / 2,
            color,
            { transparent: interiorMode, opacity: interiorMode ? 0.58 : 1, materialId, repeatScale: 1 },
          );
        } else {
          return;
        }

        mesh.userData.wallId = wall.id;
        mesh.userData.customWall = custom;
        runtime.pickables.push(mesh);
      };

      if (!horizontal && !vertical) {
        const mesh = makeBox(
          parent,
          length,
          2.8,
          thickness,
          (wall.x1 + wall.x2) / 2 - lotWidth / 2,
          baseY + 1.4,
          (wall.y1 + wall.y2) / 2 - lotDepth / 2,
          color,
          { transparent: interiorMode, opacity: interiorMode ? 0.58 : 1, materialId, repeatScale: 1 },
        );
        mesh.rotation.y = -Math.atan2(dy, dx);
        mesh.userData.wallId = wall.id;
        mesh.userData.customWall = custom;
        runtime.pickables.push(mesh);
        return mesh;
      }

      const wallStart = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
      const wallEnd = horizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
      const wallCoord = horizontal ? wall.y1 : wall.x1;

      const openingsOnWall = (openingsForFloor ?? [])
        .filter((opening) => {
          if (horizontal && opening.orientation !== "horizontal") return false;
          if (vertical && opening.orientation !== "vertical") return false;
          const coord = horizontal ? opening.y : opening.x;
          const along = horizontal ? opening.x : opening.y;
          return Math.abs(coord - wallCoord) <= Math.max(0.18, thickness * 1.5)
            && along >= wallStart - 0.1
            && along <= wallEnd + 0.1;
        })
        .map((opening) => {
          const width = Math.max(0.45, opening.width ?? (opening.type === "door" ? 0.9 : 1.2));
          const center = horizontal ? opening.x : opening.y;
          return {
            opening,
            start: Math.max(wallStart, center - width / 2),
            end: Math.min(wallEnd, center + width / 2),
          };
        })
        .filter((item) => item.end - item.start > 0.05)
        .sort((a, b) => a.start - b.start);

      if (!openingsOnWall.length) {
        addPiece(wallStart, wallEnd, 0, 2.8);
        return;
      }

      let cursor = wallStart;
      for (const item of openingsOnWall) {
        if (item.start > cursor + 0.03) addPiece(cursor, item.start, 0, 2.8);

        const openingHeight = Math.max(
          0.5,
          Math.min(2.75, item.opening.height ?? (item.opening.type === "door" ? 2.1 : 1.2)),
        );
        const sill = item.opening.type === "door"
          ? 0
          : Math.max(0.15, Math.min(2.2, item.opening.sillHeight ?? 0.9));
        const top = Math.min(2.8, sill + openingHeight);

        if (sill > 0.03) addPiece(item.start, item.end, 0, sill);
        if (top < 2.77) addPiece(item.start, item.end, top, 2.8);

        cursor = Math.max(cursor, item.end);
      }
      if (cursor < wallEnd - 0.03) addPiece(cursor, wallEnd, 0, 2.8);
    };

    for (const level of levels) {
      if (!visibleFloors.has(level.floor)) continue;
      const floorBase = level.floor * 2.96;

      for (const space of level.closedSpaces ?? []) {
        const floorMaterialId = level.floorMaterials?.[space.id];
        const floorMaterial = materialColor(floorMaterialId);
        for (const cell of space.cells ?? []) {
          const floorMesh = makeBox(
            modelRoot,
            cell.width,
            0.12,
            cell.height,
            cell.x + cell.width / 2 - lotWidth / 2,
            floorBase + 0.06,
            cell.y + cell.height / 2 - lotDepth / 2,
            floorMaterial,
            { materialId: floorMaterialId, repeatScale: Math.max(0.55, Math.min(2.8, Math.sqrt((cell.width * cell.height) / 12))) },
          );
          floorMesh.userData.spaceId = space.id;
          runtime.pickables.push(floorMesh);
        }
      }

      for (const wall of level.walls ?? []) {
        addWall(modelRoot, wall, level.floor, level.openings ?? [], level.wallMaterials?.[wall.id], false);
      }
      for (const wall of level.customWalls ?? []) {
        addWall(modelRoot, wall, level.floor, level.openings ?? [], level.wallMaterials?.[wall.id], true);
      }

      for (const opening of level.openings ?? []) {
        const width = Math.max(0.5, opening.width ?? (opening.type === "door" ? 0.9 : 1.2));
        const height = Math.max(0.5, opening.height ?? (opening.type === "door" ? 2.1 : 1.2));
        const sill = opening.type === "door" ? 0.02 : Math.max(0.2, opening.sillHeight ?? 0.9);
        const glass = opening.type === "window";
        const frameColor = 0x334155;
        const frameThickness = 0.055;
        const panelDepth = 0.035;
        const panel = makeBox(
          modelRoot,
          opening.orientation === "horizontal" ? Math.max(0.1, width - frameThickness * 2) : panelDepth,
          Math.max(0.1, height - frameThickness * 2),
          opening.orientation === "vertical" ? Math.max(0.1, width - frameThickness * 2) : panelDepth,
          opening.x - lotWidth / 2,
          floorBase + sill + height / 2,
          opening.y - lotDepth / 2,
          glass
            ? (lightingMode === "night" ? 0xffd77a : 0x8ecae6)
            : 0x9a6b45,
          { transparent: glass, opacity: glass ? 0.48 : 1 },
        );
        panel.userData.openingId = opening.id;
        runtime.pickables.push(panel);

        const addFrame = (w: number, h: number, d: number, x: number, y: number, z: number) => {
          const frame = makeBox(modelRoot, w, h, d, x, y, z, frameColor);
          frame.userData.openingId = opening.id;
          runtime.pickables.push(frame);
        };

        if (opening.orientation === "horizontal") {
          addFrame(frameThickness, height, 0.08, opening.x - width / 2 + frameThickness / 2 - lotWidth / 2, floorBase + sill + height / 2, opening.y - lotDepth / 2);
          addFrame(frameThickness, height, 0.08, opening.x + width / 2 - frameThickness / 2 - lotWidth / 2, floorBase + sill + height / 2, opening.y - lotDepth / 2);
          addFrame(width, frameThickness, 0.08, opening.x - lotWidth / 2, floorBase + sill + frameThickness / 2, opening.y - lotDepth / 2);
          addFrame(width, frameThickness, 0.08, opening.x - lotWidth / 2, floorBase + sill + height - frameThickness / 2, opening.y - lotDepth / 2);
          if (glass && opening.openingStyle !== "fixed") {
            addFrame(frameThickness, height - frameThickness * 2, 0.065, opening.x - lotWidth / 2, floorBase + sill + height / 2, opening.y - lotDepth / 2);
          }
        } else {
          addFrame(0.08, height, frameThickness, opening.x - lotWidth / 2, floorBase + sill + height / 2, opening.y - width / 2 + frameThickness / 2 - lotDepth / 2);
          addFrame(0.08, height, frameThickness, opening.x - lotWidth / 2, floorBase + sill + height / 2, opening.y + width / 2 - frameThickness / 2 - lotDepth / 2);
          addFrame(0.08, frameThickness, width, opening.x - lotWidth / 2, floorBase + sill + frameThickness / 2, opening.y - lotDepth / 2);
          addFrame(0.08, frameThickness, width, opening.x - lotWidth / 2, floorBase + sill + height - frameThickness / 2, opening.y - lotDepth / 2);
          if (glass && opening.openingStyle !== "fixed") {
            addFrame(0.065, height - frameThickness * 2, frameThickness, opening.x - lotWidth / 2, floorBase + sill + height / 2, opening.y - lotDepth / 2);
          }
        }
      }
      for (const stair of level.stairs ?? []) {
        const steps = 11;
        const run = Math.max(1.2, stair.depth);
        const width = Math.max(0.8, stair.width);
        const stepDepth = run / steps;
        const stepRise = 2.8 / steps;
        for (let step = 0; step < steps; step += 1) {
          const depth = stepDepth * (step + 1);
          const stepMesh = makeBox(
            modelRoot,
            width,
            stepRise * (step + 1),
            stepDepth,
            stair.x + width / 2 - lotWidth / 2,
            floorBase + (stepRise * (step + 1)) / 2,
            stair.y + depth - stepDepth / 2 - lotDepth / 2,
            0xc9c2b8,
          );
          stepMesh.castShadow = true;
          stepMesh.receiveShadow = true;
        }

        const handrailHeight = 0.92;
        const railColor = 0x475569;
        const railLeft = makeBox(
          modelRoot,
          0.045,
          handrailHeight,
          run,
          stair.x + 0.06 - lotWidth / 2,
          floorBase + 1.45,
          stair.y + run / 2 - lotDepth / 2,
          railColor,
        );
        const railRight = makeBox(
          modelRoot,
          0.045,
          handrailHeight,
          run,
          stair.x + width - 0.06 - lotWidth / 2,
          floorBase + 1.45,
          stair.y + run / 2 - lotDepth / 2,
          railColor,
        );
        railLeft.rotation.x = -Math.atan2(2.8, run);
        railRight.rotation.x = -Math.atan2(2.8, run);
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

      const baseColor = materialColor(object.materialId);
      const addLocalBox = (w: number, h: number, d: number, x: number, y: number, z: number, color = baseColor) =>
        makeBox(root, w, h, d, x, y, z, color, { materialId: object.materialId });

      if (object.kind === "sofa") {
        addLocalBox(object.width * 0.9, 0.34, object.depth * 0.7, 0, 0.30, object.depth * 0.06);
        addLocalBox(object.width * 0.9, 0.58, object.depth * 0.16, 0, 0.58, -object.depth * 0.37);
        addLocalBox(object.width * 0.12, 0.52, object.depth * 0.78, -object.width * 0.44, 0.43, 0);
        addLocalBox(object.width * 0.12, 0.52, object.depth * 0.78, object.width * 0.44, 0.43, 0);
      } else if (object.kind === "bed") {
        addLocalBox(object.width * 0.96, 0.20, object.depth * 0.88, 0, 0.16, object.depth * 0.02);
        addLocalBox(object.width * 0.92, 0.22, object.depth * 0.80, 0, 0.36, object.depth * 0.04, 0xf5f1ea);
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
        addLocalBox(object.width * 0.92, 1.0, Math.max(0.05, object.depth * 0.20), 0, 0.82, 0, 0x111827);
      } else if (object.kind === "plant") {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(object.width * 0.22, object.width * 0.30, 0.42, 18),
          makeMat(0x8b6b52),
        );
        pot.position.y = 0.21;
        pot.castShadow = true;
        root.add(pot);
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(0.22, object.width * 0.42), 18, 12),
          makeMat(0x5f8a4f),
        );
        crown.scale.set(1, 1.35, 1);
        crown.position.y = 0.88;
        crown.castShadow = true;
        root.add(crown);
      } else if (object.kind === "lamp") {
        addLocalBox(object.width * 0.58, 0.08, object.depth * 0.58, 0, 0.04, 0);
        addLocalBox(0.05, 1.18, 0.05, 0, 0.63, 0, 0x334155);
        const shade = new THREE.Mesh(
          new THREE.CylinderGeometry(object.width * 0.22, object.width * 0.34, 0.38, 18),
          makeMat(0xf3e1b7),
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
      loadCatalogModel(object, root);
    }

    if (showRoof && !interiorMode && showAllFloors) {
      const highestFloor = Math.max(0, ...levels.map((level) => level.floor));
      const roofY = highestFloor * 2.96 + 3.02;
      const roofWidth = Math.max(2, lotWidth * 0.86);
      const roofDepth = Math.max(2, lotDepth * 0.68);

      if (roof === "platibanda") {
        const slab = makeBox(modelRoot, roofWidth, 0.16, roofDepth, 0, roofY, 0, 0x4b5563);
        slab.castShadow = true;
        for (const [x, z, w, d] of [
          [0, -roofDepth / 2 + 0.08, roofWidth, 0.16],
          [0, roofDepth / 2 - 0.08, roofWidth, 0.16],
          [-roofWidth / 2 + 0.08, 0, 0.16, roofDepth],
          [roofWidth / 2 - 0.08, 0, 0.16, roofDepth],
        ] as const) {
          makeBox(modelRoot, w, 0.48, d, x, roofY + 0.24, z, 0xf4f4f5);
        }
      } else {
        const pitch = 0.42;
        const halfDepth = roofDepth / 2;
        const slopeLength = Math.sqrt(halfDepth * halfDepth + (halfDepth * pitch) * (halfDepth * pitch));
        const roofMaterial = 0x6b4f3e;
        const left = makeBox(
          modelRoot,
          roofWidth,
          0.14,
          slopeLength,
          0,
          roofY + halfDepth * pitch / 2,
          -halfDepth / 2,
          roofMaterial,
        );
        left.rotation.x = -Math.atan(pitch);
        const right = makeBox(
          modelRoot,
          roofWidth,
          0.14,
          slopeLength,
          0,
          roofY + halfDepth * pitch / 2,
          halfDepth / 2,
          roofMaterial,
        );
        right.rotation.x = Math.atan(pitch);

        if (roof === "misto") {
          const frontSlab = makeBox(
            modelRoot,
            roofWidth * 0.36,
            0.18,
            roofDepth * 0.34,
            -roofWidth * 0.24,
            roofY + 0.10,
            -roofDepth * 0.24,
            0x4b5563,
          );
          frontSlab.castShadow = true;
        }
      }
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
    showAllFloors,
    showRoof,
    roof,
    visibleFloors,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const transform = runtime?.transform;
    if (!runtime || !transform || engineState !== "ready") return;
    transform.setMode(transformMode);
    transform.setSpace(transformMode === "rotate" ? "local" : "world");
    transform.showX = transformMode === "translate";
    transform.showY = transformMode === "rotate";
    transform.showZ = transformMode === "translate";
    transform.size = transformMode === "rotate" ? 0.95 : 0.8;
  }, [engineState, transformMode]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready") return;

    const selectedKeys = new Set<string>();
    if (selectedObjectId) selectedKeys.add(`object:${selectedObjectId}`);
    if (selectedWallId) selectedKeys.add(`wall:${selectedWallId}`);
    if (selectedCustomWallId) selectedKeys.add(`wall:${selectedCustomWallId}`);
    if (selectedClosedSpaceId) selectedKeys.add(`space:${selectedClosedSpaceId}`);
    if (selectedOpeningId) selectedKeys.add(`opening:${selectedOpeningId}`);

    runtime.modelRoot.traverse((node: any) => {
      if (!node?.isMesh) return;
      const entityKey = node.userData?.objectId
        ? `object:${node.userData.objectId}`
        : node.userData?.wallId
          ? `wall:${node.userData.wallId}`
          : node.userData?.spaceId
            ? `space:${node.userData.spaceId}`
            : node.userData?.openingId
              ? `opening:${node.userData.openingId}`
              : null;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        if (material.emissive?.setHex) {
          material.emissive.setHex(entityKey && selectedKeys.has(entityKey) ? 0xf97316 : 0x000000);
          material.emissiveIntensity = entityKey && selectedKeys.has(entityKey) ? 0.42 : 0;
        }
      }
    });

    runtime.transform?.detach?.();
    if (selectedObjectId) {
      const selected = runtime.objectGroups.get(selectedObjectId);
      if (selected) runtime.transform?.attach?.(selected);
    }
  }, [
    engineState,
    selectedClosedSpaceId,
    selectedCustomWallId,
    selectedObjectId,
    selectedOpeningId,
    selectedWallId,
    objects,
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
          3D Pro · seleção instantânea · câmera suave · arraste para orbitar · roda/pinça para zoom
        </div>
      )}
    </div>
  );
}
