import { useMemo, useRef, useState } from "react";
import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalSection } from "./conceptArchitecturalSections";
export function ConceptArchitecturalDocumentation({ model }: { model: ArchitecturalModel }) {
  const [axis, setAxis] = useState<"x" | "y">("x"), [position, setPosition] = useState(1);
  const [elevation, setElevation] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const items = useMemo(() => architecturalSection(model, axis, position, elevation), [model, axis, position, elevation]);
  const points = items.flatMap(item => item.points);
  const minU = points.length ? Math.min(...points.map(p => p.u)) : 0, maxU = points.length ? Math.max(...points.map(p => p.u)) : 5;
  const minZ = points.length ? Math.min(...points.map(p => p.z), 0) : 0, maxZ = points.length ? Math.max(...points.map(p => p.z)) : 5;
  function download() {
    if (!svgRef.current) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svgRef.current)], { type: "image/svg+xml;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "vista-parametrica-arqdor.svg"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return <section aria-label="Documentação paramétrica" className="space-y-2 rounded border p-2">
    <h4 className="text-sm font-semibold">Cortes e elevações</h4>
    <p className="text-xs text-slate-500">Vista esquemática de lajes, escadas e coberturas. Paredes e esquadrias ainda não estão incluídas. Medidas em metros; exportação ajustada ao conteúdo, sem escala de impressão definida.</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">Vista<select value={elevation ? "elevation" : "section"} onChange={e => setElevation(e.target.value === "elevation")} className="w-full rounded border p-2"><option value="section">Corte</option><option value="elevation">Elevação</option></select></label>
      <label className="text-xs">Direção<select value={axis} onChange={e => setAxis(e.target.value as "x" | "y")} className="w-full rounded border p-2"><option value="x">Olhar ao longo de X</option><option value="y">Olhar ao longo de Y</option></select></label>
      {!elevation && <label className="text-xs">Posição do corte (m)<input type="number" step="0.01" value={Number.isFinite(position) ? position : ""} onChange={e => setPosition(e.target.valueAsNumber)} className="w-full rounded border p-2" /></label>}
    </div>
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`${minU - 0.5} ${-maxZ - 0.5} ${Math.max(1, maxU - minU) + 1} ${Math.max(1, maxZ - minZ) + 1}`} role="img" aria-label="Vista dos elementos paramétricos" className="w-full border bg-white">
      <title>{elevation ? "Elevação" : `Corte ${axis.toUpperCase()} = ${position} m`} · elementos paramétricos</title>
      <g fill="none" stroke="#334155" strokeWidth={0.035}>{items.map(item => item.kind === "solid" ? <polygon key={item.id} points={item.points.map(p => `${p.u},${-p.z}`).join(" ")} fill="#e2e8f0"><title>{item.id}</title></polygon> : <polyline key={item.id} points={item.points.map(p => `${p.u},${-p.z}`).join(" ")} stroke="#0f766e"><title>{item.id}</title></polyline>)}</g>
    </svg>
    {!items.length && <p className="text-xs" role="status">Nenhum elemento interceptado nesta posição.</p>}
    <button type="button" disabled={!items.length} onClick={download} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Exportar vista SVG</button>
  </section>;
}
