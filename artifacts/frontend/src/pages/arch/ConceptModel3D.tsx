import { sceneGesture } from "./conceptSceneGesture";
import { exposedWallFaces } from "./conceptWallSurfaces";
import { partitionOrthogonalWallSolids } from "./conceptWallSolidUnion";
import { alignOpeningSegment, alignOpeningPoint, openingVerticalBounds } from "./conceptWallVoids";
import type { SiteFrontSide } from "./conceptSitePlacement";
import { buildFacadeMeshBoxes, facadeBoxFaces } from "./conceptFacadeMeshes";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Layers3, Maximize2, RotateCcw, RotateCw, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import type { OpeningMarker, WallSegment } from "./conceptGeometry";
import type { ClosedSpace } from "./conceptWallNetwork";
import { getFacadeMaterial, type FacadeDesignState } from "./conceptFacadeDesign";
import type { ConceptPlanObject } from "./ConceptPlan2D";
import ConceptWebGLScene from "./ConceptWebGLScene";
import { buildRoofPlan } from "./conceptRoofPlan";
import { CONCEPT_PBR_MATERIALS } from "./catalogs/conceptMaterialCatalog";
import { listConceptModelVariants } from "./catalogs/conceptModelCatalog";

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
  frontSide?: SiteFrontSide;
  objects?: ConceptPlanObject[];
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
  onObjectEditStart?: () => void;
  onObjectEditEnd?: () => void;
  selectedWallId?: string | null;
  selectedCustomWallId?: string | null;
  selectedClosedSpaceId?: string | null;
  selectedOpeningId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  onSelectCustomWall?: (wallId: string | null) => void;
  onSelectClosedSpace?: (spaceId: string | null) => void;
  onSelectOpening?: (openingId: string | null) => void;
  paintTool?: null | { target: "object" | "wall" | "floor"; materialId: string; name: string; swatch: string };
  onPaintObject?: (objectId: string, materialId: string) => void;
  onPaintWall?: (wallId: string, materialId: string) => void;
  onPaintFloor?: (spaceId: string, materialId: string) => void;
  onCancelPaint?: () => void;
  savedTourPoints?: Array<{
    id: string;
    name: string;
    floor: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }>;
  onSavedTourPointsChange?: (points: Array<{
    id: string;
    name: string;
    floor: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }>) => void;
  onSavedTourPointActivate?: (point: {
    id: string;
    name: string;
    floor: number;
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }) => void;
  onRenderView?: (
    lightingMode: "day" | "sunset" | "night",
    renderView: "interior" | "exterior",
    provenance?: {
      sceneId?: string | null;
      sceneName?: string | null;
      cameraSnapshot?: {
        floor?: number;
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
      } | null;
    },
  ) => void;
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
    appliance: 1.90,
    sanitary: 0.90,
    outdoor: 0.95,
    tv: 1.25,
    plant: 1.15,
    lamp: 1.45,
    rug: 0.06,
    outlet: 0.22,
    switch: 1.10,
    light_point: 2.60,
    water_point: 0.55,
    drain_point: 0.08,
    shower_point: 2.10,
    faucet_point: 1.05,
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
    case "appliance":
      return [
        p("body", 0.03, 0.03, 0.94, 0.94, 0.02, 1.86),
        p("front", 0.08, 0.00, 0.84, 0.10, 0.18, 1.72),
        p("handle", 0.80, 0.00, 0.08, 0.08, 0.88, 1.56),
      ];
    case "sanitary":
      return [
        p("base", 0.16, 0.18, 0.68, 0.66, 0.02, 0.42),
        p("bowl", 0.10, 0.08, 0.80, 0.76, 0.36, 0.60),
        p("back", 0.20, 0.02, 0.60, 0.30, 0.48, 0.92),
      ];
    case "outdoor":
      return [
        p("base", 0.04, 0.10, 0.92, 0.82, 0.10, 0.34),
        p("seat", 0.06, 0.14, 0.88, 0.72, 0.32, 0.52),
        p("back", 0.06, 0.04, 0.88, 0.16, 0.50, 0.96),
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
  const thickness = Math.max(0.000001, wall.thickness ?? 0.15);
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


const WALL_3D_MATERIALS: Record<string, { front: string; side: string; top: string }> = {
  "pintura-branca": { front: "#f8fafc", side: "#e2e8f0", top: "#ffffff" },
  "pintura-cinza": { front: "#cbd5e1", side: "#94a3b8", top: "#e2e8f0" },
  "cimento-aparente": { front: "url(#wall-concrete)", side: "#6b7280", top: "#d1d5db" },
  "madeira-ripada": { front: "url(#wall-wood-slat)", side: "#8b5e3c", top: "#d2a679" },
  "pedra-cinza": { front: "url(#wall-stone-speckle)", side: "#57534e", top: "#a8a29e" },
  "preto-fosco-parede": { front: "#1f2937", side: "#111827", top: "#374151" },
};

function wall3dMaterial(id?: string) {
  return id ? WALL_3D_MATERIALS[id] : undefined;
}

const FLOOR_3D_MATERIALS: Record<string, { fill: string; edge: string }> = {
  "porcelanato-claro": { fill: "url(#floor-tile-light)", edge: "#a8a29e" },
  "cimento-queimado": { fill: "#cbd5e1", edge: "#64748b" },
  "madeira-carvalho": { fill: "url(#floor-wood-light)", edge: "#8b7355" },
  "madeira-nogueira": { fill: "url(#floor-wood-dark)", edge: "#574437" },
  "pedra-natural": { fill: "url(#floor-stone)", edge: "#78716c" },
  "ceramica-clara": { fill: "url(#floor-tile-light)", edge: "#a8a29e" },
  "vinilico-claro": { fill: "url(#floor-vinyl-light)", edge: "#a16207" },
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
  frontSide = "bottom",
  objects = [],
  selectedObjectId = null,
  onSelectObject,
  onObjectChange,
  onObjectDrop,
  onObjectRotate,
  onObjectDuplicate,
  onObjectDelete,
  onObjectEditStart,
  onObjectEditEnd,
  selectedWallId = null,
  selectedCustomWallId = null,
  selectedClosedSpaceId = null,
  selectedOpeningId = null,
  onSelectWall,
  onSelectCustomWall,
  onSelectClosedSpace,
  onSelectOpening,
  paintTool = null,
  onPaintObject,
  onPaintWall,
  onPaintFloor,
  onCancelPaint,
  savedTourPoints = [],
  onSavedTourPointsChange,
  onSavedTourPointActivate,
  onRenderView,
}: Props) {
  const [rotation, setRotation] = useState(35);
  const [zoom, setZoom] = useState(1.32);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [showAllFloors, setShowAllFloors] = useState(true);
  const [showRoof, setShowRoof] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [interiorMode, setInteriorMode] = useState(false);
  const [lightingMode, setLightingMode] = useState<"day" | "sunset" | "night">("day");
  const [renderQuality, setRenderQuality] = useState<"fast" | "realistic" | "ultra">("realistic");
  const [webglReady, setWebglReady] = useState(false);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");
  const [navigationMode, setNavigationMode] = useState<"orbit" | "walk" | "spin" | "tour" | "panorama">("orbit");
  const [tourIndex, setTourIndex] = useState(0);
  const [tourToken, setTourToken] = useState(0);
  const [walkControl, setWalkControl] = useState({ forward: 0, strafe: 0 });
  const [walkSpeed, setWalkSpeed] = useState(0.12);
  const [walkResetToken, setWalkResetToken] = useState(0);
  const [cameraSnapshotToken, setCameraSnapshotToken] = useState(0);
  const [pendingSavedScene, setPendingSavedScene] = useState(false);
  const [pendingRenderRequest, setPendingRenderRequest] = useState<null | {
    lightingMode: "day" | "sunset" | "night";
    renderView: "interior" | "exterior";
  }>(null);
  const [activeSavedSceneId, setActiveSavedSceneId] = useState<string | null>(null);
  const [panoramaExportToken, setPanoramaExportToken] = useState(0);
  const [panoramaExportState, setPanoramaExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [panoramaExportError, setPanoramaExportError] = useState<string | null>(null);
  const sceneRootRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const selectionGestureRef = useRef<ReturnType<typeof sceneGesture> | null>(null);
  if (!selectionGestureRef.current) selectionGestureRef.current = sceneGesture();
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
  const [cameraPan, setCameraPan] = useState<null | {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  }>(null);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<null | {
    distance: number;
    zoom: number;
    centerX: number;
    centerY: number;
    panX: number;
    panY: number;
  }>(null);

  const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;
  useEffect(() => {
    if (navigationMode !== "walk") setWalkControl({ forward: 0, strafe: 0 });
  }, [navigationMode]);

  const tourPoints = useMemo(() => {
    const level = levels.find((item) => item.floor === activeFloor);
    if (!level) return [];
    return level.closedSpaces
      .filter((space) => Number.isFinite(space.centroid?.x) && Number.isFinite(space.centroid?.y) && space.area >= 1.5)
      .sort((a, b) => b.area - a.area)
      .map((space, index) => ({
        id: space.id,
        label: level.labels?.[space.id] ?? `Ambiente ${index + 1}`,
        x: space.centroid.x,
        y: space.centroid.y,
        floor: activeFloor,
        area: space.area,
      }));
  }, [activeFloor, levels]);

  const activeTourPoint = tourPoints.length
    ? tourPoints[Math.min(tourIndex, tourPoints.length - 1)]
    : null;

  useEffect(() => {
    if (!tourPoints.length) {
      setTourIndex(0);
      if (navigationMode === "tour") setNavigationMode("walk");
      return;
    }
    setTourIndex((current) => Math.min(current, tourPoints.length - 1));
  }, [navigationMode, tourPoints.length]);

  const goToTourPoint = (nextIndex: number) => {
    if (!tourPoints.length) return;
    const normalized = ((nextIndex % tourPoints.length) + tourPoints.length) % tourPoints.length;
    setTourIndex(normalized);
    setTourToken((value) => value + 1);
  };

  const activeSavedScene = savedTourPoints.find((point) => point.id === activeSavedSceneId) ?? null;

  const requestSaveScene = () => {
    if (!webglReady) return;
    setPendingSavedScene(true);
    setCameraSnapshotToken((value) => value + 1);
  };

  const handleCameraSnapshot = (snapshot: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  }) => {
    if (pendingSavedScene) {
      const point = {
        id: `scene-${Date.now()}`,
        name: `Cena ${savedTourPoints.length + 1}`,
        floor: activeFloor,
        position: snapshot.position,
        target: snapshot.target,
      };
      onSavedTourPointsChange?.([...savedTourPoints, point]);
      setActiveSavedSceneId(point.id);
      setPendingSavedScene(false);
      setNavigationMode("orbit");
    }

    if (pendingRenderRequest) {
      onRenderView?.(
        pendingRenderRequest.lightingMode,
        pendingRenderRequest.renderView,
        {
          sceneId: activeSavedScene?.id ?? null,
          sceneName: activeSavedScene?.name ?? null,
          cameraSnapshot: {
            floor: activeFloor,
            position: snapshot.position,
            target: snapshot.target,
          },
        },
      );
      setPendingRenderRequest(null);
    }
  };

  const requestRenderFromCurrentCamera = (
    nextLightingMode: "day" | "sunset" | "night",
    nextRenderView: "interior" | "exterior",
  ) => {
    if (!webglReady || pendingRenderRequest) return;
    setPendingRenderRequest({ lightingMode: nextLightingMode, renderView: nextRenderView });
    setCameraSnapshotToken((value) => value + 1);
  };

  const resetCamera = () => {
    setRotation(35);
    setZoom(1.32);
    setPanX(0);
    setPanY(0);
  };

  const setCameraPreset = (nextRotation: number) => {
    setRotation(normalizeRotation(nextRotation));
    setZoom(1.32);
    setPanX(0);
    setPanY(0);
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
    if (paintTool) return;
    const wantsPan = event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey);
    if (wantsPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setCameraPan({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: panX,
        startPanY: panY,
      });
      setOrbitGesture(null);
      return;
    }
    if (event.button !== 0) return;
    if (event.pointerType === "touch") {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointersRef.current.size === 2) {
        const points = [...touchPointersRef.current.values()];
        const centerX = (points[0].x + points[1].x) / 2;
        const centerY = (points[0].y + points[1].y) / 2;
        pinchRef.current = {
          distance: Math.max(8, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)),
          zoom,
          centerX,
          centerY,
          panX,
          panY,
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
    if (cameraPan && cameraPan.pointerId === event.pointerId) {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const dx = ((event.clientX - cameraPan.startClientX) / rect.width) * sceneWidth;
      const dy = ((event.clientY - cameraPan.startClientY) / rect.height) * sceneHeight;
      setPanX(cameraPan.startPanX - dx);
      setPanY(cameraPan.startPanY - dy);
      return;
    }
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

        const centerX = (points[0].x + points[1].x) / 2;
        const centerY = (points[0].y + points[1].y) / 2;
        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          const dx = ((centerX - pinchRef.current.centerX) / rect.width) * sceneWidth;
          const dy = ((centerY - pinchRef.current.centerY) / rect.height) * sceneHeight;
          setPanX(pinchRef.current.panX - dx);
          setPanY(pinchRef.current.panY - dy);
        }
        return;
      }
    }
    if (!orbitGesture || orbitGesture.pointerId !== event.pointerId) return;
    const delta = event.clientX - orbitGesture.startX;
    setRotation(normalizeRotation(orbitGesture.startRotation + delta * 0.45));
  };

  const handleOrbitEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (cameraPan?.pointerId === event.pointerId) {
      setCameraPan(null);
    }
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
  // Cobertura por pavimento (mesma regra do 3D Pro): laje na altura de cada parte e platibanda no contorno real.
  const roofPlan = buildRoofPlan(levels.map((level) => ({
    floor: level.floor,
    cells: (level.closedSpaces ?? []).flatMap((space) => space.cells ?? []),
  })));
  const roofTopZ = (floor: number) => floor * LEVEL_HEIGHT + WALL_HEIGHT + FLOOR_THICKNESS;
  const renderRoofFloor = (floor: number) => {
    if (!showRoof || !showAllFloors || interiorMode) return null;
    const topFloor = floor >= Math.max(0, ...levels.map((level) => level.floor));
    if (topFloor && roof !== "platibanda") return null;
    const slabs = roofPlan.slabs.filter((slab) => slab.floor === floor);
    const edges = roofPlan.edges.filter((edge) => edge.floor === floor);
    if (!slabs.length && !edges.length) return null;
    const z = roofTopZ(floor);
    return (
      <g key={`roof-floor-${floor}`}>
        {slabs.map((slab, index) => (
          <polygon key={`roof-slab-${floor}-${index}`}
            points={points(quad(slab.x, slab.y, slab.x + slab.width, slab.y + slab.height, z, rotation, projectionWidth, projectionDepth, zoom))}
            fill="#c3c7cc" stroke="#c3c7cc" strokeWidth="0.12" strokeLinejoin="round" />
        ))}
        {edges.map((edge, index) => {
          const corners = [
            project({ x: edge.x1, y: edge.y1, z }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: edge.x2, y: edge.y2, z }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: edge.x2, y: edge.y2, z: z + 0.9 }, rotation, projectionWidth, projectionDepth, zoom),
            project({ x: edge.x1, y: edge.y1, z: z + 0.9 }, rotation, projectionWidth, projectionDepth, zoom),
          ];
          return <polygon key={`roof-parapet-${floor}-${index}`} points={points(corners)} fill="#efece6" stroke="#8b9096" strokeWidth="0.06" />;
        })}
      </g>
    );
  };

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

  const selectedObject3D = selectedObjectId
    ? objects.find((item) => item.id === selectedObjectId) ?? null
    : null;
  const pbrFurnitureMaterials = Object.values(CONCEPT_PBR_MATERIALS).filter((item) => item.family === "furniture");
  const selectedObjectModelVariants = selectedObject3D ? listConceptModelVariants(selectedObject3D.kind) : [];

  const exteriorMaterial = getFacadeMaterial(facadeDesign?.surfaceMaterials.main);
  const accentMaterial = getFacadeMaterial(facadeDesign?.surfaceMaterials.accent);
  const buildingBounds = useMemo(() => {
    const coordinates = levels.flatMap((level) => [
      ...[...level.walls, ...level.customWalls].flatMap((wall) => [
        { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 },
      ]),
      ...level.closedSpaces.flatMap((space) => space.cells.flatMap((cell) => [
        { x: cell.x, y: cell.y }, { x: cell.x + cell.width, y: cell.y + cell.height },
      ])),
    ]).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    return coordinates.length ? {
      minX: Math.min(...coordinates.map((point) => point.x)),
      maxX: Math.max(...coordinates.map((point) => point.x)),
      minY: Math.min(...coordinates.map((point) => point.y)),
      maxY: Math.max(...coordinates.map((point) => point.y)),
    } : { minX: 0, maxX: lotWidth, minY: 0, maxY: lotDepth };
  }, [levels, lotWidth, lotDepth]);

  const lightingPalette = lightingMode === "night"
    ? {
        skyTop: "#111827",
        skyBottom: "#334155",
        ground: "#334155",
        groundOpacity: 0.56,
        shadow: "#020617",
        shadowOpacity: 0.48,
        ambientOverlay: "#0f172a",
        ambientOpacity: 0.22,
        window: "#fde68a",
        windowOpacity: 0.92,
      }
    : lightingMode === "sunset"
      ? {
          skyTop: "#fef3c7",
          skyBottom: "#f5b38f",
          ground: "#c9b8a2",
          groundOpacity: 0.42,
          shadow: "#7c2d12",
          shadowOpacity: 0.26,
          ambientOverlay: "#fb923c",
          ambientOpacity: 0.08,
          window: "#dbeafe",
          windowOpacity: 0.72,
        }
      : {
          skyTop: "#ffffff",
          skyBottom: "#dfe9f3",
          ground: "#dbe4ea",
          groundOpacity: 0.34,
          shadow: "#475569",
          shadowOpacity: 0.22,
          ambientOverlay: "#ffffff",
          ambientOpacity: 0,
          window: "#bfe3f7",
          windowOpacity: 0.58,
        };

  return (
    <div ref={sceneRootRef} className="relative h-[calc(100dvh-64px)] overflow-hidden bg-[#edf1f4]">
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-3">
        <div className="pointer-events-auto hidden max-w-[360px] rounded-2xl border border-slate-200/90 bg-white/94 px-3.5 py-3 text-slate-800 shadow-lg backdrop-blur lg:block">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Layers3 className="h-4 w-4" /> {webglReady ? "Modelo 3D Pro" : "Modelo 3D sincronizado"}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{webglReady ? "Selecione e edite diretamente na cena." : "Arraste para orbitar · roda do mouse para zoom."}</div>
        </div>
        <div className="pointer-events-auto ml-auto flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-1.5 rounded-2xl border border-slate-200/90 bg-white/94 p-1.5 text-slate-800 shadow-lg backdrop-blur">
          {webglReady && selectedObjectId && (
            <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setTransformMode("translate")}
                className={transformMode === "translate"
                  ? "bg-orange-500 px-3 py-2 text-[11px] font-semibold text-white"
                  : "px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"}
              >
                Mover
              </button>
              <button
                type="button"
                onClick={() => setTransformMode("rotate")}
                className={transformMode === "rotate"
                  ? "border-l border-orange-400 bg-orange-500 px-3 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"}
              >
                Girar
              </button>
            </div>
          )}
          {webglReady && selectedObject3D && (
            <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 lg:flex">
              {selectedObjectModelVariants.length > 0 && (
                <select
                  value={selectedObject3D.model3dUrl ?? selectedObjectModelVariants[0]?.url ?? ""}
                  onChange={(event) => onObjectChange?.(selectedObject3D.id, { model3dUrl: event.target.value || undefined })}
                  className="h-7 max-w-40 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"
                  title="Modelo 3D real"
                >
                  {selectedObjectModelVariants.map((variant) => (
                    <option key={variant.id} value={variant.url}>{variant.label}</option>
                  ))}
                </select>
              )}
              <select
                value={selectedObject3D.materialId ?? ""}
                onChange={(event) => onObjectChange?.(selectedObject3D.id, { materialId: event.target.value || undefined })}
                className="h-7 max-w-36 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"
                title="Material PBR do objeto"
              >
                <option value="">Material do modelo</option>
                {pbrFurnitureMaterials.map((material) => (
                  <option key={material.id} value={material.id}>{material.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                Esc.
                <input
                  type="number"
                  min="0.25"
                  max="6"
                  step="0.25"
                  value={selectedObject3D.materialScale ?? 1}
                  onChange={(event) => onObjectChange?.(selectedObject3D.id, {
                    materialScale: Math.max(0.25, Math.min(6, Number(event.target.value) || 1)),
                  })}
                  className="h-7 w-14 rounded-md border border-slate-200 px-1.5 text-[11px] text-slate-700"
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                Tex.
                <input
                  type="number"
                  min="0"
                  max="355"
                  step="5"
                  value={selectedObject3D.materialRotation ?? 0}
                  onChange={(event) => onObjectChange?.(selectedObject3D.id, {
                    materialRotation: ((Number(event.target.value) || 0) % 360 + 360) % 360,
                  })}
                  className="h-7 w-14 rounded-md border border-slate-200 px-1.5 text-[11px] text-slate-700"
                />
                °
              </label>
            </div>
          )}
          {webglReady && selectedObject3D && (
            <div className="absolute bottom-4 left-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/96 p-3 shadow-2xl backdrop-blur lg:hidden">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-800">{selectedObject3D.label}</div>
                  <div className="text-[10px] text-slate-500">Editar objeto diretamente no 3D</div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectObject?.(null)}
                  className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Fechar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {selectedObjectModelVariants.length > 0 && (
                  <label className="col-span-2 text-[10px] font-semibold text-slate-500">
                    Modelo 3D
                    <select
                      value={selectedObject3D.model3dUrl ?? selectedObjectModelVariants[0]?.url ?? ""}
                      onChange={(event) => onObjectChange?.(selectedObject3D.id, { model3dUrl: event.target.value || undefined })}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                    >
                      {selectedObjectModelVariants.map((variant) => (
                        <option key={variant.id} value={variant.url}>{variant.label}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="col-span-2 text-[10px] font-semibold text-slate-500">
                  Material
                  <select
                    value={selectedObject3D.materialId ?? ""}
                    onChange={(event) => onObjectChange?.(selectedObject3D.id, { materialId: event.target.value || undefined })}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  >
                    <option value="">Material do modelo</option>
                    {pbrFurnitureMaterials.map((material) => (
                      <option key={material.id} value={material.id}>{material.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-semibold text-slate-500">
                  Escala textura
                  <input
                    type="range"
                    min="0.25"
                    max="6"
                    step="0.25"
                    value={selectedObject3D.materialScale ?? 1}
                    onChange={(event) => onObjectChange?.(selectedObject3D.id, {
                      materialScale: Math.max(0.25, Math.min(6, Number(event.target.value) || 1)),
                    })}
                    className="mt-2 w-full"
                  />
                  <span className="mt-1 block text-center text-[10px] text-slate-600">
                    {(selectedObject3D.materialScale ?? 1).toFixed(2)}×
                  </span>
                </label>
                <label className="text-[10px] font-semibold text-slate-500">
                  Rotação textura
                  <input
                    type="range"
                    min="0"
                    max="355"
                    step="5"
                    value={selectedObject3D.materialRotation ?? 0}
                    onChange={(event) => onObjectChange?.(selectedObject3D.id, {
                      materialRotation: ((Number(event.target.value) || 0) % 360 + 360) % 360,
                    })}
                    className="mt-2 w-full"
                  />
                  <span className="mt-1 block text-center text-[10px] text-slate-600">
                    {Math.round(selectedObject3D.materialRotation ?? 0)}°
                  </span>
                </label>
              </div>
            </div>
          )}
          {webglReady && (
            <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setNavigationMode("orbit")}
                className={navigationMode === "orbit"
                  ? "bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white"
                  : "px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"}
              >
                Orbitar
              </button>
              <button
                type="button"
                onClick={() => {
                  setNavigationMode("walk");
                  setInteriorMode(true);
                  setShowAllFloors(false);
                  setShowRoof(false);
                }}
                className={navigationMode === "walk"
                  ? "border-l border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"}
              >
                Caminhar
              </button>
              <button
                type="button"
                onClick={() => {
                  setNavigationMode("spin");
                  setInteriorMode(false);
                  setShowAllFloors(true);
                  setShowRoof(true);
                }}
                className={navigationMode === "spin"
                  ? "border-l border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"}
                title="Giro automático de inspeção ao redor do projeto"
              >
                Giro 360°
              </button>
              <button
                type="button"
                onClick={() => {
                  setNavigationMode("panorama");
                  setInteriorMode(true);
                  setShowAllFloors(false);
                  setShowRoof(false);
                }}
                className={navigationMode === "panorama"
                  ? "border-l border-violet-700 bg-violet-700 px-3 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-3 py-2 text-[11px] font-semibold text-violet-700 hover:bg-violet-50"}
                title="Capturar panorama 360° real da posição atual da câmera"
              >
                Panorama 360°
              </button>
              <button
                type="button"
                disabled={!tourPoints.length}
                onClick={() => {
                  setNavigationMode("tour");
                  setInteriorMode(true);
                  setShowAllFloors(false);
                  setShowRoof(false);
                  setTourIndex(0);
                  setTourToken((value) => value + 1);
                }}
                className={navigationMode === "tour"
                  ? "border-l border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"}
                title={tourPoints.length ? "Tour automático pelos ambientes" : "Nenhum ambiente fechado detectado neste pavimento"}
              >
                Tour
              </button>
            </div>
          )}
          {webglReady && navigationMode === "panorama" && (
            <div className="flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 p-1">
              <button
                type="button"
                onClick={() => {
                  setPanoramaExportError(null);
                  setPanoramaExportState("exporting");
                  setPanoramaExportToken((value) => value + 1);
                }}
                disabled={panoramaExportState === "exporting"}
                className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
                title="Gerar imagem equiretangular 2:1 em PNG"
              >
                {panoramaExportState === "exporting" ? "Exportando..." : "Exportar 360°"}
              </button>
              <span className="px-1 text-[9px] font-semibold text-cyan-700">4096 × 2048 PNG</span>
              {panoramaExportError && (
                <span className="max-w-[220px] truncate px-1 text-[9px] font-semibold text-red-600" title={panoramaExportError}>
                  {panoramaExportError}
                </span>
              )}
            </div>
          )}
          {webglReady && (
            <div className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 p-1">
              <button
                type="button"
                onClick={requestSaveScene}
                className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-violet-800 hover:bg-violet-100"
                title="Salvar a posição e direção atuais da câmera"
              >
                {pendingSavedScene ? "Salvando..." : "Salvar cena"}
              </button>
              {savedTourPoints.length > 0 && (
                <div className="flex max-w-[38vw] gap-1 overflow-x-auto">
                  {savedTourPoints.map((point) => (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => {
                        setNavigationMode("orbit");
                        onSavedTourPointActivate?.(point);
                        setActiveSavedSceneId(point.id);
                      }}
                      className={activeSavedSceneId === point.id
                        ? "shrink-0 rounded-md bg-violet-600 px-2 py-1.5 text-[10px] font-semibold text-white"
                        : "shrink-0 rounded-md px-2 py-1.5 text-[10px] font-semibold text-violet-800 hover:bg-violet-100"}
                      title={`${point.name} · Pavimento ${point.floor + 1}`}
                    >
                      {point.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white" title="Qualidade da visualização 3D">
            {([
              ["fast", "Leve"],
              ["realistic", "Detalhada"],
              ["ultra", "Alta"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRenderQuality(value)}
                className={renderQuality === value
                  ? "bg-orange-500 px-2.5 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 first:border-l-0 hover:bg-slate-50"}
              >
                {label}
              </button>
            ))}
          </div>
          {webglReady && navigationMode === "tour" && activeTourPoint && (
            <div className="flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 p-1">
              <button
                type="button"
                onClick={() => goToTourPoint(tourIndex - 1)}
                className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-orange-800 hover:bg-orange-100"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => {
                  setTourToken((value) => value + 1);
                }}
                className="min-w-[110px] rounded-md px-2 py-1.5 text-[10px] font-semibold text-orange-900 hover:bg-orange-100"
                title={`${activeTourPoint.label} · ${activeTourPoint.area.toFixed(1)} m²`}
              >
                {activeTourPoint.label}
              </button>
              <button
                type="button"
                onClick={() => goToTourPoint(tourIndex + 1)}
                className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-orange-800 hover:bg-orange-100"
              >
                →
              </button>
              <span className="px-1 text-[9px] font-semibold text-orange-700">
                {tourIndex + 1}/{tourPoints.length}
              </span>
            </div>
          )}
          {webglReady && navigationMode === "walk" && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              {([
                [0.08, "Lenta"],
                [0.12, "Normal"],
                [0.20, "Rápida"],
              ] as const).map(([speed, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setWalkSpeed(speed)}
                  className={Math.abs(walkSpeed - speed) < 0.001
                    ? "rounded-md bg-orange-500 px-2 py-1.5 text-[10px] font-semibold text-white"
                    : "rounded-md px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setWalkControl({ forward: 0, strafe: 0 });
                  setWalkResetToken((value) => value + 1);
                }}
                className="rounded-md border-l border-slate-200 px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                title="Voltar para o ponto inicial do tour"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  const root = sceneRootRef.current;
                  if (!root) return;
                  if (document.fullscreenElement) void document.exitFullscreen?.();
                  else void root.requestFullscreen?.();
                }}
                className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                title="Abrir walkthrough em tela cheia"
              >
                Tela cheia
              </button>
            </div>
          )}
          {onRenderView && (
            <button
              type="button"
              onClick={() => requestRenderFromCurrentCamera(
                lightingMode,
                interiorMode ? "interior" : "exterior",
              )}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-600"
            >
              <Sparkles className="h-4 w-4" />
              Renderizar vista
            </button>
          )}
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
            {([
              ["day", "Dia"],
              ["sunset", "Entardecer"],
              ["night", "Noite"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLightingMode(value)}
                className={lightingMode === value
                  ? "bg-slate-900 px-2.5 py-2 text-[11px] font-semibold text-white"
                  : "border-l border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 first:border-l-0 hover:bg-slate-50"}
              >
                {label}
              </button>
            ))}
          </div>
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
              ? "hidden rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 md:inline-flex"
              : "hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 md:inline-flex"}
          >
            {interiorMode ? "Interior ativo" : "Modo interior"}
          </button>
          <button
            type="button"
            onClick={() => setShowRoof((value) => !value)}
            className={showRoof
              ? "hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 md:inline-flex"
              : "hidden rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 md:inline-flex"}
          >
            {showRoof ? "Ocultar cobertura" : "Mostrar cobertura"}
          </button>
          {!webglReady && (
          <button
            type="button"
            onClick={() => setShowLabels((value) => !value)}
            className={showLabels
              ? "hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 md:inline-flex"
              : "hidden rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 md:inline-flex"}
          >
            {showLabels ? "Ocultar nomes" : "Mostrar nomes"}
          </button>
          )}
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
                ? "hidden rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 md:inline-flex"
                : "hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 md:inline-flex"}
            >
              {showAllFloors ? "Todos pavimentos" : "Pavimento ativo"}
            </button>
          )}
        </div>
      </div>

      <div className="absolute bottom-20 right-3 z-20 flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white/94 p-1.5 shadow-xl backdrop-blur">
        <button type="button" onClick={() => setRotation((value) => normalizeRotation(value - 15))} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" title="Girar para esquerda">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setRotation((value) => normalizeRotation(value + 15))} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" title="Girar para direita">
          <RotateCw className="h-4 w-4" />
        </button>
        <div className="mx-auto my-0.5 h-px w-7 bg-slate-200" />
        <button type="button" onClick={() => setZoom((value) => Math.min(2.35, Number((value + 0.12).toFixed(2))))} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" title="Ampliar">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.12).toFixed(2))))} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" title="Reduzir">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button type="button" onClick={resetCamera} className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100" title="Centralizar cena">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <ConceptWebGLScene
        facadeDesign={facadeDesign}
        frontSide={frontSide}
        lotWidth={lotWidth}
        lotDepth={lotDepth}
        activeFloor={activeFloor}
        levels={levels}
        objects={Array.isArray(objects) ? objects : []}
        selectedObjectId={selectedObjectId}
        selectedWallId={selectedWallId}
        selectedCustomWallId={selectedCustomWallId}
        selectedClosedSpaceId={selectedClosedSpaceId}
        selectedOpeningId={selectedOpeningId}
        showAllFloors={showAllFloors}
        interiorMode={interiorMode}
        showRoof={showRoof}
        roof={roof}
        lightingMode={lightingMode}
        renderQuality={renderQuality}
        cameraPresetDegrees={rotation}
        cameraZoom={zoom}
        transformMode={transformMode}
        navigationMode={navigationMode}
        walkControl={walkControl}
        walkSpeed={walkSpeed}
        walkResetToken={walkResetToken}
        cameraSnapshotToken={cameraSnapshotToken}
        savedCameraViewpoint={activeSavedScene}
        onCameraSnapshot={handleCameraSnapshot}
        panoramaExportToken={panoramaExportToken}
        panoramaExportWidth={4096}
        onPanoramaExport={(dataUrl) => {
          try {
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = `arqdor-panorama-360-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setPanoramaExportState("idle");
            setPanoramaExportError(null);
          } catch {
            setPanoramaExportState("error");
            setPanoramaExportError("Não foi possível salvar o arquivo 360°.");
          }
        }}
        onPanoramaExportError={(message) => {
          setPanoramaExportState("error");
          setPanoramaExportError(message);
        }}
        tourPoint={activeTourPoint ? {
          x: activeTourPoint.x,
          y: activeTourPoint.y,
          floor: activeTourPoint.floor,
          token: tourToken,
        } : null}
        paintTool={paintTool}
        onReady={setWebglReady}
        onSelectObject={(objectId) => {
          onSelectObject?.(objectId);
          if (objectId) {
            onSelectWall?.(null);
            onSelectCustomWall?.(null);
            onSelectClosedSpace?.(null);
            onSelectOpening?.(null);
          }
        }}
        onSelectWall={onSelectWall}
        onSelectCustomWall={onSelectCustomWall}
        onSelectClosedSpace={onSelectClosedSpace}
        onSelectOpening={onSelectOpening}
        onPaintObject={onPaintObject}
        onPaintWall={onPaintWall}
        onPaintFloor={onPaintFloor}
        onObjectChange={onObjectChange}
        onObjectDrop={onObjectDrop}
        onObjectEditStart={onObjectEditStart}
        onObjectEditEnd={onObjectEditEnd}
      />

      {webglReady && navigationMode === "walk" && (
        <div
          aria-label="Controles touch do walkthrough"
          className="absolute bottom-5 left-5 z-20 grid grid-cols-3 gap-1 rounded-2xl border border-white/30 bg-slate-950/70 p-2 shadow-xl backdrop-blur md:hidden"
          onContextMenu={(event) => event.preventDefault()}
        >
          <div />
          <button
            type="button"
            aria-label="Andar para frente"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setWalkControl({ forward: 1, strafe: 0 });
            }}
            onPointerUp={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerCancel={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerLeave={() => setWalkControl({ forward: 0, strafe: 0 })}
            className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-xl font-bold text-white active:bg-orange-500"
          >
            ↑
          </button>
          <div />
          <button
            type="button"
            aria-label="Andar para esquerda"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setWalkControl({ forward: 0, strafe: -1 });
            }}
            onPointerUp={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerCancel={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerLeave={() => setWalkControl({ forward: 0, strafe: 0 })}
            className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-xl font-bold text-white active:bg-orange-500"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Andar para trás"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setWalkControl({ forward: -1, strafe: 0 });
            }}
            onPointerUp={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerCancel={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerLeave={() => setWalkControl({ forward: 0, strafe: 0 })}
            className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-xl font-bold text-white active:bg-orange-500"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label="Andar para direita"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setWalkControl({ forward: 0, strafe: 1 });
            }}
            onPointerUp={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerCancel={() => setWalkControl({ forward: 0, strafe: 0 })}
            onPointerLeave={() => setWalkControl({ forward: 0, strafe: 0 })}
            className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 text-xl font-bold text-white active:bg-orange-500"
          >
            →
          </button>
          <div className="col-span-3 pt-1 text-center text-[9px] font-semibold uppercase tracking-wide text-white/70">
            Arraste na tela para olhar
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        data-concept-model3d-source="true"
        viewBox={`${-sceneWidth / 2 + panX} ${-sceneHeight / 2 + panY} ${sceneWidth} ${sceneHeight}`}
        onPointerDownCapture={(event) => selectionGestureRef.current?.down(event.pointerId, event.clientX, event.clientY)}
        onPointerMoveCapture={(event) => selectionGestureRef.current?.move(event.pointerId, event.clientX, event.clientY)}
        onPointerUpCapture={(event) => selectionGestureRef.current?.up(event.pointerId, event.clientX, event.clientY)}
        onPointerCancelCapture={(event) => selectionGestureRef.current?.cancel(event.pointerId)}
        onClickCapture={(event) => {
          if (event.button !== 0 || !selectionGestureRef.current?.canClick()) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onPointerDown={handleOrbitStart}
        onPointerMove={handleOrbitMove}
        onPointerUp={handleOrbitEnd}
        onPointerCancel={handleOrbitEnd}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          onSelectObject?.(null);
          onSelectWall?.(null);
          onSelectCustomWall?.(null);
          onSelectClosedSpace?.(null);
          onSelectOpening?.(null);
        }}
        className={`block h-[calc(100dvh-64px)] min-h-[620px] w-full touch-none select-none transition-opacity ${webglReady ? "pointer-events-none opacity-0" : "opacity-100"} ${paintTool ? "cursor-crosshair" : cameraPan || orbitGesture ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Modelo tridimensional conceitual da planta"
        letterSpacing="normal"
      >
        <defs>
          <linearGradient id="concept3d-floor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#d9e0e7" />
          </linearGradient>
          <linearGradient id="concept3d-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lightingPalette.skyTop} />
            <stop offset="100%" stopColor={lightingPalette.skyBottom} />
          </linearGradient>
          <pattern id="floor-wood-light" width="1.2" height="0.34" patternUnits="userSpaceOnUse">
            <rect width="1.2" height="0.34" fill="#d6c2a8" />
            <path d="M0 0.17 H1.2 M0.6 0 V0.34" stroke="#b99a73" strokeWidth="0.035" strokeOpacity="0.7" />
          </pattern>
          <pattern id="floor-wood-dark" width="1.15" height="0.32" patternUnits="userSpaceOnUse">
            <rect width="1.15" height="0.32" fill="#9a775d" />
            <path d="M0 0.16 H1.15 M0.575 0 V0.32" stroke="#705441" strokeWidth="0.035" strokeOpacity="0.75" />
          </pattern>
          <pattern id="floor-tile-light" width="0.82" height="0.82" patternUnits="userSpaceOnUse">
            <rect width="0.82" height="0.82" fill="#eeeae5" />
            <path d="M0 0 H0.82 V0.82" fill="none" stroke="#c7c1b8" strokeWidth="0.035" />
          </pattern>
          <pattern id="floor-vinyl-light" width="1.0" height="0.28" patternUnits="userSpaceOnUse">
            <rect width="1.0" height="0.28" fill="#e5d3b3" />
            <path d="M0 0.14 H1 M0.5 0 V0.28" stroke="#c3a36f" strokeWidth="0.03" strokeOpacity="0.7" />
          </pattern>
          <pattern id="floor-stone" width="0.55" height="0.55" patternUnits="userSpaceOnUse">
            <rect width="0.55" height="0.55" fill="#d6d3d1" />
            <circle cx="0.13" cy="0.18" r="0.035" fill="#a8a29e" />
            <circle cx="0.39" cy="0.35" r="0.025" fill="#78716c" opacity="0.55" />
          </pattern>
          <pattern id="wall-wood-slat" width="0.24" height="1" patternUnits="userSpaceOnUse">
            <rect width="0.24" height="1" fill="#b98a5f" />
            <rect x="0.18" width="0.06" height="1" fill="#76543a" opacity="0.82" />
          </pattern>
          <pattern id="wall-stone-speckle" width="0.42" height="0.42" patternUnits="userSpaceOnUse">
            <rect width="0.42" height="0.42" fill="#78716c" />
            <circle cx="0.1" cy="0.12" r="0.035" fill="#a8a29e" />
            <circle cx="0.31" cy="0.28" r="0.025" fill="#57534e" />
          </pattern>
          <pattern id="wall-concrete" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
            <rect width="0.5" height="0.5" fill="#9ca3af" />
            <circle cx="0.12" cy="0.14" r="0.018" fill="#6b7280" opacity="0.55" />
            <circle cx="0.38" cy="0.34" r="0.014" fill="#d1d5db" opacity="0.7" />
          </pattern>
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
            <feDropShadow dx="0.8" dy="1.8" stdDeviation="1.7" floodColor={lightingPalette.shadow} floodOpacity={lightingPalette.shadowOpacity} />
          </filter>
        </defs>

        <rect
          x={-sceneWidth / 2 + panX}
          y={-sceneHeight / 2 + panY}
          width={sceneWidth}
          height={sceneHeight}
          fill="url(#concept3d-sky)"
          pointerEvents="none"
        />
        <polygon
          points={points(lotCorners)}
          fill={lightingPalette.ground}
          fillOpacity={lightingPalette.groundOpacity}
          stroke={lightingMode === "night" ? "#64748b" : "#475569"}
          strokeOpacity={lightingMode === "night" ? "0.38" : "0.55"}
          strokeWidth="0.06"
        />
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
          const wallBase = levelBase + FLOOR_THICKNESS;
          const allWalls = [
            ...level.walls.map((wall) => ({
              id: wall.id,
              x1: wall.x1,
              y1: wall.y1,
              x2: wall.x2,
              y2: wall.y2,
              thickness: 0.15,
              exterior: wall.exterior,
              custom: false,
            })),
            ...level.customWalls.map((wall) => ({ ...wall, exterior: false, custom: true })),
          ];

          const wallPieces = partitionOrthogonalWallSolids(allWalls, level.openings, WALL_HEIGHT);
          const wallSurfaces = exposedWallFaces(wallPieces);
          wallPieces.sort((a, b) => {
            const depth = (piece: typeof a) => {
              const center = rotatePoint((piece.wall.x1 + piece.wall.x2) / 2, (piece.wall.y1 + piece.wall.y2) / 2, rotation, projectionWidth, projectionDepth);
              return center.x + center.y;
            };
            return depth(a) - depth(b);
          });

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
                      // Vista externa com todos os pavimentos: laje opaca (antes parecia vidro azulado).
                      fillOpacity={selectedClosedSpaceId === space.id ? "0.96" : showAllFloors && !interiorMode && level.floor > 0 ? "1" : level.floorMaterials?.[space.id] ? "0.82" : level.floor === activeFloor ? "0.42" : "0.28"}
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
                {wallPieces.map((piece, index) => {
                    const wall = piece.wall;
                    const shape = wallPolygon(
                      piece.wall,
                      rotation, projectionWidth, projectionDepth, zoom,
                      wallBase + piece.zMin,
                      wallBase + piece.zMax,
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
                        {wallSurfaces.has(piece) ? wallSurfaces.get(piece)!.map((face, faceIndex) => {
                          const vertices = face.direction > 0 ? face.vertices : [...face.vertices].reverse();
                          const projected = vertices.map(([x, y, z]) => project({ x, y, z: wallBase + z }, rotation, projectionWidth, projectionDepth, zoom));
                          const area = projected.reduce((sum, point, i) => {
                            const next = projected[(i + 1) % projected.length];
                            return sum + point.x * next.y - next.x * point.y;
                          }, 0);
                          if (area <= 1e-8) return null;
                          const selected = (wall.custom ? selectedCustomWallId : selectedWallId) === wall.id;
                          return <polygon
                            key={faceIndex}
                            points={points(projected)}
                            fill={face.axis === 2
                              ? selectedWallMaterial?.top ?? "url(#concept3d-wall)"
                              : face.axis === 0
                                ? selectedWallMaterial?.front ?? (wall.exterior ? exteriorMaterial.baseColor : "#aab5c3")
                                : selectedWallMaterial?.side ?? "url(#concept3d-wall-side)"}
                            stroke={selected ? "#f97316" : "#475569"}
                            strokeWidth={selected ? "0.11" : "0.055"}
                          />;
                        }) : <>
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
                        </>}
                      </g>
                    );
                  })}
              </g>

              {level.openings.map((opening) => {
                const linkedWall = opening.roomId?.startsWith("custom-wall:") ? level.customWalls.find(wall => opening.roomId === `custom-wall:${wall.id}`) : undefined;
                const width = Math.max(0.05, opening.width ?? (opening.type === "door" ? 0.9 : 1.2));
                const bounds = openingVerticalBounds(opening, WALL_HEIGHT);
                if (!bounds) return null;
                const height = bounds.height;
                const sill = bounds.bottom;
                const rawSegment = opening.orientation === "vertical"
                  ? {
                      x1: opening.x,
                      y1: opening.y - width / 2,
                      x2: opening.x,
                      y2: opening.y + width / 2,
                      thickness: 0.035,
                    }
                  : {
                      x1: opening.x - width / 2,
                      y1: opening.y,
                      x2: opening.x + width / 2,
                      y2: opening.y,
                      thickness: 0.035,
                    };
                const segment = alignOpeningSegment(rawSegment, opening, linkedWall);
                const shape = wallPolygon(
                  segment,
                  rotation,
                  projectionWidth,
                  projectionDepth,
                  zoom,
                  wallBase + sill,
                  wallBase + Math.min(WALL_HEIGHT, sill + height),
                );
                const selected = selectedOpeningId === opening.id;
                const isDoor = opening.type === "door";
                const frameColor = lightingMode === "night" ? "#e2e8f0" : "#334155";
                const rail = Math.min(0.08, Math.max(0.035, width * 0.06));
                const zMin = wallBase + sill;
                const zMax = wallBase + Math.min(WALL_HEIGHT, sill + height);
                const frameSegments = opening.orientation === "vertical"
                  ? [
                      { x1: opening.x, y1: opening.y - width / 2, x2: opening.x, y2: opening.y - width / 2 + rail, thickness: 0.055, z0: zMin, z1: zMax },
                      { x1: opening.x, y1: opening.y + width / 2 - rail, x2: opening.x, y2: opening.y + width / 2, thickness: 0.055, z0: zMin, z1: zMax },
                    ]
                  : [
                      { x1: opening.x - width / 2, y1: opening.y, x2: opening.x - width / 2 + rail, y2: opening.y, thickness: 0.055, z0: zMin, z1: zMax },
                      { x1: opening.x + width / 2 - rail, y1: opening.y, x2: opening.x + width / 2, y2: opening.y, thickness: 0.055, z0: zMin, z1: zMax },
                    ];
                const horizontalRails = [
                  { z0: zMin, z1: Math.min(zMax, zMin + 0.07) },
                  { z0: Math.max(zMin, zMax - 0.07), z1: zMax },
                ];
                const mullionSegment = !isDoor && opening.openingStyle !== "fixed"
                  ? (opening.orientation === "vertical"
                    ? { x1: opening.x, y1: opening.y - rail / 2, x2: opening.x, y2: opening.y + rail / 2, thickness: 0.05 }
                    : { x1: opening.x - rail / 2, y1: opening.y, x2: opening.x + rail / 2, y2: opening.y, thickness: 0.05 })
                  : null;
                return (
                  <g
                    key={`${level.floor}-opening-3d-${opening.id}`}
                    className={level.floor === activeFloor ? "cursor-pointer" : undefined}
                    onClick={(event) => {
                      if (level.floor !== activeFloor) return;
                      event.stopPropagation();
                      onSelectOpening?.(opening.id);
                    }}
                  >
                    <polygon
                      points={points(shape.sideA)}
                      fill={isDoor ? "#8b5e3c" : lightingPalette.window}
                      fillOpacity={isDoor ? "0.94" : String(lightingPalette.windowOpacity)}
                      stroke={selected ? "#f97316" : isDoor ? "#5b4636" : "#5d8fab"}
                      strokeWidth={selected ? "0.12" : "0.055"}
                    />
                    <polygon
                      points={points(shape.sideB)}
                      fill={isDoor ? "#705441" : lightingMode === "night" ? "#f59e0b" : "#9dd2ef"}
                      fillOpacity={isDoor ? "0.94" : lightingMode === "night" ? "0.78" : "0.48"}
                      stroke={selected ? "#f97316" : isDoor ? "#5b4636" : "#5d8fab"}
                      strokeWidth={selected ? "0.12" : "0.055"}
                    />
                    <polygon
                      points={points(shape.top)}
                      fill={isDoor ? "#b98a5f" : lightingMode === "night" ? "#fde68a" : "#dff3ff"}
                      fillOpacity={isDoor ? "0.94" : lightingMode === "night" ? "0.86" : "0.65"}
                      stroke={selected ? "#f97316" : isDoor ? "#5b4636" : "#5d8fab"}
                      strokeWidth={selected ? "0.12" : "0.055"}
                    />
                    {!isDoor && (
                      <>
                        {frameSegments.map((frame, frameIndex) => {
                          const frameShape = wallPolygon(
                            alignOpeningSegment(frame, opening, linkedWall),
                            rotation,
                            projectionWidth,
                            projectionDepth,
                            zoom,
                            frame.z0,
                            frame.z1,
                          );
                          return (
                            <g key={`${opening.id}-frame-side-${frameIndex}`}>
                              <polygon points={points(frameShape.sideA)} fill={frameColor} stroke={frameColor} strokeWidth="0.035" />
                              <polygon points={points(frameShape.sideB)} fill={frameColor} stroke={frameColor} strokeWidth="0.035" />
                              <polygon points={points(frameShape.top)} fill="#64748b" stroke={frameColor} strokeWidth="0.03" />
                            </g>
                          );
                        })}
                        {horizontalRails.map((railBand, railIndex) => {
                          const railShape = wallPolygon(
                            segment,
                            rotation,
                            projectionWidth,
                            projectionDepth,
                            zoom,
                            railBand.z0,
                            railBand.z1,
                          );
                          return (
                            <g key={`${opening.id}-frame-horizontal-${railIndex}`}>
                              <polygon points={points(railShape.sideA)} fill={frameColor} stroke={frameColor} strokeWidth="0.03" />
                              <polygon points={points(railShape.sideB)} fill={frameColor} stroke={frameColor} strokeWidth="0.03" />
                              <polygon points={points(railShape.top)} fill="#64748b" stroke={frameColor} strokeWidth="0.03" />
                            </g>
                          );
                        })}
                        {mullionSegment && (() => {
                          const mullionShape = wallPolygon(
                            alignOpeningSegment(mullionSegment, opening, linkedWall),
                            rotation,
                            projectionWidth,
                            projectionDepth,
                            zoom,
                            zMin + Math.min(0.06, height / 3),
                            zMax - Math.min(0.06, height / 3),
                          );
                          return (
                            <g>
                              <polygon points={points(mullionShape.sideA)} fill={frameColor} stroke={frameColor} strokeWidth="0.03" />
                              <polygon points={points(mullionShape.sideB)} fill={frameColor} stroke={frameColor} strokeWidth="0.03" />
                              <polygon points={points(mullionShape.top)} fill="#64748b" stroke={frameColor} strokeWidth="0.03" />
                            </g>
                          );
                        })()}
                      </>
                    )}
                    {isDoor && (() => {
                      const handlePoint = project(
                        {
                          ...alignOpeningPoint({ x: opening.orientation === "vertical" ? opening.x + 0.02 : opening.x + width * 0.28, y: opening.orientation === "vertical" ? opening.y + width * 0.28 : opening.y + 0.02 }, opening, linkedWall),
                          z: wallBase + sill + height * 0.45,
                        },
                        rotation,
                        projectionWidth,
                        projectionDepth,
                        zoom,
                      );
                      return (
                        <g pointerEvents="none">
                          <circle cx={handlePoint.x} cy={handlePoint.y} r="0.10" fill="#f8fafc" stroke="#334155" strokeWidth="0.035" />
                          <circle cx={handlePoint.x} cy={handlePoint.y} r="0.035" fill="#0f172a" />
                        </g>
                      );
                    })()}
                    {selected && (
                      <g pointerEvents="none">
                        <title>{`${isDoor ? "Porta" : "Janela"} · ${opening.openingStyle === "sliding" ? "correr" : opening.openingStyle === "tilt_turn" ? "oscilobatente" : opening.openingStyle === "fixed" ? "fixa" : "giro"} · ${width.toFixed(2)} × ${height.toFixed(2)} m`}</title>
                      </g>
                    )}
                  </g>
                );
              })}

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
                        fill={showAllFloors && !interiorMode ? "#d6d3d1" : "#64748b"}
                        fillOpacity={showAllFloors && !interiorMode ? "1" : "0.7"}
                        stroke={showAllFloors && !interiorMode ? "#a8a29e" : "#475569"}
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
              {level.floor < maxLevel && renderRoofFloor(level.floor)}
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

        {showAllFloors && !interiorMode && facadeDesign && buildFacadeMeshBoxes(
          facadeDesign,
          { minX: buildingBounds.minX, maxX: buildingBounds.maxX, minZ: buildingBounds.minY, maxZ: buildingBounds.maxY },
          totalBuildingHeight,
          frontSide,
        ).map((box, boxIndex) => {
          const material = getFacadeMaterial(box.materialId);
          const faces = facadeBoxFaces(box).map((face) => face.map((point) =>
            project(point, rotation, projectionWidth, projectionDepth, zoom),
          )).sort((a, b) => a.reduce((sum, p) => sum + p.y, 0) - b.reduce((sum, p) => sum + p.y, 0));
          return (
            <g key={`facade-volume-3d-${box.id}-${boxIndex}`} opacity={box.opacity}>
              {faces.map((face, index) => (
                <polygon key={index} points={points(face)} fill={index % 2 ? material.shadeColor : material.baseColor}
                  stroke={material.lineColor} strokeWidth="0.025" />
              ))}
            </g>
          );
        })}

        {showRoof && showAllFloors && !interiorMode && topBounds && roof === "platibanda" && roofPlan.slabs.length === 0 && (
          <polygon
            points={points(quad(
              topBounds.minX,
              topBounds.minY,
              topBounds.maxX,
              topBounds.maxY,
              topZ,
              rotation, projectionWidth, projectionDepth, zoom,
            ))}
            fill="#c3c7cc"
            stroke="#737b82"
            strokeWidth="0.08"
          />
        )}
        {roofPlan.slabs.length > 0 && renderRoofFloor(maxLevel)}

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
        {lightingPalette.ambientOpacity > 0 && (
          <rect
            x={-sceneWidth / 2 + panX}
            y={-sceneHeight / 2 + panY}
            width={sceneWidth}
            height={sceneHeight}
            fill={lightingPalette.ambientOverlay}
            fillOpacity={lightingPalette.ambientOpacity}
            pointerEvents="none"
          />
        )}
      </svg>

      <div className="absolute bottom-3 left-3 z-20 hidden max-w-[calc(100%-5rem)] flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-[11px] text-slate-500 shadow-md backdrop-blur md:flex">
        <span>{visibleLevels.length} pavimento{visibleLevels.length !== 1 ? "s" : ""} · {wallCount} paredes · {openingCount} vãos · {spaceCount} espaços</span>
        <span className="hidden xl:inline">Vista {Math.round(rotation)}° · pé-direito {WALL_HEIGHT.toFixed(2).replace(".", ",")} m · laje {(FLOOR_THICKNESS * 100).toFixed(0)} cm</span>
      </div>
    </div>
  );
}


