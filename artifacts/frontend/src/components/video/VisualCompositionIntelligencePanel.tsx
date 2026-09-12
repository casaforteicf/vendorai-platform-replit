import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Image as ImageIcon, Loader2, RefreshCw, ScanSearch, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GRAPHIC_LAYOUTS,
  buildGraphicDesignPlan,
  type GraphicDesignPlan,
  type GraphicDirectionId,
  type GraphicLayoutDefinition,
  type GraphicLayoutId,
} from "@workspace/vendor-brain/graphic-design-director";
import { assetLabel, assetUrl, type ProfessionalMediaAsset } from "./professional-video";

const DESIGN_PLAN_KEY = "vendorai_graphic_design_plan_v1";

type StoredDesignPlan = {
  tenantId: string;
  approvedAt: string;
  source: "graphic-design-director";
  brief: {
    product: string;
    headline: string;
    supportingText: string;
    cta: string;
    channel: string;
    directionId: GraphicDirectionId;
    brandColor: string;
  };
  plan: GraphicDesignPlan;
  visualComposition?: VisualCompositionSnapshot;
};

type SubjectBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
};

type VisualZone = "left" | "right" | "top" | "bottom" | "center";

type LayoutRisk = {
  layoutId: GraphicLayoutId;
  risk: number;
  activityRisk: number;
  subjectOverlapRisk: number;
};

type VisualAnalysis = {
  assetId: string;
  grid: number[];
  averageLuminance: number;
  whitespaceSide: VisualZone;
  subjectSide: VisualZone;
  subjects: SubjectBox[];
  recommendedLayoutId: GraphicLayoutId;
  recommendedRisk: number;
  currentRisk: number;
  improvement: number;
  layoutRisks: LayoutRisk[];
  source: "pixels+metadata" | "pixels" | "metadata" | "fallback";
  warning: string | null;
};

type VisualCompositionSnapshot = {
  version: 1;
  analyzedAt: string;
  assetIds: string[];
  scenes: Array<{
    sceneIndex: number;
    assetId: string;
    layoutId: GraphicLayoutId;
    visualRisk: number;
    whitespaceSide: VisualZone;
    subjectSide: VisualZone;
    subjectCount: number;
    analysisSource: VisualAnalysis["source"];
  }>;
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` };
}

function parseStored(raw: string | null, tenantId: string): StoredDesignPlan | null {
  if (!raw || !tenantId) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDesignPlan;
    if (parsed?.tenantId !== tenantId || parsed?.source !== "graphic-design-director" || !parsed.plan?.approved) return null;
    return parsed;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalizeUnit(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 1) return clamp(parsed, 0, 100) / 100;
  return clamp(parsed, 0, 1);
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
  const confidenceRaw = Number(source.confidence ?? source.score ?? 1);
  const confidence = Number.isFinite(confidenceRaw) ? clamp(confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw, 0, 1) : 1;
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

function metadataSubjects(metadata: Record<string, unknown> | null | undefined): SubjectBox[] {
  const root = asRecord(metadata);
  const candidates: SubjectBox[] = [];
  const collections: Array<[unknown, string]> = [
    [root.faces, "face"],
    [root.people, "person"],
    [root.persons, "person"],
    [root.products, "product"],
    [root.objects, "object"],
    [root.detections, "subject"],
    [root.subjects, "subject"],
  ];
  for (const [raw, label] of collections) {
    if (!Array.isArray(raw)) continue;
    raw.forEach((item) => {
      const box = normalizeBox(item, label);
      if (box) candidates.push(box);
    });
  }
  for (const key of ["faceBox", "personBox", "productBox", "subjectBox", "focalBox"] as const) {
    const box = normalizeBox(root[key], key.replace("Box", ""));
    if (box) candidates.push(box);
  }
  return candidates.slice(0, 12);
}

function intersectionRatio(a: { x: number; y: number; width: number; height: number }, b: SubjectBox) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  const area = (right - left) * (bottom - top);
  const textArea = Math.max(0.001, a.width * a.height);
  return clamp(area / textArea, 0, 1);
}

function slotRect(slot: { x: number; y: number; width: number }, heightPct: number) {
  return { x: slot.x / 100, y: slot.y / 100, width: slot.width / 100, height: heightPct / 100 };
}

function gridActivityForRect(grid: number[], rect: { x: number; y: number; width: number; height: number }) {
  let weighted = 0;
  let weight = 0;
  for (let gy = 0; gy < 3; gy += 1) {
    for (let gx = 0; gx < 3; gx += 1) {
      const cell = { x: gx / 3, y: gy / 3, width: 1 / 3, height: 1 / 3 };
      const left = Math.max(rect.x, cell.x);
      const top = Math.max(rect.y, cell.y);
      const right = Math.min(rect.x + rect.width, cell.x + cell.width);
      const bottom = Math.min(rect.y + rect.height, cell.y + cell.height);
      if (right <= left || bottom <= top) continue;
      const area = (right - left) * (bottom - top);
      weighted += (grid[gy * 3 + gx] ?? 0) * area;
      weight += area;
    }
  }
  return weight > 0 ? weighted / weight : 50;
}

function evaluateLayout(layout: GraphicLayoutDefinition, grid: number[], subjects: SubjectBox[]): LayoutRisk {
  const rects = [
    slotRect(layout.headline, 24),
    slotRect(layout.supporting, 16),
    slotRect(layout.cta, 11),
    slotRect(layout.logo, 9),
  ];
  const importance = [0.46, 0.24, 0.20, 0.10];
  const activityRisk = Math.round(rects.reduce((sum, rect, index) => sum + gridActivityForRect(grid, rect) * (importance[index] ?? 0), 0));
  const subjectOverlapRisk = subjects.length
    ? Math.round(rects.reduce((sum, rect, index) => {
      const overlap = Math.max(0, ...subjects.map((box) => intersectionRatio(rect, box) * box.confidence));
      return sum + overlap * 100 * (importance[index] ?? 0);
    }, 0))
    : 0;
  const safePenalty = rects.some((rect) => rect.x < 0.04 || rect.y < 0.04 || rect.x + rect.width > 0.96 || rect.y + rect.height > 0.96) ? 8 : 0;
  const risk = Math.round(clamp(activityRisk * 0.62 + subjectOverlapRisk * 0.38 + safePenalty));
  return { layoutId: layout.id, risk, activityRisk, subjectOverlapRisk };
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

function visualZone(grid: number[], mode: "min" | "max"): VisualZone {
  const scores = zoneScores(grid);
  return (Object.entries(scores) as Array<[VisualZone, number]>).sort((a, b) => mode === "min" ? a[1] - b[1] : b[1] - a[1])[0]?.[0] ?? "center";
}

function neutralAnalysis(assetId: string, subjects: SubjectBox[], currentLayoutId: GraphicLayoutId, warning: string): VisualAnalysis {
  const grid = [44, 48, 46, 49, 55, 50, 43, 47, 45];
  const risks = GRAPHIC_LAYOUTS.map((layout) => evaluateLayout(layout, grid, subjects)).sort((a, b) => a.risk - b.risk);
  const recommended = risks[0] ?? { layoutId: currentLayoutId, risk: 50, activityRisk: 50, subjectOverlapRisk: 0 };
  const currentRisk = risks.find((item) => item.layoutId === currentLayoutId)?.risk ?? 50;
  return {
    assetId,
    grid,
    averageLuminance: 0.5,
    whitespaceSide: visualZone(grid, "min"),
    subjectSide: visualZone(grid, "max"),
    subjects,
    recommendedLayoutId: recommended.layoutId,
    recommendedRisk: recommended.risk,
    currentRisk,
    improvement: Math.max(0, currentRisk - recommended.risk),
    layoutRisks: risks,
    source: subjects.length ? "metadata" : "fallback",
    warning,
  };
}

async function loadDrawable(asset: ProfessionalMediaAsset): Promise<HTMLImageElement | HTMLVideoElement> {
  const url = assetUrl(asset);
  if (!url) throw new Error("Mídia sem URL disponível");
  if (asset.type === "video") {
    return await new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
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

function analysePixels(drawable: HTMLImageElement | HTMLVideoElement) {
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
  const dx = (canvas.width - drawWidth) / 2;
  const dy = (canvas.height - drawHeight) / 2;
  ctx.drawImage(drawable, dx, dy, drawWidth, drawHeight);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float32Array(canvas.width * canvas.height);
  let luminanceSum = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    const lum = ((data[offset] ?? 0) * 0.2126 + (data[offset + 1] ?? 0) * 0.7152 + (data[offset + 2] ?? 0) * 0.0722) / 255;
    gray[i] = lum;
    luminanceSum += lum;
  }
  const sums = new Array<number>(9).fill(0);
  const counts = new Array<number>(9).fill(0);
  for (let y = 0; y < canvas.height - 1; y += 1) {
    for (let x = 0; x < canvas.width - 1; x += 1) {
      const index = y * canvas.width + x;
      const edge = Math.abs((gray[index] ?? 0) - (gray[index + 1] ?? 0)) + Math.abs((gray[index] ?? 0) - (gray[index + canvas.width] ?? 0));
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
  return { grid, averageLuminance: luminanceSum / gray.length };
}

async function analyseAsset(asset: ProfessionalMediaAsset, currentLayoutId: GraphicLayoutId): Promise<VisualAnalysis> {
  const subjects = metadataSubjects(asset.metadata ?? undefined);
  try {
    const drawable = await loadDrawable(asset);
    const pixels = analysePixels(drawable);
    if (drawable instanceof HTMLVideoElement) {
      drawable.pause();
      drawable.removeAttribute("src");
      drawable.load();
    }
    const risks = GRAPHIC_LAYOUTS.map((layout) => evaluateLayout(layout, pixels.grid, subjects)).sort((a, b) => a.risk - b.risk);
    const recommended = risks[0] ?? { layoutId: currentLayoutId, risk: 50, activityRisk: 50, subjectOverlapRisk: 0 };
    const currentRisk = risks.find((item) => item.layoutId === currentLayoutId)?.risk ?? recommended.risk;
    return {
      assetId: asset.id,
      grid: pixels.grid,
      averageLuminance: pixels.averageLuminance,
      whitespaceSide: visualZone(pixels.grid, "min"),
      subjectSide: visualZone(pixels.grid, "max"),
      subjects,
      recommendedLayoutId: recommended.layoutId,
      recommendedRisk: recommended.risk,
      currentRisk,
      improvement: Math.max(0, currentRisk - recommended.risk),
      layoutRisks: risks,
      source: subjects.length ? "pixels+metadata" : "pixels",
      warning: recommended.risk >= 66 ? "A mídia está visualmente ocupada; considere outra foto/vídeo ou um overlay mais forte." : null,
    };
  } catch (error) {
    return neutralAnalysis(asset.id, subjects, currentLayoutId, error instanceof Error ? error.message : "Análise de pixels indisponível");
  }
}

function sourceLabel(source: VisualAnalysis["source"]) {
  if (source === "pixels+metadata") return "Pixels + metadados";
  if (source === "pixels") return "Análise visual";
  if (source === "metadata") return "Metadados";
  return "Fallback seguro";
}

function zoneLabel(zone: VisualZone) {
  if (zone === "left") return "esquerda";
  if (zone === "right") return "direita";
  if (zone === "top") return "topo";
  if (zone === "bottom") return "base";
  return "centro";
}

function riskClass(risk: number) {
  if (risk <= 28) return "text-emerald-600 dark:text-emerald-300";
  if (risk <= 48) return "text-sky-600 dark:text-sky-300";
  if (risk <= 65) return "text-amber-600 dark:text-amber-300";
  return "text-red-600 dark:text-red-300";
}

export default function VisualCompositionIntelligencePanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [stored, setStored] = useState<StoredDesignPlan | null>(null);
  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [analyses, setAnalyses] = useState<Array<VisualAnalysis | null>>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [applying, setApplying] = useState(false);

  const refresh = useCallback(() => {
    if (!tenantId) return;
    const next = parseStored(sessionStorage.getItem(DESIGN_PLAN_KEY), tenantId);
    setStored(next);
    if (next?.visualComposition?.assetIds?.length) {
      setAssetIds((current) => current.length ? current : next.visualComposition!.assetIds);
    }
  }, [tenantId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const loadAssets = useCallback(async () => {
    if (!tenantId || !stored) return;
    setLoadingAssets(true);
    try {
      const [imagesRes, videosRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=120`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=80`, { headers: authHeaders() }),
      ]);
      const [imagesData, videosData] = await Promise.all([imagesRes.json().catch(() => ({})), videosRes.json().catch(() => ({}))]);
      const rows = [imagesData, videosData].flatMap((payload) => Array.isArray(payload.assets) ? payload.assets as ProfessionalMediaAsset[] : []);
      const unique = Array.from(new Map(rows.filter((asset) => Boolean(assetUrl(asset))).map((asset) => [asset.id, asset])).values());
      unique.sort((a, b) => {
        const rank = (asset: ProfessionalMediaAsset) => asset.source === "upload" || asset.source === "imported" ? 3 : asset.source === "generated" ? 0 : 2;
        return rank(b) - rank(a);
      });
      setAssets(unique);
      setAssetIds((current) => stored.plan.scenes.map((_, index) => current[index] || stored.visualComposition?.assetIds?.[index] || unique[index]?.id || unique[0]?.id || ""));
    } catch (error) {
      toast({ title: "Não foi possível carregar a mídia", description: error instanceof Error ? error.message : "Falha na Biblioteca", variant: "destructive" });
    } finally {
      setLoadingAssets(false);
    }
  }, [stored, tenantId, toast]);

  useEffect(() => { void loadAssets(); }, [loadAssets]);

  const selectedAssets = useMemo(() => assetIds.map((id) => assets.find((asset) => asset.id === id) ?? null), [assetIds, assets]);

  const analyseAll = async () => {
    if (!stored) return;
    setAnalysing(true);
    try {
      const results = await Promise.all(stored.plan.scenes.map(async (scene, index) => {
        const asset = selectedAssets[index];
        if (!asset) return null;
        return await analyseAsset(asset, scene.layoutId);
      }));
      setAnalyses(results);
      const count = results.filter(Boolean).length;
      toast({ title: "Composição visual analisada", description: `${count}/${stored.plan.scenes.length} cena(s) avaliadas contra assunto visual e espaço livre.` });
    } finally {
      setAnalysing(false);
    }
  };

  const applyRecommendations = async () => {
    if (!stored) return;
    const valid = analyses.filter(Boolean) as VisualAnalysis[];
    if (!valid.length) {
      toast({ title: "Analise a mídia primeiro", description: "O sistema precisa medir a composição antes de reposicionar o layout." });
      return;
    }
    setApplying(true);
    try {
      const overrides = Object.fromEntries(analyses.map((analysis, index) => [index, analysis?.recommendedLayoutId ?? stored.plan.scenes[index]?.layoutId]).filter((entry) => Boolean(entry[1]))) as Partial<Record<number, GraphicLayoutId>>;
      const rebuilt = buildGraphicDesignPlan({
        directionId: stored.plan.directionId,
        channel: stored.brief.channel,
        format: stored.plan.format,
        profile: stored.plan.directionId,
        brandColors: stored.plan.palette,
        layoutOverrides: overrides,
        scenes: stored.plan.scenes.map((scene, index) => ({
          headline: scene.headline,
          supportingText: scene.supportingText,
          cta: scene.cta,
          hasMedia: Boolean(assetIds[index]),
        })),
      });
      const plan: GraphicDesignPlan = {
        ...rebuilt,
        palette: stored.plan.palette,
        typography: stored.plan.typography,
        safeAreaPct: stored.plan.safeAreaPct,
        overlayOpacity: stored.plan.overlayOpacity,
        borderRadius: stored.plan.borderRadius,
        scenes: rebuilt.scenes.map((scene, index) => ({
          ...scene,
          headlineFont: stored.plan.scenes[index]?.headlineFont ?? scene.headlineFont,
          bodyFont: stored.plan.scenes[index]?.bodyFont ?? scene.bodyFont,
        })),
      };
      if (!plan.approved) {
        toast({ title: "Recomposição precisa de revisão", description: `O novo plano ficou com ${plan.overallScore}/100. Ajuste a mídia ou o texto antes de substituir a direção aprovada.` });
        return;
      }
      const snapshot: VisualCompositionSnapshot = {
        version: 1,
        analyzedAt: new Date().toISOString(),
        assetIds,
        scenes: analyses.map((analysis, index) => ({
          sceneIndex: index,
          assetId: assetIds[index] ?? "",
          layoutId: analysis?.recommendedLayoutId ?? plan.scenes[index]?.layoutId ?? "center-hero",
          visualRisk: analysis?.recommendedRisk ?? 50,
          whitespaceSide: analysis?.whitespaceSide ?? "center",
          subjectSide: analysis?.subjectSide ?? "center",
          subjectCount: analysis?.subjects.length ?? 0,
          analysisSource: analysis?.source ?? "fallback",
        })),
      };
      const next: StoredDesignPlan = { ...stored, approvedAt: new Date().toISOString(), plan, visualComposition: snapshot };
      sessionStorage.setItem(DESIGN_PLAN_KEY, JSON.stringify(next));
      setStored(next);
      toast({ title: "Auto Layout visual aplicado", description: "Headline, apoio, CTA e marca foram reposicionados para evitar as áreas visualmente mais ocupadas." });
    } finally {
      setApplying(false);
    }
  };

  if (!stored) return null;

  const analysedCount = analyses.filter(Boolean).length;
  const meanRisk = analysedCount ? Math.round((analyses.reduce((sum, item) => sum + (item?.recommendedRisk ?? 0), 0)) / analysedCount) : null;

  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.08] via-card to-card shadow-sm" data-testid="visual-composition-intelligence">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><ScanSearch className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Visual Composition Intelligence</h2><span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">Media-aware Auto Layout</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Lê a distribuição visual da foto/vídeo, aproveita detecções existentes nos metadados e procura espaço livre para texto, CTA e marca sem cobrir o assunto principal.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadAssets()} disabled={loadingAssets} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground disabled:opacity-40">{loadingAssets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Biblioteca</button>
            <button type="button" onClick={() => void analyseAll()} disabled={analysing || selectedAssets.every((asset) => !asset)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-700 disabled:opacity-40 dark:text-cyan-300">{analysing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Analisar composição</button>
            <button type="button" onClick={() => void applyRecommendations()} disabled={applying || !analysedCount} className="inline-flex h-9 items-center gap-2 rounded-xl bg-cyan-600 px-3 text-xs font-semibold text-white disabled:opacity-40">{applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}Aplicar Auto Layout</button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Cenas analisadas</p><p className="mt-1 text-xl font-semibold text-foreground">{analysedCount}/{stored.plan.scenes.length}</p></div>
          <div className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Risco visual médio</p><p className={cn("mt-1 text-xl font-semibold", meanRisk === null ? "text-muted-foreground" : riskClass(meanRisk))}>{meanRisk === null ? "—" : `${meanRisk}/100`}</p></div>
          <div className="rounded-2xl border border-border bg-background/50 p-3"><p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Método</p><p className="mt-1 text-sm font-semibold text-foreground">Pixels + detecções existentes</p><p className="mt-0.5 text-[10px] text-muted-foreground">Sem inventar rosto/produto quando não há metadado semântico.</p></div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {stored.plan.scenes.map((scene, index) => {
            const analysis = analyses[index];
            const selected = selectedAssets[index];
            const recommendedLayout = GRAPHIC_LAYOUTS.find((layout) => layout.id === analysis?.recommendedLayoutId);
            const currentLayout = GRAPHIC_LAYOUTS.find((layout) => layout.id === scene.layoutId);
            return (
              <article key={index} className="rounded-2xl border border-border bg-background/55 p-3.5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-foreground">Cena {index + 1}</p><p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{scene.headline}</p></div>{analysis && <span className={cn("rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-semibold", riskClass(analysis.recommendedRisk))}>risco {analysis.recommendedRisk}</span>}</div>
                <label className="mt-3 block"><span className="text-[10px] font-medium text-muted-foreground">Mídia analisada</span><select value={assetIds[index] ?? ""} onChange={(event) => { setAssetIds((current) => stored.plan.scenes.map((_, sceneIndex) => sceneIndex === index ? event.target.value : current[sceneIndex] ?? "")); setAnalyses((current) => current.map((item, sceneIndex) => sceneIndex === index ? null : item)); }} className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[11px]"><option value="">Selecione uma mídia</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select></label>

                <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted" style={{ aspectRatio: stored.plan.format === "16:9" ? "16 / 9" : stored.plan.format === "4:5" ? "4 / 5" : stored.plan.format === "1:1" ? "1 / 1" : "9 / 16" }}>
                  {selected ? (selected.type === "video" ? <video src={assetUrl(selected)} muted playsInline className="h-full w-full object-cover" /> : <img src={assetUrl(selected)} alt="" className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>}
                </div>

                {analysis ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/55 p-1.5" aria-label="Mapa de atividade visual">{analysis.grid.map((value, cellIndex) => <div key={cellIndex} title={`atividade ${value}/100`} className="aspect-square rounded-md border border-border/40 bg-foreground/10" style={{ opacity: 0.18 + (value / 100) * 0.72 }} />)}</div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg border border-border p-2"><span className="text-muted-foreground">Assunto / atividade</span><strong className="mt-0.5 block text-foreground">{zoneLabel(analysis.subjectSide)}</strong></div><div className="rounded-lg border border-border p-2"><span className="text-muted-foreground">Melhor respiro</span><strong className="mt-0.5 block text-foreground">{zoneLabel(analysis.whitespaceSide)}</strong></div></div>
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-2.5"><div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300"><Sparkles className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold">Recomendação</span></div><p className="mt-1 text-xs font-semibold text-foreground">{recommendedLayout?.name ?? analysis.recommendedLayoutId}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Atual: {currentLayout?.name ?? scene.layoutId} · melhora estimada {analysis.improvement} pontos de risco.</p></div>
                    <div className="flex flex-wrap gap-1.5"><span className="rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground">{sourceLabel(analysis.source)}</span><span className="rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground">{analysis.subjects.length} detecção(ões)</span><span className="rounded-full border border-border px-2 py-0.5 text-[9px] text-muted-foreground">luz {Math.round(analysis.averageLuminance * 100)}%</span></div>
                    {analysis.warning && <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">{analysis.warning}</p>}
                  </div>
                ) : <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Analise para medir densidade visual e colisão entre o assunto da mídia e os blocos de design.</p>}
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><span>O motor não afirma reconhecer semanticamente pessoas ou produtos quando essa informação não existe. Sem detecções estruturadas, ele usa densidade/contraste dos pixels para preservar as áreas mais importantes e encontrar espaço livre.</span></div>
      </div>
    </section>
  );
}
