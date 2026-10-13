import React, { useEffect, useRef, useState } from "react";
import { createCpuRenderJob } from "./render-worker-client";
import type { DiffusePreviewOptions } from "./render-diffuse-preview";

type Props={options:DiffusePreviewOptions; tenantId?:string; authToken?:string; arqdorProjectId?:string};
export function ExperimentalCpuRenderPanel({options,tenantId,authToken,arqdorProjectId}:Props){
 const canvas=useRef<HTMLCanvasElement>(null);
 const job=useRef<ReturnType<typeof createCpuRenderJob>|null>(null);
 const generation=useRef(0);
 const [status,setStatus]=useState("Não iniciado");
 const [progress,setProgress]=useState(0);
 const [samples,setSamples]=useState(8);
 const [denoise,setDenoise]=useState(false);
 const [exposure,setExposure]=useState(1);
 const [sunIntensity,setSunIntensity]=useState(1);
 const [bounceCount,setBounceCount]=useState(2);
 const [selectedMaterial,setSelectedMaterial]=useState("");
 const [roughness,setRoughness]=useState(0.35);
 const [transmission,setTransmission]=useState(0);
 const [completed,setCompleted]=useState(false);
 const [saving,setSaving]=useState(false);
 const savingRef=useRef(false);
 const [savedVersions,setSavedVersions]=useState<Array<{id:string;label:string;image:string}>>([]);
 const [loadingVersions,setLoadingVersions]=useState(false);
 const [history,setHistory]=useState<Array<{image:string;label:string}>>([]);
 const [comparison,setComparison]=useState<string|null>(null);
 const [latestCompletedImage,setLatestCompletedImage]=useState<string|null>(null);
 const historySequence=useRef(0);
 const mediaProjectRef=useRef<{key:string;id:string}|null>(null);
 const loadSavedVersions=async (mediaId:string,tenant:string,token:string)=>{
  setLoadingVersions(true);
  try {
   const response=await fetch(`/api/tenants/${encodeURIComponent(tenant)}/media/projects/${encodeURIComponent(mediaId)}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
   if(!response.ok)throw Error("Falha ao carregar versões");
   const payload=await response.json();
   const assets=new Map((Array.isArray(payload.assets)?payload.assets:[]).map((a:any)=>[a.id,a]));
   const versions=(Array.isArray(payload.versions)?payload.versions:[]).filter((v:any)=>v.operation==="arqdor_cpu_preview").slice(0,20);
   setSavedVersions(versions.flatMap((v:any)=>{const asset:any=assets.get(v.assetId);return typeof asset?.accessUrl==="string"&&asset.accessUrl?[{id:v.id,label:v.label||"Prévia CPU",image:asset.accessUrl}]:[];}));
  }catch(error){setStatus(error instanceof Error?error.message:String(error));}
  finally{setLoadingVersions(false);}
 };
 const savedGeneration=useRef(0);
 const settingsInitialized=useRef(false);
 useEffect(()=>()=>{generation.current++;job.current?.cancel();job.current=null;},[]);
 useEffect(()=>{generation.current++;job.current?.cancel();job.current=null;setProgress(0);setCompleted(false);setHistory([]);setSavedVersions([]);historySequence.current=0;setComparison(null);setLatestCompletedImage(null);savedGeneration.current++;mediaProjectRef.current=null;setStatus("Cena alterada — renderizar novamente");},[options]);
 // Changes to the render settings invalidate the last image, including during asynchronous saves.
 // Otherwise a preview rendered with older settings could be exported as the current result.
 useEffect(()=>{
  if(!settingsInitialized.current){settingsInitialized.current=true;return;}
  generation.current++;
  job.current?.cancel();
  job.current=null;
  savedGeneration.current++;
  setCompleted(false);
  setProgress(0);
  setLatestCompletedImage(null);
  setComparison(null);
  setStatus("Parâmetros alterados — renderize novamente");
 },[samples,denoise,exposure,sunIntensity,bounceCount,selectedMaterial,roughness,transmission]);
 const stop=()=>{generation.current++;job.current?.cancel();job.current=null;setCompleted(false);setStatus("Cancelado");};
 const exportPng=()=>{
  if(!completed||!canvas.current||job.current)return;
  const link=document.createElement("a");
  link.download="arqdor-previa-cpu-experimental.png";
  link.href=canvas.current.toDataURL("image/png");
  link.click();
 };
 const saveToLibrary=async()=>{
  if(!completed||!canvas.current||job.current||savingRef.current||!tenantId||!authToken||!arqdorProjectId)return;
  savingRef.current=true;
  setSaving(true);
  const sourceKey=`${tenantId}:${arqdorProjectId}`;
  const sourceGeneration=savedGeneration.current;
  try{
   const blob=await new Promise<Blob>((resolve,reject)=>{
    canvas.current!.toBlob(value=>value?resolve(value):reject(Error("Não foi possível criar o PNG")),"image/png");
   });
   if(blob.size===0||blob.size>15*1024*1024)throw Error("Imagem fora do limite de 15 MB");
   const mediaRoot=`/api/tenants/${encodeURIComponent(tenantId)}/media`;
   const root=`${mediaRoot}/assets`;
   const headers={Authorization:`Bearer ${authToken}`,"Content-Type":"application/json"};
   const key=sourceKey;
   let mediaId=mediaProjectRef.current?.key===key?mediaProjectRef.current.id:null;
   if(!mediaId){
    const lookup=await fetch(`${mediaRoot}/projects?kind=mixed&arqdorProjectId=${encodeURIComponent(arqdorProjectId)}&limit=1`,{headers:{Authorization:`Bearer ${authToken}`}});
    if(!lookup.ok)throw Error("Falha ao localizar histórico");
    const payload=await lookup.json();
    const existing=Array.isArray(payload.projects)?payload.projects.find((item:any)=>
      item?.context?.arqdorProjectId===arqdorProjectId && item?.context?.generator==="arqdor-cpu-experimental"):null;
    mediaId=typeof existing?.id==="string"?existing.id:null;
    if(!mediaId){
     const created=await fetch(`${mediaRoot}/projects`,{method:"POST",headers,body:JSON.stringify({
      title:`Arqdor · CPU experimental · ${arqdorProjectId}`,kind:"mixed",source:"arqdor",
      context:{arqdorProjectId,generator:"arqdor-cpu-experimental"}
     })});
     const data=await created.json().catch(()=>({}));
     if(!created.ok||typeof data.project?.id!=="string")throw Error(data.error||"Falha ao criar histórico");
     mediaId=data.project.id;
    }
    mediaProjectRef.current={key,id:mediaId!};
   }
   if(sourceGeneration!==savedGeneration.current)throw Error("Projeto ou cena alterados durante o envio");
   const name=`arqdor-cpu-previa-${Date.now()}.png`;
   const requested=await fetch(`${root}/request-upload`,{method:"POST",headers,body:JSON.stringify({name,contentType:"image/png",type:"image",size:blob.size,projectId:mediaId})});
   const prepared=await requested.json().catch(()=>({}));
   if(!requested.ok||typeof prepared.uploadURL!=="string"||typeof prepared.objectPath!=="string")throw Error(prepared.error||"Falha ao preparar envio");
   const uploaded=await fetch(prepared.uploadURL,{method:"PUT",headers:{"Content-Type":"image/png"},body:blob});
   if(!uploaded.ok)throw Error("Falha ao transferir imagem");
   if(sourceGeneration!==savedGeneration.current)throw Error("Projeto, cena ou parâmetros alterados durante o envio");
   const registered=await fetch(root,{method:"POST",headers,body:JSON.stringify({
    type:"image",role:"output",source:"upload",projectId:mediaId,operation:"arqdor_cpu_preview",
    label:"Prévia CPU experimental",storageUrl:prepared.objectPath,
    originalFilename:name,mimeType:"image/png",fileSize:blob.size,
    metadata:{folderPath:"Arqdor / Laboratório",arqdorProjectId,generator:"arqdor-cpu-experimental",status:"experimental",published:false}
   })});
   if(!registered.ok){const error=await registered.json().catch(()=>({}));throw Error(error.error||"Falha ao registrar imagem");}
   if(sourceGeneration===savedGeneration.current){setStatus("Prévia experimental salva na Biblioteca de Mídias do tenant");await loadSavedVersions(mediaId!,tenantId,authToken);}
  }catch(error){if(sourceGeneration===savedGeneration.current)setStatus("Falha ao salvar: "+(error instanceof Error?error.message:String(error)));}
  finally{savingRef.current=false;setSaving(false);}
 };
 const start=()=>{
  savedGeneration.current++;
  stop();
  setComparison(null);
  const context=canvas.current?.getContext("2d");
  if(!context){setStatus("Canvas indisponível");return;}
  if(options.width<1||options.height<1||options.width*options.height>262144){setStatus("Resolução experimental inválida");return;}
  canvas.current!.width=options.width;canvas.current!.height=options.height;
  setProgress(0);setCompleted(false);setStatus("Renderizando");
  try {
   const renderOptions:DiffusePreviewOptions={...options,
    display:{toneMapping:options.display?.toneMapping??"aces",exposure},
    directionalLight:{directionToLight:options.directionalLight?.directionToLight??[0.35,0.8,0.45],
      color:options.directionalLight?.color??[1,1,1],intensity:sunIntensity},
    maxBounces:bounceCount,
    physicalMaterials:selectedMaterial ? {...options.physicalMaterials,
      [selectedMaterial]:{...options.physicalMaterials?.[selectedMaterial],roughness,transmission}} : options.physicalMaterials,
   };
   const currentGeneration=++generation.current;
   job.current=createCpuRenderJob(renderOptions,{
    onTile:ev=>{
     if(currentGeneration!==generation.current)return;
     if(ev.width!==options.width||ev.y<0||ev.y+ev.height>options.height)return;
     context.putImageData(new ImageData(new Uint8ClampedArray(ev.rgba),ev.width,ev.height),0,ev.y);
     setProgress(Math.round(ev.progress*100));
    },
    onFrame:ev=>{if(currentGeneration!==generation.current)return;context.putImageData(new ImageData(new Uint8ClampedArray(ev.rgba),ev.width,ev.height),0,0);},
    onDone:()=>{if(currentGeneration!==generation.current)return;job.current=null;setProgress(100);setCompleted(true);setStatus("Concluído (experimental)");
      const image=canvas.current?.toDataURL("image/png");
      if(image){setLatestCompletedImage(image);const version=++historySequence.current;setHistory(old=>[{image,label:`Prévia ${version} · ${samples} passagens`},...old].slice(0,3));}
    },
    onError:error=>{if(currentGeneration!==generation.current)return;job.current=null;setStatus("Falha: "+error);}
   },{mode:"diffuse",samples,denoise:denoise?0.5:0});
  }catch(error){job.current=null;setCompleted(false);setStatus(error instanceof Error?error.message:String(error));}
 };
 return <section className="rounded-2xl border border-amber-200 bg-white p-4 space-y-3" aria-label="Prévia física experimental">
  <div className="flex items-center justify-between gap-2">
   <div><h3 className="text-sm font-semibold text-slate-900">Prévia física CPU — experimental</h3>
    <p className="text-xs text-slate-500">Não substitui o render IA, não publica imagens e não altera a geometria.</p></div>
   <span className="text-xs text-amber-700">Laboratório</span>
  </div>
  <canvas ref={canvas} className="block w-full rounded-lg bg-slate-900" aria-label="Imagem do render experimental"/>
  <div className="flex flex-wrap items-center gap-3 text-sm">
   <label>Passagens <select value={samples} onChange={e=>setSamples(Number(e.target.value))} className="rounded border p-1">
    {[1,4,8,16,32].map(v=><option key={v} value={v}>{v}</option>)}
   </select></label>
   <label>Exposição <input type="range" min="0.25" max="3" step="0.25" value={exposure} onChange={e=>setExposure(Number(e.target.value))}/>{exposure.toFixed(2)}×</label>
   <label>Sol <input type="range" min="0" max="4" step="0.25" value={sunIntensity} onChange={e=>setSunIntensity(Number(e.target.value))}/>{sunIntensity.toFixed(2)}×</label>
   <label>Material <select value={selectedMaterial} onChange={e=>setSelectedMaterial(e.target.value)} className="rounded border p-1">
    <option value="">Original</option>{Object.keys(options.materials).map(id=><option key={id} value={id}>{id.slice(0,20)}</option>)}
   </select></label>
   {selectedMaterial && <label>Rugosidade <input type="range" min="0" max="1" step="0.05" value={roughness} onChange={e=>setRoughness(Number(e.target.value))}/>{roughness.toFixed(2)}</label>}
   {selectedMaterial && <label>Transmissão <input type="range" min="0" max="1" step="0.05" value={transmission} onChange={e=>setTransmission(Number(e.target.value))}/>{transmission.toFixed(2)}</label>}
   <label>Rebotes <select value={bounceCount} onChange={e=>setBounceCount(Number(e.target.value))} className="rounded border p-1">{[1,2,3,4].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
   <label className="flex items-center gap-2"><input type="checkbox" checked={denoise} onChange={e=>setDenoise(e.target.checked)}/>Filtro de ruído</label>
   <button type="button" onClick={start} className="rounded bg-slate-900 px-3 py-2 text-white">Renderizar prévia</button>
   <button type="button" onClick={stop} className="rounded border px-3 py-2">Cancelar</button>
   <button type="button" disabled={!completed||!!job.current} onClick={exportPng} className="rounded border px-3 py-2 disabled:opacity-40">Exportar PNG local</button>
   {tenantId && authToken && arqdorProjectId && <button type="button" disabled={!completed||!!job.current||saving} onClick={()=>void saveToLibrary()} className="rounded border px-3 py-2 disabled:opacity-40">{saving?"Salvando...":"Salvar na Biblioteca (experimental)"}</button>}
  </div>
  <div role="status" className="text-xs text-slate-600">{status} · {progress}%</div>
  {tenantId && authToken && arqdorProjectId && <div className="space-y-2">
   <button type="button" disabled={loadingVersions} onClick={()=>void (async()=>{
    const response=await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/media/projects?kind=mixed&arqdorProjectId=${encodeURIComponent(arqdorProjectId)}&limit=1`,{headers:{Authorization:`Bearer ${authToken}`}});
    if(!response.ok){setStatus("Não foi possível consultar histórico persistente");return;}
    const payload=await response.json();
    const id=payload.projects?.[0]?.id;
    if(typeof id==="string"){mediaProjectRef.current={key:`${tenantId}:${arqdorProjectId}`,id};await loadSavedVersions(id,tenantId,authToken);}
    else setSavedVersions([]);
   })()} className="rounded border px-3 py-2 text-xs disabled:opacity-40">Atualizar histórico salvo</button>
   {savedVersions.length>0 && <div className="flex flex-wrap gap-2">{savedVersions.map(v=><button type="button" key={v.id} className="rounded border p-1 text-xs" onClick={()=>setComparison(v.image)}><img src={v.image} alt={v.label} className="h-14 w-20 object-cover"/>{v.label}</button>)}</div>}
  </div>}
  {history.length>0 && <div className="space-y-2">
   <p className="text-xs text-slate-600">Últimas três prévias desta cena (somente nesta sessão)</p>
   <div className="flex flex-wrap gap-2">{history.map((entry,index)=><button key={index} type="button" onClick={()=>setComparison(entry.image)} className="rounded border p-1 text-xs">
    <img src={entry.image} alt={entry.label} className="h-14 w-20 object-cover"/>{entry.label}
   </button>)}</div>
   {comparison && <div className="space-y-2"><button type="button" onClick={()=>setComparison(null)} className="text-xs underline">Fechar comparação</button>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
     <figure><figcaption className="text-xs text-slate-600">Versão selecionada</figcaption><img src={comparison} alt="Prévia selecionada" className="w-full rounded border"/></figure>
     {latestCompletedImage && <figure><figcaption className="text-xs text-slate-600">Última versão concluída</figcaption><img src={latestCompletedImage} alt="Última prévia concluída" className="w-full rounded border"/></figure>}
    </div></div>}
  </div>}
 </section>;
}
