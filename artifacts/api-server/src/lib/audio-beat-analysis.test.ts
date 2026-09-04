import { describe, expect, it } from "vitest";
import { analyzePcm16Beats, buildPcmWaveform } from "./audio-beat-analysis.js";

function pulseTrain({ bpm, seconds = 12, sampleRate = 16000 }: { bpm: number; seconds?: number; sampleRate?: number }): Int16Array {
  const samples = new Int16Array(Math.floor(seconds * sampleRate));
  const interval = 60 / bpm;
  const pulseLength = Math.max(8, Math.floor(sampleRate * 0.025));
  for (let time = 0; time < seconds; time += interval) {
    const start = Math.floor(time * sampleRate);
    for (let offset = 0; offset < pulseLength && start + offset < samples.length; offset += 1) {
      const envelope = 1 - offset / pulseLength;
      samples[start + offset] = Math.round(28000 * envelope);
    }
  }
  return samples;
}

describe("audio beat analysis", () => {
  it("detects a stable 120 BPM pulse train", () => {
    const result = analyzePcm16Beats(pulseTrain({ bpm: 120 }), 16000);
    expect(result.bpm).toBeGreaterThanOrEqual(116);
    expect(result.bpm).toBeLessThanOrEqual(124);
    expect(result.confidence).toBeGreaterThan(0.45);
    expect(result.waveform).toHaveLength(96);
    expect(result.downbeatIndex).toBeGreaterThanOrEqual(0);
    expect(result.downbeatIndex).toBeLessThanOrEqual(3);
  });

  it("uses a valid BPM hint while still returning phase and waveform", () => {
    const result = analyzePcm16Beats(pulseTrain({ bpm: 96 }), 16000, 96);
    expect(result.bpm).toBe(96);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.offset).toBeGreaterThanOrEqual(0);
    expect(result.waveform.some((value) => value > 0.5)).toBe(true);
  });

  it("normalizes waveform values", () => {
    const waveform = buildPcmWaveform(Int16Array.from([0, 1000, -2000, 4000, -8000, 16000]), 3);
    expect(waveform).toHaveLength(3);
    expect(Math.max(...waveform)).toBe(1);
    expect(Math.min(...waveform)).toBeGreaterThanOrEqual(0);
  });
});
