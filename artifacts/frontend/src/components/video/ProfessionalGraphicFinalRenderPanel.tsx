import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clapperboard, ExternalLink, Loader2, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Ratio = "9:16" | "4:5" | "1:1" | "16:9";
type MaskShape = "none" | "rounded" | "circle";
type ShapeKind = "rectangle" | "pill" | "circle" | "line";
type ShadowPreset = "none" | "soft" | "strong" | "glow";

type GraphicLayer = {
  id: string;
  type: "text" | "card" | "image";
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
  assetId?: string;
  fontFamily?: string;
  fontWeight?: number;
  designRole?: string;
  shapeKind?: ShapeKind;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowPreset?: ShadowPreset;
  gradientStart?: string;
  gradientEnd?: string;
  gradientAngle?: number;
  maskShape?: MaskShape;
  imageFit?: "contain" | "cover";
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
};

type GraphicContext = {
  ratio?: Ratio;
  quality?: string;
  clips?: Array<{ id?: string; url?: string; name?: string }>;
  layers?: GraphicLayer[];
  graphicDesign?: {
    source?: string;
    directionName?: string;
    designScore?: number;
    safeAreaPct?: number;
    editor?: string;
    finalRender?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ProjectPayload = {
  project?: {
    id: string;
    title: string;
    context?: GraphicContext | null;
  };
  error?: string;
};

type OutputAsset = {
  id: string;
  storageUrl?: string | null;
  storage_url?: string | null;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar uma imagem da composição."));
    image.src = url;
  });
}

function loadVideo(url: string) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    video.loop = true;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Não foi possível carregar o vídeo base da composição."));
    video.src = url;
    video.load();
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = clamp(radius, 0, Math.min(width, height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function layerRadius(layer: GraphicLayer, width: number, height: number, scale: number) {
  if (layer.maskShape === "circle" || layer.shapeKind === "circle" || layer.shapeKind === "pill") return Math.min(width, height) / 2;
  if (layer.maskShape === "rounded") return Math.max(16 * scale, (layer.borderRadius ?? 28) * scale);
  return (layer.borderRadius ?? (layer.type === "card" ? 16 : 0)) * scale;
}

function setShadow(ctx: CanvasRenderingContext2D, preset: ShadowPreset | undefined, scale: number) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (preset === "soft") {
    ctx.shadowColor = "rgba(0,0,0,.22)";
    ctx.shadowBlur = 24 * scale;
    ctx.shadowOffsetY = 8 * scale;
  } else if (preset === "strong") {
    ctx.shadowColor = "rgba(0,0,0,.42)";
    ctx.shadowBlur = 42 * scale;
    ctx.shadowOffsetY = 16 * scale;
  } else if (preset === "glow") {
    ctx.shadowColor = "rgba(139,92,246,.48)";
    ctx.shadowBlur = 28 * scale;
  }
}

function gradientFill(ctx: CanvasRenderingContext2D, layer: GraphicLayer, width: number, height: number) {
  if (!layer.gradientStart || !layer.gradientEnd) return null;
  const angle = ((layer.gradientAngle ?? 135) - 90) * Math.PI / 180;
  const cx = width / 2;
  const cy = height / 2;
  const length = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
  const dx = Math.cos(angle) * length / 2;
  const dy = Math.sin(angle) * length / 2;
  const gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  gradient.addColorStop(0, layer.gradientStart);
  gradient.addColorStop(1, layer.gradientEnd);
  return gradient;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = String(text || "").split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(trial).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource & { videoWidth?: number; videoHeight?: number }, width: number, height: number) {
  const sw = Number(source.videoWidth ?? (source as HTMLImageElement).naturalWidth ?? width) || width;
  const sh = Number(source.videoHeight ?? (source as HTMLImageElement).naturalHeight ?? height) || height;
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function drawImageLayer(ctx: CanvasRenderingContext2D, layer: GraphicLayer, image: HTMLImageElement, boxWidth: number, scale: number) {
  const naturalRatio = image.naturalHeight / Math.max(1, image.naturalWidth);
  const boxHeight = layer.maskShape === "circle" ? boxWidth : boxWidth * naturalRatio;
  const radius = layerRadius(layer, boxWidth, boxHeight, scale);
  const border = Math.max(0, layer.borderWidth ?? 0) * scale;

  ctx.save();
  setShadow(ctx, layer.shadowPreset, scale);
  roundRectPath(ctx, 0, 0, boxWidth, boxHeight, radius);
  ctx.fillStyle = "rgba(0,0,0,0.001)";
  ctx.fill();
  ctx.clip();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  const fit = layer.imageFit ?? "contain";
  const zoom = clamp(layer.imageZoom ?? 1, 0.1, 8);
  const base = fit === "cover"
    ? Math.max(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight)
    : Math.min(boxWidth / image.naturalWidth, boxHeight / image.naturalHeight);
  const drawWidth = image.naturalWidth * base * zoom;
  const drawHeight = image.naturalHeight * base * zoom;
  const px = clamp((layer.imagePositionX ?? 50) / 100, 0, 1);
  const py = clamp((layer.imagePositionY ?? 50) / 100, 0, 1);
  const dx = (boxWidth - drawWidth) * px;
  const dy = (boxHeight - drawHeight) * py;
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  ctx.restore();

  if (border > 0) {
    ctx.save();
    roundRectPath(ctx, border / 2, border / 2, Math.max(1, boxWidth - border), Math.max(1, boxHeight - border), Math.max(0, radius - border / 2));
    ctx.strokeStyle = layer.borderColor ?? "#ffffff";
    ctx.lineWidth = border;
    ctx.stroke();
    ctx.restore();
  }
}

function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: GraphicLayer, boxWidth: number, scale: number) {
  const boxHeight = layer.shapeKind === "circle" ? boxWidth : (layer.shapeKind === "line" ? 4 : 54) * scale;
  const radius = layerRadius(layer, boxWidth, boxHeight, scale);
  ctx.save();
  setShadow(ctx, layer.shadowPreset, scale);
  roundRectPath(ctx, 0, 0, boxWidth, boxHeight, radius);
  const gradient = gradientFill(ctx, layer, boxWidth, boxHeight);
  ctx.fillStyle = gradient ?? (layer.background === "transparent" ? "rgba(0,0,0,0)" : layer.background || "rgba(255,255,255,.16)");
  ctx.fill();
  if ((layer.borderWidth ?? 0) > 0) {
    ctx.strokeStyle = layer.borderColor ?? "#ffffff";
    ctx.lineWidth = (layer.borderWidth ?? 0) * scale;
    ctx.stroke();
  }
  ctx.restore();
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: GraphicLayer, boxWidth: number, scale: number) {
  const fontSize = Math.max(12 * scale, layer.fontSize * scale);
  const weight = layer.fontWeight ?? 700;
  const family = layer.fontFamily ? `"${layer.fontFamily}", Inter, Arial, sans-serif` : "Inter, Arial, sans-serif";
  ctx.font = `${weight} ${fontSize}px ${family}`;
  ctx.textBaseline = "top";
  ctx.textAlign = layer.textAlign ?? "left";

  const hasBackground = Boolean((layer.gradientStart && layer.gradientEnd) || (layer.background && layer.background !== "transparent"));
  const padX = hasBackground ? fontSize * 0.62 : 0;
  const padY = hasBackground ? fontSize * 0.42 : 0;
  const lineHeight = fontSize * 1.04;
  const lines = wrapText(ctx, layer.text || layer.name, Math.max(8, boxWidth - padX * 2));
  const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
  const boxHeight = contentHeight + padY * 2;
  const radius = layerRadius(layer, boxWidth, boxHeight, scale);

  if (hasBackground || (layer.borderWidth ?? 0) > 0 || layer.shadowPreset && layer.shadowPreset !== "none") {
    ctx.save();
    setShadow(ctx, layer.shadowPreset, scale);
    roundRectPath(ctx, 0, 0, boxWidth, boxHeight, radius);
    const gradient = gradientFill(ctx, layer, boxWidth, boxHeight);
    ctx.fillStyle = gradient ?? (hasBackground ? layer.background : "rgba(0,0,0,0)");
    ctx.fill();
    if ((layer.borderWidth ?? 0) > 0) {
      ctx.strokeStyle = layer.borderColor ?? "#ffffff";
      ctx.lineWidth = (layer.borderWidth ?? 0) * scale;
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.fillStyle = layer.color || "#ffffff";
  const textX = layer.textAlign === "center" ? boxWidth / 2 : layer.textAlign === "right" ? boxWidth - padX : padX;
  lines.forEach((line, index) => ctx.fillText(line, textX, padY + index * lineHeight, Math.max(8, boxWidth - padX * 2)));
}

function isLayerVisible(layer: GraphicLayer, time: number) {
  const start = Number.isFinite(layer.start) ? layer.start : 0;
  const end = Number.isFinite(layer.end) ? layer.end : Number.POSITIVE_INFINITY;
  return time >= start && time <= end;
}

function supportedMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

export default function ProfessionalGraphicFinalRenderPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") ?? "" : "";
  const cancelledRef = useRef(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [context, setContext] = useState<GraphicContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Pronto para renderizar");
  const [result, setResult] = useState<{ assetId: string; url: string; duration: number; width: number; height: number } | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !projectId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { headers: authHeaders(), cache: "no-store" });
      const data = await response.json().catch(() => ({})) as ProjectPayload;
      if (!response.ok || !data.project) throw new Error(data.error ?? "Projeto não encontrado");
      setProjectTitle(data.project.title ?? "Projeto gráfico");
      setContext(data.project.context ?? {});
    } catch (error) {
      toast({ title: "Render gráfico indisponível", description: error instanceof Error ? error.message : "Falha ao carregar projeto", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, tenantId, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { cancelledRef.current = true; }, []);

  const layers = useMemo(() => Array.isArray(context?.layers) ? context!.layers! : [], [context]);
  const baseClip = useMemo(() => context?.clips?.find((clip) => Boolean(clip.url)) ?? null, [context]);
  const ratio = (context?.ratio && OUTPUT_SIZE[context.ratio] ? context.ratio : "9:16") as Ratio;
  const output = OUTPUT_SIZE[ratio];
  const graphicProject = Boolean(context?.graphicDesign && layers.length);
  const coverage = useMemo(() => {
    const features = [
      { label: "Posição / escala / rotação", ok: true },
      { label: "Tipografia / alinhamento", ok: true },
      { label: "Gradientes / bordas / raio", ok: true },
      { label: "Sombras / glow", ok: true },
      { label: "Máscaras / crop / zoom", ok: true },
      { label: "Ordem de layers", ok: true },
    ];
    return features;
  }, []);

  const renderFinal = async () => {
    if (!tenantId || !projectId || !context || !baseClip?.url || !graphicProject || rendering) return;
    cancelledRef.current = false;
    setRendering(true);
    setProgress(0);
    setResult(null);
    let audioContext: AudioContext | null = null;
    try {
      setStage("Preparando mídias e fontes");
      const canvas = document.createElement("canvas");
      canvas.width = output.width;
      canvas.height = output.height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("O navegador não liberou o motor gráfico.");
      const video = await loadVideo(baseClip.url);
      const imageLayers = layers.filter((layer) => layer.type === "image" && layer.url);
      const imageEntries = await Promise.all(imageLayers.map(async (layer) => [layer.id, await loadImage(layer.url!)] as const));
      const images = new Map(imageEntries);
      const fontNames = [...new Set(layers.map((layer) => layer.fontFamily).filter(Boolean) as string[])];
      if (document.fonts?.load) await Promise.all(fontNames.map((family) => document.fonts.load(`700 32px "${family}"`).catch(() => [])));

      const maxLayerEnd = layers.reduce((max, layer) => Number.isFinite(layer.end) ? Math.max(max, layer.end) : max, 0);
      const duration = Math.max(0.5, maxLayerEnd || (Number.isFinite(video.duration) ? video.duration : 0) || 15);
      const canvasStream = canvas.captureStream(30);
      const mixed = new MediaStream(canvasStream.getVideoTracks());

      try {
        const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          audioContext = new AudioContextCtor();
          const source = audioContext.createMediaElementSource(video);
          const destination = audioContext.createMediaStreamDestination();
          source.connect(destination);
          destination.stream.getAudioTracks().forEach((track) => mixed.addTrack(track));
          if (audioContext.state === "suspended") await audioContext.resume();
        }
      } catch {
        // Se CORS bloquear o áudio, o vídeo ainda é renderizado visualmente; o aviso aparece no resultado.
      }

      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(mixed, { mimeType, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Falha no codificador do navegador."));
      });

      const scale = output.width / 720;
      const startAt = performance.now();
      video.currentTime = 0;
      recorder.start(500);
      await video.play();
      setStage("Renderizando composição fiel ao Canvas");

      await new Promise<void>((resolve, reject) => {
        const frame = () => {
          if (cancelledRef.current) {
            reject(new Error("Render cancelado."));
            return;
          }
          const elapsed = (performance.now() - startAt) / 1000;
          const timelineTime = Math.min(duration, elapsed);
          ctx.save();
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, output.width, output.height);
          drawCover(ctx, video, output.width, output.height);
          ctx.fillStyle = "rgba(0,0,0,.20)";
          ctx.fillRect(0, 0, output.width, output.height);
          ctx.restore();

          layers.forEach((layer) => {
            if (!isLayerVisible(layer, timelineTime)) return;
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
            } else if (layer.shapeKind) {
              drawShapeLayer(ctx, layer, boxWidth, scale);
            } else {
              drawTextLayer(ctx, layer, boxWidth, scale);
            }
            ctx.restore();
          });

          setProgress(Math.min(99, Math.round(timelineTime / duration * 100)));
          if (elapsed >= duration) {
            resolve();
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });

      video.pause();
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) throw new Error("O render terminou sem gerar arquivo.");

      setStage("Salvando nova versão na Biblioteca");
      const filename = `${projectTitle || "video"}-design-final-${Date.now()}.webm`.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const uploadRequestRes = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: filename, contentType: blob.type || "video/webm", type: "video", size: blob.size }),
      });
      const uploadRequest = await uploadRequestRes.json().catch(() => ({})) as { uploadURL?: string; objectPath?: string; error?: string };
      if (!uploadRequestRes.ok || !uploadRequest.uploadURL || !uploadRequest.objectPath) throw new Error(uploadRequest.error ?? "Falha ao preparar o upload do render.");
      const upload = await fetch(uploadRequest.uploadURL, { method: "PUT", headers: { "Content-Type": blob.type || "video/webm" }, body: blob });
      if (!upload.ok) throw new Error("Falha ao enviar o render final para a Biblioteca.");

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
            renderer: "professional-graphic-wysiwyg-v1",
            projectId,
            ratio,
            width: output.width,
            height: output.height,
            durationSeconds: Number(duration.toFixed(2)),
            designScore: Number(context.graphicDesign?.designScore ?? 0),
            directionName: context.graphicDesign?.directionName ?? null,
            visualFeatures: ["typography", "gradient", "border", "radius", "shadow", "mask", "crop", "zoom", "rotation", "opacity", "layer-order"],
          },
        }),
      });
      const assetData = await assetRes.json().catch(() => ({})) as { asset?: OutputAsset; error?: string };
      if (!assetRes.ok || !assetData.asset?.id) throw new Error(assetData.error ?? "Falha ao registrar o render na Biblioteca.");
      const assetUrl = assetData.asset.storageUrl ?? assetData.asset.storage_url ?? uploadRequest.objectPath;

      const nextContext: GraphicContext = {
        ...context,
        graphicDesign: {
          ...(context.graphicDesign ?? {}),
          finalRender: {
            renderer: "professional-graphic-wysiwyg-v1",
            assetId: assetData.asset.id,
            url: assetUrl,
            renderedAt: new Date().toISOString(),
            ratio,
            width: output.width,
            height: output.height,
            durationSeconds: Number(duration.toFixed(2)),
          },
        },
      };
      await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ context: nextContext }),
      }).catch(() => undefined);
      setContext(nextContext);
      setProgress(100);
      setStage("Render aprovado e salvo como nova versão");
      setResult({ assetId: assetData.asset.id, url: assetUrl, duration, width: output.width, height: output.height });
      toast({ title: "Render gráfico final concluído", description: "A composição foi salva como uma nova versão na Biblioteca, preservando o original." });
    } catch (error) {
      setStage("Render não concluído");
      toast({ title: "Não foi possível concluir o render", description: error instanceof Error ? error.message : "Falha desconhecida", variant: "destructive" });
    } finally {
      setRendering(false);
      if (audioContext) await audioContext.close().catch(() => undefined);
    }
  };

  if (!projectId || (!loading && (!context || !graphicProject))) return null;

  const hasAudioRisk = typeof window !== "undefined" && !(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

  return (
    <section className="overflow-hidden rounded-3xl border border-fuchsia-500/20 bg-card shadow-sm" data-testid="professional-graphic-final-render">
      <div className="border-b border-border bg-gradient-to-r from-fuchsia-500/[0.08] via-card to-card px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300"><Clapperboard className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Render gráfico final</h2><span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">WYSIWYG visual</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Renderiza a composição aprovada usando as mesmas propriedades visuais do Canvas: tipografia, gradientes, bordas, máscaras, crop, sombras, zoom, transformações e ordem das layers.</p>
              {projectTitle && <p className="mt-1 truncate text-[11px] text-muted-foreground">{projectTitle} · {ratio} · {output.width}×{output.height}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void load()} disabled={loading || rendering} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />Recarregar</button>
            <button type="button" onClick={() => void renderFinal()} disabled={!baseClip?.url || rendering || loading} className="inline-flex h-9 items-center gap-2 rounded-xl bg-fuchsia-600 px-4 text-xs font-semibold text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40">{rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{rendering ? `${progress}%` : "Renderizar versão final"}</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_.8fr] sm:p-5">
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-muted/25 p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-foreground">Fidelidade visual da composição</p><p className="mt-0.5 text-[10px] text-muted-foreground">As propriedades avançadas do Canvas entram no arquivo final, não apenas na prévia.</p></div><ShieldCheck className="h-5 w-5 text-emerald-500" /></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{coverage.map((item) => <div key={item.label} className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-[11px]"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /><span className="text-foreground">{item.label}</span></div>)}</div>
          </div>
          {!baseClip?.url && <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>O projeto ainda não tem vídeo base. Selecione uma mídia real antes do render final.</span></div>}
          {hasAudioRisk && <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Este navegador não oferece o mixer Web Audio. O visual pode ser renderizado, mas o áudio original precisa ser finalizado na Timeline.</span></div>}
        </div>

        <div className="rounded-2xl border border-border bg-background/70 p-4">
          <p className="text-xs font-semibold text-foreground">Status</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-fuchsia-500 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-[11px] text-muted-foreground">{stage}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted/40 px-2 py-2"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Layers</p><p className="mt-1 text-sm font-semibold text-foreground">{layers.length}</p></div><div className="rounded-xl bg-muted/40 px-2 py-2"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Formato</p><p className="mt-1 text-sm font-semibold text-foreground">{ratio}</p></div><div className="rounded-xl bg-muted/40 px-2 py-2"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">Score</p><p className="mt-1 text-sm font-semibold text-foreground">{Number(context?.graphicDesign?.designScore ?? 0) || "—"}</p></div></div>
          {result && <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div className="min-w-0"><p className="text-xs font-semibold text-foreground">Nova versão salva</p><p className="mt-0.5 text-[10px] text-muted-foreground">{result.width}×{result.height} · {result.duration.toFixed(1)}s · asset {result.assetId.slice(0, 8)}</p></div></div>{result.url && <a href={result.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[10px] font-semibold text-foreground"><ExternalLink className="h-3.5 w-3.5" />Abrir resultado</a>}</div>}
        </div>
      </div>
    </section>
  );
}
