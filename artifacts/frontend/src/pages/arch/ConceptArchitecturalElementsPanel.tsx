import { useState } from "react";
import { applyArchitecturalEdits, architecturalQuantities, type ArchitecturalModel, type ArchitecturalElement } from "./conceptArchitecturalModel";
import { ConceptArchitecturalPreview } from "./ConceptArchitecturalPreview";
type Props = { model: ArchitecturalModel; onChange: (model: ArchitecturalModel) => void; floor: number; lotWidth: number; lotDepth: number };
export function ConceptArchitecturalElementsPanel({ model, onChange, floor, lotWidth, lotDepth }: Props) {
  const [kind, setKind] = useState<"slab" | "stair" | "roof">("slab");
  const [selected, setSelected] = useState<string>("");
  const [x, setX] = useState(0), [y, setY] = useState(0);
  const [width, setWidth] = useState(3), [depth, setDepth] = useState(3);
  const [openSlab, setOpenSlab] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const items = [
    ...model.slabs.map(value => ({ kind: "slab" as const, value })),
    ...model.stairs.map(value => ({ kind: "stair" as const, value })),
    ...model.roofs.map(value => ({ kind: "roof" as const, value })),
  ];
  const selectedItem = items.find(item => item.value.id === selected && item.kind === kind);
  function commit(element: ArchitecturalElement) {
    const next = applyArchitecturalEdits(model, [{ action: "upsert", element }]);
    if ("error" in next) { setError(next.error); return; }
    onChange(next.value); setSelected(element.value.id); setError(null);
  }
  function save() {
    if (![x, y, width, depth, lotWidth, lotDepth].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || depth <= 0 || x + width > lotWidth + 1e-8 || y + depth > lotDepth + 1e-8) {
      setError("Informe medidas válidas dentro do terreno."); return;
    }
    const prior = items.find(item => item.value.id === selected && item.kind === kind);
    const id = prior?.value.id ?? `${kind}-${Date.now()}`;
    if (kind === "slab") {
      const old = prior?.kind === "slab" ? prior.value : null;
      commit({ kind, value: { id, floor: old?.floor ?? floor, x, y, width, depth, thickness: old?.thickness ?? 0.15, elevation: old?.elevation ?? floor * 2.96 + 0.16, voids: old?.voids ?? [] } });
    } else if (kind === "stair") {
      const old = prior?.kind === "stair" ? prior.value : null;
      commit({ kind, value: { id, floor: old?.floor ?? floor, x, y, width, openSlab, run: depth, rise: old?.rise ?? 2.8, preferredRiser: old?.preferredRiser ?? 0.175 } });
    } else {
      const old = prior?.kind === "roof" ? prior.value : null;
      commit({ kind, value: { id, x, y, width, depth, elevation: old?.elevation ?? floor * 2.96 + 2.96, pitchDegrees: old?.pitchDegrees ?? 30, overhang: old?.overhang ?? 0.3, type: old?.type ?? "gable" } });
    }
  }
  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    setKind(item.kind); setSelected(item.value.id); setX(item.value.x); setY(item.value.y); setWidth(item.value.width);
    setDepth(item.kind === "stair" ? item.value.run : item.value.depth);
    setOpenSlab(item.kind === "stair" ? item.value.openSlab !== false : true); setError(null);
  }
  function remove() {
    if (!selected) return;
    const edit = applyArchitecturalEdits(model, [{ action: "remove", kind, id: selected }]);
    if ("error" in edit) { setError(edit.error); return; }
    onChange(edit.value); setSelected(""); setError(null);
  }
  const qty = architecturalQuantities(model);
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Elementos arquitetônicos paramétricos">
    <h3 className="font-semibold text-sm">Lajes, escadas e coberturas</h3>
    <p className="text-xs text-slate-500">Edite em metros. As alterações atualizam a planta e o 3D e podem ser desfeitas.</p>
    <select aria-label="Tipo de elemento" className="w-full rounded border p-2 text-sm" value={kind} onChange={event => { setKind(event.target.value as typeof kind); setSelected(""); setOpenSlab(true); setDepth(event.target.value === "stair" ? 4.2 : 3); }}>
      <option value="slab">Laje</option><option value="stair">Escada reta</option><option value="roof">Cobertura</option>
    </select>
    <div className="grid grid-cols-2 gap-2">
      {([["x", x, setX], ["y", y, setY], ["Largura", width, setWidth], ["Profundidade / desenvolvimento", depth, setDepth]] as const).map(([label, value, setter]) =>
        <label key={label} className="text-xs">{label}<input type="number" step="0.01" value={value} onChange={event => setter(Number(event.target.value))} className="w-full rounded border p-2 text-sm" /></label>)}
    </div>
    {kind === "stair" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={openSlab} onChange={event => setOpenSlab(event.target.checked)} />Abrir automaticamente a laje do pavimento superior</label>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-2"><button type="button" onClick={save} className="rounded bg-emerald-700 px-3 py-2 text-xs text-white">{selectedItem ? "Atualizar" : "Adicionar"}</button>
      {selectedItem && <button type="button" onClick={remove} className="rounded border px-3 py-2 text-xs">Excluir</button>}</div>
    <div className="space-y-1">{items.map((item, i) => <button key={item.value.id} type="button" onClick={() => choose(i)} className="block w-full rounded border p-2 text-left text-xs">{item.kind} · {item.value.id}</button>)}</div>
    <p className="text-xs text-slate-500">Área líquida de lajes: {qty.slabNetArea.toFixed(2)} m²</p>
    <ConceptArchitecturalPreview model={model} floor={floor} width={280} height={190} />
  </section>;
}
export default ConceptArchitecturalElementsPanel;

