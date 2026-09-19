import { useMemo, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Layers3, Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { OpeningMarker, WallSegment } from "./conceptGeometry";
import type { ClosedSpace } from "./conceptWallNetwork";

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
      const width = opening.type === "door" ? 0.95 : 1.35;
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
      if (opening.type === "door") {
        pieces.push({ wall: openingSegment, zMin: 2.1, zMax: WALL_HEIGHT, kind: "lintel" });
      } else {
        pieces.push({ wall: openingSegment, zMin: 0, zMax: 0.9, kind: "sill" });
        pieces.push({ wall: openingSegment, zMin: 2.1, zMax: WALL_HEIGHT, kind: "lintel" });
      }
    }
    cursor = Math.max(cursor, opening.end);
  }

  const after = makeSegment(cursor, wallEnd);
  if (after) pieces.push({ wall: after, zMin: 0, zMax: WALL_HEIGHT, kind: "solid" });
  return pieces;
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
}: Props) {
  const [rotation, setRotation] = useState(35);
  const [zoom, setZoom] = useState(1);
  const [showAllFloors, setShowAllFloors] = useState(true);
  const [orbitGesture, setOrbitGesture] = useState<null | {
    pointerId: number;
    startX: number;
    startRotation: number;
  }>(null);

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
  const topZ = ((topLevel?.floor ?? 0) * LEVEL_HEIGHT) + WALL_HEIGHT + FLOOR_THICKNESS;

  const maxLevel = Math.max(0, ...levels.map((level) => level.floor));
  const sceneWidth = Math.max(lotWidth, lotDepth) * 2.9 * zoom + 22;
  const sceneHeight = Math.max(lotWidth, lotDepth) * 1.9 * zoom + (maxLevel + 1) * LEVEL_HEIGHT * 2.1 + 22;

  const wallCount = visibleLevels.reduce(
    (sum, level) => sum + level.walls.length + level.customWalls.length,
    0,
  );
  const openingCount = visibleLevels.reduce((sum, level) => sum + level.openings.length, 0);
  const spaceCount = visibleLevels.reduce((sum, level) => sum + level.closedSpaces.length, 0);

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
          <filter id="concept3d-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#000000" floodOpacity="0.28" />
          </filter>
        </defs>

        <polygon points={points(lotCorners)} fill="url(#concept3d-floor)" stroke="#475569" strokeWidth="0.08" />

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
            })),
            ...level.customWalls.map((wall) => ({ ...wall, exterior: false })),
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
                        rotation,
                        lotWidth,
                        lotDepth,
                        zoom,
                      ))}
                      fill={level.floor === activeFloor ? "#e2e8f0" : "#cbd5e1"}
                      fillOpacity={level.floor === activeFloor ? "0.42" : "0.28"}
                      stroke="#94a3b8"
                      strokeOpacity="0.35"
                      strokeWidth="0.04"
                    />
                  ))}
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
                  splitWallForOpenings(wall, level.openings).map((piece, index) => {
                    const shape = wallPolygon(
                      piece.wall,
                      rotation,
                      lotWidth,
                      lotDepth,
                      zoom,
                      levelBase + piece.zMin,
                      levelBase + piece.zMax,
                    );
                    return (
                      <g key={`${level.floor}-${wall.id}-${piece.kind}-${index}`}>
                        <polygon points={points(shape.sideA)} fill={wall.exterior ? "#dbe1e8" : "#aab5c3"} stroke="#475569" strokeWidth="0.055" />
                        <polygon points={points(shape.sideB)} fill="url(#concept3d-wall-side)" stroke="#475569" strokeWidth="0.055" />
                        <polygon points={points(shape.top)} fill="url(#concept3d-wall)" stroke="#64748b" strokeWidth="0.055" />
                      </g>
                    );
                  })
                )}
              </g>

              {level.floor > 0 && level.closedSpaces.flatMap((space) =>
                space.cells.map((cell, index) => (
                  <polygon
                    key={`${space.id}-floor-slab-${index}`}
                    points={points(quad(
                      cell.x,
                      cell.y,
                      cell.x + cell.width,
                      cell.y + cell.height,
                      levelBase - FLOOR_THICKNESS,
                      rotation,
                      lotWidth,
                      lotDepth,
                      zoom,
                    ))}
                    fill="#64748b"
                    fillOpacity="0.7"
                    stroke="#475569"
                    strokeWidth="0.05"
                  />
                ))
              )}

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
                      points={points(quad(x1, y1, x2, y2, z, rotation, lotWidth, lotDepth, zoom))}
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

        {showAllFloors && topBounds && roof === "platibanda" && (
          <polygon
            points={points(quad(
              topBounds.minX,
              topBounds.minY,
              topBounds.maxX,
              topBounds.maxY,
              topZ,
              rotation,
              lotWidth,
              lotDepth,
              zoom,
            ))}
            fill="#d5d9dc"
            fillOpacity="0.94"
            stroke="#737b82"
            strokeWidth="0.08"
          />
        )}

        {showAllFloors && topBounds && (roof === "aparente" || roof === "misto") && (() => {
          const midY = (topBounds.minY + topBounds.maxY) / 2;
          const ridgeZ = topZ + Math.min(2.2, (topBounds.maxY - topBounds.minY) * 0.22);
          const leftPlane = [
            project({ x: topBounds.minX, y: topBounds.minY, z: topZ }, rotation, lotWidth, lotDepth, zoom),
            project({ x: topBounds.maxX, y: topBounds.minY, z: topZ }, rotation, lotWidth, lotDepth, zoom),
            project({ x: topBounds.maxX, y: midY, z: ridgeZ }, rotation, lotWidth, lotDepth, zoom),
            project({ x: topBounds.minX, y: midY, z: ridgeZ }, rotation, lotWidth, lotDepth, zoom),
          ];
          const rightPlane = [
            project({ x: topBounds.minX, y: midY, z: ridgeZ }, rotation, lotWidth, lotDepth, zoom),
            project({ x: topBounds.maxX, y: midY, z: ridgeZ }, rotation, lotWidth, lotDepth, zoom),
            project({ x: topBounds.maxX, y: topBounds.maxY, z: topZ }, rotation, lotWidth, lotDepth, zoom),
            project({ x: topBounds.minX, y: topBounds.maxY, z: topZ }, rotation, lotWidth, lotDepth, zoom),
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
