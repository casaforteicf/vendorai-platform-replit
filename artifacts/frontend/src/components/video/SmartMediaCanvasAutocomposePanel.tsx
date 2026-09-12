import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Crop, Image as ImageIcon, Loader2, RefreshCw, ScanSearch, ShieldCheck, Sparkles, Target } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { graphicDirection, type GraphicDesignPlan, type GraphicDirectionId } from "@workspace/vendor-brain/graphic-design-director";
import { rankMediaForScene, type MediaRetrievalCandidate, type MediaRetrievalZone } from "@workspace/vendor-brain/media-retrieval-director";
import { assetLabel, assetUrl, type ProfessionalMediaAsset } from "./professional-video";

const DESIGN_PLAN_KEY = "vendorai_graphic_design_plan_v1";
const CREATIVE_FONT_KEY = "vendorai:creative-font-family";

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
  mediaAutocomposition?: MediaAutocompositionSnapshot;
  [key: string]: unknown;
};

type BusinessProfile = {
  logoUrl?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
};

type SmartCrop = {
  x: number;
  y: number;
  focalX: number;
  focalY: number;
  safe: boolean | null;
  source: "indexed-crop" | "focal-point" | "center";
};

type MediaAutocompositionItem = {
  sceneIndex: number;
  assetId: string;
  assetType: "image" | "video";
  score: number;
  reasons: string[];
  crop: SmartCrop;
  whitespaceSide: MediaRetrievalZone | null;
  qualityScore: number | null;
  intelligenceStatus: string | null;
};

type MediaAutocompositionSnapshot = {
  version: 1;
  generatedAt: string;
  targetFormat: GraphicDesignPlan["format"];
  scenes: MediaAutocompositionItem[];
};

type CanvasLayer = {
  id: string;
  type: "text" | "image";
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
  easing: "ease-in-out";
  textAlign: "left" | "center" | "right";
  enterAnimation: "fade" | "pop" | "slide-up";
  exitAnimation: "fade";
  animationDuration: number;
  contentKind?: string;
  url?: string;
  assetId?: string;
  fontFamily?: string;
  fontWeight?: number;
  designRole?: "media" | "brand" | "headline" | "supporting" | "cta";
  locked?: boolean;
  borderRadius?: number;
  shadowPreset?: "none" | "soft" | "strong" | "glow";
  maskShape?: "none" | "rounded" | "circle";
  imageFit?: "contain" | "cover";
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
};

type Selection = {
  asset: ProfessionalMediaAsset;
  ranking: MediaRetrievalCandidate;
  crop: SmartCrop;
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseStored(raw: string | null, tenantId: string): StoredDesignPlan | null {
  if (!raw || !tenantId) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDesignPlan;
    if (parsed?.tenantId !== tenantId || parsed.source !== "graphic-design-director" || !parsed.plan?.approved) return null;
    return parsed;
  } catch {
    return null;
  }
}

function targetRatio(format: GraphicDesignPlan["format"]): number {
  if (format === "16:9") return 16 / 9;
  if (format === "4:5") return 4 / 5;
  if (format === "1:1") return 1;
  return 9 / 16;
}

function aspectCss(format: GraphicDesignPlan["format"]): string {
  if (format === "16:9") return "16 / 9";
  if (format === "4:5") return "4 / 5";
  if (format === "1:1") return "1 / 1";
  return "9 / 16";
}

function textZoneForLayout(mediaFocus: string): MediaRetrievalZone | "auto" {
  if (mediaFocus === "right") return "left";
  if (mediaFocus === "left") return "right";
  return "auto";
}

function cropFor(asset: ProfessionalMediaAsset, format: GraphicDesignPlan["format"]): SmartCrop {
  const metadata = asRecord(asset.metadata);
  const intelligence = asRecord(metadata.mediaIntelligence);
  const crops = Array.isArray(intelligence.crops) ? intelligence.crops.map(asRecord) : [];
  const indexed = crops.find((item) => String(item.format ?? "") === format);
  const objectPosition = asRecord(indexed?.objectPosition);
  const focal = asRecord(indexed?.focalPoint);
  const composition = asRecord(intelligence.composition);
  const fallbackFocal = asRecord(composition.focalPoint);
  const numeric = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  if (indexed) {
    return {
      x: Math.max(0, Math.min(100, numeric(objectPosition.x, numeric(focal.x, 0.5) * 100))),
      y: Math.max(0, Math.min(100, numeric(objectPosition.y, numeric(focal.y, 0.5) * 100))),
      focalX: Math.max(0, Math.min(1, numeric(focal.x, 0.5))),
      focalY: Math.max(0, Math.min(1, numeric(focal.y, 0.5))),
      safe: typeof indexed.subjectSafe === "boolean" ? indexed.subjectSafe : null,
      source: "indexed-crop",
    };
  }
  if (Object.keys(fallbackFocal).length) {
    const fx = Math.max(0, Math.min(1, numeric(fallbackFocal.x, 0.5)));
    const fy = Math.max(0, Math.min(1, numeric(fallbackFocal.y, 0.5)));
    return { x: fx * 100, y: fy * 100, focalX: fx, focalY: fy, safe: null, source: "focal-point" };
  }
  return { x: 50, y: 50, focalX: 0.5, focalY: 0.5, safe: null, source: "center" };
}

function imagePlacement(asset: ProfessionalMediaAsset, format: GraphicDesignPlan["format"], crop: SmartCrop) {
  const metadata = asRecord(asset.metadata);
  const intelligence = asRecord(metadata.mediaIntelligence);
  const dimensions = asRecord(intelligence.dimensions);
  const width = Number(dimensions.width ?? metadata.width ?? 0);
  const height = Number(dimensions.height ?? metadata.height ?? 0);
  const sourceRatio = width > 0 && height > 0 ? width / height : null;
  const desiredRatio = targetRatio(format);
  if (!sourceRatio) return { x: 0, y: 0, width: 100, imagePositionX: crop.x, imagePositionY: crop.y };
  if (sourceRatio >= desiredRatio) {
    const widthPct = Math.max(100, (sourceRatio / desiredRatio) * 100);
    const overflow = Math.max(0, widthPct - 100);
    return { x: -(overflow * crop.x / 100), y: 0, width: widthPct, imagePositionX: 50, imagePositionY: crop.y };
  }
  const heightPct = (desiredRatio / sourceRatio) * 100;
  const overflowY = Math.max(0, heightPct - 100);
  return { x: 0, y: -(overflowY * crop.y / 100), width: 100, imagePositionX: crop.x, imagePositionY: 50 };
}

function mediaIndex(asset: ProfessionalMediaAsset) {
  const intelligence = asRecord(asRecord(asset.metadata).mediaIntelligence);
  const quality = asRecord(intelligence.quality);
  const composition = asRecord(intelligence.composition);
  const score = Number(quality.score);
  const whitespace = String(composition.whitespaceSide ?? "");
  return {
    qualityScore: Number.isFinite(score) ? score : null,
    whitespaceSide: (["left", "right", "top", "bottom", "center"].includes(whitespace) ? whitespace : null) as MediaRetrievalZone | null,
    intelligenceStatus: Object.keys(intelligence).length ? String(intelligence.status ?? "unknown") : null,
  };
}

function videoDuration(asset: ProfessionalMediaAsset): number {
  const metadata = asRecord(asset.metadata);
  for (const key of ["durationSeconds", "duration_seconds", "duration", "videoDuration", "video_duration"]) {
    const parsed = Number(metadata[key]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(5, Math.min(20, parsed));
  }
  return 8;
}

function makeId(prefix: string, sceneIndex: number) {
  return `${prefix}-smart-${sceneIndex}-${Date.now().toString(36)}`;
}

function buildSceneLayers(stored: StoredDesignPlan, sceneIndex: number, selection: Selection, logoUrl: string): CanvasLayer[] {
  const scene = stored.plan.scenes[sceneIndex];
  if (!scene) return [];
  const direction = graphicDirection(stored.plan.directionId);
  const duration = selection.asset.type === "video" ? videoDuration(selection.asset) : 8;
  const layers: CanvasLayer[] = [];
  const base = {
    start: 0,
    end: duration,
    opacity: 1,
    scale: 1,
    rotation: 0,
    easing: "ease-in-out" as const,
    exitAnimation: "fade" as const,
    animationDuration: 0.3,
  };

  if (selection.asset.type === "image") {
    const placement = imagePlacement(selection.asset, stored.plan.format, selection.crop);
    layers.push({
      ...base,
      id: makeId("media", sceneIndex),
      type: "image",
      name: `Mídia inteligente · ${assetLabel(selection.asset)}`,
      text: "",
      x: placement.x,
      y: placement.y,
      width: placement.width,
      fontSize: 18,
      color: "#ffffff",
      background: "transparent",
      textAlign: "center",
      enterAnimation: "fade",
      contentKind: "image",
      url: assetUrl(selection.asset),
      assetId: selection.asset.id,
      designRole: "media",
      locked: true,
      borderRadius: 0,
      shadowPreset: "none",
      maskShape: "none",
      imageFit: "cover",
      imagePositionX: placement.imagePositionX,
      imagePositionY: placement.imagePositionY,
      imageZoom: 1,
    });
  }

  if (logoUrl) {
    layers.push({
      ...base,
      id: makeId("brand", sceneIndex),
      type: "image",
      name: "Marca · logo",
      text: "",
      x: scene.layout.logo.x,
      y: scene.layout.logo.y,
      width: Math.min(24, scene.layout.logo.width),
      fontSize: 18,
      color: direction.textColor,
      background: "transparent",
      textAlign: scene.layout.logo.align,
      enterAnimation: "fade",
      contentKind: "image",
      url: logoUrl,
      designRole: "brand",
      locked: false,
      imageFit: "contain",
    });
  }

  layers.push({
    ...base,
    id: makeId("headline", sceneIndex),
    type: "text",
    name: `Cena ${sceneIndex + 1} · Headline`,
    text: scene.headline,
    x: scene.layout.headline.x,
    y: scene.layout.headline.y,
    width: scene.layout.headline.width,
    fontSize: stored.plan.format === "9:16" ? 54 : 48,
    color: direction.textColor,
    background: "transparent",
    textAlign: scene.layout.headline.align,
    enterAnimation: "slide-up",
    contentKind: "text",
    fontFamily: scene.headlineFont,
    fontWeight: scene.headlineWeight,
    designRole: "headline",
  });

  if (scene.supportingText.trim()) {
    layers.push({
      ...base,
      id: makeId("supporting", sceneIndex),
      type: "text",
      name: `Cena ${sceneIndex + 1} · Apoio`,
      text: scene.supportingText,
      x: scene.layout.supporting.x,
      y: scene.layout.supporting.y,
      width: scene.layout.supporting.width,
      fontSize: stored.plan.format === "9:16" ? 29 : 25,
      color: direction.mutedTextColor,
      background: "transparent",
      textAlign: scene.layout.supporting.align,
      enterAnimation: "fade",
      contentKind: "text",
      fontFamily: scene.bodyFont,
      fontWeight: 500,
      designRole: "supporting",
    });
  }

  if (scene.cta.trim()) {
    layers.push({
      ...base,
      id: makeId("cta", sceneIndex),
      type: "text",
      name: `Cena ${sceneIndex + 1} · CTA`,
      text: scene.cta,
      x: scene.layout.cta.x,
      y: scene.layout.cta.y,
      width: scene.layout.cta.width,
      fontSize: stored.plan.format === "9:16" ? 27 : 24,
      color: direction.ctaColor,
      background: direction.ctaBackground,
      textAlign: scene.layout.cta.align,
      enterAnimation: "pop",
      contentKind: "text",
      fontFamily: scene.bodyFont,
      fontWeight: 700,
      designRole: "cta",
      borderRadius: Math.max(8, stored.plan.borderRadius * 0.6),
      shadowPreset: "soft",
    });
  }
  return layers;
}

export default function SmartMediaCanvasAutocomposePanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [stored, setStored] = useState<StoredDesignPlan | null>(null);
  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [selectedScene, setSelectedScene] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const refreshStored = useCallback(() => {
    if (!tenantId) return;
    setStored(parseStored(sessionStorage.getItem(DESIGN_PLAN_KEY), tenantId));
  }, [tenantId]);

  useEffect(() => {
    refreshStored();
    const timer = window.setInterval(refreshStored, 800);
    return () => window.clearInterval(timer);
  }, [refreshStored]);

  const load = useCallback(async () => {
    if (!tenantId || !stored) return;
    setLoading(true);
    try {
      const [imagesRes, videosRes, profileRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=250`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=120`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/business-profile`, { headers: authHeaders() }),
      ]);
      const [imagesData, videosData, profileData] = await Promise.all([
        imagesRes.json().catch(() => ({})),
        videosRes.json().catch(() => ({})),
        profileRes.json().catch(() => ({})),
      ]);
      const rows = [imagesData, videosData].flatMap((data) => Array.isArray(data.assets) ? data.assets as ProfessionalMediaAsset[] : []);
      setAssets(Array.from(new Map(rows.filter((asset) => Boolean(assetUrl(asset))).map((asset) => [asset.id, asset])).values()));
      if (profileRes.ok) setProfile(profileData as BusinessProfile);
    } catch (error) {
      toast({ title: "Autocomposição indisponível", description: error instanceof Error ? error.message : "Não foi possível carregar a Biblioteca", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [stored, tenantId, toast]);

  useEffect(() => { void load(); }, [load]);

  const selections = useMemo<Selection[]>(() => {
    if (!stored || !assets.length) return [];
    const images = assets.filter((asset) => asset.type === "image");
    const pool = images.length ? images : assets;
    const byId = new Map(pool.map((asset) => [asset.id, asset]));
    const used = new Set<string>();
    const result: Selection[] = [];
    stored.plan.scenes.forEach((scene) => {
      const ranked = rankMediaForScene(
        { headline: scene.headline, supportingText: scene.supportingText, cta: scene.cta },
        pool,
        {
          channel: stored.brief.channel,
          targetFormat: stored.plan.format,
          textZone: textZoneForLayout(scene.layout.mediaFocus),
          preferType: images.length ? "image" : "either",
          queryContext: `${stored.brief.product} ${stored.brief.headline} ${scene.headline}`,
          usedAssetIds: used,
          allowGenerated: false,
          minimumQuality: 60,
        },
      );
      const ranking = ranked[0];
      const asset = ranking ? byId.get(ranking.assetId) : null;
      if (!ranking || !asset) return;
      used.add(asset.id);
      result.push({ asset, ranking, crop: cropFor(asset, stored.plan.format) });
    });
    return result;
  }, [assets, stored]);

  useEffect(() => {
    if (!stored || !selections.length) return;
    const snapshot: MediaAutocompositionSnapshot = {
      version: 1,
      generatedAt: new Date().toISOString(),
      targetFormat: stored.plan.format,
      scenes: selections.map((selection, sceneIndex) => {
        const index = mediaIndex(selection.asset);
        return {
          sceneIndex,
          assetId: selection.asset.id,
          assetType: selection.asset.type === "video" ? "video" : "image",
          score: selection.ranking.score,
          reasons: selection.ranking.reasons,
          crop: selection.crop,
          whitespaceSide: index.whitespaceSide,
          qualityScore: index.qualityScore,
          intelligenceStatus: index.intelligenceStatus,
        };
      }),
    };
    const currentRaw = sessionStorage.getItem(DESIGN_PLAN_KEY);
    const current = parseStored(currentRaw, tenantId);
    if (!current) return;
    const previous = current.mediaAutocomposition;
    const previousKey = previous?.scenes?.map((item) => `${item.assetId}:${item.score}:${Math.round(item.crop.x)}:${Math.round(item.crop.y)}`).join("|") ?? "";
    const nextKey = snapshot.scenes.map((item) => `${item.assetId}:${item.score}:${Math.round(item.crop.x)}:${Math.round(item.crop.y)}`).join("|");
    if (previousKey === nextKey && previous?.targetFormat === snapshot.targetFormat) return;
    const next = { ...current, mediaAutocomposition: snapshot };
    sessionStorage.setItem(DESIGN_PLAN_KEY, JSON.stringify(next));
    setStored(next);
  }, [selections, stored, tenantId]);

  const selection = selections[selectedScene] ?? null;

  const createCanvas = async () => {
    if (!tenantId || !stored || !selection || creating) return;
    const scene = stored.plan.scenes[selectedScene];
    if (!scene) return;
    setCreating(true);
    try {
      const layers = buildSceneLayers(stored, selectedScene, selection, profile?.logoUrl ?? "");
      const duration = selection.asset.type === "video" ? videoDuration(selection.asset) : 8;
      const sourceUrl = assetUrl(selection.asset);
      const index = mediaIndex(selection.asset);
      const clips = selection.asset.type === "video" ? [{
        id: `clip-smart-${Date.now().toString(36)}`,
        name: assetLabel(selection.asset),
        url: sourceUrl,
        assetId: selection.asset.id,
        sourceDuration: duration,
        trimIn: 0,
        trimOut: duration,
        transitionOut: "cut",
        transitionDuration: 0.3,
        motion: "none",
        beatLocked: false,
      }] : [];
      const context = {
        channel: stored.brief.channel,
        ratio: stored.plan.format,
        quality: "1080p",
        sourceAssetId: selection.asset.id,
        clips,
        layers,
        sfx: [],
        audio: {
          mode: "none",
          volume: 0.22,
          originalVolume: 1,
          start: 0,
          end: duration,
          ducking: { enabled: true, reduction: 62, thresholdPct: 5, attackMs: 120, releaseMs: 480 },
          fadeIn: 0.5,
          fadeOut: 1,
          smartLoop: true,
          loudnessTarget: -14,
        },
        graphicDesign: {
          source: "smart_media_autocompose",
          parentSource: stored.source,
          approvedAt: stored.approvedAt,
          directionId: stored.plan.directionId,
          directionName: stored.plan.directionName,
          designScore: stored.plan.overallScore,
          safeAreaPct: stored.plan.safeAreaPct,
          palette: stored.plan.palette,
          typography: stored.plan.typography,
          brandColor: stored.brief.brandColor,
          sceneIndex: selectedScene,
          sceneCount: stored.plan.scenes.length,
          professionalReady: stored.plan.approved,
          mediaSelection: {
            assetId: selection.asset.id,
            assetType: selection.asset.type,
            score: selection.ranking.score,
            confidence: selection.ranking.confidence,
            reasons: selection.ranking.reasons,
            qualityScore: index.qualityScore,
            whitespaceSide: index.whitespaceSide,
            crop: selection.crop,
            targetFormat: stored.plan.format,
          },
          smartCrop: true,
          autocomposedAt: new Date().toISOString(),
        },
      };
      const titleSeed = stored.brief.product || scene.headline || stored.plan.directionName;
      const response = await fetch(`/api/tenants/${tenantId}/media/projects`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          title: `${titleSeed.slice(0, 64)} · Cena ${selectedScene + 1} · Smart Canvas`,
          kind: "video",
          source: "smart_media_autocompose",
          context,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.project?.id) throw new Error(data?.error ?? "Não foi possível montar o Canvas inteligente");
      localStorage.setItem(CREATIVE_FONT_KEY, stored.plan.typography.headingFamily);
      toast({
        title: "Canvas montado automaticamente",
        description: `Cena ${selectedScene + 1}: mídia ${selection.ranking.score}/100, foco ${Math.round(selection.crop.x)}×${Math.round(selection.crop.y)} e ${layers.length} layers editáveis.`,
      });
      navigate(`/content-studio/video/edicao?projectId=${encodeURIComponent(data.project.id)}&from=smart-media-canvas`);
    } catch (error) {
      toast({ title: "Falha ao montar o Canvas", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (!stored) return null;

  return (
    <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.07] via-card to-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><ScanSearch className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">Smart Media → Smart Crop → Canvas</p><span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">Auto Compose</span></div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">O VendorAI escolhe a melhor mídia para cada cena, usa o ponto focal e o crop do Media Intelligence Index e monta a composição editável sem cobrir o assunto principal.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Recalcular</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {stored.plan.scenes.map((scene, index) => {
          const current = selections[index];
          return <button key={`${scene.sceneIndex}-${index}`} type="button" onClick={() => setSelectedScene(index)} className={cn("rounded-xl border px-3 py-2 text-left transition", selectedScene === index ? "border-cyan-500/40 bg-cyan-500/10" : "border-border bg-background/50 hover:border-cyan-500/25")}><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cena {index + 1}</span><span className="block max-w-[190px] truncate text-xs font-semibold text-foreground">{current ? assetLabel(current.asset) : "Sem mídia compatível"}</span>{current && <span className="mt-0.5 block text-[10px] text-cyan-700 dark:text-cyan-300">Match {current.ranking.score}/100</span>}</button>;
        })}
      </div>

      {selection ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_22px_60px_rgba(0,0,0,.2)]" style={{ aspectRatio: aspectCss(stored.plan.format) }}>
            {selection.asset.type === "image" ? <img src={assetUrl(selection.asset)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${selection.crop.x}% ${selection.crop.y}%` }} /> : <video src={assetUrl(selection.asset)} muted playsInline loop autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${selection.crop.x}% ${selection.crop.y}%` }} />}
            <div className="absolute inset-0 bg-black/20" />
            <div className="pointer-events-none absolute border border-dashed border-emerald-300/70" style={{ inset: `${stored.plan.safeAreaPct}%` }} />
            <div className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-500 shadow" style={{ left: `${selection.crop.x}%`, top: `${selection.crop.y}%` }}><span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" /></div>
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur"><Target className="mr-1 inline h-3 w-3" />Foco {Math.round(selection.crop.x)} × {Math.round(selection.crop.y)}</div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-border bg-background/55 p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-foreground">Media Match</span><span className={cn("rounded-full border px-2 py-0.5 text-xs font-bold", selection.ranking.score >= 80 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>{selection.ranking.score}/100</span></div>
              <p className="mt-2 text-xs font-medium text-foreground">{assetLabel(selection.asset)}</p>
              <div className="mt-3 space-y-1.5">{selection.ranking.reasons.map((reason) => <div key={reason} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{reason}</div>)}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-xl border border-border bg-background/55 p-2.5"><Crop className="mb-1 h-3.5 w-3.5 text-cyan-500" /><span className="block text-muted-foreground">Crop</span><span className="font-semibold text-foreground">{selection.crop.source === "indexed-crop" ? "Indexado" : selection.crop.source === "focal-point" ? "Ponto focal" : "Central"}</span></div>
              <div className="rounded-xl border border-border bg-background/55 p-2.5"><ShieldCheck className="mb-1 h-3.5 w-3.5 text-cyan-500" /><span className="block text-muted-foreground">Assunto seguro</span><span className="font-semibold text-foreground">{selection.crop.safe === true ? "Sim" : selection.crop.safe === false ? "Revisar" : "Sem detecção"}</span></div>
            </div>

            <button type="button" onClick={() => void createCanvas()} disabled={creating || loading} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{creating ? "Montando…" : `Montar Cena ${selectedScene + 1} no Canvas`}<ArrowRight className="h-4 w-4" /></button>
          </aside>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}{loading ? "Analisando a Biblioteca…" : "Nenhuma mídia visual compatível foi encontrada."}</div>
      )}
    </section>
  );
}
