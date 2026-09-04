import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Captions,
  CheckCircle2,
  Copy,
  Film,
  Image as ImageIcon,
  Layers3,
  Library,
  Loader2,
  Music2,
  Pause,
  Play,
  Redo2,
  RefreshCw,
  Save,
  Scissors,
  Settings2,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AiMusicGenerator from "@/components/video/AiMusicGenerator";
import { useMediaVideoHandoff } from "@/hooks/useMediaVideoHandoff";

type Ratio = "9:16" | "16:9" | "1:1" | "4:5";
type Quality = "720p" | "1080p";
type ToolPanel = "media" | "text" | "cards" | "audio" | "captions" | "settings";
type LayerType = "text" | "card" | "image";
type MusicMode = "none" | "brand" | "library" | "upload" | "ai";
type JobStatus = "idle" | "rendering" | "processing" | "done" | "error";
type TimelineGestureMode = "move" | "trim-start" | "trim-end";
type StageGestureMode = "move" | "resize";

type EditorLayer = {
  id: string;
  type: LayerType;
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
  url?: string;
  assetId?: string;
  localFile?: File;
};

type MediaAsset = {
  id: string;
  type: "video" | "image" | "audio" | "document";
  role?: string | null;
  storageUrl?: string | null;
  storage_url?: string | null;
  originalFilename?: string | null;
  original_filename?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
};

type LibraryTrack = MediaAsset & {
  usage?: {
    organicAllowed?: boolean;
    paidAdsAllowed?: boolean;
    expired?: boolean;
    reasons?: string[];
  };
};

type BrandKitPayload = {
  brandKit?: {
    default_music_asset_id?: string | null;
  } | null;
};

const CHANNELS: Array<{ id: string; label: string; hint: string; ratio: Ratio }> = [
  { id: "reels", label: "Reels", hint: "Instagram · 9:16", ratio: "9:16" },
  { id: "stories", label: "Stories", hint: "Instagram/Facebook · 9:16", ratio: "9:16" },
  { id: "shorts", label: "Shorts", hint: "YouTube · 9:16", ratio: "9:16" },
  { id: "feed", label: "Feed", hint: "Instagram/Meta · 4:5", ratio: "4:5" },
  { id: "youtube", label: "YouTube", hint: "Vídeo · 16:9", ratio: "16:9" },
  { id: "site", label: "Site / LP", hint: "Hero e seções · 16:9", ratio: "16:9" },
  { id: "whatsapp", label: "WhatsApp", hint: "Status e envio · 9:16", ratio: "9:16" },
];

const TOOL_ITEMS: Array<{ id: ToolPanel; label: string; icon: typeof Film }> = [
  { id: "media", label: "Mídia", icon: Library },
  { id: "text", label: "Texto", icon: Type },
  { id: "cards", label: "Cards", icon: Square },
  { id: "audio", label: "Áudio", icon: Music2 },
  { id: "captions", label: "Legendas", icon: Captions },
  { id: "settings", label: "Ajustes", icon: Settings2 },
];

const CARD_TEMPLATES = [
  { name: "Oferta", text: "OFERTA ESPECIAL\nFale com nossa equipe", background: "#111827", color: "#ffffff" },
  { name: "Benefício", text: "MAIS BENEFÍCIO\nResultado que faz diferença", background: "#0f766e", color: "#ffffff" },
  { name: "CTA", text: "QUERO SABER MAIS\nChame no WhatsApp", background: "#b91c1c", color: "#ffffff" },
  { name: "Destaque", text: "NOVIDADE\nConheça esta solução", background: "#6d28d9", color: "#ffffff" },
];

function tokenHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function assetUrl(asset: Pick<MediaAsset, "storageUrl" | "storage_url">): string {
  const value = asset.storageUrl ?? asset.storage_url ?? "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) return value;
  if (value.startsWith("/api/")) return value;
  if (value.startsWith("/objects/")) return `/api/storage${value}`;
  return value;
}

function assetName(asset: MediaAsset): string {
  return asset.originalFilename ?? asset.original_filename ?? "Mídia sem nome";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timeLabel(seconds: number): string {
  const safe = Math.max(0, seconds || 0);
  const min = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneLayers(layers: EditorLayer[]): EditorLayer[] {
  return layers.map((layer) => ({ ...layer }));
}

function outputDimensions(ratio: Ratio, quality: Quality): { width: number; height: number } {
  const long = quality === "1080p" ? 1920 : 1280;
  const short = quality === "1080p" ? 1080 : 720;
  if (ratio === "9:16") return { width: short, height: long };
  if (ratio === "16:9") return { width: long, height: short };
  if (ratio === "1:1") return { width: short, height: short };
  return { width: short, height: Math.round(short * 1.25) };
}

function drawContainedVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number) {
  const videoRatio = (video.videoWidth || width) / (video.videoHeight || height);
  const canvasRatio = width / height;
  let dw = width;
  let dh = height;
  let dx = 0;
  let dy = 0;
  if (videoRatio > canvasRatio) {
    dh = width / videoRatio;
    dy = (height - dh) / 2;
  } else {
    dw = height * videoRatio;
    dx = (width - dw) / 2;
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(video, dx, dy, dw, dh);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0] ?? "";
    for (let index = 1; index < words.length; index += 1) {
      const next = `${line} ${words[index]}`;
      if (ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = words[index] ?? "";
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines.slice(0, 8);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar uma imagem da timeline."));
    image.src = url;
  });
}

function layerIsVisible(layer: EditorLayer, time: number): boolean {
  return time >= layer.start && time <= layer.end;
}

function RangeField({ label, value, min, max, step = 1, suffix = "", onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{Number.isInteger(value) ? value : value.toFixed(1)}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-primary" />
    </label>
  );
}

export default function VideoTimelineEditor() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<number | null>(null);
  const layersRef = useRef<EditorLayer[]>([]);
  const historyRef = useRef<EditorLayer[][]>([[]]);
  const historyIndexRef = useRef(0);

  const [tool, setTool] = useState<ToolPanel>("media");
  const [channel, setChannel] = useState("reels");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [quality, setQuality] = useState<Quality>("720p");
  const [projectTitle, setProjectTitle] = useState("Novo projeto de vídeo");
  const [projectId, setProjectId] = useState(new URLSearchParams(window.location.search).get("projectId") ?? "");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [sourceAssetId, setSourceAssetId] = useState("");
  const [videoDuration, setVideoDuration] = useState(30);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const requestedMusicAssetId = useRef(new URLSearchParams(window.location.search).get("musicAssetId") ?? "");
  const [musicMode, setMusicMode] = useState<MusicMode>(requestedMusicAssetId.current ? "library" : "none");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicAssetId, setMusicAssetId] = useState(requestedMusicAssetId.current);
  const [musicTracks, setMusicTracks] = useState<LibraryTrack[]>([]);
  const [brandDefaultTrackId, setBrandDefaultTrackId] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.22);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [musicStart, setMusicStart] = useState(0);
  const [musicEnd, setMusicEnd] = useState(30);

  const [normalizeAudio, setNormalizeAudio] = useState(false);
  const [speed, setSpeed] = useState("1.0");
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [jobMessage, setJobMessage] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  const editorDuration = Math.max(0.1, trimEnd - trimStart);
  const previewTime = clamp(currentTime - trimStart, 0, editorDuration);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedTrack = musicTracks.find((track) => track.id === musicAssetId) ?? null;
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  void historyTick;

  const handoff = useMediaVideoHandoff({ tenantId, setVideoFile, setVideoPreview });

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    if (handoff.sourceMediaAssetId) setSourceAssetId(handoff.sourceMediaAssetId);
  }, [handoff.sourceMediaAssetId]);

  const recordHistory = useCallback((nextLayers: EditorLayer[]) => {
    const snapshot = cloneLayers(nextLayers);
    const previous = historyRef.current[historyIndexRef.current] ?? [];
    if (JSON.stringify(previous) === JSON.stringify(snapshot)) return;
    const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), snapshot].slice(-60);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistoryTick((value) => value + 1);
  }, []);

  const commitLayers = useCallback((nextLayers: EditorLayer[]) => {
    layersRef.current = nextLayers;
    setLayers(nextLayers);
    recordHistory(nextLayers);
  }, [recordHistory]);

  const resetLayerHistory = useCallback((nextLayers: EditorLayer[]) => {
    const snapshot = cloneLayers(nextLayers);
    layersRef.current = snapshot;
    setLayers(snapshot);
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
    setHistoryTick((value) => value + 1);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const next = cloneLayers(historyRef.current[historyIndexRef.current] ?? []);
    layersRef.current = next;
    setLayers(next);
    if (selectedLayerId && !next.some((layer) => layer.id === selectedLayerId)) setSelectedLayerId("");
    setHistoryTick((value) => value + 1);
  }, [selectedLayerId]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = cloneLayers(historyRef.current[historyIndexRef.current] ?? []);
    layersRef.current = next;
    setLayers(next);
    setHistoryTick((value) => value + 1);
  }, []);

  const duplicateLayer = useCallback((id = selectedLayerId) => {
    const source = layersRef.current.find((layer) => layer.id === id);
    if (!source) return;
    const duration = Math.max(0.1, source.end - source.start);
    const nextStart = clamp(source.start + 0.35, 0, Math.max(0, editorDuration - duration));
    const copy: EditorLayer = {
      ...source,
      id: uid(source.type),
      name: `${source.name} · cópia`,
      start: nextStart,
      end: Math.min(editorDuration, nextStart + duration),
      x: clamp(source.x + 2, 0, 95),
      y: clamp(source.y + 2, 0, 95),
    };
    commitLayers([...layersRef.current, copy]);
    setSelectedLayerId(copy.id);
  }, [commitLayers, editorDuration, selectedLayerId]);

  const removeLayer = useCallback((id: string) => {
    commitLayers(layersRef.current.filter((layer) => layer.id !== id));
    if (selectedLayerId === id) setSelectedLayerId("");
  }, [commitLayers, selectedLayerId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select") || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedLayerId && !isEditing) {
        event.preventDefault();
        duplicateLayer(selectedLayerId);
        return;
      }
      if (!isEditing && selectedLayerId && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        removeLayer(selectedLayerId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duplicateLayer, redo, removeLayer, selectedLayerId, undo]);

  const serializedContext = useMemo(() => ({
    editorVersion: 3,
    channel,
    ratio,
    quality,
    trimStart,
    trimEnd,
    sourceAssetId: sourceAssetId || null,
    layers: layers.map(({ localFile: _localFile, ...layer }) => layer),
    audio: {
      mode: musicMode,
      assetId: musicAssetId || null,
      volume: musicVolume,
      originalVolume,
      start: musicStart,
      end: musicEnd,
    },
  }), [channel, ratio, quality, trimStart, trimEnd, sourceAssetId, layers, musicMode, musicAssetId, musicVolume, originalVolume, musicStart, musicEnd]);

  const ensureProject = useCallback(async (): Promise<string> => {
    if (projectId) return projectId;
    if (!tenantId) throw new Error("Tenant não definido");
    const response = await fetch(`/api/tenants/${tenantId}/media/projects`, {
      method: "POST",
      headers: tokenHeaders(true),
      body: JSON.stringify({ title: projectTitle, kind: "video", source: "content_studio_editor", context: serializedContext }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o projeto");
    const id = String(data.project?.id ?? "");
    if (!id) throw new Error("Projeto criado sem identificação");
    setProjectId(id);
    window.history.replaceState(null, "", `${window.location.pathname}?projectId=${encodeURIComponent(id)}`);
    return id;
  }, [projectId, tenantId, projectTitle, serializedContext]);

  const saveProject = useCallback(async (silent = false) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const id = await ensureProject();
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${id}`, {
        method: "PATCH",
        headers: tokenHeaders(true),
        body: JSON.stringify({ title: projectTitle, context: serializedContext }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o projeto");
      setLastSavedAt(new Date());
      if (!silent) toast({ title: "Projeto salvo", description: "Timeline e configurações foram salvas na Central de Mídias." });
    } catch (error) {
      if (!silent) toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [tenantId, ensureProject, projectTitle, serializedContext, toast]);

  useEffect(() => {
    if (!projectId) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => { void saveProject(true); }, 900);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [projectId, serializedContext, projectTitle, saveProject]);

  const loadAssets = useCallback(async () => {
    if (!tenantId) return;
    setAssetsLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: tokenHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar biblioteca");
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (error) {
      toast({ title: "Biblioteca indisponível", description: error instanceof Error ? error.message : "Falha ao carregar mídias", variant: "destructive" });
    } finally {
      setAssetsLoading(false);
    }
  }, [tenantId, toast]);

  const loadMusic = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [tracksResponse, kitResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/tracks?limit=120`, { headers: tokenHeaders() }),
        fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, { headers: tokenHeaders() }),
      ]);
      const tracksData = await tracksResponse.json();
      const kitData = await kitResponse.json() as BrandKitPayload;
      setMusicTracks(Array.isArray(tracksData.tracks) ? tracksData.tracks : []);
      setBrandDefaultTrackId(kitData.brandKit?.default_music_asset_id ?? "");
    } catch {
      setMusicTracks([]);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadAssets();
    void loadMusic();
  }, [loadAssets, loadMusic]);

  useEffect(() => {
    const requested = requestedMusicAssetId.current;
    if (!requested || musicTracks.length === 0) return;
    if (musicTracks.some((track) => track.id === requested)) {
      setMusicMode("library");
      setMusicAssetId(requested);
      setTool("audio");
      requestedMusicAssetId.current = "";
    }
  }, [musicTracks]);

  useEffect(() => {
    if (!projectId || !tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { headers: tokenHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Projeto não encontrado");
        if (cancelled) return;
        const project = data.project ?? {};
        const context = project.context ?? {};
        setProjectTitle(project.title ?? "Projeto de vídeo");
        if (context.channel) setChannel(context.channel);
        if (["9:16", "16:9", "1:1", "4:5"].includes(context.ratio)) setRatio(context.ratio);
        if (["720p", "1080p"].includes(context.quality)) setQuality(context.quality);
        if (Number.isFinite(Number(context.trimStart))) setTrimStart(Number(context.trimStart));
        if (Number.isFinite(Number(context.trimEnd))) setTrimEnd(Number(context.trimEnd));
        resetLayerHistory(Array.isArray(context.layers) ? context.layers : []);
        const audio = context.audio ?? {};
        if (["none", "brand", "library", "upload", "ai"].includes(audio.mode)) setMusicMode(audio.mode);
        if (audio.assetId) setMusicAssetId(audio.assetId);
        if (Number.isFinite(Number(audio.volume))) setMusicVolume(Number(audio.volume));
        if (Number.isFinite(Number(audio.originalVolume))) setOriginalVolume(Number(audio.originalVolume));
        if (Number.isFinite(Number(audio.start))) setMusicStart(Number(audio.start));
        if (Number.isFinite(Number(audio.end))) setMusicEnd(Number(audio.end));
        const sourceId = typeof context.sourceAssetId === "string" ? context.sourceAssetId : "";
        if (sourceId) setSourceAssetId(sourceId);
        const projectAssets = Array.isArray(data.assets) ? data.assets as MediaAsset[] : [];
        const source = projectAssets.find((asset) => asset.id === sourceId) ?? projectAssets.find((asset) => asset.type === "video" && asset.role === "source");
        if (source) setVideoPreview(assetUrl(source));
      } catch (error) {
        toast({ title: "Não foi possível abrir o projeto", description: error instanceof Error ? error.message : "Projeto inválido", variant: "destructive" });
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, resetLayerHistory, tenantId, toast]);

  useEffect(() => {
    if (!sourceAssetId || videoPreview) return;
    const source = assets.find((asset) => asset.id === sourceAssetId && asset.type === "video");
    if (source) setVideoPreview(assetUrl(source));
  }, [assets, sourceAssetId, videoPreview]);

  const uploadAsset = useCallback(async (file: File, type: "video" | "image" | "audio", role: "source" | "reference" | "music"): Promise<MediaAsset | null> => {
    if (!tenantId) return null;
    try {
      const id = await ensureProject();
      const request = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
        method: "POST",
        headers: tokenHeaders(true),
        body: JSON.stringify({ projectId: id, name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
      });
      const prepared = await request.json();
      if (!request.ok) throw new Error(prepared.error ?? "Falha ao preparar upload");
      const uploadResponse = await fetch(prepared.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Falha ao enviar arquivo para a Central de Mídias");
      const register = await fetch(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        headers: tokenHeaders(true),
        body: JSON.stringify({
          projectId: id,
          type,
          role,
          source: "upload",
          storageUrl: prepared.objectPath,
          originalFilename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          metadata: type === "audio"
            ? {
                audioKind: "music",
                rights: {
                  status: "pending",
                  origin: "unknown",
                  commercialUse: false,
                  paidAds: false,
                  territories: ["*"],
                  expiresAt: null,
                  attributionRequired: false,
                  attributionText: null,
                  licenseReference: null,
                  evidenceAssetId: null,
                },
              }
            : {},
        }),
      });
      const registered = await register.json();
      if (!register.ok) throw new Error(registered.error ?? "Falha ao registrar mídia");
      await loadAssets();
      if (type === "audio") await loadMusic();
      return registered.asset ?? null;
    } catch (error) {
      toast({ title: "Mídia usada no editor, mas não foi salva na biblioteca", description: error instanceof Error ? error.message : "Falha no upload", variant: "destructive" });
      return null;
    }
  }, [ensureProject, loadAssets, loadMusic, tenantId, toast]);

  const chooseVideoFile = async (file: File) => {
    handoff.clearSource();
    const localUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoPreview(localUrl);
    setSourceAssetId("");
    setTrimStart(0);
    setCurrentTime(0);
    setResultUrl("");
    setJobStatus("idle");
    setProjectTitle((title) => title === "Novo projeto de vídeo" ? file.name.replace(/\.[^.]+$/, "") : title);
    const stored = await uploadAsset(file, "video", "source");
    if (stored?.id) setSourceAssetId(stored.id);
  };

  const chooseLibraryVideo = (asset: MediaAsset) => {
    handoff.clearSource();
    setVideoFile(null);
    setVideoPreview(assetUrl(asset));
    setSourceAssetId(asset.id);
    setTrimStart(0);
    setCurrentTime(0);
    setResultUrl("");
    setJobStatus("idle");
    toast({ title: "Vídeo adicionado à timeline", description: assetName(asset) });
  };

  const addTextLayer = (kind: "title" | "subtitle" | "cta" = "title") => {
    const defaults = kind === "title"
      ? { text: "Seu título aqui", fontSize: 54, y: 12 }
      : kind === "subtitle"
        ? { text: "Adicione uma mensagem de apoio", fontSize: 34, y: 70 }
        : { text: "Fale com nossa equipe", fontSize: 38, y: 82 };
    const layer: EditorLayer = {
      id: uid("text"),
      type: "text",
      name: kind === "cta" ? "CTA" : kind === "subtitle" ? "Subtítulo" : "Título",
      text: defaults.text,
      start: 0,
      end: Math.min(editorDuration, kind === "cta" ? editorDuration : 5),
      x: 8,
      y: defaults.y,
      width: 84,
      fontSize: defaults.fontSize,
      color: "#ffffff",
      background: "#000000",
      opacity: 1,
    };
    commitLayers([...layersRef.current, layer]);
    setSelectedLayerId(layer.id);
  };

  const addCardLayer = (template = CARD_TEMPLATES[0]) => {
    if (!template) return;
    const at = clamp(currentTime - trimStart, 0, Math.max(0, editorDuration - 0.1));
    const layer: EditorLayer = {
      id: uid("card"),
      type: "card",
      name: `Card · ${template.name}`,
      text: template.text,
      start: at,
      end: Math.min(editorDuration, at + 4),
      x: 8,
      y: 62,
      width: 84,
      fontSize: 36,
      color: template.color,
      background: template.background,
      opacity: 0.94,
    };
    commitLayers([...layersRef.current, layer]);
    setSelectedLayerId(layer.id);
  };

  const addImageFile = async (file: File) => {
    const layer: EditorLayer = {
      id: uid("image"),
      type: "image",
      name: file.name,
      text: "",
      start: 0,
      end: Math.min(editorDuration, 6),
      x: 60,
      y: 8,
      width: 32,
      fontSize: 32,
      color: "#ffffff",
      background: "#000000",
      opacity: 1,
      url: URL.createObjectURL(file),
      localFile: file,
    };
    commitLayers([...layersRef.current, layer]);
    setSelectedLayerId(layer.id);
    const stored = await uploadAsset(file, "image", "reference");
    if (stored?.id) {
      const next = layersRef.current.map((item) => item.id === layer.id ? { ...item, assetId: stored.id, url: assetUrl(stored) || item.url } : item);
      commitLayers(next);
    }
  };

  const addLibraryImage = (asset: MediaAsset) => {
    const layer: EditorLayer = {
      id: uid("image"),
      type: "image",
      name: assetName(asset),
      text: "",
      start: 0,
      end: Math.min(editorDuration, 6),
      x: 60,
      y: 8,
      width: 32,
      fontSize: 32,
      color: "#ffffff",
      background: "#000000",
      opacity: 1,
      url: assetUrl(asset),
      assetId: asset.id,
    };
    commitLayers([...layersRef.current, layer]);
    setSelectedLayerId(layer.id);
  };

  const updateLayer = (patch: Partial<EditorLayer>) => {
    if (!selectedLayerId) return;
    commitLayers(layersRef.current.map((layer) => layer.id === selectedLayerId ? { ...layer, ...patch } : layer));
  };

  const startStageGesture = (event: ReactPointerEvent<HTMLElement>, layer: EditorLayer, mode: StageGestureMode) => {
    event.preventDefault();
    event.stopPropagation();
    const stage = previewStageRef.current;
    if (!stage) return;
    setSelectedLayerId(layer.id);
    const rect = stage.getBoundingClientRect();
    const before = cloneLayers(layersRef.current);
    const startX = event.clientX;
    const startY = event.clientY;
    const original = { ...layer };

    const handleMove = (pointerEvent: PointerEvent) => {
      const dx = (pointerEvent.clientX - startX) / Math.max(1, rect.width) * 100;
      const dy = (pointerEvent.clientY - startY) / Math.max(1, rect.height) * 100;
      const next = layersRef.current.map((item) => {
        if (item.id !== layer.id) return item;
        if (mode === "resize") return { ...item, width: clamp(original.width + dx, 10, Math.max(10, 100 - original.x)) };
        return {
          ...item,
          x: clamp(original.x + dx, 0, Math.max(0, 100 - original.width)),
          y: clamp(original.y + dy, 0, 95),
        };
      });
      layersRef.current = next;
      setLayers(next);
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (JSON.stringify(before) !== JSON.stringify(layersRef.current)) recordHistory(layersRef.current);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const startTimelineGesture = (event: ReactPointerEvent<HTMLElement>, layer: EditorLayer, mode: TimelineGestureMode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedLayerId(layer.id);
    const track = mode === "move" ? event.currentTarget.parentElement : event.currentTarget.parentElement?.parentElement;
    if (!(track instanceof HTMLElement)) return;
    const rect = track.getBoundingClientRect();
    const before = cloneLayers(layersRef.current);
    const startX = event.clientX;
    const original = { ...layer };
    const originalDuration = Math.max(0.1, original.end - original.start);

    const handleMove = (pointerEvent: PointerEvent) => {
      const delta = (pointerEvent.clientX - startX) / Math.max(1, rect.width) * editorDuration;
      const next = layersRef.current.map((item) => {
        if (item.id !== layer.id) return item;
        if (mode === "trim-start") return { ...item, start: clamp(original.start + delta, 0, original.end - 0.1) };
        if (mode === "trim-end") return { ...item, end: clamp(original.end + delta, original.start + 0.1, editorDuration) };
        const start = clamp(original.start + delta, 0, Math.max(0, editorDuration - originalDuration));
        return { ...item, start, end: start + originalDuration };
      });
      layersRef.current = next;
      setLayers(next);
    };

    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (JSON.stringify(before) !== JSON.stringify(layersRef.current)) recordHistory(layersRef.current);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const selectChannel = (id: string) => {
    const preset = CHANNELS.find((item) => item.id === id);
    if (!preset) return;
    setChannel(id);
    setRatio(preset.ratio);
  };

  const pollJob = async (jobId: string): Promise<string> => {
    setJobStatus("processing");
    setJobMessage("Convertendo para MP4 e registrando na Biblioteca Audiovisual…");
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: tokenHeaders() });
      const data = await response.json();
      if (data.status === "done") return String(data.videoUrl ?? "");
      if (data.status === "error") throw new Error(data.error ?? "Erro no processamento do vídeo");
    }
    throw new Error("O processamento excedeu o tempo esperado.");
  };

  const finalizeWebm = async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append("video", new File([blob], `${projectTitle || "vendorai-video"}.webm`, { type: blob.type || "video/webm" }));
    form.append("removeSilence", "false");
    form.append("normalize", String(normalizeAudio));
    form.append("speed", speed);
    const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/edit`, {
      method: "POST",
      headers: tokenHeaders(),
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível finalizar o vídeo");
    return await pollJob(String(data.jobId));
  };

  const renderTimeline = async () => {
    if (!tenantId || !videoPreview || jobStatus === "rendering" || jobStatus === "processing") return;
    setJobStatus("rendering");
    setJobMessage("Renderizando camadas, cards, imagens e áudio da timeline…");
    setResultUrl("");
    try {
      await saveProject(true);
      const { width, height } = outputDimensions(ratio, quality);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Seu navegador não liberou o motor gráfico do editor.");

      const renderVideo = document.createElement("video");
      renderVideo.src = videoPreview;
      renderVideo.preload = "auto";
      renderVideo.crossOrigin = "anonymous";
      renderVideo.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        renderVideo.onloadedmetadata = () => resolve();
        renderVideo.onerror = () => reject(new Error("Não foi possível abrir o vídeo para renderização."));
        renderVideo.load();
      });

      const renderLayers = cloneLayers(layersRef.current);
      const imageEntries = await Promise.all(
        renderLayers.filter((layer) => layer.type === "image" && layer.url).map(async (layer) => [layer.id, await loadImage(layer.url!)] as const),
      );
      const imageMap = new Map(imageEntries);
      const canvasStream = canvas.captureStream(30);
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const audioContext = AudioContextCtor ? new AudioContextCtor() : null;
      let destination: MediaStreamAudioDestinationNode | null = null;
      let musicSourceNode: AudioBufferSourceNode | null = null;

      if (audioContext) {
        destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createMediaElementSource(renderVideo);
        const originalGain = audioContext.createGain();
        originalGain.gain.value = originalVolume;
        source.connect(originalGain).connect(destination);

        let musicBlob: Blob | null = null;
        if (musicMode === "upload" && musicFile) musicBlob = musicFile;
        const effectiveMusicAssetId = musicAssetId || (musicMode === "brand" ? brandDefaultTrackId : "");
        if (!musicBlob && effectiveMusicAssetId) {
          const track = musicTracks.find((item) => item.id === effectiveMusicAssetId);
          const url = track ? assetUrl(track) : "";
          if (url) {
            const response = await fetch(url, { headers: url.startsWith("/api/") ? tokenHeaders() : undefined });
            if (response.ok) musicBlob = await response.blob();
          }
        }
        if (musicBlob && musicMode !== "none" && musicEnd > musicStart) {
          const buffer = await audioContext.decodeAudioData(await musicBlob.arrayBuffer());
          musicSourceNode = audioContext.createBufferSource();
          musicSourceNode.buffer = buffer;
          musicSourceNode.loop = true;
          const musicGain = audioContext.createGain();
          musicGain.gain.value = musicVolume;
          musicSourceNode.connect(musicGain).connect(destination);
        }
      }

      const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...(destination?.stream.getAudioTracks() ?? [])]);
      const preferredTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = preferredTypes.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
      const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType, videoBitsPerSecond: quality === "1080p" ? 8_000_000 : 4_000_000 } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Falha durante a renderização local."));
      });

      const drawFrame = () => {
        const time = clamp(renderVideo.currentTime - trimStart, 0, editorDuration);
        drawContainedVideo(ctx, renderVideo, width, height);
        for (const layer of renderLayers) {
          if (!layerIsVisible(layer, time)) continue;
          ctx.save();
          ctx.globalAlpha = clamp(layer.opacity, 0, 1);
          const x = width * layer.x / 100;
          const y = height * layer.y / 100;
          const maxWidth = width * layer.width / 100;
          if (layer.type === "image") {
            const image = imageMap.get(layer.id);
            if (image) {
              const drawWidth = Math.min(maxWidth, width - x);
              const drawHeight = drawWidth * image.naturalHeight / Math.max(1, image.naturalWidth);
              ctx.drawImage(image, x, y, drawWidth, Math.min(drawHeight, height - y));
            }
          } else {
            const scale = width / 720;
            const fontSize = Math.max(14, layer.fontSize * scale);
            ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
            ctx.textBaseline = "top";
            const padding = 16 * scale;
            const lines = wrapText(ctx, layer.text, Math.max(40, maxWidth - padding * 2));
            const lineHeight = fontSize * 1.18;
            if (layer.type === "card") {
              ctx.fillStyle = layer.background;
              ctx.fillRect(x, y, maxWidth, lines.length * lineHeight + padding * 2);
            } else if (layer.background !== "transparent" && layer.background !== "") {
              ctx.fillStyle = `${layer.background}cc`;
              const textWidth = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width), 0) + padding * 2);
              ctx.fillRect(x, y, textWidth, lines.length * lineHeight + padding * 2);
            }
            ctx.fillStyle = layer.color;
            lines.forEach((line, index) => ctx.fillText(line, x + (layer.type === "card" ? padding : 0), y + (layer.type === "card" ? padding : 0) + index * lineHeight, maxWidth - padding));
          }
          ctx.restore();
        }
      };

      renderVideo.currentTime = trimStart;
      await new Promise<void>((resolve) => {
        const handler = () => { renderVideo.removeEventListener("seeked", handler); resolve(); };
        renderVideo.addEventListener("seeked", handler);
        window.setTimeout(resolve, 350);
      });
      drawFrame();
      if (audioContext) await audioContext.resume();
      recorder.start(1000);
      const audioNow = audioContext?.currentTime ?? 0;
      if (musicSourceNode) {
        musicSourceNode.start(audioNow + Math.max(0, musicStart));
        musicSourceNode.stop(audioNow + Math.min(editorDuration, Math.max(musicStart + 0.1, musicEnd)));
      }
      await renderVideo.play();

      await new Promise<void>((resolve) => {
        const loop = () => {
          drawFrame();
          const elapsed = renderVideo.currentTime - trimStart;
          setJobMessage(`Renderizando timeline… ${Math.min(99, Math.round(elapsed / editorDuration * 100))}%`);
          if (renderVideo.ended || renderVideo.currentTime >= trimEnd - 0.02) {
            renderVideo.pause();
            resolve();
            return;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      musicSourceNode?.disconnect();
      await audioContext?.close();
      canvasStream.getTracks().forEach((track) => track.stop());
      const webm = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      if (!webm.size) throw new Error("A renderização terminou sem gerar arquivo.");
      const finalUrl = await finalizeWebm(webm);
      if (!finalUrl) throw new Error("O vídeo foi processado, mas o arquivo final não foi retornado.");
      setResultUrl(finalUrl);
      setJobStatus("done");
      setJobMessage("Vídeo pronto e salvo na Biblioteca Audiovisual.");
      toast({ title: "Vídeo finalizado", description: "A versão MP4 foi registrada na Central de Mídias e já pode ser reutilizada nos canais do VendorAI." });
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "Falha ao renderizar o vídeo");
      toast({ title: "Falha na renderização", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    }
  };

  const applyAutomaticCaption = async () => {
    const source = resultUrl || videoPreview;
    if (!source || !tenantId) return;
    setJobStatus("processing");
    setJobMessage("Gerando legendas automáticas com sincronização de fala…");
    try {
      const response = await fetch(source, { headers: source.startsWith("/api/") ? tokenHeaders() : undefined });
      if (!response.ok) throw new Error("Não foi possível carregar o vídeo para legendagem.");
      const blob = await response.blob();
      const form = new FormData();
      form.append("video", new File([blob], "video-legenda.mp4", { type: blob.type || "video/mp4" }));
      const start = await fetch(`/api/tenants/${tenantId}/content-studio/video/caption`, { method: "POST", headers: tokenHeaders(), body: form });
      const data = await start.json();
      if (!start.ok) throw new Error(data.error ?? "Falha ao iniciar legendagem");
      const url = await pollJob(String(data.jobId));
      setResultUrl(url);
      setJobStatus("done");
      setJobMessage("Legenda automática aplicada e salva como nova versão.");
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "Falha ao aplicar legenda");
    }
  };

  const onVideoMetadata = () => {
    const video = previewRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    setVideoDuration(video.duration);
    setTrimEnd((current) => current === 30 || current <= 0 || current > video.duration ? video.duration : current);
    setMusicEnd((current) => current === 30 || current <= 0 || current > video.duration ? video.duration : current);
    if (video.currentTime < trimStart || video.currentTime > video.duration) video.currentTime = trimStart;
  };

  const togglePlayback = () => {
    const video = previewRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime < trimStart || video.currentTime >= trimEnd) video.currentTime = trimStart;
      void video.play();
    } else {
      video.pause();
    }
  };

  const seekTimeline = (seconds: number) => {
    const video = previewRef.current;
    if (!video) return;
    const absolute = trimStart + clamp(seconds, 0, editorDuration);
    video.currentTime = absolute;
    setCurrentTime(absolute);
  };

  const mediaImages = assets.filter((asset) => asset.type === "image");
  const mediaVideos = assets.filter((asset) => asset.type === "video");
  const ratioCss = ratio.replace(":", " / ");

  const PropertiesPanel = selectedLayer ? (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{selectedLayer.name}</p>
          <p className="text-xs text-muted-foreground">{selectedLayer.type === "image" ? "Imagem" : selectedLayer.type === "card" ? "Card" : "Texto"}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={() => duplicateLayer(selectedLayer.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Duplicar"><Copy className="h-4 w-4" /></button>
          <button onClick={() => removeLayer(selectedLayer.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="rounded-lg border bg-muted/30 px-2.5 py-2 text-[10px] text-muted-foreground">Arraste no preview para reposicionar. Use a alça no canto para redimensionar.</div>
      {selectedLayer.type !== "image" && (
        <label className="block space-y-1.5">
          <span className="text-xs text-muted-foreground">Conteúdo</span>
          <textarea value={selectedLayer.text} onChange={(event) => updateLayer({ text: event.target.value })} rows={4} className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Início</span><input type="number" min={0} max={editorDuration} step={0.1} value={selectedLayer.start.toFixed(1)} onChange={(event) => updateLayer({ start: clamp(Number(event.target.value), 0, selectedLayer.end - 0.1) })} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Fim</span><input type="number" min={0.1} max={editorDuration} step={0.1} value={selectedLayer.end.toFixed(1)} onChange={(event) => updateLayer({ end: clamp(Number(event.target.value), selectedLayer.start + 0.1, editorDuration) })} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" /></label>
      </div>
      <RangeField label="Posição horizontal" value={selectedLayer.x} min={0} max={Math.max(0, 100 - selectedLayer.width)} onChange={(value) => updateLayer({ x: value })} suffix="%" />
      <RangeField label="Posição vertical" value={selectedLayer.y} min={0} max={95} onChange={(value) => updateLayer({ y: value })} suffix="%" />
      <RangeField label="Largura" value={selectedLayer.width} min={10} max={Math.max(10, 100 - selectedLayer.x)} onChange={(value) => updateLayer({ width: value })} suffix="%" />
      {selectedLayer.type !== "image" && <RangeField label="Tamanho do texto" value={selectedLayer.fontSize} min={18} max={96} onChange={(value) => updateLayer({ fontSize: value })} />}
      <RangeField label="Opacidade" value={selectedLayer.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateLayer({ opacity: value })} />
      {selectedLayer.type !== "image" && <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><span className="text-xs text-muted-foreground">Texto</span><input type="color" value={selectedLayer.color} onChange={(event) => updateLayer({ color: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label><label className="space-y-1.5"><span className="text-xs text-muted-foreground">Fundo</span><input type="color" value={selectedLayer.background || "#000000"} onChange={(event) => updateLayer({ background: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label></div>}
    </div>
  ) : (
    <div className="space-y-4">
      <div><p className="text-sm font-semibold">Projeto</p><p className="text-xs text-muted-foreground">Selecione uma camada no preview ou na timeline para editar.</p></div>
      <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
        <p>• Arraste textos, cards e imagens diretamente no preview.</p>
        <p>• Arraste blocos na timeline para mudar o momento de exibição.</p>
        <p>• Use Ctrl/Cmd+Z para desfazer e Ctrl/Cmd+D para duplicar.</p>
      </div>
    </div>
  );

  const ToolContent = (() => {
    if (tool === "text") return <div className="space-y-3"><div><p className="text-sm font-semibold">Adicionar texto</p><p className="text-xs text-muted-foreground">Crie faixas escritas independentes na timeline.</p></div><button onClick={() => addTextLayer("title")} className="w-full rounded-xl border p-3 text-left hover:border-primary/40 hover:bg-primary/5"><p className="font-semibold">Título</p><p className="text-xs text-muted-foreground">Gancho ou headline principal</p></button><button onClick={() => addTextLayer("subtitle")} className="w-full rounded-xl border p-3 text-left hover:border-primary/40 hover:bg-primary/5"><p className="font-medium">Subtítulo</p><p className="text-xs text-muted-foreground">Mensagem de apoio e benefício</p></button><button onClick={() => addTextLayer("cta")} className="w-full rounded-xl border p-3 text-left hover:border-primary/40 hover:bg-primary/5"><p className="font-medium">CTA</p><p className="text-xs text-muted-foreground">WhatsApp, site ou chamada final</p></button></div>;
    if (tool === "cards") return <div className="space-y-3"><div><p className="text-sm font-semibold">Cards</p><p className="text-xs text-muted-foreground">Blocos visuais prontos para oferta, benefícios e CTA.</p></div>{CARD_TEMPLATES.map((template) => <button key={template.name} onClick={() => addCardLayer(template)} className="w-full rounded-xl border p-3 text-left hover:border-primary/40"><div className="h-12 rounded-lg p-2 text-xs font-bold" style={{ background: template.background, color: template.color }}>{template.text.split("\n").map((line) => <div key={line}>{line}</div>)}</div><p className="mt-2 text-xs font-medium">{template.name}</p></button>)}</div>;
    if (tool === "audio") return (
      <div className="space-y-4">
        <div><p className="text-sm font-semibold">Áudio e trilha</p><p className="text-xs text-muted-foreground">Áudio original, Biblioteca, Brand Kit, upload ou música com IA.</p></div>
        <div className="grid grid-cols-2 gap-2">{(["none", "brand", "library", "upload", "ai"] as MusicMode[]).map((mode) => <button key={mode} onClick={() => { setMusicMode(mode); if (mode === "brand") setMusicAssetId(brandDefaultTrackId); }} className={cn("rounded-lg border px-2 py-2 text-xs", musicMode === mode ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground")}>{mode === "none" ? "Sem trilha" : mode === "brand" ? "Brand Kit" : mode === "library" ? "Biblioteca" : mode === "upload" ? "Enviar áudio" : "Gerar IA"}</button>)}</div>
        {musicMode === "upload" && <button onClick={() => musicInputRef.current?.click()} className="w-full rounded-xl border border-dashed p-4 text-sm hover:border-primary/40"><Upload className="mx-auto mb-2 h-5 w-5" />{musicFile?.name ?? "Selecionar arquivo de áudio"}</button>}
        {(musicMode === "library" || musicMode === "brand") && <div className="max-h-52 space-y-2 overflow-y-auto pr-1">{musicTracks.map((track) => { const allowed = track.usage?.organicAllowed !== false; const active = musicAssetId === track.id; return <button key={track.id} disabled={!allowed} onClick={() => setMusicAssetId(track.id)} className={cn("w-full rounded-xl border p-2.5 text-left text-xs", active ? "border-primary bg-primary/5" : "", !allowed && "opacity-50")}><p className="truncate font-medium">{assetName(track)}</p><p className="mt-1 text-[10px] text-muted-foreground">{allowed ? track.usage?.paidAdsAllowed ? "Comercial + mídia paga liberados" : "Uso orgânico liberado" : "Direitos pendentes/restritos"}</p></button>; })}</div>}
        {musicMode === "ai" && <div className="vendor-light-module overflow-hidden rounded-xl"><AiMusicGenerator tenantId={tenantId} onGenerated={async (assetId) => { await loadMusic(); setMusicMode("library"); setMusicAssetId(assetId); }} /></div>}
        <RangeField label="Áudio original" value={originalVolume} min={0} max={1.5} step={0.05} onChange={setOriginalVolume} />
        {musicMode !== "none" && <><RangeField label="Volume da trilha" value={musicVolume} min={0} max={1} step={0.05} onChange={setMusicVolume} /><div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-xs text-muted-foreground">Início</span><input className="h-9 w-full rounded-lg border bg-background px-2 text-sm" type="number" min={0} max={editorDuration} step={0.1} value={musicStart} onChange={(event) => setMusicStart(clamp(Number(event.target.value), 0, editorDuration))} /></label><label className="space-y-1"><span className="text-xs text-muted-foreground">Fim</span><input className="h-9 w-full rounded-lg border bg-background px-2 text-sm" type="number" min={0.1} max={editorDuration} step={0.1} value={musicEnd} onChange={(event) => setMusicEnd(clamp(Number(event.target.value), 0.1, editorDuration))} /></label></div></>}
      </div>
    );
    if (tool === "captions") return <div className="space-y-3"><div><p className="text-sm font-semibold">Legendas</p><p className="text-xs text-muted-foreground">Use textos manuais ou legenda automática sincronizada.</p></div><button onClick={() => addTextLayer("subtitle")} className="w-full rounded-xl border p-3 text-left hover:border-primary/40"><p className="font-medium">Faixa manual</p><p className="text-xs text-muted-foreground">Controle conteúdo, posição, início e fim.</p></button><button disabled={!videoPreview || jobStatus === "processing"} onClick={() => void applyAutomaticCaption()} className="w-full rounded-xl bg-foreground px-3 py-2.5 text-sm font-semibold text-background disabled:opacity-40"><Captions className="mr-2 inline h-4 w-4" />Legenda automática</button><p className="text-[11px] text-muted-foreground">A legenda automática cria uma nova versão usando o Brand Video Kit ativo.</p></div>;
    if (tool === "settings") return <div className="space-y-4"><div><p className="text-sm font-semibold">Ajustes de saída</p><p className="text-xs text-muted-foreground">Tratamento aplicado depois da composição.</p></div><label className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">Normalizar volume</p><p className="text-xs text-muted-foreground">Equaliza o resultado final</p></div><input type="checkbox" checked={normalizeAudio} onChange={(event) => setNormalizeAudio(event.target.checked)} className="accent-primary" /></label><label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Velocidade final</span><select value={speed} onChange={(event) => setSpeed(event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="1.0">Normal · 1x</option><option value="1.1">Levemente rápido · 1.1x</option><option value="1.25">Rápido · 1.25x</option></select></label><div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">Fluxo não destrutivo</p><p className="mt-1">O original continua intacto; cada exportação vira uma nova mídia.</p></div></div>;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Central de Mídias</p><p className="text-xs text-muted-foreground">Use arquivos existentes ou envie novos.</p></div><button onClick={() => void loadAssets()} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><RefreshCw className={cn("h-4 w-4", assetsLoading && "animate-spin")} /></button></div>
        <div className="grid grid-cols-3 gap-2"><button onClick={() => videoInputRef.current?.click()} className="rounded-xl border border-dashed p-3 text-xs hover:border-primary/40"><Film className="mx-auto mb-1.5 h-4 w-4" />Vídeo</button><button onClick={() => imageInputRef.current?.click()} className="rounded-xl border border-dashed p-3 text-xs hover:border-primary/40"><ImageIcon className="mx-auto mb-1.5 h-4 w-4" />Imagem</button><button onClick={() => { setTool("audio"); setMusicMode("upload"); musicInputRef.current?.click(); }} className="rounded-xl border border-dashed p-3 text-xs hover:border-primary/40"><Music2 className="mx-auto mb-1.5 h-4 w-4" />Áudio</button></div>
        {mediaVideos.length > 0 && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Vídeos recentes</p>{mediaVideos.slice(0, 6).map((asset) => <button key={asset.id} onClick={() => chooseLibraryVideo(asset)} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left hover:border-primary/30"><Film className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-xs">{assetName(asset)}</span></button>)}</div>}
        {mediaImages.length > 0 && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Imagens recentes</p><div className="grid grid-cols-2 gap-2">{mediaImages.slice(0, 8).map((asset) => <button key={asset.id} onClick={() => addLibraryImage(asset)} className="overflow-hidden rounded-xl border text-left hover:border-primary/40"><div className="aspect-video bg-muted"><img src={assetUrl(asset)} alt="" className="h-full w-full object-cover" /></div><p className="truncate p-1.5 text-[10px]">{assetName(asset)}</p></button>)}</div></div>}
      </div>
    );
  })();

  const trackRows: Array<{ id: string; label: string; icon: typeof Film; items: EditorLayer[] }> = [
    { id: "text", label: "Texto", icon: Type, items: layers.filter((layer) => layer.type === "text") },
    { id: "card", label: "Cards", icon: Square, items: layers.filter((layer) => layer.type === "card") },
    { id: "image", label: "Imagens", icon: ImageIcon, items: layers.filter((layer) => layer.type === "image") },
  ];

  const renderPreviewLayer = (layer: EditorLayer) => {
    const style: CSSProperties = { position: "absolute", left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, opacity: layer.opacity };
    const selected = selectedLayerId === layer.id;
    return (
      <div key={layer.id} style={style} className={cn("group touch-none select-none", selected && "z-20")} onPointerDown={(event) => startStageGesture(event, layer, "move")}>
        {layer.type === "image"
          ? <img src={layer.url} alt="" draggable={false} className={cn("block h-auto max-h-[85%] w-full object-contain", selected && "outline outline-2 outline-primary")} />
          : <div style={{ color: layer.color, background: layer.type === "card" ? layer.background : "transparent", fontSize: `${Math.max(11, layer.fontSize * 0.38)}px`, whiteSpace: "pre-wrap" }} className={cn("rounded-lg p-2 font-bold leading-tight", selected && "outline outline-2 outline-primary")}>{layer.text}</div>}
        {selected && <button type="button" aria-label="Redimensionar camada" onPointerDown={(event) => startStageGesture(event, layer, "resize")} className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow" />}
      </div>
    );
  };

  const renderTimelineLayer = (layer: EditorLayer) => (
    <div key={layer.id}
      onPointerDown={(event) => startTimelineGesture(event, layer, "move")}
      className={cn(
        "absolute inset-y-1 touch-none select-none overflow-hidden rounded px-2 text-left text-[10px] leading-6 text-white",
        layer.type === "text" ? "bg-blue-500/80" : layer.type === "card" ? "bg-violet-500/80" : "bg-emerald-500/80",
        selectedLayerId === layer.id && "ring-2 ring-primary ring-offset-1",
      )}
      style={{ left: `${layer.start / editorDuration * 100}%`, width: `${Math.max(1, (layer.end - layer.start) / editorDuration * 100)}%` }}>
      <button type="button" aria-label="Ajustar início" onPointerDown={(event) => startTimelineGesture(event, layer, "trim-start")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/35" />
      <span className="pointer-events-none block truncate px-1">{layer.name}</span>
      <button type="button" aria-label="Ajustar fim" onPointerDown={(event) => startTimelineGesture(event, layer, "trim-end")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/35" />
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background text-foreground">
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseVideoFile(file); event.target.value = ""; }} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { Array.from(event.target.files ?? []).slice(0, 8).forEach((file) => { void addImageFile(file); }); event.target.value = ""; }} />
      <input ref={musicInputRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setMusicFile(file); setMusicMode("upload"); void (async () => { const stored = await uploadAsset(file, "audio", "music"); if (stored?.id) setMusicAssetId(stored.id); })(); event.target.value = ""; }} />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2 lg:px-6">
          <button onClick={() => navigate("/content-studio/video")} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-[180px] flex-1"><input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} className="w-full max-w-md bg-transparent text-base font-semibold outline-none" /><p className="text-[11px] text-muted-foreground">Editor universal · {lastSavedAt ? `salvo às ${lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : projectId ? "salvamento automático ativo" : "novo projeto"}</p></div>
          <div className="hidden items-center gap-1 rounded-lg border bg-muted/30 p-1 xl:flex">{CHANNELS.map((item) => <button key={item.id} onClick={() => selectChannel(item.id)} title={item.hint} className={cn("rounded-md px-2 py-1.5 text-[11px] font-medium", channel === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>)}</div>
          <div className="flex items-center rounded-lg border bg-background"><button onClick={undo} disabled={!canUndo} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Desfazer · Ctrl/Cmd+Z"><Undo2 className="h-3.5 w-3.5" /></button><button onClick={redo} disabled={!canRedo} className="border-l p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Refazer · Ctrl/Cmd+Y"><Redo2 className="h-3.5 w-3.5" /></button></div>
          <select value={ratio} onChange={(event) => setRatio(event.target.value as Ratio)} className="h-9 rounded-lg border bg-background px-2 text-xs"><option value="9:16">9:16</option><option value="4:5">4:5</option><option value="1:1">1:1</option><option value="16:9">16:9</option></select>
          <select value={quality} onChange={(event) => setQuality(event.target.value as Quality)} className="h-9 rounded-lg border bg-background px-2 text-xs"><option value="720p">720p</option><option value="1080p">1080p</option></select>
          <button onClick={() => void saveProject(false)} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar</button>
          <button onClick={() => void renderTimeline()} disabled={!videoPreview || jobStatus === "rendering" || jobStatus === "processing"} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40"><WandSparkles className="h-4 w-4" />Exportar MP4</button>
        </div>
      </header>

      <div className="grid min-h-[660px] grid-cols-1 xl:grid-cols-[76px_270px_minmax(420px,1fr)_280px]">
        <nav className="flex gap-1 overflow-x-auto border-b bg-card p-2 xl:flex-col xl:border-b-0 xl:border-r">{TOOL_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTool(item.id)} className={cn("flex min-w-[66px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium", tool === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-4 w-4" />{item.label}</button>; })}</nav>
        <aside className="max-h-[660px] overflow-y-auto border-b bg-card p-4 xl:border-b-0 xl:border-r">{ToolContent}</aside>

        <main className="flex min-w-0 flex-col bg-muted/20">
          <div className="flex flex-1 items-center justify-center p-4 lg:p-6">
            <div ref={previewStageRef} className="relative flex max-h-[540px] w-full max-w-3xl items-center justify-center overflow-hidden rounded-2xl bg-black shadow-xl" style={{ aspectRatio: ratioCss }}>
              {videoPreview ? <>
                <video ref={previewRef} src={videoPreview} className="h-full w-full object-contain" playsInline onLoadedMetadata={onVideoMetadata} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => { const video = event.currentTarget; setCurrentTime(video.currentTime); if (video.currentTime >= trimEnd) { video.pause(); video.currentTime = trimStart; } }} />
                <div className="absolute inset-0">{layers.filter((layer) => layerIsVisible(layer, previewTime)).map(renderPreviewLayer)}</div>
                <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-white backdrop-blur"><button onClick={togglePlayback}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><span className="text-[11px] tabular-nums">{timeLabel(previewTime)} / {timeLabel(editorDuration)}</span></div>
              </> : <button onClick={() => videoInputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70 hover:text-white"><div className="rounded-2xl bg-white/10 p-4"><Upload className="h-7 w-7" /></div><div className="text-center"><p className="font-semibold">Adicione o vídeo principal</p><p className="mt-1 text-xs text-white/50">Upload ou selecione da Central de Mídias</p></div></button>}
            </div>
          </div>
          {(jobStatus !== "idle" || resultUrl) && <div className="border-t bg-background px-4 py-3"><div className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", jobStatus === "error" ? "border-destructive/30 bg-destructive/5" : jobStatus === "done" ? "border-emerald-500/30 bg-emerald-500/5" : "bg-muted/30")}>{jobStatus === "rendering" || jobStatus === "processing" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : jobStatus === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-destructive" />}<span className="min-w-0 flex-1 text-xs">{jobMessage}</span>{resultUrl && <><a href={resultUrl} target="_blank" rel="noreferrer" className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium">Abrir resultado</a><button onClick={() => void applyAutomaticCaption()} className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium"><Captions className="mr-1 inline h-3.5 w-3.5" />Legendar</button></>}</div></div>}
        </main>

        <aside className="max-h-[660px] overflow-y-auto border-t bg-card p-4 xl:border-l xl:border-t-0">{PropertiesPanel}</aside>
      </div>

      <section className="border-t bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-semibold">Timeline</span><span className="text-[10px] text-muted-foreground">{layers.length} camada{layers.length === 1 ? "" : "s"}</span></div><div className="flex items-center gap-3 text-[10px] text-muted-foreground"><span>Arraste blocos · puxe as bordas para cortar</span><span className="flex items-center gap-1"><Scissors className="h-3.5 w-3.5" />Corte {timeLabel(trimStart)} → {timeLabel(trimEnd)}</span></div></div>
        <div className="overflow-x-auto p-3">
          <div className="min-w-[820px]">
            <div className="mb-1 ml-28 grid grid-cols-5 text-[9px] text-muted-foreground">{[0, .25, .5, .75, 1].map((point) => <span key={point}>{timeLabel(editorDuration * point)}</span>)}</div>
            <div className="space-y-1.5">
              <div className="flex h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] font-medium"><Film className="h-3.5 w-3.5" />Vídeo</div><div className="relative h-8 flex-1 rounded-md bg-muted" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seekTimeline((event.clientX - rect.left) / rect.width * editorDuration); }}><div className="absolute inset-y-1 rounded bg-slate-700/80 px-2 text-[10px] leading-6 text-white" style={{ left: 0, width: "100%" }}>{videoPreview ? projectTitle : "Sem vídeo"}</div><div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${previewTime / editorDuration * 100}%` }} /></div></div>
              {trackRows.map((row) => { const Icon = row.icon; return <div key={row.id} className="flex min-h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{row.label}</div><div className="relative h-8 flex-1 rounded-md bg-muted/70" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seekTimeline((event.clientX - rect.left) / rect.width * editorDuration); }}>{row.items.map(renderTimelineLayer)}<div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${previewTime / editorDuration * 100}%` }} /></div></div>; })}
              <div className="flex h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><Volume2 className="h-3.5 w-3.5" />Áudio</div><div className="relative h-8 flex-1 rounded-md bg-muted/70">{musicMode !== "none" && <div className="absolute inset-y-1 rounded bg-amber-500/80 px-2 text-[10px] leading-6 text-white" style={{ left: `${musicStart / editorDuration * 100}%`, width: `${Math.max(1, (musicEnd - musicStart) / editorDuration * 100)}%` }}>{musicMode === "upload" ? (musicFile?.name ?? (selectedTrack ? assetName(selectedTrack) : "Áudio")) : selectedTrack ? assetName(selectedTrack) : musicMode === "brand" ? "Brand Kit" : "Trilha"}</div>}<div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${previewTime / editorDuration * 100}%` }} /></div></div>
            </div>
            {videoPreview && <div className="mt-3 grid grid-cols-2 gap-4 border-t pt-3"><RangeField label="Início do corte" value={trimStart} min={0} max={Math.max(0.1, trimEnd - 0.1)} step={0.1} suffix="s" onChange={(value) => { setTrimStart(value); if (previewRef.current) previewRef.current.currentTime = value; }} /><RangeField label="Fim do corte" value={trimEnd} min={Math.min(videoDuration, trimStart + 0.1)} max={videoDuration} step={0.1} suffix="s" onChange={setTrimEnd} /></div>}
          </div>
        </div>
      </section>
    </div>
  );
}
