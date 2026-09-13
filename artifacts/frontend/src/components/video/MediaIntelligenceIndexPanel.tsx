import { useCallback, useEffect, useMemo, useState } from "react";
import { Database, Image as ImageIcon, Loader2, RefreshCw, ScanSearch, ShieldCheck, Sparkles, Video } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { assetLabel, assetUrl, type ProfessionalMediaAsset } from "./professional-video";

type VisualZone = "left" | "right" | "top" | "bottom" | "center";
type TargetFormat = "9:16" | "4:5" | "1:1" | "16:9";

type SubjectBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
};

type MediaIntelligence = {
  version: 1;
  status: "ready" | "partial";
  analyzedAt: string;
  source: "pixels+metadata" | "pixels" | "metadata" | "fallback";
  dimensions: {
    width: number | null;
    height: number | null;
    aspectRatio: number | null;
    orientation: "portrait" | "landscape" | "square" | "unknown";
  };
  composition: {
    activityGrid: number[];
    averageLuminance: number;
    contrast: number;
    detail: number;
    whitespaceSide: VisualZone;
    subjectSide: VisualZone;
    focalPoint: { x: number; y: number };
  };
  dominantColors: string[];
  quality: {
    score: number;
    resolution: number;
    exposure: number;
    contrast: number;
    detail: number;
  };
  subjects: {
    count: number;
    labels: string[];
    boxes: SubjectBox[];
  };
  crops: Array<{
    format: TargetFormat;
    x: number;
    y: number;
    width: number;
    height: number;
    subjectSafe: boolean | null;
  }>;
  searchTags: string[];
};

const MAX_BATCH = 24;
const TARGET_FORMATS: Array<{ format: TargetFormat; ratio: number }> = [
  { format: "9:16", ratio: 9 / 16 },
  { format: "4:5", ratio: 4 / 5 },
  { format: "1:1", ratio: 1 },
  { format: "16:9", ratio: 16 / 9 },
];

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeUnit(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 1 ? clamp01(parsed / 100) : clamp01(parsed);
}

function normalizeBox(raw: unknown, fallbackLabel: string): SubjectBox | null {
  const source = asRecord(raw);
  const x = normalizeUnit(source.x ?? source.left);
  const y = normalizeUnit(source.y ?? source.top);
  let width = normalizeUnit(source.width ?? source.w);
  let height = normalizeUnit(source.height ?? source.h);
  const right = normalizeUnit(source.right);
  const bottom = normalizeUnit(source.bottom);
  if (width === null && x !== null && right !== null) width = Math.max(0, right - x);
  if (height === null && y !== null && bottom !== null) height = Math.max(0, bottom - y);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) return null;
  const rawConfidence = Number(source.confidence ?? source.score ?? 1);
  const confidence = Number.isFinite(rawConfidence) ? clamp01(rawConfidence > 1 ? rawConfidence / 100 : rawConfidence) : 1;
  if (confidence < 0.3) return null;
  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
    label: String(source.label ?? source.type ?? source.class ?? fallbackLabel).trim() || fallbackLabel,
    confidence,
  };
}

function subjectBoxes(metadata: Record<string, unknown> | null | undefined): SubjectBox[] {
  const root = asRecord(metadata);
  const prior = asRecord(root.mediaIntelligence);
  const priorSubjects = asRecord(prior.subjects);
  const collections: Array<[unknown, string]> = [
    [root.faces, "face"],
    [root.people, "person"],
    [root.persons, "person"],
    [root.products, "product"],
    [root.objects, "object"],
    [root.detections, "subject"],
    [root.subjects, "subject"],
    [priorSubjects.boxes, "subject"],
  ];
  const boxes: SubjectBox[] = [];
  for (const [raw, label] of collections) {
    if (!Array.isArray(raw)) continue;
    raw.forEach((item) => {
      const box = normalizeBox(item, label);
      if (box) boxes.push(box);
    });
  }
  for (const key of ["faceBox", "personBox", "productBox", "subjectBox", "focalBox"] as const) {
    const box = normalizeBox(root[key], key.replace("Box", ""));
    if (box) boxes.push(box);
  }
  return boxes.slice(0, 16);
}

function semanticLabels(metadata: Record<string, unknown> | null | undefined, boxes: SubjectBox[]): string[] {
  const root = asRecord(metadata);
  const priorSubjects = asRecord(asRecord(root.mediaIntelligence).subjects);
  const candidates = [
    ...(Array.isArray(priorSubjects.labels) ? priorSubjects.labels : []),
    ...boxes.map((box) => box.label),
    ...(Array.isArray(root.tags) ? root.tags : []),
    ...(Array.isArray(root.keywords) ? root.keywords : []),
  ];
  return Array.from(new Set(candidates.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean))).slice(0, 16);
}

function zoneScores(grid: number[]) {
  const avg = (indexes: number[]) => indexes.reduce((sum, index) => sum + (grid[index] ?? 0), 0) / Math.max(1, indexes.length);
  return {
    left: avg([0, 3, 6]),
    right: avg([2, 5, 8]),
    top: avg([0, 1, 2]),
    bottom: avg([6, 7, 8]),
    center: avg([1, 3, 4, 5, 7]),
  } satisfies Record<VisualZone, number>;
}

function zoneFromGrid(grid: number[], mode: "min" | "max"): VisualZone {
  const entries = Object.entries(zoneScores(grid)) as Array<[VisualZone, number]>;
  entries.sort((a, b) => mode === "min" ? a[1] - b[1] : b[1] - a[1]);
  return entries[0]?.[0] ?? "center";
}

function orientation(width: number | null, height: number | null): MediaIntelligence["dimensions"]["orientation"] {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.08) return "square";
  return ratio > 1 ? "landscape" : "portrait";
}

function focalPoint(grid: number[], boxes: SubjectBox[]) {
  if (boxes.length) {
    let weight = 0;
    let x = 0;
    let y = 0;
    boxes.forEach((box) => {
      const w = Math.max(0.1, box.confidence * box.width * box.height);
      weight += w;
      x += (box.x + box.width / 2) * w;
      y += (box.y + box.height / 2) * w;
    });
    if (weight > 0) return { x: clamp01(x / weight), y: clamp01(y / weight) };
  }
  let bestIndex = 4;
  let bestValue = -1;
  grid.forEach((value, index) => {
    if (value > bestValue) {
      bestValue = value;
      bestIndex = index;
    }
  });
  return { x: ((bestIndex % 3) + 0.5) / 3, y: (Math.floor(bestIndex / 3) + 0.5) / 3 };
}

function cropForFormat(sourceAspect: number | null, targetAspect: number, focal: { x: number; y: number }, boxes: SubjectBox[]) {
  if (!sourceAspect || sourceAspect <= 0) return { x: 0, y: 0, width: 1, height: 1, subjectSafe: boxes.length ? false : null };
  let width = 1;
  let height = 1;
  if (sourceAspect > targetAspect) width = targetAspect / sourceAspect;
  else if (sourceAspect < targetAspect) height = sourceAspect / targetAspect;
  const x = clamp01(Math.min(1 - width, Math.max(0, focal.x - width / 2)));
  const y = clamp01(Math.min(1 - height, Math.max(0, focal.y - height / 2)));
  const subjectSafe = boxes.length
    ? boxes.every((box) => box.x >= x - 0.015 && box.y >= y - 0.015 && box.x + box.width <= x + width + 0.015 && box.y + box.height <= y + height + 0.015)
    : null;
  return { x, y, width, height, subjectSafe };
}

function rgbToHex(r: number, g: number, b: number) {
  const hex = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

function dominantColors(data: Uint8ClampedArray): string[] {
  const bins = new Map<string, { count: number; r: number; g: number; b: number }>();
  const pixelCount = Math.floor(data.length / 4);
  const step = Math.max(1, Math.floor(pixelCount / 1800));
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const offset = pixel * 4;
    const alpha = data[offset + 3] ?? 0;
    if (alpha < 120) continue;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const qr = Math.round(r / 32) * 32;
    const qg = Math.round(g / 32) * 32;
    const qb = Math.round(b / 32) * 32;
    const key = `${qr}-${qg}-${qb}`;
    const current = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    current.count += 1;
    current.r += r;
    current.g += g;
    current.b += b;
    bins.set(key, current);
  }
  return Array.from(bins.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((bin) => rgbToHex(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count));
}

async function loadDrawable(asset: ProfessionalMediaAsset): Promise<HTMLImageElement | HTMLVideoElement> {
  const url = assetUrl(asset);
  if (!url) throw new Error("Mídia sem URL");
  if (asset.type === "video") {
    return await new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.onloadeddata = () => resolve(video);
      video.onerror = () => reject(new Error("Frame do vídeo indisponível"));
      video.src = url;
      video.load();
    });
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Imagem indisponível para leitura"));
    image.src = url;
  });
}

function analyseDrawable(drawable: HTMLImageElement | HTMLVideoElement) {
  const sourceWidth = drawable instanceof HTMLVideoElement ? drawable.videoWidth : drawable.naturalWidth;
  const sourceHeight = drawable instanceof HTMLVideoElement ? drawable.videoHeight : drawable.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("Dimensões indisponíveis");
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível");
  const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(drawable, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float32Array(canvas.width * canvas.height);
  let luminanceSum = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    const luminance = ((data[offset] ?? 0) * 0.2126 + (data[offset + 1] ?? 0) * 0.7152 + (data[offset + 2] ?? 0) * 0.0722) / 255;
    gray[i] = luminance;
    luminanceSum += luminance;
  }
  const averageLuminance = luminanceSum / gray.length;
  let varianceSum = 0;
  let edgeSum = 0;
  const cellSums = new Array<number>(9).fill(0);
  const cellCounts = new Array<number>(9).fill(0);
  for (let y = 0; y < canvas.height - 1; y += 1) {
    for (let x = 0; x < canvas.width - 1; x += 1) {
      const index = y * canvas.width + x;
      const luminance = gray[index] ?? 0;
      varianceSum += (luminance - averageLuminance) ** 2;
      const edge = Math.abs(luminance - (gray[index + 1] ?? luminance)) + Math.abs(luminance - (gray[index + canvas.width] ?? luminance));
      edgeSum += edge;
      const gx = Math.min(2, Math.floor((x / canvas.width) * 3));
      const gy = Math.min(2, Math.floor((y / canvas.height) * 3));
      const cell = gy * 3 + gx;
      cellSums[cell] = (cellSums[cell] ?? 0) + edge;
      cellCounts[cell] = (cellCounts[cell] ?? 0) + 1;
    }
  }
  const rawGrid = cellSums.map((sum, index) => sum / Math.max(1, cellCounts[index] ?? 1));
  const min = Math.min(...rawGrid);
  const max = Math.max(...rawGrid, min + 0.001);
  const activityGrid = rawGrid.map((value) => Math.round(clamp(22 + ((value - min) / (max - min)) * 73)));
  const contrast = Math.sqrt(varianceSum / Math.max(1, gray.length - 1));
  const detail = edgeSum / Math.max(1, (canvas.width - 1) * (canvas.height - 1));
  return {
    width: sourceWidth,
    height: sourceHeight,
    activityGrid,
    averageLuminance,
    contrast,
    detail,
    colors: dominantColors(data),
  };
}

function metadataDimensions(asset: ProfessionalMediaAsset) {
  const metadata = asRecord(asset.metadata);
  const intelligence = asRecord(metadata.mediaIntelligence);
  const dimensions = asRecord(intelligence.dimensions);
  const width = numberOrNull(dimensions.width ?? metadata.width ?? metadata.pixelWidth);
  const height = numberOrNull(dimensions.height ?? metadata.height ?? metadata.pixelHeight);
  return { width, height };
}

function fallbackGrid(asset: ProfessionalMediaAsset): number[] {
  const intelligence = asRecord(asRecord(asset.metadata).mediaIntelligence);
  const composition = asRecord(intelligence.composition);
  if (Array.isArray(composition.activityGrid) && composition.activityGrid.length >= 9) {
    return composition.activityGrid.slice(0, 9).map((value) => Math.round(clamp(Number(value) || 0)));
  }
  return [44, 48, 46, 49, 55, 50, 43, 47, 45];
}

function qualityMetrics(width: number | null, height: number | null, luminance: number, contrast: number, detail: number) {
  const megapixels = width && height ? (width * height) / 1_000_000 : 0;
  const resolution = megapixels > 0 ? Math.round(clamp(42 + Math.min(1, megapixels / 2.5) * 58)) : 55;
  const exposureDistance = Math.abs(luminance - 0.52);
  const exposure = Math.round(clamp(100 - exposureDistance * 170));
  const contrastScore = Math.round(clamp(45 + contrast * 260));
  const detailScore = Math.round(clamp(42 + detail * 420));
  const score = Math.round(clamp(resolution * 0.34 + exposure * 0.22 + contrastScore * 0.20 + detailScore * 0.24));
  return { score, resolution, exposure, contrast: contrastScore, detail: detailScore };
}

function makeSearchTags(asset: ProfessionalMediaAsset, labels: string[]) {
  const metadata = asRecord(asset.metadata);
  const values = [
    assetLabel(asset),
    metadata.title,
    metadata.description,
    metadata.category,
    metadata.productName,
    metadata.product,
    metadata.aiRole,
    ...(Array.isArray(metadata.tags) ? metadata.tags : []),
    ...(Array.isArray(metadata.keywords) ? metadata.keywords : []),
    ...labels,
  ];
  const tokens = values
    .map((value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
    .join(" ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  return Array.from(new Set(tokens)).slice(0, 28);
}

async function buildIntelligence(asset: ProfessionalMediaAsset): Promise<MediaIntelligence> {
  const metadata = asRecord(asset.metadata);
  const prior = asRecord(metadata.mediaIntelligence);
  const boxes = subjectBoxes(asset.metadata);
  const labels = semanticLabels(asset.metadata, boxes);
  const fallbackDimensions = metadataDimensions(asset);
  const priorComposition = asRecord(prior.composition);
  let width = fallbackDimensions.width;
  let height = fallbackDimensions.height;
  let grid = fallbackGrid(asset);
  let averageLuminance = Number(priorComposition.averageLuminance ?? 0.5);
  let contrast = Number(priorComposition.contrast ?? 0.16);
  let detail = Number(priorComposition.detail ?? 0.10);
  let colors = Array.isArray(prior.dominantColors) ? prior.dominantColors.map(String).slice(0, 5) : [];
  let source: MediaIntelligence["source"] = boxes.length ? "metadata" : "fallback";
  let status: MediaIntelligence["status"] = "partial";

  try {
    const drawable = await loadDrawable(asset);
    const measured = analyseDrawable(drawable);
    width = measured.width;
    height = measured.height;
    grid = measured.activityGrid;
    averageLuminance = measured.averageLuminance;
    contrast = measured.contrast;
    detail = measured.detail;
    colors = measured.colors;
    source = boxes.length ? "pixels+metadata" : "pixels";
    status = "ready";
    if (drawable instanceof HTMLVideoElement) {
      drawable.pause();
      drawable.removeAttribute("src");
      drawable.load();
    }
  } catch {
    status = Object.keys(prior).length ? (String(prior.status) === "ready" ? "ready" : "partial") : "partial";
  }

  const aspectRatio = width && height ? width / height : null;
  const focal = focalPoint(grid, boxes);
  const quality = qualityMetrics(width, height, averageLuminance, contrast, detail);
  const crops = TARGET_FORMATS.map(({ format, ratio }) => ({ format, ...cropForFormat(aspectRatio, ratio, focal, boxes) }));
  const priorTags = Array.isArray(prior.searchTags) ? prior.searchTags.map(String) : [];
  const searchTags = Array.from(new Set([...priorTags, ...makeSearchTags(asset, labels)])).slice(0, 32);

  return {
    version: 1,
    status,
    analyzedAt: new Date().toISOString(),
    source,
    dimensions: {
      width,
      height,
      aspectRatio,
      orientation: orientation(width, height),
    },
    composition: {
      activityGrid: grid,
      averageLuminance: Number.isFinite(averageLuminance) ? Number(averageLuminance.toFixed(4)) : 0.5,
      contrast: Number.isFinite(contrast) ? Number(contrast.toFixed(4)) : 0.16,
      detail: Number.isFinite(detail) ? Number(detail.toFixed(4)) : 0.10,
      whitespaceSide: zoneFromGrid(grid, "min"),
      subjectSide: boxes.length ? "center" : zoneFromGrid(grid, "max"),
      focalPoint: focal,
    },
    dominantColors: colors,
    quality,
    subjects: {
      count: boxes.length,
      labels,
      boxes,
    },
    crops,
    searchTags,
  };
}

function intelligenceOf(asset: ProfessionalMediaAsset): Record<string, unknown> {
  return asRecord(asRecord(asset.metadata).mediaIntelligence);
}

function qualityOf(asset: ProfessionalMediaAsset): number | null {
  const value = Number(asRecord(intelligenceOf(asset).quality).score);
  return Number.isFinite(value) ? value : null;
}

function zoneLabel(value: unknown) {
  if (value === "left") return "esquerda";
  if (value === "right") return "direita";
  if (value === "top") return "topo";
  if (value === "bottom") return "base";
  if (value === "center") return "centro";
  return "—";
}

function statusOf(asset: ProfessionalMediaAsset) {
  return String(intelligenceOf(asset).status ?? "");
}

export default function MediaIntelligenceIndexPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const loadAssets = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [imagesRes, videosRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=150`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=150`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      if (!imagesRes.ok || !videosRes.ok) throw new Error("Falha ao consultar a Biblioteca de Mídia");
      const [imagesData, videosData] = await Promise.all([imagesRes.json(), videosRes.json()]);
      const rows = [imagesData, videosData].flatMap((payload) => Array.isArray(payload.assets) ? payload.assets as ProfessionalMediaAsset[] : []);
      const unique = Array.from(new Map(rows.filter((asset) => Boolean(assetUrl(asset))).map((asset) => [asset.id, asset])).values());
      setAssets(unique);
    } catch (error) {
      toast({ title: "Media Intelligence indisponível", description: error instanceof Error ? error.message : "Não foi possível carregar as mídias", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { void loadAssets(); }, [loadAssets]);

  const indexed = useMemo(() => assets.filter((asset) => statusOf(asset) === "ready"), [assets]);
  const pending = useMemo(() => assets.filter((asset) => statusOf(asset) !== "ready"), [assets]);
  const averageQuality = useMemo(() => {
    const scores = indexed.map(qualityOf).filter((value): value is number => value !== null);
    return scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  }, [indexed]);
  const recent = useMemo(() => [...assets].sort((a, b) => (qualityOf(b) ?? -1) - (qualityOf(a) ?? -1)).slice(0, 6), [assets]);

  const indexPending = async () => {
    if (!tenantId || indexing) return;
    const batch = pending.slice(0, MAX_BATCH);
    if (!batch.length) {
      toast({ title: "Biblioteca já indexada", description: "As mídias carregadas já têm inteligência visual persistente." });
      return;
    }
    setIndexing(true);
    setProgress({ done: 0, total: batch.length });
    let succeeded = 0;
    const updates = new Map<string, ProfessionalMediaAsset>();
    try {
      for (let index = 0; index < batch.length; index += 1) {
        const asset = batch[index]!;
        try {
          const mediaIntelligence = await buildIntelligence(asset);
          const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
            method: "PATCH",
            headers: authHeaders(true),
            body: JSON.stringify({ metadata: { mediaIntelligence } }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(String(data.error ?? "Falha ao salvar índice"));
          if (data.asset) updates.set(asset.id, data.asset as ProfessionalMediaAsset);
          succeeded += 1;
        } catch {
          // Uma mídia com CORS/arquivo inválido não interrompe o lote inteiro.
        }
        setProgress({ done: index + 1, total: batch.length });
      }
      if (updates.size) setAssets((current) => current.map((asset) => updates.get(asset.id) ?? asset));
      toast({
        title: "Media Intelligence atualizado",
        description: `${succeeded}/${batch.length} mídia(s) indexadas. ${pending.length > batch.length ? `${pending.length - batch.length} ficaram para o próximo lote.` : "O ranking criativo já pode usar os novos sinais."}`,
      });
    } finally {
      setIndexing(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.08] via-card to-card shadow-sm" data-testid="media-intelligence-index">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"><Database className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Media Intelligence Index</h2><span className="rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">memória visual persistente</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Transforma cada foto e vídeo da Biblioteca em um ativo pesquisável por qualidade, orientação, espaço livre, ponto focal, paleta e crop seguro. O ranking do Creative Director passa a reaproveitar esses sinais automaticamente.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadAssets()} disabled={loading || indexing} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground disabled:opacity-40">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar</button>
            <button type="button" onClick={() => void indexPending()} disabled={indexing || loading || !pending.length} className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-40">{indexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}{indexing ? `Indexando ${progress.done}/${progress.total}` : "Indexar pendentes"}</button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Biblioteca visual</p><p className="mt-1 text-xl font-semibold text-foreground">{assets.length}</p></div>
          <div className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Indexadas</p><p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-300">{indexed.length}</p></div>
          <div className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Pendentes</p><p className={cn("mt-1 text-xl font-semibold", pending.length ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground")}>{pending.length}</p></div>
          <div className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Qualidade média</p><p className="mt-1 text-xl font-semibold text-foreground">{averageQuality === null ? "—" : `${averageQuality}/100`}</p></div>
        </div>

        {indexing && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {recent.map((asset) => {
            const intelligence = intelligenceOf(asset);
            const dimensions = asRecord(intelligence.dimensions);
            const composition = asRecord(intelligence.composition);
            const quality = qualityOf(asset);
            const colors = Array.isArray(intelligence.dominantColors) ? intelligence.dominantColors.map(String).slice(0, 4) : [];
            return (
              <article key={asset.id} className="rounded-2xl border border-border bg-background/55 p-3">
                <div className="flex items-start gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                    {asset.type === "video" ? <video src={assetUrl(asset)} muted playsInline className="h-full w-full object-cover" /> : <img src={assetUrl(asset)} alt="" className="h-full w-full object-cover" />}
                    <span className="absolute bottom-1 right-1 rounded bg-black/55 p-1 text-white">{asset.type === "video" ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}</span>
                  </div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-foreground">{assetLabel(asset)}</p><div className="mt-1 flex flex-wrap gap-1.5"><span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-semibold", statusOf(asset) === "ready" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>{statusOf(asset) === "ready" ? "indexada" : "pendente"}</span>{quality !== null && <span className="rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground">qualidade {quality}</span>}</div><p className="mt-1.5 text-[10px] text-muted-foreground">{String(dimensions.orientation ?? "unknown")} · respiro {zoneLabel(composition.whitespaceSide)}</p></div>
                </div>
                {colors.length > 0 && <div className="mt-3 flex gap-1">{colors.map((color) => <span key={color} title={color} className="h-4 flex-1 rounded border border-black/5" style={{ background: color }} />)}</div>}
              </article>
            );
          })}
        </div>

        {!assets.length && !loading && <div className="mt-4 rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">A Biblioteca ainda não tem fotos ou vídeos disponíveis para indexação.</div>}

        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          <div className="flex items-start gap-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.05] p-3 text-[11px] leading-relaxed text-muted-foreground"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" /><span>O índice é salvo em <strong className="text-foreground">metadata.mediaIntelligence</strong>. Storyboard, vídeo e seleção automática de mídia já conseguem usar qualidade, formato, composição e crop no ranking sem reprocessar a imagem a cada produção.</span></div>
          <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><span>Sem visão semântica disponível, o sistema não inventa pessoas ou produtos: registra apenas sinais de pixels e metadados já existentes. Detecções estruturadas são preservadas quando existem.</span></div>
        </div>
      </div>
    </section>
  );
}
