import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Capabilities = {
  provider: "vendorai";
  capabilities: Record<string, "ready" | "building">;
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

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loadingCapability, setLoadingCapability] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(STYLE_OPTIONS[0]!.value);
  const [aspectRatio, setAspectRatio] = useState<"portrait" | "landscape">("portrait");
  const [duration, setDuration] = useState(16);
  const [sceneCount, setSceneCount] = useState<"auto" | "3" | "4" | "5" | "6">("auto");
  const [submitting, setSubmitting] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<GeneratedVideoJob | null>(null);
  const [polling, setPolling] = useState(false);

  const ready = capabilities?.capabilities?.video_generate === "ready";
  const isRunning = Boolean(projectId && jobId && job?.status !== "done" && job?.status !== "error");
  const canGenerate = Boolean(ready && prompt.trim() && prompt.trim().length <= 4000 && !submitting && !isRunning);

  const progress = useMemo(() => {
    const raw = Number(job?.progress ?? 0);
    const total = Number(job?.total ?? 100);
    if (!Number.isFinite(raw)) return 0;
    if (total > 0 && total !== 100) return Math.max(0, Math.min(100, Math.round((raw / total) * 100)));
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [job?.progress, job?.total]);

  const loadCapability = async () => {
    if (!tenantId) return;
    setLoadingCapability(true);
    try {
      const data = await apiJson<Capabilities>(`/api/tenants/${tenantId}/media-engine/capabilities`);
      setCapabilities(data);
    } catch (error) {
      toast({
        title: "Não foi possível carregar o Media Engine",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
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
      };
      if (sceneCount !== "auto") context.sceneCount = Number(sceneCount);

      const data = await apiJson<{ projectId: string; jobId: string }>(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        body: JSON.stringify({
          operation: "video_generate",
          title: `Vídeo IA — ${trimmedPrompt.slice(0, 60)}`,
          context,
        }),
      });
      setProjectId(data.projectId);
      setJobId(data.jobId);
      toast({
        title: "Geração iniciada",
        description: "O VendorAI está criando as cenas, animando e aplicando seu Brand Video Kit.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível iniciar o vídeo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
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

  return (
    <section className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/[0.10] via-white/[0.025] to-cyan-500/[0.06] p-5 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 h-fit">
            <WandSparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-white">Gerar vídeo com IA</h2>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-200">VendorAI Media Engine</span>
            </div>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Descreva a ideia. A IA cria cenas coerentes, anima em vídeo, aplica a identidade da marca e salva tudo na Biblioteca.
            </p>
          </div>
        </div>
        <button
          onClick={() => void loadCapability()}
          disabled={loadingCapability}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loadingCapability && "animate-spin")} /> Atualizar
        </button>
      </div>

      <div className={cn(
        "rounded-xl border px-3.5 py-2.5 text-xs flex items-center gap-2",
        ready
          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
          : "border-amber-500/20 bg-amber-500/5 text-amber-200",
      )}>
        {ready ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Loader2 className={cn("h-4 w-4 shrink-0", loadingCapability && "animate-spin")} />}
        {ready ? "Gerador de vídeo pronto" : loadingCapability ? "Verificando capacidade..." : "Gerador indisponível neste momento"}
      </div>

      {!job?.output?.videoUrl && (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-300">O que deve acontecer no vídeo?</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 4000))}
              rows={5}
              maxLength={4000}
              placeholder="Ex.: Um revestimento premium sendo apresentado em uma casa contemporânea brasileira. Comece com uma visão ampla do ambiente, aproxime nos detalhes da textura e termine com uma cena hero mostrando o resultado final."
              className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-purple-500/50"
            />
            <div className="flex justify-between text-[10px] text-gray-600">
              <span>Descreva sujeito, ambiente, ação, câmera e resultado desejado.</span>
              <span>{prompt.length}/4000</span>
            </div>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Estilo visual</span>
              <select
                value={style}
                onChange={(event) => setStyle(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-purple-500/50"
              >
                {STYLE_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Formato</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAspectRatio("portrait")}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-colors",
                    aspectRatio === "portrait" ? "border-purple-500/50 bg-purple-500/15" : "border-white/10 bg-black/10 hover:bg-white/5",
                  )}
                >
                  <p className="text-xs font-semibold text-white">9:16 Vertical</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Reels / Stories</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAspectRatio("landscape")}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left transition-colors",
                    aspectRatio === "landscape" ? "border-cyan-500/50 bg-cyan-500/10" : "border-white/10 bg-black/10 hover:bg-white/5",
                  )}
                >
                  <p className="text-xs font-semibold text-white">16:9 Horizontal</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Site / YouTube</p>
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Duração</span>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuration(value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                      duration === value
                        ? "border-purple-500/50 bg-purple-500/15 text-purple-200"
                        : "border-white/10 text-gray-400 hover:text-white hover:bg-white/5",
                    )}
                  >
                    {value}s
                  </button>
                ))}
              </div>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-gray-300">Cenas</span>
              <select
                value={sceneCount}
                onChange={(event) => setSceneCount(event.target.value as typeof sceneCount)}
                className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-purple-500/50"
              >
                <option value="auto">Automático</option>
                <option value="3">3 cenas</option>
                <option value="4">4 cenas</option>
                <option value="5">5 cenas</option>
                <option value="6">6 cenas</option>
              </select>
            </label>
          </div>

          <button
            onClick={() => void generate()}
            disabled={!canGenerate}
            className={cn(
              "w-full rounded-xl py-3.5 text-sm font-bold flex items-center justify-center gap-2 transition-all",
              canGenerate
                ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90 shadow-lg shadow-purple-950/30"
                : "bg-white/5 text-gray-600 cursor-not-allowed",
            )}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Iniciando geração..." : "Gerar vídeo com IA"}
          </button>

          <p className="text-[10px] leading-relaxed text-gray-600 text-center">
            As cenas e o MP4 final ficam preservados e versionados na Biblioteca. O processamento continua mesmo se você sair desta tela.
          </p>
        </div>
      )}

      {(projectId || job) && !job?.output?.videoUrl && (
        <div className="rounded-xl border border-purple-500/20 bg-black/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {job?.status === "error" ? <Film className="h-4 w-4 text-red-400" /> : <Loader2 className="h-4 w-4 text-purple-300 animate-spin" />}
              <div>
                <p className="text-xs font-semibold text-white">
                  {job?.status === "error" ? "A geração encontrou um erro" : "Criando seu vídeo"}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {job?.status === "error" ? job.error ?? "Falha durante a geração" : "Cenas IA → animação → Brand Video Kit → Biblioteca"}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-purple-200">{job?.status === "error" ? "—" : `${progress}%`}</span>
          </div>
          {job?.status !== "error" && (
            <div className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          )}
          {job?.status === "error" && (
            <button onClick={() => { setJob(null); setProjectId(""); setJobId(""); }} className="text-xs text-purple-300 hover:text-purple-200">Voltar e ajustar o prompt</button>
          )}
          {polling && <p className="text-[10px] text-gray-700">Atualizando status…</p>}
        </div>
      )}

      {job?.output?.videoUrl && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
            <video src={job.output.videoUrl} controls playsInline className="w-full max-h-[620px] object-contain" />
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                <p className="text-sm font-bold">Vídeo pronto</p>
              </div>
              <div className="mt-3 space-y-1 text-[11px] text-gray-400">
                <p>{job.output.sceneCount ?? "—"} cenas • {job.output.duration ?? duration}s</p>
                <p>{job.output.aspectRatio === "landscape" ? "16:9 horizontal" : "9:16 vertical"}</p>
                {job.output.imageModel && <p>Modelo visual: {job.output.imageModel}</p>}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <p className="text-xs font-semibold text-white">Brand Video Kit</p>
              <div className="text-[11px] text-gray-400 space-y-1">
                <p>Logo: {job.output.logoApplied ? "aplicada" : "não configurada"}</p>
                <p>Abertura: {job.output.introApplied ? "aplicada" : "não configurada"}</p>
                <p>Encerramento: {job.output.outroApplied ? "aplicado" : "não configurado"}</p>
              </div>
              {job.output.logoWarning && <p className="text-[10px] text-amber-300">{job.output.logoWarning}</p>}
            </div>

            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-[11px] text-gray-400">
              <p className="font-semibold text-cyan-200 mb-1">Salvo na Biblioteca</p>
              <p>O vídeo final e todas as cenas geradas permanecem vinculados ao mesmo projeto, com histórico e versões.</p>
            </div>

            <button onClick={reset} className="w-full rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5">
              <Play className="h-3.5 w-3.5 inline mr-1.5" /> Criar outro vídeo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
