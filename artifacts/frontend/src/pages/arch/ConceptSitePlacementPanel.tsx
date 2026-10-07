import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AlignCenter, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, Compass, Eye, Home, Mountain, Move, Route, Ruler, ShieldAlert, Sparkles, Sun } from "lucide-react";
import {
  buildSitePlacementSuggestions,
  clampBuildingOrigin,
  getBuildableEnvelope,
  getBuildingBounds,
  getSiteBoundaryPoints,
  pointInSitePolygon,
  polygonArea,
  type SitePlacement,
} from "./conceptSitePlacement";

type Props = {
  lotWidth: number;
  lotDepth: number;
  rooms: Array<{ id: string; kind: string; label: string; x: number; y: number; width: number; depth: number }>;
  placement: SitePlacement;
  onPlacementChange: (placement: SitePlacement) => void;
  onMoveBuilding: (origin: { x: number; y: number }) => void;
  onContinue?: () => void;
  onOpenFacade?: () => void;
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
  onContinue,
  onOpenFacade,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null);

  const bounds = useMemo(() => getBuildingBounds(rooms), [rooms]);
  const envelope = useMemo(
    () => getBuildableEnvelope(lotWidth, lotDepth, placement),
    [lotWidth, lotDepth, placement],
  );
  const suggestions = useMemo(
    () => buildSitePlacementSuggestions(rooms, lotWidth, lotDepth, placement),
    [rooms, lotWidth, lotDepth, placement],
  );
  const lotArea = useMemo(() => polygonArea(lotBoundary), [lotBoundary]);
  const lotBoundary = useMemo(
    () => getSiteBoundaryPoints(lotWidth, lotDepth, placement),
    [lotWidth, lotDepth, placement],
  );
  const lotArea = useMemo(() => polygonArea(lotBoundary), [lotBoundary]);

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
    setActiveSuggestionId(null);
    setDragOffset({ x: point.x - bounds.minX, y: point.y - bounds.minY });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!bounds || !dragOffset) return;
    const point = pointFromEvent(event);
    applyOrigin(point.x - dragOffset.x, point.y - dragOffset.y);
  };

  const stopDrag = () => setDragOffset(null);
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ].every((point) => pointInSitePolygon(point, envelope.polygon))
  );
  const fits = !bounds || (
    envelope.polygon.length >= 3
    && [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY },
    ].every((point) => pointInSitePolygon(point, envelope.polygon))
  );

  const frontAlignedOrigin = () => {
    if (!bounds) return { x: 0, y: 0 };
    if (placement.frontSide === "top") {
      return { x: bounds.minX, y: envelope.minY };
    }
    if (placement.frontSide === "left") {
      return { x: envelope.minX, y: bounds.minY };
    }
    if (placement.frontSide === "right") {
      return { x: envelope.maxX - bounds.width, y: bounds.minY };
    }
    return { x: bounds.minX, y: envelope.maxY - bounds.depth };
  };

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
          className={`h-80 w-full touch-none rounded-xl bg-white ${dragOffset ? "cursor-grabbing" : "cursor-grab"}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onPointerLeave={dragOffset ? undefined : stopDrag}
          role="img"
          aria-label="Implantação da casa no terreno"
        >
          <polygon
            points={lotBoundary.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="#fff"
            stroke="#64748b"
            strokeWidth="0.08"
          />
              fillOpacity="0.45"
              stroke="#16a34a"
              strokeWidth="0.08"
              strokeDasharray="0.25 0.18"
            />
          )}
          {envelope.polygon.length >= 3 && (
            <polygon
              points={envelope.polygon.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="#dcfce7"
              fillOpacity="0.45"
              stroke="#16a34a"
              strokeWidth="0.08"
              strokeDasharray="0.25 0.18"
            />
          )}
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
        <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-semibold text-slate-500">
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Verde = área edificável</span>
          <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">Laranja = perímetro da casa</span>
          <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700">Faixa escura = rua</span>
        </div>
      </div>

      {!fits && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-700">
          A casa ultrapassa a área edificável atual. Ajuste o perímetro/recuos, reposicione a implantação ou revise a planta.
        </div>
      )}

            Formato do terreno
          </div>
          <span className="text-[10px] font-semibold text-slate-500">{lotArea.toFixed(1)} m² reais</span>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onPlacementChange({ ...placement, lotBoundary: null })}
            className={!placement.lotBoundary
              ? "rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-950 shadow-sm"
              : "rounded-lg px-3 py-2 text-[11px] font-semibold text-slate-600"}
          >
            Retangular
          </button>
          <button
            type="button"
            onClick={() => onPlacementChange({
              ...placement,
              lotBoundary: {
                kind: "polygon",
                points: [
                  { x: 0, y: 0 },
                  { x: lotWidth, y: 0 },
                  { x: lotWidth, y: lotDepth },
                  { x: 0, y: lotDepth },
                ],
              },
            })}
            className={placement.lotBoundary
              ? "rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-950 shadow-sm"
              : "rounded-lg px-3 py-2 text-[11px] font-semibold text-slate-600"}
          >
            Irregular
          </button>
        </div>
        {placement.lotBoundary && (
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 text-[10px] leading-4 text-slate-500">
              Ajuste os quatro vértices em metros. A área edificável verde é recalculada e a casa não pode ultrapassar o polígono.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["Frente esq.", "Frente dir.", "Fundos dir.", "Fundos esq."] as const).map((label, index) => {
                const point = lotBoundary[index] ?? { x: 0, y: 0 };
                return (
                  <div key={label} className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-1 text-[9px] font-bold text-slate-600">{label}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(["x", "y"] as const).map((axis) => (
                        <label key={axis} className="text-[9px] font-semibold text-slate-400">
                          {axis.toUpperCase()}
                          <input
                            type="number"
                            min={0}
                            max={axis === "x" ? lotWidth : lotDepth}
                            step={0.1}
                            value={Number(point[axis].toFixed(2))}
                            onChange={(event) => {
                              const points = [...lotBoundary.slice(0, 4)];
                              points[index] = {
                                ...point,
                                [axis]: Math.max(0, Math.min(axis === "x" ? lotWidth : lotDepth, Number(event.target.value) || 0)),
                              };
                              onPlacementChange({ ...placement, lotBoundary: { kind: "polygon", points } });
                            }}
                            className="mt-0.5 h-8 w-full rounded-md border bg-white px-2 text-[10px] font-bold text-slate-800"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Route className="h-4 w-4 text-orange-500" />
            Formato do terreno
          </div>
          <span className="text-[10px] font-semibold text-slate-500">{lotArea.toFixed(1)} m² reais</span>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onPlacementChange({ ...placement, lotBoundary: null })}
            className={!placement.lotBoundary
              ? "rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-950 shadow-sm"
              : "rounded-lg px-3 py-2 text-[11px] font-semibold text-slate-600"}
          >
            Retangular
          </button>
          <button
            type="button"
            onClick={() => onPlacementChange({
              ...placement,
              lotBoundary: {
                kind: "polygon",
                points: [
                  { x: 0, y: 0 },
                  { x: lotWidth, y: 0 },
                  { x: lotWidth, y: lotDepth },
                  { x: 0, y: lotDepth },
                ],
              },
            })}
            className={placement.lotBoundary
              ? "rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-950 shadow-sm"
              : "rounded-lg px-3 py-2 text-[11px] font-semibold text-slate-600"}
          >
            Irregular
          </button>
        </div>
        {placement.lotBoundary && (
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 text-[10px] leading-4 text-slate-500">
              Ajuste os quatro vértices em metros. A área edificável verde é recalculada e a casa não pode ultrapassar o polígono.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["Frente esq.", "Frente dir.", "Fundos dir.", "Fundos esq."] as const).map((label, index) => {
                const point = lotBoundary[index] ?? { x: 0, y: 0 };
                return (
                  <div key={label} className="rounded-lg bg-slate-50 p-2">
                    <div className="mb-1 text-[9px] font-bold text-slate-600">{label}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(["x", "y"] as const).map((axis) => (
                        <label key={axis} className="text-[9px] font-semibold text-slate-400">
                          {axis.toUpperCase()}
                          <input
                            type="number"
                            min={0}
                            max={axis === "x" ? lotWidth : lotDepth}
                            step={0.1}
                            value={Number(point[axis].toFixed(2))}
                            onChange={(event) => {
                              const points = [...lotBoundary.slice(0, 4)];
                              points[index] = {
                                ...point,
                                [axis]: Math.max(0, Math.min(axis === "x" ? lotWidth : lotDepth, Number(event.target.value) || 0)),
                              };
                              onPlacementChange({ ...placement, lotBoundary: { kind: "polygon", points } });
                            }}
                            className="mt-0.5 h-8 w-full rounded-md border bg-white px-2 text-[10px] font-bold text-slate-800"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

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
              onClick={() => onPlacementChange({
                ...placement,
                frontSide: value,
                vehicleAccessSide: !placement.vehicleAccessSide || placement.vehicleAccessSide === placement.frontSide
                  ? value
                  : placement.vehicleAccessSide,
              })}
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

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Compass className="h-4 w-4 text-orange-500" />
          Contexto real do terreno
        </div>
        <p className="text-[10px] leading-4 text-slate-500">
          Estes dados orientam a IA na implantação. Se ainda não souber algum item, deixe como “Não informado”.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="rounded-xl border bg-white p-2.5 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><Sun className="h-3 w-3" /> Norte geográfico</span>
            <select
              value={placement.northSide ?? ""}
              onChange={(event) => onPlacementChange({ ...placement, northSide: (event.target.value || null) as SitePlacement["northSide"] })}
              className="mt-1 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none"
            >
              <option value="">Não informado</option>
              <option value="top">Cima</option>
              <option value="bottom">Baixo</option>
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </select>
          </label>
          <label className="rounded-xl border bg-white p-2.5 text-[10px] font-semibold text-slate-500">
            Acesso de veículos
            <select
              value={placement.vehicleAccessSide ?? placement.frontSide}
              onChange={(event) => onPlacementChange({ ...placement, vehicleAccessSide: event.target.value as SitePlacement["vehicleAccessSide"] })}
              className="mt-1 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none"
            >
              <option value="top">Cima</option>
              <option value="bottom">Baixo</option>
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </select>
          </label>
          <label className="rounded-xl border bg-white p-2.5 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><Mountain className="h-3 w-3" /> Declive</span>
            <select
              value={placement.slope ?? "flat"}
              onChange={(event) => onPlacementChange({ ...placement, slope: event.target.value as SitePlacement["slope"] })}
              className="mt-1 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none"
            >
              <option value="flat">Plano / pouco declive</option>
              <option value="to_front">Cai para a frente</option>
              <option value="to_rear">Cai para os fundos</option>
              <option value="to_left">Cai para a esquerda</option>
              <option value="to_right">Cai para a direita</option>
            </select>
          </label>
          <label className="rounded-xl border bg-white p-2.5 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Melhor vista / lazer</span>
            <select
              value={placement.preferredViewSide ?? ""}
              onChange={(event) => onPlacementChange({ ...placement, preferredViewSide: (event.target.value || null) as SitePlacement["preferredViewSide"] })}
              className="mt-1 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none"
            >
              <option value="">Não informado</option>
              <option value="top">Cima</option>
              <option value="bottom">Baixo</option>
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </select>
          </label>
          <label className="rounded-xl border bg-white p-2.5 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> Lado crítico</span>
            <select
              value={placement.avoidSide ?? ""}
              onChange={(event) => onPlacementChange({ ...placement, avoidSide: (event.target.value || null) as SitePlacement["avoidSide"] })}
              className="mt-1 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none"
            >
              <option value="">Nenhum / não informado</option>
              <option value="top">Cima</option>
              <option value="bottom">Baixo</option>
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </select>
          </label>
        </div>
        <label className="block rounded-xl border bg-white p-2.5 text-[10px] font-semibold text-slate-500">
          Prioridade da implantação
          <select
            value={placement.strategy ?? "balanced"}
            onChange={(event) => onPlacementChange({ ...placement, strategy: event.target.value as SitePlacement["strategy"] })}
            className="mt-1 w-full bg-transparent text-[11px] font-bold text-slate-800 outline-none"
          >
            <option value="balanced">Equilibrar tudo</option>
            <option value="access">Acesso e garagem</option>
            <option value="solar">Sol e iluminação natural</option>
            <option value="leisure">Jardim, piscina e lazer</option>
          </select>
        </label>
      </section>

      {bounds && suggestions.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-bold text-slate-800"><Sparkles className="h-4 w-4 text-orange-500" />Sugestões automáticas</div><span className="text-[9px] font-semibold text-slate-400">1 clique para aplicar</span></div>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => { setActiveSuggestionId(suggestion.id); applyOrigin(suggestion.origin.x, suggestion.origin.y); }}
                className={activeSuggestionId === suggestion.id ? "w-full rounded-2xl border-2 border-orange-500 bg-orange-50 p-3 text-left shadow-sm" : "w-full rounded-2xl border bg-white p-3 text-left transition hover:border-orange-300 hover:bg-orange-50/40"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold text-slate-900">{suggestion.title}</div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">{suggestion.description}</p>
                  </div>
                  <span className={activeSuggestionId === suggestion.id ? "flex shrink-0 items-center gap-1 rounded-lg bg-orange-500 px-2 py-1 text-[9px] font-bold text-white" : "shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600"}>
                    {activeSuggestionId === suggestion.id && <CheckCircle2 className="h-3 w-3" />}
                    {activeSuggestionId === suggestion.id ? "Aplicada" : suggestion.score ? `${suggestion.score} pts` : "Aplicar"}
                  </span>
                </div>
                {suggestion.reasons && suggestion.reasons.length > 0 && (
                  <div className="mt-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-[9px] font-semibold leading-4 text-emerald-700">
                    {suggestion.reasons.slice(0, 3).join(" · ")}
                  </div>
                )}
                <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] font-semibold text-slate-500">
                  <span>Fundo livre: {suggestion.metrics.rearFree.toFixed(1)} m</span>
                  <span>Maior lateral: {Math.max(suggestion.metrics.leftFree, suggestion.metrics.rightFree).toFixed(1)} m</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

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
              onClick={() => { const next = frontAlignedOrigin(); applyOrigin(next.x, next.y); }}
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

      {bounds && (
        <div className="sticky bottom-0 space-y-2 rounded-2xl border bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-3 text-[10px]">
            <span className="font-semibold text-slate-500">Implantação</span>
            <span className={fits ? "font-bold text-emerald-600" : "font-bold text-red-600"}>
              {fits ? "Dentro dos recuos" : "Precisa de ajuste"}
            </span>
          </div>
          {onContinue && (
            <button
              type="button"
              disabled={!fits}
              onClick={onContinue}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar implantação e continuar
            </button>
          )}
          {onOpenFacade && (
            <button
              type="button"
              disabled={!fits}
              onClick={onOpenFacade}
              className="w-full rounded-xl border bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ver fachada com esta implantação
            </button>
          )}
        </div>
      )}
    </div>
  );
}
