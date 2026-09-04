import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AudioWaveform,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Film,
  Loader2,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Capabilities = {
  provider: "vendorai";
  capabilities: Record<string, "ready" | "building">;
};

type EffectPreset = "auto" | "clean" | "modern" | "premium" | "cinematic" | "dynamic" | "luxury" | "social" | "minimal";
type EffectIntensity = "soft" | "medium" | "impact";
type Transition = "cut" | "fade" | "smooth" | "whip" | "zoom" | "blur" | "flash" | "mask" | "glitch";
type Motion = "ken_burns" | "zoom_in" | "zoom_out" | "pan" | "drift" | "punch" | "parallax";
type ColorPreset = "natural" | "clean" | "cinematic" | "vibrant" | "warm" | "cool" | "minimal" | "luxury" | "editorial" | "product";
type SfxPreset = "none" | "whoosh" | "hit" | "click" | "pop" | "swipe";

type VideoEffects = {
  preset: EffectPreset;
  intensity: EffectIntensity;
  transition: Transition;
  motion: Motion;
  color: ColorPreset;
  grain: boolean;
  vignette: boolean;
  sharpen: boolean;
  beatSync: boolean;
  bpm: number;
  sfx: SfxPreset;
};

type GeneratedVideoJob = {
  id: string;
  operation: string;
  status: "running" | "done" | "error" | string;
  progress?: number | null;
  total?: number | null;
  error?: string | null;
  output?: {
    videoUrl?: string;
    videoAssetId?: string;
    sceneAssetIds?: string[];
    imageModel?: string;
    sceneCount?: number;
    duration?: number;
    aspectRatio?: "portrait" | "landscape";
    logoApplied?: boolean;
    introApplied?: boolean;
    outroApplied?: boolean;
    logoWarning?: string | null;
    generationMode?: string;
    transitionDuration?: number;
    effects?: VideoEffects;
  } | null;
};

const STYLE_OPTIONS = [
  { value: "cinematic, premium, photorealistic, polished commercial production", label: "Cinematográfico" },
  { value: "premium commercial advertising, clean product photography, sophisticated lighting", label: "Comercial premium" },
  { value: "photorealistic documentary style, natural light, authentic details", label: "Realista" },
  { value: "editorial campaign, fashion magazine composition, art-directed lighting", label: "Editorial" },
  { value: "minimalist premium aesthetic, clean composition, soft controlled lighting", label: "Minimalista" },
  { value: "dynamic social media reel, energetic camera language, punchy modern composition", label: "Dinâmico para Reels" },
];

const EFFECT_PRESETS: Array<{ id: EffectPreset; label: string; hint: string }> = [
  { id: "auto", label: "Automático IA", hint: "Equilibra movimento, transição e cor" },
  { id: "clean", label: "Clean", hint: "Leve e profissional" },
  { id: "modern", label: "Moderno", hint: "Whip, parallax e cor viva" },
  { id: "premium", label: "Premium", hint: "Produto, textura e acabamento" },
  { id: "cinematic", label: "Cinematográfico", hint: "Grain, vinheta e movimento suave" },
  { id: "dynamic", label: "Dinâmico", hint: "Zoom punch e ritmo forte" },
  { id: "luxury", label: "Luxury", hint: "Contraste elegante e movimento sutil" },
  { id: "social", label: "Social Viral", hint: "Cortes rápidos e SFX" },
  { id: "minimal", label: "Minimalista", hint: "Pouco efeito, máxima clareza" },
];

const PRESET_DEFAULTS: Record<EffectPreset, Omit<VideoEffects, "preset">> = {
  auto: { intensity: "medium", transition: "smooth", motion: "ken_burns", color: "clean", grain: false, vignette: false, sharpen: true, beatSync: false, bpm: 120, sfx: "none" },
  clean: { intensity: "soft", transition: "fade", motion: "drift", color: "clean", grain: false, vignette: false, sharpen: true, beatSync: false, bpm: 120, sfx: "none" },
  modern: { intensity: "medium", transition: "whip", motion: "parallax", color: "vibrant", grain: false, vignette: false, sharpen: true, beatSync: true, bpm: 120, sfx: "whoosh" },
  premium: { intensity: "soft", transition: "smooth", motion: "ken_burns", color: "product", grain: true, vignette: true, sharpen: true, beatSync: false, bpm: 112, sfx: "none" },
  cinematic: { intensity: "soft", transition: "blur", motion: "ken_burns", color: "cinematic", grain: true, vignette: true, sharpen: false, beatSync: false, bpm: 100, sfx: "none" },
  dynamic: { intensity: "impact", transition: "zoom", motion: "punch", color: "vibrant", grain: false, vignette: false, sharpen: true, beatSync: true, bpm: 128, sfx: "hit" },
  luxury: { intensity: "soft", transition: "smooth", motion: "drift", color: "luxury", grain: true, vignette: true, sharpen: true, beatSync: false, bpm: 105, sfx: "none" },
  social: { intensity: "impact", transition: "whip", motion: "punch", color: "vibrant", grain: false, vignette: false, sharpen: true, beatSync: true, bpm: 132, sfx: "pop" },
  minimal: { intensity: "soft", transition: "fade", motion: "drift", color: "minimal", grain: false, vignette: false, sharpen: false, beatSync: false, bpm: 110, sfx: "none" },
};

const TRANSITIONS: Array<{ value: Transition; label: string }> = [
  { value: "cut", label: "Corte seco" },
  { value: "fade", label: "Fade" },
  { value: "smooth", label: "Smooth" },
  { value: "whip", label: "Whip pan" },
  { value: "zoom", label: "Zoom reveal" },
  { value: "blur", label: "Blur" },
  { value: "flash", label: "Flash" },
  { value: "mask", label: "Mask reveal" },
  { value: "glitch", label: "Glitch / pixel" },
];

const MOTIONS: Array<{ value: Motion; label: string }> = [
  { value: "ken_burns", label: "Ken Burns premium" },
  { value: "zoom_in", label: "Zoom in" },
  { value: "zoom_out", label: "Zoom out" },
  { value: "pan", label: "Pan lateral" },
  { value: "drift", label: "Drift suave" },
  { value: "punch", label: "Zoom punch" },
  { value: "parallax", label: "Parallax simulado" },
];

const COLORS: Array<{ value: ColorPreset; label: string }> = [
  { value: "natural", label: "Natural" },
  { value: "clean", label: "Clean commercial" },
  { value: "cinematic", label: "Cinematic" },
  { value: "vibrant", label: "Vibrant social" },
  { value: "warm", label: "Warm lifestyle" },
  { value: "cool", label: "Cool tech" },
  { value: "minimal", label: "Minimal premium" },
  { value: "luxury", label: "Luxury" },
  { value: "editorial", label: "Fashion editorial" },
  { value: "product", label: "Product spotlight" },
];

const DURATIONS = [8, 12, 16, 20, 24, 30];

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(Boolean(init?.body)), ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `Falha na solicitação (${response.status})`);
  return data as T;
}

export default function VideoGeneratePanel() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loadingCapability, setLoadingCapability] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(STYLE_OPTIONS[0]!.value);
  const [aspectRatio, setAspectRatio] = useState<"portrait" | "landscape">("portrait");
  const [duration, setDuration] = useState(16);
  const [sceneCount, setSceneCount] = useState<"auto" | "3" | "4" | "5" | "6">("auto");
  const [effectPreset, setEffectPreset] = useState<EffectPreset>("auto");
  const [effectIntensity, setEffectIntensity] = useState<EffectIntensity>(PRESET_DEFAULTS.auto.intensity);
  const [transition, setTransition] = useState<Transition>(PRESET_DEFAULTS.auto.transition);
  const [motion, setMotion] = useState<Motion>(PRESET_DEFAULTS.auto.motion);
  const [color, setColor] = useState<ColorPreset>(PRESET_DEFAULTS.auto.color);
  const [grain, setGrain] = useState(PRESET_DEFAULTS.auto.grain);
  const [vignette, setVignette] = useState(PRESET_DEFAULTS.auto.vignette);
  const [sharpen, setSharpen] = useState(PRESET_DEFAULTS.auto.sharpen);
  const [beatSync, setBeatSync] = useState(PRESET_DEFAULTS.auto.beatSync);
  const [bpm, setBpm] = useState(PRESET_DEFAULTS.auto.bpm);
  const [sfx, setSfx] = useState<SfxPreset>(PRESET_DEFAULTS.auto.sfx);
  const [showEffects, setShowEffects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<GeneratedVideoJob | null>(null);
  const [polling, setPolling] = useState(false);

  const ready = capabilities?.capabilities?.video_generate === "ready";
  const isRunning = Boolean(projectId && jobId && job?.status !== "done" && job?.status !== "error");
  const canGenerate = Boolean(ready && prompt.trim() && prompt.trim().length <= 4000 && !submitting && !isRunning);

  const effects = useMemo<VideoEffects>(() => ({
    preset: effectPreset,
    intensity: effectIntensity,
    transition,
    motion,
    color,
    grain,
    vignette,
    sharpen,
    beatSync,
    bpm,
    sfx,
  }), [effectPreset, effectIntensity, transition, motion, color, grain, vignette, sharpen, beatSync, bpm, sfx]);

  const progress = useMemo(() => {
    const raw = Number(job?.progress ?? 0);
    const total = Number(job?.total ?? 100);
    if (!Number.isFinite(raw)) return 0;
    if (total > 0 && total !== 100) return Math.max(0, Math.min(100, Math.round((raw / total) * 100)));
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [job?.progress, job?.total]);

  const applyEffectPreset = (preset: EffectPreset) => {
    setEffectPreset(preset);
    const defaults = PRESET_DEFAULTS[preset];
    setEffectIntensity(defaults.intensity);
    setTransition(defaults.transition);
    setMotion(defaults.motion);
    setColor(defaults.color);
    setGrain(defaults.grain);
    setVignette(defaults.vignette);
    setSharpen(defaults.sharpen);
    setBeatSync(defaults.beatSync);
    setBpm(defaults.bpm);
    setSfx(defaults.sfx);
  };

  const loadCapability = async () => {
    if (!tenantId) return;
    setLoadingCapability(true);
    try {
      const data = await apiJson<Capabilities>(`/api/tenants/${tenantId}/media-engine/capabilities`);
      setCapabilities(data);
    } catch (error) {
      toast({ title: "Não foi possível carregar o Media Engine", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setLoadingCapability(false);
    }
  };

  useEffect(() => {
    void loadCapability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const loadStatus = async () => {
    if (!tenantId || !projectId || !jobId) return;
    setPolling(true);
    try {
      const data = await apiJson<{ jobs?: GeneratedVideoJob[] }>(`/api/tenants/${tenantId}/media/projects/${projectId}`);
      const current = (data.jobs ?? []).find((item) => item.id === jobId && item.operation === "video_generate") ?? null;
      if (current) setJob(current);
    } catch (error) {
      console.error("video-generate: falha ao consultar job", error);
    } finally {
      setPolling(false);
    }
  };

  useEffect(() => {
    if (!projectId || !jobId) return;
    void loadStatus();
    if (job?.status === "done" || job?.status === "error") return;
    const timer = window.setInterval(() => { void loadStatus(); }, 4_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, jobId, job?.status]);

  const generate = async () => {
    if (!canGenerate || !tenantId) return;
    setSubmitting(true);
    setJob(null);
    setProjectId("");
    setJobId("");
    try {
      const trimmedPrompt = prompt.trim();
      const context: Record<string, unknown> = {
        prompt: trimmedPrompt,
        style,
        aspectRatio,
        duration,
        effects,
      };
      if (sceneCount !== "auto") context.sceneCount = Number(sceneCount);

      const data = await apiJson<{ projectId: string; jobId: string }>(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        body: JSON.stringify({ operation: "video_generate", title: `Vídeo IA — ${trimmedPrompt.slice(0, 60)}`, context }),
      });
      setProjectId(data.projectId);
      setJobId(data.jobId);
      toast({ title: "Geração iniciada", description: "O VendorAI está criando cenas, efeitos, transições, ritmo e Brand Video Kit." });
    } catch (error) {
      toast({ title: "Não foi possível iniciar o vídeo", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setProjectId("");
    setJobId("");
    setJob(null);
    setPrompt("");
  };

  const openInEditor = () => {
    const assetId = job?.output?.videoAssetId;
    if (!assetId) return;
    navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(assetId)}`);
  };

  return (
    <section className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/[0.10] via-white/[0.025] to-cyan-500/[0.06] p-5 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 h-fit"><WandSparkles className="h-5 w-5" /></div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-white">Gerar vídeo com IA</h2>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-200">VendorAI Media Engine</span>
            </div>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">Descreva a ideia. A IA cria cenas coerentes, anima, aplica efeitos modernos, identidade da marca e salva tudo na Biblioteca.</p>
          </div>
        </div>
        <button onClick={() => void loadCapability()} disabled={loadingCapability} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-white disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", loadingCapability && "animate-spin")} /> Atualizar
        </button>
      </div>

      <div className={cn("rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2", ready ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" : "border-amber-500/20 bg-amber-500/5 text-amber-200")}>
        {ready ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Loader2 className={cn("h-4 w-4 shrink-0", loadingCapability && "animate-spin")} />}
        {ready ? "Gerador de vídeo + efeitos pronto" : loadingCapability ? "Verificando capacidade..." : "Gerador indisponível neste momento"}
      </div>

      {!job?.output?.videoUrl && (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-300">O que deve acontecer no vídeo?</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value.slice(0, 4000))} rows={5} maxLength={4000} placeholder="Ex.: Um revestimento premium sendo apresentado em uma casa contemporânea brasileira. Comece com visão ampla, aproxime nos detalhes da textura e termine com uma cena hero." className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-purple-500/50" />
            <div className="flex justify-between text-[10px] text-gray-600"><span>Descreva sujeito, ambiente, ação, câmera e resultado desejado.</span><span>{prompt.length}/4000</span></div>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Estilo visual</span>
              <select value={style} onChange={(event) => setStyle(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-purple-500/50">
                {STYLE_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Formato</span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setAspectRatio("portrait")} className={cn("rounded-xl border px-3 py-2.5 text-left transition-colors", aspectRatio === "portrait" ? "border-purple-500/50 bg-purple-500/15" : "border-white/10 bg-black/10 hover:bg-white/5")}><p className="text-xs font-semibold text-white">9:16 Vertical</p><p className="text-[10px] text-gray-500 mt-0.5">Reels / Stories</p></button>
                <button type="button" onClick={() => setAspectRatio("landscape")} className={cn("rounded-xl border px-3 py-2.5 text-left transition-colors", aspectRatio === "landscape" ? "border-cyan-500/50 bg-cyan-500/10" : "border-white/10 bg-black/10 hover:bg-white/5")}><p className="text-xs font-semibold text-white">16:9 Horizontal</p><p className="text-[10px] text-gray-500 mt-0.5">Site / YouTube</p></button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Duração</span>
              <div className="flex flex-wrap gap-2">{DURATIONS.map((value) => <button key={value} type="button" onClick={() => setDuration(value)} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold transition-colors", duration === value ? "border-purple-500/50 bg-purple-500/15 text-purple-200" : "border-white/10 text-gray-400 hover:text-white hover:bg-white/5")}>{value}s</button>)}</div>
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Cenas</span>
              <select value={sceneCount} onChange={(event) => setSceneCount(event.target.value as typeof sceneCount)} className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-purple-500/50">
                <option value="auto">Automático</option><option value="3">3 cenas</option><option value="4">4 cenas</option><option value="5">5 cenas</option><option value="6">6 cenas</option>
              </select>
            </label>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><Zap className="h-4 w-4 text-purple-300" /><p className="text-sm font-bold text-white">Estilo de efeitos</p></div><p className="mt-1 text-[11px] text-gray-500">Movimento, transições, color grade, ritmo e efeitos sonoros aplicados no MP4 final.</p></div>
              <button type="button" onClick={() => setShowEffects((value) => !value)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-white"><SlidersHorizontal className="h-3.5 w-3.5" />Personalizar {showEffects ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {EFFECT_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => applyEffectPreset(preset.id)} className={cn("rounded-xl border p-2.5 text-left transition-colors", effectPreset === preset.id ? "border-purple-500/50 bg-purple-500/15" : "border-white/10 bg-white/[0.02] hover:bg-white/5")}><p className="text-xs font-semibold text-white">{preset.label}</p><p className="mt-0.5 text-[9px] leading-snug text-gray-500">{preset.hint}</p></button>)}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["soft", "medium", "impact"] as EffectIntensity[]).map((value) => <button key={value} type="button" onClick={() => setEffectIntensity(value)} className={cn("rounded-lg border px-2 py-2 text-[11px] font-semibold", effectIntensity === value ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : "border-white/10 text-gray-500")}>{value === "soft" ? "Suave" : value === "medium" ? "Médio" : "Impactante"}</button>)}
            </div>

            {showEffects && (
              <div className="border-t border-white/10 pt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-1.5"><span className="text-[11px] font-semibold text-gray-400">Transição</span><select value={transition} onChange={(event) => setTransition(event.target.value as Transition)} className="w-full rounded-lg border border-white/10 bg-[#171126] px-2.5 py-2 text-xs text-gray-200">{TRANSITIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-semibold text-gray-400">Movimento de câmera</span><select value={motion} onChange={(event) => setMotion(event.target.value as Motion)} className="w-full rounded-lg border border-white/10 bg-[#171126] px-2.5 py-2 text-xs text-gray-200">{MOTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="space-y-1.5"><span className="text-[11px] font-semibold text-gray-400">Color look</span><select value={color} onChange={(event) => setColor(event.target.value as ColorPreset)} className="w-full rounded-lg border border-white/10 bg-[#171126] px-2.5 py-2 text-xs text-gray-200">{COLORS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {[{ label: "Grain de filme", checked: grain, set: setGrain }, { label: "Vinheta", checked: vignette, set: setVignette }, { label: "Nitidez premium", checked: sharpen, set: setSharpen }].map((item) => <label key={item.label} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-gray-400"><span>{item.label}</span><input type="checkbox" checked={item.checked} onChange={(event) => item.set(event.target.checked)} className="accent-purple-500" /></label>)}
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_150px_180px]">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><div><div className="flex items-center gap-1.5"><AudioWaveform className="h-3.5 w-3.5 text-cyan-300" /><p className="text-xs font-semibold text-white">Beat sync</p></div><p className="text-[9px] text-gray-600 mt-0.5">Ajusta o ritmo das cenas em blocos musicais.</p></div><input type="checkbox" checked={beatSync} onChange={(event) => setBeatSync(event.target.checked)} className="accent-cyan-500" /></label>
                  <label className="space-y-1"><span className="text-[10px] text-gray-500">BPM</span><input type="number" min={70} max={180} value={bpm} disabled={!beatSync} onChange={(event) => setBpm(Math.max(70, Math.min(180, Number(event.target.value) || 120)))} className="h-10 w-full rounded-lg border border-white/10 bg-[#171126] px-2 text-xs text-gray-200 disabled:opacity-40" /></label>
                  <label className="space-y-1"><span className="text-[10px] text-gray-500">SFX nas transições</span><select value={sfx} onChange={(event) => setSfx(event.target.value as SfxPreset)} className="h-10 w-full rounded-lg border border-white/10 bg-[#171126] px-2 text-xs text-gray-200"><option value="none">Sem SFX</option><option value="whoosh">Whoosh</option><option value="hit">Impact / hit</option><option value="click">Click</option><option value="pop">Pop</option><option value="swipe">Swipe</option></select></label>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => void generate()} disabled={!canGenerate} className={cn("w-full rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-all", canGenerate ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90 shadow-lg shadow-purple-950/30" : "bg-white/5 text-gray-600 cursor-not-allowed")}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{submitting ? "Iniciando geração..." : "Gerar vídeo com efeitos"}
          </button>

          <p className="text-[10px] leading-relaxed text-gray-600 text-center">As cenas, configurações de efeitos e o MP4 final ficam preservados e versionados na Biblioteca. O processamento continua mesmo se você sair desta tela.</p>
        </div>
      )}

      {(projectId || job) && !job?.output?.videoUrl && (
        <div className="rounded-xl border border-purple-500/20 bg-black/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">{job?.status === "error" ? <Film className="h-4 w-4 text-red-400" /> : <Loader2 className="h-4 w-4 text-purple-300 animate-spin" />}<div><p className="text-xs font-semibold text-white">{job?.status === "error" ? "A geração encontrou um erro" : "Criando seu vídeo"}</p><p className="text-[10px] text-gray-500 mt-0.5">{job?.status === "error" ? job.error ?? "Falha durante a geração" : "Cenas IA → motion → transições → color grade → SFX → Brand Kit"}</p></div></div><span className="text-xs font-bold text-purple-200">{job?.status === "error" ? "—" : `${progress}%`}</span></div>
          {job?.status !== "error" && <div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} /></div>}
          {job?.status === "error" && <button onClick={() => { setJob(null); setProjectId(""); setJobId(""); }} className="text-xs text-purple-300 hover:text-purple-200">Voltar e ajustar</button>}
          {polling && <p className="text-[10px] text-gray-700">Atualizando status…</p>}
        </div>
      )}

      {job?.output?.videoUrl && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black"><video src={job.output.videoUrl} controls playsInline className="w-full max-h-[620px] object-contain" /></div>
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-200"><CheckCircle2 className="h-4 w-4" /><p className="text-sm font-bold">Vídeo pronto</p></div>
              <div className="mt-3 space-y-1 text-[11px] text-gray-400"><p>{job.output.sceneCount ?? "—"} cenas • {job.output.duration ?? duration}s</p><p>{job.output.aspectRatio === "landscape" ? "16:9 horizontal" : "9:16 vertical"}</p>{job.output.imageModel && <p>Modelo visual: {job.output.imageModel}</p>}</div>
            </div>

            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-purple-200">Efeitos aplicados</p>
              <div className="text-[11px] text-gray-400 space-y-1"><p>Preset: {job.output.effects?.preset ?? effectPreset}</p><p>Transição: {job.output.effects?.transition ?? transition}</p><p>Movimento: {job.output.effects?.motion ?? motion}</p><p>Cor: {job.output.effects?.color ?? color}</p>{job.output.effects?.beatSync && <p>Beat sync: {job.output.effects.bpm} BPM</p>}{job.output.effects?.sfx && job.output.effects.sfx !== "none" && <p>SFX: {job.output.effects.sfx}</p>}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2"><p className="text-xs font-semibold text-white">Brand Video Kit</p><div className="text-[11px] text-gray-400 space-y-1"><p>Logo: {job.output.logoApplied ? "aplicada" : "não configurada"}</p><p>Abertura: {job.output.introApplied ? "aplicada" : "não configurada"}</p><p>Encerramento: {job.output.outroApplied ? "aplicado" : "não configurado"}</p></div>{job.output.logoWarning && <p className="text-[10px] text-amber-300">{job.output.logoWarning}</p>}</div>

            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-[11px] text-gray-400"><p className="font-semibold text-cyan-200 mb-1">Salvo na Biblioteca</p><p>Vídeo, cenas e parâmetros dos efeitos permanecem vinculados ao mesmo projeto, com histórico e versões.</p></div>

            <button disabled={!job.output.videoAssetId} onClick={openInEditor} className="w-full rounded-xl bg-purple-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-40"><SlidersHorizontal className="h-3.5 w-3.5 inline mr-1.5" />Editar na timeline</button>
            <button onClick={reset} className="w-full rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5"><Play className="h-3.5 w-3.5 inline mr-1.5" /> Criar outro vídeo</button>
          </div>
        </div>
      )}
    </section>
  );
}
