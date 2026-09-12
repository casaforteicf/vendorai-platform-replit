import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clapperboard,
  Film,
  Gauge,
  ImageIcon,
  Library,
  Loader2,
  Mic2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import ProfessionalAudioLibrary from "./ProfessionalAudioLibrary";
import {
  assetLabel,
  fidelityFromIdentityPayload,
  mediaUrl,
  professionalGate,
  scenesFromGeneration,
  scriptFromScenes,
  suggestAssetForScene,
  type FidelitySnapshot,
  type ProfessionalMediaAsset,
  type ProfessionalScene,
  type ProfessionalVideoMode,
} from "./professional-video";

type Identity = {
  id: string;
  display_name?: string | null;
  displayName?: string | null;
  status?: string | null;
};

type VoiceProfile = {
  id: string;
  name?: string | null;
  status?: string | null;
  reference_asset_id?: string | null;
};

type Capabilities = {
  capabilities?: Record<string, "ready" | "building" | string>;
  workers?: Record<string, { ready?: boolean; configured?: boolean }>;
};

type TalkingVideoResult = {
  video?: { videoUrl?: string; assetId?: string };
  voice?: { audioUrl?: string; assetId?: string };
};

type ProjectJob = {
  id: string;
  operation: string;
  status: string;
  progress?: number | null;
  error?: string | null;
  output?: { videoUrl?: string; videoAssetId?: string; assetId?: string } | null;
  videoUrl?: string;
  assetId?: string;
};

type PlanExecution = {
  source?: string;
  tenantId?: string;
  campaign?: {
    nome?: string;
    objetivo?: string;
    produtoServico?: string;
    publico?: string;
    oferta?: string;
    mensagemCentral?: string;
  };
  calendarItem?: { temaSugerido?: string; canal?: string; tipo?: string };
};

type GeneratedVoice = { assetId: string; audioUrl: string };

const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";
const DURATIONS = [15, 20, 30, 45, 60];

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(Boolean(init?.body) && !(init?.body instanceof FormData)), ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `Falha na solicitação (${response.status})`);
  return data as T;
}

function identityLabel(identity: Identity): string {
  return identity.display_name ?? identity.displayName ?? `Dublê ${identity.id.slice(0, 8)}`;
}

function audioKind(asset: ProfessionalMediaAsset): string {
  const meta = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata : {};
  return String(meta.audioKind ?? asset.role ?? "").trim().toLowerCase();
}

function buildDirection(input: { objective: string; product: string; audience: string; cta: string; channel: string; duration: number; extra: string }): string {
  return [
    input.objective ? `Objetivo: ${input.objective}` : "",
    input.product ? `Produto/serviço: ${input.product}` : "",
    input.audience ? `Público: ${input.audience}` : "",
    input.cta ? `CTA/oferta: ${input.cta}` : "",
    input.channel ? `Canal: ${input.channel}` : "",
    `Duração alvo: ${input.duration}s`,
    input.extra ? `Direção adicional: ${input.extra}` : "",
    "Crie um roteiro publicitário profissional, natural, sem exageros, sem inventar características e com cenas coerentes entre si.",
    "Priorize demonstração real do produto/serviço, prova visual, contexto de uso e CTA claro.",
  ].filter(Boolean).join("\n");
}

export default function ProfessionalVideoStudioPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [identityId, setIdentityId] = useState("");
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [fidelity, setFidelity] = useState<FidelitySnapshot | null>(null);
  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);

  const [objective, setObjective] = useState("");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [cta, setCta] = useState("");
  const [channel, setChannel] = useState("Instagram / Reels");
  const [duration, setDuration] = useState(30);
  const [extraDirection, setExtraDirection] = useState("");

  const [mode, setMode] = useState<ProfessionalVideoMode>("duble");
  const [script, setScript] = useState("");
  const [scriptApproved, setScriptApproved] = useState(false);
  const [scenes, setScenes] = useState<ProfessionalScene[]>([]);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [assigningMedia, setAssigningMedia] = useState(false);

  const [musicAssetId, setMusicAssetId] = useState("");
  const [effectAssetId, setEffectAssetId] = useState("");
  const [jingleAssetId, setJingleAssetId] = useState("");

  const [generatedVoice, setGeneratedVoice] = useState<GeneratedVoice | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processLabel, setProcessLabel] = useState("");
  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<ProjectJob | null>(null);
  const [resultAssetId, setResultAssetId] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  const visualAssets = useMemo(() => assets.filter((asset) => asset.type === "image" || asset.type === "video"), [assets]);
  const audioAssets = useMemo(() => assets.filter((asset) => asset.type === "audio"), [assets]);
  const selectedVisualCount = useMemo(() => scenes.filter((scene) => scene.assetId).length, [scenes]);

  const voiceReady = capabilities?.workers?.voice?.ready === true
    || capabilities?.capabilities?.voice_clone === "ready"
    || capabilities?.capabilities?.voice_synthesize === "ready";
  const lipSyncReady = capabilities?.workers?.lipSync?.ready === true
    || capabilities?.workers?.lipsync?.ready === true
    || capabilities?.capabilities?.lip_sync === "ready"
    || capabilities?.capabilities?.talking_video === "ready";

  const gate = useMemo(() => professionalGate({
    mode,
    fidelity,
    scriptApproved,
    scenes,
    selectedVisualCount,
    voiceReady,
    lipSyncReady,
    musicReady: Boolean(musicAssetId),
  }), [mode, fidelity, scriptApproved, scenes, selectedVisualCount, voiceReady, lipSyncReady, musicAssetId]);

  const loadBase = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoadError("");
    try {
      const [capRes, identitiesRes, imageRes, videoRes, audioRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-engine/capabilities`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media-engine/identities`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=250`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=250`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=audio&limit=500`, { headers: authHeaders() }),
      ]);
      const [capData, identitiesData, imageData, videoData, audioData] = await Promise.all([
        capRes.json().catch(() => ({})), identitiesRes.json().catch(() => ({})), imageRes.json().catch(() => ({})), videoRes.json().catch(() => ({})), audioRes.json().catch(() => ({})),
      ]);
      if (capRes.ok) setCapabilities(capData as Capabilities);
      const identityRows = identitiesRes.ok && Array.isArray(identitiesData.identities) ? identitiesData.identities as Identity[] : [];
      setIdentities(identityRows);
      const preferred = identityRows.find((item) => item.status === "active") ?? identityRows[0];
      if (preferred) setIdentityId((current) => current || preferred.id);
      const allAssets = [imageData, videoData, audioData].flatMap((data) => Array.isArray(data.assets) ? data.assets as ProfessionalMediaAsset[] : []);
      setAssets(Array.from(new Map(allAssets.map((asset) => [asset.id, asset])).values()));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível preparar o Vídeo Studio Profissional");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void loadBase(); }, [loadBase]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      const raw = sessionStorage.getItem(MEDIA_PLAN_EXECUTION_KEY);
      if (!raw) return;
      const execution = JSON.parse(raw) as PlanExecution;
      if (execution.source !== "media-calendar" || execution.tenantId !== tenantId) return;
      const campaign = execution.campaign;
      const item = execution.calendarItem;
      if (!campaign || !item) return;
      setObjective((current) => current || campaign.objetivo || item.temaSugerido || "");
      setProduct((current) => current || campaign.produtoServico || "");
      setAudience((current) => current || campaign.publico || "");
      setCta((current) => current || campaign.oferta || "");
      setChannel((current) => item.canal || current);
      setExtraDirection((current) => current || campaign.mensagemCentral || "");
      setDuration(item.tipo === "youtube_video" ? 60 : 30);
    } catch {}
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !identityId) {
      setVoices([]);
      setVoiceProfileId("");
      setFidelity(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<Record<string, unknown>>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`);
        if (cancelled) return;
        const voiceRows = Array.isArray(data.voices) ? data.voices as VoiceProfile[] : [];
        const readyVoices = voiceRows.filter((voice) => voice.status === "ready");
        setVoices(readyVoices);
        setVoiceProfileId((current) => readyVoices.some((voice) => voice.id === current) ? current : (readyVoices[0]?.id ?? ""));
        setFidelity(fidelityFromIdentityPayload(data));
      } catch (error) {
        if (!cancelled) {
          setVoices([]);
          setVoiceProfileId("");
          setFidelity(null);
          toast({ title: "Dublê indisponível", description: error instanceof Error ? error.message : "Não foi possível carregar o perfil", variant: "destructive" });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId, identityId, toast]);

  useEffect(() => {
    if (!tenantId || !projectId || !jobId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiJson<{ jobs?: ProjectJob[] }>(`/api/tenants/${tenantId}/media/projects/${projectId}`);
        const current = (data.jobs ?? []).find((item) => item.id === jobId) ?? null;
        if (!cancelled && current) {
          setJob(current);
          if (current.status === "done") {
            setProcessing(false);
            const outputUrl = current.output?.videoUrl ?? current.videoUrl ?? "";
            const outputAssetId = current.output?.videoAssetId ?? current.output?.assetId ?? current.assetId ?? "";
            if (outputUrl) setResultUrl(mediaUrl(outputUrl));
            if (outputAssetId) setResultAssetId(outputAssetId);
          }
          if (current.status === "error") {
            setProcessing(false);
            toast({ title: "Produção interrompida", description: current.error ?? "Falha ao finalizar vídeo", variant: "destructive" });
          }
        }
      } catch {}
    };
    void load();
    if (job?.status === "done" || job?.status === "error") return () => { cancelled = true; };
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [tenantId, projectId, jobId, job?.status, toast]);

  const generateScript = async () => {
    if (!tenantId || generatingScript) return;
    const direction = buildDirection({ objective, product, audience, cta, channel, duration, extra: extraDirection });
    if (!objective.trim() && !product.trim() && !extraDirection.trim()) {
      toast({ title: "Defina o briefing", description: "Informe pelo menos objetivo, produto/serviço ou direção da campanha." });
      return;
    }
    setGeneratingScript(true);
    try {
      const data = await apiJson<Record<string, unknown>>(`/api/tenants/${tenantId}/content/generate`, {
        method: "POST",
        body: JSON.stringify({
          type: "reels",
          theme: direction.slice(0, 8000),
          variations: 1,
          imageCount: 1,
          postObjective: objective.trim(),
          desiredCta: cta.trim(),
          voiceTone: "natural, profissional, confiável e humano",
        }),
      });
      const nextScenes = scenesFromGeneration(data);
      if (!nextScenes.length) throw new Error("O gerador não retornou um storyboard utilizável");
      setScenes(nextScenes);
      setScript(scriptFromScenes(nextScenes));
      setScriptApproved(false);
      setResultAssetId("");
      setResultUrl("");
      toast({ title: "Roteiro e storyboard criados", description: "Revise o texto e aprove antes de produzir qualquer vídeo." });
    } catch (error) {
      toast({ title: "Não foi possível criar o roteiro", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setGeneratingScript(false);
    }
  };

  const updateScript = (value: string) => {
    setScript(value);
    setScriptApproved(false);
  };

  const approveScript = () => {
    if (!script.trim()) return;
    if (!scenes.length) {
      const sentences = script.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
      setScenes(sentences.slice(0, 8).map((fala, index) => ({
        id: `manual-${Date.now()}-${index}`,
        fala,
        visual: "Selecionar mídia real relacionada a este trecho",
        duracao: "4s",
        assetId: "",
        assetType: "",
        assetLabel: "",
      })));
    }
    setScriptApproved(true);
    toast({ title: "Roteiro aprovado", description: "Agora o roteiro passa a comandar a produção cena a cena." });
  };

  const assignMedia = () => {
    if (!scenes.length || assigningMedia) return;
    setAssigningMedia(true);
    const used = new Set<string>();
    const next = scenes.map((scene) => {
      if (scene.assetId) { used.add(scene.assetId); return scene; }
      const asset = suggestAssetForScene(scene, visualAssets, used);
      if (!asset) return scene;
      used.add(asset.id);
      return { ...scene, assetId: asset.id, assetType: asset.type as "image" | "video", assetLabel: assetLabel(asset) };
    });
    setScenes(next);
    setAssigningMedia(false);
    toast({ title: "Mídias reais sugeridas", description: "O VendorAI priorizou arquivos da Biblioteca. Revise cada cena antes de produzir." });
  };

  const changeSceneAsset = (sceneId: string, assetId: string) => {
    const asset = visualAssets.find((item) => item.id === assetId);
    setScenes((current) => current.map((scene) => scene.id === sceneId ? {
      ...scene,
      assetId: asset?.id ?? "",
      assetType: asset?.type === "video" ? "video" : asset?.type === "image" ? "image" : "",
      assetLabel: asset ? assetLabel(asset) : "",
    } : scene));
  };

  const synthesizeVoice = async (): Promise<GeneratedVoice> => {
    if (generatedVoice) return generatedVoice;
    if (!tenantId || !identityId || !voiceProfileId) throw new Error("Selecione um Dublê e uma voz pronta");
    const data = await apiJson<Record<string, unknown>>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices/${voiceProfileId}/synthesize`, {
      method: "POST",
      body: JSON.stringify({ text: script.trim(), language: "pt-br", title: `Locução profissional — ${product || objective || "vídeo"}` }),
    });
    const voice = { assetId: String(data.assetId ?? ""), audioUrl: mediaUrl(String(data.audioUrl ?? "")) };
    if (!voice.assetId || !voice.audioUrl) throw new Error("A locução foi processada, mas o arquivo final não foi retornado");
    setGeneratedVoice(voice);
    return voice;
  };

  const startLibraryVideo = async () => {
    if (!tenantId || processing) return;
    if (!scriptApproved) return;
    const visualInputs = scenes.filter((scene) => scene.assetId).map((scene, index) => ({
      assetId: scene.assetId,
      type: scene.assetType,
      role: index === 0 ? "opening" : index === scenes.length - 1 ? "closing" : "broll",
      importance: "required",
      order: index,
      note: `${scene.visual} | Fala: ${scene.fala}`.slice(0, 480),
    }));
    if (!visualInputs.length) {
      toast({ title: "Selecione as mídias", description: "O modo profissional sem Dublê não cria cenas falsas automaticamente." });
      return;
    }
    setProcessing(true);
    setProcessLabel("Gerando locução e montando vídeo somente com mídias reais…");
    setJob(null);
    setProjectId("");
    setJobId("");
    setResultAssetId("");
    setResultUrl("");
    try {
      const voice = await synthesizeVoice();
      const mediaInputs: Array<Record<string, unknown>> = [
        ...visualInputs,
        { assetId: voice.assetId, type: "audio", role: "voiceover", importance: "required", order: 100 },
      ];
      if (musicAssetId) mediaInputs.push({ assetId: musicAssetId, type: "audio", role: "music", importance: "preferred", order: 101 });
      if (effectAssetId) mediaInputs.push({ assetId: effectAssetId, type: "audio", role: "sfx", importance: "preferred", order: 102 });
      const context = {
        prompt: buildDirection({ objective, product, audience, cta, channel, duration: Math.min(30, duration), extra: extraDirection }).slice(0, 4000),
        style: "premium commercial, authentic, realistic, brand-safe, no synthetic people",
        aspectRatio: channel.toLowerCase().includes("youtube") || channel.toLowerCase().includes("site") ? "landscape" : "portrait",
        duration: Math.min(30, duration),
        generationMode: "media_only",
        mediaInputs,
        effects: { preset: "clean", intensity: "soft", transition: "smooth", motion: "drift", color: "natural", grain: false, vignette: false, sharpen: true, beatSync: Boolean(musicAssetId), bpm: 112, sfx: "none" },
      };
      const data = await apiJson<{ projectId: string; jobId: string }>(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        body: JSON.stringify({ operation: "video_generate", title: `Vídeo profissional — ${product || objective || "campanha"}`.slice(0, 120), context }),
      });
      setProjectId(data.projectId);
      setJobId(data.jobId);
      setProcessLabel("Montagem profissional em processamento…");
    } catch (error) {
      setProcessing(false);
      toast({ title: "Não foi possível produzir o vídeo", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
  };

  const startDubleVideo = async () => {
    if (!tenantId || !identityId || !voiceProfileId || processing) return;
    if (!gate.previewReady) return;
    setProcessing(true);
    setProcessLabel("Gerando Dublê a partir do roteiro aprovado…");
    setJob(null);
    setProjectId("");
    setJobId("");
    setResultAssetId("");
    setResultUrl("");
    try {
      const talking = await apiJson<TalkingVideoResult>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/talking-video`, {
        method: "POST",
        body: JSON.stringify({
          voiceProfileId,
          text: script.trim(),
          language: "pt-br",
          title: `Dublê profissional — ${product || objective || "campanha"}`.slice(0, 120),
        }),
      });
      const sourceVideoUrl = mediaUrl(talking.video?.videoUrl ?? "");
      const sourceAssetId = talking.video?.assetId ?? "";
      if (!sourceVideoUrl || !sourceAssetId) throw new Error("O Dublê foi processado, mas o MP4 final não foi retornado");
      setProcessLabel("Aplicando trilha, ducking, Brand Kit e B-roll da Biblioteca…");

      const sourceResponse = await fetch(sourceVideoUrl, { headers: sourceVideoUrl.startsWith("/api/") ? authHeaders() : undefined });
      if (!sourceResponse.ok) throw new Error("Não foi possível abrir o vídeo do Dublê para finalização");
      const videoBlob = await sourceResponse.blob();
      const form = new FormData();
      form.append("video", new File([videoBlob], "vendorai-duble-profissional.mp4", { type: videoBlob.type || "video/mp4" }));
      if (musicAssetId) form.append("musicAssetId", musicAssetId);
      form.append("musicVolume", "0.18");
      form.append("originalVolume", "1");
      form.append("ducking", "true");
      form.append("fadeIn", "0.35");
      form.append("fadeOut", "0.65");
      form.append("brollContext", [
        buildDirection({ objective, product, audience, cta, channel, duration, extra: extraDirection }),
        "Storyboard aprovado:",
        ...scenes.map((scene, index) => `${index + 1}. ${scene.visual} — ${scene.fala}${scene.assetLabel ? ` — usar/priorizar ${scene.assetLabel}` : ""}`),
        "Usar somente B-roll coerente com o roteiro; preservar produto, marca, arquitetura e características reais; não criar pessoas genéricas.",
      ].join("\n").slice(0, 4000));

      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/compose`, { method: "POST", headers: authHeaders(), body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!musicAssetId) {
          setProcessing(false);
          setResultAssetId(sourceAssetId);
          setResultUrl(sourceVideoUrl);
          toast({ title: "Dublê gerado", description: "Não há trilha padrão disponível para composição automática. O vídeo do Dublê foi preservado e pode ser finalizado no editor." });
          return;
        }
        throw new Error(data.error ?? "Não foi possível finalizar o vídeo do Dublê");
      }
      setProjectId(String(data.projectId ?? ""));
      setJobId(String(data.jobId ?? ""));
      setProcessLabel("Finalização profissional em processamento…");
    } catch (error) {
      setProcessing(false);
      toast({ title: "Não foi possível produzir com o Dublê", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
  };

  const startProduction = () => {
    if (mode === "duble") void startDubleVideo();
    else void startLibraryVideo();
  };

  const openEditor = () => {
    if (!resultAssetId) return;
    navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(resultAssetId)}`);
  };

  if (loading) {
    return <section className="rounded-3xl border border-border bg-card p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Preparando o Vídeo Studio Profissional…</p></section>;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.09] via-card to-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Clapperboard className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-foreground">Diretor de Vídeo Profissional</h2><span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">Script-first</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Briefing → roteiro aprovado → storyboard → Dublê validado ou mídias reais → áudio → QA. IA visual genérica não é o caminho padrão.</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadBase()} className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" />Atualizar Biblioteca</button>
        </div>
        {loadError && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-300">{loadError}</div>}
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">1 · Briefing</p><h3 className="mt-1 font-semibold text-foreground">O que a empresa precisa comunicar?</h3></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Objetivo</span><input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex.: gerar leads qualificados" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Produto / serviço</span><input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Ex.: VendorAI para construtoras" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Público</span><input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex.: donos e gestores de construtoras" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">CTA / oferta</span><input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex.: agende uma demonstração" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Canal</span><select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option>Instagram / Reels</option><option>TikTok</option><option>YouTube</option><option>Site / Landing Page</option><option>WhatsApp</option></select></label>
          <div className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Duração</span><div className="flex flex-wrap gap-1.5">{DURATIONS.map((value) => <button key={value} type="button" onClick={() => setDuration(value)} className={cn("rounded-lg border px-2.5 py-2 text-xs font-medium", duration === value ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{value}s</button>)}</div></div>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Direção adicional</span><input value={extraDirection} onChange={(e) => setExtraDirection(e.target.value)} placeholder="Tom, campanha, diferenciais obrigatórios, restrições…" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
        </div>
        <button type="button" onClick={() => void generateScript()} disabled={generatingScript} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{generatingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}Gerar roteiro + storyboard</button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">2 · Roteiro</p><h3 className="mt-1 font-semibold text-foreground">O vídeo só avança depois da aprovação</h3></div>{scriptApproved && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Aprovado</span>}</div>
        <textarea value={script} onChange={(e) => updateScript(e.target.value)} rows={7} placeholder="O roteiro aparecerá aqui. Você pode editar antes de aprovar." className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-primary/50" />
        <div className="flex flex-wrap gap-2"><button type="button" onClick={approveScript} disabled={!script.trim()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-40 dark:text-emerald-300"><Check className="h-4 w-4" />Aprovar roteiro</button><button type="button" onClick={() => { setScriptApproved(false); void generateScript(); }} disabled={generatingScript} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">Gerar outra versão</button></div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">3 · Storyboard</p><h3 className="mt-1 font-semibold text-foreground">Cada cena está vinculada ao roteiro</h3><p className="mt-1 text-xs text-muted-foreground">Primeiro reutilizamos a Biblioteca do tenant. IA visual só deve ser usada depois, por cena, quando realmente faltar material.</p></div><button type="button" onClick={assignMedia} disabled={!scenes.length || assigningMedia} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"><Library className="h-3.5 w-3.5" />Sugerir mídias reais</button></div>
        {!scenes.length ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Gere ou escreva um roteiro para montar o storyboard.</div> : <div className="space-y-3">{scenes.map((scene, index) => <div key={scene.id} className="grid gap-3 rounded-xl border border-border bg-background/40 p-3 lg:grid-cols-[70px_1.2fr_1.2fr] lg:items-start"><div className="rounded-lg bg-muted px-2 py-2 text-center"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cena</p><p className="text-lg font-bold text-foreground">{index + 1}</p><p className="text-[10px] text-muted-foreground">{scene.duracao}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fala</p><p className="mt-1 text-sm text-foreground">{scene.fala}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Direção visual</p><p className="mt-1 text-xs text-muted-foreground">{scene.visual || "Mídia real relacionada ao trecho"}</p></div><label className="space-y-1.5"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mídia desta cena</span><select value={scene.assetId} onChange={(e) => changeSceneAsset(scene.id, e.target.value)} className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs"><option value="">Selecionar mídia real…</option>{visualAssets.slice(0, 250).map((asset) => <option key={asset.id} value={asset.id}>{asset.type === "video" ? "🎬" : "🖼️"} {assetLabel(asset)}</option>)}</select>{scene.assetId ? <p className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-300"><Check className="h-3 w-3" />{scene.assetLabel}</p> : <p className="text-[11px] text-amber-600 dark:text-amber-300">Sem mídia escolhida — não será inventada automaticamente.</p>}</label></div>)}</div>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">4 · Produção</p><h3 className="mt-1 font-semibold text-foreground">Escolha como o vídeo será produzido</h3></div>
        <div className="grid gap-3 md:grid-cols-2"><button type="button" onClick={() => setMode("duble")} className={cn("rounded-2xl border p-4 text-left", mode === "duble" ? "border-primary/40 bg-primary/5" : "border-border") }><div className="flex items-center gap-2"><Mic2 className="h-4 w-4 text-primary" /><p className="font-semibold text-foreground">Dublê Digital + B-roll</p></div><p className="mt-1 text-xs text-muted-foreground">O Dublê fala o roteiro inteiro; música, ducking, Brand Kit e B-roll complementam sem interromper a locução.</p></button><button type="button" onClick={() => setMode("library_voiceover")} className={cn("rounded-2xl border p-4 text-left", mode === "library_voiceover" ? "border-primary/40 bg-primary/5" : "border-border") }><div className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /><p className="font-semibold text-foreground">Mídias reais + locução</p></div><p className="mt-1 text-xs text-muted-foreground">Não cria pessoas ou cenários sintéticos. Monta apenas fotos/vídeos selecionados e aplica a locução do roteiro.</p></button></div>

        <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Dublê / identidade autorizada</span><select value={identityId} onChange={(e) => { setIdentityId(e.target.value); setGeneratedVoice(null); }} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option value="">Selecionar…</option>{identities.map((identity) => <option key={identity.id} value={identity.id}>{identityLabel(identity)}</option>)}</select></label><label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Voz</span><select value={voiceProfileId} onChange={(e) => { setVoiceProfileId(e.target.value); setGeneratedVoice(null); }} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option value="">Selecionar voz pronta…</option>{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name ?? `Voz ${voice.id.slice(0, 8)}`}</option>)}</select></label></div>

        {mode === "duble" && <div className="rounded-xl border border-border bg-background/40 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /><p className="text-sm font-semibold text-foreground">Professional Quality Gate</p></div><span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold", gate.publishReady ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300")}>{gate.publishReady ? "Pronto para publicar" : "Prévia / revisão"}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-4">{[["Fidelity", fidelity?.score], ["Visual", fidelity?.visual], ["Humano", fidelity?.human], ["Técnico", fidelity?.technical]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border px-3 py-2"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold text-foreground">{typeof value === "number" ? `${Math.round(value)}/100` : "—"}</p></div>)}</div>{gate.blockers.length > 0 && <div className="mt-3 space-y-1">{gate.blockers.map((item) => <p key={item} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{item}</p>)}</div>}</div>}
      </section>

      <ProfessionalAudioLibrary assets={audioAssets} musicAssetId={musicAssetId} effectAssetId={effectAssetId} jingleAssetId={jingleAssetId} onMusicChange={setMusicAssetId} onEffectChange={setEffectAssetId} onJingleChange={setJingleAssetId} />

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">6 · QA e finalização</p><h3 className="mt-1 font-semibold text-foreground">Gerar somente quando o material estiver coerente</h3><p className="mt-1 text-xs text-muted-foreground">Nenhum vídeo comercial precisa sair com aparência de IA barata. Se o Dublê não passar o gate, use mídias reais + locução.</p></div><div className="flex flex-wrap gap-2"><span className={cn("rounded-full border px-2.5 py-1 text-xs", scriptApproved ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground")}>Roteiro {scriptApproved ? "✓" : "pendente"}</span><span className={cn("rounded-full border px-2.5 py-1 text-xs", selectedVisualCount > 0 ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600" : "border-border text-muted-foreground")}>Mídias {selectedVisualCount}/{scenes.length}</span></div></div>

        {processing && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3"><div className="flex items-center gap-2 text-sm font-medium text-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />{processLabel}</div>{job && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, Number(job.progress ?? 0)))}%` }} /></div>}</div>}

        {resultUrl && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" />Versão gerada e preservada na Biblioteca</div><video controls src={resultUrl} className="mt-3 max-h-[520px] w-full rounded-xl bg-black" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={openEditor} disabled={!resultAssetId} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Film className="h-4 w-4" />Abrir editor profissional</button><a href={resultUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"><Play className="h-4 w-4" />Abrir prévia</a></div></div>}

        <button type="button" onClick={startProduction} disabled={processing || !gate.previewReady || !voiceProfileId || !identityId} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40 sm:w-auto"><Sparkles className="h-4 w-4" />{mode === "duble" ? (gate.publishReady ? "Produzir vídeo profissional com Dublê" : "Gerar prévia do Dublê") : "Produzir com mídias reais + locução"}<ArrowRight className="h-4 w-4" /></button>
        {mode === "duble" && !gate.publishReady && gate.previewReady && <p className="text-[11px] text-amber-700 dark:text-amber-300">Enquanto o Dublê não atingir o Professional Quality Gate, o resultado deve ser tratado como prévia. Para publicação imediata, selecione “Mídias reais + locução”.</p>}
      </section>
    </section>
  );
}
