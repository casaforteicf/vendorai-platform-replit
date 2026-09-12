export type MediaIntelligenceAsset = {
  id: string;
  type: string;
  storageUrl?: string | null;
  storage_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MediaIntelligenceZone = "left" | "right" | "top" | "bottom" | "center";

export type MediaIntelligenceSubject = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
};

export type MediaIntelligenceCrop = {
  format: "9:16" | "4:5" | "1:1" | "16:9";
  objectPosition: { x: number; y: number };
  focalPoint: { x: number; y: number };
  subjectSafe: boolean;
};

export type MediaIntelligenceIndex = {
  version: 1;
  status: "ready" | "limited";
  analyzedAt: string;
  analyzer: "vendorai-media-intelligence-v1";
  source: "pixels+metadata" | "pixels" | "metadata" | "fallback";
  dimensions: {
    width: number | null;
    height: number | null;
    aspectRatio: number | null;
    orientation: "portrait" | "landscape" | "square" | "unknown";
  };
  composition: {
    activityGrid: number[];
    whitespaceSide: MediaIntelligenceZone;
    subjectSide: MediaIntelligenceZone;
    focalPoint: { x: number; y: number };
    averageLuminance: number;
    contrast: number;
    detail: number;
  };
  subjects: {
    count: number;
    labels: string[];
    boxes: MediaIntelligenceSubject[];
    primary: MediaIntelligenceSubject | null;
  };
  palette: {
    dominant: string[];
  };
  quality: {
    score: number;
    resolution: number;
    exposure: number;
    contrast: number;
    detail: number;
  };
  crops: MediaIntelligenceCrop[];
  searchTags: string[];
  warning: string | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeUnit(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 1) return clamp(parsed, 0, 100) / 100;
  return clamp(parsed, 0, 1);
}

function normalizeBox(raw: unknown, fallbackLabel: string): MediaIntelligenceSubject | null {
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
  const confidenceRaw = Number(source.confidence ?? source.score ?? 1);
  const confidence = Number.isFinite(confidenceRaw)
    ? clamp(confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw, 0, 1)
    : 1;
  if (confidence < 0.3) return null;
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width: clamp(width, 0, 1 - x),
    height: clamp(height, 0, 1 - y),
    label: String(source.label ?? source.type ?? source.class ?? fallbackLabel).trim() || fallbackLabel,
    confidence,
  };
}

export function mediaIntelligenceSubjects(metadata: Record<string, unknown> | null | undefined): MediaIntelligenceSubject[] {
  const root = asRecord(metadata);
  const intelligence = asRecord(root.mediaIntelligence);
  const intelligenceSubjects = asRecord(intelligence.subjects);
  const candidates: MediaIntelligenceSubject[] = [];
  const collections: Array<[unknown, string]> = [
    [root.faces, "face"],
    [root.people, "person"],
    [root.persons, "person"],
    [root.products, "product"],
    [root.objects, "object"],
    [root.detections, "subject"],
    [root.subjects, "subject"],
    [intelligenceSubjects.boxes, "subject"],
  ];
  for (const [raw, label] of collections) {
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      const box = normalizeBox(item, label);
      if (box) candidates.push(box);
    }
  }
  for (const key of ["faceBox", "personBox", "productBox", "subjectBox", "focalBox"] as const) {
    const box = normalizeBox(root[key], key.replace("Box", ""));
    if (box) candidates.push(box);
  }
  const deduped = new Map<string, MediaIntelligenceSubject>();
  for (const box of candidates) {
    const key = [box.label, box.x.toFixed(2), box.y.toFixed(2), box.width.toFixed(2), box.height.toFixed(2)].join(":");
    if (!deduped.has(key)) deduped.set(key, box);
  }
  return Array.from(deduped.values()).slice(0, 16);
}

function mediaUrl(asset: MediaIntelligenceAsset): string {
  const raw = asset.storageUrl ?? asset.storage_url ?? "";
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  return raw;
}

function orientation(width: number | null, height: number | null): MediaIntelligenceIndex["dimensions"]["orientation"] {
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.08) return "square";
  return ratio > 1 ? "landscape" : "portrait";
}

function zoneScores(grid: number[]) {
  const avg = (indexes: number[]) => indexes.reduce((sum, index) => sum + (grid[index] ?? 0), 0) / Math.max(1, indexes.length);
  return {
    left: avg([0, 3, 6]),
    right: avg([2, 5, 8]),
    top: avg([0, 1, 2]),
    bottom: avg([6, 7, 8]),
    center: avg([1, 3, 4, 5, 7]),
  } satisfies Record<MediaIntelligenceZone, number>;
}

function visualZone(grid: number[], mode: "min" | "max"): MediaIntelligenceZone {
  const scores = zoneScores(grid);
  return (Object.entries(scores) as Array<[MediaIntelligenceZone, number]>)
    .sort((a, b) => mode === "min" ? a[1] - b[1] : b[1] - a[1])[0]?.[0] ?? "center";
}

function primarySubject(subjects: MediaIntelligenceSubject[]): MediaIntelligenceSubject | null {
  return [...subjects]
    .sort((a, b) => (b.width * b.height * b.confidence) - (a.width * a.height * a.confidence))[0] ?? null;
}

function focalPoint(subjects: MediaIntelligenceSubject[], grid: number[]): { x: number; y: number } {
  if (subjects.length) {
    let totalWeight = 0;
    let x = 0;
    let y = 0;
    for (const subject of subjects) {
      const weight = Math.max(0.01, subject.width * subject.height * subject.confidence);
      x += (subject.x + subject.width / 2) * weight;
      y += (subject.y + subject.height / 2) * weight;
      totalWeight += weight;
    }
    return { x: clamp(x / totalWeight, 0.08, 0.92), y: clamp(y / totalWeight, 0.08, 0.92) };
  }
  const maxIndex = grid.reduce((best, value, index) => value > (grid[best] ?? -1) ? index : best, 0);
  return { x: ((maxIndex % 3) + 0.5) / 3, y: (Math.floor(maxIndex / 3) + 0.5) / 3 };
}

function cropRecommendations(focal: { x: number; y: number }, subjects: MediaIntelligenceSubject[]): MediaIntelligenceCrop[] {
  const primary = primarySubject(subjects);
  const formats: MediaIntelligenceCrop["format"][] = ["9:16", "4:5", "1:1", "16:9"];
  return formats.map((format) => ({
    format,
    objectPosition: {
      x: Math.round(clamp(focal.x * 100, 18, 82)),
      y: Math.round(clamp(focal.y * 100, 16, 84)),
    },
    focalPoint: { x: Number(focal.x.toFixed(4)), y: Number(focal.y.toFixed(4)) },
    subjectSafe: primary ? primary.x >= 0.02 && primary.y >= 0.02 && primary.x + primary.width <= 0.98 && primary.y + primary.height <= 0.98 : true,
  }));
}

function quantizeColor(r: number, g: number, b: number) {
  const step = 32;
  const q = (value: number) => Math.min(255, Math.round(value / step) * step);
  return [q(r), q(g), q(b)] as const;
}

function hexColor(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

type PixelAnalysis = {
  width: number;
  height: number;
  grid: number[];
  averageLuminance: number;
  contrast: number;
  detail: number;
  dominantColors: string[];
};

function analyseDrawable(drawable: HTMLImageElement | HTMLVideoElement): PixelAnalysis {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível");
  const sourceWidth = drawable instanceof HTMLVideoElement ? drawable.videoWidth : drawable.naturalWidth;
  const sourceHeight = drawable instanceof HTMLVideoElement ? drawable.videoHeight : drawable.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("Dimensões da mídia indisponíveis");

  const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(drawable, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float32Array(canvas.width * canvas.height);
  const colorCounts = new Map<string, { count: number; rgb: readonly [number, number, number] }>();
  let luminanceSum = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    gray[i] = lum;
    luminanceSum += lum;
    if (i % 9 === 0) {
      const rgb = quantizeColor(r, g, b);
      const key = rgb.join(",");
      const current = colorCounts.get(key);
      colorCounts.set(key, { count: (current?.count ?? 0) + 1, rgb });
    }
  }
  const averageLuminance = luminanceSum / gray.length;
  let variance = 0;
  for (const value of gray) variance += (value - averageLuminance) ** 2;
  const contrast = Math.sqrt(variance / Math.max(1, gray.length));

  const sums = new Array<number>(9).fill(0);
  const counts = new Array<number>(9).fill(0);
  let edgeSum = 0;
  for (let y = 0; y < canvas.height - 1; y += 1) {
    for (let x = 0; x < canvas.width - 1; x += 1) {
      const index = y * canvas.width + x;
      const edge = Math.abs((gray[index] ?? 0) - (gray[index + 1] ?? 0)) + Math.abs((gray[index] ?? 0) - (gray[index + canvas.width] ?? 0));
      edgeSum += edge;
      const gx = Math.min(2, Math.floor((x / canvas.width) * 3));
      const gy = Math.min(2, Math.floor((y / canvas.height) * 3));
      const cell = gy * 3 + gx;
      sums[cell] = (sums[cell] ?? 0) + edge;
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }
  const raw = sums.map((sum, index) => sum / Math.max(1, counts[index] ?? 1));
  const max = Math.max(...raw, 0.001);
  const min = Math.min(...raw);
  const spread = Math.max(0.001, max - min);
  const grid = raw.map((value) => Math.round(clamp(22 + ((value - min) / spread) * 73)));
  const detail = clamp((edgeSum / Math.max(1, (canvas.width - 1) * (canvas.height - 1))) * 460, 0, 100);
  const dominantColors = Array.from(colorCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(({ rgb }) => hexColor(rgb[0], rgb[1], rgb[2]));

  return { width: sourceWidth, height: sourceHeight, grid, averageLuminance, contrast, detail, dominantColors };
}

async function loadDrawableFromUrl(url: string, type: string): Promise<HTMLImageElement | HTMLVideoElement> {
  if (type === "video") {
    return await new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.onloadeddata = () => resolve(video);
      video.onerror = () => reject(new Error("Não foi possível ler o frame do vídeo"));
      video.src = url;
      video.load();
    });
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível ler a imagem"));
    image.src = url;
  });
}

function scoreQuality(pixel: PixelAnalysis | null) {
  if (!pixel) return { score: 45, resolution: 40, exposure: 50, contrast: 45, detail: 45 };
  const shortSide = Math.min(pixel.width, pixel.height);
  const resolution = shortSide >= 1440 ? 100 : shortSide >= 1080 ? 96 : shortSide >= 720 ? 88 : shortSide >= 480 ? 72 : 50;
  const exposure = Math.round(clamp(100 - Math.abs(pixel.averageLuminance - 0.52) * 190));
  const contrast = Math.round(clamp(100 - Math.abs(pixel.contrast - 0.20) * 260));
  const detail = Math.round(pixel.detail);
  const score = Math.round(resolution * 0.35 + exposure * 0.22 + contrast * 0.21 + detail * 0.22);
  return { score, resolution, exposure, contrast, detail };
}

function fallbackGrid() {
  return [44, 48, 46, 49, 55, 50, 43, 47, 45];
}

function buildIndex(asset: MediaIntelligenceAsset, pixel: PixelAnalysis | null, warning: string | null): MediaIntelligenceIndex {
  const subjects = mediaIntelligenceSubjects(asset.metadata);
  const grid = pixel?.grid ?? fallbackGrid();
  const focal = focalPoint(subjects, grid);
  const primary = primarySubject(subjects);
  const labels = Array.from(new Set(subjects.map((subject) => subject.label.toLowerCase()).filter(Boolean)));
  const width = pixel?.width ?? null;
  const height = pixel?.height ?? null;
  const currentOrientation = orientation(width, height);
  const whitespaceSide = visualZone(grid, "min");
  const subjectSide = subjects.length ? (focal.x < 0.42 ? "left" : focal.x > 0.58 ? "right" : "center") : visualZone(grid, "max");
  const source: MediaIntelligenceIndex["source"] = pixel
    ? subjects.length ? "pixels+metadata" : "pixels"
    : subjects.length ? "metadata" : "fallback";
  const quality = scoreQuality(pixel);
  const searchTags = Array.from(new Set([
    ...labels,
    currentOrientation,
    `whitespace-${whitespaceSide}`,
    `subject-${subjectSide}`,
    quality.score >= 90 ? "high-quality" : quality.score >= 75 ? "good-quality" : "review-quality",
  ]));

  return {
    version: 1,
    status: pixel ? "ready" : "limited",
    analyzedAt: new Date().toISOString(),
    analyzer: "vendorai-media-intelligence-v1",
    source,
    dimensions: {
      width,
      height,
      aspectRatio: width && height ? Number((width / height).toFixed(5)) : null,
      orientation: currentOrientation,
    },
    composition: {
      activityGrid: grid,
      whitespaceSide,
      subjectSide,
      focalPoint: { x: Number(focal.x.toFixed(4)), y: Number(focal.y.toFixed(4)) },
      averageLuminance: Number((pixel?.averageLuminance ?? 0.5).toFixed(4)),
      contrast: Number((pixel?.contrast ?? 0).toFixed(4)),
      detail: Math.round(pixel?.detail ?? 45),
    },
    subjects: { count: subjects.length, labels, boxes: subjects, primary },
    palette: { dominant: pixel?.dominantColors ?? [] },
    quality,
    crops: cropRecommendations(focal, subjects),
    searchTags,
    warning,
  };
}

export async function analyseMediaAsset(asset: MediaIntelligenceAsset): Promise<MediaIntelligenceIndex> {
  const url = mediaUrl(asset);
  if (!url || (asset.type !== "image" && asset.type !== "video")) {
    return buildIndex(asset, null, "Mídia sem pixels analisáveis; índice criado apenas com metadados disponíveis.");
  }
  try {
    const drawable = await loadDrawableFromUrl(url, asset.type);
    return buildIndex(asset, analyseDrawable(drawable), null);
  } catch (error) {
    return buildIndex(asset, null, error instanceof Error ? error.message : "Pixels indisponíveis para análise.");
  }
}

export async function analyseMediaFile(file: File, type: string): Promise<MediaIntelligenceIndex | null> {
  if (type !== "image" && type !== "video") return null;
  const url = URL.createObjectURL(file);
  try {
    const drawable = await loadDrawableFromUrl(url, type);
    return buildIndex({ id: `local-${file.name}`, type, metadata: {} }, analyseDrawable(drawable), null);
  } catch (error) {
    return buildIndex({ id: `local-${file.name}`, type, metadata: {} }, null, error instanceof Error ? error.message : "Não foi possível analisar o arquivo local.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function existingMediaIntelligence(metadata: Record<string, unknown> | null | undefined): MediaIntelligenceIndex | null {
  const value = asRecord(asRecord(metadata).mediaIntelligence);
  if (Number(value.version) !== 1 || value.analyzer !== "vendorai-media-intelligence-v1") return null;
  return value as unknown as MediaIntelligenceIndex;
}
