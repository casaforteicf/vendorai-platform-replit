import React, {useState} from "react";
import {createFurnitureSnapshot} from "../../shared/furniture-project-snapshot";
import type {InteriorEnvironment} from "./interior-environment";
import type {CabinetDraft} from "../../shared/parametric-cabinet-core";
import {insertCabinetDraft,type PlacedCabinet} from "../../shared/placed-cabinet-draft";

export function FurniturePlacementPanel({environment,draft}:{environment:InteriorEnvironment;draft:CabinetDraft|null}) {
  const [items,setItems]=useState<PlacedCabinet[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [loadedRevision,setLoadedRevision]=useState<string|null>(null);
  const xs=environment.walls.flatMap(w=>[w.x1,w.x2]);
  const ys=environment.walls.flatMap(w=>[w.y1,w.y2]);
  const width=Math.round((Math.max(...xs)-Math.min(...xs))*1000);
  const depth=Math.round((Math.max(...ys)-Math.min(...ys))*1000);
  const ready=Number.isFinite(width)&&Number.isFinite(depth)&&width>0&&depth>0;
  const [x,setX]=useState(100),[y,setY]=useState(100);
  const roomItems=items.filter(i=>i.roomId===environment.roomId);
  function add(){
    if(!draft){setMessage("Gere primeiro o armário paramétrico.");return;}
    if(!ready){setMessage("Ambiente sem medidas.");return;}

    try{
      const next=insertCabinetDraft({tenantId:draft.parameters.tenantId,projectId:draft.parameters.projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},draft,xMm:x,yMm:y,id:"preview-"+(items.length+1),existing:roomItems});
      setItems(old=>[...old.filter(i=>i.roomId!==environment.roomId),...next]);setMessage("");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro de geometria");}
  }
  async function save(){
    if(!ready||!environment.projectId){setMessage("É necessário salvar o projeto e ter geometria do ambiente.");return;}
    setBusy(true);
    try{
      const snapshot=createFurnitureSnapshot({tenantId:roomItems[0]?.tenantId??draft?.parameters.tenantId??"",
      projectId:environment.projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},
      revision:"R-"+Date.now().toString(36),createdAt:new Date().toISOString(),furniture:roomItems});
      const body={...snapshot,baseRevision:loadedRevision};
      const response=await fetch("/api/arqdor/projects/"+encodeURIComponent(environment.projectId)+"/furniture/"+encodeURIComponent(environment.roomId),
       {method:"PUT",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(body)});
      if(!response.ok)throw Error("Falha no salvamento ("+response.status+")");
      setLoadedRevision(snapshot.revision);
      setMessage("Mobiliário salvo no projeto.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao salvar");}
    finally{setBusy(false);}
  }
  async function load(){
    if(!environment.projectId||!ready){setMessage("Projeto ainda não identificado.");return;}
    setBusy(true);
    try{
      const response=await fetch("/api/arqdor/projects/"+encodeURIComponent(environment.projectId)+"/furniture",{credentials:"include"});
      if(!response.ok)throw Error("Falha no carregamento ("+response.status+")");
      const data=await response.json();
      const snapshot=data.furnitureSnapshots?.[environment.roomId];
      if(!snapshot){setMessage("Nenhum mobiliário salvo para este ambiente.");return;}
      const restored=createFurnitureSnapshot({tenantId:snapshot.tenantId,projectId:snapshot.projectId,
        room:{id:environment.roomId,widthMm:width,depthMm:depth},revision:snapshot.revision,
        createdAt:snapshot.createdAt,furniture:snapshot.furniture});
      if(restored.projectId!==environment.projectId||restored.roomId!==environment.roomId)throw Error("Contexto de projeto incompatível");
      setLoadedRevision(restored.revision);
      setItems(old=>[...old.filter(i=>i.roomId!==environment.roomId),...restored.furniture.map(item=>({...item,tenantId:"local-preview",parameters:{...item.parameters,tenantId:"local-preview"},parts:item.parts.map(part=>({...part,tenantId:"local-preview"}))}))]);
      setMessage("Mobiliário recuperado.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar");}
    finally{setBusy(false);}
  }
  return <section className="rounded-xl border bg-white p-4">
    <h3 className="font-semibold">Móveis na planta</h3>
    <p className="text-xs text-amber-700">Prévia 2D; pode salvar no projeto existente. Validação de engenharia pendente.</p>
    {draft&&<p className="text-xs">Armário {draft.parameters.widthMm} × {draft.parameters.depthMm} mm · {draft.parts.length} tipos de peças.</p>}
    {ready?<><div className="grid grid-cols-2 gap-2">
      {([["X (mm)",x,setX],["Y (mm)",y,setY]] as const).map(([label,value,change])=><label key={label} className="text-xs">{label}<input type="number" className="w-full rounded border p-2" value={value} onChange={e=>change(Number(e.target.value))}/></label>)}
    </div><button type="button" disabled={!draft} onClick={add} className="mt-2 rounded bg-violet-700 px-3 py-2 text-sm text-white">Inserir na planta</button>
    <svg viewBox={"0 0 "+width+" "+depth} className="mt-3 w-full border" role="img" aria-label="Planta esquemática de móveis">
      <rect width={width} height={depth} fill="#f8fafc" stroke="#334155" strokeWidth="12"/>
      {roomItems.map(i=><rect key={i.id} x={i.bounds.xMm} y={i.bounds.yMm} width={i.bounds.widthMm} height={i.bounds.depthMm} fill="#ddd6fe" stroke="#6d28d9" strokeWidth="10"/>)}
    </svg></>:<p className="text-sm">Geometria do ambiente ainda indisponível.</p>}
    <div className="mt-2 flex gap-2"><button type="button" disabled={busy||!environment.projectId} onClick={save} className="rounded border px-3 py-2 text-xs">Salvar móveis</button><button type="button" disabled={busy||!environment.projectId} onClick={load} className="rounded border px-3 py-2 text-xs">Carregar móveis</button></div>
    {message&&<p role="alert" className="text-sm text-red-700">{message}</p>}
  </section>;
}
