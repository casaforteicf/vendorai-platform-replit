import { useState } from "react";
import { applyArchitecturalEdits, type ArchitecturalModel } from "./conceptArchitecturalModel";
import type { Slab } from "./conceptArchitecturalElements";
type Props = { model: ArchitecturalModel; slab: Slab; onChange: (model: ArchitecturalModel) => void };
export function ConceptSlabVoidsEditor({ model, slab, onChange }: Props) {
  const [index, setIndex] = useState<number | null>(null);
  const [x, setX] = useState(slab.x), [y, setY] = useState(slab.y);
  const [width, setWidth] = useState(0.5), [depth, setDepth] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const current = index === null ? undefined : slab.voids[index];
  function commit(voids: Slab["voids"]) {
    const result = applyArchitecturalEdits(model, [{ action: "upsert", element: { kind: "slab", value: { ...slab, voids } } }]);
    if ("error" in result) { setError(result.error); return; }
    onChange(result.value); setError(null); setIndex(null);
  }
  function save() {
    const hole = { x, y, width, depth };
    const voids = slab.voids.map(v => ({ ...v }));
    if (current && index !== null) voids[index] = hole;
    else voids.push(hole);
    commit(voids);
  }
  return <section aria-label="Vãos manuais da laje" className="space-y-2 rounded border p-2">
    <h4 className="text-xs font-semibold">Vãos manuais da laje</h4>
    <p className="text-xs text-slate-500">Posição na planta e medidas em metros. O vão deve ficar dentro da laje.</p>
    <div className="grid grid-cols-2 gap-2">{([
      ["X do vão", x, setX], ["Y do vão", y, setY], ["Largura do vão", width, setWidth], ["Profundidade do vão", depth, setDepth],
    ] as const).map(([label, value, setter]) => <label key={label} className="text-xs">{label}<input type="number" step="0.01" value={Number.isFinite(value) ? value : ""} onChange={event => setter(event.target.valueAsNumber)} className="w-full rounded border p-2" /></label>)}</div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-2"><button type="button" onClick={save} className="rounded border p-2 text-xs">{current ? "Atualizar vão" : "Adicionar vão"}</button>
      {current && <><button type="button" onClick={() => { setIndex(null); setError(null); }} className="rounded border p-2 text-xs">Novo vão</button>
      <button type="button" onClick={() => commit(slab.voids.filter((_, i) => i !== index))} className="rounded border p-2 text-xs">Excluir vão</button></>}</div>
    {slab.voids.map((hole, i) => <button type="button" key={i} className="block w-full rounded border p-2 text-left text-xs" onClick={() => {
      setIndex(i); setX(hole.x); setY(hole.y); setWidth(hole.width); setDepth(hole.depth); setError(null);
    }}>Vão {i + 1} · {hole.width.toFixed(2)} × {hole.depth.toFixed(2)} m</button>)}
  </section>;
}
