import { prepareCpuPreview, renderCpuPreview, type CpuPreviewOptions } from "./render-cpu-preview";

/** Accumulates deterministic subpixel samples in linear numeric buffers (display is 8-bit). */
export function createProgressiveCpuRender(options: CpuPreviewOptions) {
  if (!Number.isInteger(options.width) || !Number.isInteger(options.height) ||
      options.width < 1 || options.height < 1 || options.width * options.height > 262_144)
    throw new Error("ARQDOR: resolução inválida");
  const bvh = prepareCpuPreview(options.geometry);
  const sums = new Float64Array(options.width * options.height * 3);
  let samples = 0;
  return {
    get sampleCount() { return samples; },
    nextSample() {
      if (samples >= 4096) throw new Error("ARQDOR: limite de amostras atingido");
      const result = renderCpuPreview(options, 0, options.height, bvh, samples);
      for (let i = 0; i < options.width * options.height; i++)
        for (let c = 0; c < 3; c++) sums[i * 3 + c] += result.rgba[i * 4 + c];
      samples++;
      const rgba = new Uint8ClampedArray(options.width * options.height * 4);
      for (let i = 0; i < options.width * options.height; i++) {
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(sums[i * 3 + c] / samples);
        rgba[i * 4 + 3] = 255;
      }
      return { width: options.width, height: options.height, rgba, sampleCount: samples, triangleCount: bvh.triangleCount };
    },
  };
}
