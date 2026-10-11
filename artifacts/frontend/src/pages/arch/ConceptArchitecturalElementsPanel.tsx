import { ConceptSlabVoidsEditor } from "./ConceptSlabVoidsEditor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createStraightStair, type Roof } from "./conceptArchitecturalElements";
import { applyArchitecturalEdits, architecturalQuantities, type ArchitecturalModel, type ArchitecturalElement } from "./conceptArchitecturalModel";
import { ConceptArchitecturalPreview } from "./ConceptArchitecturalPreview";
type Props = { requestedSelection?: { id: string; revision: number }; model: ArchitecturalModel; onChange: (model: ArchitecturalModel) => void; floor: number; lotWidth: number; lotDepth: number };
export function ConceptArchitecturalElementsPanel({ model, onChange, floor, lotWidth, lotDepth, requestedSelection }: Props) {
  const [kind, setKind] = useState<"slab" | "stair" | "roof">("slab");
  const [selected, setSelected] = useState<string>("");
  const [x, setX] = useState(0), [y, setY] = useState(0);
  const [width, setWidth] = useState(3), [depth, setDepth] = useState(3);
  const [openSlab, setOpenSlab] = useState(true);
  const [thicknessCm, setThicknessCm] = useState(15);
  const [elevationOverride, setElevationOverride] = useState<number | null>(null);
  const [rise, setRise] = useState(2.8), [riserCm, setRiserCm] = useState(17.5);
  const [roofType, setRoofType] = useState<Roof["type"]>("gable");
  const [pitch, setPitch] = useState(30), [overhang, setOverhang] = useState(0.3);
  const elevation = elevationOverride ?? floor * 2.96 + (kind === "roof" ? 2.96 : 0.16);
  const [error, setError] = useState<string | null>(null);
  const items = useMemo(() => [
    ...model.slabs.map(value => ({ kind: "slab" as const, value })),
    ...model.stairs.map(value => ({ kind: "stair" as const, value })),
    ...model.roofs.map(value => ({ kind: "roof" as const, value })),
  ], [model]);
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
      commit({ kind, value: { id, floor: old?.floor ?? floor, x, y, width, depth, thickness: thicknessCm / 100, elevation, voids: old?.voids ?? [] } });
    } else if (kind === "stair") {
      const old = prior?.kind === "stair" ? prior.value : null;
      commit({ kind, value: { id, floor: old?.floor ?? floor, x, y, width, openSlab, run: depth, rise, preferredRiser: riserCm / 100 } });
    } else {
      commit({ kind, value: { id, x, y, width, depth, elevation, pitchDegrees: pitch, overhang, type: roofType } });
    }
  }
  const choose = useCallback((index: number) => {
    const item = items[index];
    if (!item) return;
    setKind(item.kind); setSelected(item.value.id); setX(item.value.x); setY(item.value.y); setWidth(item.value.width);
    setDepth(item.kind === "stair" ? item.value.run : item.value.depth);
    setThicknessCm(item.kind === "slab" ? item.value.thickness * 100 : 15);
    setElevationOverride(item.kind === "stair" ? null : item.value.elevation);
    setRise(item.kind === "stair" ? item.value.rise : 2.8);
    setRiserCm(item.kind === "stair" ? (item.value.preferredRiser ?? 0.175) * 100 : 17.5);
    setRoofType(item.kind === "roof" ? item.value.type : "gable");
    setPitch(item.kind === "roof" ? item.value.pitchDegrees : 30);
    setOverhang(item.kind === "roof" ? item.value.overhang : 0.3);
    setOpenSlab(item.kind === "stair" ? item.value.openSlab !== false : true); setError(null);
  }, [items]);
  const appliedSelection = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedSelection) return;
    const key = JSON.stringify(requestedSelection);
    if (appliedSelection.current === key) return;
    const index = items.findIndex(item => item.value.id === requestedSelection.id);
    if (index < 0) return;
    appliedSelection.current = key;
    choose(index);
  }, [requestedSelection, items, choose]);

  function remove() {
    if (!selected) return;
    const edit = applyArchitecturalEdits(model, [{ action: "remove", kind, id: selected }]);
    if ("error" in edit) { setError(edit.error); return; }
    onChange(edit.value); setSelected(""); setError(null);
  }
  const qty = architecturalQuantities(model);
  function startNew(nextKind = kind) {
    setKind(nextKind); setSelected(""); setError(null); setX(0); setY(0); setWidth(3);
    setDepth(nextKind === "stair" ? 4.2 : 3); setOpenSlab(true);
    setThicknessCm(15); setElevationOverride(null); setRise(2.8); setRiserCm(17.5);
    setRoofType("gable"); setPitch(30); setOverhang(0.3);
  }
  const dimensions = [
    ["x", x, setX], ["y", y, setY], ["Largura", width, setWidth], ["Profundidade / desenvolvimento", depth, setDepth],
    ...(kind === "slab" ? [["Espessura (cm)", thicknessCm, setThicknessCm], ["Cota superior (m)", elevation, setElevationOverride]] as const : []),
    ...(kind === "stair" ? [["Desnível (m)", rise, setRise], ["Espelho preferencial (cm)", riserCm, setRiserCm]] as const : []),
    ...(kind === "roof" ? [["Cota do beiral (m)", elevation, setElevationOverride], ["Beiral (m)", overhang, setOverhang]] as const : []),
  ] as const;
  const stairGeometry = kind === "stair" ? createStraightStair({ id: selected || "preview", floor, x, y, width, run: depth, rise, preferredRiser: riserCm / 100 }) : null;
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Elementos arquitetônicos paramétricos">
    <h3 className="font-semibold text-sm">Lajes, escadas e coberturas</h3>
    <p className="text-xs text-slate-500">Edite em metros. As alterações atualizam a planta e o 3D e podem ser desfeitas.</p>
    <select aria-label="Tipo de elemento" className="w-full rounded border p-2 text-sm" value={kind} onChange={event => startNew(event.target.value as typeof kind)}>
      <option value="slab">Laje</option><option value="stair">Escada reta</option><option value="roof">Cobertura</option>
    </select>
    <div className="grid grid-cols-2 gap-2">
      {dimensions.map(([label, value, setter]) =>
        <label key={label} className="text-xs">{label}<input type="number" step="0.01" value={Number.isFinite(value) ? value : ""} onChange={event => setter(event.target.valueAsNumber)} className="w-full rounded border p-2 text-sm" /></label>)}
    </div>
    {kind === "roof" && <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">Tipo de cobertura<select className="w-full rounded border p-2 text-sm" value={roofType} onChange={event => {
        const type = event.target.value as Roof["type"]; setRoofType(type); setPitch(type === "flat" ? 0 : Number.isFinite(pitch) && pitch > 0 ? pitch : 30);
      }}><option value="flat">Plana</option><option value="mono">Uma água</option><option value="gable">Duas águas</option></select></label>
      <label className="text-xs">Inclinação (°)<input type="number" step="1" min="0" max="60" disabled={roofType === "flat"} value={Number.isFinite(pitch) ? pitch : ""} onChange={event => setPitch(event.target.valueAsNumber)} className="w-full rounded border p-2 text-sm" /></label>
    </div>}
    {stairGeometry && "value" in stairGeometry && <p className="text-xs text-slate-600">{stairGeometry.value.steps} espelhos · espelho {(stairGeometry.value.riser * 100).toFixed(1)} cm · piso {(stairGeometry.value.tread * 100).toFixed(1)} cm</p>}
    {kind === "stair" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={openSlab} onChange={event => setOpenSlab(event.target.checked)} />Abrir automaticamente a laje do pavimento superior</label>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-2"><button type="button" onClick={save} className="rounded bg-emerald-700 px-3 py-2 text-xs text-white">{selectedItem ? "Atualizar" : "Adicionar"}</button>
      {selectedItem && <button type="button" onClick={() => startNew()} className="rounded border px-3 py-2 text-xs">Novo elemento</button>}
      {selectedItem && <button type="button" onClick={remove} className="rounded border px-3 py-2 text-xs">Excluir</button>}</div>
    <div className="space-y-1">{items.map((item, i) => <button key={item.value.id} type="button" onClick={() => choose(i)} className="block w-full rounded border p-2 text-left text-xs">{item.kind} · {item.value.id}</button>)}</div>
    {selectedItem?.kind === "slab" && <ConceptSlabVoidsEditor key={selectedItem.value.id} model={model} slab={selectedItem.value} onChange={onChange} />}
    <p className="text-xs text-slate-500">Área líquida de lajes: {qty.slabNetArea.toFixed(2)} m²</p>
    <ConceptArchitecturalPreview model={model} floor={floor} width={280} height={190} />
  </section>;
}
export default ConceptArchitecturalElementsPanel;

