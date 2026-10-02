import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
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

    return {
      minX: Math.max(0, Math.min(...xs)),
      minY: Math.max(0, Math.min(...ys)),
      maxX: Math.min(lotWidth, Math.max(...xs)),
      maxY: Math.min(lotDepth, Math.max(...ys)),
      hasProject: true,
    };
  }, [rooms, geometry.walls, customWalls, closedSpaces, objects, previewObjects, lotWidth, lotDepth]);

  const fitView = useMemo(() => {
    const margin = projectBounds.hasProject ? 1.9 : 2.6;
    const centerX = (projectBounds.minX + projectBounds.maxX) / 2;
    const centerY = (projectBounds.minY + projectBounds.maxY) / 2;
    let width = Math.max(4, projectBounds.maxX - projectBounds.minX + margin * 2);
    let height = Math.max(4, projectBounds.maxY - projectBounds.minY + margin * 2);

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
      const maxWidth = Math.max(fitView.width * 2.8, lotWidth + 8);
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
        const maxWidth = Math.max(fitView.width * 2.8, lotWidth + 8);
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