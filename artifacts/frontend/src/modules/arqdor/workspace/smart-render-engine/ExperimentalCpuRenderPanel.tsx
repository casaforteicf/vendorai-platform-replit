import React, { useEffect, useRef, useState } from "react";
import { createCpuRenderJob } from "./render-worker-client";
import type { DiffusePreviewOptions } from "./render-diffuse-preview";

type Props={options:DiffusePreviewOptions};
export function ExperimentalCpuRenderPanel({options}:Props){
 const canvas=useRef<HTMLCanvasElement>(null);
 const job=useRef<ReturnType<typeof createCpuRenderJob>|null>(null);
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
 useEffect(()=>()=>{job.current?.cancel();job.current=null;},[]);
 const stop=()=>{job.current?.cancel();job.current=null;setStatus("Cancelado");};
 const start=()=>{
  stop();
  const context=canvas.current?.getContext("2d");
  if(!context){setStatus("Canvas indisponível");return;}
  if(options.width<1||options.height<1||options.width*options.height>262144){setStatus("Resolução experimental inválida");return;}
  canvas.current!.width=options.width;canvas.current!.height=options.height;
  setProgress(0);setStatus("Renderizando");
  try {
   const renderOptions:DiffusePreviewOptions={...options,
    display:{toneMapping:options.display?.toneMapping??"aces",exposure},
    directionalLight:{directionToLight:options.directionalLight?.directionToLight??[0.35,0.8,0.45],
      color:options.directionalLight?.color??[1,1,1],intensity:sunIntensity},
    maxBounces:bounceCount,
    physicalMaterials:selectedMaterial ? {...options.physicalMaterials,
      [selectedMaterial]:{...options.physicalMaterials?.[selectedMaterial],roughness,transmission}} : options.physicalMaterials,
   };
   job.current=createCpuRenderJob(renderOptions,{
    onTile:ev=>{
     if(ev.width!==options.width||ev.y<0||ev.y+ev.height>options.height)return;
     context.putImageData(new ImageData(new Uint8ClampedArray(ev.rgba),ev.width,ev.height),0,ev.y);
     setProgress(Math.round(ev.progress*100));
    },
    onFrame:ev=>context.putImageData(new ImageData(new Uint8ClampedArray(ev.rgba),ev.width,ev.height),0,0),
    onDone:()=>{job.current=null;setProgress(100);setStatus("Concluído (experimental)");},
    onError:error=>{job.current=null;setStatus("Falha: "+error);}
   },{mode:"diffuse",samples,denoise:denoise?0.5:0});
  }catch(error){setStatus(error instanceof Error?error.message:String(error));}
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
  </div>
  <div role="status" className="text-xs text-slate-600">{status} · {progress}%</div>
 </section>;
}
