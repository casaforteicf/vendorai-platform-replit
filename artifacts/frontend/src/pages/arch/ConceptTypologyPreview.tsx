import { useMemo } from "react";
import { CONCEPT_TYPOLOGIES, type ConceptTypology, type TemplateRoom } from "./conceptTemplates";

type Props = {
  typology: ConceptTypology;
  lotWidth: number;
  lotDepth: number;
  variant?: number;
};

// Miniatura fiel ao modelo: é a própria planta que o editor vai abrir.
// Antes o cartão mostrava fotos de banco de imagens de casas que não tinham relação com a planta gerada.
const FILL: Record<TemplateRoom["kind"], string> = {
  sala: "#f4efe6",
  cozinha: "#eef2ea",
  gourmet: "#eef2ea",
  suite: "#eaf0f6",
  quarto: "#eaf0f6",
  banheiro: "#e3eef2",
  lavanderia: "#eceef0",
  garagem: "#eceef0",
  circulacao: "#f7f7f5",
  escada: "#f1f1ef",
  piscina: "#cfe8f3",
  outro: "#f3f1ec",
};

function shortLabel(room: TemplateRoom) {
  const label = room.label
    .replace("Garagem 2 vagas", "Garagem")
    .replace("Garagem 1 vaga", "Garagem")
    .replace("Sala de estar + jantar", "Estar/jantar")
    .replace("Sala + jantar", "Estar/jantar")
    .replace("Sala de estar", "Estar")
    .replace("Cozinha com ilha", "Cozinha")
    .replace("Cozinha + copa", "Cozinha")
    .replace("Cozinha integrada", "Cozinha")
    .replace("Cozinha + jantar", "Cozinha")
    .replace("Espaço gourmet", "Gourmet")
    .replace("Hall + circulação", "")
    .replace("Hall + mezanino", "")
    .replace("Hall íntimo", "")
    .replace("Circulação", "")
    .replace("Banho suíte master", "Banho")
    .replace(/Banho suíte.*/, "Banho")
    .replace("Banheiro social", "Banho")
    .replace("Closet master", "Closet")
    .replace("Lavanderia", "Serviço");
  return label;
}

function FloorPlan({ rooms, x, y, scale, title }: { rooms: TemplateRoom[]; x: number; y: number; scale: number; title?: string }) {
  const minX = Math.min(...rooms.map((room) => room.x ?? 0));
  const minY = Math.min(...rooms.map((room) => room.y ?? 0));
  return (
    <g transform={`translate(${x} ${y})`}>
      {title && (
        <text x={0} y={-4} fontSize="7" fontWeight="700" fill="#64748b" letterSpacing="0.6">{title}</text>
      )}
      {rooms.map((room, index) => {
        const rx = ((room.x ?? 0) - minX) * scale;
        const ry = ((room.y ?? 0) - minY) * scale;
        const rw = room.width * scale;
        const rh = room.depth * scale;
        const label = shortLabel(room);
        const pool = room.kind === "piscina";
        const fontSize = Math.min(6.4, Math.max(4.2, Math.min(rw, rh) / 3.4));
        return (
          <g key={`${room.label}-${index}`}>
            <rect
              x={rx}
              y={ry}
              width={rw}
              height={rh}
              fill={FILL[room.kind]}
              stroke={pool ? "#7bb6cf" : "#1f2937"}
              strokeWidth={pool ? 0.8 : 1.6}
              rx={pool ? 2 : 0}
            />
            {room.kind === "escada" && Array.from({ length: 7 }, (_, step) => (
              <line
                key={step}
                x1={rx + 2}
                x2={rx + rw - 2}
                y1={ry + ((step + 1) * rh) / 8}
                y2={ry + ((step + 1) * rh) / 8}
                stroke="#94a3b8"
                strokeWidth="0.6"
              />
            ))}
            {label && rw > 16 && rh > 10 && (
              <text
                x={rx + rw / 2}
                y={ry + rh / 2 + fontSize / 3}
                textAnchor="middle"
                fontSize={fontSize}
                fontWeight="600"
                fill={pool ? "#2f7390" : "#334155"}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export default function ConceptTypologyPreview({ typology }: Props) {
  const template = useMemo(
    () => CONCEPT_TYPOLOGIES.find((item) => item.id === typology) ?? CONCEPT_TYPOLOGIES[0],
    [typology],
  );

  const floors = useMemo(
    () => Array.from({ length: template.floors }, (_, floor) => template.rooms.filter((room) => room.floor === floor)),
    [template],
  );

  const viewW = 320;
  const viewH = 200;
  const pad = 14;
  const gap = floors.length > 1 ? 22 : 0;
  const titleSpace = floors.length > 1 ? 10 : 0;
  const all = template.rooms;
  const totalW = Math.max(...all.map((room) => (room.x ?? 0) + room.width)) - Math.min(...all.map((room) => room.x ?? 0));
  const totalD = Math.max(...all.map((room) => (room.y ?? 0) + room.depth)) - Math.min(...all.map((room) => room.y ?? 0));
  const scale = Math.min(
    (viewW - pad * 2 - gap) / (totalW * floors.length),
    (viewH - pad * 2 - titleSpace) / totalD,
  );
  const drawnW = totalW * scale * floors.length + gap;
  const offsetX = (viewW - drawnW) / 2;
  const offsetY = (viewH - totalD * scale - titleSpace) / 2 + titleSpace;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      className="h-full w-full"
      role="img"
      aria-label={`Planta do modelo ${template.title}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={viewW} height={viewH} fill="#fbfaf7" />
      {floors.map((rooms, floor) => (
        <FloorPlan
          key={floor}
          rooms={rooms}
          x={offsetX + floor * (totalW * scale + gap)}
          y={offsetY}
          scale={scale}
          title={floors.length > 1 ? (floor === 0 ? "TÉRREO" : "SUPERIOR") : undefined}
        />
      ))}
      <text x={viewW - 10} y={viewH - 8} textAnchor="end" fontSize="7" fill="#94a3b8">
        {totalW.toFixed(1).replace(".", ",")} × {totalD.toFixed(1).replace(".", ",")} m · frente ↑
      </text>
    </svg>
  );
}
