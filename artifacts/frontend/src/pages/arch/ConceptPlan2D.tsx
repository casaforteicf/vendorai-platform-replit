import type { ConceptGeometry, ConceptRoomShape, OpeningMarker } from "./conceptGeometry";

type Props = {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  geometry: ConceptGeometry;
  selectedId: string | null;
  onSelect: (roomId: string) => void;
};

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
      <g key={opening.id}>
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
    <g key={opening.id}>
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
}: Props) {
  const margin = 2.4;
  const vbX = -margin;
  const vbY = -margin;
  const vbW = lotWidth + margin * 2;
  const vbH = lotDepth + margin * 2;

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-inner">
      <svg
        className="block h-auto w-full touch-manipulation"
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
          {lotWidth.toFixed(2)} m
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
          {lotDepth.toFixed(2)} m
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
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.depth / 2 - 0.12}
                    textAnchor="middle"
                    fontSize={Math.max(0.3, Math.min(0.44, room.width / 8))}
                    fontWeight="750"
                    fill="#0f172a"
                  >
                    {room.label}
                  </text>
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + room.depth / 2 + 0.36}
                    textAnchor="middle"
                    fontSize="0.28"
                    fill="#64748b"
                  >
                    {room.width.toFixed(2)} × {room.depth.toFixed(2)} m · {area.toFixed(1)} m²
                  </text>
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
                    {room.width.toFixed(2)} × {room.depth.toFixed(2)} m
                  </text>
                </>
              )}
            </g>
          );
        })}

        {geometry.walls.map((wall) => (
          <line
            key={wall.id}
            x1={wall.x1}
            y1={wall.y1}
            x2={wall.x2}
            y2={wall.y2}
            stroke={wall.exterior ? "#111827" : "#334155"}
            strokeWidth={wall.exterior ? "0.16" : "0.095"}
            strokeLinecap="square"
          />
        ))}

        {geometry.openings.map((opening) => {
          if (opening.type === "door") return doorGlyph(opening);
          const half = 0.62;
          const horizontal = opening.orientation === "horizontal";
          return (
            <g key={opening.id}>
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
                stroke="#0284c7"
                strokeWidth="0.07"
              />
            </g>
          );
        })}

        <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="none" stroke="#64748b" strokeWidth="0.065" strokeDasharray="0.22 0.14" />
      </svg>
    </div>
  );
}
