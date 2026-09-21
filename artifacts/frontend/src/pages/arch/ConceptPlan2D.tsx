import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Maximize2, Move, ZoomIn, ZoomOut } from "lucide-react";
import type { ConceptGeometry, ConceptRoomShape, OpeningMarker } from "./conceptGeometry";
import { orthogonalEnd, snapPointToWallNetwork, wallLength, wallMidpoint, type ClosedSpace, type WallTopologyEndpointRef, type WallTopologyNode } from "./conceptWallNetwork";

export type ConceptPlanObject = {
  id: string;
  kind: "sofa" | "bed" | "table" | "chair" | "cabinet" | "tv";
  label: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
};

type Props = {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
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
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  onWallMove?: (wallId: string, delta: number) => void;
  customWalls?: Array<{ id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number }>;
  selectedCustomWallId?: string | null;
  onCreateCustomWall?: (wall: { id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number }) => void;
  onSelectCustomWall?: (wallId: string | null) => void;
  onDeleteCustomWall?: (wallId: string) => void;
  onUpdateCustomWall?: (wallId: string, patch: Partial<{ x1: number; y1: number; x2: number; y2: number; thickness: number }>) => void;
  topologyNodes?: WallTopologyNode[];
  showDimensions?: boolean;
  onMoveTopologyJunction?: (refs: WallTopologyEndpointRef[], point: { x: number; y: number }) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  interactionMode?: "room" | "space" | "wall" | "opening" | "draw-wall" | "navigate";
  objects?: ConceptPlanObject[];
  selectedObjectId?: string | null;
  onSelectObject?: (objectId: string | null) => void;
  onObjectChange?: (objectId: string, patch: Partial<Pick<ConceptPlanObject, "x" | "y" | "width" | "depth" | "rotation">>) => void;
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
  selectedWallId = null,
  onSelectWall,
  onWallMove,
  customWalls = [],
  selectedCustomWallId = null,
  onCreateCustomWall,
  onSelectCustomWall,
  onDeleteCustomWall,
  onUpdateCustomWall,
  topologyNodes = [],
  showDimensions = true,
  onMoveTopologyJunction,
  onEditStart,
  onEditEnd,
  interactionMode = "room",
  objects = [],
  selectedObjectId = null,
  onSelectObject,
  onObjectChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [wallDrawStart, setWallDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [wallDrawPreview, setWallDrawPreview] = useState<{ x: number; y: number } | null>(null);
  const [gesture, setGesture] = useState<null | {
    roomId: string;
    openingId?: string;
    wallId?: string;
    customWallId?: string;
    objectId?: string;
    junctionRefs?: WallTopologyEndpointRef[];
    mode: "move" | "object" | "wall" | "opening" | "custom-wall-start" | "custom-wall-end" | "custom-wall-move" | "topology-junction" | "resize-n" | "resize-s" | "resize-e" | "resize-w" | "resize-ne" | "resize-nw" | "resize-se" | "resize-sw";
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
  }>(null);

  useEffect(() => {
    if (interactionMode !== "draw-wall") {
      setWallDrawStart(null);
      setWallDrawPreview(null);
    }
  }, [interactionMode]);

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
  }, [rooms, geometry.walls, customWalls, closedSpaces, objects, lotWidth, lotDepth]);

  const fitView = useMemo(() => {
    const margin = projectBounds.hasProject ? 1.35 : 2.4;
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
    if (!projectBounds.hasProject) return fitView;
    const rawWidth = Math.max(1, projectBounds.maxX - projectBounds.minX);
    const rawHeight = Math.max(1, projectBounds.maxY - projectBounds.minY);
    const tallRatio = rawHeight / rawWidth;
    const scale = tallRatio > 2.2 ? 0.58 : tallRatio > 1.55 ? 0.7 : 0.88;
    const width = fitView.width * scale;
    const height = fitView.height * scale;
    const centerX = (projectBounds.minX + projectBounds.maxX) / 2;
    const centerY = (projectBounds.minY + projectBounds.maxY) / 2;
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  }, [fitView, projectBounds]);

  const [view, setView] = useState(workingView);
  const [panGesture, setPanGesture] = useState<null | {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startViewX: number;
    startViewY: number;
  }>(null);

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

  const resetView = () => setView(workingView);

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

  const snap = (value: number) => Math.round(value * 4) / 4;

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

  const clampPoint = (point: { x: number; y: number }) => ({
    x: snap(Math.max(0, Math.min(lotWidth, point.x))),
    y: snap(Math.max(0, Math.min(lotDepth, point.y))),
  });

  const handleDrawWallPoint = (point: { x: number; y: number }) => {
    const clamped = clampPoint(point);
    const snappedToNetwork = snapPointToWallNetwork(clamped, wallNetwork, 0.35);
    const snapped = clampPoint(snappedToNetwork);
    if (!wallDrawStart) {
      setWallDrawStart(snapped);
      setWallDrawPreview(snapped);
      return;
    }

    const rawEnd = orthogonalEnd(wallDrawStart, snapped);
    const networkEnd = snapPointToWallNetwork(rawEnd, wallNetwork, 0.35);
    const end = clampPoint(orthogonalEnd(wallDrawStart, networkEnd));

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
      setWallDrawStart(end);
      setWallDrawPreview(end);
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
    if (panGesture && interactionMode === "navigate") {
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
      const snapped = snapPointToWallNetwork(clamped, wallNetwork, 0.35);
      const orthogonal = orthogonalEnd(wallDrawStart, snapped);
      const networkEnd = snapPointToWallNetwork(orthogonal, wallNetwork, 0.35);
      setWallDrawPreview(clampPoint(orthogonalEnd(wallDrawStart, networkEnd)));
    }
    if (!gesture) return;
    const dx = point.x - gesture.startX;
    const dy = point.y - gesture.startY;

    if (gesture.mode === "object" && gesture.objectId && onObjectChange) {
      const object = objects.find((item) => item.id === gesture.objectId);
      if (!object) return;
      const baseX = gesture.objectX ?? object.x;
      const baseY = gesture.objectY ?? object.y;
      onObjectChange(object.id, {
        x: snap(Math.max(0, Math.min(lotWidth - object.width, baseX + dx))),
        y: snap(Math.max(0, Math.min(lotDepth - object.depth, baseY + dy))),
      });
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
      const horizontal = Math.abs(originalY1 - originalY2) < 0.01;

      if (horizontal) {
        const nextY = snap(Math.max(0, Math.min(lotDepth, originalY1 + dy)));
        onUpdateCustomWall(wall.id, { y1: nextY, y2: nextY });
      } else {
        const nextX = snap(Math.max(0, Math.min(lotWidth, originalX1 + dx)));
        onUpdateCustomWall(wall.id, { x1: nextX, x2: nextX });
      }
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
      const horizontal = Math.abs(originalY1 - originalY2) < 0.01;
      const clamped = clampPoint(point);
      const snapped = snapPointToWallNetwork(clamped, wallNetwork, 0.35, wall.id);

      if (gesture.mode === "custom-wall-start") {
        const next = horizontal
          ? { x1: snapped.x, y1: originalY1 }
          : { x1: originalX1, y1: snapped.y };
        if (Math.hypot(originalX2 - next.x1, originalY2 - next.y1) >= 0.5) {
          onUpdateCustomWall(wall.id, next);
        }
      } else {
        const next = horizontal
          ? { x2: snapped.x, y2: originalY2 }
          : { x2: originalX2, y2: snapped.y };
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

    if (gesture.mode === "opening" && gesture.openingId && onOpeningChange) {
      const opening = geometry.openings.find((item) => item.id === gesture.openingId);
      if (!opening) return;
      const pad = 0.55;

      if (opening.roomId.startsWith("custom-wall:")) {
        const wallId = opening.roomId.slice("custom-wall:".length);
        const wall = customWalls.find((item) => item.id === wallId);
        if (!wall) return;
        const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
        if (horizontal) {
          const minX = Math.min(wall.x1, wall.x2) + Math.min(pad, Math.abs(wall.x2 - wall.x1) / 3);
          const maxX = Math.max(wall.x1, wall.x2) - Math.min(pad, Math.abs(wall.x2 - wall.x1) / 3);
          onOpeningChange(opening.id, {
            x: snap(Math.max(minX, Math.min(maxX, opening.x + dx))),
            y: wall.y1,
            type: opening.type,
          });
        } else {
          const minY = Math.min(wall.y1, wall.y2) + Math.min(pad, Math.abs(wall.y2 - wall.y1) / 3);
          const maxY = Math.max(wall.y1, wall.y2) - Math.min(pad, Math.abs(wall.y2 - wall.y1) / 3);
          onOpeningChange(opening.id, {
            x: wall.x1,
            y: snap(Math.max(minY, Math.min(maxY, opening.y + dy))),
            type: opening.type,
          });
        }
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
    <div className="relative h-[calc(100dvh-64px)] min-h-[420px] overflow-hidden bg-white sm:min-h-[620px]">
      <div className="absolute bottom-4 right-4 z-20 flex flex-col items-center gap-1 rounded-xl border bg-white/95 p-1 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={() => zoomView(0.82)}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
          title="Aproximar"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomView(1.22)}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
          title="Afastar"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetView}
          className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
          title="Enquadrar construção"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        {interactionMode === "navigate" && (
          <div className="ml-1 flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-white">
            <Move className="h-3.5 w-3.5" /> Arraste para navegar
          </div>
        )}
      </div>
      <svg
        ref={svgRef}
        className={`block h-full min-h-[420px] w-full touch-none select-none sm:min-h-[620px] ${interactionMode === "navigate" ? (panGesture ? "cursor-grabbing" : "cursor-grab") : ""}`}
        onWheel={handleWheel}
        onPointerDownCapture={(event) => {
          if (["room", "wall", "opening", "draw-wall", "navigate"].includes(interactionMode)) {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Alguns navegadores/WebViews podem não implementar pointer capture.
            }
          }
        }}
        onPointerDown={(event) => {
          if (interactionMode === "navigate") {
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
        }}
        onPointerCancel={(event) => {
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
        }}
        onDoubleClick={() => {
          if (interactionMode === "draw-wall") {
            setWallDrawStart(null);
            setWallDrawPreview(null);
          }
        }}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Planta conceitual arquitetônica"
      >
        <defs>
          <pattern id="concept-grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2e8f0" strokeWidth="0.018" />
          </pattern>
          <pattern id="pool-water" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
            <path d="M0 .25 Q.125 .12 .25 .25 T.5 .25" fill="none" stroke="#38bdf8" strokeWidth="0.025" opacity="0.55" />
          </pattern>
        </defs>

        <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="#fcfcfd" />
        <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="url(#concept-grid)" opacity="0.72" />

        <line x1="0" y1="-0.55" x2={lotWidth} y2="-0.55" stroke="#94a3b8" strokeWidth="0.035" />
        <line x1="0" y1="-0.82" x2="0" y2="-0.25" stroke="#94a3b8" strokeWidth="0.035" />
        <line x1={lotWidth} y1="-0.82" x2={lotWidth} y2="-0.25" stroke="#94a3b8" strokeWidth="0.035" />
        <text x={lotWidth / 2} y="-0.88" textAnchor="middle" fontSize="0.34" fontWeight="700" fill="#64748b">
          {formatMeters(lotWidth)} m
        </text>

        <line x1="-0.55" y1="0" x2="-0.55" y2={lotDepth} stroke="#94a3b8" strokeWidth="0.035" />
        <line x1="-0.82" y1="0" x2="-0.25" y2="0" stroke="#94a3b8" strokeWidth="0.035" />
        <line x1="-0.82" y1={lotDepth} x2="-0.25" y2={lotDepth} stroke="#94a3b8" strokeWidth="0.035" />
        <text
          x="-0.9"
          y={lotDepth / 2}
          textAnchor="middle"
          fontSize="0.34"
          fontWeight="700"
          fill="#64748b"
          transform={`rotate(-90 -0.9 ${lotDepth / 2})`}
        >
          {formatMeters(lotDepth)} m
        </text>

        <g>
          <line x1={lotWidth - 0.9} y1="-1.65" x2={lotWidth - 0.9} y2="-0.75" stroke="#0f172a" strokeWidth="0.07" />
          <path d={`M ${lotWidth - 0.9} -1.9 L ${lotWidth - 1.12} -1.45 L ${lotWidth - 0.68} -1.45 Z`} fill="#0f172a" />
          <text x={lotWidth - 0.9} y="-2.02" textAnchor="middle" fontSize="0.34" fontWeight="800" fill="#0f172a">N</text>
        </g>

        <g pointerEvents="none">
          <rect
            x={lotWidth / 2 - 1.65}
            y="-2.05"
            width="3.3"
            height="0.58"
            rx="0.18"
            fill="#fff7ed"
            stroke="#fb923c"
            strokeWidth="0.035"
          />
          <text x={lotWidth / 2} y="-1.66" textAnchor="middle" fontSize="0.28" fontWeight="850" fill="#c2410c" letterSpacing="0.06">
            FRENTE / ACESSO
          </text>
          <text x={lotWidth / 2} y={lotDepth + 1.35} textAnchor="middle" fontSize="0.28" fontWeight="750" fill="#94a3b8" letterSpacing="0.08">
            FUNDOS
          </text>
        </g>

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
                  fill={selectedSpace ? "#fed7aa" : index % 2 === 0 ? "#dbeafe" : "#dcfce7"}
                  opacity={selectedSpace ? "0.42" : "0.28"}
                  stroke={selectedSpace ? "#f97316" : "none"}
                  strokeWidth={selectedSpace ? "0.035" : "0"}
                />
              ))}
              <g pointerEvents="none">
                <rect
                  x={space.centroid.x - 1.25}
                  y={space.centroid.y - (label ? 0.52 : 0.36)}
                  width="2.5"
                  height={label ? "0.92" : "0.58"}
                  rx="0.14"
                  fill="#ffffff"
                  opacity="0.94"
                  stroke={selectedSpace ? "#f97316" : "#d1d5db"}
                  strokeWidth="0.035"
                />
                {label && (
                  <text
                    x={space.centroid.x}
                    y={space.centroid.y - 0.12}
                    textAnchor="middle"
                    fontSize="0.22"
                    fontWeight="800"
                    fill="#0f172a"
                  >
                    {label}
                  </text>
                )}
                <text
                  x={space.centroid.x}
                  y={space.centroid.y + (label ? 0.24 : 0.03)}
                  textAnchor="middle"
                  fontSize="0.22"
                  fontWeight="800"
                  fill={selectedSpace ? "#c2410c" : "#166534"}
                >
                  {space.area.toFixed(1)} m²
                </text>
              </g>
            </g>
          );
        })}

        {rooms.map((room) => {
          const selected = selectedId === room.id;
          const fill = ROOM_FILL[room.kind] ?? "#ffffff";
          const isPool = room.kind === "piscina";
          const area = room.width * room.depth;
          const labelLines = splitRoomLabel(room.label);
          const labelSize = room.kind === "escada" ? 0.25 : fitLabelSize(room.label, room.width, room.depth);
          return (
            <g
              key={room.id}
              role="button"
              pointerEvents={interactionMode === "space" ? "none" : undefined}
              tabIndex={0}
              onPointerDown={(event) => {
                if (interactionMode !== "room") return;
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
                if (interactionMode === "room") onSelect(room.id);
              }}
              onKeyDown={(event) => {
                if (interactionMode === "room" && (event.key === "Enter" || event.key === " ")) onSelect(room.id);
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
                      {room.width >= 2.1 && room.depth >= 1.8 && (
                        <text
                          x={room.x + room.width / 2}
                          y={room.y + room.depth / 2 + (labelLines.length > 1 ? 0.42 : 0.30)}
                          textAnchor="middle"
                          fontSize="0.21"
                          fontWeight="650"
                          fill="#64748b"
                        >
                          {area.toFixed(1)} m²
                        </text>
                      )}
                    </>
                  )}
                </>
              )}
              {interactionMode === "room" && selected && onRoomChange && !room.locked && (
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
                fill={selectedObject ? "#ffedd5" : "#f8fafc"}
                stroke={selectedObject ? "#f97316" : "#64748b"}
                strokeWidth={selectedObject ? "0.10" : "0.055"}
              />
              {object.kind === "sofa" && (
                <>
                  <rect x={object.x + 0.12} y={object.y + 0.12} width={Math.max(0.2, object.width - 0.24)} height={Math.max(0.2, object.depth * 0.36)} rx="0.10" fill="#cbd5e1" />
                  <line x1={object.x + object.width / 2} y1={object.y + object.depth * 0.48} x2={object.x + object.width / 2} y2={object.y + object.depth - 0.12} stroke="#94a3b8" strokeWidth="0.04" />
                </>
              )}
              {object.kind === "bed" && (
                <>
                  <rect x={object.x + 0.10} y={object.y + 0.10} width={Math.max(0.2, object.width - 0.20)} height={Math.max(0.2, object.depth - 0.20)} rx="0.08" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.035" />
                  <rect x={object.x + 0.18} y={object.y + 0.16} width={Math.max(0.15, object.width * 0.32)} height={Math.max(0.14, object.depth * 0.22)} rx="0.08" fill="#e2e8f0" />
                  <rect x={object.x + object.width - Math.max(0.15, object.width * 0.32) - 0.18} y={object.y + 0.16} width={Math.max(0.15, object.width * 0.32)} height={Math.max(0.14, object.depth * 0.22)} rx="0.08" fill="#e2e8f0" />
                </>
              )}
              {object.kind === "table" && (
                <ellipse cx={cx} cy={cy} rx={Math.max(0.2, object.width / 2 - 0.08)} ry={Math.max(0.2, object.depth / 2 - 0.08)} fill="#e7e5e4" stroke="#a8a29e" strokeWidth="0.04" />
              )}
              {object.kind === "chair" && (
                <>
                  <rect x={object.x + 0.10} y={object.y + 0.16} width={Math.max(0.18, object.width - 0.20)} height={Math.max(0.18, object.depth - 0.26)} rx="0.08" fill="#e2e8f0" />
                  <line x1={object.x + 0.10} y1={object.y + 0.12} x2={object.x + object.width - 0.10} y2={object.y + 0.12} stroke="#64748b" strokeWidth="0.07" />
                </>
              )}
              {object.kind === "cabinet" && (
                <>
                  <line x1={cx} y1={object.y + 0.08} x2={cx} y2={object.y + object.depth - 0.08} stroke="#94a3b8" strokeWidth="0.035" />
                  <circle cx={cx - 0.10} cy={cy} r="0.035" fill="#475569" />
                  <circle cx={cx + 0.10} cy={cy} r="0.035" fill="#475569" />
                </>
              )}
              {object.kind === "tv" && (
                <rect x={object.x + 0.10} y={object.y + 0.10} width={Math.max(0.16, object.width - 0.20)} height={Math.max(0.12, object.depth - 0.20)} rx="0.04" fill="#334155" />
              )}
              {selectedObject && (
                <text x={cx} y={object.y - 0.16} textAnchor="middle" fontSize="0.22" fontWeight="800" fill="#c2410c" pointerEvents="none">
                  {object.label}
                </text>
              )}
            </g>
          );
        })}

        {customWalls.map((wall) => {
          const selected = selectedCustomWallId === wall.id;
          return (
            <g
              key={wall.id}
              className={interactionMode === "wall" ? "cursor-pointer" : ""}
              onPointerDown={(event) => {
                if (interactionMode !== "wall" || !onSelectCustomWall) return;
                event.stopPropagation();
                onSelectCustomWall(wall.id);
              }}
              onClick={(event) => {
                if (interactionMode !== "wall" || !onSelectCustomWall) return;
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
                stroke={selected ? "#f97316" : "#111827"}
                strokeWidth={selected ? "0.21" : String(wall.thickness ?? 0.15)}
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
                        if (interactionMode !== "wall" || !onUpdateCustomWall) return;
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
                    return (
                      <g
                        className={horizontal ? "cursor-ns-resize" : "cursor-ew-resize"}
                        onPointerDown={(event) => {
                          if (interactionMode !== "wall" || !onUpdateCustomWall) return;
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
                    );
                  })()}
                </>
              )}
            </g>
          );
        })}

        {interactionMode === "wall" && topologyNodes
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
              className={interactionMode === "wall" ? (vertical ? "cursor-ew-resize" : "cursor-ns-resize") : ""}
              onPointerDown={(event) => {
                if (interactionMode !== "wall" || !onSelectWall || !onWallMove) return;
                event.stopPropagation();
                onEditStart?.();
                const point = toSvgPoint(event.clientX, event.clientY);
                onSelectWall(wall.id);
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
                if (interactionMode !== "wall" || !onSelectWall) return;
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
                stroke={selectedWall ? "#f97316" : wall.exterior ? "#111827" : "#334155"}
                strokeWidth={selectedWall ? "0.20" : wall.exterior ? "0.16" : "0.095"}
                strokeLinecap="square"
                pointerEvents="none"
              />
              {selectedWall && (
                <>
                  <circle cx={wall.x1} cy={wall.y1} r="0.18" fill="#f97316" stroke="#fff" strokeWidth="0.05" pointerEvents="none" />
                  <circle cx={wall.x2} cy={wall.y2} r="0.18" fill="#f97316" stroke="#fff" strokeWidth="0.05" pointerEvents="none" />
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
            {customWalls
              .filter((wall) => wallLength(wall) >= 0.5)
              .map((wall) => {
                const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
                const length = wallLength(wall);
                const selected = selectedCustomWallId === wall.id;
                const offset = selected ? 0.72 : 0.48;
                const offsetX = horizontal ? 0 : (wall.x1 <= lotWidth / 2 ? -offset : offset);
                const offsetY = horizontal ? (wall.y1 <= lotDepth / 2 ? -offset : offset) : 0;
                return (
                  <DimensionLine
                    key={`dimension-${wall.id}`}
                    x1={wall.x1}
                    y1={wall.y1}
                    x2={wall.x2}
                    y2={wall.y2}
                    offsetX={offsetX}
                    offsetY={offsetY}
                    label={`${length.toFixed(2).replace(".", ",")} m`}
                    tone={selected ? "#ea580c" : "#64748b"}
                  />
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
          return (
            <g
              key={opening.id}
              className={interactionMode === "opening" ? "cursor-grab" : ""}
              onPointerDown={(event) => {
                if (interactionMode !== "opening" || !onSelectOpening || !onOpeningChange) return;
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
                if (interactionMode !== "opening" || !onSelectOpening) return;
                event.stopPropagation();
                onSelectOpening(opening.id);
              }}
            >
              <line
                x1={horizontal ? opening.x - half : opening.x}
                y1={horizontal ? opening.y : opening.y - half}
                x2={horizontal ? opening.x + half : opening.x}
                y2={horizontal ? opening.y : opening.y + half}
                stroke="transparent"
                strokeWidth="0.72"
              />
              {opening.type === "door" ? (
                <g pointerEvents="none" opacity={selectedOpening ? 1 : 0.92}>
                  <line
                    x1={horizontal ? opening.x - half : opening.x}
                    y1={horizontal ? opening.y : opening.y - half}
                    x2={horizontal ? opening.x + half : opening.x}
                    y2={horizontal ? opening.y : opening.y + half}
                    stroke="#ffffff"
                    strokeWidth="0.22"
                  />
                  {sliding ? (
                    <>
                      <line
                        x1={horizontal ? opening.x - half : opening.x - 0.10}
                        y1={horizontal ? opening.y - 0.10 : opening.y - half}
                        x2={horizontal ? opening.x + 0.06 : opening.x - 0.10}
                        y2={horizontal ? opening.y - 0.10 : opening.y + 0.06}
                        stroke={selectedOpening ? "#f97316" : "#475569"}
                        strokeWidth="0.055"
                      />
                      <line
                        x1={horizontal ? opening.x - 0.06 : opening.x + 0.10}
                        y1={horizontal ? opening.y + 0.10 : opening.y - 0.06}
                        x2={horizontal ? opening.x + half : opening.x + 0.10}
                        y2={horizontal ? opening.y + 0.10 : opening.y + half}
                        stroke={selectedOpening ? "#f97316" : "#475569"}
                        strokeWidth="0.055"
                      />
                    </>
                  ) : (
                    <line
                      x1={horizontal
                        ? opening.x + (swingRight ? half : -half)
                        : opening.x}
                      y1={horizontal
                        ? opening.y
                        : opening.y + (swingRight ? half : -half)}
                      x2={horizontal
                        ? opening.x + (swingRight ? half : -half)
                        : opening.x + (swingRight ? -openingWidth : openingWidth)}
                      y2={horizontal
                        ? opening.y + (swingRight ? -openingWidth : openingWidth)
                        : opening.y + (swingRight ? half : -half)}
                      stroke={selectedOpening ? "#f97316" : "#475569"}
                      strokeWidth="0.06"
                    />
                  )}
                </g>
              ) : (
                <g pointerEvents="none">
                  <line
                    x1={horizontal ? opening.x - half : opening.x}
                    y1={horizontal ? opening.y : opening.y - half}
                    x2={horizontal ? opening.x + half : opening.x}
                    y2={horizontal ? opening.y : opening.y + half}
                    stroke="#ffffff"
                    strokeWidth="0.18"
                  />
                  <line
                    x1={horizontal ? opening.x - half : opening.x}
                    y1={horizontal ? opening.y : opening.y - half}
                    x2={horizontal ? opening.x + half : opening.x}
                    y2={horizontal ? opening.y : opening.y + half}
                    stroke={selectedOpening ? "#f97316" : "#0284c7"}
                    strokeWidth={selectedOpening ? "0.11" : "0.07"}
                  />
                </g>
              )}
              {selectedOpening && (
                <circle cx={opening.x} cy={opening.y} r="0.26" fill="#f97316" stroke="#fff" strokeWidth="0.06" pointerEvents="none" />
              )}
            </g>
          );
        })}

        <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="none" stroke="#64748b" strokeWidth="0.065" strokeDasharray="0.22 0.14" pointerEvents="none" />
      </svg>
    </div>
  );
}
