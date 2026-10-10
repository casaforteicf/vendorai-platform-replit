import { captureRenderScene, type RenderSceneSnapshot } from "../../modules/arqdor/workspace/smart-render-engine/render-scene-contract";
import { exportRenderGeometry, type GeometryTransfer } from "../../modules/arqdor/workspace/smart-render-engine/render-geometry-export";
import { buildFacadeMeshBoxes } from "./conceptFacadeMeshes";
import { getFacadeMaterial, type FacadeDesignState } from "./conceptFacadeDesign";
import { buildRoofPlan } from "./conceptRoofPlan";
import type { SiteFrontSide } from "./conceptSitePlacement";
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptPlanObject } from "./ConceptPlan2D";
import { getConceptModelDefinition } from "./catalogs/conceptModelCatalog";
import { getConceptPBRMaterial } from "./catalogs/conceptMaterialCatalog";
import { loadCachedConceptModel } from "./utils/conceptModelLoader";
import { createConceptPBRMaterial } from "./utils/conceptMaterialFactory";

type LightingMode = "day" | "sunset" | "night";
type RenderQuality = "fast" | "realistic" | "ultra";

type Props = {
  lotWidth: number;
  lotDepth: number;
  activeFloor: number;
  levels: ConceptModelLevel[];
  facadeDesign?: FacadeDesignState;
  frontSide?: SiteFrontSide;
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
  renderQuality?: RenderQuality;
  cameraPresetDegrees: number;
  cameraZoom: number;
  transformMode?: "translate" | "rotate";
  navigationMode?: "orbit" | "walk" | "spin" | "tour" | "panorama";
  walkControl?: { forward: number; strafe: number };
  walkSpeed?: number;
  walkResetToken?: number;
  tourPoint?: { x: number; y: number; floor: number; token: number } | null;
  cameraSnapshotToken?: number;
  savedCameraViewpoint?: null | {
    id: string;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
  onCameraSnapshot?: (snapshot: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }) => void;
  panoramaExportToken?: number;
  panoramaExportWidth?: number;
  onPanoramaExport?: (dataUrl: string) => void;
  onPanoramaExportError?: (message: string) => void;
  paintTool?: null | { target: "object" | "wall" | "floor"; materialId: string; name: string; swatch: string };
  /** Increment to request a read-only scene metadata capture; no pixels are rendered. */
  /** Increment to request bounded world-space geometry export; no physical render is started. */
  renderGeometryExportToken?: number;
  onRenderGeometryExport?: (geometry: GeometryTransfer) => void;
  onRenderGeometryExportError?: (message: string) => void;
  renderSceneSnapshotToken?: number;
  onRenderSceneSnapshot?: (snapshot: RenderSceneSnapshot) => void;
  onRenderSceneSnapshotError?: (message: string) => void;
  onReady?: (ready: boolean) => void;
  onSelectObject?: (objectId: string | null) => void;
  onSelectWall?: (wallId: string | null) => void;
  onSelectCustomWall?: (wallId: string | null) => void;
  onSelectClosedSpace?: (spaceId: string | null) => void;
  onSelectOpening?: (openingId: string | null) => void;
  onPaintObject?: (objectId: string, materialId: string) => void;
  onPaintWall?: (wallId: string, materialId: string) => void;
  onPaintFloor?: (spaceId: string, materialId: string) => void;
  onObjectChange?: (objectId: string, patch: Partial<Pick<ConceptPlanObject, "x" | "y" | "rotation" | "materialId" | "materialScale" | "materialRotation">>) => void;
  onObjectDrop?: (
    preset: Pick<ConceptPlanObject, "kind" | "label" | "width" | "depth"> &
      Partial<Pick<ConceptPlanObject, "catalogProductId" | "imageUrl" | "supplier" | "price" | "model3dUrl" | "textureUrl">>,
    point: { x: number; y: number },
  ) => void;
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
  navigationMode: "orbit" | "walk" | "spin" | "tour" | "panorama";
  walkKeys: Set<string>;
  walkControl: { forward: number; strafe: number };
  walkSpeed: number;
  walkYaw: number;
  walkPitch: number;
  walkDragging: boolean;
  walkLastPointer: { x: number; y: number } | null;
  environmentTexture?: any;
  panoramaRenderTarget?: any;
  panoramaPreviousBackground?: any;
  panoramaHiddenObjects?: Array<{ object: any; visible: boolean }>;
  panoramaModelRootVisible?: boolean;
  panoramaPreviousCamera?: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    fov: number;
  };
  contentFramed: boolean;
  contentCenter?: { x: number; y: number; z: number; span: number };
  walkWalls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness: number;
    doorGaps: Array<{ center: number; halfWidth: number }>;
  }>;
};

// "Frente" e "Iso" devem olhar para a fachada da rua. O ângulo 0 da câmera fica do lado de baixo
// da planta; sem este ajuste, com a frente no topo (padrão), a câmera mostrava os fundos da casa.
const FRONT_CAMERA_OFFSET: Record<"top" | "bottom" | "left" | "right", number> = { bottom: 0, top: 180, left: 270, right: 90 };

const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const ORBIT_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/OrbitControls.min.js";
const TRANSFORM_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/controls/TransformControls.min.js";
const GLTF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/loaders/GLTFLoader.min.js";
const RGBE_SRC = "https://unpkg.com/three@0.128.0/examples/js/loaders/RGBELoader.js";
const ARQDOR_HDRI = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr";

type CatalogMaterialLink = {
  surfaceKey?: string | null;
  grupo?: string | null;
  isDefault?: boolean;
  material?: {
    id: string;
    nome: string;
    primaryImage?: { storageUrl?: string | null } | null;
  } | null;
};

const catalogMaterialLinksCache = new Map<string, Promise<CatalogMaterialLink[]>>();
const reportedCatalogSurfaceSignature = new Map<string, string>();

function normalizeGlbSurfaceToken(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function glbSurfaceKey(node: any, material: any) {
  const materialToken = normalizeGlbSurfaceToken(material?.name);
  if (materialToken) return `material:${materialToken}`;
  const nodeToken = normalizeGlbSurfaceToken(node?.name);
  return `node:${nodeToken || "surface"}`;
}

function catalogMaterialLinks(productId: string) {
  let pending = catalogMaterialLinksCache.get(productId);
  if (!pending) {
    pending = fetch(`/api/arch/catalogo/${productId}/materials`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
    })
      .then(async (response) => response.ok ? await response.json() as CatalogMaterialLink[] : [])
      .catch(() => []);
    catalogMaterialLinksCache.set(productId, pending);
  }
  return pending;
}

function reportCatalogModelSurfaces(productId: string, model3dUrl: string, surfaces: Array<{
  key: string;
  label: string;
  nodeName?: string;
  materialName?: string;
  meshCount: number;
}>) {
  if (!surfaces.length) return;
  const signature = surfaces.map((surface) => `${surface.key}:${surface.meshCount}`).sort().join("|");
  if (reportedCatalogSurfaceSignature.get(productId) === signature) return;
  reportedCatalogSurfaceSignature.set(productId, signature);
  void fetch(`/api/arch/catalogo/${productId}/model-surfaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    },
    body: JSON.stringify({ model3dUrl, surfaces }),
  }).catch(() => {
    reportedCatalogSurfaceSignature.delete(productId);
  });
}


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

function canWalkTo(
  x: number,
  y: number,
  walls: Runtime["walkWalls"],
  radius = 0.24,
) {
  for (const wall of walls) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const relX = x - wall.x1;
    const relY = y - wall.y1;
    const along = relX * ux + relY * uy;
    if (along < -radius || along > length + radius) continue;

    const clampedAlong = Math.max(0, Math.min(length, along));
    const closestX = wall.x1 + ux * clampedAlong;
    const closestY = wall.y1 + uy * clampedAlong;
    const perpendicular = Math.hypot(x - closestX, y - closestY);
    if (perpendicular > wall.thickness / 2 + radius) continue;

    const throughDoor = wall.doorGaps.some((gap) =>
      Math.abs(along - gap.center) <= Math.max(0.18, gap.halfWidth - radius * 0.35),
    );
    if (!throughDoor) return false;
  }
  return true;
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
  renderQuality = "realistic",
  facadeDesign,
  frontSide = "bottom",
  cameraPresetDegrees,
  cameraZoom,
  transformMode = "translate",
  navigationMode = "orbit",
  walkControl = { forward: 0, strafe: 0 },
  walkSpeed = 0.12,
  walkResetToken = 0,
  tourPoint = null,
  cameraSnapshotToken = 0,
  savedCameraViewpoint = null,
  onCameraSnapshot,
  panoramaExportToken = 0,
  panoramaExportWidth = 4096,
  onPanoramaExport,
  onPanoramaExportError,
  paintTool = null,
  renderGeometryExportToken,
  onRenderGeometryExport,
  onRenderGeometryExportError,
  renderSceneSnapshotToken,
  onRenderSceneSnapshot,
  onRenderSceneSnapshotError,
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
  onObjectDrop,
  onObjectEditStart,
  onObjectEditEnd,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "fallback">("loading");
  const [dragOverScene, setDragOverScene] = useState(false);
  const [sceneContentReady, setSceneContentReady] = useState(false);

  const acceptsArqdorObject = (event: ReactDragEvent<HTMLDivElement>) =>
    event.dataTransfer.types.includes("application/x-arqdor-object");

  const handleSceneDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onObjectDrop || !acceptsArqdorObject(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOverScene(true);
  };

  const handleSceneDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragOverScene(false);
  };

  const handleSceneDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onObjectDrop) return;
    const raw = event.dataTransfer.getData("application/x-arqdor-object");
    if (!raw) return;

    event.preventDefault();
    setDragOverScene(false);

    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready") return;

    try {
      const parsed = JSON.parse(raw) as Partial<ConceptPlanObject>;
      if (
        typeof parsed.kind !== "string" ||
        typeof parsed.label !== "string" ||
        !Number.isFinite(Number(parsed.width)) ||
        !Number.isFinite(Number(parsed.depth))
      ) return;

      const rect = runtime.renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      runtime.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      runtime.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera);

      const floorY = activeFloor * 2.96 + 0.16;
      const plane = new runtime.THREE.Plane(
        new runtime.THREE.Vector3(0, 1, 0),
        -floorY,
      );
      const worldPoint = new runtime.THREE.Vector3();
      const intersection = runtime.raycaster.ray.intersectPlane(plane, worldPoint);

      const point = intersection
        ? {
            x: Math.max(0, Math.min(lotWidth, worldPoint.x + lotWidth / 2)),
            y: Math.max(0, Math.min(lotDepth, worldPoint.z + lotDepth / 2)),
          }
        : { x: lotWidth / 2, y: lotDepth / 2 };

      onObjectDrop(
        {
          kind: parsed.kind as ConceptPlanObject["kind"],
          label: parsed.label,
          width: Math.max(0.3, Number(parsed.width)),
          depth: Math.max(0.3, Number(parsed.depth)),
          catalogProductId: typeof parsed.catalogProductId === "string" ? parsed.catalogProductId : undefined,
          imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : undefined,
          supplier: typeof parsed.supplier === "string" ? parsed.supplier : undefined,
          price: Number.isFinite(Number(parsed.price)) ? Number(parsed.price) : undefined,
          model3dUrl: typeof parsed.model3dUrl === "string" ? parsed.model3dUrl : undefined,
        },
        point,
      );
    } catch {
      // Ignore invalid drag payloads from outside the Arqdor library.
    }
  };

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
        try {
          await loadScript(RGBE_SRC);
        } catch {
          // HDRI is an enhancement. Existing physical lights remain as fallback.
        }

        if (cancelled || !hostRef.current) return;
        const THREE = (window as any).THREE;
        if (!THREE?.WebGLRenderer || !THREE?.OrbitControls) throw new Error("WebGL engine unavailable");

        const host = hostRef.current;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 500);
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, renderQuality === "ultra" ? 2.5 : renderQuality === "fast" ? 1.25 : 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = renderQuality === "ultra" ? 1.08 : renderQuality === "fast" ? 0.98 : 1.05;
        if ("physicallyCorrectLights" in renderer) renderer.physicallyCorrectLights = true;
        renderer.domElement.className = "h-full w-full touch-none";
        renderer.domElement.dataset.conceptModel3dSource = "true";
        renderer.domElement.dataset.renderSource = "arqdor-webgl";
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
          navigationMode: "orbit",
          walkKeys: new Set(),
          walkControl: { forward: 0, strafe: 0 },
          walkSpeed: Math.max(0.05, Math.min(0.28, walkSpeed)),
          walkYaw: 0,
          walkPitch: 0,
          walkDragging: false,
          walkLastPointer: null,
          contentFramed: false,
          walkWalls: [],
        };
        runtimeRef.current = runtime;

        if (THREE.RGBELoader && THREE.PMREMGenerator) {
          try {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader?.();
            new THREE.RGBELoader().load(
              ARQDOR_HDRI,
              (hdrTexture: any) => {
                try {
                  const env = pmrem.fromEquirectangular(hdrTexture).texture;
                  runtime.environmentTexture = env;
                  scene.environment = env;
                } finally {
                  hdrTexture?.dispose?.();
                  pmrem.dispose?.();
                }
              },
              undefined,
              () => pmrem.dispose?.(),
            );
          } catch {
            // Keep physical lights/background if HDRI setup is unavailable.
          }
        }

        const resize = () => {
          const rect = host.getBoundingClientRect();
          const width = Math.max(1, rect.width);
          const height = Math.max(1, rect.height);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          // Celular em pé: abre o ângulo de visão para a casa inteira caber na largura da tela.
          camera.fov = camera.aspect < 1 ? Math.min(74, 46 / Math.max(0.6, camera.aspect)) : 46;
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
          if (!runtimeRef.current || runtime.transform?.dragging || runtime.navigationMode === "walk") return;
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

        const handleWalkKeyDown = (event: KeyboardEvent) => {
          if (runtime.navigationMode !== "walk") return;
          const key = event.key.toLowerCase();
          if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(key)) {
            event.preventDefault();
            runtime.walkKeys.add(key);
          }
        };
        const handleWalkKeyUp = (event: KeyboardEvent) => {
          runtime.walkKeys.delete(event.key.toLowerCase());
        };
        const handleWalkPointerDown = (event: PointerEvent) => {
          if (!["walk", "panorama"].includes(runtime.navigationMode) || event.button !== 0) return;
          runtime.walkDragging = true;
          runtime.walkLastPointer = { x: event.clientX, y: event.clientY };
          renderer.domElement.setPointerCapture?.(event.pointerId);
        };
        const handleWalkPointerMove = (event: PointerEvent) => {
          if (!["walk", "panorama"].includes(runtime.navigationMode) || !runtime.walkDragging || !runtime.walkLastPointer) return;
          const dx = event.clientX - runtime.walkLastPointer.x;
          const dy = event.clientY - runtime.walkLastPointer.y;
          runtime.walkLastPointer = { x: event.clientX, y: event.clientY };
          runtime.walkYaw -= dx * 0.004;
          runtime.walkPitch = Math.max(-1.25, Math.min(1.25, runtime.walkPitch - dy * 0.003));
        };
        const handleWalkPointerUp = () => {
          runtime.walkDragging = false;
          runtime.walkLastPointer = null;
        };
        window.addEventListener("keydown", handleWalkKeyDown);
        window.addEventListener("keyup", handleWalkKeyUp);
        renderer.domElement.addEventListener("pointerdown", handleWalkPointerDown);
        renderer.domElement.addEventListener("pointermove", handleWalkPointerMove);
        renderer.domElement.addEventListener("pointerup", handleWalkPointerUp);
        renderer.domElement.addEventListener("pointercancel", handleWalkPointerUp);

        controls.addEventListener("start", () => {
          runtime.cameraGoal = null;
        });

        const loop = () => {
          if (runtime.navigationMode === "spin" && !runtime.cameraGoal) {
            const target = controls.target;
            const dx = camera.position.x - target.x;
            const dz = camera.position.z - target.z;
            const radius = Math.max(1, Math.hypot(dx, dz));
            const angle = Math.atan2(dx, dz) + 0.0035;
            camera.position.x = target.x + Math.sin(angle) * radius;
            camera.position.z = target.z + Math.cos(angle) * radius;
          }

          if (runtime.navigationMode === "panorama") {
            const lookDistance = 5;
            const cosPitch = Math.cos(runtime.walkPitch);
            controls.target.set(
              camera.position.x - Math.sin(runtime.walkYaw) * cosPitch * lookDistance,
              camera.position.y + Math.sin(runtime.walkPitch) * lookDistance,
              camera.position.z - Math.cos(runtime.walkYaw) * cosPitch * lookDistance,
            );
          }

          if (runtime.navigationMode === "walk") {
            const keyboardForward = Number(runtime.walkKeys.has("w") || runtime.walkKeys.has("arrowup"))
              - Number(runtime.walkKeys.has("s") || runtime.walkKeys.has("arrowdown"));
            const keyboardStrafe = Number(runtime.walkKeys.has("d") || runtime.walkKeys.has("arrowright"))
              - Number(runtime.walkKeys.has("a") || runtime.walkKeys.has("arrowleft"));
            const forward = Math.max(-1, Math.min(1, keyboardForward + runtime.walkControl.forward));
            const strafe = Math.max(-1, Math.min(1, keyboardStrafe + runtime.walkControl.strafe));
            const speed = runtime.walkSpeed;
            if (forward || strafe) {
              const stepX = (-Math.sin(runtime.walkYaw) * forward + Math.cos(runtime.walkYaw) * strafe) * speed;
              const stepZ = (-Math.cos(runtime.walkYaw) * forward - Math.sin(runtime.walkYaw) * strafe) * speed;
              const maxX = Math.max(1, lotWidth / 2 - 0.25);
              const maxZ = Math.max(1, lotDepth / 2 - 0.25);
              const targetX = Math.max(-maxX, Math.min(maxX, camera.position.x + stepX));
              const targetZ = Math.max(-maxZ, Math.min(maxZ, camera.position.z + stepZ));

              const planX = targetX + lotWidth / 2;
              const planY = targetZ + lotDepth / 2;
              if (canWalkTo(planX, planY, runtime.walkWalls)) {
                camera.position.x = targetX;
                camera.position.z = targetZ;
              } else {
                const slideX = targetX + lotWidth / 2;
                const currentPlanY = camera.position.z + lotDepth / 2;
                if (canWalkTo(slideX, currentPlanY, runtime.walkWalls)) {
                  camera.position.x = targetX;
                }
                const currentPlanX = camera.position.x + lotWidth / 2;
                const slideY = targetZ + lotDepth / 2;
                if (canWalkTo(currentPlanX, slideY, runtime.walkWalls)) {
                  camera.position.z = targetZ;
                }
              }
            }
            const lookDistance = 5;
            const cosPitch = Math.cos(runtime.walkPitch);
            controls.target.set(
              camera.position.x - Math.sin(runtime.walkYaw) * cosPitch * lookDistance,
              camera.position.y + Math.sin(runtime.walkPitch) * lookDistance,
              camera.position.z - Math.cos(runtime.walkYaw) * cosPitch * lookDistance,
            );
          }
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
        (runtime as any).handleWalkKeyDown = handleWalkKeyDown;
        (runtime as any).handleWalkKeyUp = handleWalkKeyUp;
        (runtime as any).handleWalkPointerDown = handleWalkPointerDown;
        (runtime as any).handleWalkPointerMove = handleWalkPointerMove;
        (runtime as any).handleWalkPointerUp = handleWalkPointerUp;

        setEngineState("ready");
        setSceneContentReady(false);
        onReady?.(false);
      } catch {
        if (!cancelled) {
          setEngineState("fallback");
          setSceneContentReady(false);
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
      window.removeEventListener("keydown", (runtime as any).handleWalkKeyDown);
      window.removeEventListener("keyup", (runtime as any).handleWalkKeyUp);
      runtime.renderer.domElement.removeEventListener("pointerdown", (runtime as any).handleWalkPointerDown);
      runtime.renderer.domElement.removeEventListener("pointermove", (runtime as any).handleWalkPointerMove);
      runtime.renderer.domElement.removeEventListener("pointerup", (runtime as any).handleWalkPointerUp);
      runtime.renderer.domElement.removeEventListener("pointercancel", (runtime as any).handleWalkPointerUp);
      runtime.environmentTexture?.dispose?.();
      runtime.panoramaRenderTarget?.dispose?.();
      if (runtime.panoramaHiddenObjects) {
        for (const entry of runtime.panoramaHiddenObjects) entry.object.visible = entry.visible;
      }
      if (typeof runtime.panoramaModelRootVisible === "boolean") {
        runtime.modelRoot.visible = runtime.panoramaModelRootVisible;
      }
      // handleWalkKeyDownCleanupMarker
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

  const processedGeometryTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!renderGeometryExportToken || processedGeometryTokenRef.current === renderGeometryExportToken) return;
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || !sceneContentReady) return;
    processedGeometryTokenRef.current = renderGeometryExportToken;
    try {
      onRenderGeometryExport?.(exportRenderGeometry(runtime.modelRoot, { maxTriangles: 250_000 }));
    } catch (error) {
      onRenderGeometryExportError?.(error instanceof Error ? error.message : "Não foi possível exportar a geometria 3D");
    }
  }, [renderGeometryExportToken, engineState, sceneContentReady, onRenderGeometryExport, onRenderGeometryExportError]);

  const processedSnapshotTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!renderSceneSnapshotToken || processedSnapshotTokenRef.current === renderSceneSnapshotToken) return;
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || !sceneContentReady) return;
    processedSnapshotTokenRef.current = renderSceneSnapshotToken;
    try {
      onRenderSceneSnapshot?.(captureRenderScene({
        scene: runtime.modelRoot,
        camera: runtime.camera,
        controls: runtime.controls,
        sceneId: `arqdor-concept-${renderSceneSnapshotToken}`,
      }));
    } catch (error) {
      onRenderSceneSnapshotError?.(error instanceof Error ? error.message : "Não foi possível inspecionar a cena 3D");
    }
  }, [renderSceneSnapshotToken, engineState, sceneContentReady, onRenderSceneSnapshot, onRenderSceneSnapshotError]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || ["walk", "panorama"].includes(runtime.navigationMode)) return;
    // Enquadra a casa (não o centro do lote, que em lote fundo fica no quintal vazio).
    const focus = runtime.contentCenter;
    const narrowFit = runtime.camera?.aspect < 1 ? 1 / Math.max(0.45, runtime.camera.aspect) : 1;
    const baseRadius = focus ? Math.max(9, focus.span * 1.35) : Math.max(9, Math.hypot(lotWidth, lotDepth) * 0.82);
    const radius = baseRadius * narrowFit / Math.max(0.6, cameraZoom);
    const radians = ((cameraPresetDegrees + FRONT_CAMERA_OFFSET[frontSide ?? "bottom"]) * Math.PI) / 180;
    const elevation = Math.max(5.5, radius * 0.54);
    const cx = focus?.x ?? 0;
    const cz = focus?.z ?? 0;
    runtime.cameraGoal = {
      position: {
        x: cx + Math.sin(radians) * radius,
        y: elevation,
        z: cz + Math.cos(radians) * radius,
      },
      target: {
        x: cx,
        y: Math.max(1.5, levels.length * 1.15),
        z: cz,
      },
    };
  }, [cameraPresetDegrees, cameraZoom, engineState, frontSide, levels.length, lotDepth, lotWidth]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready") return;

    const { THREE, scene, modelRoot, transform } = runtime;
    runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, renderQuality === "ultra" ? 2.5 : renderQuality === "fast" ? 1.25 : 2));
    runtime.renderer.toneMappingExposure = lightingMode === "night"
      ? (renderQuality === "ultra" ? 1.18 : 1.10)
      : lightingMode === "sunset"
        ? (renderQuality === "ultra" ? 1.10 : 1.04)
        : (renderQuality === "ultra" ? 1.08 : renderQuality === "fast" ? 0.98 : 1.05);
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
    const sunShadowSize = renderQuality === "ultra" ? 4096 : renderQuality === "fast" ? 1024 : 2048;
    sun.shadow.mapSize.set(sunShadowSize, sunShadowSize);
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

    const shellBounds = (() => {
      let minX = Number.POSITIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;

      const includePoint = (x: number, z: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        minX = Math.min(minX, x - lotWidth / 2);
        maxX = Math.max(maxX, x - lotWidth / 2);
        minZ = Math.min(minZ, z - lotDepth / 2);
        maxZ = Math.max(maxZ, z - lotDepth / 2);
      };

      for (const level of levels) {
        if (!visibleFloors.has(level.floor)) continue;
        for (const wall of [...(level.walls ?? []), ...(level.customWalls ?? [])]) {
          includePoint(wall.x1, wall.y1);
          includePoint(wall.x2, wall.y2);
        }
        for (const space of level.closedSpaces ?? []) {
          for (const cell of space.cells ?? []) {
            includePoint(cell.x, cell.y);
            includePoint(cell.x + cell.width, cell.y + cell.height);
          }
        }
      }

      if (![minX, minZ, maxX, maxZ].every(Number.isFinite)) {
        return {
          minX: -lotWidth * 0.43,
          maxX: lotWidth * 0.43,
          minZ: -lotDepth * 0.34,
          maxZ: lotDepth * 0.34,
          centerX: 0,
          centerZ: 0,
          width: Math.max(2, lotWidth * 0.86),
          depth: Math.max(2, lotDepth * 0.68),
        };
      }

      const width = Math.max(2, maxX - minX);
      const depth = Math.max(2, maxZ - minZ);
      return {
        minX,
        maxX,
        minZ,
        maxZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
        width,
        depth,
      };
    })();

    const pointToSegmentDistance = (
      px: number,
      py: number,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
    ) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length2 = dx * dx + dy * dy;
      if (length2 <= 0.000001) return Math.hypot(px - x1, py - y1);
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    };

    const inferExteriorBoundaryWalls = (level: ConceptModelLevel) => {
      type Edge = { x1: number; y1: number; x2: number; y2: number; count: number };
      const edges = new Map<string, Edge>();
      const keyFor = (x1: number, y1: number, x2: number, y2: number) => {
        const a = `${x1.toFixed(3)},${y1.toFixed(3)}`;
        const b = `${x2.toFixed(3)},${y2.toFixed(3)}`;
        return a < b ? `${a}|${b}` : `${b}|${a}`;
      };
      const addEdge = (x1: number, y1: number, x2: number, y2: number) => {
        const key = keyFor(x1, y1, x2, y2);
        const current = edges.get(key);
        if (current) current.count += 1;
        else edges.set(key, { x1, y1, x2, y2, count: 1 });
      };

      for (const space of level.closedSpaces ?? []) {
        for (const cell of space.cells ?? []) {
          const x1 = cell.x;
          const y1 = cell.y;
          const x2 = cell.x + cell.width;
          const y2 = cell.y + cell.height;
          addEdge(x1, y1, x2, y1);
          addEdge(x2, y1, x2, y2);
          addEdge(x2, y2, x1, y2);
          addEdge(x1, y2, x1, y1);
        }
      }

      const existing = [...(level.walls ?? []), ...(level.customWalls ?? [])];
      return [...edges.values()]
        .filter((edge) => edge.count === 1)
        .filter((edge) => {
          const covered = existing.some((wall) => {
            const tolerance = Math.max(0.12, Number(wall.thickness ?? 0.14) * 1.6);
            return pointToSegmentDistance(edge.x1, edge.y1, wall.x1, wall.y1, wall.x2, wall.y2) <= tolerance
              && pointToSegmentDistance(edge.x2, edge.y2, wall.x1, wall.y1, wall.x2, wall.y2) <= tolerance;
          });
          return !covered;
        })
        .map((edge, index) => ({
          id: `auto-shell-${level.floor}-${index}`,
          floor: level.floor,
          x1: edge.x1,
          y1: edge.y1,
          x2: edge.x2,
          y2: edge.y2,
          thickness: 0.18,
          exterior: true,
          aiAssisted: true,
        }));
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
            sofa: 0.90, bed: 0.65, table: 0.80, chair: 0.95, cabinet: 2.10,
            appliance: 1.90, sanitary: 0.90, outdoor: 0.95,
            tv: 1.30, plant: 1.40, lamp: 1.60, rug: 0.08, outlet: 0.22,
            switch: 1.10, light_point: 2.60, water_point: 0.55, drain_point: 0.08,
            shower_point: 2.10, faucet_point: 1.05,
          }[object.kind] ?? 1;

          const scale = Math.min(
            object.width / safeX,
            object.depth / safeZ,
            targetHeight / safeY,
          );

          model.scale.setScalar(Math.max(0.001, scale));
          model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
          const surfaceMap = new Map<string, {
            key: string;
            label: string;
            nodeName?: string;
            materialName?: string;
            meshCount: number;
          }>();
          const meshSurfaces: Array<{ node: any; entries: Array<{ index: number; key: string }> }> = [];

          model.traverse((node: any) => {
            if (!node?.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            node.userData.objectId = object.id;
            runtime.pickables.push(node);
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            const entries: Array<{ index: number; key: string }> = [];
            materials.forEach((material: any, index: number) => {
              if (!material) return;
              if ("envMapIntensity" in material) material.envMapIntensity = 0.95;
              material.needsUpdate = true;

              const key = glbSurfaceKey(node, material);
              entries.push({ index, key });
              const previous = surfaceMap.get(key);
              const materialName = String(material.name || "").trim();
              const nodeName = String(node.name || "").trim();
              surfaceMap.set(key, {
                key,
                label: materialName || nodeName || `Superfície ${surfaceMap.size + 1}`,
                ...(nodeName ? { nodeName } : {}),
                ...(materialName ? { materialName } : {}),
                meshCount: (previous?.meshCount ?? 0) + 1,
              });
            });
            meshSurfaces.push({ node, entries });
          });

          if (object.catalogProductId) {
            const surfaces = [...surfaceMap.values()];
            reportCatalogModelSurfaces(object.catalogProductId, definition.url, surfaces);

            void catalogMaterialLinks(object.catalogProductId).then((links) => {
              if (runtime.objectGroups.get(object.id) !== root) return;
              const defaults = links.filter((link) => link.isDefault && link.material?.primaryImage?.storageUrl);
              const bySurface = new Map(defaults.filter((link) => link.surfaceKey).map((link) => [String(link.surfaceKey), link]));
              const globalDefault = defaults.find((link) => !link.surfaceKey) ?? null;
              const configured = object.materialSelections ?? {};
              const configuredGlobal = configured.__all__ ?? null;
              const loader = new THREE.TextureLoader();

              for (const { node, entries } of meshSurfaces) {
                const sourceMaterials = Array.isArray(node.material) ? [...node.material] : [node.material];
                let changed = false;
                entries.forEach(({ index, key }) => {
                  const configuredSelection = configured[key] ?? configuredGlobal;
                  const link = bySurface.get(key) ?? globalDefault;
                  const textureUrl = configuredSelection?.textureUrl ?? link?.material?.primaryImage?.storageUrl ?? object.textureUrl;
                  const source = sourceMaterials[index];
                  if (!textureUrl || !source?.clone) return;
                  const cloned = source.clone();
                  const texture = loader.load(textureUrl);
                  texture.wrapS = THREE.RepeatWrapping;
                  texture.wrapT = THREE.RepeatWrapping;
                  if ("encoding" in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
                  cloned.map = texture;
                  if (cloned.color?.setHex) cloned.color.setHex(0xffffff);
                  if ("envMapIntensity" in cloned) cloned.envMapIntensity = 0.95;
                  cloned.needsUpdate = true;
                  sourceMaterials[index] = cloned;
                  changed = true;
                });
                if (changed) node.material = Array.isArray(node.material) ? sourceMaterials : sourceMaterials[0];
              }
            });
          }

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
      const color = !materialId && wall.exterior && facadeDesign
        ? Number.parseInt(getFacadeMaterial(facadeDesign.surfaceMaterials.main).baseColor.slice(1), 16)
        : materialColor(materialId ?? "pintura-branca");

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
          const width = Math.max(0.05, opening.width ?? (opening.type === "door" ? 0.9 : 1.2));
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
          0.05,
          Math.min(2.8, item.opening.height ?? (item.opening.type === "door" ? 2.1 : 1.2)),
        );
        const sill = item.opening.type === "door"
          ? 0
          : Math.max(0, Math.min(2.8, item.opening.sillHeight ?? 0.9));
        const top = Math.min(2.8, sill + openingHeight);

        if (sill > 0.03) addPiece(item.start, item.end, 0, sill);
        if (top < 2.77) addPiece(item.start, item.end, top, 2.8);

        cursor = Math.max(cursor, item.end);
      }
      if (cursor < wallEnd - 0.03) addPiece(cursor, wallEnd, 0, 2.8);
    };

    const activeLevel = levels.find((level) => level.floor === activeFloor);
    const collisionWalls = [
      ...(activeLevel?.walls ?? []),
      ...(activeLevel?.customWalls ?? []),
    ];
    runtime.walkWalls = collisionWalls.map((wall: any) => {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const ux = dx / length;
      const uy = dy / length;
      const doorGaps = (activeLevel?.openings ?? [])
        .filter((opening: any) => opening.type === "door")
        .map((opening: any) => {
          const relX = opening.x - wall.x1;
          const relY = opening.y - wall.y1;
          const center = relX * ux + relY * uy;
          const projectedX = wall.x1 + ux * center;
          const projectedY = wall.y1 + uy * center;
          const distance = Math.hypot(opening.x - projectedX, opening.y - projectedY);
          const width = Math.max(0.7, opening.width ?? 0.9);
          return { center, halfWidth: width / 2, distance };
        })
        .filter((gap: any) => gap.distance <= Math.max(0.22, (wall.thickness ?? 0.14) * 1.75)
          && gap.center >= -0.1
          && gap.center <= length + 0.1)
        .map(({ center, halfWidth }: any) => ({ center, halfWidth }));
      return {
        x1: wall.x1,
        y1: wall.y1,
        x2: wall.x2,
        y2: wall.y2,
        thickness: Math.max(0.08, wall.thickness ?? 0.14),
        doorGaps,
      };
    });

    if (interiorMode && activeLevel) {
      const roomLights = (activeLevel.closedSpaces ?? [])
        .filter((space) => (space.area ?? 0) >= 2)
        .slice(0, 10);
      for (const space of roomLights) {
        const light = new THREE.PointLight(
          lightingMode === "night" ? 0xffd7a1 : 0xffecd2,
          lightingMode === "night" ? 10 : 5.5,
          Math.max(4.5, Math.min(9, Math.sqrt(space.area ?? 9) * 2.2)),
          2,
        );
        light.position.set(
          space.centroid.x - lotWidth / 2,
          activeFloor * 2.96 + 2.35,
          space.centroid.y - lotDepth / 2,
        );
        const shadowLightLimit = renderQuality === "ultra" ? 6 : renderQuality === "realistic" ? 3 : 0;
        light.castShadow = roomLights.indexOf(space) < shadowLightLimit;
        if (light.castShadow) {
          const roomShadowSize = renderQuality === "ultra" ? 1024 : 512;
          light.shadow.mapSize.set(roomShadowSize, roomShadowSize);
        }
        light.userData.arqdorLight = true;
        scene.add(light);
      }
    }

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

          // Close the architectural shell in exterior/all-floor mode.
          // The top slab follows the real room footprint instead of the lot dimensions.
          if (!interiorMode && showAllFloors) {
            const ceilingMesh = makeBox(
              modelRoot,
              cell.width,
              0.12,
              cell.height,
              cell.x + cell.width / 2 - lotWidth / 2,
              floorBase + 2.90,
              cell.y + cell.height / 2 - lotDepth / 2,
              0xe5e7eb,
              { materialId: "pintura-branca", repeatScale: 1 },
            );
            ceilingMesh.userData.spaceId = space.id;
          }
        }
      }

      for (const wall of level.walls ?? []) {
        addWall(modelRoot, wall, level.floor, level.openings ?? [], level.wallMaterials?.[wall.id], false);
      }
      for (const wall of level.customWalls ?? []) {
        addWall(modelRoot, wall, level.floor, level.openings ?? [], level.wallMaterials?.[wall.id], true);
      }

      // Geometry guard: recover missing external envelope from the detected room grid.
      // This runs only for uncovered perimeter edges and never overwrites authored walls.
      for (const inferredWall of inferExteriorBoundaryWalls(level)) {
        addWall(modelRoot, inferredWall, level.floor, level.openings ?? [], "pintura-branca", true);
      }

      for (const opening of level.openings ?? []) {
        const width = Math.max(0.05, opening.width ?? (opening.type === "door" ? 0.9 : 1.2));
        const height = Math.max(0.05, opening.height ?? (opening.type === "door" ? 2.1 : 1.2));
        const sill = opening.type === "door" ? 0 : Math.max(0, opening.sillHeight ?? 0.9);
        const glass = opening.type === "window";
        const frameColor = facadeDesign ? Number.parseInt(getFacadeMaterial(facadeDesign.surfaceMaterials.frames).baseColor.slice(1), 16) : 0x334155;
        const frameThickness = 0.055;
        const panelDepth = 0.035;
        const panel = makeBox(
          modelRoot,
          opening.orientation === "horizontal" ? Math.max(0.1, width - frameThickness * 2) : panelDepth,
          Math.max(0.1, height - frameThickness * 2),
          opening.orientation === "vertical" ? Math.max(0.1, width - frameThickness * 2) : panelDepth,
          opening.x - lotWidth / 2,
          floorBase + 0.16 + sill + height / 2,
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
          addFrame(frameThickness, height, 0.08, opening.x - width / 2 + frameThickness / 2 - lotWidth / 2, floorBase + 0.16 + sill + height / 2, opening.y - lotDepth / 2);
          addFrame(frameThickness, height, 0.08, opening.x + width / 2 - frameThickness / 2 - lotWidth / 2, floorBase + 0.16 + sill + height / 2, opening.y - lotDepth / 2);
          addFrame(width, frameThickness, 0.08, opening.x - lotWidth / 2, floorBase + 0.16 + sill + frameThickness / 2, opening.y - lotDepth / 2);
          addFrame(width, frameThickness, 0.08, opening.x - lotWidth / 2, floorBase + 0.16 + sill + height - frameThickness / 2, opening.y - lotDepth / 2);
          if (glass && opening.openingStyle !== "fixed") {
            addFrame(frameThickness, height - frameThickness * 2, 0.065, opening.x - lotWidth / 2, floorBase + 0.16 + sill + height / 2, opening.y - lotDepth / 2);
          }
        } else {
          addFrame(0.08, height, frameThickness, opening.x - lotWidth / 2, floorBase + 0.16 + sill + height / 2, opening.y - width / 2 + frameThickness / 2 - lotDepth / 2);
          addFrame(0.08, height, frameThickness, opening.x - lotWidth / 2, floorBase + 0.16 + sill + height / 2, opening.y + width / 2 - frameThickness / 2 - lotDepth / 2);
          addFrame(0.08, frameThickness, width, opening.x - lotWidth / 2, floorBase + 0.16 + sill + frameThickness / 2, opening.y - lotDepth / 2);
          addFrame(0.08, frameThickness, width, opening.x - lotWidth / 2, floorBase + 0.16 + sill + height - frameThickness / 2, opening.y - lotDepth / 2);
          if (glass && opening.openingStyle !== "fixed") {
            addFrame(0.065, height - frameThickness * 2, frameThickness, opening.x - lotWidth / 2, floorBase + 0.16 + sill + height / 2, opening.y - lotDepth / 2);
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
        makeBox(root, w, h, d, x, y, z, color, {
          materialId: object.materialId,
          repeatScale: object.materialScale ?? 1,
          textureRotation: ((object.materialRotation ?? 0) * Math.PI) / 180,
        });

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
      const roofPlan = buildRoofPlan(levels.map((level) => ({
        floor: level.floor,
        cells: (level.closedSpaces ?? []).flatMap((space) => space.cells ?? []),
      })));
      const wallColor = facadeDesign
        ? Number.parseInt(getFacadeMaterial(facadeDesign.surfaceMaterials.main).baseColor.slice(1), 16)
        : 0xf1efe9;
      const toScene = (x: number, y: number) => ({ x: x - lotWidth / 2, z: y - lotDepth / 2 });
      const slabTop = (floor: number) => floor * 2.96 + 3.02;
      const pitched = roof === "aparente" || roof === "misto";
      const roofConfig = {
        waters: facadeDesign?.roofConfig?.waters ?? 2,
        pitchDegrees: facadeDesign?.roofConfig?.pitchDegrees ?? 20,
        overhang: facadeDesign?.roofConfig?.overhang ?? 0.45,
        ridgeDirection: facadeDesign?.roofConfig?.ridgeDirection ?? "auto",
        parapetHeight: facadeDesign?.roofConfig?.parapetHeight ?? 0.9,
        gutter: facadeDesign?.roofConfig?.gutter ?? true,
      };

      // Lajes: cada trecho na altura do próprio pavimento (no telhado aparente, o último pavimento
      // recebe o telhado inclinado abaixo; aqui ficam só as lajes dos pavimentos inferiores).
      for (const slab of roofPlan.slabs) {
        if (pitched && slab.floor === highestFloor) continue;
        const center = toScene(slab.x + slab.width / 2, slab.y + slab.height / 2);
        const mesh = makeBox(modelRoot, slab.width, 0.16, slab.height, center.x, slabTop(slab.floor), center.z, 0xb8bcc2);
        mesh.castShadow = true;
      }
      // Platibanda de 0,9 m na cor da fachada, com rufo escuro, contornando só a borda externa.
      for (const edge of roofPlan.edges) {
        if (pitched && edge.floor === highestFloor) continue;
        const horizontal = Math.abs(edge.y1 - edge.y2) < 0.001;
        const length = horizontal ? Math.abs(edge.x2 - edge.x1) : Math.abs(edge.y2 - edge.y1);
        if (length < 0.05) continue;
        const center = toScene((edge.x1 + edge.x2) / 2, (edge.y1 + edge.y2) / 2);
        const baseY = slabTop(edge.floor);
        const w = horizontal ? length + 0.15 : 0.15;
        const d = horizontal ? 0.15 : length + 0.15;
        const parapet = makeBox(modelRoot, w, roofConfig.parapetHeight, d, center.x, baseY + roofConfig.parapetHeight / 2, center.z, wallColor);
        parapet.castShadow = true;
        makeBox(modelRoot, w + 0.04, 0.05, d + 0.04, center.x, baseY + roofConfig.parapetHeight + 0.025, center.z, 0x52525b);
      }

      if (pitched) {
        const topSlabs = roofPlan.slabs.filter((slab) => slab.floor === highestFloor);
        const minX = Math.min(...topSlabs.map((slab) => slab.x));
        const maxX = Math.max(...topSlabs.map((slab) => slab.x + slab.width));
        const minY = Math.min(...topSlabs.map((slab) => slab.y));
        const maxY = Math.max(...topSlabs.map((slab) => slab.y + slab.height));
        const bounds = topSlabs.length
          ? { width: maxX - minX, depth: maxY - minY, ...(() => { const c = toScene((minX + maxX) / 2, (minY + maxY) / 2); return { centerX: c.x, centerZ: c.z }; })() }
          : shellBounds;
        const roofY = highestFloor * 2.96 + 3.02;
        const roofOverhang = roofConfig.overhang;
        const roofWidth = Math.max(2, bounds.width + roofOverhang * 2);
        const roofDepth = Math.max(2, bounds.depth + roofOverhang * 2);
        const pitch = Math.tan((roofConfig.pitchDegrees * Math.PI) / 180);
        const roofMaterial = 0x7a4a33;
        const ridgeAlongX = roofConfig.ridgeDirection === "x"
          || (roofConfig.ridgeDirection === "auto" && roofWidth >= roofDepth);

        const addPlane = (points: Array<[number, number, number]>) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
          geometry.setIndex(points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]);
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, makeMat(roofMaterial));
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          modelRoot.add(mesh);
          return mesh;
        };

        const x0 = bounds.centerX - roofWidth / 2;
        const x1 = bounds.centerX + roofWidth / 2;
        const z0 = bounds.centerZ - roofDepth / 2;
        const z1 = bounds.centerZ + roofDepth / 2;

        if (roofConfig.waters === 1) {
          if (ridgeAlongX) {
            const h = roofDepth * pitch;
            addPlane([[x0, roofY, z0], [x1, roofY, z0], [x1, roofY + h, z1], [x0, roofY + h, z1]]);
          } else {
            const h = roofWidth * pitch;
            addPlane([[x0, roofY, z0], [x1, roofY + h, z0], [x1, roofY + h, z1], [x0, roofY, z1]]);
          }
        } else if (roofConfig.waters === 4) {
          if (ridgeAlongX) {
            const h = (roofDepth / 2) * pitch;
            const ridgeHalf = Math.max(0, (roofWidth - roofDepth) / 2);
            const rx0 = bounds.centerX - ridgeHalf;
            const rx1 = bounds.centerX + ridgeHalf;
            addPlane([[x0, roofY, z0], [x1, roofY, z0], [rx1, roofY + h, bounds.centerZ], [rx0, roofY + h, bounds.centerZ]]);
            addPlane([[x1, roofY, z1], [x0, roofY, z1], [rx0, roofY + h, bounds.centerZ], [rx1, roofY + h, bounds.centerZ]]);
            addPlane([[x0, roofY, z1], [x0, roofY, z0], [rx0, roofY + h, bounds.centerZ]]);
            addPlane([[x1, roofY, z0], [x1, roofY, z1], [rx1, roofY + h, bounds.centerZ]]);
          } else {
            const h = (roofWidth / 2) * pitch;
            const ridgeHalf = Math.max(0, (roofDepth - roofWidth) / 2);
            const rz0 = bounds.centerZ - ridgeHalf;
            const rz1 = bounds.centerZ + ridgeHalf;
            addPlane([[x0, roofY, z1], [x0, roofY, z0], [bounds.centerX, roofY + h, rz0], [bounds.centerX, roofY + h, rz1]]);
            addPlane([[x1, roofY, z0], [x1, roofY, z1], [bounds.centerX, roofY + h, rz1], [bounds.centerX, roofY + h, rz0]]);
            addPlane([[x0, roofY, z0], [x1, roofY, z0], [bounds.centerX, roofY + h, rz0]]);
            addPlane([[x1, roofY, z1], [x0, roofY, z1], [bounds.centerX, roofY + h, rz1]]);
          }
        } else if (ridgeAlongX) {
          const halfDepth = roofDepth / 2;
          const slopeLength = Math.sqrt(halfDepth * halfDepth + (halfDepth * pitch) * (halfDepth * pitch));
          const left = makeBox(modelRoot, roofWidth, 0.12, slopeLength, bounds.centerX, roofY + halfDepth * pitch / 2, bounds.centerZ - halfDepth / 2, roofMaterial);
          left.rotation.x = -Math.atan(pitch);
          left.castShadow = true;
          const right = makeBox(modelRoot, roofWidth, 0.12, slopeLength, bounds.centerX, roofY + halfDepth * pitch / 2, bounds.centerZ + halfDepth / 2, roofMaterial);
          right.rotation.x = Math.atan(pitch);
          right.castShadow = true;
        } else {
          const halfWidth = roofWidth / 2;
          const slopeLength = Math.sqrt(halfWidth * halfWidth + (halfWidth * pitch) * (halfWidth * pitch));
          const left = makeBox(modelRoot, slopeLength, 0.12, roofDepth, bounds.centerX - halfWidth / 2, roofY + halfWidth * pitch / 2, bounds.centerZ, roofMaterial);
          left.rotation.z = Math.atan(pitch);
          left.castShadow = true;
          const right = makeBox(modelRoot, slopeLength, 0.12, roofDepth, bounds.centerX + halfWidth / 2, roofY + halfWidth * pitch / 2, bounds.centerZ, roofMaterial);
          right.rotation.z = -Math.atan(pitch);
          right.castShadow = true;
        }

        if (roofConfig.gutter) {
          const gutterColor = 0x475569;
          if (ridgeAlongX) {
            makeBox(modelRoot, roofWidth, 0.08, 0.10, bounds.centerX, roofY + 0.02, z0, gutterColor);
            makeBox(modelRoot, roofWidth, 0.08, 0.10, bounds.centerX, roofY + 0.02, z1, gutterColor);
          } else {
            makeBox(modelRoot, 0.10, 0.08, roofDepth, x0, roofY + 0.02, bounds.centerZ, gutterColor);
            makeBox(modelRoot, 0.10, 0.08, roofDepth, x1, roofY + 0.02, bounds.centerZ, gutterColor);
          }
        }
      }
    }

    if (facadeDesign?.siteExterior?.zones?.length && showAllFloors && !interiorMode) {
      const zoneColor: Record<string, number> = {
        driveway: 0x9ca3af,
        pedestrian: 0xd6d3d1,
        deck: 0xb08968,
        garden: 0x7fa66a,
        service: 0xb8b8a8,
        pool_buffer: 0xded7c8,
      };
      for (const zone of facadeDesign.siteExterior.zones) {
        if (![zone.x, zone.y, zone.width, zone.depth].every(Number.isFinite) || zone.width <= 0 || zone.depth <= 0) continue;
        const mesh = makeBox(
          modelRoot,
          zone.width,
          zone.kind === "deck" ? 0.10 : 0.06,
          zone.depth,
          zone.x + zone.width / 2 - lotWidth / 2,
          zone.kind === "deck" ? 0.09 : 0.04,
          zone.y + zone.depth / 2 - lotDepth / 2,
          zoneColor[zone.kind] ?? 0xcbd5e1,
        );
        mesh.userData.siteExteriorZoneId = zone.id;
        mesh.receiveShadow = true;
      }
    }

    if (facadeDesign && shellBounds && showAllFloors && !interiorMode) {
      const buildingHeight = (Math.max(0, ...levels.map((level) => level.floor)) + 1) * 2.96;
      for (const box of buildFacadeMeshBoxes(facadeDesign, shellBounds, buildingHeight, frontSide)) {
        const material = getFacadeMaterial(box.materialId);
        makeBox(modelRoot, box.width, box.height, box.depth, box.x, box.y, box.z,
          Number.parseInt(material.baseColor.slice(1), 16),
          { transparent: box.opacity < 1, opacity: box.opacity });
      }
    }
    const sceneBounds = new THREE.Box3().setFromObject(modelRoot);
    const hasRenderableContent = modelRoot.children.length > 0 && !sceneBounds.isEmpty();
    if (hasRenderableContent && !runtime.contentFramed) {
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      sceneBounds.getSize(size);
      sceneBounds.getCenter(center);
      const horizontalSpan = Math.max(6, size.x, size.z);
      const verticalSpan = Math.max(3, size.y);
      // Tela em pé (celular) tem campo de visão horizontal estreito: afasta a câmera para a casa caber.
      const narrowFit = runtime.camera.aspect < 1 ? 1 / Math.max(0.45, runtime.camera.aspect) : 1;
      const distance = Math.max(9, horizontalSpan * 1.35, verticalSpan * 2.4) * narrowFit / Math.max(0.65, cameraZoom);
      runtime.contentCenter = { x: center.x, y: center.y, z: center.z, span: horizontalSpan };
      const radians = ((cameraPresetDegrees + FRONT_CAMERA_OFFSET[frontSide ?? "bottom"]) * Math.PI) / 180;
      runtime.camera.position.set(
        center.x + Math.sin(radians) * distance,
        center.y + Math.max(5.2, distance * 0.48),
        center.z + Math.cos(radians) * distance,
      );
      runtime.controls.target.set(center.x, Math.max(1.25, center.y), center.z);
      runtime.camera.near = 0.05;
      runtime.camera.far = Math.max(500, distance * 20);
      runtime.camera.updateProjectionMatrix();
      runtime.controls.update();
      // Descarta a animação de câmera pedida antes do enquadramento (mirava o centro do lote).
      runtime.cameraGoal = null;
      runtime.contentFramed = true;
    }
    setSceneContentReady(hasRenderableContent);
    onReady?.(hasRenderableContent);

  }, [
    activeFloor,
    cameraPresetDegrees,
    cameraZoom,
    engineState,
    interiorMode,
    levels,
    lightingMode,
    renderQuality,
    lotDepth,
    lotWidth,
    objects,
    showAllFloors,
    showRoof,
    roof,
    visibleFloors,
    facadeDesign,
    frontSide,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready") return;
    runtime.walkControl = {
      forward: Math.max(-1, Math.min(1, walkControl.forward || 0)),
      strafe: Math.max(-1, Math.min(1, walkControl.strafe || 0)),
    };
  }, [engineState, walkControl.forward, walkControl.strafe]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready") return;
    runtime.walkSpeed = Math.max(0.05, Math.min(0.28, walkSpeed));
  }, [engineState, walkSpeed]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || navigationMode !== "tour" || !tourPoint) return;

    const floorY = tourPoint.floor * 2.96 + 1.62;
    const x = Math.max(-lotWidth / 2 + 0.45, Math.min(lotWidth / 2 - 0.45, tourPoint.x - lotWidth / 2));
    const z = Math.max(-lotDepth / 2 + 0.45, Math.min(lotDepth / 2 - 0.45, tourPoint.y - lotDepth / 2));

    const toCenterX = -x;
    const toCenterZ = -z;
    const length = Math.max(0.001, Math.hypot(toCenterX, toCenterZ));
    const lookDistance = 4.2;
    const targetX = x + (toCenterX / length) * lookDistance;
    const targetZ = z + (toCenterZ / length) * lookDistance;

    runtime.cameraGoal = {
      position: { x, y: floorY, z },
      target: { x: targetX, y: floorY, z: targetZ },
    };
  }, [engineState, lotDepth, lotWidth, navigationMode, tourPoint?.floor, tourPoint?.token, tourPoint?.x, tourPoint?.y]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || !panoramaExportToken) return;
    if (!runtime.panoramaRenderTarget?.texture) {
      onPanoramaExportError?.("Abra o modo Panorama 360° antes de exportar.");
      return;
    }

    const { THREE, renderer } = runtime;
    const width = Math.max(1024, Math.min(8192, Math.round(panoramaExportWidth)));
    const height = Math.round(width / 2);
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        cubeMap: { value: runtime.panoramaRenderTarget.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform samplerCube cubeMap;
        varying vec2 vUv;
        const float PI = 3.1415926535897932384626433832795;
        void main() {
          float longitude = (vUv.x * 2.0 - 1.0) * PI;
          float latitude = (0.5 - vUv.y) * PI;
          float cosLat = cos(latitude);
          vec3 dir = normalize(vec3(
            sin(longitude) * cosLat,
            sin(latitude),
            cos(longitude) * cosLat
          ));
          gl_FragColor = textureCube(cubeMap, dir);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    const previousTarget = renderer.getRenderTarget?.() ?? null;
    try {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);

      const pixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      renderer.setRenderTarget(previousTarget);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D indisponível.");

      const image = ctx.createImageData(width, height);
      const rowSize = width * 4;
      for (let y = 0; y < height; y += 1) {
        const srcOffset = (height - 1 - y) * rowSize;
        const dstOffset = y * rowSize;
        image.data.set(pixels.subarray(srcOffset, srcOffset + rowSize), dstOffset);
      }
      ctx.putImageData(image, 0, 0);
      onPanoramaExport?.(canvas.toDataURL("image/png", 1));
    } catch (error) {
      onPanoramaExportError?.(error instanceof Error ? error.message : "Falha ao exportar panorama 360°.");
    } finally {
      renderer.setRenderTarget(previousTarget);
      material.dispose?.();
      quad.geometry?.dispose?.();
      target.dispose?.();
    }
  }, [engineState, onPanoramaExport, onPanoramaExportError, panoramaExportToken, panoramaExportWidth]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || !cameraSnapshotToken) return;
    onCameraSnapshot?.({
      position: {
        x: Number(runtime.camera.position.x.toFixed(4)),
        y: Number(runtime.camera.position.y.toFixed(4)),
        z: Number(runtime.camera.position.z.toFixed(4)),
      },
      target: {
        x: Number(runtime.controls.target.x.toFixed(4)),
        y: Number(runtime.controls.target.y.toFixed(4)),
        z: Number(runtime.controls.target.z.toFixed(4)),
      },
    });
  }, [cameraSnapshotToken, engineState, onCameraSnapshot]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || !savedCameraViewpoint) return;
    runtime.navigationMode = "orbit";
    runtime.walkKeys.clear();
    runtime.controls.enabled = true;
    runtime.cameraGoal = {
      position: { ...savedCameraViewpoint.position },
      target: { ...savedCameraViewpoint.target },
    };
  }, [engineState, savedCameraViewpoint]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready" || navigationMode !== "walk") return;
    const floorY = activeFloor * 2.96 + 1.62;
    const startZ = Math.min(lotDepth / 2 - 0.8, 2.5);
    runtime.camera.position.set(0, floorY, startZ);
    runtime.walkYaw = Math.PI;
    runtime.walkPitch = 0;
    runtime.walkKeys.clear();
    runtime.walkControl = { forward: 0, strafe: 0 };
    const lookDistance = 5;
    runtime.controls.target.set(0, floorY, startZ + lookDistance);
  }, [activeFloor, engineState, lotDepth, navigationMode, walkResetToken]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || engineState !== "ready") return;

    if (runtime.navigationMode === "panorama" && navigationMode !== "panorama") {
      if (runtime.panoramaHiddenObjects) {
        for (const entry of runtime.panoramaHiddenObjects) entry.object.visible = entry.visible;
      }
      runtime.scene.background = runtime.panoramaPreviousBackground ?? null;
      if (typeof runtime.panoramaModelRootVisible === "boolean") {
        runtime.modelRoot.visible = runtime.panoramaModelRootVisible;
      }
      if (runtime.panoramaPreviousCamera) {
        runtime.camera.position.set(
          runtime.panoramaPreviousCamera.position.x,
          runtime.panoramaPreviousCamera.position.y,
          runtime.panoramaPreviousCamera.position.z,
        );
        runtime.controls.target.set(
          runtime.panoramaPreviousCamera.target.x,
          runtime.panoramaPreviousCamera.target.y,
          runtime.panoramaPreviousCamera.target.z,
        );
        runtime.camera.fov = runtime.panoramaPreviousCamera.fov;
        runtime.camera.updateProjectionMatrix();
      }
      runtime.panoramaRenderTarget?.dispose?.();
      runtime.panoramaRenderTarget = undefined;
      runtime.panoramaPreviousBackground = undefined;
      runtime.panoramaHiddenObjects = undefined;
      runtime.panoramaModelRootVisible = undefined;
      runtime.panoramaPreviousCamera = undefined;
    }

    runtime.navigationMode = navigationMode;
    runtime.walkKeys.clear();
    runtime.cameraGoal = null;
    runtime.controls.enabled = navigationMode === "orbit";

    if (navigationMode === "panorama") {
      const { THREE, scene, camera, renderer, controls } = runtime;
      if (THREE?.WebGLCubeRenderTarget && THREE?.CubeCamera && !runtime.panoramaRenderTarget) {
        runtime.panoramaPreviousBackground = scene.background;
        runtime.panoramaPreviousCamera = {
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
          fov: camera.fov,
        };
        const direction = controls.target.clone().sub(camera.position).normalize();
        runtime.walkYaw = Math.atan2(-direction.x, -direction.z || -1);
        runtime.walkPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));

        const cubeSize = renderQuality === "ultra" ? 2048 : renderQuality === "fast" ? 512 : 1024;
        const renderTarget = new THREE.WebGLCubeRenderTarget(cubeSize, {
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
          magFilter: THREE.LinearFilter,
        });
        const cubeCamera = new THREE.CubeCamera(0.05, 500, renderTarget);
        cubeCamera.position.copy(camera.position);
        scene.add(cubeCamera);
        cubeCamera.update(renderer, scene);
        scene.remove(cubeCamera);

        const hidden: Array<{ object: any; visible: boolean }> = [];
        scene.traverse((object: any) => {
          if (object?.isMesh) {
            hidden.push({ object, visible: object.visible });
            object.visible = false;
          }
        });
        runtime.panoramaHiddenObjects = hidden;
        runtime.panoramaModelRootVisible = runtime.modelRoot.visible;
        runtime.modelRoot.visible = false;
        runtime.panoramaRenderTarget = renderTarget;
        scene.background = renderTarget.texture;
        camera.fov = 72;
        camera.updateProjectionMatrix();
      }
      runtime.walkKeys.clear();
      runtime.walkControl = { forward: 0, strafe: 0 };
    } else if (navigationMode === "tour") {
      runtime.walkPitch = 0;
      runtime.walkKeys.clear();
      runtime.walkControl = { forward: 0, strafe: 0 };
    } else if (navigationMode === "walk") {
      const floorY = activeFloor * 2.96 + 1.62;
      runtime.camera.position.y = floorY;
      runtime.walkYaw = Math.atan2(-runtime.camera.position.x, -runtime.camera.position.z || -1);
      runtime.walkPitch = 0;
      const lookDistance = 5;
      runtime.controls.target.set(
        runtime.camera.position.x - Math.sin(runtime.walkYaw) * lookDistance,
        floorY,
        runtime.camera.position.z - Math.cos(runtime.walkYaw) * lookDistance,
      );
    } else {
      const radius = Math.max(9, Math.hypot(lotWidth, lotDepth) * 0.82) / Math.max(0.6, cameraZoom);
      const radians = ((cameraPresetDegrees + FRONT_CAMERA_OFFSET[frontSide ?? "bottom"]) * Math.PI) / 180;
      runtime.cameraGoal = {
        position: {
          x: Math.sin(radians) * radius,
          y: Math.max(5.5, radius * 0.54),
          z: Math.cos(radians) * radius,
        },
        target: {
          x: 0,
          y: Math.max(1.5, levels.length * 1.15),
          z: 0,
        },
      };
    }
  }, [activeFloor, cameraPresetDegrees, cameraZoom, engineState, levels.length, lotDepth, lotWidth, navigationMode, renderQuality, frontSide]);

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
    if (navigationMode === "orbit" && selectedObjectId) {
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
    navigationMode,
    objects,
  ]);

  return (
    <div
      className={`absolute inset-0 z-[1] transition-opacity duration-150 ${sceneContentReady ? "bg-slate-200 opacity-100" : "pointer-events-none bg-transparent opacity-0"}`}
      onDragOver={handleSceneDragOver}
      onDragLeave={handleSceneDragLeave}
      onDrop={handleSceneDrop}
    >
      <div ref={hostRef} className="h-full w-full" />
      {dragOverScene && engineState === "ready" && (
        <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-orange-400 bg-orange-500/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]">
          <div className="rounded-2xl border border-orange-200 bg-white/95 px-4 py-3 text-center shadow-xl backdrop-blur">
            <div className="text-sm font-bold text-slate-900">Solte para inserir no 3D</div>
            <div className="mt-1 text-[11px] font-semibold text-orange-600">Pavimento {activeFloor + 1} · posição exata pela câmera</div>
          </div>
        </div>
      )}
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
      {engineState === "ready" && navigationMode === "panorama" && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/70 px-4 py-2 text-[11px] font-semibold text-white shadow-xl backdrop-blur">
          Panorama 360° cubemap · arraste para olhar ao redor
        </div>
      )}
            {engineState === "ready" && navigationMode === "walk" && (
        <div data-walk-pad className="absolute bottom-20 right-4 z-20 grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-slate-950/75 p-2 shadow-2xl backdrop-blur md:bottom-5">
          {[
            ["", ""], ["w", "↑"], ["", ""],
            ["a", "←"], ["s", "↓"], ["d", "→"],
          ].map(([key, label], index) => key ? (
            <button
              key={key}
              type="button"
              className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/10 text-lg font-black text-white active:bg-orange-500"
              onPointerDown={(event) => {
                event.preventDefault();
                runtimeRef.current?.walkKeys.add(key);
              }}
              onPointerUp={() => runtimeRef.current?.walkKeys.delete(key)}
              onPointerCancel={() => runtimeRef.current?.walkKeys.delete(key)}
              onPointerLeave={() => runtimeRef.current?.walkKeys.delete(key)}
              aria-label={`Mover ${label}`}
            >
              {label}
            </button>
          ) : <span key={`blank-${index}`} className="h-11 w-11" />)}
        </div>
      )}
      {engineState === "ready" && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] font-semibold text-white shadow-xl backdrop-blur">
          3D Pro · IBL/HDRI · {navigationMode === "walk" ? "WASD/setas para caminhar · arraste para olhar" : "arraste para orbitar · roda/pinça para zoom"}
        </div>
      )}
    </div>
  );
}
