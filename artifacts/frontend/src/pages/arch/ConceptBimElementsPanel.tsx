import { useMemo } from "react";
import { projectBimPlan } from "./conceptBimPlanGeometry";
import { ConceptBimMeshPreview } from "./ConceptBimMeshPreview";
import { editBimElementNumber, removeBimElement, upsertBimElement, type BimElement, type BimModel } from "./conceptBimElementModel";

type Props = { model: BimModel; onChange(model: BimModel): void; floor: number; selectedId?: string | null; onSelect?(id: string | null): void };
const nextId = () => "bim-" + globalThis.crypto.randomUUID();
const makeElement = (kind: BimElement["kind"], floor: number): BimElement => {
  const base = { id: nextId(), x: 1, y: 1 };
  if (kind === "stair") return { ...base, kind, parameters: { floor, rise: 2.8, run: 4.5, stepCount: 16, width: 1.2 } };
  if (kind === "slab") return { ...base, kind, parameters: { floor, width: 4, depth: 4, thickness: 0.16, openings: [] } };
  return { ...base, kind, floor, parameters: { kind: "flat", width: 4, depth: 4, pitchDegrees: 0, eave: 0 } };
};

/** Feature-flagged draft editor. Not connected to legacy wall geometry or 3D meshes. */
export function ConceptBimElementsPanel({ model, onChange, floor, selectedId, onSelect }: Props) {
  const shapes = useMemo(() => projectBimPlan(model, floor), [model, floor]);
  const bounds = Math.max(8, ...shapes.map(s => Math.max(s.x + s.width, s.y + s.depth)));
  const scale = 240 / bounds;
  const add = (kind: BimElement["kind"]) => {
    try { onChange(upsertBimElement(model, makeElement(kind, floor))); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Elemento BIM inválido"); }
  };
  const changeDimension = (id: string, key: "x" | "y" | "width" | "depth" | "thickness" | "rise" | "run" | "stepCount" | "eave" | "pitchDegrees", raw: string) => {
    if (raw.trim() === "") return;
    const value = Number(raw.replace(",", "."));
    try { onChange(editBimElementNumber(model, id, key, value)); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Medida inválida"); }
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
          onClick={() => onSelect?.(shape.parentId ?? shape.id)}
          role="button"
          aria-label={`Selecionar ${shape.parentId ?? shape.id}`}
          tabIndex={0}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect?.(shape.parentId ?? shape.id); } }}
          x={10 + shape.x * scale} y={10 + shape.y * scale}
          width={shape.width * scale} height={shape.depth * scale}
          fill={shape.kind === "slab-opening" ? "#09090b" : "rgba(48,180,130,0.15)"}
          stroke={selectedId === (shape.parentId ?? shape.id) ? "#ffffff" : shape.kind === "slab-opening" ? "#eab308" : "#35a77d"}
          strokeWidth="1.5" />)}
      </svg>
      <p className="mt-3 mb-1 text-[11px] text-zinc-400">Prévia tridimensional isométrica — mesmos elementos BIM</p>
      <ConceptBimMeshPreview model={model} />
      <ul className="mt-3 space-y-2">
        {model.elements.filter(element => (element.kind === "roof" ? element.floor : element.parameters.floor) === floor).map(element =>
          <li key={element.id} className={`flex items-center justify-between gap-2 text-xs ${selectedId === element.id ? "ring-1 ring-emerald-500" : ""}`}>
            <button type="button" aria-pressed={selectedId === element.id} onClick={() => onSelect?.(element.id)} className="rounded border border-emerald-800 px-1 py-1">Selecionar</button>
            <span>{element.kind === "stair" ? "Escada" : element.kind === "slab" ? "Laje" : "Cobertura"} — {element.id.slice(-8)}</span>
            <div className="flex flex-wrap items-center gap-1">
              {([
                ["x", element.x], ["y", element.y],
                ["width", element.parameters.width],
                ...(element.kind === "stair" ? [["run", element.parameters.run], ["rise", element.parameters.rise], ["stepCount", element.parameters.stepCount]]
                  : element.kind === "slab" ? [["depth", element.parameters.depth], ["thickness", element.parameters.thickness]]
                  : [["depth", element.parameters.depth], ["eave", element.parameters.eave], ["pitchDegrees", element.parameters.pitchDegrees]])
              ] as Array<["x" | "y" | "width" | "depth" | "thickness" | "rise" | "run" | "stepCount" | "eave" | "pitchDegrees", number]>).map(([key, value]) =>
                <label key={key} className="flex items-center gap-1 text-[10px]">
                  {key}
                  <input aria-label={element.id + " " + key} className="w-14 rounded bg-zinc-800 px-1 py-1 text-zinc-100"
                    type="number" step={key === "stepCount" ? 1 : 0.01} defaultValue={value}
                    key={element.id + ":" + key + ":" + value}
                    onBlur={event => changeDimension(element.id, key, event.currentTarget.value)}
                    onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                </label>)}
              <button type="button" className="rounded border border-zinc-600 px-2 py-1" onClick={() => { onChange(removeBimElement(model, element.id)); if (selectedId === element.id) onSelect?.(null); }}>Excluir</button>
            </div>
          </li>)}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-400">Laboratório BIM: malha 3D em projeção isométrica SVG, sem integração ao WebGL principal ou orçamento.</p>
    </section>
  );
}
