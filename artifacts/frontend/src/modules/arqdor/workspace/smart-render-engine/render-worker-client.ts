import type { CpuPreviewOptions } from "./render-cpu-preview";
export type RenderWorkerEvent =
 | {type:"tile";id:string;y:number;width:number;height:number;rgba:ArrayBuffer;progress:number;sampleCount:number;totalSamples:number}
 | {type:"done";id:string;samples:number}
 | {type:"error";id:string;message:string};
export function createCpuRenderJob(
 options: CpuPreviewOptions,
 handlers: {onTile:(event:Extract<RenderWorkerEvent,{type:"tile"}>)=>void;onDone:()=>void;onError:(error:string)=>void},
 config: {samples?:number;tileRows?:number} = {},
) {
 const id="render-"+Math.random().toString(36).slice(2);
 const worker=new Worker(new URL("./render-cpu-preview.worker.ts",import.meta.url),{type:"module"});
 let closed=false;
 const close=()=>{if(closed)return;closed=true;worker.terminate();};
 worker.onmessage=(event:MessageEvent<RenderWorkerEvent>)=>{
  if(closed || event.data.id!==id)return;
  if(event.data.type==="tile")handlers.onTile(event.data);
  else if(event.data.type==="done"){close();handlers.onDone();}
  else {close();handlers.onError(event.data.message);}
 };
 worker.onerror=(event)=>{if(!closed){close();handlers.onError(event.message||"Erro no worker");}};
 worker.postMessage({type:"start",id,options,...config});
 return {cancel:()=>{if(!closed){worker.postMessage({type:"cancel",id});close();}}};
}
