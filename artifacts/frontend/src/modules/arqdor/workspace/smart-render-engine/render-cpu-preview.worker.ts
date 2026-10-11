import { prepareCpuPreview, renderCpuPreview, type CpuPreviewOptions } from "./render-cpu-preview";

type Start = { type: "start"; id: string; options: CpuPreviewOptions; tileRows?: number; samples?: number };
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
  const rows = Math.max(1, Math.min(32, Math.floor(request.tileRows || 8)));
  active.add(id);
  let prepared: ReturnType<typeof prepareCpuPreview>;
  try { prepared = prepareCpuPreview(options.geometry); }
  catch (e) {
    active.delete(id);
    self.postMessage({ type: "error", id, message: e instanceof Error ? e.message : String(e) });
    return;
  }
  // Bounded strip accumulation: independent tiles, no full-frame float buffer.
  // One event-loop task per strip so a cancel message can be processed.
  let sample = 0, y = 0;
  let sums = new Float64Array(0);
  const run = () => {
    if (!active.has(id)) return;
    try {
      if (sample >= samples) {
        active.delete(id);
        self.postMessage({ type: "done", id, samples });
        return;
      }
      const height = Math.min(rows, options.height - y);
      if (height <= 0) { y = 0; sample++; sums = new Float64Array(0); setTimeout(run, 0); return; }
      if (!sums.length) sums = new Float64Array(options.width * height * 3);
      const frame = renderCpuPreview(options, y, height, prepared, sample);
      for (let i = 0; i < options.width * height; i++)
        for (let c = 0; c < 3; c++) sums[i * 3 + c] += frame.rgba[i * 4 + c];
      const rgba = new Uint8ClampedArray(options.width * height * 4);
      for (let i = 0; i < options.width * height; i++) {
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(sums[i * 3 + c] / (sample + 1));
        rgba[i * 4 + 3] = 255;
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
