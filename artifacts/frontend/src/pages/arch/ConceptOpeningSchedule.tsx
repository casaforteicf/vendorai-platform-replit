import { useMemo } from "react";
import type { DocumentationWall, DocumentationOpening } from "./conceptDocumentationWalls";
import { documentationOpeningRows, documentationOpeningCsv } from "./conceptOpeningSchedule";
export function ConceptOpeningSchedule({walls,openings}:{walls:readonly DocumentationWall[];openings:readonly DocumentationOpening[]}) {
 const rows=useMemo(()=>documentationOpeningRows(walls,openings),[walls,openings]);
 function download(){const url=URL.createObjectURL(new Blob([documentationOpeningCsv(walls,openings)],{type:"text/csv;charset=utf-8"}));const a=document.createElement('a');a.href=url;a.download="quadro-esquadrias-arqdor.csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);}
 const metric=(n:number)=>Number.isFinite(n)?n.toLocaleString("pt-BR",{maximumFractionDigits:3}):"—";
 return <section aria-label="Quadro de esquadrias" className="space-y-2">
  <h4 className="text-sm font-semibold">Quadro de esquadrias</h4>
  <p className="text-xs text-slate-500">Uma linha por abertura desenhada. Dimensões padrão precisam de conferência antes do orçamento.</p>
  {rows.length?<div className="overflow-x-auto"><table className="w-full text-xs"><caption className="sr-only">Portas e janelas; medidas em metros; pavimento zero é térreo</caption><thead><tr>{["ID / parede","Tipo / pav.","L × A (m)","Peitoril (m)","Especificação","Conferência"].map(label=><th key={label} scope="col" className="p-1 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.id}-${i}`}><th scope="row" className="p-1 text-left font-normal">{r.id} · {r.wallId}</th><td>{r.type==="door"?"Porta":"Janela"} · {r.floor}</td><td>{metric(r.width)} × {metric(r.height)}</td><td>{metric(r.sill)}</td><td><details><summary>Ver especificação</summary><dl className="space-y-1 py-1"><dt>Fabricante</dt><dd>{r.manufacturer||"Não informado"}</dd><dt>Perfil</dt><dd>{r.frameProfile||"Não informado"}</dd><dt>Vidro</dt><dd>{r.glassType||"Não informado"}</dd><dt>Folhas</dt><dd>{r.leafCount??"Não informado"}</dd><dt>Tipo de abertura</dt><dd>{{hinged:"Giro",sliding:"Correr",fixed:"Fixa",tilt_turn:"Oscilobatente"}[r.openingStyle]||"Não informado"}</dd><dt>Produto vinculado</dt><dd>{r.catalogProductId||"Não vinculado"}</dd></dl></details></td><td>{r.status}</td></tr>)}</tbody></table></div>:<p className="text-xs">Nenhuma porta ou janela desenhada.</p>}
  <button type="button" disabled={!rows.length} onClick={download} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Exportar quadro de esquadrias CSV</button>
 </section>;
}
