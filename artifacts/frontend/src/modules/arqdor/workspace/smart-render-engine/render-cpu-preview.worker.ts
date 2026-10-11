import { prepareCpuPreview, renderCpuPreview, type CpuPreviewOptions } from "./render-cpu-preview";
type Request = { type: "start"; id: string; options: CpuPreviewOptions; tileRows?: number } | { type: "cancel"; id: string };
const active = new Set<string>();
self.onmessage = (event: MessageEvent<Request>) => {
  const request=event.data;
  if(request.type==="cancel"){ active.delete(request.id); return; }
  const {id,options}=request;
  if(active.has(id)){ self.postMessage({type:"error",id,message:"ID já em uso"});return; }
  active.add(id);
  let prepared: ReturnType<typeof prepareCpuPreview>;
  try {
    prepared = prepareCpuPreview(options.geometry);
  } catch (e) {
    active.delete(id);
    self.postMessage({type:"error",id,message:e instanceof Error?e.message:String(e)});
    return;
  }
  // Each tile is a separate queued task, allowing cancellation messages to be processed.
  const rows=Math.max(1,Math.min(32,Math.floor(request.tileRows||8)));
  let nextRow=0;
  const runTile=()=>{
    if(!active.has(id))return;
    try{
      const height=Math.min(rows,options.height-nextRow);
      if(height<=0){active.delete(id);self.postMessage({type:"done",id});return;}
      const frame=renderCpuPreview(options,nextRow,height,prepared);
      const bytes=frame.rgba;
      self.postMessage({type:"tile",id,y:nextRow,width:options.width,height,rgba:bytes.buffer,progress:(nextRow+height)/options.height},[bytes.buffer]);
      nextRow+=height;
      setTimeout(runTile,0);
    }catch(e){active.delete(id);self.postMessage({type:"error",id,message:e instanceof Error?e.message:String(e)});}
  };
  setTimeout(runTile,0);
};
