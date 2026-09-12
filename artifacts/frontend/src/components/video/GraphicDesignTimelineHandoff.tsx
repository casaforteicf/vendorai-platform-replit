import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Film, Layers3, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  graphicDirection,
  type GraphicDesignPlan,
  type GraphicDirectionId,
} from "@workspace/vendor-brain/graphic-design-director";
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
};

type BusinessProfile = {
  logoUrl?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
};

type TimelineLayer = {
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
  contentKind: "text";
  url?: string;
  assetId?: string;
  fontFamily?: string;
  fontWeight?: number;
  designRole?: "brand" | "headline" | "supporting" | "cta";
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function parseStoredPlan(raw: string | null, tenantId: string): StoredDesignPlan | null {
  if (!raw || !tenantId) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDesignPlan;
    if (parsed?.source !== "graphic-design-director" || parsed.tenantId !== tenantId || !parsed.plan?.approved) return null;
    return parsed;
  } catch {
    return null;
  }
}

function metadataNumber(asset: ProfessionalMediaAsset | null, keys: string[]): number | null {
  const metadata = asset?.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown>
    : {};
  for (const key of keys) {
    const value = Number(metadata[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function safeDuration(asset: ProfessionalMediaAsset | null): number {
  const source = metadataNumber(asset, ["durationSeconds", "duration_seconds", "duration", "videoDuration", "video_duration"]);
  if (!source) return 12;
  return Math.max(6, Math.min(30, source));
}

function makeId(prefix: string, sceneIndex: number) {
  return `${prefix}-graphic-${sceneIndex}-${Date.now().toString(36)}`;
}

function buildTimelineLayers(stored: StoredDesignPlan, duration: number, logoUrl: string): TimelineLayer[] {
  const direction = graphicDirection(stored.plan.directionId);
  const scenes = stored.plan.scenes;
  const sceneDuration = duration / Math.max(1, scenes.length);
  const layers: TimelineLayer[] = [];

  scenes.forEach((scene, index) => {
    const start = index * sceneDuration;
    const end = index === scenes.length - 1 ? duration : (index + 1) * sceneDuration;
    const base = {
      start,
      end,
      opacity: 1,
      scale: 1,
      rotation: 0,
      easing: "ease-in-out" as const,
      exitAnimation: "fade" as const,
      animationDuration: 0.32,
      contentKind: "text" as const,
    };

    if (logoUrl && index === 0) {
      layers.push({
        ...base,
        id: makeId("brand", index),
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
        url: logoUrl,
        designRole: "brand",
      });
    }

    layers.push({
      ...base,
      id: makeId("headline", index),
      type: "text",
      name: `Cena ${index + 1} · Headline`,
      text: scene.headline,
      x: scene.layout.headline.x,
      y: scene.layout.headline.y,
      width: scene.layout.headline.width,
      fontSize: stored.plan.format === "9:16" ? 54 : 48,
      color: direction.textColor,
      background: "transparent",
      textAlign: scene.layout.headline.align,
      enterAnimation: "slide-up",
      fontFamily: scene.headlineFont,
      fontWeight: scene.headlineWeight,
      designRole: "headline",
    });

    if (scene.supportingText.trim()) {
      layers.push({
        ...base,
        id: makeId("supporting", index),
        type: "text",
        name: `Cena ${index + 1} · Apoio`,
        text: scene.supportingText,
        x: scene.layout.supporting.x,
        y: scene.layout.supporting.y,
        width: scene.layout.supporting.width,
        fontSize: stored.plan.format === "9:16" ? 29 : 25,
        color: direction.mutedTextColor,
        background: "transparent",
        textAlign: scene.layout.supporting.align,
        enterAnimation: "fade",
        fontFamily: scene.bodyFont,
        fontWeight: 500,
        designRole: "supporting",
      });
    }

    if (scene.cta.trim()) {
      layers.push({
        ...base,
        id: makeId("cta", index),
        type: "text",
        name: `Cena ${index + 1} · CTA`,
        text: scene.cta,
        x: scene.layout.cta.x,
        y: scene.layout.cta.y,
        width: scene.layout.cta.width,
        fontSize: stored.plan.format === "9:16" ? 27 : 24,
        color: direction.ctaColor,
        background: direction.ctaBackground,
        textAlign: scene.layout.cta.align,
        enterAnimation: "pop",
        fontFamily: scene.bodyFont,
        fontWeight: 700,
        designRole: "cta",
      });
    }
  });

  return layers;
}

export default function GraphicDesignTimelineHandoff() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [stored, setStored] = useState<StoredDesignPlan | null>(null);
  const [videos, setVideos] = useState<ProfessionalMediaAsset[]>([]);
  const [videoAssetId, setVideoAssetId] = useState("");
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [creating, setCreating] = useState(false);

  const refreshStoredPlan = useCallback(() => {
    if (!tenantId) return;
    setStored(parseStoredPlan(sessionStorage.getItem(DESIGN_PLAN_KEY), tenantId));
  }, [tenantId]);

  useEffect(() => {
    refreshStoredPlan();
    const timer = window.setInterval(refreshStoredPlan, 900);
    return () => window.clearInterval(timer);
  }, [refreshStoredPlan]);

  const loadSupportData = useCallback(async () => {
    if (!tenantId || !stored) return;
    setLoadingLibrary(true);
    try {
      const [videosRes, profileRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=80`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/business-profile`, { headers: authHeaders() }),
      ]);
      const [videosData, profileData] = await Promise.all([
        videosRes.json().catch(() => ({})),
        profileRes.json().catch(() => ({})),
      ]);
      const rows = videosRes.ok && Array.isArray(videosData.assets) ? videosData.assets as ProfessionalMediaAsset[] : [];
      setVideos(rows.filter((asset) => Boolean(assetUrl(asset))));
      setVideoAssetId((current) => current || rows.find((asset) => Boolean(assetUrl(asset)))?.id || "");
      if (profileRes.ok) setProfile(profileData as BusinessProfile);
    } catch (error) {
      toast({ title: "Não foi possível preparar a timeline", description: error instanceof Error ? error.message : "Falha ao carregar Biblioteca e marca", variant: "destructive" });
    } finally {
      setLoadingLibrary(false);
    }
  }, [stored, tenantId, toast]);

  useEffect(() => { void loadSupportData(); }, [loadSupportData]);

  const selectedVideo = useMemo(() => videos.find((asset) => asset.id === videoAssetId) ?? null, [videoAssetId, videos]);
  const duration = safeDuration(selectedVideo);
  const layerCount = stored ? buildTimelineLayers(stored, duration, profile?.logoUrl ?? "").length : 0;

  const createTimelineProject = async () => {
    if (!tenantId || !stored || !selectedVideo) return;
    const sourceUrl = assetUrl(selectedVideo);
    if (!sourceUrl) return;
    setCreating(true);
    try {
      const durationSeconds = safeDuration(selectedVideo);
      const layers = buildTimelineLayers(stored, durationSeconds, profile?.logoUrl ?? "");
      const titleSeed = stored.brief.product || stored.brief.headline || stored.plan.directionName || "Projeto gráfico";
      const title = `${titleSeed.slice(0, 70)} · ${stored.plan.directionName}`;
      const context = {
        channel: stored.brief.channel,
        ratio: stored.plan.format,
        quality: "1080p",
        sourceAssetId: selectedVideo.id,
        clips: [{
          id: `clip-graphic-${Date.now().toString(36)}`,
          name: assetLabel(selectedVideo),
          url: sourceUrl,
          assetId: selectedVideo.id,
          sourceDuration: durationSeconds,
          trimIn: 0,
          trimOut: durationSeconds,
          transitionOut: "cut",
          transitionDuration: 0.35,
          motion: "none",
          beatLocked: false,
        }],
        layers,
        sfx: [],
        audio: {
          mode: "none",
          volume: 0.22,
          originalVolume: 1,
          start: 0,
          end: durationSeconds,
          ducking: { enabled: true, reduction: 62, thresholdPct: 5, attackMs: 120, releaseMs: 480 },
          fadeIn: 0.5,
          fadeOut: 1,
          smartLoop: true,
          loudnessTarget: -14,
        },
        graphicDesign: {
          source: stored.source,
          approvedAt: stored.approvedAt,
          directionId: stored.plan.directionId,
          directionName: stored.plan.directionName,
          designScore: stored.plan.overallScore,
          safeAreaPct: stored.plan.safeAreaPct,
          palette: stored.plan.palette,
          typography: stored.plan.typography,
          sceneCount: stored.plan.scenes.length,
          brandColor: stored.brief.brandColor,
          professionalReady: stored.plan.approved,
        },
      };

      const response = await fetch(`/api/tenants/${tenantId}/media/projects`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ title, kind: "video", source: "graphic_design_director", context }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.project?.id) throw new Error(data?.error ?? "Não foi possível criar o projeto de timeline");

      localStorage.setItem(CREATIVE_FONT_KEY, stored.plan.typography.headingFamily);
      toast({
        title: "Direção visual aplicada à timeline",
        description: `${layers.length} camadas editáveis foram criadas em ${stored.plan.scenes.length} cenas, mantendo o Design Score ${stored.plan.overallScore}/100.`,
      });
      navigate(`/content-studio/video/edicao?projectId=${encodeURIComponent(data.project.id)}&from=graphic-design`);
    } catch (error) {
      toast({ title: "Falha ao criar a timeline", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (!stored) return null;

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-500/[0.08] via-card to-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Layers3 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">Direção aprovada → Timeline editável</p>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", stored.plan.overallScore >= 90 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300")}>{stored.plan.overallScore}/100</span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">O layout aprovado agora pode virar camadas reais de headline, apoio, CTA e logo, com posições, cores, duração e safe area preservadas no editor.</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-1">{stored.plan.scenes.length} cenas</span>
              <span className="rounded-full bg-muted px-2 py-1">{layerCount} layers</span>
              <span className="rounded-full bg-muted px-2 py-1">{stored.plan.format}</span>
              <span className="rounded-full bg-muted px-2 py-1">{stored.plan.typography.headingFamily}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(220px,320px)_auto] xl:min-w-[520px]">
          <label className="min-w-0">
            <span className="sr-only">Vídeo base da timeline</span>
            <select value={videoAssetId} onChange={(event) => setVideoAssetId(event.target.value)} disabled={loadingLibrary} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-violet-500/40 disabled:opacity-50">
              <option value="">Selecione um vídeo base</option>
              {videos.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void createTimelineProject()} disabled={creating || loadingLibrary || !selectedVideo} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {creating ? "Criando…" : "Aplicar na timeline"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background/55 px-3 py-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" />Texto e CTA viram layers editáveis</div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background/55 px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-500" />Design Score e direção ficam no projeto</div>
        <button type="button" onClick={() => void loadSupportData()} disabled={loadingLibrary} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background/55 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">{loadingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar Biblioteca</button>
      </div>

      {!loadingLibrary && videos.length === 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"><Film className="mt-0.5 h-4 w-4 shrink-0" />Para levar o layout para a timeline de vídeo, adicione ao menos um vídeo real na Biblioteca. A direção de arte aprovada permanece salva.</div>
      )}
    </section>
  );
}
