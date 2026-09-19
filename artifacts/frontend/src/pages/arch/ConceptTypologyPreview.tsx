import { useMemo } from "react";
import { buildTypologyRooms, CONCEPT_TYPOLOGIES, DEFAULT_LAYOUT_PREFERENCES, type ConceptTypology } from "./conceptTemplates";
import { generateTypologyLayout } from "./conceptTypologyLayout";

type Props = {
  typology: ConceptTypology;
  lotWidth: number;
  lotDepth: number;
  variant?: number;
};

const FILL: Record<string, string> = {
  sala: "#f8fafc",
  cozinha: "#fff7ed",
  suite: "#fdf2f8",
  quarto: "#f8fafc",
  banheiro: "#eff6ff",
  lavanderia: "#f1f5f9",
  garagem: "#f1f5f9",
  gourmet: "#fff7ed",
  piscina: "#dff4ff",
  circulacao: "#f8fafc",
  escada: "#eef2f7",
  outro: "#ffffff",
};

function shortLabel(label: string) {
  const compact = label
    .replace("Garagem 2 vagas", "Garagem")
    .replace("Sala + jantar", "Sala")
    .replace("Banheiro social", "Banho")
    .replace("Espaço gourmet", "Gourmet")
    .replace("Hall íntimo", "Hall")
    .replace("Hall social", "Hall");
  return compact.length > 12 ? compact.slice(0, 11) + "…" : compact;
}

export default function ConceptTypologyPreview({
  typology,
  lotWidth,
  lotDepth,
  variant = 0,
}: Props) {
  const { rooms, floors } = useMemo(() => {
    const template = CONCEPT_TYPOLOGIES.find((item) => item.id === typology) ?? CONCEPT_TYPOLOGIES[0];
    let next = buildTypologyRooms(typology);
    for (let floor = 0; floor < template.floors; floor += 1) {
      next = generateTypologyLayout(
        next,
        lotWidth,
        lotDepth,
        floor,
        typology,
        variant,
        DEFAULT_LAYOUT_PREFERENCES,
      );
    }
    return { rooms: next, floors: template.floors };
  }, [typology, lotWidth, lotDepth, variant]);

  const gap = 1.25;
  const previewWidth = floors * lotWidth + Math.max(0, floors - 1) * gap;

  return (
    <div className="overflow-hidden rounded-xl border bg-slate-50">
      <svg
        className="block h-44 w-full"
        viewBox={`0 0 ${previewWidth} ${lotDepth}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Prévia da planta"
      >
        {Array.from({ length: floors }).map((_, floor) => {
          const offsetX = floor * (lotWidth + gap);
          return (
            <g key={floor} transform={`translate(${offsetX} 0)`}>
              <rect
                x="0"
                y="0"
                width={lotWidth}
                height={lotDepth}
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth="0.08"
                strokeDasharray="0.24 0.16"
              />
              {rooms
                .filter((room) => room.floor === floor)
                .map((room) => (
                  <g key={room.id}>
                    <rect
                      x={room.x}
                      y={room.y}
                      width={room.width}
                      height={room.depth}
                      rx={room.kind === "piscina" ? 0.16 : 0.03}
                      fill={FILL[room.kind] ?? "#ffffff"}
                      stroke={room.kind === "piscina" ? "#38bdf8" : "#334155"}
                      strokeWidth={room.kind === "piscina" ? 0.08 : 0.11}
                    />
                    {room.width >= 2.1 && room.depth >= 1.5 && (
                      <text
                        x={room.x + room.width / 2}
                        y={room.y + room.depth / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="0.34"
                        fontWeight="700"
                        fill="#334155"
                      >
                        {shortLabel(room.label)}
                      </text>
                    )}
                  </g>
                ))}
              {floors > 1 && (
                <text x="0.5" y="1.05" fontSize="0.45" fontWeight="800" fill="#64748b">
                  {floor === 0 ? "Térreo" : "Superior"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
