import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ConceptGeometry, ConceptRoomShape, OpeningMarker } from "./conceptGeometry";

type Props = {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  geometry: ConceptGeometry;
  selectedId: string | null;
  onSelect: (roomId: string) => void;
  onRoomChange?: (roomId: string, patch: Partial<Pick<ConceptRoomShape, "x" | "y" | "width" | "depth">>) => void;
  selectedOpeningId?: string | null;
  onSelectOpening?: (openingId: string | null) => void;
  onOpeningChange?: (openingId: string, patch: { x: number; y: number; type: "door" | "window" }) => void;
  selectedWallId?: string | null;
  onSelectWall?: (wallId: string | null) => void;
  onWallMove?: (wallId: string, delta: number) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  interactionMode?: "room" | "wall" | "opening";
};

function formatMeters(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fitLabelSize(label: string, width: number) {
  const estimated = (width * 1.55) / Math.max(5, label.length);
  return Math.max(0.21, Math.min(0.38, estimated));
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

export default function ConceptPlan2D({
  rooms,
  lotWidth,
  lotDepth,
  geometry,
  selectedId,
  onSelect,
  onRoomChange,
  selectedOpeningId = null,
  onSelectOpening,
  onOpeningChange,
  selectedWallId = null,
  onSelectWall,
  onWallMove,
  onEditStart,
  onEditEnd,
  interactionMode = "room",
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [gesture, setGesture] = useState<null | {
    roomId: string;
    openingId?: string;
    wallId?: string;
    mode: "move" | "wall" | "opening" | "resize-n" | "resize-s" | "resize-e" | "resize-w" | "resize-ne" | "resize-nw" | "resize-se" | "resize-sw";
    startX: number;
    startY: number;
    roomX: number;
    roomY: number;
    roomWidth: number;
    roomDepth: number;
  }>(null);

  const margin = 2.4;
  const vbX = -margin;
  const vbY = -margin;
  const vbW = lotWidth + margin * 2;
  const vbH = lotDepth + margin * 2;

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

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!gesture || !onRoomChange) return;
    const point = toSvgPoint(event.clientX, event.clientY);
    const dx = point.x - gesture.startX;
    const dy = point.y - gesture.startY;

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
      const owner = rooms.find((room) => room.id === opening.roomId);
      if (!owner) return;
      const pad = 0.55;
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
      const others = rooms.filter((item) => item.id !== room.id);
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
    <div className="overflow-hidden rounded-2xl border bg-white shadow-inner">
      <svg
        ref={svgRef}
        className="block h-auto w-full touch-none select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          if (gesture) onEditEnd?.();
          setGesture(null);
        }}
        onPointerCancel={() => {
          if (gesture) onEditEnd?.();
          setGesture(null);
        }}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
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

        <text x={lotWidth / 2} y={lotDepth + 1.35} textAnchor="middle" fontSize="0.34" fontWeight="800" fill="#64748b" letterSpacing="0.08">
          FRENTE / ACESSO
        </text>

        {rooms.map((room) => {
          const selected = selectedId === room.id;
          const fill = ROOM_FILL[room.kind] ?? "#ffffff";
          const isPool = room.kind === "piscina";
          const area = room.width * room.depth;
          return (
            <g
              key={room.id}
              role="button"
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
              onClick={() => onSelect(room.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(room.id);
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
                        y={room.y + room.depth / 2 - (room.width >= 2.4 && room.depth >= 2 ? 0.13 : 0)}
                        textAnchor="middle"
                        fontSize={room.kind === "escada" ? "0.25" : fitLabelSize(room.label, room.width)}
                        fontWeight="750"
                        fill="#0f172a"
                        textLength={Math.max(0.8, room.width - 0.38)}
                        lengthAdjust="spacingAndGlyphs"
                      >
                        {room.label}
                      </text>
                      {room.width >= 2.4 && room.depth >= 2 && (
                        <text
                          x={room.x + room.width / 2}
                          y={room.y + room.depth / 2 + 0.32}
                          textAnchor="middle"
                          fontSize="0.22"
                          fill="#64748b"
                        >
                          {formatMeters(room.width)} × {formatMeters(room.depth)} m · {area.toFixed(1)} m²
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

        {geometry.openings.map((opening) => {
          const selectedOpening = selectedOpeningId === opening.id;
          const half = opening.type === "door" ? 0.48 : 0.62;
          const horizontal = opening.orientation === "horizontal";
          return (
            <g
              key={opening.id}
              className={interactionMode === "opening" ? "cursor-grab" : ""}
              onPointerDown={(event) => {
                if (interactionMode !== "opening" || !onSelectOpening || !onOpeningChange) return;
                event.stopPropagation();
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
                  <line
                    x1={horizontal ? opening.x - half : opening.x}
                    y1={horizontal ? opening.y : opening.y - half}
                    x2={horizontal ? opening.x - half : opening.x + half}
                    y2={horizontal ? opening.y + 0.82 : opening.y - half}
                    stroke={selectedOpening ? "#f97316" : "#475569"}
                    strokeWidth="0.06"
                  />
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
