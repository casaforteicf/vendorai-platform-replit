import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { moveArchitecturalElement, resizeArchitecturalElement } from "./conceptArchitecturalMovement";
import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalPlanPrimitives } from "./conceptArchitecturalViews";
type Props = { lotWidth?: number; lotDepth?: number; model: ArchitecturalModel; floor: number; selectedId?: string | null; onSelect?: (id: string) => void; onResize?: (id: string, width: number, depth: number) => void; onMove?: (id: string, dx: number, dy: number) => void };
/** Select outlines rather than covering wall/room interactions with slab fills. */
export function ConceptArchitecturalPlanLayer({ model, floor, selectedId, onSelect, onMove, onResize, lotWidth, lotDepth }: Props) {
  type Drag = { target: SVGGraphicsElement; resize?: boolean; width?: number; depth?: number; floor: number; id: string; pointerId: number; x: number; y: number; dx: number; dy: number; base: ArchitecturalModel };
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<ArchitecturalModel | null>(null);
  function point(event: ReactPointerEvent<SVGGraphicsElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    const svg = event.currentTarget.ownerSVGElement;
    if (!matrix || !svg) return null;
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const value = p.matrixTransform(matrix.inverse());
    return Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null;
  }
  function cancel() {
    const drag = dragRef.current;
    dragRef.current = null; setPreview(null);
    if (drag?.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
  }
  const onPointerMove = (event: ReactPointerEvent<SVGGraphicsElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        if (drag.base !== model || drag.id !== selectedId || drag.floor !== floor || (drag.resize ? !onResize : !onMove) || !lotWidth || !lotDepth) { cancel(); return; }
        const p = point(event); if (!p) return;
        const dx = Math.round((p.x - drag.x) * 100) / 100, dy = Math.round((p.y - drag.y) * 100) / 100;
        const moved = drag.resize
          ? resizeArchitecturalElement(drag.base, drag.id, drag.width! + dx, drag.depth! + dy, lotWidth, lotDepth)
          : moveArchitecturalElement(drag.base, drag.id, dx, dy, lotWidth, lotDepth);
        if ("error" in moved) return;
        drag.dx = dx; drag.dy = dy; setPreview(moved.value);
      };
  const onPointerUp = (event: ReactPointerEvent<SVGGraphicsElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.stopPropagation(); cancel();
        if (drag.base === model && drag.id === selectedId && drag.floor === floor && (drag.dx || drag.dy)) {
          suppressClick.current = true; if (drag.resize) onResize?.(drag.id, drag.width! + drag.dx, drag.depth! + drag.dy);
          else onMove?.(drag.id, drag.dx, drag.dy);
        }
      };
  const onPointerCancel = (event: ReactPointerEvent<SVGGraphicsElement>) => { if (dragRef.current?.pointerId === event.pointerId) { event.stopPropagation(); suppressClick.current = true; cancel(); } };
  const onLostPointerCapture = (event: ReactPointerEvent<SVGGraphicsElement>) => { if (dragRef.current?.pointerId === event.pointerId) { suppressClick.current = true; cancel(); } };
  const displayed = preview && dragRef.current?.base === model ? preview : model;
  return <g>{architecturalPlanPrimitives(displayed).filter(element => element.floor === floor || element.floor === null).map(element => {
    const selectable = Boolean(onSelect) && element.kind !== "slab-void";
    const selected = element.id === selectedId;
    const label = element.kind === "slab" ? "Laje" : element.kind === "stair" ? "Escada" : element.kind === "roof" ? "Cobertura" : "Vão de laje";
    const authored = model.slabs.find(item => item.id === element.id) ?? model.stairs.find(item => item.id === element.id) ?? model.roofs.find(item => item.id === element.id);
    const shown = displayed.slabs.find(item => item.id === element.id) ?? displayed.stairs.find(item => item.id === element.id) ?? displayed.roofs.find(item => item.id === element.id);
    return <g key={element.id}><rect data-architectural-id={element.id}
      x={element.x} y={element.y} width={element.width} height={element.depth}
      fill={element.kind === "slab-void" ? "#ffffff" : element.kind === "stair" ? "#8b5cf6" : element.kind === "roof" ? "#14b8a6" : "#64748b"}
      fillOpacity={element.kind === "slab-void" ? 0.9 : 0.16}
      stroke={selected ? "#f97316" : element.kind === "slab-void" ? "#64748b" : "#0f766e"} strokeWidth={selected ? 0.09 : 0.045}
      strokeDasharray={element.kind === "roof" || element.kind === "slab-void" ? "0.18 0.12" : undefined}
      pointerEvents={selectable ? "visibleStroke" : "none"}
      role={selectable ? "button" : undefined} tabIndex={selectable ? 0 : undefined}
      aria-label={selectable ? `${label} · ${element.id}` : undefined} aria-pressed={selectable ? selected : undefined}
      style={selectable && selected && onMove ? { touchAction: "none", cursor: "move" } : undefined}
      onPointerDown={selectable ? event => {
        event.stopPropagation(); suppressClick.current = false;
        if (!selected || !onMove || !lotWidth || !lotDepth || event.button !== 0 || dragRef.current) return;
        const p = point(event); if (!p) return;
        event.preventDefault(); event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { target: event.currentTarget, floor, id: element.id, pointerId: event.pointerId, x: p.x, y: p.y, dx: 0, dy: 0, base: model };
      } : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onClick={selectable ? event => { event.stopPropagation(); if (suppressClick.current) { suppressClick.current = false; return; } onSelect?.(element.id); } : undefined}
      onKeyDown={selectable ? event => {
        if (event.key === "Escape" && dragRef.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = true; cancel(); return; }
        if (dragRef.current) { event.preventDefault(); event.stopPropagation(); return; }
        if (selected && onMove && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const step = event.shiftKey ? 0.1 : 0.01;
          const movement = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
          if (movement) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) onMove(element.id, movement[0], movement[1]); return; }
        }
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onSelect?.(element.id); }
      } : undefined}><title>{label} · {element.width.toFixed(2)} × {element.depth.toFixed(2)} m</title></rect>
      {selected && selectable && onResize && lotWidth && lotDepth && authored && shown && <circle
        cx={shown.x + shown.width} cy={shown.y + ("run" in shown ? shown.run : shown.depth)} r={0.12}
        fill="#f97316" stroke="white" strokeWidth={0.035} role="button" tabIndex={0}
        aria-label={`Redimensionar ${label} · ${element.id}`} style={{ touchAction: "none", cursor: "nwse-resize" }}
        onPointerDown={event => {
          event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
          if (event.button !== 0 || dragRef.current) return;
          const p = point(event); if (!p) return;
          event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { target: event.currentTarget, floor, id: element.id, pointerId: event.pointerId, x: p.x, y: p.y, dx: 0, dy: 0, base: model, resize: true, width: authored.width, depth: "run" in authored ? authored.run : authored.depth };
        }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onLostPointerCapture={onLostPointerCapture}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); return; }
          if (dragRef.current || event.ctrlKey || event.metaKey || event.altKey) return;
          const step = event.shiftKey ? 0.1 : 0.01;
          const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
          if (delta) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) onResize(element.id, authored.width + delta[0], ("run" in authored ? authored.run : authored.depth) + delta[1]); }
        }}><title>Arraste para redimensionar; setas: 1 cm; Shift: 10 cm</title></circle>}
    </g>;
  })}</g>;
}
