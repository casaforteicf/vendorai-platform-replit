import { describe, expect, it } from "vitest";
import { analyzePcm16Beats } from "./audio-beat-analysis.js";

describe("video editor beat fallback contract", () => {
  it("returns the fields consumed by the editor", () => {
    const samples = new Int16Array(16000 * 2);
    for (let index = 0; index < samples.length; index += 8000) samples[index] = 30000;
    const analysis = analyzePcm16Beats(samples, 16000, 120);
    expect(analysis).toEqual(expect.objectContaining({
      bpm: expect.any(Number),
      offset: expect.any(Number),
      confidence: expect.any(Number),
      waveform: expect.any(Array),
      downbeatIndex: expect.any(Number),
    }));
    expect(analysis.waveform.length).toBe(96);
  });
});
