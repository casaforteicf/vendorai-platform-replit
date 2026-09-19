import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Layers3, Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { OpeningMarker, WallSegment } from "./conceptGeometry";
import { OPENING_WALL_HEIGHT, normalizeOpeningParameters } from "./conceptOpenings";
import type { ClosedSpace } from "./conceptWallNetwork";
import { buildStairLandings, buildStairTreads, type StairCarrier, type StairSlabOpening } from "./conceptStairs";
import { buildRoofFaces, normalizeRoofParameters, roofPeakZ, type RoofInput } from "./conceptRoof";
import { conceptObjectCorners, type ConceptObject } from "./conceptObjects";
import {
  conceptFloorMaterial,
  normalizeConceptMaterialScheme,
  uniqueSchemeMaterials,
  type ConceptMaterialRef,
  type ConceptMaterialScheme,
} from "./conceptMaterials";

export type ConceptModelLevel = {
  floor: number;
  elevation: number;
  floorToFloorHeight: number;
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
  stairs: StairCarrier[];
  slabOpenings: StairSlabOpening[];
  objects: ConceptObject[];
};

type Props = {
  lotWidth: number;
  lotDepth: number;
  activeFloor: number;
  levels: ConceptModelLevel[];
  roof: RoofInput;
  materials: ConceptMaterialScheme;
};

type Point3 = { x: number; y: number; z: number };
type Point2 = { x: number; y: number };

const WALL_HEIGHT = OPENING_WALL_HEIGHT;
const FLOOR_THICKNESS = 0.16;

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

type ObjectVisualPart = {
  id: string;
  offsetX: number;
  offsetY: number;
  width: number;
  depth: number;
  zBase: number;
  height: number;
  shade?: number;
};

function objectVisualParts(object: ConceptObject): ObjectVisualPart[] {
  const w = object.width;
  const d = object.depth;
  const h = object.height;
  const full = (): ObjectVisualPart[] => [{
    id: "body", offsetX: 0, offsetY: 0, width: w, depth: d, zBase: 0, height: h,
  }];

  if (object.symbol === "bed") {
    return [
      { id: "base", offsetX: 0, offsetY: 0.06 * d, width: w * 0.96, depth: d * 0.9, zBase: 0, height: h * 0.38, shade: -18 },
      { id: "mattress", offsetX: 0, offsetY: 0.06 * d, width: w * 0.93, depth: d * 0.86, zBase: h * 0.38, height: h * 0.28, shade: 20 },
      { id: "headboard", offsetX: 0, offsetY: -d * 0.44, width: w, depth: Math.max(0.06, d * 0.07), zBase: 0, height: h, shade: -28 },
    ];
  }

  if (object.symbol === "sofa") {
    return [
      { id: "seat", offsetX: 0, offsetY: d * 0.08, width: w * 0.82, depth: d * 0.67, zBase: 0, height: h * 0.48 },
      { id: "back", offsetX: 0, offsetY: -d * 0.39, width: w * 0.92, depth: d * 0.16, zBase: h * 0.12, height: h * 0.82, shade: -16 },
      { id: "arm-left", offsetX: -w * 0.45, offsetY: d * 0.03, width: w * 0.1, depth: d * 0.7, zBase: 0, height: h * 0.66, shade: -10 },
      { id: "arm-right", offsetX: w * 0.45, offsetY: d * 0.03, width: w * 0.1, depth: d * 0.7, zBase: 0, height: h * 0.66, shade: -10 },
    ];
  }

  if (object.symbol === "chair") {
    return [
      { id: "seat", offsetX: 0, offsetY: d * 0.05, width: w * 0.82, depth: d * 0.72, zBase: h * 0.36, height: h * 0.12 },
      { id: "back", offsetX: 0, offsetY: -d * 0.38, width: w * 0.82, depth: d * 0.12, zBase: h * 0.43, height: h * 0.55, shade: -14 },
      { id: "base", offsetX: 0, offsetY: d * 0.04, width: w * 0.18, depth: d * 0.18, zBase: 0, height: h * 0.4, shade: -30 },
    ];
  }

  if (["table", "desk"].includes(object.symbol)) {
    return [
      { id: "top", offsetX: 0, offsetY: 0, width: w, depth: d, zBase: h * 0.78, height: Math.max(0.05, h * 0.12), shade: 10 },
      { id: "base", offsetX: 0, offsetY: 0, width: Math.max(0.12, w * 0.12), depth: Math.max(0.12, d * 0.18), zBase: 0, height: h * 0.8, shade: -28 },
    ];
  }

  if (["counter", "island"].includes(object.symbol)) {
    return [
      { id: "cabinet", offsetX: 0, offsetY: 0, width: w * 0.94, depth: d * 0.9, zBase: 0, height: h * 0.88, shade: -12 },
      { id: "top", offsetX: 0, offsetY: 0, width: w, depth: d, zBase: h * 0.88, height: h * 0.1, shade: 22 },
    ];
  }

  if (object.symbol === "toilet") {
    return [
      { id: "base", offsetX: 0, offsetY: d * 0.12, width: w * 0.7, depth: d * 0.66, zBase: 0, height: h * 0.48, shade: 12 },
      { id: "tank", offsetX: 0, offsetY: -d * 0.34, width: w * 0.88, depth: d * 0.22, zBase: h * 0.28, height: h * 0.68, shade: 4 },
    ];
  }

  if (object.symbol === "sink") {
    return [
      { id: "pedestal", offsetX: 0, offsetY: 0, width: w * 0.28, depth: d * 0.28, zBase: 0, height: h * 0.72, shade: -12 },
      { id: "basin", offsetX: 0, offsetY: 0, width: w * 0.92, depth: d * 0.8, zBase: h * 0.72, height: h * 0.18, shade: 18 },
    ];
  }

  if (object.symbol === "plant") {
    return [
      { id: "pot", offsetX: 0, offsetY: 0, width: w * 0.45, depth: d * 0.45, zBase: 0, height: h * 0.34, shade: -26 },
      { id: "foliage", offsetX: 0, offsetY: 0, width: w, depth: d, zBase: h * 0.28, height: h * 0.7, shade: 10 },
    ];
  }

  return full();
}

function objectPartVolumePolygons(
  object: ConceptObject,
  part: ObjectVisualPart,
  levelBase: number,
  rotation: number,
  lotWidth: number,
  lotDepth: number,
  zoom: number,
) {
  const radians = (object.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = object.x + part.offsetX * cos - part.offsetY * sin;
  const centerY = object.y + part.offsetX * sin + part.offsetY * cos;
  const halfW = part.width / 2;
  const halfD = part.depth / 2;
  const local = [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ];
  const footprint = local.map((point) => ({
    x: centerX + point.x * cos - point.y * sin,
    y: centerY + point.x * sin + point.y * cos,
  }));
  const base = footprint.map((point) => ({ ...point, z: levelBase + part.zBase }));
  const top = footprint.map((point) => ({ ...point, z: levelBase + part.zBase + part.height }));
  const projectPoints = (items: Point3[]) => items.map((point) => project(point, rotation, lotWidth, lotDepth, zoom));
  return {
    top: projectPoints(top),
    sides: [
      projectPoints([base[0], base[1], top[1], top[0]]),
      projectPoints([base[1], base[2], top[2], top[1]]),
      projectPoints([base[2], base[3], top[3], top[2]]),
      projectPoints([base[3], base[0], top[0], top[3]]),
    ],
  };
}

function normalizeHex(value: string | undefined, fallback: string) {
  if (value && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const text = value?.trim().toLowerCase() ?? "";
  if (text.includes("preto") || text.includes("black")) return "#202020";
  if (text.includes("branco") || text.includes("white")) return "#f0eee8";
  if (text.includes("bronze")) return "#735640";
  if (text.includes("dourado") || text.includes("gold")) return "#a88952";
  if (text.includes("cinza") || text.includes("gray") || text.includes("grey")) return "#858585";
  if (text.includes("verde") || text.includes("green")) return "#71806a";
  if (text.includes("azul") || text.includes("blue")) return "#6f8796";
  if (text.includes("bege") || text.includes("nude")) return "#c2ad91";
  if (text.includes("freij") || text.includes("madeira") || text.includes("wood")) return "#aa7b4b";
  return fallback;
}

function shadeHex(hex: string, amount: number) {
  const normalized = normalizeHex(hex, "#888888").slice(1);
  const value = Number.parseInt(normalized, 16);
  const r = Math.max(0, Math.min(255, (value >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (value & 255) + amount));
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function materialPatternId(material: ConceptMaterialRef) {
  return `concept-material-${material.id.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function materialFill(material: ConceptMaterialRef) {
  return `url(#${materialPatternId(material)})`;
}

function MaterialPatternDef({ material }: { material: ConceptMaterialRef }) {
  const id = materialPatternId(material);
  const base = material.color;
  const secondary = material.secondaryColor ?? shadeHex(base, -18);
  const edge = material.edgeColor ?? shadeHex(base, -38);

  if (material.pattern === "tile") {
    return (
      <pattern id={id} width="2.1" height="2.1" patternUnits="userSpaceOnUse">
        <rect width="2.1" height="2.1" fill={base} />
        <path d="M 0 0 H 2.1 M 0 0 V 2.1" stroke={edge} strokeWidth="0.045" opacity="0.52" />
        <path d="M 1.05 0 V 2.1 M 0 1.05 H 2.1" stroke={secondary} strokeWidth="0.018" opacity="0.22" />
      </pattern>
    );
  }

  if (material.pattern === "wood") {
    return (
      <pattern id={id} width="1.8" height="0.55" patternUnits="userSpaceOnUse">
        <rect width="1.8" height="0.55" fill={base} />
        <path d="M 0 .12 C .45 .02, .9 .25, 1.8 .1 M 0 .38 C .55 .26, 1.1 .52, 1.8 .34" fill="none" stroke={secondary} strokeWidth="0.045" opacity="0.72" />
        <path d="M .15 0 V .55 M 1.2 0 V .55" stroke={edge} strokeWidth="0.018" opacity="0.22" />
      </pattern>
    );
  }

  if (material.pattern === "stone") {
    return (
      <pattern id={id} width="1.45" height="1.05" patternUnits="userSpaceOnUse">
        <rect width="1.45" height="1.05" fill={base} />
        <path d="M .05 .2 Q .45 .02 .75 .22 T 1.4 .15 M .08 .72 Q .5 .5 .82 .78 T 1.38 .68" fill="none" stroke={secondary} strokeWidth="0.055" opacity="0.62" />
        <circle cx=".35" cy=".48" r=".08" fill={edge} opacity="0.22" />
        <circle cx="1.08" cy=".42" r=".055" fill={edge} opacity="0.18" />
      </pattern>
    );
  }

  if (material.pattern === "concrete") {
    return (
      <pattern id={id} width=".85" height=".85" patternUnits="userSpaceOnUse">
        <rect width=".85" height=".85" fill={base} />
        <circle cx=".16" cy=".19" r=".025" fill={secondary} opacity=".55" />
        <circle cx=".62" cy=".38" r=".018" fill={edge} opacity=".42" />
        <circle cx=".35" cy=".7" r=".022" fill={secondary} opacity=".46" />
      </pattern>
    );
  }

  if (material.pattern === "metal") {
    return (
      <pattern id={id} width="1" height=".5" patternUnits="userSpaceOnUse">
        <rect width="1" height=".5" fill={base} />
        <path d="M 0 .08 H 1 M 0 .25 H 1 M 0 .42 H 1" stroke={secondary} strokeWidth=".018" opacity=".45" />
      </pattern>
    );
  }

  if (material.pattern === "fabric") {
    return (
      <pattern id={id} width=".35" height=".35" patternUnits="userSpaceOnUse">
        <rect width=".35" height=".35" fill={base} />
        <path d="M 0 0 L .35 .35 M .35 0 L 0 .35" stroke={secondary} strokeWidth=".012" opacity=".38" />
      </pattern>
    );
  }

  return (
    <pattern id={id} width="1" height="1" patternUnits="userSpaceOnUse">
      <rect width="1" height="1" fill={base} />
      <rect width="1" height="1" fill={secondary} opacity="0.08" />
    </pattern>
  );
}

function objectPalette(object: ConceptObject) {
  const fallback =
    object.category === "banheiro" ? "#dbeafe" :
    object.category === "cozinha" || object.category === "eletro" ? "#d7d9da" :
    object.category === "decoracao" ? "#9dbc91" :
    object.category === "armazenamento" ? "#b8956e" :
    "#c4ad91";
  const top = normalizeHex(object.color, normalizeHex(object.material, fallback));
  return {
    top,
    side: shadeHex(top, -22),
    edge: shadeHex(top, -58),
  };
}

function openingVisualPolygons(
  opening: OpeningMarker,
  levelBase: number,
  rotation: number,
  lotWidth: number,
  lotDepth: number,
  zoom: number,
) {
  const params = normalizeOpeningParameters(opening.type, opening);
  const width = params.width;
  const z1 = levelBase + params.sillHeight;
  const z2 = z1 + params.height;
  const frameInset = Math.min(0.08, width * 0.08, params.height * 0.08);
  const alongStart = (opening.orientation === "horizontal" ? opening.x : opening.y) - width / 2;
  const alongEnd = alongStart + width;

  const plane = (start: number, end: number, bottom: number, top: number) => {
    const world = opening.orientation === "horizontal"
      ? [
          { x: start, y: opening.y, z: bottom },
          { x: end, y: opening.y, z: bottom },
          { x: end, y: opening.y, z: top },
          { x: start, y: opening.y, z: top },
        ]
      : [
          { x: opening.x, y: start, z: bottom },
          { x: opening.x, y: end, z: bottom },
          { x: opening.x, y: end, z: top },
          { x: opening.x, y: start, z: top },
        ];
    return world.map((point) => project(point, rotation, lotWidth, lotDepth, zoom));
  };

  const innerStart = alongStart + frameInset;
  const innerEnd = alongEnd - frameInset;
  const innerBottom = z1 + frameInset;
  const innerTop = z2 - frameInset;
  const frameColor = normalizeHex(
    params.frameColor,
    params.frameMaterial === "wood" ? "#8a6540" :
      params.frameMaterial === "pvc" ? "#e8e5df" :
        params.frameMaterial === "steel" ? "#3c4145" :
          "#303438",
  );
  const glass = params.glassType && params.glassType !== "none";
  const innerColor = glass
    ? params.glassType === "frosted" ? "#d9eef3" : params.glassType === "insulated" ? "#a8d5e2" : "#83c3d5"
    : opening.type === "door" ? shadeHex(frameColor, 18) : "#b7d5dd";

  const dividers = Array.from({ length: Math.max(0, params.leafCount - 1) }, (_, index) => {
    const ratio = (index + 1) / params.leafCount;
    const along = innerStart + (innerEnd - innerStart) * ratio;
    const world = opening.orientation === "horizontal"
      ? [
          { x: along, y: opening.y, z: innerBottom },
          { x: along, y: opening.y, z: innerTop },
        ]
      : [
          { x: opening.x, y: along, z: innerBottom },
          { x: opening.x, y: along, z: innerTop },
        ];
    return world.map((point) => project(point, rotation, lotWidth, lotDepth, zoom));
  });

  return {
    frame: plane(alongStart, alongEnd, z1, z2),
    inner: innerEnd > innerStart && innerTop > innerBottom
      ? plane(innerStart, innerEnd, innerBottom, innerTop)
      : plane(alongStart, alongEnd, z1, z2),
    frameColor,
    innerColor,
    innerOpacity: glass ? (params.glassType === "frosted" ? 0.88 : 0.58) : 0.96,
    glass,
    dividers,
  };
}

function splitWallForOpenings(
  wall: { id: string; x1: number; y1: number; x2: number; y2: number; thickness?: number; exterior?: boolean },
  openings: OpeningMarker[],
  wallHeight = WALL_HEIGHT,
) {
  const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
  const wallStart = vertical ? Math.min(wall.y1, wall.y2) : Math.min(wall.x1, wall.x2);
  const wallEnd = vertical ? Math.max(wall.y1, wall.y2) : Math.max(wall.x1, wall.x2);
  const wallCoord = vertical ? wall.x1 : wall.y1;

  const matches = openings
    .filter((opening) => {
      if (opening.wallId && opening.wallId !== wall.id) return false;
      if (vertical && opening.orientation !== "vertical") return false;
      if (!vertical && opening.orientation !== "horizontal") return false;
      const coord = vertical ? opening.x : opening.y;
      const along = vertical ? opening.y : opening.x;
      return Math.abs(coord - wallCoord) <= 0.08 && along >= wallStart - 0.05 && along <= wallEnd + 0.05;
    })
    .map((opening) => {
      const along = vertical ? opening.y : opening.x;
      const { width } = normalizeOpeningParameters(opening.type, opening);
      return {
        ...opening,
        start: Math.max(wallStart, along - width / 2),
        end: Math.min(wallEnd, along + width / 2),
      };
    })
    .sort((a, b) => a.start - b.start);

  if (!matches.length) {
    return [{ wall, zMin: 0, zMax: wallHeight, kind: "solid" as const }];
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
    if (before) pieces.push({ wall: before, zMin: 0, zMax: wallHeight, kind: "solid" });

    const openingSegment = makeSegment(opening.start, opening.end);
    if (openingSegment) {
      const params = normalizeOpeningParameters(opening.type, opening);
      const openingHeight = params.height;
      const sillHeight = params.sillHeight;
      const headHeight = sillHeight + openingHeight;

      if (sillHeight > 0.04) {
        pieces.push({ wall: openingSegment, zMin: 0, zMax: sillHeight, kind: "sill" });
      }
      if (headHeight < wallHeight - 0.04) {
        pieces.push({ wall: openingSegment, zMin: headHeight, zMax: wallHeight, kind: "lintel" });
      }
    }
    cursor = Math.max(cursor, opening.end);
  }

  const after = makeSegment(cursor, wallEnd);
  if (after) pieces.push({ wall: after, zMin: 0, zMax: wallHeight, kind: "solid" });
  return pieces;
}

type Rect = { x: number; y: number; width: number; depth: number };

function subtractOpeningFromRect(rect: Rect, opening: Rect): Rect[] {
  const ax1 = rect.x;
  const ay1 = rect.y;
  const ax2 = rect.x + rect.width;
  const ay2 = rect.y + rect.depth;
  const bx1 = Math.max(ax1, opening.x);
  const by1 = Math.max(ay1, opening.y);
  const bx2 = Math.min(ax2, opening.x + opening.width);
  const by2 = Math.min(ay2, opening.y + opening.depth);
  if (bx2 <= bx1 || by2 <= by1) return [rect];

  const pieces: Rect[] = [];
  if (by1 > ay1) pieces.push({ x: ax1, y: ay1, width: rect.width, depth: by1 - ay1 });
  if (by2 < ay2) pieces.push({ x: ax1, y: by2, width: rect.width, depth: ay2 - by2 });
  if (bx1 > ax1) pieces.push({ x: ax1, y: by1, width: bx1 - ax1, depth: by2 - by1 });
  if (bx2 < ax2) pieces.push({ x: bx2, y: by1, width: ax2 - bx2, depth: by2 - by1 });
  return pieces.filter((piece) => piece.width > 0.01 && piece.depth > 0.01);
}

function subtractSlabOpenings(rect: Rect, openings: StairSlabOpening[]) {
  return openings.reduce<Rect[]>((pieces, opening) => pieces.flatMap((piece) => subtractOpeningFromRect(piece, opening)), [rect]);
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
  materials,
}: Props) {
  const materialScheme = normalizeConceptMaterialScheme(materials);
  const [rotation, setRotation] = useState(35);
  const [zoom, setZoom] = useState(1);
  const [showAllFloors, setShowAllFloors] = useState(true);
  const [orbitGesture, setOrbitGesture] = useState<null | {
    pointerId: number;
    startX: number;
    startRotation: number;
  }>(null);
  const touchPointersRef = useRef(new Map<number, { clientX: number; clientY: number }>());
  const pinchZoomRef = useRef<null | { startDistance: number; startZoom: number }>(null);

  const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;
  const resetCamera = () => {
    setRotation(35);
    setZoom(1);
  };

  const handleOrbitStart = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setOrbitGesture({
      pointerId: event.pointerId,
      startX: event.clientX,
      startRotation: rotation,
    });
  };

  const handleOrbitMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!orbitGesture || orbitGesture.pointerId !== event.pointerId) return;
    const delta = event.clientX - orbitGesture.startX;
    setRotation(normalizeRotation(orbitGesture.startRotation + delta * 0.45));
  };

  const handleOrbitEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (orbitGesture?.pointerId === event.pointerId) setOrbitGesture(null);
  };

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setZoom((value) => {
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      return Math.max(0.55, Math.min(1.75, Number((value + delta).toFixed(2))));
    });
  };

  const handleTouchPointerDownCapture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const points = [...touchPointersRef.current.values()];
    if (points.length < 2) return;
    const [first, second] = points;
    event.preventDefault();
    event.stopPropagation();
    pinchZoomRef.current = {
      startDistance: Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)),
      startZoom: zoom,
    };
    setOrbitGesture(null);
  };

  const handleTouchPointerMoveCapture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "touch" || !touchPointersRef.current.has(event.pointerId)) return;
    touchPointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const pinch = pinchZoomRef.current;
    const points = [...touchPointersRef.current.values()];
    if (!pinch || points.length < 2) return;

    event.preventDefault();
    event.stopPropagation();
    const [first, second] = points;
    const distance = Math.max(1, Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY));
    const next = pinch.startZoom * (distance / pinch.startDistance);
    setZoom(Math.max(0.55, Math.min(1.75, Number(next.toFixed(3)))));
  };

  const handleTouchPointerEndCapture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "touch") return;
    const wasPinching = Boolean(pinchZoomRef.current);
    touchPointersRef.current.delete(event.pointerId);
    if (touchPointersRef.current.size < 2) pinchZoomRef.current = null;
    if (wasPinching) {
      event.preventDefault();
      event.stopPropagation();
      setOrbitGesture(null);
    }
  };

  const visibleLevels = useMemo(
    () => showAllFloors ? levels : levels.filter((level) => level.floor === activeFloor),
    [levels, showAllFloors, activeFloor],
  );

  const lotCorners = useMemo(
    () => quad(0, 0, lotWidth, lotDepth, -FLOOR_THICKNESS, rotation, lotWidth, lotDepth, zoom),
    [rotation, lotWidth, lotDepth, zoom],
  );

  const topLevel = levels.reduce<ConceptModelLevel | undefined>(
    (highest, level) => !highest || level.floor > highest.floor ? level : highest,
    undefined,
  );
  const topBounds = roofBounds(topLevel);
  const topWallHeight = topLevel
    ? Math.max(WALL_HEIGHT, topLevel.floorToFloorHeight - FLOOR_THICKNESS)
    : WALL_HEIGHT;
  const topZ = (topLevel?.elevation ?? 0) + topWallHeight + FLOOR_THICKNESS;
  const roofParams = normalizeRoofParameters(roof);
  const roofFaces = topBounds ? buildRoofFaces(topBounds, topZ, roof) : [];
  const roofTopZ = topBounds ? roofPeakZ(topBounds, topZ, roof) : topZ;

  const maxElevation = Math.max(
    roofTopZ,
    WALL_HEIGHT + FLOOR_THICKNESS,
    ...levels.map((level) =>
      level.elevation + Math.max(WALL_HEIGHT, level.floorToFloorHeight - FLOOR_THICKNESS) + FLOOR_THICKNESS
    ),
  );
  const sceneWidth = Math.max(lotWidth, lotDepth) * 2.9 * zoom + 22;
  const sceneHeight = Math.max(lotWidth, lotDepth) * 1.9 * zoom + maxElevation * 2.1 + 22;

  const wallCount = visibleLevels.reduce(
    (sum, level) => sum + level.walls.length + level.customWalls.length,
    0,
  );
  const openingCount = visibleLevels.reduce((sum, level) => sum + level.openings.length, 0);
  const spaceCount = visibleLevels.reduce((sum, level) => sum + level.closedSpaces.length, 0);
  const objectCount = visibleLevels.reduce((sum, level) => sum + level.objects.length, 0);

  return (
    <div className="overflow-hidden rounded-2xl border bg-slate-950 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Layers3 className="h-4 w-4" /> Modelo 3D sincronizado
          </div>
          <div className="text-xs text-white/60">Arraste horizontalmente para orbitar · roda do mouse para zoom · mesma geometria do 2D.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {levels.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAllFloors((value) => !value)}
              className={showAllFloors
                ? "rounded-lg border border-orange-400/40 bg-orange-500/20 px-3 py-2 text-xs font-semibold text-orange-100"
                : "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75"}
            >
              {showAllFloors ? "Todos pavimentos" : "Pavimento ativo"}
            </button>
          )}
          <button type="button" onClick={() => setRotation((value) => normalizeRotation(value - 15))} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5" title="Girar para esquerda">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setRotation((value) => normalizeRotation(value + 15))} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5" title="Girar para direita">
            <RotateCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))))} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5" title="Reduzir">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(2))))} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5" title="Ampliar">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={resetCamera} className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5" title="Restaurar câmera">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <svg
        viewBox={`${-sceneWidth / 2} ${-sceneHeight / 2} ${sceneWidth} ${sceneHeight}`}
        onPointerDownCapture={handleTouchPointerDownCapture}
        onPointerMoveCapture={handleTouchPointerMoveCapture}
        onPointerUpCapture={handleTouchPointerEndCapture}
        onPointerCancelCapture={handleTouchPointerEndCapture}
        onPointerDown={handleOrbitStart}
        onPointerMove={handleOrbitMove}
        onPointerUp={handleOrbitEnd}
        onPointerCancel={handleOrbitEnd}
        onWheel={handleWheel}
        className={`block min-h-[500px] w-full touch-none select-none bg-[radial-gradient(circle_at_50%_25%,#1e293b_0%,#0f172a_48%,#020617_100%)] ${orbitGesture ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Modelo tridimensional conceitual da planta"
      >
        <defs>
          <linearGradient id="concept3d-floor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="concept3d-wall" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <linearGradient id="concept3d-wall-side" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="concept3d-roof" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c5a47" />
            <stop offset="100%" stopColor="#4e382e" />
          </linearGradient>
          {uniqueSchemeMaterials(materialScheme).map((material) => (
            <MaterialPatternDef key={material.id} material={material} />
          ))}
          <filter id="concept3d-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#000000" floodOpacity="0.28" />
          </filter>
        </defs>

        <polygon points={points(lotCorners)} fill="url(#concept3d-floor)" stroke="#475569" strokeWidth="0.08" />

        {visibleLevels.map((level) => {
          const levelBase = level.elevation;
          const wallHeight = Math.max(WALL_HEIGHT, level.floorToFloorHeight - FLOOR_THICKNESS);
          const floorMaterial = conceptFloorMaterial(materialScheme, level.floor);
          const allWalls = [
            ...level.walls.map((wall) => ({
              id: wall.id,
              x1: wall.x1,
              y1: wall.y1,
              x2: wall.x2,
              y2: wall.y2,
              thickness: wall.exterior ? 0.18 : 0.12,
              exterior: wall.exterior,
            })),
            ...level.customWalls.map((wall) => ({ ...wall, exterior: false })),
          ];

          return (
            <g key={`level-${level.floor}`} opacity={!showAllFloors && level.floor !== activeFloor ? 0.2 : 1}>
              {level.closedSpaces.map((space) => (
                <g key={`${level.floor}-${space.id}`}>
                  {space.cells.flatMap((cell, index) => {
                    const surfacePieces = level.floor > 0
                      ? subtractSlabOpenings(
                          { x: cell.x, y: cell.y, width: cell.width, depth: cell.height },
                          level.slabOpenings,
                        )
                      : [{ x: cell.x, y: cell.y, width: cell.width, depth: cell.height }];
                    return surfacePieces.map((piece, pieceIndex) => (
                      <polygon
                        key={`${space.id}-slab-${index}-${pieceIndex}`}
                        points={points(quad(
                          piece.x,
                          piece.y,
                          piece.x + piece.width,
                          piece.y + piece.depth,
                          levelBase,
                          rotation,
                          lotWidth,
                          lotDepth,
                          zoom,
                        ))}
                        fill={materialFill(floorMaterial)}
                        fillOpacity={level.floor === activeFloor ? "0.9" : "0.68"}
                        stroke={floorMaterial.edgeColor ?? shadeHex(floorMaterial.color, -42)}
                        strokeOpacity="0.35"
                        strokeWidth="0.04"
                      />
                    ));
                  })}
                  {(() => {
                    const labelPoint = project(
                      { x: space.centroid.x, y: space.centroid.y, z: levelBase + 0.18 },
                      rotation,
                      lotWidth,
                      lotDepth,
                      zoom,
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
                  splitWallForOpenings(wall, level.openings, wallHeight).map((piece, index) => {
                    const shape = wallPolygon(
                      piece.wall,
                      rotation,
                      lotWidth,
                      lotDepth,
                      zoom,
                      levelBase + piece.zMin,
                      levelBase + piece.zMax,
                    );
                    const material = wall.exterior ? materialScheme.exteriorWall : materialScheme.interiorWall;
                    const edge = material.edgeColor ?? shadeHex(material.color, -46);
                    return (
                      <g key={`${level.floor}-${wall.id}-${piece.kind}-${index}`}>
                        <polygon points={points(shape.sideA)} fill={materialFill(material)} stroke={edge} strokeWidth="0.055" />
                        <polygon points={points(shape.sideB)} fill={shadeHex(material.color, -24)} stroke={edge} strokeWidth="0.055" />
                        <polygon points={points(shape.top)} fill={materialFill(material)} stroke={edge} strokeWidth="0.055" />
                      </g>
                    );
                  })
                )}
              </g>

              <g filter="url(#concept3d-shadow)">
                {level.openings.map((opening) => {
                  const visual = openingVisualPolygons(opening, levelBase, rotation, lotWidth, lotDepth, zoom);
                  return (
                    <g key={`${level.floor}-opening-visual-${opening.id}`}>
                      <polygon
                        points={points(visual.frame)}
                        fill={visual.frameColor}
                        stroke={shadeHex(visual.frameColor, -55)}
                        strokeWidth="0.055"
                      />
                      <polygon
                        points={points(visual.inner)}
                        fill={visual.innerColor}
                        fillOpacity={visual.innerOpacity}
                        stroke={visual.frameColor}
                        strokeWidth="0.04"
                      />
                      {visual.dividers.map((divider, index) => (
                        <line
                          key={`${opening.id}-leaf-${index}`}
                          x1={divider[0]?.x}
                          y1={divider[0]?.y}
                          x2={divider[1]?.x}
                          y2={divider[1]?.y}
                          stroke={visual.frameColor}
                          strokeWidth="0.055"
                          strokeOpacity="0.9"
                        />
                      ))}
                    </g>
                  );
                })}
              </g>

              {level.floor > 0 && level.closedSpaces.flatMap((space) =>
                space.cells.flatMap((cell, index) =>
                  subtractSlabOpenings(
                    { x: cell.x, y: cell.y, width: cell.width, depth: cell.height },
                    level.slabOpenings,
                  ).map((piece, pieceIndex) => (
                    <polygon
                      key={`${space.id}-floor-slab-${index}-${pieceIndex}`}
                      points={points(quad(
                        piece.x,
                        piece.y,
                        piece.x + piece.width,
                        piece.y + piece.depth,
                        levelBase - FLOOR_THICKNESS,
                        rotation,
                        lotWidth,
                        lotDepth,
                        zoom,
                      ))}
                      fill={shadeHex(floorMaterial.color, -32)}
                      fillOpacity="0.88"
                      stroke={floorMaterial.edgeColor ?? shadeHex(floorMaterial.color, -48)}
                      strokeWidth="0.05"
                    />
                  ))
                )
              )}

              {level.stairs.flatMap((stair) => {
                const landings = buildStairLandings(stair).map((landing) => (
                  <polygon
                    key={landing.id}
                    points={points(quad(
                      landing.x,
                      landing.y,
                      landing.x + landing.width,
                      landing.y + landing.depth,
                      levelBase + landing.rise,
                      rotation,
                      lotWidth,
                      lotDepth,
                      zoom,
                    ))}
                    fill={materialFill(materialScheme.stair)}
                    stroke={materialScheme.stair.edgeColor ?? shadeHex(materialScheme.stair.color, -48)}
                    strokeWidth="0.045"
                  />
                ));
                const treads = buildStairTreads(stair).map((tread, index) => (
                  <polygon
                    key={tread.id}
                    points={points(quad(
                      tread.x,
                      tread.y,
                      tread.x + tread.width,
                      tread.y + tread.depth,
                      levelBase + tread.rise,
                      rotation,
                      lotWidth,
                      lotDepth,
                      zoom,
                    ))}
                    fill={index % 2 === 0 ? materialFill(materialScheme.stair) : shadeHex(materialScheme.stair.color, 10)}
                    stroke={materialScheme.stair.edgeColor ?? shadeHex(materialScheme.stair.color, -48)}
                    strokeWidth="0.04"
                  />
                ));
                return [...landings, ...treads];
              })}
              {level.objects.flatMap((object) => {
                const palette = objectPalette(object);
                return objectVisualParts(object).flatMap((part) => {
                  const volume = objectPartVolumePolygons(object, part, levelBase, rotation, lotWidth, lotDepth, zoom);
                  const topColor = shadeHex(palette.top, part.shade ?? 0);
                  const sideColor = shadeHex(palette.side, Math.round((part.shade ?? 0) * 0.6));
                  const sidePolygons = volume.sides.map((side, index) => (
                    <polygon
                      key={`${object.id}-${part.id}-side-${index}`}
                      points={points(side)}
                      fill={sideColor}
                      fillOpacity="0.97"
                      stroke={palette.edge}
                      strokeWidth="0.035"
                    />
                  ));
                  const topPolygon = (
                    <polygon
                      key={`${object.id}-${part.id}-top`}
                      points={points(volume.top)}
                      fill={topColor}
                      stroke={palette.edge}
                      strokeWidth="0.04"
                    />
                  );
                  return [...sidePolygons, topPolygon];
                });
              })}
            </g>
          );
        })}

        {showAllFloors && roofFaces.map((face, index) => (
          <polygon
            key={face.id}
            points={points(face.points.map((point) =>
              project(point, rotation, lotWidth, lotDepth, zoom)
            ))}
            fill={face.role === "roof"
              ? materialFill(materialScheme.roof)
              : face.role === "parapet"
                ? materialFill(materialScheme.exteriorWall)
                : materialFill(conceptFloorMaterial(materialScheme, topLevel?.floor ?? 0))}
            fillOpacity={face.role === "slab" ? "0.94" : "1"}
            stroke={face.role === "roof"
              ? materialScheme.roof.edgeColor ?? shadeHex(materialScheme.roof.color, -50)
              : materialScheme.exteriorWall.edgeColor ?? shadeHex(materialScheme.exteriorWall.color, -48)}
            strokeWidth="0.08"
          />
        ))}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-white/60">
        <span>{visibleLevels.length} pavimento{visibleLevels.length !== 1 ? "s" : ""} · {wallCount} paredes · {openingCount} vãos · {spaceCount} espaços · {objectCount} objetos</span>
        <span>
          Vista {Math.round(rotation)}° · piso {conceptFloorMaterial(materialScheme, activeFloor).name} · cobertura {materialScheme.roof.name} · {roofParams.roof === "platibanda" ? "platibanda" : `${roofParams.roofWaters} água${roofParams.roofWaters > 1 ? "s" : ""} · ${roofParams.roofPitchDeg.toFixed(0)}°`}
        </span>
      </div>
    </div>
  );
}
