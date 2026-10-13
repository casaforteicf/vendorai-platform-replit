import { useMemo } from "react";
import { projectBimPlan } from "./conceptBimPlanGeometry";
import { removeBimElement, upsertBimElement, type BimElement, type BimModel } from "./conceptBimElementModel";

type Props = { model: BimModel; onChange(model: BimModel): void; floor: number };
const nextId = () => "bim-" + globalThis.crypto.randomUUID();
const makeElement = (kind: BimElement["kind"], floor: number): BimElement => {
  const base = { id: nextId(), x: 1, y: 1 };
  if (kind === "stair") return { ...base, kind, parameters: { floor, rise: 2.8, run: 4.5, stepCount: 16, width: 1.2 } };
  if (kind === "slab") return { ...base, kind, parameters: { floor, width: 4, depth: 4, thickness: 0.16, openings: [] } };
  return { ...base, kind, floor, parameters: { kind: "flat", width: 4, depth: 4, pitchDegrees: 0, eave: 0 } };
};

/** Feature-flagged draft editor. Not connected to legacy wall geometry or 3D meshes. */
export function ConceptBimElementsPanel({ model, onChange, floor }: Props) {
  const shapes = useMemo(() => projectBimPlan(model, floor), [model, floor]);
  const bounds = Math.max(8, ...shapes.map(s => Math.max(s.x + s.width, s.y + s.depth)));
  const scale = 240 / bounds;
  const add = (kind: BimElement["kind"]) => {
    try { onChange(upsertBimElement(model, makeElement(kind, floor))); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Elemento BIM inválido"); }
  };
  return (
    <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-zinc-100" aria-label="Elementos BIM experimentais">
      <p className="mb-2 text-xs font-semibold">Elementos BIM — laboratório (pavimento {floor + 1})</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="rounded border border-zinc-600 px-2 py-1 text-xs" onClick={() => add("stair")}>+ Escada</button>
        <button type="button" className="rounded border border-zinc-600 px-2 py-1 text-xs" onClick={() => add("slab")}>+ Laje</button>
        <button type="button" className="rounded border border-zinc-600 px-2 py-1 text-xs" onClick={() => add("roof")}>+ Cobertura</button>
      </div>
      <svg role="img" aria-label="Projeção em planta dos elementos BIM" viewBox="0 0 260 260" className="h-64 w-full rounded bg-zinc-950">
        {shapes.map(shape => <rect key={shape.id}
          x={10 + shape.x * scale} y={10 + shape.y * scale}
          width={shape.width * scale} height={shape.depth * scale}
          fill={shape.kind === "slab-opening" ? "#09090b" : "rgba(48,180,130,0.15)"}
          stroke={shape.kind === "slab-opening" ? "#eab308" : "#35a77d"}
          strokeWidth="1.5" />)}
      </svg>
      <ul className="mt-3 space-y-2">
        {model.elements.filter(element => (element.kind === "roof" ? element.floor : element.parameters.floor) === floor).map(element =>
          <li key={element.id} className="flex items-center justify-between gap-2 text-xs">
            <span>{element.kind === "stair" ? "Escada" : element.kind === "slab" ? "Laje" : "Cobertura"} — {element.id.slice(-8)}</span>
            <button type="button" className="rounded border border-zinc-600 px-2 py-1" onClick={() => onChange(removeBimElement(model, element.id))}>Excluir</button>
          </li>)}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-400">Planta experimental: sem malha 3D, sem orçamento e sem edição dimensional.</p>
    </section>
  );
}
