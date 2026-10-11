import { denoisePreviewRgba } from "./render-postprocess";
import { renderDiffusePreviewStrip, type DiffusePreviewOptions } from "./render-diffuse-preview";
import { prepareCpuPreview, renderCpuPreview, type CpuPreviewOptions } from "./render-cpu-preview";

type Start = { type: "start"; id: string; options: DiffusePreviewOptions; tileRows?: number; samples?: number; mode?: "diagnostic" | "diffuse"; denoise?: number };
type Request = Start | { type: "cancel"; id: string };
const active = new Set<string>();
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "cancel") { active.delete(request.id); return; }
  const { id, options } = request;
  if (active.has(id)) { self.postMessage({ type: "error", id, message: "ID já em uso" }); return; }
  const samples = request.samples ?? 1;
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 4096) {
    self.postMessage({ type: "error", id, message: "Número de amostras inválido (1–4096)" });
    return;
  }
  if (request.mode && request.mode !== "diffuse" && request.mode !== "diagnostic") { self.postMessage({type:"error",id,message:"Modo inválido"}); return; }
  const strength=request.denoise??0;
  if(!Number.isFinite(strength)||strength<0||strength>1) {self.postMessage({type:"error",id,message:"Denoise inválido"});return;}
  if (!Number.isInteger(options.width)||!Number.isInteger(options.height)||
      options.width<1||options.height<1||options.width*options.height>262144) {
    self.postMessage({type:"error",id,message:"Resolução de diagnóstico inválida"});return;
  }
  if(request.tileRows!==undefined&&(!Number.isFinite(request.tileRows)||request.tileRows<1)) {
    self.postMessage({type:"error",id,message:"Bloco de linhas inválido"});return;
  }
  const rows = Math.max(1, Math.min(32, Math.floor(request.tileRows || 8)));
  active.add(id);
  let prepared: ReturnType<typeof prepareCpuPreview>;
  try { prepared = prepareCpuPreview(options.geometry); }
  catch (e) {
    active.delete(id);
    self.postMessage({ type: "error", id, message: e instanceof Error ? e.message : String(e) });
    return;
  }
  // Progressive strips retain accumulated sums across passes, bounded by the preview resolution limit.
  // One event-loop task per strip so a cancel message can be processed.
  let sample = 0, y = 0;
  const sumsByRow = new Map<number, Float64Array>();
  const outputFrame = strength>0 ? new Uint8ClampedArray(options.width*options.height*4) : null;
  const run = () => {
    if (!active.has(id)) return;
    try {
      if (sample >= samples) {
        if(outputFrame){
          const filtered=denoisePreviewRgba(outputFrame,options.width,options.height,strength);
          self.postMessage({type:"frame",id,width:options.width,height:options.height,rgba:filtered.buffer,sampleCount:samples},[filtered.buffer]);
        }
        active.delete(id);
        self.postMessage({ type: "done", id, samples });
        return;
      }
      const height = Math.min(rows, options.height - y);
      if (height <= 0) { y = 0; sample++; setTimeout(run, 0); return; }
      let sums = sumsByRow.get(y);
      if (!sums) { sums = new Float64Array(options.width * height * 3); sumsByRow.set(y, sums); }
      const bytes = request.mode === "diffuse"
        ? renderDiffusePreviewStrip(options, y, height, prepared, sample)
        : renderCpuPreview(options, y, height, prepared, sample).rgba;
      for (let i = 0; i < options.width * height; i++)
        for (let c = 0; c < 3; c++) sums[i * 3 + c] += bytes[i * 4 + c];
      const rgba = new Uint8ClampedArray(options.width * height * 4);
      for (let i = 0; i < options.width * height; i++) {
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(sums[i * 3 + c] / (sample + 1));
        rgba[i * 4 + 3] = 255;
      }
      if(outputFrame){
        outputFrame.set(rgba,y*options.width*4);
      }
      self.postMessage({
        type: "tile", id, y, width: options.width, height, rgba: rgba.buffer,
        sampleCount: sample + 1, totalSamples: samples,
        progress: (sample * options.height + y + height) / (samples * options.height),
      }, [rgba.buffer]);
      y += height;
      setTimeout(run, 0);
    } catch (e) {
      active.delete(id);
      self.postMessage({ type: "error", id, message: e instanceof Error ? e.message : String(e) });
    }
  };
  setTimeout(run, 0);
};
