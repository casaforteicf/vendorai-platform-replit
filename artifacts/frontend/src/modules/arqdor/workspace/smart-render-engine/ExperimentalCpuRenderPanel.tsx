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
   job.current=createCpuRenderJob(options,{
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
   <label className="flex items-center gap-2"><input type="checkbox" checked={denoise} onChange={e=>setDenoise(e.target.checked)}/>Filtro de ruído</label>
   <button type="button" onClick={start} className="rounded bg-slate-900 px-3 py-2 text-white">Renderizar prévia</button>
   <button type="button" onClick={stop} className="rounded border px-3 py-2">Cancelar</button>
  </div>
  <div role="status" className="text-xs text-slate-600">{status} · {progress}%</div>
 </section>;
}
