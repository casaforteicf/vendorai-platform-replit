import React,{useMemo,useState} from "react";
import type {InteriorEnvironment} from "./interior-environment";
import {generateCabinetDraft, type CabinetDraft} from "../../shared/parametric-cabinet-core";
/** Local proof-of-concept only. No server save, stock reservation or manufacture approval. */
export function CabinetDraftPanel({environment,onDraft}:{environment:InteriorEnvironment;onDraft?:(draft:CabinetDraft)=>void}){
 const [widthMm,setWidth]=useState(1200),[heightMm,setHeight]=useState(2200),[depthMm,setDepth]=useState(600);
 const [shelfCount,setShelves]=useState(3),[doorCount,setDoors]=useState(2),[materialId,setMaterial]=useState("MDF-18"),[backMaterialId,setBackMaterial]=useState("MDF-6");
 const [enabled,setEnabled]=useState(false);
 const result=useMemo(()=>{
  if(!enabled)return null;
  try{return {draft:generateCabinetDraft({tenantId:"local-preview",projectId:environment.projectId||"unsaved-project",roomId:environment.roomId,
   furnitureId:"cabinet-preview",widthMm,heightMm,depthMm,panelThicknessMm:18,shelfCount,doorCount,materialId,backThicknessMm:6,backMaterialId}),error:null};}
  catch(e){return {draft:null,error:e instanceof Error?e.message:"Dados inválidos"};}
 },[environment.projectId,environment.roomId,widthMm,heightMm,depthMm,shelfCount,doorCount,materialId,backMaterialId,enabled]);
 const numeric=(label:string,value:number,onChange:(n:number)=>void,min:number,step=1)=><label className="block text-xs text-slate-700">{label}<input className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-sm" type="number" min={min} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
 return <section className="rounded-2xl border border-violet-200 bg-white p-4" aria-label="Modelar armário paramétrico">
  <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Armário paramétrico</h3><span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">Prévia local · sem salvamento</span></div>
  <div className="grid grid-cols-2 gap-3">
   {numeric("Largura (mm)",widthMm,setWidth,100)}{numeric("Altura (mm)",heightMm,setHeight,100)}
   {numeric("Profundidade (mm)",depthMm,setDepth,100)}
   {numeric("Prateleiras",shelfCount,setShelves,0)}
   {numeric("Portas",doorCount,setDoors,0)}
   <label className="block text-xs text-slate-700">Material principal<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={materialId} onChange={e=>setMaterial(e.target.value)}/></label>
   <label className="block text-xs text-slate-700">Material do fundo<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={backMaterialId} onChange={e=>setBackMaterial(e.target.value)}/></label>
  </div>
  <button type="button" onClick={()=>{setEnabled(true);if(result?.draft)onDraft?.(result.draft);else {try{onDraft?.(generateCabinetDraft({tenantId:"local-preview",projectId:environment.projectId||"unsaved-project",roomId:environment.roomId,furnitureId:"cabinet-preview",widthMm,heightMm,depthMm,panelThicknessMm:18,shelfCount,doorCount,materialId,backThicknessMm:6,backMaterialId}));}catch{}}}} className="mt-3 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Gerar prévia das peças</button>
  {result?.error&&<p role="alert" className="mt-3 text-sm text-red-700">{result.error}</p>}
  {result?.draft&&<div className="mt-3 space-y-2">
   <svg viewBox="0 0 360 230" role="img" aria-label="Elevação frontal esquemática do armário" className="h-48 w-full rounded-xl bg-slate-50">
    <rect x="90" y="12" width="180" height="205" fill="#ede9fe" stroke="#6d28d9" strokeWidth="3"/>
    {Array.from({length:shelfCount},(_,i)=><line key={i} x1="95" x2="265" y1={16+(i+1)*195/(shelfCount+1)} y2={16+(i+1)*195/(shelfCount+1)} stroke="#a78bfa" strokeWidth="2"/>)}
    {Array.from({length:Math.max(0,doorCount-1)},(_,i)=><line key={i} x1={90+(i+1)*180/doorCount} x2={90+(i+1)*180/doorCount} y1="12" y2="217" stroke="#6d28d9"/> )}
   </svg>
   <p className="text-xs text-slate-600">Elevação esquemática sem ferragens, instalação, juntas ou tolerâncias.</p>
   <div className="max-h-48 overflow-y-auto rounded-lg border"><table className="w-full text-left text-xs"><thead><tr className="bg-slate-50"><th className="p-2">Peça</th><th className="p-2">Qtd.</th><th className="p-2">Medidas (mm)</th></tr></thead><tbody>{result.draft.parts.map(p=><tr key={p.id} className="border-t"><td className="p-2">{p.name}</td><td className="p-2">{p.quantity}</td><td className="p-2">{p.widthMm} × {p.lengthMm}</td></tr>)}</tbody></table></div>
  </div>}
 </section>;
}
