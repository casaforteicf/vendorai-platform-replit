import React, {useMemo} from "react";
import type {DxfReference,DxfPrimitive} from "../../shared/dxf-reference-import";

export type StudioDxfLayer={id:string;fileName:string;reference:DxfReference;visible:boolean};
export function isDxfReferencePayload(value:unknown):value is {kind:"arqdor-dxf-reference";fileName:string;reference:DxfReference}{
  if(!value||typeof value!=="object")return false;
  const v=value as Record<string,unknown>,r=v.reference as Record<string,unknown>|undefined;
  return v.kind==="arqdor-dxf-reference"&&typeof v.fileName==="string"&&!!r&&r.source==="DXF"&&Array.isArray(r.entities)&&r.readyForManufacturing===false;
}
function points(e:DxfPrimitive):{x:number;y:number}[]{
  if(e.kind==="line")return [{x:e.x1,y:e.y1},{x:e.x2,y:e.y2}];
  if(e.kind==="polyline")return e.points;
  const start=e.kind==="arc"?e.startDeg:0;
  const range=e.kind==="arc"?((e.endDeg-e.startDeg+360)%360||360):360;
  return Array.from({length:65},(_,i)=>{const a=(start+range*i/64)*Math.PI/180;return{x:e.cx+Math.cos(a)*e.radius,y:e.cy+Math.sin(a)*e.radius};});
}
export function DxfReferenceCanvas({layers,onRemove,onToggle}:{
  layers:readonly StudioDxfLayer[];
  onRemove:(id:string)=>void;
  onToggle:(id:string)=>void;
}){
  const visible=layers.filter(l=>l.visible);
  const view=useMemo(()=>{
    const all=visible.flatMap(l=>l.reference.entities.flatMap(points));
    if(!all.length)return{x:0,y:0,w:100,h:100};
    const xs=all.map(p=>p.x),ys=all.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y);
    return {x:x-.05*w,y:y-.05*h,w:w*1.1,h:h*1.1};
  },[layers]);
  return <section className="flex h-full min-h-[460px] flex-col gap-3 rounded-[28px] bg-slate-900 p-4 text-white">
    <div className="flex flex-wrap items-center gap-3">
      <strong className="text-sm">Referências DXF</strong>
      <span className="text-xs text-slate-300">Somente visualização 2D · não salvo no projeto</span>
    </div>
    <div className="flex flex-wrap gap-2">{layers.map(l=><div key={l.id} className="flex items-center gap-2 rounded-lg bg-slate-700 px-2 py-1 text-xs">
      <label className="flex items-center gap-1"><input type="checkbox" checked={l.visible} onChange={()=>onToggle(l.id)}/>{l.fileName}</label>
      <button type="button" aria-label={`Remover ${l.fileName}`} onClick={()=>onRemove(l.id)} className="rounded px-1 hover:bg-red-700">×</button>
    </div>)}</div>
    {visible.length===0?<p className="m-auto text-slate-300">Nenhuma referência visível.</p>:
    <svg role="img" aria-label="Geometria CAD de referência" className="min-h-0 w-full flex-1 rounded-lg bg-white" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet">
      <g transform={`translate(0 ${2*view.y+view.h}) scale(1 -1)`} fill="none" strokeWidth={Math.max(view.w,view.h)/600}>
        {visible.flatMap((l,layerIndex)=>l.reference.entities.map((entity,index)=>{
          const pts=points(entity);return <polyline key={l.id+":"+index} points={pts.map(p=>`${p.x},${p.y}`).join(" ")} stroke={["#1d4ed8","#b91c1c","#047857","#7c3aed"][layerIndex%4]} strokeLinecap="round" strokeLinejoin="round"/>;
        }))}
      </g>
    </svg>}
    <p className="text-xs text-amber-200">Escala, compatibilidade e unidades exigem conferência. Não utilizar esta pré-visualização para fabricação.</p>
  </section>;
}
