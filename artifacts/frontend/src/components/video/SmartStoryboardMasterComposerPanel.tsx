import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clapperboard, Film, Library, Loader2, Music2, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SMART_STORYBOARD_MANIFEST_KEY, parseStoryboardManifest, type SmartStoryboardManifest } from "./smart-storyboard";

type Ratio = "9:16" | "4:5" | "1:1" | "16:9";
type TransitionKind = "crossfade" | "cut" | "fade-black";
type ShadowPreset = "none" | "soft" | "strong" | "glow";

type GraphicLayer = {
  id: string;
  type: "text" | "image" | "card";
  name: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  background: string;
  opacity: number;
  scale: number;
  rotation: number;
  textAlign: "left" | "center" | "right";
  url?: string;
  fontFamily?: string;
  fontWeight?: number;
  designRole?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowPreset?: ShadowPreset;
  maskShape?: "none" | "rounded" | "circle";
  imageFit?: "contain" | "cover";
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
};

type Clip = {
  id?: string;
  name?: string;
  url?: string;
  assetId?: string;
  sourceDuration?: number;
  trimIn?: number;
  trimOut?: number;
};

type SceneContext = {
  ratio?: Ratio;
  clips?: Clip[];
  layers?: GraphicLayer[];
  graphicDesign?: Record<string, unknown> & {
    sceneIndex?: number;
    designScore?: number;
  };
};

type SceneProject = {
  id: string;
  title: string;
  context: SceneContext;
};

type SceneRuntime = {
  project: SceneProject;
  duration: number;
  video: HTMLVideoElement | null;
  images: Map<string, HTMLImageElement>;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  started: boolean;
  gain: GainNode | null;
};

type OutputAsset = {
  id: string;
  storageUrl?: string | null;
  storage_url?: string | null;
};

type MasterResult = {
  assetId: string;
  projectId: string;
  url: string;
  duration: number;
};

type ExtendedManifest = SmartStoryboardManifest & {
  master?: {
    assetId: string;
    projectId: string;
    url: string;
    durationSeconds: number;
    transition: TransitionKind;
    transitionDuration: number;
    renderedAt: string;
  };
};

const OUTPUT_SIZE: Record<Ratio, { width: number; height: number }> = {
  "9:16": { width: 720, height: 1280 },
  "4:5": { width: 864, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1280, height: 720 },
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function mediaUrl(raw: string) {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  return raw;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar uma imagem de uma das cenas."));
    image.src = mediaUrl(url);
  });
}

function loadVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    video.loop = false;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Não foi possível carregar o vídeo de uma das cenas."));
    video.src = mediaUrl(url);
    video.load();
  });
}

function supportedMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

function sceneDuration(context: SceneContext) {
  const maxLayer = (context.layers ?? []).reduce((max, layer) => Number.isFinite(layer.end) ? Math.max(max, layer.end) : max, 0);
  const clip = context.clips?.find((item) => Boolean(item.url));
  const clipDuration = clip
    ? Math.max(0, Number(clip.trimOut ?? clip.sourceDuration ?? 0) - Number(clip.trimIn ?? 0))
    : 0;
  return clamp(maxLayer || clipDuration || 8, 2, 30);
}

function drawCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource & { videoWidth?: number; videoHeight?: number }, width: number, height: number) {
  const sw = Number(source.videoWidth ?? (source as HTMLImageElement).naturalWidth ?? width) || width;
  const sh = Number(source.videoHeight ?? (source as HTMLImageElement).naturalHeight ?? height) || height;
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function shadow(ctx: CanvasRenderingContext2D, preset: ShadowPreset | undefined, scale: number) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (preset === "soft") {
    ctx.shadowColor = "rgba(0,0,0,.24)";
    ctx.shadowBlur = 20 * scale;
    ctx.shadowOffsetY = 7 * scale;
  } else if (preset === "strong") {
    ctx.shadowColor = "rgba(0,0,0,.42)";
    ctx.shadowBlur = 36 * scale;
    ctx.shadowOffsetY = 12 * scale;
  } else if (preset === "glow") {
    ctx.shadowColor = "rgba(139,92,246,.50)";
    ctx.shadowBlur = 26 * scale;
  }
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawImageLayer(ctx: CanvasRenderingContext2D, layer: GraphicLayer, image: HTMLImageElement, width: number, scale: number) {
  const zoom = clamp(layer.imageZoom ?? 1, 0.1, 8);
  const fit = layer.imageFit ?? "contain";
  const naturalRatio = image.naturalHeight / Math.max(1, image.naturalWidth);
  const boxHeight = layer.designRole === "media" ? ctx.canvas.height : layer.maskShape === "circle" ? width : width * naturalRatio;
  const radius = layer.maskShape === "circle" ? Math.min(width, boxHeight) / 2 : (layer.borderRadius ?? 0) * scale;
  const base = fit === "cover"
    ? Math.max(width / image.naturalWidth, boxHeight / image.naturalHeight)
    : Math.min(width / image.naturalWidth, boxHeight / image.naturalHeight);
  const drawWidth = image.naturalWidth * base * zoom;
  const drawHeight = image.naturalHeight * base * zoom;
  const px = clamp((layer.imagePositionX ?? 50) / 100, 0, 1);
  const py = clamp((layer.imagePositionY ?? 50) / 100, 0, 1);
  const dx = (width - drawWidth) * px;
  const dy = (boxHeight - drawHeight) * py;

  ctx.save();
  shadow(ctx, layer.shadowPreset, scale);
  if (radius > 0) {
    roundedPath(ctx, 0, 0, width, boxHeight, radius);
    ctx.clip();
  }
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  ctx.restore();

  if ((layer.borderWidth ?? 0) > 0) {
    ctx.save();
    roundedPath(ctx, 0, 0, width, boxHeight, radius);
    ctx.strokeStyle = layer.borderColor ?? "#ffffff";
    ctx.lineWidth = (layer.borderWidth ?? 0) * scale;
    ctx.stroke();
    ctx.restore();
  }
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: GraphicLayer, boxWidth: number, scale: number) {
  const fontSize = Math.max(12 * scale, layer.fontSize * scale);
  const family = layer.fontFamily ? `"${layer.fontFamily}", Inter, Arial, sans-serif` : "Inter, Arial, sans-serif";
  ctx.font = `${layer.fontWeight ?? 700} ${fontSize}px ${family}`;
  ctx.textBaseline = "top";
  ctx.textAlign = layer.textAlign ?? "left";
  const hasBg = Boolean(layer.background && layer.background !== "transparent");
  const padX = hasBg ? fontSize * 0.62 : 0;
  const padY = hasBg ? fontSize * 0.42 : 0;
  const lines = wrapText(ctx, layer.text || layer.name, Math.max(8, boxWidth - padX * 2));
  const lineHeight = fontSize * 1.06;
  const boxHeight = Math.max(lineHeight, lines.length * lineHeight) + padY * 2;
  const radius = (layer.borderRadius ?? 0) * scale;

  if (hasBg || layer.shadowPreset && layer.shadowPreset !== "none") {
    ctx.save();
    shadow(ctx, layer.shadowPreset, scale);
    roundedPath(ctx, 0, 0, boxWidth, boxHeight, radius);
    ctx.fillStyle = hasBg ? layer.background : "rgba(0,0,0,0)";
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = layer.color || "#ffffff";
  const textX = layer.textAlign === "center" ? boxWidth / 2 : layer.textAlign === "right" ? boxWidth - padX : padX;
  lines.forEach((line, index) => ctx.fillText(line, textX, padY + index * lineHeight, Math.max(8, boxWidth - padX * 2)));
}

function renderScene(runtime: SceneRuntime, localTime: number, output: { width: number; height: number }) {
  const { ctx, project, video, images } = runtime;
  const layers = project.context.layers ?? [];
  const scale = output.width / 720;
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, output.width, output.height);
  if (video && video.readyState >= 2) drawCover(ctx, video, output.width, output.height);
  ctx.restore();

  layers.forEach((layer) => {
    if (localTime < (layer.start ?? 0) || localTime > (layer.end ?? runtime.duration)) return;
    const x = output.width * layer.x / 100;
    const y = output.height * layer.y / 100;
    const boxWidth = Math.max(1, output.width * layer.width / 100);
    ctx.save();
    ctx.globalAlpha = clamp(layer.opacity ?? 1, 0, 1);
    ctx.translate(x, y);
    ctx.rotate((layer.rotation ?? 0) * Math.PI / 180);
    ctx.scale(layer.scale ?? 1, layer.scale ?? 1);
    if (layer.type === "image" && layer.url) {
      const image = images.get(layer.id);
      if (image) drawImageLayer(ctx, layer, image, boxWidth, scale);
    } else if (layer.type === "text") {
      drawTextLayer(ctx, layer, boxWidth, scale);
    }
    ctx.restore();
  });
}

function transitionAlpha(index: number, now: number, starts: number[], durations: number[], overlap: number, kind: TransitionKind) {
  if (kind === "cut" || overlap <= 0) return 1;
  let alpha = 1;
  if (index > 0) {
    const enterStart = starts[index]!;
    if (now < enterStart + overlap) alpha *= clamp((now - enterStart) / overlap, 0, 1);
  }
  if (index < starts.length - 1) {
    const nextStart = starts[index + 1]!;
    if (now >= nextStart) alpha *= 1 - clamp((now - nextStart) / overlap, 0, 1);
  }
  if (kind === "fade-black") {
    const local = now - starts[index]!;
    const duration = durations[index]!;
    const edge = Math.min(overlap, duration / 3);
    if (edge > 0) {
      if (local < edge) alpha *= clamp(local / edge, 0, 1);
      if (local > duration - edge) alpha *= clamp((duration - local) / edge, 0, 1);
    }
  }
  return clamp(alpha, 0, 1);
}

export default function SmartStoryboardMasterComposerPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const cancelledRef = useRef(false);
  const [manifest, setManifest] = useState<SmartStoryboardManifest | null>(null);
  const [projects, setProjects] = useState<SceneProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Pronto para criar o Master");
  const [transition, setTransition] = useState<TransitionKind>("crossfade");
  const [transitionDuration, setTransitionDuration] = useState(0.65);
  const [result, setResult] = useState<MasterResult | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const parsed = parseStoryboardManifest(sessionStorage.getItem(SMART_STORYBOARD_MANIFEST_KEY), tenantId);
    setManifest(parsed);
    if (!parsed) {
      setProjects([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await Promise.all(parsed.scenes.map(async (scene) => {
        const response = await fetch(`/api/tenants/${tenantId}/media/projects/${scene.projectId}`, { headers: authHeaders(), cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.project?.id) throw new Error(`Cena ${scene.sceneIndex + 1} não pôde ser carregada`);
        return {
          id: String(data.project.id),
          title: String(data.project.title ?? `Cena ${scene.sceneIndex + 1}`),
          context: (data.project.context ?? {}) as SceneContext,
        } satisfies SceneProject;
      }));
      setProjects(rows);
      const saved = (parsed as ExtendedManifest).master;
      if (saved?.assetId && saved?.projectId) setResult({ assetId: saved.assetId, projectId: saved.projectId, url: saved.url, duration: saved.durationSeconds });
    } catch (error) {
      toast({ title: "Master indisponível", description: error instanceof Error ? error.message : "Falha ao carregar storyboard", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const ready = Boolean(manifest && projects.length === manifest.scenes.length && projects.length > 0);
  const ratio = (manifest?.targetFormat && OUTPUT_SIZE[manifest.targetFormat as Ratio] ? manifest.targetFormat : "9:16") as Ratio;
  const output = OUTPUT_SIZE[ratio];
  const totalSceneDuration = useMemo(() => projects.reduce((sum, project) => sum + sceneDuration(project.context), 0), [projects]);

  const createMaster = async () => {
    if (!tenantId || !manifest || !ready || rendering) return;
    if (typeof MediaRecorder === "undefined") {
      toast({ title: "Render Master não suportado", description: "Este navegador não liberou o codificador de vídeo.", variant: "destructive" });
      return;
    }
    cancelledRef.current = false;
    setRendering(true);
    setProgress(0);
    setStage("Preparando cenas, fontes e mídias");
    let audioContext: AudioContext | null = null;
    const runtimes: SceneRuntime[] = [];
    try {
      const fontNames = [...new Set(projects.flatMap((project) => (project.context.layers ?? []).map((layer) => layer.fontFamily).filter(Boolean) as string[]))];
      if (document.fonts?.load) await Promise.all(fontNames.map((family) => document.fonts.load(`700 32px "${family}"`).catch(() => [])));

      for (const project of projects) {
        const canvas = document.createElement("canvas");
        canvas.width = output.width;
        canvas.height = output.height;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("O navegador não liberou o motor gráfico.");
        const clip = project.context.clips?.find((item) => Boolean(item.url));
        const video = clip?.url ? await loadVideo(clip.url) : null;
        if (video && Number.isFinite(Number(clip?.trimIn)) && Number(clip?.trimIn) > 0) video.currentTime = Number(clip?.trimIn);
        const imageLayers = (project.context.layers ?? []).filter((layer) => layer.type === "image" && layer.url);
        const imageEntries = await Promise.all(imageLayers.map(async (layer) => [layer.id, await loadImage(layer.url!)] as const));
        runtimes.push({ project, duration: sceneDuration(project.context), video, images: new Map(imageEntries), canvas, ctx, started: false, gain: null });
      }

      const overlap = transition === "cut" ? 0 : clamp(transitionDuration, 0.2, 1.5);
      const durations = runtimes.map((runtime) => runtime.duration);
      const starts: number[] = [];
      runtimes.forEach((runtime, index) => {
        if (index === 0) starts.push(0);
        else starts.push((starts[index - 1] ?? 0) + runtimes[index - 1]!.duration - overlap);
      });
      const totalDuration = Math.max(0.5, (starts.at(-1) ?? 0) + (durations.at(-1) ?? 0));

      const canvas = document.createElement("canvas");
      canvas.width = output.width;
      canvas.height = output.height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas Master indisponível.");
      const canvasStream = canvas.captureStream(30);
      const mixed = new MediaStream(canvasStream.getVideoTracks());

      try {
        const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor && runtimes.some((runtime) => runtime.video)) {
          audioContext = new AudioContextCtor();
          const destination = audioContext.createMediaStreamDestination();
          for (const runtime of runtimes) {
            if (!runtime.video) continue;
            try {
              const source = audioContext.createMediaElementSource(runtime.video);
              const gain = audioContext.createGain();
              gain.gain.value = 0;
              source.connect(gain).connect(destination);
              runtime.gain = gain;
            } catch {
              runtime.video.muted = true;
            }
          }
          destination.stream.getAudioTracks().forEach((track) => mixed.addTrack(track));
          if (audioContext.state === "suspended") await audioContext.resume();
        }
      } catch {
        runtimes.forEach((runtime) => { if (runtime.video) runtime.video.muted = true; });
      }

      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(mixed, { mimeType, videoBitsPerSecond: 12_000_000, audioBitsPerSecond: 192_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Falha no codificador do Master."));
      });

      recorder.start(600);
      const startedAt = performance.now();
      setStage("Montando cenas e transições");

      await new Promise<void>((resolve, reject) => {
        const frame = () => {
          if (cancelledRef.current) {
            reject(new Error("Render Master cancelado."));
            return;
          }
          const now = (performance.now() - startedAt) / 1000;
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, output.width, output.height);

          runtimes.forEach((runtime, index) => {
            const start = starts[index] ?? 0;
            const end = start + runtime.duration;
            const active = now >= start && now <= end;
            const localTime = clamp(now - start, 0, runtime.duration);
            if (runtime.video) {
              if (active && !runtime.started) {
                runtime.started = true;
                const trimIn = Number(runtime.project.context.clips?.find((item) => item.url)?.trimIn ?? 0);
                runtime.video.currentTime = trimIn + localTime;
                void runtime.video.play().catch(() => undefined);
              } else if (!active && runtime.started && !runtime.video.paused) {
                runtime.video.pause();
              } else if (active && Math.abs((runtime.video.currentTime - Number(runtime.project.context.clips?.find((item) => item.url)?.trimIn ?? 0)) - localTime) > 0.55) {
                runtime.video.currentTime = Number(runtime.project.context.clips?.find((item) => item.url)?.trimIn ?? 0) + localTime;
              }
            }
            const alpha = active ? transitionAlpha(index, now, starts, durations, overlap, transition) : 0;
            if (runtime.gain && audioContext) runtime.gain.gain.setTargetAtTime(alpha, audioContext.currentTime, 0.035);
            if (!active || alpha <= 0) return;
            renderScene(runtime, localTime, output);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(runtime.canvas, 0, 0, output.width, output.height);
            ctx.restore();
          });

          setProgress(Math.min(99, Math.round(now / totalDuration * 100)));
          if (now >= totalDuration) {
            resolve();
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });

      runtimes.forEach((runtime) => runtime.video?.pause());
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) throw new Error("O Master terminou sem gerar arquivo.");

      setStage("Salvando Master na Biblioteca");
      const filename = `storyboard-master-${Date.now()}.webm`;
      const uploadRequestRes = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: filename, contentType: blob.type || "video/webm", type: "video", size: blob.size }),
      });
      const uploadRequest = await uploadRequestRes.json().catch(() => ({})) as { uploadURL?: string; objectPath?: string; error?: string };
      if (!uploadRequestRes.ok || !uploadRequest.uploadURL || !uploadRequest.objectPath) throw new Error(uploadRequest.error ?? "Falha ao preparar upload do Master.");
      const upload = await fetch(uploadRequest.uploadURL, { method: "PUT", headers: { "Content-Type": blob.type || "video/webm" }, body: blob });
      if (!upload.ok) throw new Error("Falha ao enviar o Master para a Biblioteca.");

      const assetRes = await fetch(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          type: "video",
          role: "output",
          source: "generated",
          storageUrl: uploadRequest.objectPath,
          originalFilename: filename,
          mimeType: blob.type || "video/webm",
          fileSize: blob.size,
          metadata: {
            renderer: "smart-storyboard-master-v1",
            ratio,
            width: output.width,
            height: output.height,
            durationSeconds: Number(totalDuration.toFixed(2)),
            sceneCount: runtimes.length,
            sceneProjectIds: runtimes.map((runtime) => runtime.project.id),
            transition,
            transitionDuration: overlap,
            preservesSceneAudio: mixed.getAudioTracks().length > 0,
          },
        }),
      });
      const assetData = await assetRes.json().catch(() => ({})) as { asset?: OutputAsset; error?: string };
      if (!assetRes.ok || !assetData.asset?.id) throw new Error(assetData.error ?? "Falha ao registrar o Master.");
      const rawUrl = assetData.asset.storageUrl ?? assetData.asset.storage_url ?? uploadRequest.objectPath;

      const projectRes = await fetch(`/api/tenants/${tenantId}/media/projects`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          title: `${manifest.directionName || "Storyboard"} · Master`,
          kind: "video",
          source: "smart_storyboard_master",
          context: {
            ratio,
            quality: "1080p",
            clips: [{ id: `master-${Date.now().toString(36)}`, name: "Storyboard Master", url: rawUrl, assetId: assetData.asset.id, sourceDuration: totalDuration, trimIn: 0, trimOut: totalDuration, transitionOut: "cut", transitionDuration: 0.3, motion: "none", beatLocked: false }],
            layers: [],
            storyboardMaster: {
              sourceManifestCreatedAt: manifest.createdAt,
              sceneProjectIds: runtimes.map((runtime) => runtime.project.id),
              designScore: manifest.designScore,
              directionName: manifest.directionName,
              transition,
              transitionDuration: overlap,
              assetId: assetData.asset.id,
              renderedAt: new Date().toISOString(),
            },
          },
        }),
      });
      const projectData = await projectRes.json().catch(() => ({}));
      if (!projectRes.ok || !projectData?.project?.id) throw new Error(projectData?.error ?? "Master salvo, mas o projeto final não pôde ser criado.");

      const master = {
        assetId: assetData.asset.id,
        projectId: String(projectData.project.id),
        url: rawUrl,
        durationSeconds: Number(totalDuration.toFixed(2)),
        transition,
        transitionDuration: overlap,
        renderedAt: new Date().toISOString(),
      } satisfies NonNullable<ExtendedManifest["master"]>;
      const nextManifest: ExtendedManifest = { ...manifest, master };
      sessionStorage.setItem(SMART_STORYBOARD_MANIFEST_KEY, JSON.stringify(nextManifest));
      setManifest(nextManifest);
      setResult({ assetId: master.assetId, projectId: master.projectId, url: master.url, duration: master.durationSeconds });
      setProgress(100);
      setStage("Master visual pronto para áudio final");
      toast({ title: "Storyboard Master concluído", description: `${runtimes.length} cenas foram unidas com ${transition === "cut" ? "corte seco" : transition === "fade-black" ? "fade preto" : "crossfade"}. Agora você pode aplicar locução, música, jingle e SFX.` });
    } catch (error) {
      setStage("Master não concluído");
      toast({ title: "Não foi possível criar o Master", description: error instanceof Error ? error.message : "Falha desconhecida", variant: "destructive" });
    } finally {
      runtimes.forEach((runtime) => {
        runtime.video?.pause();
        runtime.gain?.disconnect();
      });
      await audioContext?.close().catch(() => undefined);
      setRendering(false);
    }
  };

  if (!manifest) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-indigo-500/20 bg-card shadow-sm" data-testid="smart-storyboard-master">
      <div className="border-b border-border bg-gradient-to-r from-indigo-500/[0.08] via-card to-card px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Clapperboard className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Master do storyboard</h2><span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">{ratio}</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Une todas as pranchetas na ordem correta, mantém o design de cada cena, preserva o áudio original dos vídeos quando disponível e cria um único Master para a finalização de locução, música, jingle e efeitos.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || rendering} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar cenas</button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          {manifest.scenes.map((scene, index) => {
            const project = projects[index];
            return <div key={scene.projectId} className="rounded-2xl border border-border bg-muted/20 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cena {index + 1}</span>{project ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}</div><p className="mt-1 line-clamp-2 text-xs font-semibold text-foreground">{scene.headline}</p><p className="mt-1 text-[10px] text-muted-foreground">{project ? `${sceneDuration(project.context).toFixed(1)}s · mídia ${scene.mediaScore}/100` : "Carregando prancheta…"}</p></div>;
          })}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="space-y-1.5"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Transição entre cenas</span><select value={transition} onChange={(event) => setTransition(event.target.value as TransitionKind)} disabled={rendering} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="crossfade">Crossfade suave</option><option value="fade-black">Fade para preto</option><option value="cut">Corte seco</option></select></label>
          <label className="space-y-1.5"><span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span>Duração</span><span>{transition === "cut" ? "0s" : `${transitionDuration.toFixed(2)}s`}</span></span><input type="range" min={0.2} max={1.5} step={0.05} value={transitionDuration} disabled={transition === "cut" || rendering} onChange={(event) => setTransitionDuration(Number(event.target.value))} className="h-10 w-full accent-indigo-600" /></label>
          <button type="button" onClick={() => void createMaster()} disabled={!ready || rendering || loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40">{rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{rendering ? "Criando Master…" : "Criar Master final"}</button>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold text-foreground"><Film className="h-4 w-4 text-indigo-500" />{stage}</div><span className="text-xs font-semibold text-muted-foreground">{progress}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-indigo-600 transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground"><span>{manifest.scenes.length} cenas</span><span>•</span><span>{totalSceneDuration.toFixed(1)}s brutos</span><span>•</span><span>Design {manifest.designScore}/100</span></div>
        </div>

        {!ready && !loading && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-800 dark:text-amber-200"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />Alguma prancheta do storyboard não está disponível. Atualize as cenas antes de gerar o Master.</div>}

        {result && (
          <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div className="min-w-0 flex-1"><p className="font-semibold text-foreground">Master visual criado e salvo</p><p className="mt-1 text-xs text-muted-foreground">{result.duration.toFixed(1)}s · uma única versão do storyboard. A etapa seguinte usa o estúdio audiovisual existente para locução, música, jingle/SFX, ducking e normalização final.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(result.assetId)}&from=smart-storyboard-master`)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500"><Music2 className="h-3.5 w-3.5" />Finalizar áudio · locução + música + SFX</button><button type="button" onClick={() => navigate("/midias")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"><Library className="h-3.5 w-3.5" />Biblioteca</button></div></div></div>
          </div>
        )}
      </div>
    </section>
  );
}
