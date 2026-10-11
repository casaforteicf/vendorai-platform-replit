import { useMemo, useState } from "react";
import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalPlanPrimitives, architecturalSolidPrimitives } from "./conceptArchitecturalViews";

type Props = { model: ArchitecturalModel; floor: number; width?: number; height?: number };
const colors = { slab: "#94a3b8", "slab-void": "#ffffff", stair: "#a78bfa", roof: "#14b8a6" };
/** Isolated preview for the new architectural model; does not replace existing editor views. */
export function ConceptArchitecturalPreview({ model, floor, width = 560, height = 360 }: Props) {
  const [view, setView] = useState<"plan" | "volume">("plan");
  const plan = useMemo(() => architecturalPlanPrimitives(model).filter(p => p.floor === floor || p.floor === null), [model, floor]);
  const volumes = useMemo(() => architecturalSolidPrimitives(model).filter(p => p.floor === floor || p.floor === null), [model, floor]);
  const bounds = useMemo(() => {
    const items = architecturalPlanPrimitives(model).filter(p => p.floor === floor || p.floor === null);
    if (!items.length) return { x: 0, y: 0, w: 1, d: 1 };
    const x = Math.min(...items.map(p => p.x)), y = Math.min(...items.map(p => p.y));
    return { x, y, w: Math.max(1, Math.max(...items.map(p => p.x + p.width)) - x), d: Math.max(1, Math.max(...items.map(p => p.y + p.depth)) - y) };
  }, [model, floor]);
  const scale = Math.min((width - 40) / bounds.w, (height - 40) / bounds.d);
  const translate = (x: number, y: number) => ({ x: 20 + (x - bounds.x) * scale, y: 20 + (y - bounds.y) * scale });
  return <section aria-label="Prévia paramétrica de arquitetura">
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <button type="button" aria-pressed={view === "plan"} onClick={() => setView("plan")}>Planta 2D</button>
      <button type="button" aria-pressed={view === "volume"} onClick={() => setView("volume")}>Volumes 3D preliminares</button>
    </div>
    <svg role="img" aria-label={view === "plan" ? "Planta paramétrica" : "Representação volumétrica preliminar"} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: "#f8fafc", maxWidth: "100%" }}>
      {view === "plan" ? plan.map(p => {
        const point = translate(p.x, p.y);
        return <rect key={p.id} data-element-id={p.id} x={point.x} y={point.y} width={p.width * scale} height={p.depth * scale} fill={colors[p.kind]} fillOpacity={p.kind === "slab-void" ? 1 : 0.35} stroke="#334155" strokeDasharray={p.kind === "slab-void" ? "4 3" : undefined} />;
      }) : volumes.map(p => {
        const point = translate(p.x, p.y);
        // Top-down axonometric cue; not an architectural surface mesh.
        const lift = Math.max(0, Math.min(40, p.height * scale * 0.12));
        return <g key={p.id} data-element-id={p.id}>
          <rect x={point.x} y={point.y - lift} width={p.width * scale} height={p.depth * scale} fill={p.kind === "slab" ? "#64748b" : p.kind === "stair-step" ? "#8b5cf6" : "#0d9488"} fillOpacity={0.65} stroke="#334155" />
          <line x1={point.x} y1={point.y} x2={point.x} y2={point.y - lift} stroke="#334155" />
        </g>;
      })}
    </svg>
    <p style={{ fontSize: 12, color: "#475569" }}>Prévia técnica independente. Não substitui o modelo 3D final nem a verificação construtiva.</p>
  </section>;
}
export default ConceptArchitecturalPreview;
