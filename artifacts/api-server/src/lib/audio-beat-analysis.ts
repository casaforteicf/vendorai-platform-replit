export type ServerBeatAnalysis = {
  bpm: number;
  offset: number;
  confidence: number;
  waveform: number[];
  downbeatIndex: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function buildPcmWaveform(samples: Int16Array, bins = 96): number[] {
  if (!samples.length || bins <= 0) return [];
  const output: number[] = [];
  const span = Math.max(1, Math.floor(samples.length / bins));
  let maxPeak = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * span;
    const end = bin === bins - 1 ? samples.length : Math.min(samples.length, start + span);
    let peak = 0;
    const step = Math.max(1, Math.floor((end - start) / 220));
    for (let index = start; index < end; index += step) peak = Math.max(peak, Math.abs(samples[index] ?? 0) / 32768);
    output.push(peak);
    maxPeak = Math.max(maxPeak, peak);
  }
  return output.map((value) => Math.round((maxPeak > 0 ? value / maxPeak : 0) * 1000) / 1000);
}

export function analyzePcm16Beats(samples: Int16Array, sampleRate = 16000, bpmHint?: number | null): ServerBeatAnalysis {
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { bpm: bpmHint && bpmHint > 0 ? bpmHint : 110, offset: 0, confidence: 0.2, waveform: [], downbeatIndex: 0 };
  }

  const maxSamples = Math.min(samples.length, Math.floor(sampleRate * 120));
  const windowSize = Math.max(64, Math.round(sampleRate / 100));
  const windowDuration = windowSize / sampleRate;
  const windowCount = Math.max(1, Math.floor(maxSamples / windowSize));
  const energies = new Float64Array(windowCount);
  let total = 0;

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const start = windowIndex * windowSize;
    const end = Math.min(maxSamples, start + windowSize);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const value = (samples[index] ?? 0) / 32768;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    energies[windowIndex] = rms;
    total += rms;
  }

  const mean = total / Math.max(1, energies.length);
  let bpm = bpmHint && Number.isFinite(bpmHint) && bpmHint > 0 ? bpmHint : 0;
  let confidence = bpm ? 0.72 : 0;

  if (!bpm && energies.length > 20) {
    const minLag = Math.max(1, Math.floor((60 / 180) / windowDuration));
    const maxLag = Math.min(energies.length - 2, Math.ceil((60 / 70) / windowDuration));
    let bestLag = 0;
    let bestCorrelation = Number.NEGATIVE_INFINITY;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let score = 0;
      let leftNorm = 0;
      let rightNorm = 0;
      for (let index = lag; index < energies.length; index += 1) {
        const left = (energies[index] ?? 0) - mean;
        const right = (energies[index - lag] ?? 0) - mean;
        score += left * right;
        leftNorm += left * left;
        rightNorm += right * right;
      }
      const correlation = score / Math.max(1e-9, Math.sqrt(leftNorm * rightNorm));
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    if (bestLag > 0) {
      bpm = 60 / (bestLag * windowDuration);
      while (bpm < 80) bpm *= 2;
      while (bpm > 160) bpm /= 2;
      confidence = clamp((bestCorrelation + 1) / 2, 0.2, 0.96);
    }
  }

  if (!bpm || !Number.isFinite(bpm)) bpm = 110;
  bpm = clamp(bpm, 60, 200);
  const period = 60 / bpm;
  const duration = maxSamples / sampleRate;
  let bestOffset = 0;
  let bestPhaseScore = Number.NEGATIVE_INFINITY;
  for (let phaseIndex = 0; phaseIndex < 48; phaseIndex += 1) {
    const offset = period * phaseIndex / 48;
    let score = 0;
    let count = 0;
    for (let time = offset; time < duration; time += period) {
      const index = Math.min(energies.length - 1, Math.max(0, Math.round(time / windowDuration)));
      score += Math.max(0, (energies[index] ?? 0) - mean);
      count += 1;
    }
    const normalized = score / Math.max(1, count);
    if (normalized > bestPhaseScore) {
      bestPhaseScore = normalized;
      bestOffset = offset;
    }
  }

  const beatBuckets = [0, 0, 0, 0];
  const beatCounts = [0, 0, 0, 0];
  let ordinal = 0;
  for (let time = bestOffset; time < duration; time += period) {
    const index = Math.min(energies.length - 1, Math.max(0, Math.round(time / windowDuration)));
    const bucket = ordinal % 4;
    beatBuckets[bucket] += Math.max(0, (energies[index] ?? 0) - mean);
    beatCounts[bucket] += 1;
    ordinal += 1;
  }
  let downbeatIndex = 0;
  let downbeatScore = Number.NEGATIVE_INFINITY;
  for (let bucket = 0; bucket < 4; bucket += 1) {
    const score = beatBuckets[bucket] / Math.max(1, beatCounts[bucket]);
    if (score > downbeatScore) {
      downbeatScore = score;
      downbeatIndex = bucket;
    }
  }

  return {
    bpm: Math.round(bpm * 10) / 10,
    offset: Math.round(bestOffset * 1000) / 1000,
    confidence: Math.round(clamp(confidence, 0.2, 0.98) * 100) / 100,
    waveform: buildPcmWaveform(samples),
    downbeatIndex,
  };
}
