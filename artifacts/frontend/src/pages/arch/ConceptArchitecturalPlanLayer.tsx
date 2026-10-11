import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalPlanPrimitives } from "./conceptArchitecturalViews";
type Props = { model: ArchitecturalModel; floor: number; selectedId?: string | null; onSelect?: (id: string) => void; onMove?: (id: string, dx: number, dy: number) => void };
/** Select outlines rather than covering wall/room interactions with slab fills. */
export function ConceptArchitecturalPlanLayer({ model, floor, selectedId, onSelect, onMove }: Props) {
  return <g>{architecturalPlanPrimitives(model).filter(element => element.floor === floor || element.floor === null).map(element => {
    const selectable = Boolean(onSelect) && element.kind !== "slab-void";
    const selected = element.id === selectedId;
    const label = element.kind === "slab" ? "Laje" : element.kind === "stair" ? "Escada" : element.kind === "roof" ? "Cobertura" : "Vão de laje";
    return <rect key={element.id} data-architectural-id={element.id}
      x={element.x} y={element.y} width={element.width} height={element.depth}
      fill={element.kind === "slab-void" ? "#ffffff" : element.kind === "stair" ? "#8b5cf6" : element.kind === "roof" ? "#14b8a6" : "#64748b"}
      fillOpacity={element.kind === "slab-void" ? 0.9 : 0.16}
      stroke={selected ? "#f97316" : element.kind === "slab-void" ? "#64748b" : "#0f766e"} strokeWidth={selected ? 0.09 : 0.045}
      strokeDasharray={element.kind === "roof" || element.kind === "slab-void" ? "0.18 0.12" : undefined}
      pointerEvents={selectable ? "visibleStroke" : "none"}
      role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined}
      aria-label={selectable ? `${label} · ${element.id}` : undefined} aria-pressed={selectable ? selected : undefined}
      onPointerDown={selectable ? event => event.stopPropagation() : undefined}
      onClick={selectable ? event => { event.stopPropagation(); onSelect?.(element.id); } : undefined}
      onKeyDown={selectable ? event => {
        if (selected && onMove && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const step = event.shiftKey ? 0.1 : 0.01;
          const movement = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
          if (movement) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) onMove(element.id, movement[0], movement[1]); return; }
        }
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect?.(element.id); }
      } : undefined}><title>{label} · {element.width.toFixed(2)} × {element.depth.toFixed(2)} m</title></rect>;
  })}</g>;
}
