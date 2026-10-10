import { renderCpuPreview, type CpuPreviewOptions } from "./render-cpu-preview";
type Request = { type: "start"; id: string; options: CpuPreviewOptions; tileRows?: number } | { type: "cancel"; id: string };
const active = new Set<string>();
self.onmessage = (event: MessageEvent<Request>) => {
  const request=event.data;
  if(request.type==="cancel"){ active.delete(request.id); return; }
  const {id,options}=request;
  if(active.has(id)){ self.postMessage({type:"error",id,message:"ID já em uso"});return; }
  active.add(id);
  // Each tile is a separate queued task, allowing cancellation messages to be processed.
  const rows=Math.max(1,Math.min(32,Math.floor(request.tileRows||8)));
  let nextRow=0;
  const runTile=()=>{
    if(!active.has(id))return;
    try{
      const height=Math.min(rows,options.height-nextRow);
      if(height<=0){active.delete(id);self.postMessage({type:"done",id});return;}
      // Use full-frame camera projection and crop the rows from a deterministic render.
      // This prototype re-renders the full frame for every tile, so limit to small diagnostics.
      const frame=renderCpuPreview(options);
      const bytes=frame.rgba.slice(nextRow*options.width*4,(nextRow+height)*options.width*4);
      self.postMessage({type:"tile",id,y:nextRow,width:options.width,height,rgba:bytes.buffer,progress:(nextRow+height)/options.height},[bytes.buffer]);
      nextRow+=height;
      setTimeout(runTile,0);
    }catch(e){active.delete(id);self.postMessage({type:"error",id,message:e instanceof Error?e.message:String(e)});}
  };
  setTimeout(runTile,0);
};
