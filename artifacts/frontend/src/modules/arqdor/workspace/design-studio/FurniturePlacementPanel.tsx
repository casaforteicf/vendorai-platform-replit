import React, {useEffect,useRef,useState} from "react";
import {FurnitureAxonometricPreview} from "./FurnitureAxonometricPreview";
import {FurnitureWebGLPreview} from "./FurnitureWebGLPreview";
import {findFurnitureObstacleClashes} from "../../shared/furniture-obstacle-clashes";
import {createFurnitureSnapshot,restoreFurnitureSnapshot} from "../../shared/furniture-project-snapshot";
import type {InteriorEnvironment} from "./interior-environment";
import {localRoomPolygon,furnitureInsidePolygon} from "../../shared/furniture-room-polygon";
import type {CabinetDraft} from "../../shared/parametric-cabinet-core";
import {insertCabinetDraft,repositionPlacedCabinet,removePlacedCabinet,revisePlacedCabinet,type PlacedCabinet} from "../../shared/placed-cabinet-draft";

export function FurniturePlacementPanel({environment,draft}:{environment:InteriorEnvironment;draft:CabinetDraft|null}) {
  const [items,setItems]=useState<PlacedCabinet[]>([]);
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [webglPreview,setWebglPreview]=useState(false);
  const [loadedRevision,setLoadedRevision]=useState<string|null>(null);
  const [savedTenantId,setSavedTenantId]=useState<string|null>(null);
  const [dirty,setDirty]=useState(false);
  const [conflicted,setConflicted]=useState(false);
  const dirtyRef=useRef(false);
  function markDirty(){dirtyRef.current=true;setDirty(true);}
  function markClean(){dirtyRef.current=false;setDirty(false);setConflicted(false);}
  useEffect(()=>{setItems([]);setLoadedRevision(null);setSavedTenantId(null);setSelectedId(null);setMessage("");markClean();},[environment.projectId,environment.roomId]);
  const localGeometry=localRoomPolygon(environment.walls.map(w=>({a:{x:Math.round(w.x1*1000),y:Math.round(w.y1*1000)},b:{x:Math.round(w.x2*1000),y:Math.round(w.y2*1000)}})));
  const polygon=localGeometry?.polygon??null;
  const width=localGeometry?.widthMm??0;
  const depth=localGeometry?.depthMm??0;
  const ready=!!localGeometry&&Number.isFinite(width)&&Number.isFinite(depth)&&width>0&&depth>0;
  const heightLimitMm=environment.walls.length?Math.round(Math.min(...environment.walls.map(w=>w.heightM))*1000):null;
  const [x,setX]=useState(100),[y,setY]=useState(100);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [edit,setEdit]=useState({widthMm:1200,heightMm:2200,depthMm:600,materialId:"MDF-18"});
  const roomItems=items.filter(i=>i.roomId===environment.roomId);
  const selected=roomItems.find(item=>item.id===selectedId);
  // Load the authoritative tenant and room revision before allowing edits or saves.
  useEffect(()=>{
    if(!environment.projectId||!ready)return;
    let cancelled=false;
    setBusy(true);
    (async()=>{
      try{
        const token=localStorage.getItem("vendorai_token");
        if(!token)throw Error("Sessão expirada. Faça login novamente.");
        const response=await fetch("/api/arqdor/projects/"+encodeURIComponent(environment.projectId!)+"/furniture",{headers:{Authorization:"Bearer "+token},credentials:"include"});
        if(!response.ok)throw Error("Falha ao abrir mobiliário ("+response.status+")");
        const data=await response.json();
        if(cancelled)return;
        if(typeof data.tenantId!=="string"||!data.tenantId)throw Error("Tenant ausente");
        const snapshot=data.furnitureSnapshots?.[environment.roomId];
        const restored=snapshot?restoreFurnitureSnapshot(snapshot,{tenantId:data.tenantId,projectId:environment.projectId!,room:{id:environment.roomId,widthMm:width,depthMm:depth}}):null;
        if(cancelled)return;
        (restored?.furniture??[]).forEach(checkObstacles);
        setSavedTenantId(data.tenantId);
        setLoadedRevision(restored?.revision??null);
        if(dirtyRef.current){setConflicted(true);setMessage("Alterações locais detectadas durante o carregamento; não serão sobrescritas.");return;}
        setItems(restored?.furniture??[]);
        setSelectedId(null);
        markClean();setMessage(restored?"Mobiliário carregado automaticamente.":"Ambiente pronto para inserir móveis.");
      }catch(e){if(!cancelled)setMessage(e instanceof Error?e.message:"Falha ao abrir mobiliário");}
      finally{if(!cancelled)setBusy(false);}
    })();
    return ()=>{cancelled=true;};
  },[environment.projectId,environment.roomId,width,depth,ready]);

  function checkObstacles(item:PlacedCabinet){if(!polygon||!furnitureInsidePolygon(item.bounds,polygon))throw Error("Móvel fora do contorno real do ambiente");const collisions=findFurnitureObstacleClashes(item.bounds,environment.obstacles??[]);if(collisions.length)throw Error("Interferência com obstáculo: "+collisions.join(", "));}
  function add(){
    if(!draft){setMessage("Gere primeiro o armário paramétrico.");return;}
    if(!ready){setMessage("Ambiente sem medidas.");return;}
    if(environment.projectId&&!savedTenantId){setMessage("Aguarde o carregamento do ambiente antes de editar.");return;}

    try{
      const tenantId=savedTenantId??roomItems[0]?.tenantId??draft.parameters.tenantId;
      const projectId=environment.projectId??draft.parameters.projectId;
      const scopedDraft={...draft,parameters:{...draft.parameters,tenantId,projectId,roomId:environment.roomId},parts:draft.parts.map(p=>({...p,tenantId,projectId,parentItemId:environment.roomId}))};
      if(heightLimitMm!==null&&scopedDraft.parameters.heightMm>heightLimitMm)throw Error("Móvel acima da altura do ambiente");
      const next=insertCabinetDraft({tenantId,projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},draft:scopedDraft,xMm:x,yMm:y,id:crypto.randomUUID(),existing:roomItems});
      next.forEach(checkObstacles);
      setItems(old=>[...old.filter(i=>i.roomId!==environment.roomId),...next]);markDirty();setMessage("");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro de geometria");}
  }
  function applyEdits(){
    if(!selectedId)return;
    try{
      if(heightLimitMm!==null&&edit.heightMm>heightLimitMm)throw Error("Móvel acima da altura do ambiente");
      const next=revisePlacedCabinet({room:{id:environment.roomId,widthMm:width,depthMm:depth},items,id:selectedId,changes:edit});
      next.forEach(checkObstacles);
      setItems(next);markDirty();setMessage("Peças e dimensões atualizadas no rascunho; salve para persistir.");
    }catch(e){setMessage(e instanceof Error?e.message:"Alteração inválida");}
  }
  function move(id:string){try{const next=repositionPlacedCabinet({room:{id:environment.roomId,widthMm:width,depthMm:depth},items,id,xMm:x,yMm:y});next.forEach(checkObstacles);setItems(next);markDirty();setMessage("Posição alterada no rascunho. Salve para persistir.");}catch(e){setMessage(e instanceof Error?e.message:"Posicionamento inválido");}}
  function remove(id:string){try{setItems(old=>removePlacedCabinet(old,id));if(selectedId===id)setSelectedId(null);markDirty();setMessage("Móvel removido do rascunho. Salve para persistir.");}catch(e){setMessage(e instanceof Error?e.message:"Falha ao remover");}}
  function authHeaders(){const token=localStorage.getItem("vendorai_token");if(!token)throw Error("Sessão expirada. Faça login novamente.");return {Authorization:"Bearer "+token};}
  async function save(){
    if(!ready||!environment.projectId){setMessage("É necessário salvar o projeto e ter geometria do ambiente.");return;}
    if(!savedTenantId){setMessage("O projeto ainda não foi carregado ou não está autorizado.");return;}
    setBusy(true);
    try{
      roomItems.forEach(checkObstacles);
      const scopedItems=roomItems.map(item=>({...item,tenantId:savedTenantId,parameters:{...item.parameters,tenantId:savedTenantId},parts:item.parts.map(part=>({...part,tenantId:savedTenantId}))}));
      const snapshot=createFurnitureSnapshot({tenantId:savedTenantId,
      projectId:environment.projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},
      revision:crypto.randomUUID(),createdAt:new Date().toISOString(),furniture:scopedItems});
      const body={...snapshot,baseRevision:loadedRevision};
      const response=await fetch("/api/arqdor/projects/"+encodeURIComponent(environment.projectId)+"/furniture/"+encodeURIComponent(environment.roomId),
       {method:"PUT",headers:{"Content-Type":"application/json",...authHeaders()},credentials:"include",body:JSON.stringify(body)});
      if(response.status===409){setConflicted(true);throw Error("Conflito de revisão: outra aba alterou o ambiente. Suas alterações locais foram preservadas; exporte-as antes de recarregar.");}
      if(!response.ok)throw Error("Falha no salvamento ("+response.status+")");
      const saved=await response.json();
      if(!saved.tenantId||saved.revision!==snapshot.revision)throw Error("Resposta de salvamento inválida");
      setSavedTenantId(saved.tenantId);
      setItems(old=>old.map(item=>item.roomId!==environment.roomId?item:({...item,tenantId:saved.tenantId,parameters:{...item.parameters,tenantId:saved.tenantId},parts:item.parts.map(part=>({...part,tenantId:saved.tenantId}))})));
      setLoadedRevision(snapshot.revision);
      markClean();setMessage("Mobiliário salvo no projeto.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao salvar");}
    finally{setBusy(false);}
  }
  async function load(){
    if(dirtyRef.current&&!window.confirm("Há alterações locais não salvas. Recarregar descartará essas alterações. Continuar?"))return;
    if(!environment.projectId||!ready){setMessage("Projeto ainda não identificado.");return;}
    setBusy(true);
    try{
      const response=await fetch("/api/arqdor/projects/"+encodeURIComponent(environment.projectId)+"/furniture",{headers:authHeaders(),credentials:"include"});
      if(!response.ok)throw Error("Falha no carregamento ("+response.status+")");
      const data=await response.json();
      const snapshot=data.furnitureSnapshots?.[environment.roomId];
      if(!data.tenantId)throw Error("Resposta sem identificação do tenant");
      if(!snapshot){setSavedTenantId(data.tenantId);setLoadedRevision(null);setItems(old=>old.filter(item=>item.roomId!==environment.roomId));setSelectedId(null);markClean();setMessage("Nenhum mobiliário salvo para este ambiente.");return;}
      const restored=restoreFurnitureSnapshot(snapshot,{tenantId:data.tenantId,projectId:environment.projectId,
        room:{id:environment.roomId,widthMm:width,depthMm:depth}});
      if(restored.projectId!==environment.projectId||restored.roomId!==environment.roomId)throw Error("Contexto de projeto incompatível");
      restored.furniture.forEach(checkObstacles);
      setLoadedRevision(restored.revision);
      setSavedTenantId(data.tenantId);
      setItems(old=>[...old.filter(i=>i.roomId!==environment.roomId),...restored.furniture]);
      markClean();setMessage("Mobiliário recuperado.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar");}
    finally{setBusy(false);}
  }
  function exportDraft(){const file=new Blob([JSON.stringify({projectId:environment.projectId,roomId:environment.roomId,baseRevision:loadedRevision,furniture:roomItems},null,2)],{type:"application/json"});const url=URL.createObjectURL(file);const link=document.createElement("a");link.href=url;link.download="arqdor-mobiliario-rascunho.json";link.click();URL.revokeObjectURL(url);}
  async function importDraft(file:File|undefined){
    if(!file)return;
    if(!savedTenantId||!environment.projectId||!ready){setMessage("Abra primeiro um projeto autorizado.");return;}
    try{
      if(file.size>1500000)throw Error("Arquivo excede 1,5 MB");
      const parsed:unknown=JSON.parse(await file.text());
      if(!parsed||typeof parsed!=="object")throw Error("Formato JSON inválido");
      const data=parsed as Record<string,unknown>;
      if(data.projectId!==environment.projectId||data.roomId!==environment.roomId)throw Error("Rascunho pertence a outro projeto ou ambiente");
      if(!Array.isArray(data.furniture))throw Error("Lista de móveis inválida");
      if(data.baseRevision!==loadedRevision)throw Error("Revisão diferente: carregue o projeto correto e faça a reconciliação manual antes de importar");
      const furniture=data.furniture as PlacedCabinet[];
      const normalized=furniture.map(item=>({...item,tenantId:savedTenantId,parameters:{...item.parameters,tenantId:savedTenantId},parts:item.parts.map(part=>({...part,tenantId:savedTenantId}))}));
      const validated=createFurnitureSnapshot({tenantId:savedTenantId,projectId:environment.projectId,room:{id:environment.roomId,widthMm:width,depthMm:depth},revision:crypto.randomUUID(),createdAt:new Date().toISOString(),furniture:normalized});
      validated.furniture.forEach(checkObstacles);
      if(!window.confirm("Substituir somente o rascunho local pelos "+validated.furniture.length+" móveis importados? Nenhum dado será salvo automaticamente."))return;
      setItems(validated.furniture);setSelectedId(null);markDirty();setMessage("Rascunho importado localmente. Revise e salve para persistir.");
    }catch(e){setMessage(e instanceof Error?e.message:"Não foi possível importar o rascunho");}
  }
  return <section className="rounded-xl border bg-white p-4">
    <h3 className="font-semibold">Móveis na planta</h3>{dirty&&<p role="status" className="text-xs text-amber-700">Alterações locais não salvas{conflicted?" · conflito com outra edição":""}</p>}<button type="button" onClick={exportDraft} disabled={!roomItems.length} className="mt-1 rounded border px-2 py-1 text-xs">Exportar rascunho JSON</button><label className="ml-2 inline-flex cursor-pointer rounded border px-2 py-1 text-xs">Importar rascunho JSON<input type="file" accept=".json,application/json" className="sr-only" disabled={busy||!savedTenantId} onChange={e=>{void importDraft(e.target.files?.[0]);e.target.value="";}}/></label>
    <p className="text-xs text-amber-700">Prévia 2D; pode salvar no projeto existente. Validação de engenharia pendente.</p>{!ready&&<p role="alert" className="text-xs text-red-700">Contorno aberto ou autointersectado: verifique as paredes do ambiente.</p>}
    {draft&&<p className="text-xs">Armário {draft.parameters.widthMm} × {draft.parameters.depthMm} mm · {draft.parts.length} tipos de peças.</p>}
    {ready?<><div className="grid grid-cols-2 gap-2">
      {([["X (mm)",x,setX],["Y (mm)",y,setY]] as const).map(([label,value,change])=><label key={label} className="text-xs">{label}<input type="number" className="w-full rounded border p-2" value={value} onChange={e=>change(Number(e.target.value))}/></label>)}
    </div><button type="button" disabled={!draft||busy||!savedTenantId} onClick={add} className="mt-2 rounded bg-violet-700 px-3 py-2 text-sm text-white">Inserir na planta</button>
    <svg viewBox={"0 0 "+width+" "+depth} className="mt-3 w-full border" role="img" aria-label="Planta esquemática de móveis">
      {polygon?<polygon points={polygon.map(p=>`${p.x},${p.y}`).join(" ")} fill="#f8fafc" stroke="#334155" strokeWidth="12"/>:null}
      {roomItems.map(i=><rect key={i.id} x={i.bounds.xMm} y={i.bounds.yMm} width={i.bounds.rotationDeg===90||i.bounds.rotationDeg===270?i.bounds.depthMm:i.bounds.widthMm} height={i.bounds.rotationDeg===90||i.bounds.rotationDeg===270?i.bounds.widthMm:i.bounds.depthMm} fill="#ddd6fe" stroke="#6d28d9" strokeWidth="10"/>)}
    </svg><div className="mt-2 space-y-2">{roomItems.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs"><span>{item.id} · {item.bounds.widthMm} × {item.bounds.depthMm} mm · {item.parts.length} peças</span><div className="flex gap-2"><button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>{setSelectedId(item.id);setX(item.bounds.xMm);setY(item.bounds.yMm);setEdit({widthMm:item.parameters.widthMm,heightMm:item.parameters.heightMm,depthMm:item.parameters.depthMm,materialId:item.parameters.materialId});}}>Selecionar</button><button type="button" disabled={busy} className="rounded border px-2 py-1" onClick={()=>move(item.id)}>Mover para X/Y</button><button type="button" disabled={busy} className="rounded border border-red-200 px-2 py-1 text-red-700" onClick={()=>remove(item.id)}>Remover</button></div></div>)}</div>{selected&&<div className="mt-3 rounded-lg border border-violet-200 p-3"><strong className="text-sm">Editar {selected.id}</strong><div className="mt-2 grid grid-cols-2 gap-2">{(["widthMm","heightMm","depthMm"] as const).map(k=><label key={k} className="text-xs">{k==="widthMm"?"Largura":k==="heightMm"?"Altura":"Profundidade"} (mm)<input type="number" className="w-full rounded border p-2" value={edit[k]} onChange={e=>setEdit(old=>({...old,[k]:Number(e.target.value)}))}/></label>)}<label className="text-xs">Material<input className="w-full rounded border p-2" value={edit.materialId} onChange={e=>setEdit(old=>({...old,materialId:e.target.value}))}/></label></div><button type="button" disabled={busy} onClick={applyEdits} className="mt-2 rounded bg-violet-700 px-3 py-2 text-xs text-white">Atualizar móvel e peças</button></div>}</>:<p className="text-sm">Geometria do ambiente ainda indisponível.</p>}
    <button type="button" onClick={()=>setWebglPreview(value=>!value)} className="mt-2 rounded border px-3 py-2 text-xs">{webglPreview?"Ocultar prévia WebGL":"Abrir prévia WebGL experimental"}</button>
    {webglPreview&&<FurnitureWebGLPreview items={roomItems} selectedId={selectedId} onSelect={id=>{const item=roomItems.find(i=>i.id===id);if(!item)return;setSelectedId(id);setX(item.bounds.xMm);setY(item.bounds.yMm);setEdit({widthMm:item.parameters.widthMm,heightMm:item.parameters.heightMm,depthMm:item.parameters.depthMm,materialId:item.parameters.materialId});}}/>}
    <FurnitureAxonometricPreview items={roomItems} selectedId={selectedId} onSelect={id=>{const item=roomItems.find(candidate=>candidate.id===id);if(!item)return;setSelectedId(item.id);setX(item.bounds.xMm);setY(item.bounds.yMm);setEdit({widthMm:item.parameters.widthMm,heightMm:item.parameters.heightMm,depthMm:item.parameters.depthMm,materialId:item.parameters.materialId});}}/>
    {!savedTenantId&&environment.projectId&&<p className="mt-2 text-xs text-amber-700">Carregando identidade e revisão do projeto. A edição será habilitada após a consulta.</p>}
    <div className="mt-2 flex gap-2"><button type="button" disabled={busy||!environment.projectId||!savedTenantId} onClick={save} className="rounded border px-3 py-2 text-xs">Salvar móveis</button><button type="button" disabled={busy||!environment.projectId} onClick={load} className="rounded border px-3 py-2 text-xs">Carregar móveis</button></div>
    {message&&<p role="alert" className="text-sm text-red-700">{message}</p>}
  </section>;
}
