import { execFile } from "child_process";
import { writeFile } from "fs/promises";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const FPS = 30;

export type VideoEffectPreset = "auto" | "clean" | "modern" | "premium" | "cinematic" | "dynamic" | "luxury" | "social" | "minimal";
export type VideoEffectIntensity = "soft" | "medium" | "impact";
export type VideoTransition = "cut" | "fade" | "smooth" | "whip" | "zoom" | "blur" | "flash" | "mask" | "glitch";
export type VideoMotion = "ken_burns" | "zoom_in" | "zoom_out" | "pan" | "drift" | "punch" | "parallax";
export type VideoColor = "natural" | "clean" | "cinematic" | "vibrant" | "warm" | "cool" | "minimal" | "luxury" | "editorial" | "product";
export type VideoSfx = "none" | "whoosh" | "hit" | "click" | "pop" | "swipe";

export type ResolvedVideoEffects = {
  preset: VideoEffectPreset;
  intensity: VideoEffectIntensity;
  transition: VideoTransition;
  motion: VideoMotion;
  color: VideoColor;
  grain: boolean;
  vignette: boolean;
  sharpen: boolean;
  beatSync: boolean;
  bpm: number;
  sfx: VideoSfx;
};

const PRESETS: Record<VideoEffectPreset, Omit<ResolvedVideoEffects, "preset" | "intensity" | "bpm">> = {
  auto: { transition: "smooth", motion: "ken_burns", color: "clean", grain: false, vignette: false, sharpen: true, beatSync: false, sfx: "none" },
  clean: { transition: "fade", motion: "drift", color: "clean", grain: false, vignette: false, sharpen: true, beatSync: false, sfx: "none" },
  modern: { transition: "whip", motion: "parallax", color: "vibrant", grain: false, vignette: false, sharpen: true, beatSync: true, sfx: "whoosh" },
  premium: { transition: "smooth", motion: "ken_burns", color: "product", grain: true, vignette: true, sharpen: true, beatSync: false, sfx: "none" },
  cinematic: { transition: "blur", motion: "ken_burns", color: "cinematic", grain: true, vignette: true, sharpen: false, beatSync: false, sfx: "none" },
  dynamic: { transition: "zoom", motion: "punch", color: "vibrant", grain: false, vignette: false, sharpen: true, beatSync: true, sfx: "hit" },
  luxury: { transition: "smooth", motion: "drift", color: "luxury", grain: true, vignette: true, sharpen: true, beatSync: false, sfx: "none" },
  social: { transition: "whip", motion: "punch", color: "vibrant", grain: false, vignette: false, sharpen: true, beatSync: true, sfx: "pop" },
  minimal: { transition: "fade", motion: "drift", color: "minimal", grain: false, vignette: false, sharpen: false, beatSync: false, sfx: "none" },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value ?? "").trim().toLowerCase() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function resolveVideoEffects(value: unknown): ResolvedVideoEffects {
  const raw = asRecord(value);
  const preset = oneOf(raw["preset"], ["auto", "clean", "modern", "premium", "cinematic", "dynamic", "luxury", "social", "minimal"] as const, "auto");
  const intensity = oneOf(raw["intensity"], ["soft", "medium", "impact"] as const, "medium");
  const base = PRESETS[preset];
  return {
    preset,
    intensity,
    transition: oneOf(raw["transition"], ["cut", "fade", "smooth", "whip", "zoom", "blur", "flash", "mask", "glitch"] as const, base.transition),
    motion: oneOf(raw["motion"], ["ken_burns", "zoom_in", "zoom_out", "pan", "drift", "punch", "parallax"] as const, base.motion),
    color: oneOf(raw["color"], ["natural", "clean", "cinematic", "vibrant", "warm", "cool", "minimal", "luxury", "editorial", "product"] as const, base.color),
    grain: booleanValue(raw["grain"], base.grain),
    vignette: booleanValue(raw["vignette"], base.vignette),
    sharpen: booleanValue(raw["sharpen"], base.sharpen),
    beatSync: booleanValue(raw["beatSync"], base.beatSync),
    bpm: Math.round(numberValue(raw["bpm"], 120, 70, 180)),
    sfx: oneOf(raw["sfx"], ["none", "whoosh", "hit", "click", "pop", "swipe"] as const, base.sfx),
  };
}

export function recommendedSceneCount(duration: number, requestedSceneCount: number | null, effects: ResolvedVideoEffects, min: number, max: number): number {
  if (requestedSceneCount !== null && Number.isFinite(requestedSceneCount)) return Math.max(min, Math.min(max, Math.round(requestedSceneCount)));
  if (effects.beatSync) {
    const beatSeconds = 60 / effects.bpm;
    const secondsPerScene = beatSeconds * (effects.intensity === "impact" ? 3 : effects.intensity === "soft" ? 5 : 4);
    return Math.max(min, Math.min(max, Math.round(duration / secondsPerScene)));
  }
  return Math.max(min, Math.min(max, Math.round(duration / 4)));
}

export function transitionDurationFor(duration: number, sceneCount: number, effects: ResolvedVideoEffects): number {
  if (effects.transition === "cut" || sceneCount <= 1) return 0;
  const nominalScene = duration / sceneCount;
  const factor = effects.intensity === "impact" ? 0.14 : effects.intensity === "soft" ? 0.08 : 0.11;
  const beatLimit = effects.beatSync ? (60 / effects.bpm) * 0.6 : 0.5;
  return Math.max(0.12, Math.min(0.48, nominalScene * factor, beatLimit));
}

function intensityFactor(intensity: VideoEffectIntensity): number {
  return intensity === "impact" ? 1.45 : intensity === "soft" ? 0.7 : 1;
}

function colorFilters(color: VideoColor, factor: number): string[] {
  switch (color) {
    case "clean": return [`eq=contrast=${(1 + 0.05 * factor).toFixed(3)}:saturation=${(1 + 0.04 * factor).toFixed(3)}:brightness=${(0.012 * factor).toFixed(3)}`];
    case "cinematic": return [`eq=contrast=${(1 + 0.13 * factor).toFixed(3)}:saturation=${(0.9 + 0.03 * factor).toFixed(3)}:brightness=${(-0.012 * factor).toFixed(3)}:gamma=${(0.98).toFixed(3)}`];
    case "vibrant": return [`eq=contrast=${(1 + 0.08 * factor).toFixed(3)}:saturation=${(1 + 0.22 * factor).toFixed(3)}:brightness=${(0.008 * factor).toFixed(3)}`];
    case "warm": return [`eq=contrast=${(1 + 0.05 * factor).toFixed(3)}:saturation=${(1 + 0.09 * factor).toFixed(3)}:brightness=${(0.015 * factor).toFixed(3)}`, "colorbalance=rs=.045:gs=.018:bs=-.035"];
    case "cool": return [`eq=contrast=${(1 + 0.06 * factor).toFixed(3)}:saturation=${(1 + 0.05 * factor).toFixed(3)}`, "colorbalance=rs=-.03:gs=.01:bs=.045"];
    case "minimal": return [`eq=contrast=${(1 + 0.025 * factor).toFixed(3)}:saturation=${(0.92).toFixed(3)}:brightness=${(0.018 * factor).toFixed(3)}`];
    case "luxury": return [`eq=contrast=${(1 + 0.14 * factor).toFixed(3)}:saturation=${(0.9 + 0.04 * factor).toFixed(3)}:brightness=${(-0.008 * factor).toFixed(3)}`];
    case "editorial": return [`eq=contrast=${(1 + 0.12 * factor).toFixed(3)}:saturation=${(0.95 + 0.04 * factor).toFixed(3)}:gamma=.96`];
    case "product": return [`eq=contrast=${(1 + 0.07 * factor).toFixed(3)}:saturation=${(1 + 0.1 * factor).toFixed(3)}:brightness=${(0.012 * factor).toFixed(3)}`];
    default: return [];
  }
}

function motionExpression(input: { motion: VideoMotion; sceneIndex: number; frames: number; factor: number }): { z: string; x: string; y: string } {
  const direction = input.sceneIndex % 2 === 0 ? 1 : -1;
  const maxZoom = 1 + 0.1 * input.factor;
  const step = (0.00065 * input.factor).toFixed(6);
  const centerX = "iw/2-(iw/zoom/2)";
  const centerY = "ih/2-(ih/zoom/2)";
  switch (input.motion) {
    case "zoom_out":
      return { z: `if(eq(on,1),${maxZoom.toFixed(3)},max(1.0,zoom-${step}))`, x: centerX, y: centerY };
    case "pan":
      return { z: `${(1.055 + 0.025 * input.factor).toFixed(3)}`, x: direction > 0 ? `(iw-iw/zoom)*on/${input.frames}` : `(iw-iw/zoom)*(1-on/${input.frames})`, y: centerY };
    case "drift":
      return { z: `${(1.035 + 0.025 * input.factor).toFixed(3)}`, x: direction > 0 ? `(iw-iw/zoom)*on/${input.frames}` : `(iw-iw/zoom)*(1-on/${input.frames})`, y: `(ih-ih/zoom)*0.45` };
    case "punch":
      return { z: `min(zoom+${(0.00135 * input.factor).toFixed(6)},${(1 + 0.15 * input.factor).toFixed(3)})`, x: centerX, y: centerY };
    case "parallax":
      return { z: `min(zoom+${(0.0008 * input.factor).toFixed(6)},${(1 + 0.115 * input.factor).toFixed(3)})`, x: direction > 0 ? `(iw-iw/zoom)*on/${input.frames}` : `(iw-iw/zoom)*(1-on/${input.frames})`, y: `(ih-ih/zoom)*on/${Math.max(1, input.frames * 2)}` };
    case "zoom_in":
    case "ken_burns":
    default:
      return { z: `min(zoom+${step},${maxZoom.toFixed(3)})`, x: centerX, y: centerY };
  }
}

export function buildSceneFilter(input: {
  sceneIndex: number;
  duration: number;
  width: number;
  height: number;
  effects: ResolvedVideoEffects;
}): string {
  const factor = intensityFactor(input.effects.intensity);
  const frames = Math.max(1, Math.round(input.duration * FPS));
  const scaleWidth = Math.round(input.width * (1.28 + 0.06 * factor));
  const scaleHeight = Math.round(input.height * (1.28 + 0.06 * factor));
  const motion = motionExpression({ motion: input.effects.motion, sceneIndex: input.sceneIndex, frames, factor });
  const filters = [
    `scale=${scaleWidth}:${scaleHeight}:force_original_aspect_ratio=increase`,
    `crop=${scaleWidth}:${scaleHeight}`,
    `zoompan=z='${motion.z}':x='${motion.x}':y='${motion.y}':d=${frames}:s=${input.width}x${input.height}:fps=${FPS}`,
    ...colorFilters(input.effects.color, factor),
  ];
  if (input.effects.sharpen) filters.push(`unsharp=5:5:${(0.45 * factor).toFixed(2)}:3:3:0`);
  if (input.effects.vignette) filters.push(`vignette=PI/${input.effects.intensity === "impact" ? 4.2 : input.effects.intensity === "soft" ? 6.2 : 5.2}`);
  if (input.effects.grain) filters.push(`noise=alls=${Math.round(3 + 3 * factor)}:allf=t+u`);
  filters.push("format=yuv420p");
  return filters.join(",");
}

function xfadeName(transition: VideoTransition): string {
  switch (transition) {
    case "smooth": return "smoothleft";
    case "whip": return "slideleft";
    case "zoom": return "circleopen";
    case "blur": return "fade";
    case "flash": return "fadewhite";
    case "mask": return "circleopen";
    case "glitch": return "pixelize";
    case "fade": return "fade";
    default: return "fade";
  }
}

export async function concatScenesWithEffects(input: {
  scenePaths: string[];
  listPath: string;
  outputPath: string;
  sceneDuration: number;
  transitionDuration: number;
  effects: ResolvedVideoEffects;
}): Promise<void> {
  if (input.scenePaths.length <= 1 || input.effects.transition === "cut" || input.transitionDuration <= 0) {
    const content = input.scenePaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(input.listPath, content, "utf8");
    await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", input.listPath, "-c", "copy", "-movflags", "+faststart", input.outputPath], { maxBuffer: 8 * 1024 * 1024 });
    return;
  }

  const args = ["-y"];
  input.scenePaths.forEach((path) => args.push("-i", path));
  const filters: string[] = [];
  input.scenePaths.forEach((_, index) => {
    filters.push(`[${index}:v]settb=AVTB,setpts=PTS-STARTPTS[v${index}]`);
    filters.push(`[${index}:a]aresample=async=1:first_pts=0[a${index}]`);
  });
  let currentVideo = "v0";
  let currentAudio = "a0";
  for (let index = 1; index < input.scenePaths.length; index += 1) {
    const nextVideo = `vx${index}`;
    const nextAudio = `ax${index}`;
    const offset = index * (input.sceneDuration - input.transitionDuration);
    filters.push(`[${currentVideo}][v${index}]xfade=transition=${xfadeName(input.effects.transition)}:duration=${input.transitionDuration.toFixed(3)}:offset=${Math.max(0.01, offset).toFixed(3)}[${nextVideo}]`);
    filters.push(`[${currentAudio}][a${index}]acrossfade=d=${input.transitionDuration.toFixed(3)}:c1=tri:c2=tri[${nextAudio}]`);
    currentVideo = nextVideo;
    currentAudio = nextAudio;
  }
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", `[${currentVideo}]`,
    "-map", `[${currentAudio}]`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    input.outputPath,
  );
  await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
}

function sfxSource(type: VideoSfx): string {
  if (type === "hit") return "sine=frequency=82:sample_rate=48000:duration=0.18";
  if (type === "click") return "sine=frequency=1450:sample_rate=48000:duration=0.055";
  if (type === "pop") return "sine=frequency=620:sample_rate=48000:duration=0.11";
  return "anoisesrc=color=pink:amplitude=0.7:sample_rate=48000:d=0.28";
}

export async function applyTransitionSoundEffects(input: {
  sourcePath: string;
  outputPath: string;
  transitionTimes: number[];
  effects: ResolvedVideoEffects;
}): Promise<void> {
  if (input.effects.sfx === "none" || !input.transitionTimes.length) return;
  const args = ["-y", "-i", input.sourcePath];
  input.transitionTimes.forEach(() => args.push("-f", "lavfi", "-i", sfxSource(input.effects.sfx)));
  const volume = input.effects.intensity === "impact" ? 0.42 : input.effects.intensity === "soft" ? 0.18 : 0.28;
  const filters: string[] = [];
  const labels: string[] = ["[0:a]"];
  input.transitionTimes.forEach((time, index) => {
    const label = `sfx${index}`;
    const delay = Math.max(0, Math.round(time * 1000));
    const tonal = input.effects.sfx === "whoosh" || input.effects.sfx === "swipe" ? ",highpass=f=180,lowpass=f=6200" : "";
    filters.push(`[${index + 1}:a]volume=${volume.toFixed(2)}${tonal},afade=t=out:st=0.12:d=0.14,adelay=${delay}|${delay}[${label}]`);
    labels.push(`[${label}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=first:dropout_transition=0[mix]`);
  args.push("-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[mix]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", input.outputPath);
  await execFileAsync("ffmpeg", args, { maxBuffer: 12 * 1024 * 1024 });
}
