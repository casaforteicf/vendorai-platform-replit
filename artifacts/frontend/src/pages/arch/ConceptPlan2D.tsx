import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Magnet, Maximize2, Move, Route, ZoomIn, ZoomOut } from "lucide-react";
import type { ConceptGeometry, ConceptRoomShape, OpeningMarker } from "./conceptGeometry";
import { orthogonalEnd, snapPointToWallNetwork, snapPointToWallNetworkDetailed, wallLength, wallMidpoint, type ClosedSpace, type WallSnapKind, type WallTopologyEndpointRef, type WallTopologyNode } from "./conceptWallNetwork";

export type ConceptPlanObject = {
  id: string;
  kind: "sofa" | "bed" | "table" | "chair" | "cabinet" | "tv" | "plant" | "lamp" | "rug"
    | "appliance" | "sanitary" | "outdoor"
    | "outlet" | "switch" | "light_point" | "water_point" | "drain_point" | "shower_point" | "faucet_point";
  label: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
  materialId?: string;
  materialScale?: number;
  materialRotation?: number;
  catalogProductId?: string;
  imageUrl?: string;
  supplier?: string;
  price?: number;
  model3dUrl?: string;
  textureUrl?: string;
  materialSelections?: Record<string, {
    materialId: string;
    materialName: string;
    textureUrl?: string;
    grupo?: string;
    priceDelta?: number;
  }>;
  configuredPrice?: number;
};

type Props = {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  lotBoundaryPoints?: Array<{ x: number; y: number }> | null;
  showLotBoundary?: boolean;
  activeFloor?: number;
  geometry: ConceptGeometry;
  closedSpaces?: ClosedSpace[];
  selectedClosedSpaceId?: string | null;
  onSelectClosedSpace?: (spaceId: string | null) => void;
  closedSpaceLabels?: Record<string, string>;
  selectedId: string | null;
  onSelect: (roomId: string) => void;
  onRoomChange?: (roomId: string, patch: Partial<Pick<ConceptRoomShape, "x" | "y" | "width" | "depth">>) => void;
  selectedOpeningId?: string | null;
  onSelectOpening?: (openingId: string | null) => void;
  onOpeningChange?: (openingId: string, patch: { x: number; y: number; type: "door" | "window" }) => void;
  onOpeningWidthChange?: (openingId: string, width: number) => void;
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  onWallMove?: (wallId: string, delta: number) => void;
  customWalls?: Array<{ id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number }>;
  selectedCustomWallId?: string | null;
  onCreateCustomWall?: (wall: { id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number }) => void;
  onSelectCustomWall?: (wallId: string | null) => void;
  onDeleteCustomWall?: (wallId: string) => void;
  onUpdateCustomWall?: (wallId: string, patch: Partial<{ x1: number; y1: number; x2: number; y2: number; thickness: number }>) => void;
  onCustomWallLengthChange?: (wallId: string, length: number) => void;
  topologyNodes?: WallTopologyNode[];
  showDimensions?: boolean;
  onMoveTopologyJunction?: (refs: WallTopologyEndpointRef[], point: { x: number; y: number }) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  interactionMode?: "room" | "space" | "wall" | "opening" | "draw-wall" | "navigate";
  objects?: ConceptPlanObject[];
  previewObjects?: ConceptPlanObject[];
  previewDiagnostics?: {
    score: number;
    quality: number;
    doorZones: Array<{ x: number; y: number; width: number; height: number }>;
    windowZones: Array<{ x: number; y: number; width: number; height: number }>;
  };
  selectedObjectId?: string | null;
  onSelectObject?: (objectId: string | null) => void;
  onObjectChange?: (objectId: string, patch: Partial<Pick<ConceptPlanObject, "x" | "y" | "width" | "depth" | "rotation" | "materialId" | "materialScale" | "materialRotation" | "model3dUrl">>) => void;
  onObjectDrop?: (
    preset: Pick<ConceptPlanObject, "kind" | "label" | "width" | "depth"> &
      Partial<Pick<ConceptPlanObject, "catalogProductId" | "imageUrl" | "supplier" | "price" | "model3dUrl" | "textureUrl">>,
    point: { x: number; y: number },
  ) => void;
  onObjectRotate?: (objectId: string) => void;
  onObjectDuplicate?: (objectId: string) => void;
  onObjectDelete?: (objectId: string) => void;
  roomFloorMaterials?: Record<string, string>;
  spaceFloorMaterials?: Record<string, string>;
  wallMaterials?: Record<string, string>;
  onOpenMaterials?: () => void;
  onRoomDuplicate?: (roomId: string) => void;
  onRoomDelete?: (roomId: string) => void;
  paintTarget?: "object" | "wall" | "floor" | null;
  referenceImage?: {
    url: string;
    opacity?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } | null;
  previewWalls?: Array<{
    id: string;
    floor: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness?: number;
    confidence?: number;
  }>;
  previewOpenings?: Array<{
    id: string;
    wallId: string;
    floor: number;
    type: "door" | "window";
    offset: number;
    width?: number;
    confidence?: number;
  }>;
};

function formatMeters(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function splitRoomLabel(label: string) {
  const clean = label.trim();
  if (clean.length <= 15) return [clean];

  const words = clean.split(/\s+/);
  if (words.length === 1) return [clean.slice(0, 14)];

  let bestIndex = 1;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const diff = Math.abs(left.length - right.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  }

  return [
    words.slice(0, bestIndex).join(" "),
    words.slice(bestIndex).join(" "),
  ].filter(Boolean);
}

function fitLabelSize(label: string, width: number, depth: number) {
  const lines = splitRoomLabel(label);
  const longest = Math.max(...lines.map((line) => line.length), 5);
  const widthSize = (Math.max(1.1, width - 0.5) * 1.45) / longest;
  const depthSize = depth < 1.8 ? 0.22 : depth < 2.4 ? 0.27 : 0.32;
  return Math.max(0.2, Math.min(0.34, widthSize, depthSize));
}

const OBJECT_MATERIALS: Record<string, { fill: string; stroke: string; detail: string }> = {
  "tecido-cinza": { fill: "#cbd5e1", stroke: "#64748b", detail: "#94a3b8" },
  "tecido-bege": { fill: "#e7e5e4", stroke: "#a8a29e", detail: "#d6d3d1" },
  "linho-claro": { fill: "#f5f5f4", stroke: "#a8a29e", detail: "#e7e5e4" },
  "madeira-clara": { fill: "#d6c2a8", stroke: "#8b7355", detail: "#b99a73" },
  "madeira-escura": { fill: "#8b6b52", stroke: "#574437", detail: "#705441" },
  "preto-fosco": { fill: "#334155", stroke: "#0f172a", detail: "#1e293b" },
  "branco-fosco": { fill: "#ffffff", stroke: "#cbd5e1", detail: "#f1f5f9" },
  "folhagem-verde": { fill: "#86a97a", stroke: "#3f6212", detail: "#bbd3a9" },
};

function objectMaterial(object: ConceptPlanObject) {
  return OBJECT_MATERIALS[object.materialId ?? ""] ?? OBJECT_MATERIALS[
    object.kind === "bed" ? "linho-claro"
      : object.kind === "table" || object.kind === "cabinet" ? "madeira-clara"
      : object.kind === "tv" || object.kind === "lamp" ? "preto-fosco"
      : object.kind === "plant" ? "folhagem-verde"
      : object.kind === "rug" ? "tecido-bege"
      : "tecido-cinza"
  ];
}

const FLOOR_MATERIAL_FILL: Record<string, string> = {
  "porcelanato-claro": "#e7e5e4",
  "cimento-queimado": "#d1d5db",
  "madeira-carvalho": "#dbc5a5",
  "madeira-nogueira": "#9a775d",
  "pedra-natural": "#d6d3d1",
  "ceramica-clara": "#f5f5f4",
  "vinilico-claro": "#e5d3b3",
};

function floorMaterialFill(id?: string) {
  return id ? FLOOR_MATERIAL_FILL[id] : undefined;
}

const WALL_MATERIAL_STROKE: Record<string, string> = {
  "pintura-branca": "#cbd5e1",
  "pintura-cinza": "#94a3b8",
  "cimento-aparente": "#6b7280",
  "madeira-ripada": "#8b5e3c",
  "pedra-cinza": "#57534e",
  "preto-fosco-parede": "#111827",
};

function wallMaterialStroke(id?: string) {
  return id ? WALL_MATERIAL_STROKE[id] : undefined;
}

const ROOM_FILL: Record<string, string> = {
  sala: "#f8fafc",
  cozinha: "#f8fafc",
  suite: "#ffffff",
  quarto: "#ffffff",
  banheiro: "#f1f5f9",
  lavanderia: "#f1f5f9",
  garagem: "#f8fafc",
  gourmet: "#fffaf5",
  piscina: "#e0f2fe",
  circulacao: "#f8fafc",
  escada: "#eef2f7",
  outro: "#ffffff",
};

function doorGlyph(opening: OpeningMarker) {
  const r = 0.82;
  if (opening.orientation === "horizontal") {
    return (
      <g key={opening.id} pointerEvents="none">
        <line
          x1={opening.x - r / 2}
          y1={opening.y}
          x2={opening.x + r / 2}
          y2={opening.y}
          stroke="#ffffff"
          strokeWidth="0.22"
        />
        <line
          x1={opening.x - r / 2}
          y1={opening.y}
          x2={opening.x - r / 2}
          y2={opening.y + r}
          stroke="#475569"
          strokeWidth="0.06"
        />
        <path
          d={`M ${opening.x - r / 2} ${opening.y + r} A ${r} ${r} 0 0 1 ${opening.x + r / 2} ${opening.y}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="0.04"
          strokeDasharray="0.08 0.06"
        />
      </g>
    );
  }
  return (
    <g key={opening.id} pointerEvents="none">
      <line
        x1={opening.x}
        y1={opening.y - r / 2}
        x2={opening.x}
        y2={opening.y + r / 2}
        stroke="#ffffff"
        strokeWidth="0.22"
      />
      <line
        x1={opening.x}
        y1={opening.y - r / 2}
        x2={opening.x + r}
        y2={opening.y - r / 2}
        stroke="#475569"
        strokeWidth="0.06"
      />
      <path
        d={`M ${opening.x + r} ${opening.y - r / 2} A ${r} ${r} 0 0 1 ${opening.x} ${opening.y + r / 2}`}
        fill="none"
        stroke="#94a3b8"
        strokeWidth="0.04"
        strokeDasharray="0.08 0.06"
      />
    </g>
  );
}


function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  offsetX = 0,
  offsetY = 0,
  label,
  tone = "#475569",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offsetX?: number;
  offsetY?: number;
  label: string;
  tone?: string;
}) {
  const ax = x1 + offsetX;
  const ay = y1 + offsetY;
  const bx = x2 + offsetX;
  const by = y2 + offsetY;
  const horizontal = Math.abs(y1 - y2) < 0.01;
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;

  return (
    <g pointerEvents="none">
      <line x1={x1} y1={y1} x2={ax} y2={ay} stroke={tone} strokeOpacity="0.62" strokeWidth="0.035" />
      <line x1={x2} y1={y2} x2={bx} y2={by} stroke={tone} strokeOpacity="0.62" strokeWidth="0.035" />
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke={tone} strokeWidth="0.04" />
      {horizontal ? (
        <>
          <line x1={ax} y1={ay - 0.12} x2={ax} y2={ay + 0.12} stroke={tone} strokeWidth="0.04" />
          <line x1={bx} y1={by - 0.12} x2={bx} y2={by + 0.12} stroke={tone} strokeWidth="0.04" />
        </>
      ) : (
        <>
          <line x1={ax - 0.12} y1={ay} x2={ax + 0.12} y2={ay} stroke={tone} strokeWidth="0.04" />
          <line x1={bx - 0.12} y1={by} x2={bx + 0.12} y2={by} stroke={tone} strokeWidth="0.04" />
        </>
      )}
      <rect
        x={midX - 0.56}
        y={midY - 0.22}
        width="1.12"
        height="0.42"
        rx="0.09"
        fill="#ffffff"
        fillOpacity="0.94"
        stroke={tone}
        strokeOpacity="0.2"
        strokeWidth="0.025"
      />
      <text
        x={midX}
        y={midY + 0.035}
        textAnchor="middle"
        fontSize="0.23"
        fontWeight="800"
        fill={tone}
      >
        {label}
      </text>
    </g>
  );
}

export default function ConceptPlan2D({
  rooms,
  lotWidth,
  lotDepth,
  lotBoundaryPoints = null,
  showLotBoundary = true,
  activeFloor = 0,
  geometry,
  closedSpaces = [],
  selectedClosedSpaceId = null,
  onSelectClosedSpace,
  closedSpaceLabels = {},
  selectedId,
  onSelect,
  onRoomChange,
  selectedOpeningId = null,
  onSelectOpening,
  onOpeningChange,
  onOpeningWidthChange,
  selectedWallId = null,
  onSelectWall,
  onWallMove,
  customWalls = [],
  selectedCustomWallId = null,
  onCreateCustomWall,
  onSelectCustomWall,
  onDeleteCustomWall,
  onUpdateCustomWall,
  onCustomWallLengthChange,
  topologyNodes = [],
  showDimensions = true,
  onMoveTopologyJunction,
  onEditStart,
  onEditEnd,
  interactionMode = "room",
  objects = [],
  previewObjects = [],
  previewDiagnostics,
  selectedObjectId = null,
  onSelectObject,
  onObjectChange,
  onObjectDrop,
  onObjectRotate,
  onObjectDuplicate,
  onObjectDelete,
  roomFloorMaterials = {},
  spaceFloorMaterials = {},
  wallMaterials = {},
  onOpenMaterials,
  onRoomDuplicate,
  onRoomDelete,
  paintTarget = null,
  referenceImage = null,
  previewWalls = [],
  previewOpenings = [],
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
      : [
          { x: 0, y: 0 },
          { x: lotWidth, y: 0 },
          { x: lotWidth, y: lotDepth },
          { x: 0, y: lotDepth },
        ],
    [lotBoundaryPoints, lotWidth, lotDepth],
  );
  const lotPointsAttribute = useMemo(
    () => effectiveLotBoundary.map((point) => `${point.x},${point.y}`).join(" "),
    [effectiveLotBoundary],
  );
  const lotClipId = useId().replace(/:/g, "");
  const effectiveLotBoundary = useMemo(
    () => Array.isArray(lotBoundaryPoints) && lotBoundaryPoints.length >= 3
      ? lotBoundaryPoints
      : [
          { x: 0, y: 0 },
          { x: lotWidth, y: 0 },
          { x: lotWidth, y: lotDepth },
          { x: 0, y: lotDepth },
        ],
    [lotBoundaryPoints, lotWidth, lotDepth],
  );
  const lotPointsAttribute = useMemo(
    () => effectiveLotBoundary.map((point) => `${point.x},${point.y}`).join(" "),
    [effectiveLotBoundary],
  );
  const previewWallMap = useMemo(
    () => new Map(previewWalls.map((wall) => [wall.id, wall])),
    [previewWalls],
  );
  const [wallDrawStart, setWallDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [wallChainOrigin, setWallChainOrigin] = useState<{ x: number; y: number } | null>(null);
  const [wallDrawPreview, setWallDrawPreview] = useState<{ x: number; y: number } | null>(null);
  const [wallLengthInput, setWallLengthInput] = useState("");
  const [wallLengthError, setWallLengthError] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [orthogonalEnabled, setOrthogonalEnabled] = useState(true);
  const pendingClosedSpaceSelectRef = useRef(false);
  const previousClosedSpaceIdsRef = useRef(new Set<string>());
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});
  const [activeWallSnap, setActiveWallSnap] = useState<{ kind: WallSnapKind; point: { x: number; y: number } } | null>(null);
  const [gesture, setGesture] = useState<null | {
    roomId: string;
    openingId?: string;
    wallId?: string;
    customWallId?: string;
    objectId?: string;
    junctionRefs?: WallTopologyEndpointRef[];
    mode: "move" | "object" | "object-resize-n" | "object-resize-s" | "object-resize-e" | "object-resize-w" | "object-resize-ne" | "object-resize-nw" | "object-resize-se" | "object-resize-sw" | "object-rotate" | "wall" | "opening" | "opening-resize-start" | "opening-resize-end" | "custom-wall-start" | "custom-wall-end" | "custom-wall-move" | "topology-junction" | "resize-n" | "resize-s" | "resize-e" | "resize-w" | "resize-ne" | "resize-nw" | "resize-se" | "resize-sw";
    wallX1?: number;
    wallY1?: number;
    wallX2?: number;
    wallY2?: number;
    startX: number;
    startY: number;
    roomX: number;
    roomY: number;
    roomWidth: number;
    roomDepth: number;
    objectX?: number;
    objectY?: number;
    objectWidth?: number;
    objectDepth?: number;
    objectRotation?: number;
    objectCenterX?: number;
    objectCenterY?: number;
    objectStartAngle?: number;
  }>(null);

  useEffect(() => {
    if (interactionMode !== "draw-wall") {
      setWallDrawStart(null);
      setWallChainOrigin(null);
      setWallDrawPreview(null);
      setWallLengthInput("");
      setWallLengthError(null);
      setActiveWallSnap(null);
      pendingClosedSpaceSelectRef.current = false;
    }
  }, [interactionMode]);

  useEffect(() => {
    const currentIds = new Set(closedSpaces.map((space) => space.id));
    if (pendingClosedSpaceSelectRef.current && onSelectClosedSpace) {
      const created = closedSpaces.find((space) => !previousClosedSpaceIdsRef.current.has(space.id));
      if (created) {
        onSelectClosedSpace(created.id);
        pendingClosedSpaceSelectRef.current = false;
      }
    }
    previousClosedSpaceIdsRef.current = currentIds;
  }, [closedSpaces, onSelectClosedSpace]);

  const [viewportAspect, setViewportAspect] = useState(16 / 9);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const updateAspect = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 20 && rect.height > 20) {
        setViewportAspect(Math.max(0.7, Math.min(3.2, rect.width / rect.height)));
      }
    };
    updateAspect();
    const observer = new ResizeObserver(updateAspect);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const projectBounds = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    const include = (x: number, y: number) => {
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x);
        ys.push(y);
      }
    };

    rooms.forEach((room) => {
      include(room.x, room.y);
      include(room.x + room.width, room.y + room.depth);
    });
    geometry.walls.forEach((wall) => {
      include(wall.x1, wall.y1);
      include(wall.x2, wall.y2);
    });
    customWalls.forEach((wall) => {
      include(wall.x1, wall.y1);
      include(wall.x2, wall.y2);
    });
    closedSpaces.forEach((space) => {
      include(space.bounds.x, space.bounds.y);
      include(space.bounds.x + space.bounds.width, space.bounds.y + space.bounds.height);
    });
    objects.forEach((object) => {
      include(object.x, object.y);
      include(object.x + object.width, object.y + object.depth);
    });
    previewObjects.forEach((object) => {
      include(object.x, object.y);
      include(object.x + object.width, object.y + object.depth);
    });

    if (!xs.length || !ys.length) {
      return { minX: 0, minY: 0, maxX: lotWidth, maxY: lotDepth, hasProject: false };
    }

    // Never clamp imported/project geometry to the lot here.
    // Imported plans can legitimately sit outside the lot origin while being
    // calibrated. Clamping the bounds makes fit-to-screen center on the wrong
    // area and leaves the actual drawing partially or completely off-screen.
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
      hasProject: true,
    };
  }, [rooms, geometry.walls, customWalls, closedSpaces, objects, previewObjects, lotWidth, lotDepth]);

  const fitView = useMemo(() => {
    const projectWidth = Math.max(0.01, projectBounds.maxX - projectBounds.minX);
    const projectHeight = Math.max(0.01, projectBounds.maxY - projectBounds.minY);
    // Keep the drawing visually dominant (roughly 70–80% of the canvas)
    // instead of wasting most of the viewport on empty grid.
    const projectSpan = Math.max(projectWidth, projectHeight);
    const margin = projectBounds.hasProject
      ? Math.max(0.65, Math.min(1.5, projectSpan * 0.1))
      : 2.2;
    const centerX = (projectBounds.minX + projectBounds.maxX) / 2;
    const centerY = (projectBounds.minY + projectBounds.maxY) / 2;
    let width = Math.max(4, projectWidth + margin * 2);
    let height = Math.max(4, projectHeight + margin * 2);

    if (width / height > viewportAspect) {
      height = width / viewportAspect;
    } else {
      width = height * viewportAspect;
    }

    return {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
  }, [projectBounds, viewportAspect]);

  const workingView = useMemo(() => {
    // The initial view must always contain the entire project.
    // Extra zoom on tall/narrow plans caused the top/bottom of the floor plan
    // to be clipped as soon as the editor opened.
    return fitView;
  }, [fitView]);

  const [view, setView] = useState(workingView);
  const [panGesture, setPanGesture] = useState<null | {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startViewX: number;
    startViewY: number;
  }>(null);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<null | {
    startDistance: number;
    startView: { x: number; y: number; width: number; height: number };
    anchor: { x: number; y: number };
  }>(null);
  const spacePanRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (editingText) return;

      if (event.code === "Space") {
        spacePanRef.current = true;
        return;
      }

      if (event.key.toLowerCase() === "f" || event.key === "0") {
        event.preventDefault();
        setView(fitView);
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomView(0.84);
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomView(1.18);
        return;
      }

      if (interactionMode === "draw-wall" && wallDrawStart) {
        if (/^[0-9]$/.test(event.key)) {
          event.preventDefault();
          setWallLengthError(null);
          setWallLengthInput((current) => `${current}${event.key}`);
          return;
        }
        if ((event.key === "," || event.key === ".") && !wallLengthInput.includes(",") && !wallLengthInput.includes(".")) {
          event.preventDefault();
          setWallLengthError(null);
          setWallLengthInput((current) => current ? `${current},` : "0,");
          return;
        }
        if (event.key === "Backspace" && wallLengthInput) {
          event.preventDefault();
          setWallLengthError(null);
          setWallLengthInput((current) => current.slice(0, -1));
          return;
        }
        if (event.key === "Enter" && wallLengthInput.trim()) {
          event.preventDefault();
          const requestedLength = Number(wallLengthInput.replace(",", "."));
          if (Number.isFinite(requestedLength) && requestedLength >= 0.5 && wallDrawPreview && onCreateCustomWall) {
            const dx = wallDrawPreview.x - wallDrawStart.x;
            const dy = wallDrawPreview.y - wallDrawStart.y;
            const magnitude = Math.hypot(dx, dy);
            const direction = magnitude > 0.001
              ? { x: dx / magnitude, y: dy / magnitude }
              : { x: 1, y: 0 };
            const rawEnd = {
              x: wallDrawStart.x + direction.x * requestedLength,
              y: wallDrawStart.y + direction.y * requestedLength,
            };
            if (rawEnd.x < 0 || rawEnd.x > lotWidth || rawEnd.y < 0 || rawEnd.y > lotDepth) {
              setWallLengthError("A medida ultrapassa o limite do terreno.");
              return;
            }
            const end = rawEnd;
            const actualLength = Math.hypot(end.x - wallDrawStart.x, end.y - wallDrawStart.y);
            if (actualLength >= 0.5) {
              onCreateCustomWall({
                id: `custom-wall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                floor: activeFloor,
                x1: wallDrawStart.x,
                y1: wallDrawStart.y,
                x2: end.x,
                y2: end.y,
                thickness: 0.15,
              });
              setWallDrawStart(end);
              setWallDrawPreview(end);
              setWallLengthInput("");
              setWallLengthError(null);
            }
          }
          return;
        }
      }

      if (interactionMode === "draw-wall" && (event.key === "Escape" || event.key === "Enter")) {
        event.preventDefault();
        setWallDrawStart(null);
        setWallChainOrigin(null);
        setWallDrawPreview(null);
        setWallLengthInput("");
        setWallLengthError(null);
        setSnapGuides({});
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePanRef.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [activeFloor, fitView, interactionMode, onCreateCustomWall, wallDrawPreview, wallDrawStart, wallLengthInput]);





  const autoFitKey = `${activeFloor}:${rooms.length}:${customWalls.length}:${closedSpaces.length}:${objects.length}:${geometry.walls.length}:${lotWidth}:${lotDepth}`;
  useEffect(() => {
    setView(workingView);
  }, [autoFitKey, viewportAspect]);

  const zoomView = (factor: number, anchor?: { x: number; y: number }) => {
    setView((current) => {
      const minWidth = Math.max(2.5, fitView.width * 0.16);
      const maxWidth = fitView.width * 1.45;
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, current.width * factor));
      const ratio = nextWidth / current.width;
      const nextHeight = current.height * ratio;
      const focus = anchor ?? {
        x: current.x + current.width / 2,
        y: current.y + current.height / 2,
      };
      const fx = (focus.x - current.x) / current.width;
      const fy = (focus.y - current.y) / current.height;
      return {
        x: focus.x - nextWidth * fx,
        y: focus.y - nextHeight * fy,
        width: nextWidth,
        height: nextHeight,
      };
    });
  };

  const resetView = () => setView(fitView);
  const zoomPercent = Math.max(25, Math.min(400, Math.round((fitView.width / Math.max(0.001, view.width)) * 100)));

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const result = point.matrixTransform(matrix.inverse());
    return { x: result.x, y: result.y };
  };

  const snap = (value: number) => snapEnabled ? Math.round(value * 4) / 4 : value;

  const wallNetwork = [
    ...geometry.walls.map((wall) => ({
      id: wall.id,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
    })),
    ...customWalls,
  ];

  const boundPoint = (point: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(lotWidth, point.x)),
    y: Math.max(0, Math.min(lotDepth, point.y)),
  });

  const clampPoint = (point: { x: number; y: number }) => {
    const bounded = boundPoint(point);
    return { x: snap(bounded.x), y: snap(bounded.y) };
  };

  const handleDrawWallPoint = (point: { x: number; y: number }) => {
    const clamped = clampPoint(point);
    const snapResult = snapEnabled
      ? snapPointToWallNetworkDetailed(clamped, wallNetwork, 0.35)
      : { point: clamped, kind: "none" as const, distance: Number.POSITIVE_INFINITY };
    const snapped = clampPoint(snapResult.point);
    setActiveWallSnap(snapResult.kind === "none" ? null : { kind: snapResult.kind, point: snapped });
    if (!wallDrawStart) {
      setWallDrawStart(snapped);
      setWallChainOrigin(snapped);
      setWallDrawPreview(snapped);
      setWallLengthInput("");
      return;
    }

    const rawEnd = orthogonalEnabled ? orthogonalEnd(wallDrawStart, snapped) : snapped;
    const endSnapResult = snapEnabled
      ? snapPointToWallNetworkDetailed(rawEnd, wallNetwork, 0.35)
      : { point: rawEnd, kind: "none" as const, distance: Number.POSITIVE_INFINITY };
    const networkEnd = endSnapResult.point;
    let end = clampPoint(orthogonalEnabled ? orthogonalEnd(wallDrawStart, networkEnd) : networkEnd);
    setActiveWallSnap(endSnapResult.kind === "none" ? null : { kind: endSnapResult.kind, point: end });
    const closeThreshold = 0.42;
    const nearOrigin = wallChainOrigin
      ? Math.hypot(end.x - wallChainOrigin.x, end.y - wallChainOrigin.y) <= closeThreshold
      : false;
    if (nearOrigin && wallChainOrigin) {
      end = wallChainOrigin;
    }

    const length = Math.hypot(end.x - wallDrawStart.x, end.y - wallDrawStart.y);
    if (length >= 0.5 && onCreateCustomWall) {
      onCreateCustomWall({
        id: `custom-wall-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        floor: activeFloor,
        x1: wallDrawStart.x,
        y1: wallDrawStart.y,
        x2: end.x,
        y2: end.y,
        thickness: 0.15,
      });
      if (nearOrigin) {
        pendingClosedSpaceSelectRef.current = true;
        setWallDrawStart(null);
        setWallChainOrigin(null);
        setWallDrawPreview(null);
        setWallLengthInput("");
      } else {
        setWallDrawStart(end);
        setWallDrawPreview(end);
        setWallLengthInput("");
      }
      return;
    }
    setWallDrawPreview(wallDrawStart);
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = toSvgPoint(event.clientX, event.clientY);
    zoomView(event.deltaY > 0 ? 1.12 : 0.88, point);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current && touchPointersRef.current.size >= 2) {
        const points = [...touchPointersRef.current.values()].slice(0, 2);
        const distance = Math.max(8, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
        const factor = pinchRef.current.startDistance / distance;
        const startView = pinchRef.current.startView;
        const minWidth = Math.max(2.5, fitView.width * 0.16);
        const maxWidth = fitView.width * 1.45;
        const nextWidth = Math.max(minWidth, Math.min(maxWidth, startView.width * factor));
        const ratio = nextWidth / startView.width;
        const nextHeight = startView.height * ratio;
        const anchor = pinchRef.current.anchor;
        const fx = (anchor.x - startView.x) / startView.width;
        const fy = (anchor.y - startView.y) / startView.height;
        setView({
          x: anchor.x - nextWidth * fx,
          y: anchor.y - nextHeight * fy,
          width: nextWidth,
          height: nextHeight,
        });
        return;
      }
    }
    if (panGesture && (interactionMode === "navigate" || spacePanRef.current)) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((event.clientX - panGesture.startClientX) / Math.max(1, rect.width)) * view.width;
      const dy = ((event.clientY - panGesture.startClientY) / Math.max(1, rect.height)) * view.height;
      setView((current) => ({
        ...current,
        x: panGesture.startViewX - dx,
        y: panGesture.startViewY - dy,
      }));
      return;
    }
    const point = toSvgPoint(event.clientX, event.clientY);
    if (
      gesture?.mode === "topology-junction" &&
      gesture.junctionRefs?.length &&
      onMoveTopologyJunction
    ) {
      onMoveTopologyJunction(gesture.junctionRefs, clampPoint(point));
      return;
    }
    if (interactionMode === "draw-wall" && wallDrawStart) {
      const clamped = clampPoint(point);
      const initialSnap = snapEnabled
        ? snapPointToWallNetworkDetailed(clamped, wallNetwork, 0.35)
        : { point: clamped, kind: "none" as const, distance: Number.POSITIVE_INFINITY };
      const snapped = initialSnap.point;
      const orthogonal = orthogonalEnabled ? orthogonalEnd(wallDrawStart, snapped) : snapped;
      const finalSnap = snapEnabled
        ? snapPointToWallNetworkDetailed(orthogonal, wallNetwork, 0.35)
        : { point: orthogonal, kind: "none" as const, distance: Number.POSITIVE_INFINITY };
      const networkEnd = finalSnap.point;
      let preview = clampPoint(orthogonalEnabled ? orthogonalEnd(wallDrawStart, networkEnd) : networkEnd);
      const snapKind = finalSnap.kind !== "none" ? finalSnap.kind : initialSnap.kind;
      setActiveWallSnap(snapKind === "none" ? null : { kind: snapKind, point: preview });
      if (wallChainOrigin && Math.hypot(preview.x - wallChainOrigin.x, preview.y - wallChainOrigin.y) <= 0.42) {
        preview = wallChainOrigin;
      }
      setWallDrawPreview(preview);
    }
    if (!gesture) return;
    const dx = point.x - gesture.startX;
    const dy = point.y - gesture.startY;

    if (gesture.mode === "object" && gesture.objectId && onObjectChange) {
      const object = objects.find((item) => item.id === gesture.objectId);
      if (!object) return;
      const baseX = gesture.objectX ?? object.x;
      const baseY = gesture.objectY ?? object.y;
      const rawX = Math.max(0, Math.min(lotWidth - object.width, baseX + dx));
      const rawY = Math.max(0, Math.min(lotDepth - object.depth, baseY + dy));
      const rawCenterX = rawX + object.width / 2;
      const rawCenterY = rawY + object.depth / 2;
      const snapThreshold = 0.22;

      const activeRooms = rooms.filter((room) => room.floor === activeFloor);
      const activeObjects = objects.filter((item) => item.id !== object.id && item.floor === activeFloor);
      const xTargets = [
        0,
        lotWidth / 2,
        lotWidth,
        ...activeRooms.flatMap((room) => [room.x, room.x + room.width / 2, room.x + room.width]),
        ...activeObjects.flatMap((item) => [item.x, item.x + item.width / 2, item.x + item.width]),
        ...wallNetwork.flatMap((wall) => Math.abs(wall.x1 - wall.x2) < 0.01 ? [wall.x1] : [wall.x1, wall.x2]),
      ];
      const yTargets = [
        0,
        lotDepth / 2,
        lotDepth,
        ...activeRooms.flatMap((room) => [room.y, room.y + room.depth / 2, room.y + room.depth]),
        ...activeObjects.flatMap((item) => [item.y, item.y + item.depth / 2, item.y + item.depth]),
        ...wallNetwork.flatMap((wall) => Math.abs(wall.y1 - wall.y2) < 0.01 ? [wall.y1] : [wall.y1, wall.y2]),
      ];

      const nearestTarget = (value: number, targets: number[]) => {
        let best: number | undefined;
        let bestDistance = snapThreshold;
        for (const target of targets) {
          const distance = Math.abs(target - value);
          if (distance <= bestDistance) {
            best = target;
            bestDistance = distance;
          }
        }
        return best;
      };

      const xCandidates = [
        { raw: rawX, offset: 0 },
        { raw: rawCenterX, offset: object.width / 2 },
        { raw: rawX + object.width, offset: object.width },
      ]
        .map((candidate) => ({ ...candidate, target: nearestTarget(candidate.raw, xTargets) }))
        .filter((candidate): candidate is typeof candidate & { target: number } => candidate.target != null)
        .sort((a, b) => Math.abs(a.raw - a.target) - Math.abs(b.raw - b.target));
      const yCandidates = [
        { raw: rawY, offset: 0 },
        { raw: rawCenterY, offset: object.depth / 2 },
        { raw: rawY + object.depth, offset: object.depth },
      ]
        .map((candidate) => ({ ...candidate, target: nearestTarget(candidate.raw, yTargets) }))
        .filter((candidate): candidate is typeof candidate & { target: number } => candidate.target != null)
        .sort((a, b) => Math.abs(a.raw - a.target) - Math.abs(b.raw - b.target));

      const bestX = xCandidates[0];
      const bestY = yCandidates[0];
      const guideX = bestX?.target;
      const guideY = bestY?.target;
      const nextX = bestX ? bestX.target - bestX.offset : snap(rawX);
      const nextY = bestY ? bestY.target - bestY.offset : snap(rawY);

      setSnapGuides({ x: guideX, y: guideY });
      onObjectChange(object.id, {
        x: snap(Math.max(0, Math.min(lotWidth - object.width, nextX))),
        y: snap(Math.max(0, Math.min(lotDepth - object.depth, nextY))),
      });
      return;
    }

    if (gesture.mode.startsWith("object-resize-") && gesture.objectId && onObjectChange) {
      const object = objects.find((item) => item.id === gesture.objectId);
      if (!object) return;
      const radians = ((gesture.objectRotation ?? object.rotation) * Math.PI) / 180;
      const localDx = dx * Math.cos(radians) + dy * Math.sin(radians);
      const localDy = -dx * Math.sin(radians) + dy * Math.cos(radians);
      const baseX = gesture.objectX ?? object.x;
      const baseY = gesture.objectY ?? object.y;
      const baseWidth = gesture.objectWidth ?? object.width;
      const baseDepth = gesture.objectDepth ?? object.depth;
      const minSize = 0.3;
      const mode = gesture.mode.replace("object-resize-", "");

      let nextX = baseX;
      let nextY = baseY;
      let nextWidth = baseWidth;
      let nextDepth = baseDepth;

      if (mode.includes("e")) {
        nextWidth = Math.max(minSize, baseWidth + localDx);
      }
      if (mode.includes("s")) {
        nextDepth = Math.max(minSize, baseDepth + localDy);
      }
      if (mode.includes("w")) {
        const proposedWidth = Math.max(minSize, baseWidth - localDx);
        nextX = baseX + (baseWidth - proposedWidth);
        nextWidth = proposedWidth;
      }
      if (mode.includes("n")) {
        const proposedDepth = Math.max(minSize, baseDepth - localDy);
        nextY = baseY + (baseDepth - proposedDepth);
        nextDepth = proposedDepth;
      }

      nextX = Math.max(0, Math.min(lotWidth - minSize, nextX));
      nextY = Math.max(0, Math.min(lotDepth - minSize, nextY));
      nextWidth = Math.max(minSize, Math.min(lotWidth - nextX, nextWidth));
      nextDepth = Math.max(minSize, Math.min(lotDepth - nextY, nextDepth));

      onObjectChange(object.id, {
        x: snap(nextX),
        y: snap(nextY),
        width: snap(nextWidth),
        depth: snap(nextDepth),
      });
      return;
    }

    if (gesture.mode === "object-rotate" && gesture.objectId && onObjectChange) {
      const object = objects.find((item) => item.id === gesture.objectId);
      if (!object) return;
      const centerX = gesture.objectCenterX ?? (object.x + object.width / 2);
      const centerY = gesture.objectCenterY ?? (object.y + object.depth / 2);
      const startAngle = gesture.objectStartAngle ?? Math.atan2(gesture.startY - centerY, gesture.startX - centerX);
      const currentAngle = Math.atan2(point.y - centerY, point.x - centerX);
      const deltaDegrees = ((currentAngle - startAngle) * 180) / Math.PI;
      const baseRotation = gesture.objectRotation ?? object.rotation;
      const normalized = ((baseRotation + deltaDegrees) % 360 + 360) % 360;
      const snappedRotation = Math.round(normalized / 5) * 5;
      onObjectChange(object.id, { rotation: snappedRotation % 360 });
      return;
    }

    if (!onRoomChange) return;

    if (gesture.mode === "custom-wall-move" && gesture.customWallId && onUpdateCustomWall) {
      const wall = customWalls.find((item) => item.id === gesture.customWallId);
      if (!wall) return;
      const originalX1 = gesture.wallX1 ?? wall.x1;
      const originalY1 = gesture.wallY1 ?? wall.y1;
      const originalX2 = gesture.wallX2 ?? wall.x2;
      const originalY2 = gesture.wallY2 ?? wall.y2;

      let moveX = dx;
      let moveY = dy;
      const minX = Math.min(originalX1, originalX2);
      const maxX = Math.max(originalX1, originalX2);
      const minY = Math.min(originalY1, originalY2);
      const maxY = Math.max(originalY1, originalY2);
      moveX = Math.max(-minX, Math.min(lotWidth - maxX, moveX));
      moveY = Math.max(-minY, Math.min(lotDepth - maxY, moveY));

      const nextX1 = snap(originalX1 + moveX);
      const nextY1 = snap(originalY1 + moveY);
      const snappedMoveX = nextX1 - originalX1;
      const snappedMoveY = nextY1 - originalY1;
      onUpdateCustomWall(wall.id, {
        x1: nextX1,
        y1: nextY1,
        x2: originalX2 + snappedMoveX,
        y2: originalY2 + snappedMoveY,
      });
      return;
    }

    if (
      (gesture.mode === "custom-wall-start" || gesture.mode === "custom-wall-end") &&
      gesture.customWallId &&
      onUpdateCustomWall
    ) {
      const wall = customWalls.find((item) => item.id === gesture.customWallId);
      if (!wall) return;
      const originalX1 = gesture.wallX1 ?? wall.x1;
      const originalY1 = gesture.wallY1 ?? wall.y1;
      const originalX2 = gesture.wallX2 ?? wall.x2;
      const originalY2 = gesture.wallY2 ?? wall.y2;
      const clamped = clampPoint(point);
      const snapResult = snapEnabled
        ? snapPointToWallNetworkDetailed(clamped, wallNetwork, 0.35, wall.id)
        : { point: clamped, kind: "none" as const, distance: Number.POSITIVE_INFINITY };
      const snapped = snapResult.point;
      setActiveWallSnap(snapResult.kind === "none" ? null : { kind: snapResult.kind, point: snapped });
      setSnapGuides({ x: snapped.x, y: snapped.y });

      if (gesture.mode === "custom-wall-start") {
        const next = { x1: snapped.x, y1: snapped.y };
        if (Math.hypot(originalX2 - next.x1, originalY2 - next.y1) >= 0.5) {
          onUpdateCustomWall(wall.id, next);
        }
      } else {
        const next = { x2: snapped.x, y2: snapped.y };
        if (Math.hypot(next.x2 - originalX1, next.y2 - originalY1) >= 0.5) {
          onUpdateCustomWall(wall.id, next);
        }
      }
      return;
    }

    if (gesture.mode === "wall" && gesture.wallId && onWallMove) {
      const wall = geometry.walls.find((item) => item.id === gesture.wallId);
      if (!wall) return;
      const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
      const rawDelta = vertical ? dx : dy;
      onWallMove(wall.id, snap(rawDelta));
      setGesture((current) => current ? { ...current, startX: point.x, startY: point.y } : current);
      return;
    }

    if (
      (gesture.mode === "opening-resize-start" || gesture.mode === "opening-resize-end") &&
      gesture.openingId &&
      onOpeningWidthChange
    ) {
      const opening = geometry.openings.find((item) => item.id === gesture.openingId);
      if (!opening) return;
      const wallId = opening.roomId.startsWith("custom-wall:") ? opening.roomId.slice("custom-wall:".length) : null;
      const wall = wallId ? customWalls.find((item) => item.id === wallId) ?? null : null;
      const wallLengthValue = wall ? Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) : 0;
      const unit = wall && wallLengthValue > 0.001
        ? { x: (wall.x2 - wall.x1) / wallLengthValue, y: (wall.y2 - wall.y1) / wallLengthValue }
        : opening.orientation === "horizontal"
          ? { x: 1, y: 0 }
          : { x: 0, y: 1 };
      const projection = (point.x - opening.x) * unit.x + (point.y - opening.y) * unit.y;
      const halfWidth = Math.max(0.25, Math.abs(projection));
      onOpeningWidthChange(opening.id, Math.max(0.5, Math.min(4, snap(halfWidth * 2))));
      return;
    }

    if (gesture.mode === "opening" && gesture.openingId && onOpeningChange) {
      const opening = geometry.openings.find((item) => item.id === gesture.openingId);
      if (!opening) return;
      const pad = 0.55;

      if (opening.roomId.startsWith("custom-wall:")) {
        const wallId = opening.roomId.slice("custom-wall:".length);
        const wall = customWalls.find((item) => item.id === wallId);
        if (!wall) return;
        const wx = wall.x2 - wall.x1;
        const wy = wall.y2 - wall.y1;
        const wallLengthValue = Math.hypot(wx, wy);
        if (wallLengthValue < 0.001) return;
        const ux = wx / wallLengthValue;
        const uy = wy / wallLengthValue;
        const projectedDistance = (point.x - wall.x1) * ux + (point.y - wall.y1) * uy;
        const openingHalf = Math.max(0.25, (opening.width ?? (opening.type === "door" ? 0.9 : 1.2)) / 2);
        const minDistance = Math.min(openingHalf, wallLengthValue / 2);
        const maxDistance = Math.max(minDistance, wallLengthValue - openingHalf);
        const distanceAlongWall = Math.max(minDistance, Math.min(maxDistance, projectedDistance));
        onOpeningChange(opening.id, {
          x: wall.x1 + ux * distanceAlongWall,
          y: wall.y1 + uy * distanceAlongWall,
          type: opening.type,
        });
        return;
      }

      const owner = rooms.find((room) => room.id === opening.roomId);
      if (!owner) return;
      if (opening.orientation === "horizontal") {
        const minX = owner.x + Math.min(pad, owner.width / 3);
        const maxX = owner.x + owner.width - Math.min(pad, owner.width / 3);
        onOpeningChange(opening.id, {
          x: snap(Math.max(minX, Math.min(maxX, opening.x + dx))),
          y: opening.y,
          type: opening.type,
        });
      } else {
        const minY = owner.y + Math.min(pad, owner.depth / 3);
        const maxY = owner.y + owner.depth - Math.min(pad, owner.depth / 3);
        onOpeningChange(opening.id, {
          x: opening.x,
          y: snap(Math.max(minY, Math.min(maxY, opening.y + dy))),
          type: opening.type,
        });
      }
      return;
    }

    if (gesture.mode === "move") {
      const room = rooms.find((item) => item.id === gesture.roomId);
      if (!room || room.locked) return;

      let nextX = snap(Math.max(0, Math.min(lotWidth - room.width, gesture.roomX + dx)));
      let nextY = snap(Math.max(0, Math.min(lotDepth - room.depth, gesture.roomY + dy)));

      const snapDistance = 0.3;
      const others = (Array.isArray(rooms) ? rooms : []).filter((item) => item.id !== room.id);
      for (const other of others) {
        const xCandidates = [
          other.x,
          other.x + other.width,
          other.x - room.width,
          other.x + other.width - room.width,
        ];
        const yCandidates = [
          other.y,
          other.y + other.depth,
          other.y - room.depth,
          other.y + other.depth - room.depth,
        ];
        for (const candidate of xCandidates) {
          if (Math.abs(nextX - candidate) <= snapDistance) nextX = snap(candidate);
        }
        for (const candidate of yCandidates) {
          if (Math.abs(nextY - candidate) <= snapDistance) nextY = snap(candidate);
        }
      }

      onRoomChange(gesture.roomId, { x: nextX, y: nextY });
      return;
    }

    const minSize = 1;
    let x = gesture.roomX;
    let y = gesture.roomY;
    let width = gesture.roomWidth;
    let depth = gesture.roomDepth;

    const resizeDirection = gesture.mode.startsWith("resize-") ? gesture.mode.slice("resize-".length) : "";
    if (resizeDirection.includes("e")) {
      width = snap(Math.max(minSize, Math.min(lotWidth - x, gesture.roomWidth + dx)));
    }
    if (resizeDirection.includes("s")) {
      depth = snap(Math.max(minSize, Math.min(lotDepth - y, gesture.roomDepth + dy)));
    }
    if (resizeDirection.includes("w")) {
      const nextX = snap(Math.max(0, Math.min(gesture.roomX + gesture.roomWidth - minSize, gesture.roomX + dx)));
      width = snap(gesture.roomWidth + (gesture.roomX - nextX));
      x = nextX;
    }
    if (resizeDirection.includes("n")) {
      const nextY = snap(Math.max(0, Math.min(gesture.roomY + gesture.roomDepth - minSize, gesture.roomY + dy)));
      depth = snap(gesture.roomDepth + (gesture.roomY - nextY));
      y = nextY;
    }

    onRoomChange(gesture.roomId, { x, y, width, depth });
  };

  return (
    <div className="relative h-[calc(100dvh-64px)] min-h-[420px] overflow-hidden bg-[#f8fafc] sm:min-h-[620px]">
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/96 p-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => zoomView(0.84)}
          className="grid h-9 w-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          title="Aproximar (+)"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="min-w-[54px] rounded-lg bg-slate-50 px-2 py-1.5 text-center text-[11px] font-bold tabular-nums text-slate-600">
          {zoomPercent}%
        </div>
        <button
          type="button"
          onClick={() => zoomView(1.18)}
          className="grid h-9 w-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          title="Afastar (-)"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className="mx-0.5 h-6 w-px bg-slate-200" />
        <button
          type="button"
          onClick={() => setSnapEnabled((value) => !value)}
          className={snapEnabled
            ? "flex h-9 items-center gap-1.5 rounded-xl bg-sky-50 px-2.5 text-[11px] font-bold text-sky-700"
            : "flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"}
          title={snapEnabled ? "Snap inteligente ativo" : "Ativar snap inteligente"}
        >
          <Magnet className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Snap</span>
        </button>
        <button
          type="button"
          onClick={() => setOrthogonalEnabled((value) => !value)}
          className={orthogonalEnabled
            ? "flex h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700"
            : "flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"}
          title={orthogonalEnabled ? "Trava ortogonal ativa" : "Ativar trava ortogonal"}
        >
          <Route className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Orto</span>
        </button>
        <div className="mx-0.5 h-6 w-px bg-slate-200" />
        <button
          type="button"
          onClick={resetView}
          className="grid h-9 w-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          title="Enquadrar projeto (F)"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        {interactionMode === "navigate" && (
          <div className="hidden items-center gap-1 rounded-xl bg-slate-900 px-2.5 py-2 text-[11px] font-semibold text-white lg:flex">
            <Move className="h-3.5 w-3.5" /> Arraste
          </div>
        )}
        {interactionMode === "draw-wall" && wallDrawStart && (
          <div className="hidden items-center gap-2 rounded-xl bg-orange-50 px-2.5 py-2 text-[11px] font-semibold text-orange-700 xl:flex">
            {wallLengthInput ? (
              <>
                <span className="rounded-md bg-white px-2 py-1 font-bold tabular-nums text-orange-700 shadow-sm">
                  {wallLengthInput} m
                </span>
                <span>Enter cria a parede</span>
              </>
            ) : (
              <span className={wallLengthError ? "font-semibold text-red-600" : ""}>{wallLengthError ?? <>Clique para continuar ou digite a medida + Enter · Snap {snapEnabled ? "ON" : "OFF"} · Orto {orthogonalEnabled ? "ON" : "OFF"}</>}</span>
            )}
          </div>
        )}
      </div>
      <svg
        ref={svgRef}
        className={`block h-full min-h-[420px] w-full touch-none select-none sm:min-h-[620px] ${interactionMode === "navigate" ? (panGesture ? "cursor-grabbing" : "cursor-grab") : ""}`}
        onWheel={handleWheel}
        onContextMenu={(event) => {
          if (interactionMode !== "draw-wall") return;
          event.preventDefault();
          setWallDrawStart(null);
          setWallChainOrigin(null);
          setWallDrawPreview(null);
          setSnapGuides({});
        }}
        onDragOver={(event) => {
          if (!onObjectDrop) return;
          if (event.dataTransfer.types.includes("application/x-arqdor-object")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(event) => {
          if (!onObjectDrop) return;
          const raw = event.dataTransfer.getData("application/x-arqdor-object");
          if (!raw) return;
          event.preventDefault();
          try {
            const preset = JSON.parse(raw) as Pick<ConceptPlanObject, "kind" | "label" | "width" | "depth"> &
              Partial<Pick<ConceptPlanObject, "catalogProductId" | "imageUrl" | "supplier" | "price" | "model3dUrl">>;
            if (!preset?.kind || !preset?.label) return;
            const point = clampPoint(toSvgPoint(event.clientX, event.clientY));
            onObjectDrop(preset, point);
          } catch {
            // Ignore invalid external drag payloads.
          }
        }}
        onPointerDownCapture={(event) => {
          if (event.pointerType === "touch") {
            touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (touchPointersRef.current.size === 2) {
              const points = [...touchPointersRef.current.values()];
              const distance = Math.max(8, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
              const centerX = (points[0].x + points[1].x) / 2;
              const centerY = (points[0].y + points[1].y) / 2;
              pinchRef.current = {
                startDistance: distance,
                startView: { ...view },
                anchor: toSvgPoint(centerX, centerY),
              };
              setGesture(null);
              setPanGesture(null);
            }
          }
          if (["room", "wall", "opening", "draw-wall", "navigate"].includes(interactionMode)) {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Alguns navegadores/WebViews podem não implementar pointer capture.
            }
          }
        }}
        onPointerDown={(event) => {
          const panRequested = interactionMode === "navigate" || spacePanRef.current || event.button === 1;
          if (panRequested) {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setPanGesture({
              pointerId: event.pointerId,
              startClientX: event.clientX,
              startClientY: event.clientY,
              startViewX: view.x,
              startViewY: view.y,
            });
            return;
          }
          if (interactionMode !== "draw-wall") return;
          event.preventDefault();
          const point = toSvgPoint(event.clientX, event.clientY);
          handleDrawWallPoint(point);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          if (event.pointerType === "touch") {
            touchPointersRef.current.delete(event.pointerId);
            if (touchPointersRef.current.size < 2) pinchRef.current = null;
          }
          if (panGesture?.pointerId === event.pointerId) {
            setPanGesture(null);
          }
          try {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          } catch {
            // Compatibilidade com WebViews sem pointer capture completo.
          }
          if (gesture) onEditEnd?.();
          setGesture(null);
          setSnapGuides({});
        }}
        onPointerCancel={(event) => {
          if (event.pointerType === "touch") {
            touchPointersRef.current.delete(event.pointerId);
            if (touchPointersRef.current.size < 2) pinchRef.current = null;
          }
          if (panGesture?.pointerId === event.pointerId) {
            setPanGesture(null);
          }
          try {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          } catch {
            // Compatibilidade com WebViews sem pointer capture completo.
          }
          if (gesture) onEditEnd?.();
          setGesture(null);
          setSnapGuides({});
        }}
        onDoubleClick={() => {
          if (interactionMode === "draw-wall") {
            setWallDrawStart(null);
            setWallChainOrigin(null);
            setWallDrawPreview(null);
            setSnapGuides({});
          }
        }}
        viewBox={`${Number.isFinite(view.x) ? view.x : -2} ${Number.isFinite(view.y) ? view.y : -2} ${Number.isFinite(view.width) && view.width > 0 ? view.width : Math.max(16, lotWidth + 4)} ${Number.isFinite(view.height) && view.height > 0 ? view.height : Math.max(20, lotDepth + 4)}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Planta conceitual arquitetônica"
        letterSpacing="normal"
      >
        <defs>
          <clipPath id={lotClipId}>
            <polygon points={lotPointsAttribute} />
          </clipPath>
          <pattern id="concept-grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2e8f0" strokeWidth="0.018" />
          </pattern>
          <pattern id="pool-water" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
            <path d="M0 .25 Q.125 .12 .25 .25 T.5 .25" fill="none" stroke="#38bdf8" strokeWidth="0.025" opacity="0.55" />
          </pattern>
        </defs>

            x={view.x - view.width}
            y={view.y - view.height}
            width={view.width * 3}
          clipPath={showLotBoundary ? `url(#${lotClipId})` : undefined}
            height={view.height * 3}
            fill="#fcfcfd"
          />
        )}
        {showLotBoundary ? (
          <polygon points={lotPointsAttribute} fill="#fcfcfd" stroke="#64748b" strokeWidth="0.05" />
        ) : (
          <rect
            x={view.x - view.width}
            y={view.y - view.height}
            width={view.width * 3}
            height={view.height * 3}
            fill="#fcfcfd"
          />
        )}
        {referenceImage?.url ? (
          <image
            href={referenceImage.url}
            x={referenceImage.x ?? 0}
            y={referenceImage.y ?? 0}
            width={referenceImage.width ?? lotWidth}
            height={referenceImage.height ?? lotDepth}
            preserveAspectRatio="xMidYMid meet"
            opacity={Math.max(0.08, Math.min(0.8, referenceImage.opacity ?? 0.35))}
            pointerEvents="none"
          />
        ) : null}
          fill="url(#concept-grid)"
          opacity={referenceImage?.url ? 0.34 : 0.72}
          clipPath={showLotBoundary ? `url(#${lotClipId})` : undefined}
        {(previewWalls.length > 0 || previewOpenings.length > 0) && (
          <g pointerEvents="none" aria-label="Prévia do traçado sugerido pela IA">
            {previewWalls
              .filter((wall) => wall.floor === activeFloor)
              .map((wall) => {
                const confidence = Math.max(0, Math.min(1, wall.confidence ?? 0.5));
                const needsReview = confidence < 0.65;
                return (
                  <line
                    key={wall.id}
                    x1={wall.x1}
                    y1={wall.y1}
                    x2={wall.x2}
                    y2={wall.y2}
                    stroke={needsReview ? "#f97316" : "#0284c7"}
                    strokeWidth={Math.max(0.07, Math.min(0.18, wall.thickness ?? 0.12))}
                    strokeDasharray={needsReview ? "0.12 0.09" : "0.22 0.12"}
                    opacity={needsReview ? 0.92 : 0.55 + confidence * 0.35}
                  />
                );
              })}
            {previewOpenings
              .filter((opening) => opening.floor === activeFloor)
              .map((opening) => {
                const wall = previewWallMap.get(opening.wallId);
                if (!wall) return null;
                const offset = Math.max(0, Math.min(1, opening.offset));
                const x = wall.x1 + (wall.x2 - wall.x1) * offset;
                const y = wall.y1 + (wall.y2 - wall.y1) * offset;
                const radius = opening.type === "door" ? 0.18 : 0.14;
                const confidence = Math.max(0, Math.min(1, opening.confidence ?? 0.5));
                const needsReview = confidence < 0.65;
                return (
                  <g key={opening.id}>
                    <circle
                      cx={x}
                      cy={y}
                      r={radius}
                      fill={needsReview ? "#f97316" : opening.type === "door" ? "#16a34a" : "#7c3aed"}
                      fillOpacity={needsReview ? 0.95 : 0.85}
                      stroke={needsReview ? "#7c2d12" : "#ffffff"}
                      strokeWidth={needsReview ? "0.06" : "0.045"}
                    />
                    <text
                      x={x}
                      y={y - 0.28}
                      textAnchor="middle"
                      fontSize="0.18"
                      fontWeight="800"
                      fill={needsReview ? "#9a3412" : opening.type === "door" ? "#166534" : "#6d28d9"}
                    >
                      {opening.type === "door" ? "P" : "J"}
                    </text>
                  </g>
                );
              })}
          </g>
        )}
        {showLotBoundary && (
          <rect
            x="0"
            y="0"
            width={lotWidth}
            height={lotDepth}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="0.08"
            strokeDasharray="0.22 0.14"
            pointerEvents="none"
          />
        )}

        {snapGuides.x != null && (
          <g pointerEvents="none">
            <line
              x1={snapGuides.x}
              y1="0"
              x2={snapGuides.x}
              y2={lotDepth}
              stroke="#f97316"
              strokeWidth="0.045"
              strokeDasharray="0.16 0.12"
              opacity="0.9"
            />
            <circle cx={snapGuides.x} cy={lotDepth / 2} r="0.09" fill="#f97316" />
          </g>
        )}
        {snapGuides.y != null && (
          <g pointerEvents="none">
            <line
              x1="0"
              y1={snapGuides.y}
              x2={lotWidth}
              y2={snapGuides.y}
              stroke="#f97316"
              strokeWidth="0.045"
              strokeDasharray="0.16 0.12"
              opacity="0.9"
            />
            <circle cx={lotWidth / 2} cy={snapGuides.y} r="0.09" fill="#f97316" />
          </g>
        )}
        {interactionMode === "draw-wall" && activeWallSnap && (
          <g pointerEvents="none">
            <circle
              cx={activeWallSnap.point.x}
              cy={activeWallSnap.point.y}
              r="0.18"
              fill="#ffffff"
              stroke={activeWallSnap.kind === "intersection" ? "#dc2626" : activeWallSnap.kind === "midpoint" ? "#2563eb" : activeWallSnap.kind === "endpoint" ? "#16a34a" : activeWallSnap.kind === "alignment" ? "#7c3aed" : "#f97316"}
              strokeWidth="0.07"
            />
            <text
              x={activeWallSnap.point.x + 0.28}
              y={activeWallSnap.point.y - 0.28}
              fontSize="0.24"
              fontWeight="800"
              fill="#334155"
              paintOrder="stroke"
              stroke="#ffffff"
              strokeWidth="0.09"
            >
              {activeWallSnap.kind === "intersection"
                ? "Interseção"
                : activeWallSnap.kind === "midpoint"
                  ? "Meio"
                  : activeWallSnap.kind === "endpoint"
                    ? "Extremidade"
                    : activeWallSnap.kind === "alignment"
                      ? "Alinhamento"
                      : "Perpendicular"}
            </text>
          </g>
        )}

        {showLotBoundary && showDimensions && (
          <g pointerEvents="none">
            <text x={lotWidth / 2} y="-0.82" textAnchor="middle" fontSize="0.28" fontWeight="700" fill="#64748b">
              {formatMeters(lotWidth)} m
            </text>
            <text
              x="-0.82"
              y={lotDepth / 2}
              textAnchor="middle"
              fontSize="0.28"
              fontWeight="700"
              fill="#64748b"
              transform={`rotate(-90 -0.82 ${lotDepth / 2})`}
            >
              {formatMeters(lotDepth)} m
            </text>
          </g>
        )}

        {showLotBoundary && (
          <g>
            <line x1={lotWidth - 0.9} y1="-1.65" x2={lotWidth - 0.9} y2="-0.75" stroke="#0f172a" strokeWidth="0.07" />
            <path d={`M ${lotWidth - 0.9} -1.9 L ${lotWidth - 1.12} -1.45 L ${lotWidth - 0.68} -1.45 Z`} fill="#0f172a" />
            <text x={lotWidth - 0.9} y="-2.02" textAnchor="middle" fontSize="0.34" fontWeight="800" fill="#0f172a">N</text>
          </g>
        )}

        {showLotBoundary && showDimensions && (
          <g pointerEvents="none">
            <text x={lotWidth / 2} y="-1.55" textAnchor="middle" fontSize="0.23" fontWeight="800" fill="#c2410c" letterSpacing="0.05">
              FRENTE / ACESSO
            </text>
            <text x={lotWidth / 2} y={lotDepth + 1.05} textAnchor="middle" fontSize="0.22" fontWeight="700" fill="#94a3b8" letterSpacing="0.07">
              FUNDOS
            </text>
          </g>
        )}

        {closedSpaces.map((space, index) => {
          const selectedSpace = selectedClosedSpaceId === space.id;
          const label = closedSpaceLabels[space.id]?.trim();
          return (
            <g
              key={space.id}
              className={interactionMode === "space" ? "cursor-pointer" : ""}
              onPointerDown={(event) => {
                if (interactionMode !== "space" || !onSelectClosedSpace) return;
                event.stopPropagation();
                onSelectClosedSpace(space.id);
              }}
              onClick={(event) => {
                if (interactionMode !== "space" || !onSelectClosedSpace) return;
                event.stopPropagation();
                onSelectClosedSpace(space.id);
              }}
            >
              {space.cells.map((cell, cellIndex) => (
                <rect
                  key={`${space.id}-cell-${cellIndex}`}
                  x={cell.x}
                  y={cell.y}
                  width={cell.width}
                  height={cell.height}
                  fill={selectedSpace ? "#fed7aa" : floorMaterialFill(spaceFloorMaterials[space.id]) ?? (index % 2 === 0 ? "#dbeafe" : "#dcfce7")}
                  opacity={selectedSpace ? "0.42" : "0.28"}
                  stroke={selectedSpace ? "#f97316" : "none"}
                  strokeWidth={selectedSpace ? "0.035" : "0"}
                />
              ))}
              {(() => {
                const compact = space.bounds.width < 1.55 || space.bounds.height < 1.35;
                const labelLines = label ? splitRoomLabel(label).slice(0, 2) : [];
                const showLabel = labelLines.length > 0;
                const longestLine = Math.max(5, ...labelLines.map((line) => line.length));
                const availableWidth = Math.max(0.9, space.bounds.width - 0.22);
                const labelFontSize = compact
                  ? Math.max(0.24, Math.min(0.31, (availableWidth * 1.25) / longestLine))
                  : Math.max(0.31, Math.min(0.42, (availableWidth * 1.7) / longestLine));
                const areaFontSize = compact ? 0.24 : 0.29;
                const desiredBadgeWidth = Math.max(
                  compact ? 1.25 : 1.8,
                  longestLine * labelFontSize * 0.62 + 0.42,
                );
                const badgeWidth = Math.max(
                  1.05,
                  Math.min(Math.max(1.05, space.bounds.width - 0.16), desiredBadgeWidth),
                );
                const labelBlockHeight = showLabel
                  ? labelLines.length * labelFontSize * 1.12
                  : 0;
                const badgeHeight = Math.max(
                  compact ? 0.64 : 0.82,
                  labelBlockHeight + areaFontSize + (showLabel ? 0.42 : 0.28),
                );
                const top = space.centroid.y - badgeHeight / 2;
                const labelStartY = space.centroid.y - (showLabel ? (labelBlockHeight + areaFontSize) * 0.26 : 0);
                return (
                  <g pointerEvents="none">
                    <rect
                      x={space.centroid.x - badgeWidth / 2}
                      y={top}
                      width={badgeWidth}
                      height={badgeHeight}
                      rx="0.16"
                      fill="#ffffff"
                      fillOpacity="0.96"
                      stroke={selectedSpace ? "#f97316" : "#94a3b8"}
                      strokeWidth={selectedSpace ? "0.055" : "0.04"}
                    />
                    {showLabel && (
                      <text
                        x={space.centroid.x}
                        y={labelStartY}
                        textAnchor="middle"
                        fontSize={labelFontSize}
                        fontWeight="900"
                        fill="#0f172a"
                        stroke="#ffffff"
                        strokeWidth="0.018"
                        paintOrder="stroke"
                      >
                        {labelLines.map((line, lineIndex) => (
                          <tspan
                            key={`${space.id}-space-label-${lineIndex}`}
                            x={space.centroid.x}
                            dy={lineIndex === 0 ? 0 : labelFontSize * 1.12}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    )}
                  </g>
                );
              })()}
            </g>
          );
        })}

        {(closedSpaces.length > 0 ? rooms.filter((room) => room.kind === "piscina") : rooms).map((room) => {
          const selected = selectedId === room.id;
          const fill = floorMaterialFill(roomFloorMaterials[room.id]) ?? ROOM_FILL[room.kind] ?? "#ffffff";
          const isPool = room.kind === "piscina";
          const labelLines = splitRoomLabel(room.label);
          const labelSize = room.kind === "escada" ? 0.25 : fitLabelSize(room.label, room.width, room.depth);
          return (
            <g
              key={room.id}
              role="button"
              pointerEvents={interactionMode === "space" ? "none" : undefined}
              tabIndex={0}
              onPointerDown={(event) => {
                if (interactionMode !== "room" && interactionMode !== "navigate") return;
                if (paintTarget === "floor") {
                  event.stopPropagation();
                  onSelect(room.id);
                  return;
                }
                onEditStart?.();
                onSelect(room.id);
                if (!onRoomChange || room.locked) return;
                const point = toSvgPoint(event.clientX, event.clientY);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                setGesture({
                  roomId: room.id,
                  mode: "move",
                  startX: point.x,
                  startY: point.y,
                  roomX: room.x,
                  roomY: room.y,
                  roomWidth: room.width,
                  roomDepth: room.depth,
                });
              }}
              onClick={() => {
                if (interactionMode === "room" || interactionMode === "navigate") onSelect(room.id);
              }}
              onKeyDown={(event) => {
                if ((interactionMode === "room" || interactionMode === "navigate") && (event.key === "Enter" || event.key === " ")) onSelect(room.id);
              }}
              className="cursor-pointer"
            >
              <rect
                x={room.x}
                y={room.y}
                width={room.width}
                height={room.depth}
                fill={isPool ? "url(#pool-water)" : fill}
                stroke={selected ? "#f97316" : isPool ? "#0ea5e9" : "#cbd5e1"}
                strokeWidth={selected ? "0.13" : "0.045"}
                rx={isPool ? "0.16" : "0.03"}
              />
              {!isPool && (
                <>
                  {room.kind === "escada" && (
                    <g opacity="0.8">
                      {Array.from({ length: 7 }).map((_, step) => (
                        <line
                          key={step}
                          x1={room.x + 0.18}
                          y1={room.y + 0.35 + step * Math.max(0.2, (room.depth - 0.7) / 7)}
                          x2={room.x + room.width - 0.18}
                          y2={room.y + 0.35 + step * Math.max(0.2, (room.depth - 0.7) / 7)}
                          stroke="#94a3b8"
                          strokeWidth="0.035"
                        />
                      ))}
                      <path
                        d={`M ${room.x + room.width / 2} ${room.y + room.depth - 0.45} L ${room.x + room.width / 2} ${room.y + 0.65} M ${room.x + room.width / 2} ${room.y + 0.65} l -0.18 0.28 M ${room.x + room.width / 2} ${room.y + 0.65} l 0.18 0.28`}
                        stroke="#64748b"
                        strokeWidth="0.05"
                        fill="none"
                      />
                    </g>
                  )}
                  {room.kind === "circulacao" ? (
                    <text
                      x={room.x + room.width / 2}
                      y={room.y + room.depth / 2}
                      textAnchor="middle"
                      fontSize="0.24"
                      fontWeight="700"
                      fill="#64748b"
                      transform={`rotate(-90 ${room.x + room.width / 2} ${room.y + room.depth / 2})`}
                    >
                      {room.label}
                    </text>
                  ) : (
                    <>
                      <text
                        x={room.x + room.width / 2}
                        y={room.y + room.depth / 2 - (labelLines.length > 1 ? 0.27 : 0.14)}
                        textAnchor="middle"
                        fontSize={labelSize}
                        fontWeight="750"
                        fill="#0f172a"
                      >
                        {labelLines.map((line, index) => (
                          <tspan
                            key={`${room.id}-label-${index}`}
                            x={room.x + room.width / 2}
                            dy={index === 0 ? 0 : labelSize * 1.12}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </>
                  )}
                </>
              )}
              {(interactionMode === "room" || interactionMode === "navigate") && selected && onRoomChange && !room.locked && (
                <>
                  {([
                    ["resize-nw", room.x, room.y, "cursor-nwse-resize"],
                    ["resize-n", room.x + room.width / 2, room.y, "cursor-ns-resize"],
                    ["resize-ne", room.x + room.width, room.y, "cursor-nesw-resize"],
                    ["resize-e", room.x + room.width, room.y + room.depth / 2, "cursor-ew-resize"],
                    ["resize-se", room.x + room.width, room.y + room.depth, "cursor-nwse-resize"],
                    ["resize-s", room.x + room.width / 2, room.y + room.depth, "cursor-ns-resize"],
                    ["resize-sw", room.x, room.y + room.depth, "cursor-nesw-resize"],
                    ["resize-w", room.x, room.y + room.depth / 2, "cursor-ew-resize"],
                  ] as const).map(([mode, hx, hy, cursor]) => (
                    <g
                      key={mode}
                      role="button"
                      aria-label="Redimensionar ambiente"
                      className={cursor}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onEditStart?.();
                        const point = toSvgPoint(event.clientX, event.clientY);
                        setGesture({
                          roomId: room.id,
                          mode,
                          startX: point.x,
                          startY: point.y,
                          roomX: room.x,
                          roomY: room.y,
                          roomWidth: room.width,
                          roomDepth: room.depth,
                        });
                      }}
                    >
                      <circle cx={hx} cy={hy} r="0.52" fill="transparent" />
                      <circle
                        cx={hx}
                        cy={hy}
                        r="0.20"
                        fill="#f97316"
                        stroke="#ffffff"
                        strokeWidth="0.06"
                        pointerEvents="none"
                      />
                    </g>
                  ))}

                </>
              )}
              {selected && (interactionMode === "room" || interactionMode === "navigate") && (
                <g transform={`translate(${room.x + room.width / 2 - 1.05} ${Math.max(-0.75, room.y - 0.82)})`}>
                  <rect width="2.10" height="0.56" rx="0.18" fill="#0f172a" opacity="0.96" />
                  <g
                    role="button"
                    className="cursor-pointer"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onOpenMaterials?.(); }}
                  >
                    <rect x="0.06" y="0.05" width="0.62" height="0.46" rx="0.12" fill="transparent" />
                    <text x="0.37" y="0.36" textAnchor="middle" fontSize="0.20" fontWeight="900" fill="#fff">M</text>
                  </g>
                  <g
                    role="button"
                    className="cursor-pointer"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onRoomDuplicate?.(room.id); }}
                  >
                    <rect x="0.74" y="0.05" width="0.62" height="0.46" rx="0.12" fill="transparent" />
                    <text x="1.05" y="0.36" textAnchor="middle" fontSize="0.21" fontWeight="900" fill="#fff">⧉</text>
                  </g>
                  <g
                    role="button"
                    className="cursor-pointer"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onRoomDelete?.(room.id); }}
                  >
                    <rect x="1.42" y="0.05" width="0.62" height="0.46" rx="0.12" fill="transparent" />
                    <text x="1.73" y="0.36" textAnchor="middle" fontSize="0.22" fontWeight="900" fill="#fb7185">×</text>
                  </g>
                </g>
              )}

              {isPool && (
                <>
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.depth / 2 - 0.05}
                    textAnchor="middle"
                    fontSize="0.38"
                    fontWeight="750"
                    fill="#0369a1"
                  >
                    {room.label}
                  </text>
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.depth / 2 + 0.38}
                    textAnchor="middle"
                    fontSize="0.27"
                    fill="#0284c7"
                  >
                    {formatMeters(room.width)} × {formatMeters(room.depth)} m
                  </text>
                </>
              )}
            </g>
          );
        })}

        {previewDiagnostics && previewObjects.length > 0 && (
          <g pointerEvents="none">
            {previewDiagnostics.doorZones.map((zone, index) => (
              <g key={`door-zone-${index}`}>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.width}
                  height={zone.height}
                  rx="0.08"
                  fill="#22c55e"
                  fillOpacity="0.08"
                  stroke="#16a34a"
                  strokeWidth="0.035"
                  strokeDasharray="0.12 0.08"
                />
                <text
                  x={zone.x + zone.width / 2}
                  y={zone.y + zone.height / 2}
                  textAnchor="middle"
                  fontSize="0.16"
                  fontWeight="700"
                  fill="#15803d"
                >
                  circulação
                </text>
              </g>
            ))}
            {previewDiagnostics.windowZones.map((zone, index) => (
              <rect
                key={`window-zone-${index}`}
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                rx="0.06"
                fill="#38bdf8"
                fillOpacity="0.08"
                stroke="#0284c7"
                strokeWidth="0.03"
                strokeDasharray="0.10 0.08"
              />
            ))}
            <g transform={`translate(${Math.max(0.35, lotWidth - 3.0)} 0.35)`}>
              <rect width="2.55" height="0.82" rx="0.14" fill="#ffffff" fillOpacity="0.94" stroke="#cbd5e1" strokeWidth="0.035" />
              <text x="0.18" y="0.31" fontSize="0.18" fontWeight="800" fill="#0f172a">
                Qualidade do layout
              </text>
              <text x="2.34" y="0.31" textAnchor="end" fontSize="0.20" fontWeight="900" fill={previewDiagnostics.quality >= 85 ? "#15803d" : previewDiagnostics.quality >= 70 ? "#c2410c" : "#b91c1c"}>
                {previewDiagnostics.quality}%
              </text>
              <rect x="0.18" y="0.48" width="2.16" height="0.13" rx="0.065" fill="#e2e8f0" />
              <rect x="0.18" y="0.48" width={2.16 * (previewDiagnostics.quality / 100)} height="0.13" rx="0.065" fill={previewDiagnostics.quality >= 85 ? "#22c55e" : previewDiagnostics.quality >= 70 ? "#f97316" : "#ef4444"} />
            </g>
          </g>
        )}

        {previewObjects.filter((object) => object.floor === activeFloor).map((object) => {
          const cx = object.x + object.width / 2;
          const cy = object.y + object.depth / 2;
          return (
            <g
              key={`preview-${object.id}`}
              transform={`rotate(${object.rotation} ${cx} ${cy})`}
              pointerEvents="none"
              opacity="0.52"
            >
              <rect
                x={object.x}
                y={object.y}
                width={object.width}
                height={object.depth}
                rx="0.12"
                fill={objectMaterial(object).fill}
                stroke="#f97316"
                strokeWidth="0.07"
                strokeDasharray="0.16 0.10"
              />
              <text
                x={cx}
                y={cy + 0.05}
                textAnchor="middle"
                fontSize="0.20"
                fontWeight="800"
                fill="#c2410c"
              >
                {object.label}
              </text>
            </g>
          );
        })}

        {objects.filter((object) => object.floor === activeFloor).map((object) => {
          const selectedObject = selectedObjectId === object.id;
          const cx = object.x + object.width / 2;
          const cy = object.y + object.depth / 2;
          return (
            <g
              key={object.id}
              role="button"
              className="cursor-move"
              transform={`rotate(${object.rotation} ${cx} ${cy})`}
              onPointerDown={(event) => {
                if (!onSelectObject) return;
                event.stopPropagation();
                if (paintTarget === "object") {
                  onSelectObject(object.id);
                  return;
                }
                onEditStart?.();
                onSelectObject(object.id);
                if (!onObjectChange) return;
                const point = toSvgPoint(event.clientX, event.clientY);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                setGesture({
                  roomId: "",
                  objectId: object.id,
                  mode: "object",
                  startX: point.x,
                  startY: point.y,
                  roomX: 0,
                  roomY: 0,
                  roomWidth: 0,
                  roomDepth: 0,
                  objectX: object.x,
                  objectY: object.y,
                });
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectObject?.(object.id);
              }}
            >
              <rect
                x={object.x}
                y={object.y}
                width={object.width}
                height={object.depth}
                rx="0.12"
                fill={selectedObject ? "#ffedd5" : objectMaterial(object).fill}
                stroke={selectedObject ? "#f97316" : objectMaterial(object).stroke}
                strokeWidth={selectedObject ? "0.10" : "0.055"}
              />
              {object.imageUrl && (
                <>
                  <defs>
                    <clipPath id={`concept-object-image-clip-${object.id}`}>
                      <rect
                        x={object.x + 0.05}
                        y={object.y + 0.05}
                        width={Math.max(0.1, object.width - 0.1)}
                        height={Math.max(0.1, object.depth - 0.1)}
                        rx="0.10"
                      />
                    </clipPath>
                  </defs>
                  <image
                    href={object.imageUrl}
                    x={object.x + 0.05}
                    y={object.y + 0.05}
                    width={Math.max(0.1, object.width - 0.1)}
                    height={Math.max(0.1, object.depth - 0.1)}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#concept-object-image-clip-${object.id})`}
                    opacity={selectedObject ? "0.74" : "0.92"}
                    pointerEvents="none"
                  />
                  <rect
                    x={object.x + 0.05}
                    y={object.y + 0.05}
                    width={Math.max(0.1, object.width - 0.1)}
                    height={Math.max(0.1, object.depth - 0.1)}
                    rx="0.10"
                    fill="none"
                    stroke={selectedObject ? "#f97316" : "#ffffff"}
                    strokeOpacity="0.75"
                    strokeWidth={selectedObject ? "0.08" : "0.035"}
                    pointerEvents="none"
                  />
                </>
              )}
              {!object.imageUrl && object.kind === "sofa" && (
                <>
                  <rect x={object.x + 0.12} y={object.y + 0.12} width={Math.max(0.2, object.width - 0.24)} height={Math.max(0.2, object.depth * 0.36)} rx="0.10" fill={objectMaterial(object).detail} />
                  <line x1={object.x + object.width / 2} y1={object.y + object.depth * 0.48} x2={object.x + object.width / 2} y2={object.y + object.depth - 0.12} stroke={objectMaterial(object).stroke} strokeWidth="0.04" />
                </>
              )}
              {!object.imageUrl && object.kind === "bed" && (
                <>
                  <rect x={object.x + 0.10} y={object.y + 0.10} width={Math.max(0.2, object.width - 0.20)} height={Math.max(0.2, object.depth - 0.20)} rx="0.08" fill={objectMaterial(object).fill} stroke="#cbd5e1" strokeWidth="0.035" />
                  <rect x={object.x + 0.18} y={object.y + 0.16} width={Math.max(0.15, object.width * 0.32)} height={Math.max(0.14, object.depth * 0.22)} rx="0.08" fill={objectMaterial(object).detail} />
                  <rect x={object.x + object.width - Math.max(0.15, object.width * 0.32) - 0.18} y={object.y + 0.16} width={Math.max(0.15, object.width * 0.32)} height={Math.max(0.14, object.depth * 0.22)} rx="0.08" fill={objectMaterial(object).detail} />
                </>
              )}
              {!object.imageUrl && object.kind === "table" && (
                <ellipse cx={cx} cy={cy} rx={Math.max(0.2, object.width / 2 - 0.08)} ry={Math.max(0.2, object.depth / 2 - 0.08)} fill={objectMaterial(object).fill} stroke={objectMaterial(object).stroke} strokeWidth="0.04" />
              )}
              {!object.imageUrl && object.kind === "chair" && (
                <>
                  <rect x={object.x + 0.10} y={object.y + 0.16} width={Math.max(0.18, object.width - 0.20)} height={Math.max(0.18, object.depth - 0.26)} rx="0.08" fill={objectMaterial(object).detail} />
                  <line x1={object.x + 0.10} y1={object.y + 0.12} x2={object.x + object.width - 0.10} y2={object.y + 0.12} stroke="#64748b" strokeWidth="0.07" />
                </>
              )}
              {!object.imageUrl && object.kind === "cabinet" && (
                <>
                  <line x1={cx} y1={object.y + 0.08} x2={cx} y2={object.y + object.depth - 0.08} stroke="#94a3b8" strokeWidth="0.035" />
                  <circle cx={cx - 0.10} cy={cy} r="0.035" fill="#475569" />
                  <circle cx={cx + 0.10} cy={cy} r="0.035" fill="#475569" />
                </>
              )}
              {!object.imageUrl && object.kind === "tv" && (
                <rect x={object.x + 0.10} y={object.y + 0.10} width={Math.max(0.16, object.width - 0.20)} height={Math.max(0.12, object.depth - 0.20)} rx="0.04" fill={objectMaterial(object).fill} />
              )}
              {!object.imageUrl && object.kind === "plant" && (
                <>
                  <circle cx={cx} cy={cy} r={Math.max(0.16, Math.min(object.width, object.depth) * 0.34)} fill="#86a97a" stroke="#3f6212" strokeWidth="0.04" />
                  <circle cx={cx - object.width * 0.16} cy={cy - object.depth * 0.08} r={Math.max(0.08, Math.min(object.width, object.depth) * 0.18)} fill="#bbd3a9" />
                  <circle cx={cx + object.width * 0.14} cy={cy + object.depth * 0.10} r={Math.max(0.07, Math.min(object.width, object.depth) * 0.16)} fill="#5f8a4f" />
                </>
              )}
              {!object.imageUrl && object.kind === "lamp" && (
                <>
                  <circle cx={cx} cy={cy} r={Math.max(0.14, Math.min(object.width, object.depth) * 0.34)} fill="#fef3c7" stroke="#334155" strokeWidth="0.05" />
                  <circle cx={cx} cy={cy} r={Math.max(0.05, Math.min(object.width, object.depth) * 0.12)} fill="#f59e0b" />
                </>
              )}
              {!object.imageUrl && object.kind === "rug" && (
                <rect
                  x={object.x + 0.08}
                  y={object.y + 0.08}
                  width={Math.max(0.16, object.width - 0.16)}
                  height={Math.max(0.16, object.depth - 0.16)}
                  rx="0.14"
                  fill={objectMaterial(object).fill}
                  stroke={objectMaterial(object).stroke}
                  strokeDasharray="0.08 0.06"
                  strokeWidth="0.035"
                />
              )}
              {!object.imageUrl && object.kind === "outlet" && (
                <g pointerEvents="none">
                  <circle cx={cx} cy={cy} r={Math.max(0.13, Math.min(object.width, object.depth) * 0.34)} fill="#ffffff" stroke="#2563eb" strokeWidth="0.055" />
                  <circle cx={cx - 0.07} cy={cy} r="0.022" fill="#2563eb" />
                  <circle cx={cx + 0.07} cy={cy} r="0.022" fill="#2563eb" />
                </g>
              )}
              {!object.imageUrl && object.kind === "switch" && (
                <g pointerEvents="none">
                  <rect x={cx - 0.16} y={cy - 0.12} width="0.32" height="0.24" rx="0.05" fill="#ffffff" stroke="#7c3aed" strokeWidth="0.055" />
                  <line x1={cx - 0.07} y1={cy + 0.05} x2={cx + 0.07} y2={cy - 0.05} stroke="#7c3aed" strokeWidth="0.045" />
                </g>
              )}
              {!object.imageUrl && object.kind === "light_point" && (
                <g pointerEvents="none">
                  <circle cx={cx} cy={cy} r={Math.max(0.14, Math.min(object.width, object.depth) * 0.36)} fill="#fef3c7" stroke="#d97706" strokeWidth="0.055" />
                  <line x1={cx - 0.11} y1={cy} x2={cx + 0.11} y2={cy} stroke="#d97706" strokeWidth="0.04" />
                  <line x1={cx} y1={cy - 0.11} x2={cx} y2={cy + 0.11} stroke="#d97706" strokeWidth="0.04" />
                </g>
              )}
              {!object.imageUrl && ["water_point", "drain_point", "shower_point", "faucet_point"].includes(object.kind) && (
                <g pointerEvents="none">
                  <circle
                    cx={cx}
                    cy={cy}
                    r={Math.max(0.14, Math.min(object.width, object.depth) * 0.36)}
                    fill={object.kind === "drain_point" ? "#e0f2fe" : "#eff6ff"}
                    stroke={object.kind === "drain_point" ? "#0284c7" : "#0ea5e9"}
                    strokeWidth="0.055"
                  />
                  <text x={cx} y={cy + 0.075} textAnchor="middle" fontSize="0.19" fontWeight="900" fill="#0369a1">
                    {object.kind === "water_point" ? "A" : object.kind === "drain_point" ? "E" : object.kind === "shower_point" ? "CH" : "T"}
                  </text>
                </g>
              )}
              {selectedObject && (
                <>
                  <text x={cx} y={object.y - 0.16} textAnchor="middle" fontSize="0.22" fontWeight="800" fill="#c2410c" pointerEvents="none">
                    {object.label}
                  </text>

                  <g pointerEvents="none">
                    <rect
                      x={object.x - 0.08}
                      y={object.y - 0.08}
                      width={object.width + 0.16}
                      height={object.depth + 0.16}
                      rx="0.10"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="0.045"
                      strokeDasharray="0.14 0.10"
                    />
                    <rect
                      x={cx - 0.72}
                      y={object.y + object.depth + 0.18}
                      width="1.44"
                      height="0.42"
                      rx="0.10"
                      fill="#ffffff"
                      fillOpacity="0.96"
                      stroke="#fdba74"
                      strokeWidth="0.025"
                    />
                    <text x={cx} y={object.y + object.depth + 0.46} textAnchor="middle" fontSize="0.20" fontWeight="800" fill="#9a3412">
                      {`${object.width.toFixed(2)} × ${object.depth.toFixed(2)} m`}
                    </text>
                  </g>

                  {([
                    ["nw", object.x, object.y, "cursor-nwse-resize"],
                    ["n", cx, object.y, "cursor-ns-resize"],
                    ["ne", object.x + object.width, object.y, "cursor-nesw-resize"],
                    ["e", object.x + object.width, cy, "cursor-ew-resize"],
                    ["se", object.x + object.width, object.y + object.depth, "cursor-nwse-resize"],
                    ["s", cx, object.y + object.depth, "cursor-ns-resize"],
                    ["sw", object.x, object.y + object.depth, "cursor-nesw-resize"],
                    ["w", object.x, cy, "cursor-ew-resize"],
                  ] as const).map(([handle, hx, hy, cursorClass]) => (
                    <g
                      key={handle}
                      role="button"
                      className={cursorClass}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onEditStart?.();
                        onSelectObject?.(object.id);
                        if (!onObjectChange) return;
                        const point = toSvgPoint(event.clientX, event.clientY);
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        setGesture({
                          roomId: "",
                          objectId: object.id,
                          mode: `object-resize-${handle}` as
                            | "object-resize-n"
                            | "object-resize-s"
                            | "object-resize-e"
                            | "object-resize-w"
                            | "object-resize-ne"
                            | "object-resize-nw"
                            | "object-resize-se"
                            | "object-resize-sw",
                          startX: point.x,
                          startY: point.y,
                          roomX: 0,
                          roomY: 0,
                          roomWidth: 0,
                          roomDepth: 0,
                          objectX: object.x,
                          objectY: object.y,
                          objectWidth: object.width,
                          objectDepth: object.depth,
                          objectRotation: object.rotation,
                        });
                      }}
                    >
                      <circle cx={hx} cy={hy} r="0.30" fill="transparent" />
                      <rect
                        x={hx - 0.11}
                        y={hy - 0.11}
                        width="0.22"
                        height="0.22"
                        rx="0.045"
                        fill="#ffffff"
                        stroke="#f97316"
                        strokeWidth="0.055"
                        pointerEvents="none"
                      />
                    </g>
                  ))}

                  <line
                    x1={cx}
                    y1={object.y}
                    x2={cx}
                    y2={object.y - 0.72}
                    stroke="#f97316"
                    strokeWidth="0.04"
                    strokeDasharray="0.10 0.08"
                    pointerEvents="none"
                  />
                  <g
                    role="button"
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onEditStart?.();
                      onSelectObject?.(object.id);
                      if (!onObjectChange) return;
                      const point = toSvgPoint(event.clientX, event.clientY);
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      setGesture({
                        roomId: "",
                        objectId: object.id,
                        mode: "object-rotate",
                        startX: point.x,
                        startY: point.y,
                        roomX: 0,
                        roomY: 0,
                        roomWidth: 0,
                        roomDepth: 0,
                        objectX: object.x,
                        objectY: object.y,
                        objectWidth: object.width,
                        objectDepth: object.depth,
                        objectRotation: object.rotation,
                        objectCenterX: cx,
                        objectCenterY: cy,
                        objectStartAngle: Math.atan2(point.y - cy, point.x - cx),
                      });
                    }}
                  >
                    <circle cx={cx} cy={object.y - 0.82} r="0.30" fill="transparent" />
                    <circle cx={cx} cy={object.y - 0.82} r="0.15" fill="#ffffff" stroke="#f97316" strokeWidth="0.06" />
                    <path d={`M ${cx - 0.06} ${object.y - 0.82} A 0.06 0.06 0 1 1 ${cx + 0.03} ${object.y - 0.87}`} fill="none" stroke="#f97316" strokeWidth="0.035" pointerEvents="none" />
                  </g>

                  <g transform={`translate(${cx - 1.05} ${object.y - 1.28})`}>
                    <rect width="2.1" height="0.58" rx="0.18" fill="#0f172a" opacity="0.96" />
                    <g
                      role="button"
                      className="cursor-pointer"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); onObjectRotate?.(object.id); }}
                    >
                      <rect x="0.08" y="0.06" width="0.58" height="0.46" rx="0.12" fill="transparent" />
                      <text x="0.37" y="0.37" textAnchor="middle" fontSize="0.25" fontWeight="900" fill="#fff">↻</text>
                    </g>
                    <g
                      role="button"
                      className="cursor-pointer"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); onObjectDuplicate?.(object.id); }}
                    >
                      <rect x="0.76" y="0.06" width="0.58" height="0.46" rx="0.12" fill="transparent" />
                      <text x="1.05" y="0.37" textAnchor="middle" fontSize="0.22" fontWeight="900" fill="#fff">⧉</text>
                    </g>
                    <g
                      role="button"
                      className="cursor-pointer"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => { event.stopPropagation(); onObjectDelete?.(object.id); }}
                    >
                      <rect x="1.44" y="0.06" width="0.58" height="0.46" rx="0.12" fill="transparent" />
                      <text x="1.73" y="0.37" textAnchor="middle" fontSize="0.22" fontWeight="900" fill="#fb7185">×</text>
                    </g>
                  </g>
                </>
              )}
            </g>
          );
        })}

        {customWalls.map((wall) => {
          const selected = selectedCustomWallId === wall.id;
          return (
            <g
              key={wall.id}
              className={(interactionMode === "wall" || interactionMode === "navigate") ? "cursor-pointer" : ""}
              onPointerDown={(event) => {
                if ((interactionMode !== "wall" && interactionMode !== "navigate") || !onSelectCustomWall) return;
                event.stopPropagation();
                onSelectCustomWall(wall.id);
                if (paintTarget === "wall") return;
              }}
              onClick={(event) => {
                if ((interactionMode !== "wall" && interactionMode !== "navigate") || !onSelectCustomWall) return;
                event.stopPropagation();
                onSelectCustomWall(wall.id);
              }}
            >
              <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} stroke="transparent" strokeWidth="0.8" />
              <line
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke={selected ? "#f97316" : wallMaterialStroke(wallMaterials[wall.id]) ?? "#1e293b"}
                strokeWidth={selected ? "0.18" : String(Math.max(0.10, Math.min(0.15, wall.thickness ?? 0.15)))}
                strokeLinecap="square"
                pointerEvents="none"
              />
              {selected && (
                <>
                  {([
                    ["custom-wall-start", wall.x1, wall.y1],
                    ["custom-wall-end", wall.x2, wall.y2],
                  ] as const).map(([mode, hx, hy]) => (
                    <g
                      key={mode}
                      className="cursor-crosshair"
                      onPointerDown={(event) => {
                        if ((interactionMode !== "wall" && interactionMode !== "navigate") || !onUpdateCustomWall) return;
                        event.stopPropagation();
                        onEditStart?.();
                        const point = toSvgPoint(event.clientX, event.clientY);
                        setGesture({
                          roomId: "",
                          customWallId: wall.id,
                          mode,
                          startX: point.x,
                          startY: point.y,
                          roomX: 0,
                          roomY: 0,
                          roomWidth: 0,
                          roomDepth: 0,
                          wallX1: wall.x1,
                          wallY1: wall.y1,
                          wallX2: wall.x2,
                          wallY2: wall.y2,
                        });
                      }}
                    >
                      <circle cx={hx} cy={hy} r="0.48" fill="transparent" />
                      <circle cx={hx} cy={hy} r="0.2" fill="#f97316" stroke="#fff" strokeWidth="0.05" pointerEvents="none" />
                    </g>
                  ))}
                  {(() => {
                    const mid = wallMidpoint(wall);
                    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
                    const length = wallLength(wall);
                    return (
                      <>
                        <g
                          className="cursor-move"
                        onPointerDown={(event) => {
                          if ((interactionMode !== "wall" && interactionMode !== "navigate") || !onUpdateCustomWall) return;
                          event.stopPropagation();
                          onEditStart?.();
                          const point = toSvgPoint(event.clientX, event.clientY);
                          setGesture({
                            roomId: "",
                            customWallId: wall.id,
                            mode: "custom-wall-move",
                            startX: point.x,
                            startY: point.y,
                            roomX: 0,
                            roomY: 0,
                            roomWidth: 0,
                            roomDepth: 0,
                            wallX1: wall.x1,
                            wallY1: wall.y1,
                            wallX2: wall.x2,
                            wallY2: wall.y2,
                          });
                        }}
                      >
                        <circle cx={mid.x} cy={mid.y} r="0.48" fill="transparent" />
                        <rect
                          x={mid.x - 0.16}
                          y={mid.y - 0.16}
                          width="0.32"
                          height="0.32"
                          rx="0.07"
                          fill="#0f172a"
                          stroke="#fff"
                          strokeWidth="0.05"
                          pointerEvents="none"
                        />
                        </g>
                        {onUpdateCustomWall && (
                          <foreignObject
                            x={mid.x - (horizontal ? 0.72 : -0.28)}
                            y={mid.y + (horizontal ? 0.82 : 0.04)}
                            width="1.44"
                            height="0.72"
                            requiredExtensions="http://www.w3.org/1999/xhtml"
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                              <input
                                aria-label="Espessura da parede"
                                type="number"
                                min="0.08"
                                max="0.50"
                                step="0.01"
                                defaultValue={(wall.thickness ?? 0.15).toFixed(2)}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    (event.currentTarget as HTMLInputElement).blur();
                                  }
                                  if (event.key === "Escape") {
                                    (event.currentTarget as HTMLInputElement).value = (wall.thickness ?? 0.15).toFixed(2);
                                    (event.currentTarget as HTMLInputElement).blur();
                                  }
                                }}
                                onBlur={(event) => {
                                  const value = Number(event.currentTarget.value);
                                  if (!Number.isFinite(value)) return;
                                  const next = Math.max(0.08, Math.min(0.5, value));
                                  if (Math.abs(next - (wall.thickness ?? 0.15)) < 0.001) return;
                                  onUpdateCustomWall(wall.id, { thickness: next });
                                }}
                                style={{
                                  width: "100%",
                                  height: "28px",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "8px",
                                  background: "rgba(255,255,255,.98)",
                                  color: "#334155",
                                  fontSize: "12px",
                                  fontWeight: 800,
                                  textAlign: "center",
                                  outline: "none",
                                  boxShadow: "0 4px 14px rgba(15,23,42,.10)",
                                }}
                              />
                            </div>
                          </foreignObject>
                        )}
                        {onCustomWallLengthChange && (
                          <foreignObject
                            x={mid.x - (horizontal ? 0.72 : -0.28)}
                            y={mid.y - (horizontal ? 1.18 : 0.72)}
                            width="1.44"
                            height="0.72"
                            requiredExtensions="http://www.w3.org/1999/xhtml"
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
                              <input
                                aria-label="Comprimento da parede"
                                type="number"
                                min="0.5"
                                max={Math.max(lotWidth, lotDepth)}
                                step="0.05"
                                defaultValue={length.toFixed(2)}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    (event.currentTarget as HTMLInputElement).blur();
                                  }
                                  if (event.key === "Escape") {
                                    (event.currentTarget as HTMLInputElement).value = length.toFixed(2);
                                    (event.currentTarget as HTMLInputElement).blur();
                                  }
                                }}
                                onBlur={(event) => {
                                  const value = Number(event.currentTarget.value);
                                  if (!Number.isFinite(value)) return;
                                  if (Math.abs(value - length) < 0.001) return;
                                  onCustomWallLengthChange(wall.id, value);
                                }}
                                style={{
                                  width: "100%",
                                  height: "28px",
                                  border: "1px solid #fb923c",
                                  borderRadius: "8px",
                                  background: "rgba(255,255,255,.98)",
                                  color: "#9a3412",
                                  fontSize: "12px",
                                  fontWeight: 800,
                                  textAlign: "center",
                                  outline: "none",
                                  boxShadow: "0 4px 14px rgba(15,23,42,.12)",
                                }}
                              />
                            </div>
                          </foreignObject>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </g>
          );
        })}

        {(interactionMode === "wall" || interactionMode === "navigate") && topologyNodes
          .filter((node) => node.segmentIds.length >= 3 || node.endpointRefs.length >= 2)
          .map((node) => {
            const editable = node.endpointRefs.length >= 2;
            return (
              <g
                key={node.id}
                className={editable ? "cursor-move" : ""}
                onPointerDown={(event) => {
                  if (!editable || !onMoveTopologyJunction) return;
                  event.stopPropagation();
                  onEditStart?.();
                  const point = toSvgPoint(event.clientX, event.clientY);
                  setGesture({
                    roomId: "",
                    junctionRefs: node.endpointRefs,
                    mode: "topology-junction",
                    startX: point.x,
                    startY: point.y,
                    roomX: 0,
                    roomY: 0,
                    roomWidth: 0,
                    roomDepth: 0,
                  });
                }}
              >
                <circle cx={node.x} cy={node.y} r={editable ? "0.42" : "0.34"} fill="transparent" />
                <rect
                  x={node.x - 0.13}
                  y={node.y - 0.13}
                  width="0.26"
                  height="0.26"
                  rx="0.04"
                  fill={editable ? "#7c3aed" : "#64748b"}
                  stroke="#fff"
                  strokeWidth="0.045"
                  transform={`rotate(45 ${node.x} ${node.y})`}
                  pointerEvents="none"
                />
              </g>
            );
          })}

        {wallDrawStart && wallDrawPreview && (
          <g pointerEvents="none">
            {wallChainOrigin && (
              <>
                <circle
                  cx={wallChainOrigin.x}
                  cy={wallChainOrigin.y}
                  r="0.34"
                  fill="#fff7ed"
                  stroke="#f97316"
                  strokeWidth="0.06"
                />
                <circle
                  cx={wallChainOrigin.x}
                  cy={wallChainOrigin.y}
                  r="0.12"
                  fill="#f97316"
                />
              </>
            )}
            <circle cx={wallDrawStart.x} cy={wallDrawStart.y} r="0.22" fill="#f97316" stroke="#fff" strokeWidth="0.05" />
            <line
              x1={wallDrawStart.x}
              y1={wallDrawStart.y}
              x2={wallDrawPreview.x}
              y2={wallDrawPreview.y}
              stroke="#f97316"
              strokeWidth="0.16"
              strokeDasharray="0.28 0.16"
            />
            {(() => {
              const previewWall = { id: "preview", x1: wallDrawStart.x, y1: wallDrawStart.y, x2: wallDrawPreview.x, y2: wallDrawPreview.y };
              const mid = wallMidpoint(previewWall);
              return wallLength(previewWall) >= 0.25 ? (
                <g>
                  <rect x={mid.x - 0.7} y={mid.y - 0.34} width="1.4" height="0.48" rx="0.12" fill="#ffffff" opacity="0.94" />
                  <text x={mid.x} y={mid.y} textAnchor="middle" fontSize="0.24" fontWeight="800" fill="#c2410c">
                    {wallLength(previewWall).toFixed(2)} m
                  </text>
                </g>
              ) : null;
            })()}
          </g>
        )}

        {geometry.walls.map((wall) => {
          const selectedWall = selectedWallId === wall.id;
          const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
          return (
            <g
              key={wall.id}
              className={(interactionMode === "wall" || interactionMode === "navigate") ? (vertical ? "cursor-ew-resize" : "cursor-ns-resize") : ""}
              onPointerDown={(event) => {
                if ((interactionMode !== "wall" && interactionMode !== "navigate") || !onSelectWall || !onWallMove) return;
                event.stopPropagation();
                onEditStart?.();
                const point = toSvgPoint(event.clientX, event.clientY);
                onSelectWall(wall.id);
                if (paintTarget === "wall") return;
                setGesture({
                  roomId: wall.roomIds[0] ?? "",
                  wallId: wall.id,
                  mode: "wall",
                  startX: point.x,
                  startY: point.y,
                  roomX: 0,
                  roomY: 0,
                  roomWidth: 0,
                  roomDepth: 0,
                });
              }}
              onClick={(event) => {
                if ((interactionMode !== "wall" && interactionMode !== "navigate") || !onSelectWall) return;
                event.stopPropagation();
                onSelectWall(wall.id);
              }}
            >
              <line
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke="transparent"
                strokeWidth="0.75"
              />
              <line
                x1={wall.x1}
                y1={wall.y1}
                x2={wall.x2}
                y2={wall.y2}
                stroke={selectedWall ? "#f97316" : wallMaterialStroke(wallMaterials[wall.id]) ?? (wall.exterior ? "#1e293b" : "#475569")}
                strokeWidth={selectedWall ? "0.18" : wall.exterior ? "0.14" : "0.085"}
                strokeLinecap="square"
                pointerEvents="none"
              />
              {selectedWall && (
                <>
                  <circle cx={wall.x1} cy={wall.y1} r="0.18" fill="#f97316" stroke="#fff" strokeWidth="0.05" pointerEvents="none" />
                  <circle cx={wall.x2} cy={wall.y2} r="0.18" fill="#f97316" stroke="#fff" strokeWidth="0.05" pointerEvents="none" />
                  <g
                    transform={`translate(${(wall.x1 + wall.x2) / 2 - 0.38} ${(wall.y1 + wall.y2) / 2 - 0.78})`}
                    role="button"
                    className="cursor-pointer"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); onOpenMaterials?.(); }}
                  >
                    <rect width="0.76" height="0.54" rx="0.16" fill="#0f172a" opacity="0.96" />
                    <text x="0.38" y="0.35" textAnchor="middle" fontSize="0.20" fontWeight="900" fill="#fff">M</text>
                  </g>
                </>
              )}
            </g>
          );
        })}

        {showDimensions && (
          <g>
            <DimensionLine
              x1={0}
              y1={0}
              x2={lotWidth}
              y2={0}
              offsetY={-1.15}
              label={`${lotWidth.toFixed(2).replace(".", ",")} m`}
              tone="#0f766e"
            />
            <DimensionLine
              x1={0}
              y1={0}
              x2={0}
              y2={lotDepth}
              offsetX={-1.15}
              label={`${lotDepth.toFixed(2).replace(".", ",")} m`}
              tone="#0f766e"
            />
            {rooms
              .filter((room) => room.id === selectedId && room.floor === activeFloor)
              .map((room) => {
                const topGap = Math.max(0, room.y);
                const bottomGap = Math.max(0, lotDepth - (room.y + room.depth));
                const leftGap = Math.max(0, room.x);
                const rightGap = Math.max(0, lotWidth - (room.x + room.width));
                return (
                  <g key={`selected-room-dimensions-${room.id}`}>
                    <DimensionLine
                      x1={room.x}
                      y1={room.y}
                      x2={room.x + room.width}
                      y2={room.y}
                      offsetY={-0.62}
                      label={`${room.width.toFixed(2).replace(".", ",")} m`}
                      tone="#ea580c"
                    />
                    <DimensionLine
                      x1={room.x}
                      y1={room.y}
                      x2={room.x}
                      y2={room.y + room.depth}
                      offsetX={-0.62}
                      label={`${room.depth.toFixed(2).replace(".", ",")} m`}
                      tone="#ea580c"
                    />
                    {leftGap >= 0.25 && (
                      <DimensionLine
                        x1={0}
                        y1={room.y + room.depth / 2}
                        x2={room.x}
                        y2={room.y + room.depth / 2}
                        offsetY={0.56}
                        label={`${leftGap.toFixed(2).replace(".", ",")} m`}
                        tone="#0f766e"
                      />
                    )}
                    {rightGap >= 0.25 && (
                      <DimensionLine
                        x1={room.x + room.width}
                        y1={room.y + room.depth / 2}
                        x2={lotWidth}
                        y2={room.y + room.depth / 2}
                        offsetY={0.56}
                        label={`${rightGap.toFixed(2).replace(".", ",")} m`}
                        tone="#0f766e"
                      />
                    )}
                    {topGap >= 0.25 && (
                      <DimensionLine
                        x1={room.x + room.width / 2}
                        y1={0}
                        x2={room.x + room.width / 2}
                        y2={room.y}
                        offsetX={0.56}
                        label={`${topGap.toFixed(2).replace(".", ",")} m`}
                        tone="#0f766e"
                      />
                    )}
                    {bottomGap >= 0.25 && (
                      <DimensionLine
                        x1={room.x + room.width / 2}
                        y1={room.y + room.depth}
                        x2={room.x + room.width / 2}
                        y2={lotDepth}
                        offsetX={0.56}
                        label={`${bottomGap.toFixed(2).replace(".", ",")} m`}
                        tone="#0f766e"
                      />
                    )}
                  </g>
                );
              })}

            {selectedCustomWallId && (() => {
              const wall = customWalls.find((item) => item.id === selectedCustomWallId);
              if (!wall) return null;
              const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
              const parallel = customWalls
                .filter((item) => item.id !== wall.id)
                .filter((item) => (Math.abs(item.y1 - item.y2) < 0.01) === horizontal)
                .map((item) => ({
                  item,
                  distance: horizontal ? Math.abs(item.y1 - wall.y1) : Math.abs(item.x1 - wall.x1),
                }))
                .filter((candidate) => candidate.distance >= 0.25)
                .sort((a, b) => a.distance - b.distance)[0];

              if (!parallel) return null;
              const mid = wallMidpoint(wall);
              const otherMid = wallMidpoint(parallel.item);
              return horizontal ? (
                <DimensionLine
                  x1={mid.x}
                  y1={wall.y1}
                  x2={mid.x}
                  y2={parallel.item.y1}
                  offsetX={0.68}
                  label={`${parallel.distance.toFixed(2).replace(".", ",")} m`}
                  tone="#7c3aed"
                />
              ) : (
                <DimensionLine
                  x1={wall.x1}
                  y1={mid.y}
                  x2={parallel.item.x1}
                  y2={mid.y}
                  offsetY={0.68}
                  label={`${parallel.distance.toFixed(2).replace(".", ",")} m`}
                  tone="#7c3aed"
                />
              );
            })()}

            {customWalls
              .filter((wall) =>
                wall.floor === activeFloor
                && wallLength(wall) >= 0.5
                && wall.id === selectedCustomWallId
              )
              .map((wall) => {
                const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
                const length = wallLength(wall);
                const selected = selectedCustomWallId === wall.id;
                const offset = selected ? 0.72 : 0.48;
                const offsetX = horizontal ? 0 : (wall.x1 <= lotWidth / 2 ? -offset : offset);
                const offsetY = horizontal ? (wall.y1 <= lotDepth / 2 ? -offset : offset) : 0;
                return (
                  <g
                    key={`dimension-${wall.id}`}
                    role="button"
                    className="cursor-pointer"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectCustomWall?.(wall.id);
                    }}
                  >
                    <DimensionLine
                      x1={wall.x1}
                      y1={wall.y1}
                      x2={wall.x2}
                      y2={wall.y2}
                      offsetX={offsetX}
                      offsetY={offsetY}
                      label={`${length.toFixed(2).replace(".", ",")} m`}
                      tone={selected ? "#ea580c" : "#64748b"}
                    />
                  </g>
                );
              })}
          </g>
        )}

        {geometry.openings.map((opening) => {
          const selectedOpening = selectedOpeningId === opening.id;
          const openingWidth = Math.max(0.5, opening.width ?? (opening.type === "door" ? 0.95 : 1.25));
          const half = openingWidth / 2;
          const horizontal = opening.orientation === "horizontal";
          const sliding = opening.openingStyle === "sliding";
          const swingRight = opening.swing === "right";
          const swingOutside = opening.swingSide === "outside";
          const swingSideFactor = swingOutside ? -1 : 1;
          const leafCount = Math.max(1, Math.min(6, Math.round(opening.leafCount ?? (opening.type === "door" ? 1 : 2))));
          const customWallId = opening.roomId.startsWith("custom-wall:") ? opening.roomId.slice("custom-wall:".length) : null;
          const parentCustomWall = customWallId ? customWalls.find((wall) => wall.id === customWallId) ?? null : null;
          const parentWallLength = parentCustomWall ? wallLength(parentCustomWall) : 0;
          const wallUnit = parentCustomWall && parentWallLength > 0.001
            ? { x: (parentCustomWall.x2 - parentCustomWall.x1) / parentWallLength, y: (parentCustomWall.y2 - parentCustomWall.y1) / parentWallLength }
            : horizontal
              ? { x: 1, y: 0 }
              : { x: 0, y: 1 };
          const openingStart = { x: opening.x - wallUnit.x * half, y: opening.y - wallUnit.y * half };
          const openingEnd = { x: opening.x + wallUnit.x * half, y: opening.y + wallUnit.y * half };
          const centerDistanceFromWallStart = parentCustomWall
            ? Math.max(0, Math.min(parentWallLength, (opening.x - parentCustomWall.x1) * wallUnit.x + (opening.y - parentCustomWall.y1) * wallUnit.y))
            : 0;
          const clearanceStart = parentCustomWall ? Math.max(0, centerDistanceFromWallStart - half) : 0;
          const clearanceEnd = parentCustomWall ? Math.max(0, parentWallLength - centerDistanceFromWallStart - half) : 0;
          const wallNormal = { x: -wallUnit.y, y: wallUnit.x };
          return (
            <g
              key={opening.id}
              className={(interactionMode === "opening" || interactionMode === "navigate") ? "cursor-grab" : ""}
              onPointerDown={(event) => {
                if ((interactionMode !== "opening" && interactionMode !== "navigate") || !onSelectOpening || !onOpeningChange) return;
                event.stopPropagation();
                onEditStart?.();
                onSelectOpening(opening.id);
                const point = toSvgPoint(event.clientX, event.clientY);
                setGesture({
                  roomId: opening.roomId,
                  openingId: opening.id,
                  mode: "opening",
                  startX: point.x,
                  startY: point.y,
                  roomX: 0,
                  roomY: 0,
                  roomWidth: 0,
                  roomDepth: 0,
                });
              }}
              onClick={(event) => {
                if ((interactionMode !== "opening" && interactionMode !== "navigate") || !onSelectOpening) return;
                event.stopPropagation();
                onSelectOpening(opening.id);
              }}
            >
              <line
                x1={openingStart.x}
                y1={openingStart.y}
                x2={openingEnd.x}
                y2={openingEnd.y}
                stroke="transparent"
                strokeWidth="0.72"
              />
              {opening.type === "door" ? (
                <g pointerEvents="none" opacity={selectedOpening ? 1 : 0.92}>
                  <line
                    x1={openingStart.x}
                    y1={openingStart.y}
                    x2={openingEnd.x}
                    y2={openingEnd.y}
                    stroke="#ffffff"
                    strokeWidth="0.22"
                  />
                  {sliding ? (
                    <>
                      <line
                        x1={openingStart.x - wallNormal.x * 0.10}
                        y1={openingStart.y - wallNormal.y * 0.10}
                        x2={opening.x + wallUnit.x * 0.06 - wallNormal.x * 0.10}
                        y2={opening.y + wallUnit.y * 0.06 - wallNormal.y * 0.10}
                        stroke={selectedOpening ? "#f97316" : "#475569"}
                        strokeWidth="0.055"
                      />
                      <line
                        x1={opening.x - wallUnit.x * 0.06 + wallNormal.x * 0.10}
                        y1={opening.y - wallUnit.y * 0.06 + wallNormal.y * 0.10}
                        x2={openingEnd.x + wallNormal.x * 0.10}
                        y2={openingEnd.y + wallNormal.y * 0.10}
                        stroke={selectedOpening ? "#f97316" : "#475569"}
                        strokeWidth="0.055"
                      />
                    </>
                  ) : (
                    <line
                      x1={swingRight ? openingEnd.x : openingStart.x}
                      y1={swingRight ? openingEnd.y : openingStart.y}
                      x2={(swingRight ? openingEnd.x : openingStart.x) + wallNormal.x * openingWidth * swingSideFactor}
                      y2={(swingRight ? openingEnd.y : openingStart.y) + wallNormal.y * openingWidth * swingSideFactor}
                      stroke={selectedOpening ? "#f97316" : "#475569"}
                      strokeWidth="0.06"
                    />
                  )}
                </g>
              ) : (
                <g pointerEvents="none">
                  <line
                    x1={openingStart.x}
                    y1={openingStart.y}
                    x2={openingEnd.x}
                    y2={openingEnd.y}
                    stroke="#ffffff"
                    strokeWidth="0.18"
                  />
                  <line
                    x1={openingStart.x}
                    y1={openingStart.y}
                    x2={openingEnd.x}
                    y2={openingEnd.y}
                    stroke={selectedOpening ? "#f97316" : "#0284c7"}
                    strokeWidth={selectedOpening ? "0.11" : "0.07"}
                  />
                  {leafCount > 1 && Array.from({ length: leafCount - 1 }).map((_, leafIndex) => {
                    const ratio = (leafIndex + 1) / leafCount;
                    const axis = -half + openingWidth * ratio;
                    const cx = opening.x + wallUnit.x * axis;
                    const cy = opening.y + wallUnit.y * axis;
                    return (
                      <line
                        key={`leaf-${leafIndex}`}
                        x1={cx - wallNormal.x * 0.12}
                        y1={cy - wallNormal.y * 0.12}
                        x2={cx + wallNormal.x * 0.12}
                        y2={cy + wallNormal.y * 0.12}
                        stroke={selectedOpening ? "#f97316" : "#0369a1"}
                        strokeWidth="0.035"
                      />
                    );
                  })}
                </g>
              )}
              {selectedOpening && (
                <>
                  <circle cx={opening.x} cy={opening.y} r="0.26" fill="#f97316" stroke="#fff" strokeWidth="0.06" pointerEvents="none" />
                  {parentCustomWall && (
                    <g pointerEvents="none">
                      <line
                        x1={parentCustomWall.x1}
                        y1={parentCustomWall.y1}
                        x2={openingStart.x}
                        y2={openingStart.y}
                        stroke="#94a3b8"
                        strokeWidth="0.035"
                        strokeDasharray="0.12 0.10"
                      />
                      <line
                        x1={openingEnd.x}
                        y1={openingEnd.y}
                        x2={parentCustomWall.x2}
                        y2={parentCustomWall.y2}
                        stroke="#94a3b8"
                        strokeWidth="0.035"
                        strokeDasharray="0.12 0.10"
                      />
                      <g transform={`translate(${(parentCustomWall.x1 + openingStart.x) / 2 + wallNormal.x * 0.34} ${(parentCustomWall.y1 + openingStart.y) / 2 + wallNormal.y * 0.34})`}>
                        <rect x="-0.48" y="-0.18" width="0.96" height="0.36" rx="0.09" fill="#fff" fillOpacity="0.96" stroke="#cbd5e1" strokeWidth="0.02" />
                        <text x="0" y="0.07" textAnchor="middle" fontSize="0.18" fontWeight="800" fill="#475569">
                          {`${clearanceStart.toFixed(2)} m`}
                        </text>
                      </g>
                      <g transform={`translate(${(openingEnd.x + parentCustomWall.x2) / 2 + wallNormal.x * 0.34} ${(openingEnd.y + parentCustomWall.y2) / 2 + wallNormal.y * 0.34})`}>
                        <rect x="-0.48" y="-0.18" width="0.96" height="0.36" rx="0.09" fill="#fff" fillOpacity="0.96" stroke="#cbd5e1" strokeWidth="0.02" />
                        <text x="0" y="0.07" textAnchor="middle" fontSize="0.18" fontWeight="800" fill="#475569">
                          {`${clearanceEnd.toFixed(2)} m`}
                        </text>
                      </g>
                    </g>
                  )}
                  <g pointerEvents="none">
                    <rect
                      x={opening.x + wallNormal.x * 0.44 - 0.72}
                      y={opening.y + wallNormal.y * 0.44 - 0.20}
                      width="1.44"
                      height="0.40"
                      rx="0.10"
                      fill="#ffffff"
                      fillOpacity="0.96"
                      stroke="#fdba74"
                      strokeWidth="0.025"
                    />
                    <text
                      x={opening.x + wallNormal.x * 0.44}
                      y={opening.y + wallNormal.y * 0.44 + 0.06}
                      textAnchor="middle"
                      fontSize="0.20"
                      fontWeight="800"
                      fill="#9a3412"
                    >
                      {`${openingWidth.toFixed(2)} m`}
                    </text>
                  </g>
                  {opening.roomId.startsWith("custom-wall:") && onOpeningWidthChange && ([
                    ["opening-resize-start", openingStart.x, openingStart.y],
                    ["opening-resize-end", openingEnd.x, openingEnd.y],
                  ] as const).map(([mode, hx, hy]) => (
                    <g
                      key={mode}
                      role="button"
                      className="cursor-crosshair"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onEditStart?.();
                        onSelectOpening?.(opening.id);
                        const point = toSvgPoint(event.clientX, event.clientY);
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                        setGesture({
                          roomId: opening.roomId,
                          openingId: opening.id,
                          mode,
                          startX: point.x,
                          startY: point.y,
                          roomX: 0,
                          roomY: 0,
                          roomWidth: 0,
                          roomDepth: 0,
                        });
                      }}
                    >
                      <circle cx={hx} cy={hy} r="0.30" fill="transparent" />
                      <rect
                        x={hx - 0.11}
                        y={hy - 0.11}
                        width="0.22"
                        height="0.22"
                        rx="0.04"
                        fill="#ffffff"
                        stroke="#f97316"
                        strokeWidth="0.055"
                        pointerEvents="none"
                      />
                    </g>
                  ))}
                </>
              )}
            </g>
          );
        })}

        <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="none" stroke="#64748b" strokeWidth="0.065" strokeDasharray="0.22 0.14" pointerEvents="none" />
      </svg>
    </div>
  );
}
