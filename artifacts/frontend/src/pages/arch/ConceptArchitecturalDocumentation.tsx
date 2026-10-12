import { documentationWallPlan, type DocumentationWall, type DocumentationOpening } from "./conceptDocumentationWalls";
import { architecturalSheetLayout } from "./conceptArchitecturalSheet";
import { useMemo, useRef, useState } from "react";
import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalSection, architecturalDocumentationPlan } from "./conceptArchitecturalSections";
export function ConceptArchitecturalDocumentation({ model, walls = [], openings = [] }: { model: ArchitecturalModel; walls?: readonly DocumentationWall[]; openings?: readonly DocumentationOpening[] }) {
  const [axis, setAxis] = useState<"x" | "y">("x"), [position, setPosition] = useState(1);
  const [view, setView] = useState<"section" | "elevation" | "plan">("section");
  const elevation = view === "elevation", plan = view === "plan";
  const [planFloor, setPlanFloor] = useState(0);
  const [showDimensions, setShowDimensions] = useState(true);
  const [sheetScale, setSheetScale] = useState(100);
  const [sheetTitle, setSheetTitle] = useState("Pré-projeto");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const items = useMemo(() => plan ? [...architecturalDocumentationPlan(model, planFloor), ...documentationWallPlan(walls, openings, planFloor)] : architecturalSection(model, axis, position, elevation), [model, axis, position, elevation, plan, planFloor, walls, openings]);
  const points = items.flatMap(item => item.points);
  const minU = points.length ? Math.min(...points.map(p => p.u)) : 0, maxU = points.length ? Math.max(...points.map(p => p.u)) : 5;
  const minZ = points.length ? Math.min(...points.map(p => p.z)) : 0, maxZ = points.length ? Math.max(...points.map(p => p.z)) : 5;
  function download() {
    if (!svgRef.current) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgRef.current)], { type: "image/svg+xml;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "vista-parametrica-arqdor.svg"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function downloadSheet() {
    if (!svgRef.current || !items.length) return;
    const layout = architecturalSheetLayout({ minU, maxU, minZ, maxZ }, sheetScale);
    if ("error" in layout) { setSheetError(layout.error); return; }
    setSheetError(null);
    const ns = "http://www.w3.org/2000/svg";
    const sheet = document.createElementNS(ns, "svg");
    sheet.setAttribute("width", "420mm"); sheet.setAttribute("height", "297mm"); sheet.setAttribute("viewBox", "0 0 420 297");
    const add = (tag: string, attributes: Record<string, string>, text?: string) => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      if (text) node.textContent = text;
      sheet.appendChild(node);
    };
    add("rect", { width: "420", height: "297", fill: "white" });
    add("rect", { x: "10", y: "10", width: "400", height: "277", fill: "none", stroke: "#334155", "stroke-width": "0.3" });
    const drawing = svgRef.current.cloneNode(true) as SVGSVGElement;
    drawing.removeAttribute("class");
    for (const key of ["x", "y", "width", "height"] as const) drawing.setAttribute(key, String(layout.value[key]));
    sheet.appendChild(drawing);
    add("line", { x1: "10", x2: "410", y1: "257", y2: "257", stroke: "#334155", "stroke-width": "0.3" });
    add("text", { x: "15", y: "266", fill: "#334155", "font-size": "4" }, sheetTitle.slice(0, 80));
    add("text", { x: "15", y: "274", fill: "#334155", "font-size": "3" }, `${plan ? `Planta · pavimento ${planFloor}` : `${elevation ? "Elevação" : "Corte"} · direção ${axis.toUpperCase()}${elevation ? "" : ` · posição ${position.toFixed(2)} m`}`} · escala 1:${sheetScale}`);
    add("text", { x: "15", y: "282", fill: "#334155", "font-size": "2.8" }, "Arqdor · Vista esquemática de elementos paramétricos · Imprimir em tamanho real (100%)");
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(sheet)], { type: "image/svg+xml;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "prancha-parametrica-a3.svg"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <section aria-label="Documentação paramétrica" className="space-y-2 rounded border p-2">
    <h4 className="text-sm font-semibold">Plantas, cortes e elevações</h4>
    <p className="text-xs text-slate-500">Vista esquemática de lajes, escadas e coberturas. Na planta, inclui paredes desenhadas e vãos interceptados a 1,20 m. Cortes e elevações ainda não incluem paredes/esquadrias. Medidas em metros; cotas gerais medem a extensão dos elementos visíveis. Exportação sem escala de impressão definida.</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">Vista<select value={view} onChange={e => { setView(e.target.value as typeof view); setSheetError(null); }} className="w-full rounded border p-2"><option value="plan">Planta por pavimento</option><option value="section">Corte</option><option value="elevation">Elevação</option></select></label>
      {!plan && <label className="text-xs">Direção<select value={axis} onChange={e => setAxis(e.target.value as "x" | "y")} className="w-full rounded border p-2"><option value="x">Olhar ao longo de X</option><option value="y">Olhar ao longo de Y</option></select></label>}
      {plan && <label className="text-xs">Pavimento da planta<input type="number" min="0" step="1" value={Number.isFinite(planFloor) ? planFloor : ""} onChange={e => setPlanFloor(e.target.valueAsNumber)} className="w-full rounded border p-2" /></label>}
      {!plan && !elevation && <label className="text-xs">Posição do corte (m)<input type="number" step="0.01" value={Number.isFinite(position) ? position : ""} onChange={e => setPosition(e.target.valueAsNumber)} className="w-full rounded border p-2" /></label>}
    </div>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showDimensions} onChange={e => setShowDimensions(e.target.checked)} />Mostrar cotas gerais da vista</label>
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`${minU - 1.2} ${-maxZ - 0.7} ${Math.max(1, maxU - minU) + 1.9} ${Math.max(1, maxZ - minZ) + 1.9}`} role="img" aria-label="Vista dos elementos paramétricos" className="w-full border bg-white">
      <title>{plan ? `Planta · pavimento ${planFloor}` : elevation ? "Elevação" : `Corte ${axis.toUpperCase()} = ${position} m`} · elementos paramétricos</title>
      <g fill="none" stroke="#334155" strokeWidth={0.035}>{items.map(item => item.kind === "solid" ? <polygon key={item.id} points={item.points.map(p => `${p.u},${-p.z}`).join(" ")} fill="#e2e8f0"><title>{item.id}</title></polygon> : <polyline key={item.id} points={item.points.map(p => `${p.u},${-p.z}`).join(" ")} stroke="#0f766e"><title>{item.id}</title></polyline>)}</g>
      {showDimensions && points.length > 0 && <g stroke="#64748b" strokeWidth={0.02} fill="none">
        <path d={`M ${minU} ${-minZ + 0.2} V ${-minZ + 0.6} M ${maxU} ${-minZ + 0.2} V ${-minZ + 0.6} M ${minU} ${-minZ + 0.45} H ${maxU}`} />
        <text x={(minU + maxU) / 2} y={-minZ + 0.8} fill="#334155" stroke="none" fontSize={0.18} textAnchor="middle">{(maxU - minU).toFixed(2)} m</text>
        <path d={`M ${minU - 0.2} ${-minZ} H ${minU - 0.7} M ${minU - 0.2} ${-maxZ} H ${minU - 0.7} M ${minU - 0.55} ${-minZ} V ${-maxZ}`} />
        <text x={minU - 0.8} y={-(minZ + maxZ) / 2} fill="#334155" stroke="none" fontSize={0.18} textAnchor="middle" transform={`rotate(-90 ${minU - 0.8} ${-(minZ + maxZ) / 2})`}>{(maxZ - minZ).toFixed(2)} m</text>
      </g>}
    </svg>
    {!items.length && <p className="text-xs" role="status">Nenhum elemento nesta vista.</p>}
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">Título da prancha<input value={sheetTitle} maxLength={80} onChange={e => setSheetTitle(e.target.value)} className="w-full rounded border p-2" /></label>
      <label className="text-xs">Escala da prancha<select value={sheetScale} onChange={e => { setSheetScale(Number(e.target.value)); setSheetError(null); }} className="w-full rounded border p-2">{[50, 100, 200].map(scale => <option key={scale} value={scale}>1:{scale}</option>)}</select></label>
    </div>
    {sheetError && <p role="alert" className="text-xs text-red-500">{sheetError}</p>}
    <button type="button" disabled={!items.length} onClick={downloadSheet} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Exportar prancha A3 SVG</button>
    <button type="button" disabled={!items.length} onClick={download} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Exportar vista SVG</button>
  </section>;
}
