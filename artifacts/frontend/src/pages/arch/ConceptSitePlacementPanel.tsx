import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlignCenter, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Home, Move, Ruler } from "lucide-react";
import {
  clampBuildingOrigin,
  getBuildableEnvelope,
  getBuildingBounds,
  type SitePlacement,
} from "./conceptSitePlacement";

type Props = {
  lotWidth: number;
  lotDepth: number;
  rooms: Array<{ id: string; kind: string; label: string; x: number; y: number; width: number; depth: number }>;
  placement: SitePlacement;
  onPlacementChange: (placement: SitePlacement) => void;
  onMoveBuilding: (origin: { x: number; y: number }) => void;
};

function roomFill(kind: string) {
  if (kind === "garagem") return "#cbd5e1";
  if (kind === "sala") return "#fde68a";
  if (kind === "cozinha") return "#fdba74";
  if (kind === "suite") return "#ddd6fe";
  if (kind === "quarto") return "#e0e7ff";
  if (kind === "banheiro") return "#bae6fd";
  if (kind === "gourmet") return "#fed7aa";
  if (kind === "piscina") return "#7dd3fc";
  return "#e2e8f0";
}

export default function ConceptSitePlacementPanel({
  lotWidth,
  lotDepth,
  rooms,
  placement,
  onPlacementChange,
  onMoveBuilding,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const bounds = useMemo(() => getBuildingBounds(rooms), [rooms]);
  const envelope = useMemo(
    () => getBuildableEnvelope(lotWidth, lotDepth, placement),
    [lotWidth, lotDepth, placement],
  );

  const applyOrigin = (x: number, y: number) => {
    if (!bounds) return;
    const next = clampBuildingOrigin(x, y, bounds, lotWidth, lotDepth, placement);
    onMoveBuilding({ x: next.x, y: next.y });
  };

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * lotWidth,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * lotDepth,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!bounds) return;
    const point = pointFromEvent(event);
    if (point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragOffset({ x: point.x - bounds.minX, y: point.y - bounds.minY });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!bounds || !dragOffset) return;
    const point = pointFromEvent(event);
    applyOrigin(point.x - dragOffset.x, point.y - dragOffset.y);
  };

  const stopDrag = () => setDragOffset(null);
  const fits = !bounds || (bounds.width <= envelope.width + 0.001 && bounds.depth <= envelope.depth + 0.001);

  const frontLabel =
    placement.frontSide === "bottom" ? "Rua embaixo"
      : placement.frontSide === "top" ? "Rua em cima"
      : placement.frontSide === "left" ? "Rua à esquerda"
      : "Rua à direita";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white">
            <Home className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900">Posicione a casa no terreno</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              Ajuste os recuos e arraste a casa dentro da área edificável.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-slate-100 p-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${lotWidth} ${lotDepth}`}
          className={`h-72 w-full touch-none rounded-xl bg-white ${dragOffset ? "cursor-grabbing" : "cursor-grab"}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onPointerLeave={dragOffset ? undefined : stopDrag}
          role="img"
          aria-label="Implantação da casa no terreno"
        >
          <rect x="0" y="0" width={lotWidth} height={lotDepth} fill="#fff" stroke="#64748b" strokeWidth="0.08" />
          <rect
            x={envelope.minX}
            y={envelope.minY}
            width={envelope.width}
            height={envelope.depth}
            fill="#dcfce7"
            fillOpacity="0.45"
            stroke="#16a34a"
            strokeWidth="0.08"
            strokeDasharray="0.25 0.18"
          />
          {rooms.map((room) => (
            <rect
              key={room.id}
              x={room.x}
              y={room.y}
              width={room.width}
              height={room.depth}
              fill={roomFill(room.kind)}
              stroke="#334155"
              strokeWidth="0.07"
              opacity={room.kind === "piscina" ? 0.75 : 1}
            />
          ))}
          {bounds && (
            <rect
              x={bounds.minX}
              y={bounds.minY}
              width={bounds.width}
              height={bounds.depth}
              fill="none"
              stroke={fits ? "#f97316" : "#dc2626"}
              strokeWidth="0.12"
              strokeDasharray="0.3 0.16"
            />
          )}

          {placement.frontSide === "bottom" && <rect x="0" y={lotDepth - 0.45} width={lotWidth} height="0.45" fill="#334155" />}
          {placement.frontSide === "top" && <rect x="0" y="0" width={lotWidth} height="0.45" fill="#334155" />}
          {placement.frontSide === "left" && <rect x="0" y="0" width="0.45" height={lotDepth} fill="#334155" />}
          {placement.frontSide === "right" && <rect x={lotWidth - 0.45} y="0" width="0.45" height={lotDepth} fill="#334155" />}
        </svg>
        <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-slate-500">
          <span><Move className="mr-1 inline h-3 w-3" />Arraste a casa</span>
          <span>{frontLabel}</span>
        </div>
      </div>

      {!fits && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-700">
          A casa é maior que a área edificável atual. Reduza algum recuo ou ajuste a planta.
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <Ruler className="h-4 w-4 text-slate-500" />
          Recuos
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["setbackFront", "Frente"],
            ["setbackRear", "Fundos"],
            ["setbackLeft", "Lateral esq."],
            ["setbackRight", "Lateral dir."],
          ] as const).map(([key, label]) => (
            <label key={key} className="rounded-xl border bg-white p-2.5 text-[10px] font-semibold text-slate-500">
              {label}
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={placement[key]}
                  onChange={(event) => onPlacementChange({
                    ...placement,
                    [key]: Math.max(0, Number(event.target.value) || 0),
                  })}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none"
                />
                <span>m</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 text-xs font-bold text-slate-800">Frente do terreno</div>
        <div className="grid grid-cols-4 gap-2">
          {([
            ["bottom", ArrowDown, "Baixo"],
            ["top", ArrowUp, "Cima"],
            ["left", ArrowLeft, "Esq."],
            ["right", ArrowRight, "Dir."],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onPlacementChange({ ...placement, frontSide: value })}
              className={placement.frontSide === value
                ? "rounded-xl border-2 border-orange-500 bg-orange-50 p-2 text-orange-700"
                : "rounded-xl border bg-white p-2 text-slate-600"}
            >
              <Icon className="mx-auto h-4 w-4" />
              <span className="mt-1 block text-[9px] font-bold">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {bounds && (
        <section>
          <div className="mb-2 text-xs font-bold text-slate-800">Posicionamento rápido</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => applyOrigin(
                envelope.minX + Math.max(0, (envelope.width - bounds.width) / 2),
                envelope.minY + Math.max(0, (envelope.depth - bounds.depth) / 2),
              )}
              className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700"
            >
              <AlignCenter className="h-4 w-4" /> Centralizar
            </button>
            <button
              type="button"
              onClick={() => applyOrigin(bounds.minX, envelope.maxY - bounds.depth)}
              className="rounded-xl border bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700"
            >
              Alinhar à frente
            </button>
            <button
              type="button"
              onClick={() => applyOrigin(envelope.minX, bounds.minY)}
              className="rounded-xl border bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700"
            >
              Alinhar esquerda
            </button>
            <button
              type="button"
              onClick={() => applyOrigin(envelope.maxX - bounds.width, bounds.minY)}
              className="rounded-xl border bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700"
            >
              Alinhar direita
            </button>
          </div>
        </section>
      )}

      {bounds && (
        <div className="rounded-xl border bg-slate-50 p-3 text-[10px] leading-5 text-slate-600">
          Casa: <strong>{bounds.width.toFixed(1)} × {bounds.depth.toFixed(1)} m</strong> ·
          Área edificável: <strong>{envelope.width.toFixed(1)} × {envelope.depth.toFixed(1)} m</strong>
        </div>
      )}
    </div>
  );
}
