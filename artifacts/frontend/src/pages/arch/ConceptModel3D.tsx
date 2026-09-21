import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Layers3, Maximize2, RotateCcw, RotateCw, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import type { OpeningMarker, WallSegment } from "./conceptGeometry";
import type { ClosedSpace } from "./conceptWallNetwork";
import { getFacadeMaterial, type FacadeDesignState } from "./conceptFacadeDesign";
import type { ConceptPlanObject } from "./ConceptPlan2D";

export type ConceptModelLevel = {
  floor: number;
  walls: WallSegment[];
  customWalls: Array<{
    id: string;
    floor: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness?: number;
  }>;
  closedSpaces: ClosedSpace[];
  openings: OpeningMarker[];
  labels: Record<string, string>;
  floorMaterials?: Record<string, string>;
  wallMaterials?: Record<string, string>;
  stairs: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    depth: number;
  }>;
};

type Props = {
  lotWidth: number;
  lotDepth: number;
  activeFloor: number;
  levels: ConceptModelLevel[];
  roof: "platibanda" | "aparente" | "misto";
  facadeDesign?: FacadeDesignState;
  objects?: ConceptPlanObject[];
  selectedObjectId?: string | null;
  onSelectObject?: (objectId: string | null) => void;
  onObjectChange?: (objectId: string, patch: Partial<Pick<ConceptPlanObject, "x" | "y" | "width" | "depth" | "rotation">>) => void;
  onObjectRotate?: (objectId: string) => void;
  onObjectDuplicate?: (objectId: string) => void;
  onObjectDelete?: (objectId: string) => void;
  onObjectEditStart?: () => void;
  onObjectEditEnd?: () => void;
  selectedWallId?: string | null;
  selectedCustomWallId?: string | null;
  selectedClosedSpaceId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  onSelectCustomWall?: (wallId: string | null) => void;
  onSelectClosedSpace?: (spaceId: string | null) => void;
  paintTool?: null | { target: "object" | "wall" | "floor"; materialId: string; name: string; swatch: string };
  onPaintObject?: (objectId: string, materialId: string) => void;
  onPaintWall?: (wallId: string, materialId: string) => void;
  onPaintFloor?: (spaceId: string, materialId: string) => void;
  onCancelPaint?: () => void;
  onRenderView?: () => void;
};

type Point3 = { x: number; y: number; z: number };
type Point2 = { x: number; y: number };

const WALL_HEIGHT = 2.8;
const FLOOR_THICKNESS = 0.16;
const LEVEL_HEIGHT = WALL_HEIGHT + FLOOR_THICKNESS;

function rotatePoint(x: number, y: number, rotationDegrees: number, lotWidth: number, lotDepth: number) {
  const cx = lotWidth / 2;
  const cy = lotDepth / 2;
  const px = x - cx;
  const py = y - cy;
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: px * cos - py * sin,
    y: px * sin + py * cos,
  };
}

function project(point: Point3, rotation: number, lotWidth: number, lotDepth: number, zoom: number): Point2 {
  const rotated = rotatePoint(point.x, point.y, rotation, lotWidth, lotDepth);
  const isoX = (rotated.x - rotated.y) * 1.08;
  const isoY = (rotated.x + rotated.y) * 0.54 - point.z * 1.42;
  return { x: isoX * zoom, y: isoY * zoom };
}

function points(pointsValue: Point2[]) {
  return pointsValue.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(" ");
}

function quad(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  z: number,
  rotation: number,
  lotWidth: number,
  lotDepth: number,
  zoom: number,
) {
  return [
    project({ x: x1, y: y1, z }, rotation, lotWidth, lotDepth, zoom),
    project({ x: x2, y: y1, z }, rotation, lotWidth, lotDepth, zoom),
    project({ x: x2, y: y2, z }, rotation, lotWidth, lotDepth, zoom),
    project({ x: x1, y: y2, z }, rotation, lotWidth, lotDepth, zoom),
  ];
}

function boxPolygons(
  object: ConceptPlanObject,
  sceneRotation: number,
  lotWidth: number,
  lotDepth: number,
  zoom: number,
  zBase: number,
) {
  const kindHeight: Record<ConceptPlanObject["kind"], number> = {
    sofa: 0.82,
    bed: 0.58,
    table: 0.76,
    chair: 0.88,
    cabinet: 2.10,
    tv: 1.25,
    plant: 1.15,
    lamp: 1.45,
    rug: 0.06,
  };
  const zTop = zBase + (kindHeight[object.kind] ?? 0.8);
  const cx = object.x + object.width / 2;
  const cy = object.y + object.depth / 2;
  const radians = (object.rotation * Math.PI) / 180;
  const rotateLocal = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: cy + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
  };
  const corners = [
    rotateLocal(object.x, object.y),
    rotateLocal(object.x + object.width, object.y),
    rotateLocal(object.x + object.width, object.y + object.depth),
    rotateLocal(object.x, object.y + object.depth),
  ];
  const bottom = corners.map((p) => ({ ...p, z: zBase }));
  const top = corners.map((p) => ({ ...p, z: zTop }));
  return {
    top: top.map((p) => project(p, sceneRotation, lotWidth, lotDepth, zoom)),
    sideA: [bottom[0], bottom[1], top[1], top[0]].map((p) => project(p, sceneRotation, lotWidth, lotDepth, zoom)),
    sideB: [bottom[1], bottom[2], top[2], top[1]].map((p) => project(p, sceneRotation, lotWidth, lotDepth, zoom)),
  };
}

type ObjectPrimitive = {
  key: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  zMin: number;
  zMax: number;
};

function primitiveRect(
  object: ConceptPlanObject,
  key: string,
  relX: number,
  relY: number,
  relW: number,
  relD: number,
  zMin: number,
  zMax: number,
): ObjectPrimitive {
  const width = Math.max(0.04, object.width * relW);
  const depth = Math.max(0.04, object.depth * relD);
  const localCenterX = object.x + object.width * (relX + relW / 2);
  const localCenterY = object.y + object.depth * (relY + relD / 2);
  const objectCenterX = object.x + object.width / 2;
  const objectCenterY = object.y + object.depth / 2;
  const radians = (object.rotation * Math.PI) / 180;
  const dx = localCenterX - objectCenterX;
  const dy = localCenterY - objectCenterY;
  const centerX = objectCenterX + dx * Math.cos(radians) - dy * Math.sin(radians);
  const centerY = objectCenterY + dx * Math.sin(radians) + dy * Math.cos(radians);
  return {
    key,
    x: centerX - width / 2,
    y: centerY - depth / 2,
    width,
    depth,
    zMin,
    zMax,
  };
}

function primitiveBoxPolygons(
  primitive: ObjectPrimitive,
  objectRotation: number,
  sceneRotation: number,
  lotWidth: number,
  lotDepth: number,
  zoom: number,
) {
  const cx = primitive.x + primitive.width / 2;
  const cy = primitive.y + primitive.depth / 2;
  const radians = (objectRotation * Math.PI) / 180;
  const rotateLocal = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: cy + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
  };
  const corners = [
    rotateLocal(primitive.x, primitive.y),
    rotateLocal(primitive.x + primitive.width, primitive.y),
    rotateLocal(primitive.x + primitive.width, primitive.y + primitive.depth),
    rotateLocal(primitive.x, primitive.y + primitive.depth),
  ];
  const bottom = corners.map((p) => ({ ...p, z: primitive.zMin }));
  const top = corners.map((p) => ({ ...p, z: primitive.zMax }));
  return {
    top: top.map((p) => project(p, sceneRotation, lotWidth, lotDepth, zoom)),
    sideA: [bottom[0], bottom[1], top[1], top[0]].map((p) => project(p, sceneRotation, lotWidth, lotDepth, zoom)),
    sideB: [bottom[1], bottom[2], top[2], top[1]].map((p) => project(p, sceneRotation, lotWidth, lotDepth, zoom)),
  };
}

function objectPrimitives(object: ConceptPlanObject, zBase: number): ObjectPrimitive[] {
  const p = (key: string, x: number, y: number, w: number, d: number, z0: number, z1: number) =>
    primitiveRect(object, key, x, y, w, d, zBase + z0, zBase + z1);

  switch (object.kind) {
    case "sofa":
      return [
        p("seat", 0.05, 0.16, 0.90, 0.70, 0.12, 0.48),
        p("back", 0.05, 0.02, 0.90, 0.18, 0.30, 0.86),
        p("arm-left", 0.00, 0.12, 0.12, 0.76, 0.18, 0.70),
        p("arm-right", 0.88, 0.12, 0.12, 0.76, 0.18, 0.70),
      ];
    case "bed":
      return [
        p("base", 0.02, 0.08, 0.96, 0.86, 0.08, 0.28),
        p("mattress", 0.04, 0.10, 0.92, 0.80, 0.26, 0.54),
        p("headboard", 0.02, 0.00, 0.96, 0.10, 0.16, 1.05),
      ];
    case "table":
      return [
        p("top", 0.02, 0.02, 0.96, 0.96, 0.68, 0.78),
        p("leg-a", 0.08, 0.08, 0.12, 0.12, 0.02, 0.70),
        p("leg-b", 0.80, 0.08, 0.12, 0.12, 0.02, 0.70),
        p("leg-c", 0.08, 0.80, 0.12, 0.12, 0.02, 0.70),
        p("leg-d", 0.80, 0.80, 0.12, 0.12, 0.02, 0.70),
      ];
    case "chair":
      return [
        p("seat", 0.08, 0.12, 0.84, 0.70, 0.42, 0.54),
        p("back", 0.08, 0.02, 0.84, 0.16, 0.48, 0.92),
        p("leg-a", 0.12, 0.14, 0.12, 0.12, 0.02, 0.44),
        p("leg-b", 0.76, 0.14, 0.12, 0.12, 0.02, 0.44),
        p("leg-c", 0.12, 0.72, 0.12, 0.12, 0.02, 0.44),
        p("leg-d", 0.76, 0.72, 0.12, 0.12, 0.02, 0.44),
      ];
    case "cabinet":
      return [
        p("body", 0.02, 0.02, 0.96, 0.96, 0.02, 2.08),
        p("plinth", 0.04, 0.04, 0.92, 0.92, 0.00, 0.10),
      ];
    case "tv":
      return [
        p("panel", 0.02, 0.18, 0.96, 0.64, 0.20, 1.30),
        p("screen", 0.08, 0.12, 0.84, 0.16, 0.46, 1.16),
      ];
    case "plant":
      return [
        p("pot", 0.28, 0.28, 0.44, 0.44, 0.02, 0.42),
        p("foliage-a", 0.14, 0.18, 0.72, 0.64, 0.40, 1.02),
        p("foliage-b", 0.26, 0.10, 0.48, 0.80, 0.72, 1.28),
      ];
    case "lamp":
      return [
        p("base", 0.26, 0.26, 0.48, 0.48, 0.02, 0.10),
        p("stem", 0.44, 0.44, 0.12, 0.12, 0.10, 1.22),
        p("shade", 0.24, 0.24, 0.52, 0.52, 1.16, 1.52),
      ];
    case "rug":
      return [p("rug", 0.00, 0.00, 1.00, 1.00, 0.01, 0.05)];
    default:
      return [p("body", 0, 0, 1, 1, 0.02, 0.8)];
  }
}


function wallPolygon(
  wall: { x1: number; y1: number; x2: number; y2: number; thickness?: number },
  rotation: number,
  lotWidth: number,
  lotDepth: number,
  zoom: number,
  zMin: number,
  zMax: number,
) {
  const thickness = Math.max(0.08, wall.thickness ?? 0.14);
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const nx = (-dy / length) * (thickness / 2);
  const ny = (dx / length) * (thickness / 2);

  const base = [
    { x: wall.x1 + nx, y: wall.y1 + ny, z: zMin },
    { x: wall.x2 + nx, y: wall.y2 + ny, z: zMin },
    { x: wall.x2 - nx, y: wall.y2 - ny, z: zMin },
    { x: wall.x1 - nx, y: wall.y1 - ny, z: zMin },
  ];
  const top = base.map((point) => ({ ...point, z: zMax }));

  return {
    top: top.map((point) => project(point, rotation, lotWidth, lotDepth, zoom)),
    sideA: [base[0], base[1], top[1], top[0]].map((point) => project(point, rotation, lotWidth, lotDepth, zoom)),
    sideB: [base[1], base[2], top[2], top[1]].map((point) => project(point, rotation, lotWidth, lotDepth, zoom)),
  };
}

function splitWallForOpenings(
  wall: { id: string; x1: number; y1: number; x2: number; y2: number; thickness?: number; exterior?: boolean },
  openings: OpeningMarker[],
) {
  const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
  const wallStart = vertical ? Math.min(wall.y1, wall.y2) : Math.min(wall.x1, wall.x2);
  const wallEnd = vertical ? Math.max(wall.y1, wall.y2) : Math.max(wall.x1, wall.x2);
  const wallCoord = vertical ? wall.x1 : wall.y1;

  const matches = openings
    .filter((opening) => {
      if (vertical && opening.orientation !== "vertical") return false;
      if (!vertical && opening.orientation !== "horizontal") return false;
      const coord = vertical ? opening.x : opening.y;
      const along = vertical ? opening.y : opening.x;
      return Math.abs(coord - wallCoord) <= 0.08 && along >= wallStart - 0.05 && along <= wallEnd + 0.05;
    })
    .map((opening) => {
      const along = vertical ? opening.y : opening.x;
      const width = Math.max(0.5, opening.width ?? (opening.type === "door" ? 0.95 : 1.35));
      return {
        ...opening,
        start: Math.max(wallStart, along - width / 2),
        end: Math.min(wallEnd, along + width / 2),
      };
    })
    .sort((a, b) => a.start - b.start);

  if (!matches.length) {
    return [{ wall, zMin: 0, zMax: WALL_HEIGHT, kind: "solid" as const }];
  }

  const pieces: Array<{
    wall: typeof wall;
    zMin: number;
    zMax: number;
    kind: "solid" | "lintel" | "sill";
  }> = [];
  let cursor = wallStart;

  const makeSegment = (start: number, end: number) => {
    if (end - start < 0.04) return null;
    return vertical
      ? { ...wall, y1: start, y2: end }
      : { ...wall, x1: start, x2: end };
  };

  for (const opening of matches) {
    const before = makeSegment(cursor, opening.start);
    if (before) pieces.push({ wall: before, zMin: 0, zMax: WALL_HEIGHT, kind: "solid" });

    const openingSegment = makeSegment(opening.start, opening.end);
    if (openingSegment) {
      const openingHeight = Math.max(
        0.5,
        Math.min(WALL_HEIGHT, opening.height ?? (opening.type === "door" ? 2.1 : 1.2)),
      );
      const sillHeight = opening.type === "door"
        ? 0
        : Math.max(0, Math.min(WALL_HEIGHT - 0.3, opening.sillHeight ?? 0.9));
      const headHeight = Math.min(WALL_HEIGHT, sillHeight + openingHeight);

      if (sillHeight > 0.04) {
        pieces.push({ wall: openingSegment, zMin: 0, zMax: sillHeight, kind: "sill" });
      }
      if (headHeight < WALL_HEIGHT - 0.04) {
        pieces.push({ wall: openingSegment, zMin: headHeight, zMax: WALL_HEIGHT, kind: "lintel" });
      }
    }
    cursor = Math.max(cursor, opening.end);
  }

  const after = makeSegment(cursor, wallEnd);
  if (after) pieces.push({ wall: after, zMin: 0, zMax: WALL_HEIGHT, kind: "solid" });
  return pieces;
}

const WALL_3D_MATERIALS: Record<string, { front: string; side: string; top: string }> = {
  "pintura-branca": { front: "#f8fafc", side: "#e2e8f0", top: "#ffffff" },
  "pintura-cinza": { front: "#cbd5e1", side: "#94a3b8", top: "#e2e8f0" },
  "cimento-aparente": { front: "#9ca3af", side: "#6b7280", top: "#d1d5db" },
  "madeira-ripada": { front: "#b98a5f", side: "#8b5e3c", top: "#d2a679" },
  "pedra-cinza": { front: "#78716c", side: "#57534e", top: "#a8a29e" },
  "preto-fosco-parede": { front: "#1f2937", side: "#111827", top: "#374151" },
};

function wall3dMaterial(id?: string) {
  return id ? WALL_3D_MATERIALS[id] : undefined;
}

const FLOOR_3D_MATERIALS: Record<string, { fill: string; edge: string }> = {
  "porcelanato-claro": { fill: "#e7e5e4", edge: "#a8a29e" },
  "cimento-queimado": { fill: "#cbd5e1", edge: "#64748b" },
  "madeira-carvalho": { fill: "#d6c2a8", edge: "#8b7355" },
  "madeira-nogueira": { fill: "#9a775d", edge: "#574437" },
  "pedra-natural": { fill: "#d6d3d1", edge: "#78716c" },
  "ceramica-clara": { fill: "#f5f5f4", edge: "#a8a29e" },
  "vinilico-claro": { fill: "#e5d3b3", edge: "#a16207" },
};

function floor3dMaterial(id?: string) {
  return id ? FLOOR_3D_MATERIALS[id] : undefined;
}

const OBJECT_3D_MATERIALS: Record<string, { top: string; sideA: string; sideB: string }> = {
  "tecido-cinza": { top: "#cbd5e1", sideA: "#94a3b8", sideB: "#64748b" },
  "tecido-bege": { top: "#e7e5e4", sideA: "#d6d3d1", sideB: "#a8a29e" },
  "linho-claro": { top: "#fafaf9", sideA: "#e7e5e4", sideB: "#d6d3d1" },
  "madeira-clara": { top: "#d6c2a8", sideA: "#b99a73", sideB: "#8b7355" },
  "madeira-escura": { top: "#8b6b52", sideA: "#705441", sideB: "#574437" },
  "preto-fosco": { top: "#334155", sideA: "#1e293b", sideB: "#0f172a" },
  "branco-fosco": { top: "#ffffff", sideA: "#f1f5f9", sideB: "#cbd5e1" },
  "folhagem-verde": { top: "#86a97a", sideA: "#5f8a4f", sideB: "#3f6212" },
};

function object3dMaterial(object: ConceptPlanObject) {
  return OBJECT_3D_MATERIALS[object.materialId ?? ""] ?? OBJECT_3D_MATERIALS[
    object.kind === "bed" ? "linho-claro"
      : object.kind === "table" || object.kind === "cabinet" ? "madeira-clara"
      : object.kind === "tv" || object.kind === "lamp" ? "preto-fosco"
      : object.kind === "plant" ? "folhagem-verde"
      : object.kind === "rug" ? "tecido-bege"
      : "tecido-cinza"
  ];
}

type Rect2 = { x: number; y: number; width: number; height: number };

function subtractRect(rect: Rect2, hole: Rect2): Rect2[] {
  const rx2 = rect.x + rect.width;
  const ry2 = rect.y + rect.height;
  const hx2 = hole.x + hole.width;
  const hy2 = hole.y + hole.height;
  const ix1 = Math.max(rect.x, hole.x);
  const iy1 = Math.max(rect.y, hole.y);
  const ix2 = Math.min(rx2, hx2);
  const iy2 = Math.min(ry2, hy2);

  if (ix2 <= ix1 + 0.02 || iy2 <= iy1 + 0.02) return [rect];

  const pieces: Rect2[] = [
    { x: rect.x, y: rect.y, width: rect.width, height: iy1 - rect.y },
    { x: rect.x, y: iy2, width: rect.width, height: ry2 - iy2 },
    { x: rect.x, y: iy1, width: ix1 - rect.x, height: iy2 - iy1 },
    { x: ix2, y: iy1, width: rx2 - ix2, height: iy2 - iy1 },
  ];

  return pieces.filter((piece) => piece.width > 0.04 && piece.height > 0.04);
}

function slabPiecesForCell(cell: Rect2, stairHoles: Rect2[]) {
  return stairHoles.reduce<Rect2[]>(
    (pieces, hole) => pieces.flatMap((piece) => subtractRect(piece, hole)),
    [cell],
  );
}

function roofBounds(level: ConceptModelLevel | undefined) {
  if (!level?.closedSpaces.length) return null;
  const minX = Math.min(...level.closedSpaces.map((space) => space.bounds.x));
  const minY = Math.min(...level.closedSpaces.map((space) => space.bounds.y));
  const maxX = Math.max(...level.closedSpaces.map((space) => space.bounds.x + space.bounds.width));
  const maxY = Math.max(...level.closedSpaces.map((space) => space.bounds.y + space.bounds.height));
  return { minX, minY, maxX, maxY };
}

export default function ConceptModel3D({
  lotWidth,
  lotDepth,
  activeFloor,
  levels,
  roof,
  facadeDesign,
  objects = [],
  selectedObjectId = null,
  onSelectObject,
  onObjectChange,
  onObjectRotate,
  onObjectDuplicate,
  onObjectDelete,
  onObjectEditStart,
  onObjectEditEnd,
  selectedWallId = null,
  selectedCustomWallId = null,
  selectedClosedSpaceId = null,
  onSelectWall,
  onSelectCustomWall,
  onSelectClosedSpace,
  paintTool = null,
  onPaintObject,
  onPaintWall,
  onPaintFloor,
  onCancelPaint,
  onRenderView,
}: Props) {
  const [rotation, setRotation] = useState(35);
  const [zoom, setZoom] = useState(1.32);
  const [showAllFloors, setShowAllFloors] = useState(true);
  const [showRoof, setShowRoof] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [interiorMode, setInteriorMode] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [orbitGesture, setOrbitGesture] = useState<null | {
    pointerId: number;
    startX: number;
    startRotation: number;
  }>(null);
  const [objectDrag, setObjectDrag] = useState<null | {
    pointerId: number;
    objectId: string;
    startSvgX: number;
    startSvgY: number;
    startObjectX: number;
    startObjectY: number;
  }>(null);
  const [objectResize, setObjectResize] = useState<null | {
    pointerId: number;
    objectId: string;
    startSvgX: number;
    startSvgY: number;
    startWidth: number;
    startDepth: number;
    rotation: number;
  }>(null);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<null | { distance: number; zoom: number }>(null);

  const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;
  const resetCamera = () => {
    setRotation(35);
    setZoom(1.32);
  };

  const setCameraPreset = (nextRotation: number) => {
    setRotation(normalizeRotation(nextRotation));
    setZoom(1.32);
  };

  const clientToSvgPoint = (clientX: number, clientY: number) => {
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

  const projectedDeltaToWorld = (dx: number, dy: number) => {
    const safeZoom = Math.max(0.01, zoom);
    const a = dx / (1.08 * safeZoom);
    const b = dy / (0.54 * safeZoom);
    const rotatedX = (a + b) / 2;
    const rotatedY = (b - a) / 2;
    const radians = (rotation * Math.PI) / 180;
    return {
      x: rotatedX * Math.cos(radians) + rotatedY * Math.sin(radians),
      y: -rotatedX * Math.sin(radians) + rotatedY * Math.cos(radians),
    };
  };


  const scaleObject = (objectId: string, factor: number) => {
    if (!onObjectChange) return;
    const object = objects.find((item) => item.id === objectId);
    if (!object) return;
    onObjectEditStart?.();
    const nextWidth = Math.max(0.3, Math.min(lotWidth, Number((object.width * factor).toFixed(2))));
    const nextDepth = Math.max(0.3, Math.min(lotDepth, Number((object.depth * factor).toFixed(2))));
    const centerX = object.x + object.width / 2;
    const centerY = object.y + object.depth / 2;
    onObjectChange(object.id, {
      width: nextWidth,
      depth: nextDepth,
      x: Math.max(0, Math.min(lotWidth - nextWidth, Number((centerX - nextWidth / 2).toFixed(2)))),
      y: Math.max(0, Math.min(lotDepth - nextDepth, Number((centerY - nextDepth / 2).toFixed(2)))),
    });
    onObjectEditEnd?.();
  };

  const handleOrbitStart = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (paintTool) return;
    if (event.pointerType === "touch") {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointersRef.current.size === 2) {
        const points = [...touchPointersRef.current.values()];
        pinchRef.current = {
          distance: Math.max(8, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
          zoom,
        };
        setOrbitGesture(null);
        return;
      }
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setOrbitGesture({
      pointerId: event.pointerId,
      startX: event.clientX,
      startRotation: rotation,
    });
  };

  const handleOrbitMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (objectResize && objectResize.pointerId === event.pointerId && onObjectChange) {
      const point = clientToSvgPoint(event.clientX, event.clientY);
      const worldDelta = projectedDeltaToWorld(point.x - objectResize.startSvgX, point.y - objectResize.startSvgY);
      const radians = (objectResize.rotation * Math.PI) / 180;
      const localX = worldDelta.x * Math.cos(radians) + worldDelta.y * Math.sin(radians);
      const localY = -worldDelta.x * Math.sin(radians) + worldDelta.y * Math.cos(radians);
      const object = objects.find((item) => item.id === objectResize.objectId);
      if (!object) return;
      const snap = (value: number) => Math.round(value * 20) / 20;
      onObjectChange(object.id, {
        width: snap(Math.max(0.3, Math.min(lotWidth - object.x, objectResize.startWidth + localX))),
        depth: snap(Math.max(0.3, Math.min(lotDepth - object.y, objectResize.startDepth + localY))),
      });
      return;
    }
    if (objectDrag && objectDrag.pointerId === event.pointerId && onObjectChange) {
      const point = clientToSvgPoint(event.clientX, event.clientY);
      const delta = projectedDeltaToWorld(point.x - objectDrag.startSvgX, point.y - objectDrag.startSvgY);
      const object = objects.find((item) => item.id === objectDrag.objectId);
      if (!object) return;
      const snap = (value: number) => Math.round(value * 20) / 20;
      onObjectChange(object.id, {
        x: snap(Math.max(0, Math.min(lotWidth - object.width, objectDrag.startObjectX + delta.x))),
        y: snap(Math.max(0, Math.min(lotDepth - object.depth, objectDrag.startObjectY + delta.y))),
      });
      return;
    }
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current && touchPointersRef.current.size >= 2) {
        const points = [...touchPointersRef.current.values()].slice(0, 2);
        const distance = Math.max(8, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
        const nextZoom = Math.max(0.6, Math.min(2.35, pinchRef.current.zoom * (distance / pinchRef.current.distance)));
        setZoom(Number(nextZoom.toFixed(2)));
        return;
      }
    }
    if (!orbitGesture || orbitGesture.pointerId !== event.pointerId) return;
    const delta = event.clientX - orbitGesture.startX;
    setRotation(normalizeRotation(orbitGesture.startRotation + delta * 0.45));
  };

  const handleOrbitEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (objectResize?.pointerId === event.pointerId) {
      setObjectResize(null);
      onObjectEditEnd?.();
    }
    if (objectDrag?.pointerId === event.pointerId) {
      setObjectDrag(null);
      onObjectEditEnd?.();
    }
    if (event.pointerType === "touch") {
      touchPointersRef.current.delete(event.pointerId);
      if (touchPointersRef.current.size < 2) pinchRef.current = null;
    }
    if (orbitGesture?.pointerId === event.pointerId) setOrbitGesture(null);
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setZoom((value) => {
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      return Math.max(0.6, Math.min(2.35, Number((value + delta).toFixed(2))));
    });
  };

  const visibleLevels = useMemo(
    () => (showAllFloors && !interiorMode)
      ? (Array.isArray(levels) ? levels : [])
      : (Array.isArray(levels) ? levels : []).filter((level) => level.floor === activeFloor),
    [levels, showAllFloors, activeFloor, interiorMode],
  );

  const frameSpaces = visibleLevels.flatMap((level) => level.closedSpaces);
  const frameWalls = visibleLevels.flatMap((level) => [...level.walls, ...level.customWalls]);
  const frameBounds = frameSpaces.length
    ? {
        minX: Math.min(...frameSpaces.map((space) => space.bounds.x)),
        maxX: Math.max(...frameSpaces.map((space) => space.bounds.x + space.bounds.width)),
        minY: Math.min(...frameSpaces.map((space) => space.bounds.y)),
        maxY: Math.max(...frameSpaces.map((space) => space.bounds.y + space.bounds.height)),
      }
    : frameWalls.length
      ? {
          minX: Math.min(...frameWalls.flatMap((wall) => [wall.x1, wall.x2])),
          maxX: Math.max(...frameWalls.flatMap((wall) => [wall.x1, wall.x2])),
          minY: Math.min(...frameWalls.flatMap((wall) => [wall.y1, wall.y2])),
          maxY: Math.max(...frameWalls.flatMap((wall) => [wall.y1, wall.y2])),
        }
      : { minX: 0, maxX: lotWidth, minY: 0, maxY: lotDepth };

  const buildingWidth = Math.max(1, frameBounds.maxX - frameBounds.minX);
  const buildingDepth = Math.max(1, frameBounds.maxY - frameBounds.minY);
  const buildingCenterX = (frameBounds.minX + frameBounds.maxX) / 2;
  const buildingCenterY = (frameBounds.minY + frameBounds.maxY) / 2;
  const projectionWidth = buildingCenterX * 2;
  const projectionDepth = buildingCenterY * 2;

  const topLevel = levels.reduce<ConceptModelLevel | undefined>(
    (highest, level) => !highest || level.floor > highest.floor ? level : highest,
    undefined,
  );
  const topBounds = roofBounds(topLevel);
  const topZ = ((topLevel?.floor ?? 0) * LEVEL_HEIGHT) + WALL_HEIGHT + FLOOR_THICKNESS;

  const maxLevel = Math.max(0, ...levels.map((level) => level.floor));
  const totalBuildingHeight = Math.max(LEVEL_HEIGHT, (maxLevel + 1) * LEVEL_HEIGHT);
  const frameExtent = Math.max(buildingWidth, buildingDepth);
  const sceneWidth = Math.max(20, frameExtent * 1.95 + 10);
  const sceneHeight = Math.max(17, frameExtent * 1.08 + totalBuildingHeight * 2.35 + 9);

  useEffect(() => {
    setZoom(1.32);
  }, [activeFloor, showAllFloors, levels.length, Math.round(buildingWidth * 10), Math.round(buildingDepth * 10)]);

  const lotCorners = useMemo(
    () => quad(0, 0, lotWidth, lotDepth, -FLOOR_THICKNESS, rotation, projectionWidth, projectionDepth, zoom),
    [rotation, lotWidth, lotDepth, projectionWidth, projectionDepth, zoom],
  );

  const wallCount = visibleLevels.reduce(
    (sum, level) => sum + level.walls.length + level.customWalls.length,
    0,
  );
  const openingCount = visibleLevels.reduce((sum, level) => sum + level.openings.length, 0);
  const spaceCount = visibleLevels.reduce((sum, level) => sum + level.closedSpaces.length, 0);

  const exteriorMaterial = getFacadeMaterial(facadeDesign?.surfaceMaterials.main);
  const accentMaterial = getFacadeMaterial(facadeDesign?.surfaceMaterials.accent);
  const allSpaces = levels.flatMap((level) => level.closedSpaces);
  const buildingBounds = allSpaces.length
    ? {
        minX: Math.min(...allSpaces.map((space) => space.bounds.x)),
        maxX: Math.max(...allSpaces.map((space) => space.bounds.x + space.bounds.width)),
        minY: Math.min(...allSpaces.map((space) => space.bounds.y)),
        maxY: Math.max(...allSpaces.map((space) => space.bounds.y + space.bounds.height)),
      }
    : { minX: frameBounds.minX, maxX: frameBounds.maxX, minY: frameBounds.minY, maxY: frameBounds.maxY };

  return (
    <div className="relative h-[calc(100dvh-64px)] overflow-hidden bg-[#edf1f4]">
      <div className="absolute left-4 right-4 top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white/92 px-4 py-3 text-slate-800 shadow-xl backdrop-blur">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Layers3 className="h-4 w-4" /> Modelo 3D sincronizado
          </div>
          <div className="text-xs text-slate-500">Arraste o fundo para orbitar · arraste objetos para mover · use o gizmo para girar, redimensionar, duplicar ou excluir · pinça no celular ou roda do mouse para zoom.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRenderView && (
            <button
              type="button"
              onClick={onRenderView}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-600"
            >
              <Sparkles className="h-4 w-4" />
              Renderizar vista
            </button>
          )}
          <div className="hidden overflow-hidden rounded-xl border bg-slate-50 sm:flex">
            {([
              [35, "Iso"],
              [0, "Frente"],
              [90, "Lateral"],
              [180, "Traseira"],
            ] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setCameraPreset(value)}
                className={Math.abs(normalizeRotation(rotation) - value) < 2
                  ? "bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 first:border-l-0 hover:bg-white"}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setInteriorMode((value) => {
                const next = !value;
                if (next) {
                  setShowAllFloors(false);
                  setShowRoof(false);
                }
                return next;
              });
            }}
            className={interiorMode
              ? "rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700"
              : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"}
          >
            {interiorMode ? "Interior ativo" : "Modo interior"}
          </button>
          <button
            type="button"
            onClick={() => setShowRoof((value) => !value)}
            className={showRoof
              ? "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
              : "rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700"}
          >
            {showRoof ? "Ocultar cobertura" : "Mostrar cobertura"}
          </button>
          <button
            type="button"
            onClick={() => setShowLabels((value) => !value)}
            className={showLabels
              ? "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
              : "rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700"}
          >
            {showLabels ? "Ocultar nomes" : "Mostrar nomes"}
          </button>
          {paintTool && (
            <div className="flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">
              <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: paintTool.swatch }} />
              Pintar {paintTool.target === "wall" ? "parede" : paintTool.target === "floor" ? "piso" : "objeto"} · {paintTool.name}
              <button
                type="button"
                onClick={onCancelPaint}
                className="ml-1 rounded-md border border-orange-200 bg-white px-2 py-0.5 text-[10px] font-bold"
              >
                Sair
              </button>
            </div>
          )}
          {levels.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllFloors((value) => !value)}
              className={showAllFloors
                ? "rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700"
                : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"}
            >
              {showAllFloors ? "Todos pavimentos" : "Pavimento ativo"}
            </button>
          )}
          <button type="button" onClick={() => setRotation((value) => normalizeRotation(value - 15))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50" title="Girar para esquerda">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setRotation((value) => normalizeRotation(value + 15))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50" title="Girar para direita">
            <RotateCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.12).toFixed(2))))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50" title="Reduzir">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.min(2.35, Number((value + 0.12).toFixed(2))))} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50" title="Ampliar">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={resetCamera} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50" title="Restaurar câmera">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        data-concept-model3d-source="true"
        viewBox={`${-sceneWidth / 2} ${-sceneHeight / 2} ${sceneWidth} ${sceneHeight}`}
        onPointerDown={handleOrbitStart}
        onPointerMove={handleOrbitMove}
        onPointerUp={handleOrbitEnd}
        onPointerCancel={handleOrbitEnd}
        onWheel={handleWheel}
        onClick={() => {
          onSelectObject?.(null);
          onSelectWall?.(null);
          onSelectCustomWall?.(null);
          onSelectClosedSpace?.(null);
        }}
        className={`block h-[calc(100dvh-64px)] min-h-[620px] w-full touch-none select-none bg-[radial-gradient(circle_at_50%_24%,#ffffff_0%,#eef2f6_52%,#dfe5eb_100%)] ${paintTool ? "cursor-crosshair" : orbitGesture ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Modelo tridimensional conceitual da planta"
      >
        <defs>
          <linearGradient id="concept3d-floor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#d9e0e7" />
          </linearGradient>
          <linearGradient id="concept3d-wall" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={exteriorMaterial.baseColor} />
            <stop offset="100%" stopColor={exteriorMaterial.shadeColor} />
          </linearGradient>
          <linearGradient id="concept3d-wall-side" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={exteriorMaterial.shadeColor} />
            <stop offset="100%" stopColor={exteriorMaterial.lineColor} />
          </linearGradient>
          <linearGradient id="concept3d-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accentMaterial.baseColor} />
            <stop offset="100%" stopColor={accentMaterial.shadeColor} />
          </linearGradient>
          <linearGradient id="concept3d-roof" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c5a47" />
            <stop offset="100%" stopColor="#4e382e" />
          </linearGradient>
          <filter id="concept3d-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0.8" dy="1.8" stdDeviation="1.7" floodColor="#475569" floodOpacity="0.22" />
          </filter>
        </defs>

        <polygon points={points(lotCorners)} fill="url(#concept3d-floor)" fillOpacity="0.34" stroke="#475569" strokeOpacity="0.55" strokeWidth="0.06" />
        <ellipse
          cx="0"
          cy={Math.max(2.5, sceneHeight * 0.08)}
          rx={Math.max(6, buildingWidth * 0.95 * zoom)}
          ry={Math.max(2.2, buildingDepth * 0.28 * zoom)}
          fill="#64748b"
          opacity="0.11"
        />

        {visibleLevels.map((level) => {
          const levelBase = level.floor * LEVEL_HEIGHT;
          const allWalls = [
            ...level.walls.map((wall) => ({
              id: wall.id,
              x1: wall.x1,
              y1: wall.y1,
              x2: wall.x2,
              y2: wall.y2,
              thickness: wall.exterior ? 0.18 : 0.12,
              exterior: wall.exterior,
              custom: false,
            })),
            ...level.customWalls.map((wall) => ({ ...wall, exterior: false, custom: true })),
          ];

          return (
            <g key={`level-${level.floor}`} opacity={!showAllFloors && level.floor !== activeFloor ? 0.2 : 1}>
              {level.closedSpaces.map((space) => (
                <g key={`${level.floor}-${space.id}`}>
                  {space.cells.map((cell, index) => (
                    <polygon
                      key={`${space.id}-slab-${index}`}
                      points={points(quad(
                        cell.x,
                        cell.y,
                        cell.x + cell.width,
                        cell.y + cell.height,
                        levelBase,
                        rotation, projectionWidth, projectionDepth, zoom,
                      ))}
                      fill={floor3dMaterial(level.floorMaterials?.[space.id])?.fill ?? (level.floor === activeFloor ? "#e2e8f0" : "#cbd5e1")}
                      fillOpacity={selectedClosedSpaceId === space.id ? "0.96" : level.floorMaterials?.[space.id] ? "0.82" : level.floor === activeFloor ? "0.42" : "0.28"}
                      stroke={selectedClosedSpaceId === space.id ? "#f97316" : floor3dMaterial(level.floorMaterials?.[space.id])?.edge ?? "#94a3b8"}
                      strokeOpacity={selectedClosedSpaceId === space.id ? "1" : level.floorMaterials?.[space.id] ? "0.68" : "0.35"}
                      strokeWidth={selectedClosedSpaceId === space.id ? "0.10" : "0.04"}
                      className={onSelectClosedSpace && level.floor === activeFloor ? "cursor-pointer" : undefined}
                      onClick={(event) => {
                        if (level.floor !== activeFloor) return;
                        event.stopPropagation();
                        if (paintTool?.target === "floor" && onPaintFloor) {
                          onPaintFloor(space.id, paintTool.materialId);
                          return;
                        }
                        onSelectClosedSpace?.(space.id);
                      }}
                    />
                  ))}
                  {showLabels && (() => {
                    const labelPoint = project(
                      { x: space.centroid.x, y: space.centroid.y, z: levelBase + 0.18 },
                      rotation, projectionWidth, projectionDepth, zoom,
                    );
                    const label = level.labels[space.id]?.trim();
                    return (
                      <g transform={`translate(${labelPoint.x} ${labelPoint.y})`} pointerEvents="none">
                        <rect x="-2.4" y="-0.62" width="4.8" height="1.1" rx="0.22" fill="#020617" fillOpacity="0.72" />
                        <text x="0" y="-0.12" textAnchor="middle" fontSize="0.48" fontWeight="800" fill="#f8fafc">
                          {label || `Espaço P${level.floor + 1}`}
                        </text>
                        <text x="0" y="0.31" textAnchor="middle" fontSize="0.34" fontWeight="700" fill="#cbd5e1">
                          {space.area.toFixed(1)} m²
                        </text>
                      </g>
                    );
                  })()}
                </g>
              ))}

              <g filter="url(#concept3d-shadow)">
                {allWalls.flatMap((wall) =>
                  splitWallForOpenings(wall, level.openings).map((piece, index) => {
                    const shape = wallPolygon(
                      piece.wall,
                      rotation, projectionWidth, projectionDepth, zoom,
                      levelBase + piece.zMin,
                      levelBase + piece.zMax,
                    );
                    const selectedWallMaterial = wall3dMaterial(level.wallMaterials?.[wall.id]);
                    return (
                      <g
                        key={`${level.floor}-${wall.id}-${piece.kind}-${index}`}
                        opacity={interiorMode && wall.exterior ? 0.28 : 1}
                        className={level.floor === activeFloor ? "cursor-pointer" : undefined}
                        onClick={(event) => {
                          if (level.floor !== activeFloor) return;
                          event.stopPropagation();
                          if (paintTool?.target === "wall" && onPaintWall) {
                            onPaintWall(wall.id, paintTool.materialId);
                            return;
                          }
                          if (wall.custom) onSelectCustomWall?.(wall.id);
                          else onSelectWall?.(wall.id);
                        }}
                      >
                        <polygon
                          points={points(shape.sideA)}
                          fill={selectedWallMaterial?.front ?? (wall.exterior ? exteriorMaterial.baseColor : "#aab5c3")}
                          stroke={(wall.custom ? selectedCustomWallId : selectedWallId) === wall.id ? "#f97316" : "#475569"}
                          strokeWidth={(wall.custom ? selectedCustomWallId : selectedWallId) === wall.id ? "0.11" : "0.055"}
                        />
                        <polygon
                          points={points(shape.sideB)}
                          fill={selectedWallMaterial?.side ?? "url(#concept3d-wall-side)"}
                          stroke="#475569"
                          strokeWidth="0.055"
                        />
                        <polygon
                          points={points(shape.top)}
                          fill={selectedWallMaterial?.top ?? "url(#concept3d-wall)"}
                          stroke={(wall.custom ? selectedCustomWallId : selectedWallId) === wall.id ? "#f97316" : "#64748b"}
                          strokeWidth={(wall.custom ? selectedCustomWallId : selectedWallId) === wall.id ? "0.11" : "0.055"}
                        />
                      </g>
                    );
                  })
                )}
              </g>

              {level.floor > 0 && (() => {
                const lowerStairs = levels
                  .find((candidate) => candidate.floor === level.floor - 1)
                  ?.stairs.map((stair) => ({
                    x: stair.x - 0.08,
                    y: stair.y - 0.08,
                    width: stair.width + 0.16,
                    height: stair.depth + 0.16,
                  })) ?? [];

                return level.closedSpaces.flatMap((space) =>
                  space.cells.flatMap((cell, index) =>
                    slabPiecesForCell(cell, lowerStairs).map((piece, pieceIndex) => (
                      <polygon
                        key={`${space.id}-floor-slab-${index}-${pieceIndex}`}
                        points={points(quad(
                          piece.x,
                          piece.y,
                          piece.x + piece.width,
                          piece.y + piece.height,
                          levelBase - FLOOR_THICKNESS,
                          rotation, projectionWidth, projectionDepth, zoom,
                        ))}
                        fill="#64748b"
                        fillOpacity="0.7"
                        stroke="#475569"
                        strokeWidth="0.05"
                      />
                    ))
                  )
                );
              })()}

              {level.stairs.flatMap((stair) => {
                const steps = 10;
                const alongY = stair.depth >= stair.width;
                return Array.from({ length: steps }).map((_, index) => {
                  const ratioStart = index / steps;
                  const ratioEnd = (index + 1) / steps;
                  const z = levelBase + (index / steps) * WALL_HEIGHT;
                  const x1 = alongY ? stair.x : stair.x + stair.width * ratioStart;
                  const x2 = alongY ? stair.x + stair.width : stair.x + stair.width * ratioEnd;
                  const y1 = alongY ? stair.y + stair.depth * ratioStart : stair.y;
                  const y2 = alongY ? stair.y + stair.depth * ratioEnd : stair.y + stair.depth;
                  return (
                    <polygon
                      key={`${stair.id}-step-${index}`}
                      points={points(quad(x1, y1, x2, y2, z, rotation, projectionWidth, projectionDepth, zoom))}
                      fill="#b8a78f"
                      stroke="#6b5a47"
                      strokeWidth="0.04"
                    />
                  );
                });
              })}
            </g>
          );
        })}

        {objects
          .filter((object) => (showAllFloors && !interiorMode) || object.floor === activeFloor)
          .map((object) => {
            const zBase = object.floor * LEVEL_HEIGHT + FLOOR_THICKNESS;
            const colors = object3dMaterial(object);
            const primitives = objectPrimitives(object, zBase);
            return (
              <g
                key={`concept-object-3d-${object.id}`}
                filter="url(#concept3d-shadow)"
                className={onSelectObject ? "cursor-pointer" : undefined}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  if (paintTool?.target === "object" && onPaintObject) {
                    onPaintObject(object.id, paintTool.materialId);
                    return;
                  }
                  onSelectObject?.(object.id);
                  if (!onObjectChange) return;
                  onObjectEditStart?.();
                  const point = clientToSvgPoint(event.clientX, event.clientY);
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  setObjectDrag({
                    pointerId: event.pointerId,
                    objectId: object.id,
                    startSvgX: point.x,
                    startSvgY: point.y,
                    startObjectX: object.x,
                    startObjectY: object.y,
                  });
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (paintTool?.target === "object" && onPaintObject) {
                    onPaintObject(object.id, paintTool.materialId);
                    return;
                  }
                  onSelectObject?.(object.id);
                }}
              >
                {primitives.map((primitive, primitiveIndex) => {
                  const shape = primitiveBoxPolygons(
                    primitive,
                    object.rotation,
                    rotation,
                    projectionWidth,
                    projectionDepth,
                    zoom,
                  );
                  const selectedStroke = selectedObjectId === object.id ? "#f97316" : "#475569";
                  const selectedWidth = selectedObjectId === object.id ? "0.10" : "0.04";
                  const tone = primitiveIndex % 3;
                  return (
                    <g key={`${object.id}-${primitive.key}`}>
                      <polygon
                        points={points(shape.sideA)}
                        fill={tone === 0 ? colors.sideA : tone === 1 ? colors.sideB : colors.top}
                        stroke={selectedStroke}
                        strokeWidth={selectedWidth}
                      />
                      <polygon
                        points={points(shape.sideB)}
                        fill={tone === 0 ? colors.sideB : tone === 1 ? colors.top : colors.sideA}
                        stroke={selectedStroke}
                        strokeWidth={selectedWidth}
                      />
                      <polygon
                        points={points(shape.top)}
                        fill={colors.top}
                        stroke={selectedStroke}
                        strokeWidth={selectedWidth}
                      />
                    </g>
                  );
                })}
                {selectedObjectId === object.id && (() => {
                  const gizmo = project(
                    {
                      x: object.x + object.width / 2,
                      y: object.y + object.depth / 2,
                      z: zBase + 1.75,
                    },
                    rotation,
                    projectionWidth,
                    projectionDepth,
                    zoom,
                  );
                  const actions = [
                    { key: "rotate", label: "↻", title: "Girar 90°", run: () => onObjectRotate?.(object.id) },
                    { key: "smaller", label: "−", title: "Diminuir", run: () => scaleObject(object.id, 0.9) },
                    { key: "larger", label: "+", title: "Aumentar", run: () => scaleObject(object.id, 1.1) },
                    { key: "duplicate", label: "⧉", title: "Duplicar", run: () => onObjectDuplicate?.(object.id) },
                    { key: "delete", label: "×", title: "Excluir", run: () => onObjectDelete?.(object.id) },
                  ];
                  const buttonWidth = 0.92;
                  const toolbarWidth = actions.length * buttonWidth + 0.28;
                  const resizeRadians = (object.rotation * Math.PI) / 180;
                  const localX = object.width / 2;
                  const localY = object.depth / 2;
                  const resizeWorld = {
                    x: object.x + object.width / 2 + localX * Math.cos(resizeRadians) - localY * Math.sin(resizeRadians),
                    y: object.y + object.depth / 2 + localX * Math.sin(resizeRadians) + localY * Math.cos(resizeRadians),
                  };
                  const resizeHandle = project(
                    { x: resizeWorld.x, y: resizeWorld.y, z: zBase + 0.12 },
                    rotation,
                    projectionWidth,
                    projectionDepth,
                    zoom,
                  );
                  return (
                    <>
                      <g transform={`translate(${gizmo.x - toolbarWidth / 2} ${gizmo.y - 0.5})`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                        <rect x="0" y="0" width={toolbarWidth} height="0.92" rx="0.24" fill="#0f172a" fillOpacity="0.94" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="0.04" />
                        {actions.map((action, index) => (
                          <g
                            key={action.key}
                            transform={`translate(${0.14 + index * buttonWidth} 0.10)`}
                            className="cursor-pointer"
                            onClick={(event) => {
                              event.stopPropagation();
                              action.run();
                            }}
                          >
                            <rect width="0.78" height="0.72" rx="0.18" fill={action.key === "delete" ? "#7f1d1d" : "#1e293b"} />
                            <text x="0.39" y="0.49" textAnchor="middle" fontSize="0.42" fontWeight="800" fill="#f8fafc">
                              {action.label}
                            </text>
                            <title>{action.title}</title>
                          </g>
                        ))}
                      </g>
                      {!paintTool && (
                        <g
                          transform={`translate(${resizeHandle.x} ${resizeHandle.y})`}
                          className="cursor-se-resize"
                          onPointerDown={(event) => {
                            if (event.button !== 0 || !onObjectChange) return;
                            event.stopPropagation();
                            onObjectEditStart?.();
                            const point = clientToSvgPoint(event.clientX, event.clientY);
                            event.currentTarget.setPointerCapture?.(event.pointerId);
                            setObjectResize({
                              pointerId: event.pointerId,
                              objectId: object.id,
                              startSvgX: point.x,
                              startSvgY: point.y,
                              startWidth: object.width,
                              startDepth: object.depth,
                              rotation: object.rotation,
                            });
                          }}
                        >
                          <circle r="0.34" fill="#f97316" stroke="#ffffff" strokeWidth="0.10" />
                          <path d="M -0.13 -0.13 L 0.13 0.13 M 0.00 -0.18 L 0.18 0.00 M -0.18 0.00 L 0.00 0.18" stroke="#ffffff" strokeWidth="0.06" strokeLinecap="round" />
                          <title>Arraste para redimensionar</title>
                        </g>
                      )}
                    </>
                  );
                })()}
              </g>
            );
          })}

        {showAllFloors && !interiorMode && facadeDesign?.volumes.map((volume) => {
          const x1 = buildingBounds.minX + buildingWidth * (volume.x / 100);
          const x2 = Math.min(buildingBounds.maxX, x1 + buildingWidth * (volume.width / 100));
          const y = buildingBounds.minY - Math.max(0.08, volume.depth);
          const zTop = Math.max(0.2, totalBuildingHeight * (1 - volume.y / 100));
          const zBottom = Math.max(0, totalBuildingHeight * (1 - (volume.y + volume.height) / 100));
          const shape = wallPolygon(
            {
              x1,
              y1: y,
              x2: Math.max(x1 + 0.25, x2),
              y2: y,
              thickness: Math.max(0.12, volume.depth),
            },
            rotation, projectionWidth, projectionDepth, zoom,
            zBottom,
            Math.max(zBottom + 0.18, zTop),
          );
          const material = getFacadeMaterial(volume.materialId);
          return (
            <g key={`facade-volume-3d-${volume.id}`} opacity={volume.opacity ?? 1}>
              <polygon points={points(shape.sideA)} fill={material.baseColor} stroke={material.lineColor} strokeWidth="0.06" />
              <polygon points={points(shape.sideB)} fill={material.shadeColor} stroke={material.lineColor} strokeWidth="0.06" />
              <polygon points={points(shape.top)} fill={material.baseColor} stroke={material.lineColor} strokeWidth="0.06" />
            </g>
          );
        })}

        {showRoof && showAllFloors && !interiorMode && topBounds && roof === "platibanda" && (
          <polygon
            points={points(quad(
              topBounds.minX,
              topBounds.minY,
              topBounds.maxX,
              topBounds.maxY,
              topZ,
              rotation, projectionWidth, projectionDepth, zoom,
            ))}
            fill="#d5d9dc"
            fillOpacity="0.94"
            stroke="#737b82"
            strokeWidth="0.08"
          />
        )}

        {showRoof && showAllFloors && !interiorMode && topBounds && (roof === "aparente" || roof === "misto") && (() => {
          const midY = (topBounds.minY + topBounds.maxY) / 2;
          const ridgeZ = topZ + Math.min(2.2, (topBounds.maxY - topBounds.minY) * 0.22);
          const leftPlane = [
            project({ x: topBounds.minX, y: topBounds.minY, z: topZ }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: topBounds.maxX, y: topBounds.minY, z: topZ }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: topBounds.maxX, y: midY, z: ridgeZ }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: topBounds.minX, y: midY, z: ridgeZ }, rotation, projectionWidth, projectionDepth, zoom),
          ];
          const rightPlane = [
            project({ x: topBounds.minX, y: midY, z: ridgeZ }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: topBounds.maxX, y: midY, z: ridgeZ }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: topBounds.maxX, y: topBounds.maxY, z: topZ }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: topBounds.minX, y: topBounds.maxY, z: topZ }, rotation, projectionWidth, projectionDepth, zoom),
          ];
          return (
            <g>
              <polygon points={points(leftPlane)} fill="url(#concept3d-roof)" stroke="#3f2f28" strokeWidth="0.08" />
              <polygon points={points(rightPlane)} fill="#65493b" stroke="#3f2f28" strokeWidth="0.08" />
            </g>
          );
        })()}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-white/60">
        <span>{visibleLevels.length} pavimento{visibleLevels.length !== 1 ? "s" : ""} · {wallCount} paredes · {openingCount} vãos · {spaceCount} espaços</span>
        <span>Vista {Math.round(rotation)}° · pé-direito {WALL_HEIGHT.toFixed(2).replace(".", ",")} m · laje {(FLOOR_THICKNESS * 100).toFixed(0)} cm</span>
      </div>
    </div>
  );
}
