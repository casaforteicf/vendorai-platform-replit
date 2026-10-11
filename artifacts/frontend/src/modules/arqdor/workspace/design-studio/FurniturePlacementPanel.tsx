import React, {useState} from "react";
import type {InteriorEnvironment} from "./interior-environment";
import type {CabinetDraft} from "../../shared/parametric-cabinet-core";
import {insertCabinetDraft,type PlacedCabinet} from "../../shared/placed-cabinet-draft";

export function FurniturePlacementPanel({environment,draft}:{environment:InteriorEnvironment;draft:CabinetDraft|null}) {
  const [items,setItems]=useState<PlacedCabinet[]>([]);
  const [message,setMessage]=useState("");
  const xs=environment.walls.flatMap(w=>[w.x1,w.x2]);
  const ys=environment.walls.flatMap(w=>[w.y1,w.y2]);
  const width=Math.round((Math.max(...xs)-Math.min(...xs))*1000);
  const depth=Math.round((Math.max(...ys)-Math.min(...ys))*1000);
  const ready=Number.isFinite(width)&&Number.isFinite(depth)&&width>0&&depth>0;
  const [x,setX]=useState(100),[y,setY]=useState(100);
  const [w,setW]=useState(1200),[d,setD]=useState(600);
  const roomItems=items.filter(i=>i.roomId===environment.roomId);
  function add(){
    if(!draft){setMessage("Gere primeiro o armário paramétrico.");return;}
    if(!ready){setMessage("Ambiente sem medidas.");return;}

    try{
      const next=insertCabinetDraft({tenantId:draft.parameters.tenantId,projectId:draft.parameters.projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},draft,xMm:x,yMm:y,id:"preview-"+(items.length+1),existing:roomItems});
      setItems(old=>[...old.filter(i=>i.roomId!==environment.roomId),...next]);setMessage("");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro de geometria");}
  }
  return <section className="rounded-xl border bg-white p-4">
    <h3 className="font-semibold">Móveis na planta</h3>
    <p className="text-xs text-amber-700">Prévia local, sem salvamento. Colisões 2D retangulares.</p>
    {draft&&<p className="text-xs">Armário {draft.parameters.widthMm} × {draft.parameters.depthMm} mm · {draft.parts.length} tipos de peças.</p>}
    {ready?<><div className="grid grid-cols-2 gap-2">
      {([["X (mm)",x,setX],["Y (mm)",y,setY],["Largura (mm)",w,setW],["Profundidade (mm)",d,setD]] as const).map(([label,value,change])=><label key={label} className="text-xs">{label}<input type="number" className="w-full rounded border p-2" value={value} onChange={e=>change(Number(e.target.value))}/></label>)}
    </div><button type="button" disabled={!draft} onClick={add} className="mt-2 rounded bg-violet-700 px-3 py-2 text-sm text-white">Inserir na planta</button>
    <svg viewBox={"0 0 "+width+" "+depth} className="mt-3 w-full border" role="img" aria-label="Planta esquemática de móveis">
      <rect width={width} height={depth} fill="#f8fafc" stroke="#334155" strokeWidth="12"/>
      {roomItems.map(i=><rect key={i.id} x={i.bounds.xMm} y={i.bounds.yMm} width={i.bounds.widthMm} height={i.bounds.depthMm} fill="#ddd6fe" stroke="#6d28d9" strokeWidth="10"/>)}
    </svg></>:<p className="text-sm">Geometria do ambiente ainda indisponível.</p>}
    {message&&<p role="alert" className="text-sm text-red-700">{message}</p>}
  </section>;
}
