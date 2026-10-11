import React, {useEffect,useState} from "react";
import {FurnitureAxonometricPreview} from "./FurnitureAxonometricPreview";
import {FurnitureWebGLPreview} from "./FurnitureWebGLPreview";
import {createFurnitureSnapshot,restoreFurnitureSnapshot} from "../../shared/furniture-project-snapshot";
import type {InteriorEnvironment} from "./interior-environment";
import type {CabinetDraft} from "../../shared/parametric-cabinet-core";
import {insertCabinetDraft,repositionPlacedCabinet,removePlacedCabinet,revisePlacedCabinet,type PlacedCabinet} from "../../shared/placed-cabinet-draft";

export function FurniturePlacementPanel({environment,draft}:{environment:InteriorEnvironment;draft:CabinetDraft|null}) {
  const [items,setItems]=useState<PlacedCabinet[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [webglPreview,setWebglPreview]=useState(false);
  const [loadedRevision,setLoadedRevision]=useState<string|null>(null);
  const [savedTenantId,setSavedTenantId]=useState<string|null>(null);
  useEffect(()=>{setItems([]);setLoadedRevision(null);setSavedTenantId(null);setSelectedId(null);setMessage("");},[environment.projectId,environment.roomId]);
  const xs=environment.walls.flatMap(w=>[w.x1,w.x2]);
  const ys=environment.walls.flatMap(w=>[w.y1,w.y2]);
  const width=Math.round((Math.max(...xs)-Math.min(...xs))*1000);
  const depth=Math.round((Math.max(...ys)-Math.min(...ys))*1000);
  const ready=Number.isFinite(width)&&Number.isFinite(depth)&&width>0&&depth>0;
  const heightLimitMm=environment.walls.length?Math.round(Math.min(...environment.walls.map(w=>w.heightM))*1000):null;
  const [x,setX]=useState(100),[y,setY]=useState(100);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [edit,setEdit]=useState({widthMm:1200,heightMm:2200,depthMm:600,materialId:"MDF-18"});
  const roomItems=items.filter(i=>i.roomId===environment.roomId);
  const selected=roomItems.find(item=>item.id===selectedId);
  function add(){
    if(!draft){setMessage("Gere primeiro o armário paramétrico.");return;}
    if(!ready){setMessage("Ambiente sem medidas.");return;}

    try{
      const tenantId=savedTenantId??roomItems[0]?.tenantId??draft.parameters.tenantId;
      const projectId=environment.projectId??draft.parameters.projectId;
      const scopedDraft={...draft,parameters:{...draft.parameters,tenantId,projectId,roomId:environment.roomId},parts:draft.parts.map(p=>({...p,tenantId,projectId,parentItemId:environment.roomId}))};
      if(heightLimitMm!==null&&scopedDraft.parameters.heightMm>heightLimitMm)throw Error("Móvel acima da altura do ambiente");
      const next=insertCabinetDraft({tenantId,projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},draft:scopedDraft,xMm:x,yMm:y,id:crypto.randomUUID(),existing:roomItems});
      setItems(old=>[...old.filter(i=>i.roomId!==environment.roomId),...next]);setMessage("");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro de geometria");}
  }
  function applyEdits(){
    if(!selectedId)return;
    try{
      if(heightLimitMm!==null&&edit.heightMm>heightLimitMm)throw Error("Móvel acima da altura do ambiente");
      const next=revisePlacedCabinet({room:{id:environment.roomId,widthMm:width,depthMm:depth},items,id:selectedId,changes:edit});
      setItems(next);setMessage("Peças e dimensões atualizadas no rascunho; salve para persistir.");
    }catch(e){setMessage(e instanceof Error?e.message:"Alteração inválida");}
  }
  function move(id:string){try{setItems(old=>repositionPlacedCabinet({room:{id:environment.roomId,widthMm:width,depthMm:depth},items:old,id,xMm:x,yMm:y}));setMessage("Posição alterada no rascunho. Salve para persistir.");}catch(e){setMessage(e instanceof Error?e.message:"Posicionamento inválido");}}
  function remove(id:string){try{setItems(old=>removePlacedCabinet(old,id));setMessage("Móvel removido do rascunho. Salve para persistir.");}catch(e){setMessage(e instanceof Error?e.message:"Falha ao remover");}}
  function authHeaders(){const token=localStorage.getItem("vendorai_token");if(!token)throw Error("Sessão expirada. Faça login novamente.");return {Authorization:"Bearer "+token};}
  async function save(){
    if(!ready||!environment.projectId){setMessage("É necessário salvar o projeto e ter geometria do ambiente.");return;}
    setBusy(true);
    try{
      const snapshot=createFurnitureSnapshot({tenantId:savedTenantId??roomItems[0]?.tenantId??draft?.parameters.tenantId??"",
      projectId:environment.projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},
      revision:crypto.randomUUID(),createdAt:new Date().toISOString(),furniture:roomItems});
      const body={...snapshot,baseRevision:loadedRevision};
      const response=await fetch("/api/arqdor/projects/"+encodeURIComponent(environment.projectId)+"/furniture/"+encodeURIComponent(environment.roomId),
       {method:"PUT",headers:{"Content-Type":"application/json",...authHeaders()},credentials:"include",body:JSON.stringify(body)});
      if(response.status===409)throw Error("Conflito de revisão: carregue a versão mais recente antes de salvar.");
      if(!response.ok)throw Error("Falha no salvamento ("+response.status+")");
      const saved=await response.json();
      if(!saved.tenantId||saved.revision!==snapshot.revision)throw Error("Resposta de salvamento inválida");
      setSavedTenantId(saved.tenantId);
      setItems(old=>old.map(item=>item.roomId!==environment.roomId?item:({...item,tenantId:saved.tenantId,parameters:{...item.parameters,tenantId:saved.tenantId},parts:item.parts.map(part=>({...part,tenantId:saved.tenantId}))})));
      setLoadedRevision(snapshot.revision);
      setMessage("Mobiliário salvo no projeto.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao salvar");}
    finally{setBusy(false);}
  }
  async function load(){
    if(!environment.projectId||!ready){setMessage("Projeto ainda não identificado.");return;}
    setBusy(true);
    try{
      const response=await fetch("/api/arqdor/projects/"+encodeURIComponent(environment.projectId)+"/furniture",{headers:authHeaders(),credentials:"include"});
      if(!response.ok)throw Error("Falha no carregamento ("+response.status+")");
      const data=await response.json();
      const snapshot=data.furnitureSnapshots?.[environment.roomId];
      if(!data.tenantId)throw Error("Resposta sem identificação do tenant");
      if(!snapshot){setSavedTenantId(data.tenantId);setLoadedRevision(null);setItems(old=>old.filter(item=>item.roomId!==environment.roomId));setSelectedId(null);setMessage("Nenhum mobiliário salvo para este ambiente.");return;}
      const restored=restoreFurnitureSnapshot(snapshot,{tenantId:data.tenantId,projectId:environment.projectId,
        room:{id:environment.roomId,widthMm:width,depthMm:depth}});
      if(restored.projectId!==environment.projectId||restored.roomId!==environment.roomId)throw Error("Contexto de projeto incompatível");
      setLoadedRevision(restored.revision);
      setSavedTenantId(data.tenantId);
      setItems(old=>[...old.filter(i=>i.roomId!==environment.roomId),...restored.furniture]);
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
      {roomItems.map(i=><rect key={i.id} x={i.bounds.xMm} y={i.bounds.yMm} width={i.bounds.rotationDeg===90||i.bounds.rotationDeg===270?i.bounds.depthMm:i.bounds.widthMm} height={i.bounds.rotationDeg===90||i.bounds.rotationDeg===270?i.bounds.widthMm:i.bounds.depthMm} fill="#ddd6fe" stroke="#6d28d9" strokeWidth="10"/>)}
    </svg><div className="mt-2 space-y-2">{roomItems.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs"><span>{item.id} · {item.bounds.widthMm} × {item.bounds.depthMm} mm · {item.parts.length} peças</span><div className="flex gap-2"><button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>{setSelectedId(item.id);setX(item.bounds.xMm);setY(item.bounds.yMm);setEdit({widthMm:item.parameters.widthMm,heightMm:item.parameters.heightMm,depthMm:item.parameters.depthMm,materialId:item.parameters.materialId});}}>Selecionar</button><button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>move(item.id)}>Mover para X/Y</button><button type="button" disabled={busy} className="rounded border border-red-200 px-2 py-1 text-red-700" onClick={()=>remove(item.id)}>Remover</button></div></div>)}</div>{selected&&<div className="mt-3 rounded-lg border border-violet-200 p-3"><strong className="text-sm">Editar {selected.id}</strong><div className="mt-2 grid grid-cols-2 gap-2">{(["widthMm","heightMm","depthMm"] as const).map(k=><label key={k} className="text-xs">{k==="widthMm"?"Largura":k==="heightMm"?"Altura":"Profundidade"} (mm)<input type="number" className="w-full rounded border p-2" value={edit[k]} onChange={e=>setEdit(old=>({...old,[k]:Number(e.target.value)}))}/></label>)}<label className="text-xs">Material<input className="w-full rounded border p-2" value={edit.materialId} onChange={e=>setEdit(old=>({...old,materialId:e.target.value}))}/></label></div><button type="button" disabled={busy} onClick={applyEdits} className="mt-2 rounded bg-violet-700 px-3 py-2 text-xs text-white">Atualizar móvel e peças</button></div>}</>:<p className="text-sm">Geometria do ambiente ainda indisponível.</p>}
    <button type="button" onClick={()=>setWebglPreview(value=>!value)} className="mt-2 rounded border px-3 py-2 text-xs">{webglPreview?"Ocultar prévia WebGL":"Abrir prévia WebGL experimental"}</button>
    {webglPreview&&<FurnitureWebGLPreview items={roomItems} selectedId={selectedId} onSelect={id=>{const item=roomItems.find(i=>i.id===id);if(!item)return;setSelectedId(id);setX(item.bounds.xMm);setY(item.bounds.yMm);setEdit({widthMm:item.parameters.widthMm,heightMm:item.parameters.heightMm,depthMm:item.parameters.depthMm,materialId:item.parameters.materialId});}}/>}
    <FurnitureAxonometricPreview items={roomItems} selectedId={selectedId} onSelect={id=>{const item=roomItems.find(candidate=>candidate.id===id);if(!item)return;setSelectedId(item.id);setX(item.bounds.xMm);setY(item.bounds.yMm);setEdit({widthMm:item.parameters.widthMm,heightMm:item.parameters.heightMm,depthMm:item.parameters.depthMm,materialId:item.parameters.materialId});}}/>
    <div className="mt-2 flex gap-2"><button type="button" disabled={busy||!environment.projectId} onClick={save} className="rounded border px-3 py-2 text-xs">Salvar móveis</button><button type="button" disabled={busy||!environment.projectId} onClick={load} className="rounded border px-3 py-2 text-xs">Carregar móveis</button></div>
    {message&&<p role="alert" className="text-sm text-red-700">{message}</p>}
  </section>;
}
