import React,{useMemo,useState} from "react";
import type {PlacedCabinet} from "../../shared/placed-cabinet-draft";
import {buildCabinet3DBoxes,projectAxonometric} from "../../shared/furniture-preview-3d";
type P={x:number;y:number};
export function FurnitureAxonometricPreview({items,selectedId,onSelect}:{items:readonly PlacedCabinet[];selectedId?:string|null;onSelect?:(id:string)=>void}){
 const [zoom,setZoom]=useState(1);
 const scene=useMemo(()=>{
  const boxes=buildCabinet3DBoxes(items);
  const shapes=boxes.map(b=>{
   const point=(x:number,y:number,z:number)=>projectAxonometric(x,y,z);
   const a=point(b.xMm,b.yMm,0),b0=point(b.xMm+b.widthMm,b.yMm,0),c=point(b.xMm+b.widthMm,b.yMm+b.depthMm,0),d=point(b.xMm,b.yMm+b.depthMm,0);
   const e=point(b.xMm,b.yMm,b.heightMm),f=point(b.xMm+b.widthMm,b.yMm,b.heightMm),g=point(b.xMm+b.widthMm,b.yMm+b.depthMm,b.heightMm),h=point(b.xMm,b.yMm+b.depthMm,b.heightMm);
   return {id:b.id,faces:[[e,f,g,h],[b0,c,g,f],[d,c,g,h]] as P[][],points:[a,b0,c,d,e,f,g,h]};
  });
  const pts=shapes.flatMap(s=>s.points);
  const minX=Math.min(0,...pts.map(p=>p.x)),maxX=Math.max(100,...pts.map(p=>p.x));
  const minY=Math.min(0,...pts.map(p=>p.y)),maxY=Math.max(100,...pts.map(p=>p.y));
  const pad=Math.max(150,Math.max(maxX-minX,maxY-minY)*.08);
  return {shapes,frame:{x:minX-pad,y:minY-pad,width:maxX-minX+2*pad,height:maxY-minY+2*pad}};
 },[items]);
 const f=scene.frame,cx=f.x+f.width/2,cy=f.y+f.height/2;
 const view=[cx-f.width/(2*zoom),cy-f.height/(2*zoom),f.width/zoom,f.height/zoom].join(" ");
 const polygon=(pts:P[])=>pts.map(p=>p.x+","+p.y).join(" ");
 return <section className="rounded-xl border bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Vista 3D esquemática</h4><div className="flex gap-1"><button type="button" onClick={()=>setZoom(z=>Math.max(.5,z/1.25))} aria-label="Diminuir zoom" className="rounded border px-2">−</button><button type="button" onClick={()=>setZoom(1)} className="rounded border px-2 text-xs">Enquadrar</button><button type="button" onClick={()=>setZoom(z=>Math.min(6,z*1.25))} aria-label="Aumentar zoom" className="rounded border px-2">+</button></div></div><p className="text-xs text-amber-700">Visualização SVG esquemática, não substitui o motor BIM 3D.</p><svg viewBox={view} className="mt-2 w-full rounded bg-slate-50" style={{height:260}} role="img" aria-label="Vista axonométrica com seleção dos móveis">{scene.shapes.map(s=><g key={s.id} onClick={()=>onSelect?.(s.id)} className={onSelect?"cursor-pointer":""} stroke={s.id===selectedId?"#7c3aed":"#475569"} strokeWidth={s.id===selectedId?18:8} strokeLinejoin="round">{s.faces.map((face,i)=><polygon key={i} points={polygon(face)} fill={["#ddd6fe","#a5b4fc","#c4b5fd"][i]}/>)}<title>{s.id}</title></g>)}</svg><p className="mt-1 text-xs text-slate-500">{scene.shapes.length} móveis · clique no móvel para selecionar</p></section>;
}
