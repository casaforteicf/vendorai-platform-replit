import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clapperboard,
  Film,
  Gauge,
  Library,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import ProfessionalAudioLibrary from "./ProfessionalAudioLibrary";
import {
  assetLabel,
  mediaUrl,
  scenesFromGeneration,
  scriptFromScenes,
  suggestAssetForScene,
  type ProfessionalMediaAsset,
  type ProfessionalScene,
} from "./professional-video";

type CreationProfileId = "performance" | "product" | "institutional" | "educational" | "testimonial";
type Channel = "Instagram / Reels" | "TikTok" | "YouTube" | "Site / Landing Page" | "WhatsApp";

type CreationProfile = {
  id: CreationProfileId;
  name: string;
  description: string;
  structure: string;
  direction: string;
  defaultDuration: 15 | 20 | 30;
  preset: "social" | "clean" | "cinematic";
  intensity: "soft" | "medium";
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

type QaCheck = {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warn" | "fail" | "pending";
};

type VideoMetadata = {
  duration: number;
  width: number;
  height: number;
};

const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

const PROFILES: CreationProfile[] = [
  {
    id: "performance",
    name: "Performance / Leads",
    description: "Gancho rápido, dor, prova, oferta e CTA mensurável.",
    structure: "Gancho → problema → demonstração/prova → benefício → CTA",
    direction: "ritmo objetivo, mensagem simples, prova visual real, CTA direto, sem promessas não comprovadas",
    defaultDuration: 20,
    preset: "social",
    intensity: "medium",
  },
  {
    id: "product",
    name: "Produto / Demonstração",
    description: "Mostra produto, aplicação, detalhes e benefício real.",
    structure: "Contexto → produto em uso → detalhes → resultado → CTA",
    direction: "fotografia comercial realista, foco no produto, cortes limpos, preservar cores e características reais",
    defaultDuration: 30,
    preset: "clean",
    intensity: "soft",
  },
  {
    id: "institutional",
    name: "Institucional / Marca",
    description: "Constrói confiança, posicionamento e percepção de valor.",
    structure: "Abertura de marca → capacidade → diferenciais → prova → assinatura",
    direction: "premium, sóbrio, consistente, linguagem humana, sem excesso de efeitos",
    defaultDuration: 30,
    preset: "cinematic",
    intensity: "soft",
  },
  {
    id: "educational",
    name: "Educacional / Autoridade",
    description: "Explica um tema com clareza e reforça autoridade.",
    structure: "Pergunta/dor → explicação → exemplo → conclusão → CTA leve",
    direction: "didático, claro, ritmo confortável, exemplos concretos, texto fácil de acompanhar",
    defaultDuration: 30,
    preset: "clean",
    intensity: "soft",
  },
  {
    id: "testimonial",
    name: "Prova / Depoimento",
    description: "Organiza prova real sem fabricar falas ou resultados.",
    structure: "Contexto → situação real → evidência → percepção → CTA",
    direction: "documental, natural, autêntico, usar somente material e afirmações reais fornecidas pelo tenant",
    defaultDuration: 30,
    preset: "clean",
    intensity: "soft",
  },
];

const CHANNELS: Channel[] = ["Instagram / Reels", "TikTok", "YouTube", "Site / Landing Page", "WhatsApp"];
const DURATIONS: Array<15 | 20 | 30> = [15, 20, 30];

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

function aspectRatioFor(channel: Channel): "portrait" | "landscape" {
  return channel === "YouTube" || channel === "Site / Landing Page" ? "landscape" : "portrait";
}

function generatorTypeFor(channel: Channel): "reels" | "youtube" | "tiktok" {
  if (channel === "YouTube") return "youtube";
  if (channel === "TikTok") return "tiktok";
  return "reels";
}

function directorPrompt(input: {
  profile: CreationProfile;
  objective: string;
  product: string;
  audience: string;
  offer: string;
  channel: Channel;
  duration: number;
  proof: string;
  restrictions: string;
}): string {
  return [
    `MODELO CRIATIVO: ${input.profile.name}`,
    `ESTRUTURA: ${input.profile.structure}`,
    `DIREÇÃO: ${input.profile.direction}`,
    input.objective ? `OBJETIVO: ${input.objective}` : "",
    input.product ? `PRODUTO/SERVIÇO: ${input.product}` : "",
    input.audience ? `PÚBLICO: ${input.audience}` : "",
    input.offer ? `OFERTA/CTA: ${input.offer}` : "",
    input.proof ? `PROVAS E FATOS DISPONÍVEIS: ${input.proof}` : "",
    input.restrictions ? `RESTRIÇÕES: ${input.restrictions}` : "",
    `CANAL: ${input.channel}`,
    `DURAÇÃO: ${input.duration}s`,
    "Crie um roteiro profissional cena a cena. Não invente preços, garantias, depoimentos, certificações, números, resultados ou características não informadas.",
    "Cada cena precisa ter fala e orientação visual coerentes. Priorize mídia real do tenant e continuidade visual.",
  ].filter(Boolean).join("\n");
}

function scorePreflight(input: {
  objective: string;
  product: string;
  audience: string;
  offer: string;
  scriptApproved: boolean;
  scenes: ProfessionalScene[];
  voiceoverAssetId: string;
  musicAssetId: string;
}): { score: number; checks: QaCheck[]; ready: boolean } {
  const selectedScenes = input.scenes.filter((scene) => scene.assetId).length;
  const checks: QaCheck[] = [
    {
      id: "brief",
      label: "Briefing completo",
      detail: input.objective && input.product && input.audience ? "Objetivo, produto e público definidos." : "Preencha objetivo, produto/serviço e público.",
      status: input.objective && input.product && input.audience ? "pass" : "fail",
    },
    {
      id: "script",
      label: "Roteiro aprovado",
      detail: input.scriptApproved ? "Texto travado para produção." : "A produção não deve iniciar sem aprovação do roteiro.",
      status: input.scriptApproved ? "pass" : "fail",
    },
    {
      id: "storyboard",
      label: "Storyboard coberto por mídia real",
      detail: input.scenes.length ? `${selectedScenes}/${input.scenes.length} cenas com mídia selecionada.` : "Storyboard ainda não criado.",
      status: input.scenes.length > 0 && selectedScenes === input.scenes.length ? "pass" : "fail",
    },
    {
      id: "voice",
      label: "Locução",
      detail: input.voiceoverAssetId ? "Locução da Biblioteca selecionada." : "Sem locução selecionada; o vídeo poderá depender apenas do áudio original/música.",
      status: input.voiceoverAssetId ? "pass" : "warn",
    },
    {
      id: "music",
      label: "Trilha",
      detail: input.musicAssetId ? "Trilha definida para mixagem." : "Sem trilha; use áudio original ou finalize depois no editor.",
      status: input.musicAssetId ? "pass" : "warn",
    },
    {
      id: "cta",
      label: "Próxima ação",
      detail: input.offer ? "Oferta/CTA definido." : "Sem CTA explícito; aceitável para institucional, mas reduz performance em campanhas.",
      status: input.offer ? "pass" : "warn",
    },
  ];
  const points = checks.reduce((sum, check) => sum + (check.status === "pass" ? 16.67 : check.status === "warn" ? 8.34 : 0), 0);
  const ready = checks.every((check) => check.status !== "fail");
  return { score: Math.round(points), checks, ready };
}

function loadVideoMetadata(url: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timer = window.setTimeout(() => reject(new Error("Tempo excedido ao validar o MP4 final")), 15000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve({ duration: Number(video.duration || 0), width: video.videoWidth || 0, height: video.videoHeight || 0 });
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("O navegador não conseguiu abrir o MP4 final"));
    };
    video.src = url;
  });
}

function postRenderChecks(meta: VideoMetadata | null, targetDuration: number, aspect: "portrait" | "landscape", hasResult: boolean): QaCheck[] {
  if (!hasResult) return [{ id: "render", label: "Arquivo final", detail: "Aguardando renderização.", status: "pending" }];
  if (!meta) return [{ id: "render", label: "Arquivo final", detail: "MP4 gerado; aguardando leitura técnica.", status: "pending" }];
  const expectedPortrait = aspect === "portrait";
  const actualPortrait = meta.height >= meta.width;
  const durationTolerance = Math.max(2, targetDuration * 0.15);
  const shortSide = Math.min(meta.width, meta.height);
  return [
    { id: "playable", label: "MP4 reproduzível", detail: `${meta.width}×${meta.height} · ${meta.duration.toFixed(1)}s`, status: meta.width > 0 && meta.height > 0 && meta.duration > 0 ? "pass" : "fail" },
    { id: "ratio", label: "Formato do canal", detail: expectedPortrait ? "Esperado 9:16 / vertical." : "Esperado 16:9 / horizontal.", status: expectedPortrait === actualPortrait ? "pass" : "fail" },
    { id: "duration", label: "Duração", detail: `Meta ${targetDuration}s · arquivo ${meta.duration.toFixed(1)}s.`, status: Math.abs(meta.duration - targetDuration) <= durationTolerance ? "pass" : "warn" },
    { id: "resolution", label: "Resolução mínima", detail: `${meta.width}×${meta.height}.`, status: shortSide >= 720 ? "pass" : "warn" },
  ];
}

export default function ProfessionalCreationModelPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [profileId, setProfileId] = useState<CreationProfileId>("performance");
  const profile = useMemo(() => PROFILES.find((item) => item.id === profileId) ?? PROFILES[0]!, [profileId]);
  const [objective, setObjective] = useState("");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [offer, setOffer] = useState("");
  const [proof, setProof] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [channel, setChannel] = useState<Channel>("Instagram / Reels");
  const [duration, setDuration] = useState<15 | 20 | 30>(20);

  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [script, setScript] = useState("");
  const [scriptApproved, setScriptApproved] = useState(false);
  const [scenes, setScenes] = useState<ProfessionalScene[]>([]);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [assigningMedia, setAssigningMedia] = useState(false);

  const [voiceoverAssetId, setVoiceoverAssetId] = useState("");
  const [musicAssetId, setMusicAssetId] = useState("");
  const [effectAssetId, setEffectAssetId] = useState("");
  const [jingleAssetId, setJingleAssetId] = useState("");

  const [processing, setProcessing] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<ProjectJob | null>(null);
  const [resultAssetId, setResultAssetId] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  const visualAssets = useMemo(() => assets.filter((asset) => asset.type === "image" || asset.type === "video"), [assets]);
  const audioAssets = useMemo(() => assets.filter((asset) => asset.type === "audio"), [assets]);
  const aspect = aspectRatioFor(channel);
  const preflight = useMemo(() => scorePreflight({ objective, product, audience, offer, scriptApproved, scenes, voiceoverAssetId, musicAssetId }), [objective, product, audience, offer, scriptApproved, scenes, voiceoverAssetId, musicAssetId]);
  const finalQa = useMemo(() => postRenderChecks(videoMeta, duration, aspect, Boolean(resultUrl)), [videoMeta, duration, aspect, resultUrl]);
  const finalQaReady = Boolean(resultUrl) && finalQa.every((check) => check.status !== "fail" && check.status !== "pending");

  const loadAssets = useCallback(async () => {
    if (!tenantId) return;
    setLoadingAssets(true);
    try {
      const [imagesRes, videosRes, audioRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=250`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=250`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=audio&limit=500`, { headers: authHeaders() }),
      ]);
      const [imagesData, videosData, audioData] = await Promise.all([
        imagesRes.json().catch(() => ({})), videosRes.json().catch(() => ({})), audioRes.json().catch(() => ({})),
      ]);
      const all = [imagesData, videosData, audioData].flatMap((data) => Array.isArray(data.assets) ? data.assets as ProfessionalMediaAsset[] : []);
      setAssets(Array.from(new Map(all.map((asset) => [asset.id, asset])).values()));
    } catch (error) {
      toast({ title: "Biblioteca indisponível", description: error instanceof Error ? error.message : "Não foi possível carregar as mídias", variant: "destructive" });
    } finally {
      setLoadingAssets(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { void loadAssets(); }, [loadAssets]);

  useEffect(() => {
    setDuration(profile.defaultDuration);
  }, [profile.defaultDuration]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      const raw = sessionStorage.getItem(MEDIA_PLAN_EXECUTION_KEY);
      if (!raw) return;
      const execution = JSON.parse(raw) as {
        source?: string;
        tenantId?: string;
        campaign?: { objetivo?: string; produtoServico?: string; publico?: string; oferta?: string; mensagemCentral?: string };
        calendarItem?: { temaSugerido?: string; canal?: string; tipo?: string };
      };
      if (execution.source !== "media-calendar" || execution.tenantId !== tenantId) return;
      setObjective((value) => value || execution.campaign?.objetivo || execution.calendarItem?.temaSugerido || "");
      setProduct((value) => value || execution.campaign?.produtoServico || "");
      setAudience((value) => value || execution.campaign?.publico || "");
      setOffer((value) => value || execution.campaign?.oferta || "");
      setProof((value) => value || execution.campaign?.mensagemCentral || "");
      const incomingChannel = execution.calendarItem?.canal;
      if (incomingChannel && CHANNELS.includes(incomingChannel as Channel)) setChannel(incomingChannel as Channel);
    } catch {}
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !projectId || !jobId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiJson<{ jobs?: ProjectJob[] }>(`/api/tenants/${tenantId}/media/projects/${projectId}`);
        const current = (data.jobs ?? []).find((item) => item.id === jobId) ?? null;
        if (cancelled || !current) return;
        setJob(current);
        if (current.status === "done") {
          setProcessing(false);
          const outputUrl = current.output?.videoUrl ?? current.videoUrl ?? "";
          const outputAssetId = current.output?.videoAssetId ?? current.output?.assetId ?? current.assetId ?? "";
          setResultUrl(mediaUrl(outputUrl));
          setResultAssetId(outputAssetId);
        }
        if (current.status === "error") {
          setProcessing(false);
          toast({ title: "Renderização interrompida", description: current.error ?? "Falha no vídeo", variant: "destructive" });
        }
      } catch {}
    };
    void load();
    if (job?.status === "done" || job?.status === "error") return () => { cancelled = true; };
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [tenantId, projectId, jobId, job?.status, toast]);

  useEffect(() => {
    if (!resultUrl) {
      setVideoMeta(null);
      return;
    }
    let cancelled = false;
    setQaLoading(true);
    void loadVideoMetadata(resultUrl)
      .then((meta) => { if (!cancelled) setVideoMeta(meta); })
      .catch(() => { if (!cancelled) setVideoMeta(null); })
      .finally(() => { if (!cancelled) setQaLoading(false); });
    return () => { cancelled = true; };
  }, [resultUrl]);

  const generateScript = async () => {
    if (!tenantId || generatingScript) return;
    if (!objective.trim() && !product.trim()) {
      toast({ title: "Briefing incompleto", description: "Defina pelo menos o objetivo e o produto/serviço." });
      return;
    }
    setGeneratingScript(true);
    setScriptApproved(false);
    setResultUrl("");
    setResultAssetId("");
    const direction = directorPrompt({ profile, objective, product, audience, offer, channel, duration, proof, restrictions });
    try {
      const data = await apiJson<Record<string, unknown>>(`/api/tenants/${tenantId}/content/generate`, {
        method: "POST",
        body: JSON.stringify({
          type: generatorTypeFor(channel),
          theme: direction.slice(0, 8000),
          variations: 1,
          imageCount: 1,
          postObjective: objective.trim(),
          desiredCta: offer.trim(),
          voiceTone: "natural, profissional, confiável, humano e específico",
        }),
      });
      const nextScenes = scenesFromGeneration(data);
      if (!nextScenes.length) throw new Error("Não foi possível montar um storyboard aproveitável");
      setScenes(nextScenes);
      setScript(scriptFromScenes(nextScenes));
      toast({ title: "Direção criativa pronta", description: "Revise o roteiro, aprove e vincule mídia real a cada cena." });
    } catch (error) {
      toast({ title: "Falha na direção criativa", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setGeneratingScript(false);
    }
  };

  const approveScript = () => {
    if (!script.trim()) return;
    setScriptApproved(true);
    toast({ title: "Roteiro aprovado", description: "A versão foi travada como base desta produção." });
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
    toast({ title: "Mídias sugeridas", description: "Revise as escolhas. O sistema priorizou conteúdo real da Biblioteca." });
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

  const startRender = async () => {
    if (!tenantId || processing || !preflight.ready) return;
    const mediaInputs: Array<Record<string, unknown>> = scenes.map((scene, index) => ({
      assetId: scene.assetId,
      type: scene.assetType,
      role: index === 0 ? "opening" : index === scenes.length - 1 ? "closing" : "broll",
      importance: "required",
      order: index,
      note: `${scene.visual} | ${scene.fala}`.slice(0, 480),
    }));
    if (voiceoverAssetId) mediaInputs.push({ assetId: voiceoverAssetId, type: "audio", role: "voiceover", importance: "required", order: 100 });
    if (musicAssetId) mediaInputs.push({ assetId: musicAssetId, type: "audio", role: "music", importance: "preferred", order: 101 });
    if (effectAssetId) mediaInputs.push({ assetId: effectAssetId, type: "audio", role: "sfx", importance: "preferred", order: 102 });

    setProcessing(true);
    setJob(null);
    setProjectId("");
    setJobId("");
    setResultUrl("");
    setResultAssetId("");
    setVideoMeta(null);
    try {
      const prompt = directorPrompt({ profile, objective, product, audience, offer, channel, duration, proof, restrictions });
      const data = await apiJson<{ projectId: string; jobId: string }>(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        body: JSON.stringify({
          operation: "video_generate",
          title: `${profile.name} — ${product || objective || "produção"}`.slice(0, 120),
          context: {
            prompt: prompt.slice(0, 4000),
            style: profile.direction,
            aspectRatio: aspect,
            duration,
            sceneCount: scenes.length,
            generationMode: "media_only",
            mediaInputs,
            effects: {
              preset: profile.preset,
              intensity: profile.intensity,
              transition: "smooth",
              motion: profile.id === "performance" ? "punch" : "drift",
              color: "natural",
              grain: false,
              vignette: false,
              sharpen: true,
              beatSync: Boolean(musicAssetId),
              bpm: 112,
              sfx: "none",
            },
            professionalCreation: {
              version: 2,
              profileId: profile.id,
              scriptApproved: true,
              script,
              storyboard: scenes.map((scene, index) => ({ index, fala: scene.fala, visual: scene.visual, assetId: scene.assetId })),
              requestedJingleAssetId: jingleAssetId || null,
              note: jingleAssetId ? "Jingle registrado para finalização/editor; o compositor automático atual mistura voz, música e SFX." : null,
            },
          },
        }),
      });
      setProjectId(data.projectId);
      setJobId(data.jobId);
      toast({ title: "Produção iniciada", description: "O render usa somente as mídias aprovadas e passa por QA técnico ao final." });
    } catch (error) {
      setProcessing(false);
      toast({ title: "Não foi possível iniciar a produção", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
  };

  const resetProduction = () => {
    setProcessing(false);
    setProjectId("");
    setJobId("");
    setJob(null);
    setResultUrl("");
    setResultAssetId("");
    setVideoMeta(null);
  };

  const progress = Math.max(0, Math.min(100, Number(job?.progress ?? (processing ? 2 : 0))));

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-card to-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Clapperboard className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold text-foreground">Modelo Profissional de Criação</h2><span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Direção → produção → QA</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">O sistema deixa de “gerar um vídeo” e passa a conduzir uma produção: objetivo, formato criativo, roteiro aprovado, storyboard, mídia real, áudio, render e controle de qualidade.</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadAssets()} disabled={loadingAssets} className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">{loadingAssets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar Biblioteca</button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">1 · Modelo criativo</p><h3 className="mt-1 font-semibold text-foreground">Escolha a lógica da peça antes de escrever o roteiro</h3></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {PROFILES.map((item) => (
            <button key={item.id} type="button" onClick={() => setProfileId(item.id)} className={cn("rounded-2xl border p-3 text-left transition", profileId === item.id ? "border-primary/45 bg-primary/[0.07]" : "border-border bg-background/40 hover:border-primary/25")}> 
              <p className="text-sm font-semibold text-foreground">{item.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Estrutura:</span> {profile.structure}</div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">2 · Briefing</p><h3 className="mt-1 font-semibold text-foreground">A IA recebe fatos e direção; não inventa o negócio</h3></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Objetivo</span><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Ex.: gerar leads qualificados" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Produto / serviço</span><input value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Ex.: sistema VendorAI" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Público</span><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ex.: gestores comerciais" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Oferta / CTA</span><input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Ex.: agende uma demonstração" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-medium text-muted-foreground">Provas, diferenciais e fatos que podem aparecer</span><textarea value={proof} onChange={(event) => setProof(event.target.value)} rows={3} placeholder="Somente informações confirmadas: diferenciais, aplicação, números autorizados, depoimentos reais…" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
          <label className="space-y-1.5 md:col-span-2"><span className="text-xs font-medium text-muted-foreground">Restrições</span><input value={restrictions} onChange={(event) => setRestrictions(event.target.value)} placeholder="Ex.: não alterar produto, não usar pessoas genéricas, não prometer economia específica" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Canal</span><select value={channel} onChange={(event) => setChannel(event.target.value as Channel)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Duração do render</span><div className="flex flex-wrap gap-2">{DURATIONS.map((item) => <button key={item} type="button" onClick={() => setDuration(item)} className={cn("rounded-lg border px-3 py-2 text-xs font-medium", duration === item ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{item}s</button>)}</div></div>
        </div>
        <button type="button" onClick={() => void generateScript()} disabled={generatingScript} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{generatingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}Criar direção + roteiro</button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">3 · Roteiro e storyboard</p><h3 className="mt-1 font-semibold text-foreground">Aprovação humana antes do render</h3></div>{scriptApproved && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Roteiro aprovado</span>}</div>
        <textarea value={script} onChange={(event) => { setScript(event.target.value); setScriptApproved(false); }} rows={6} placeholder="O roteiro profissional aparecerá aqui." className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-primary/50" />
        <div className="flex flex-wrap gap-2"><button type="button" onClick={approveScript} disabled={!script.trim()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-40 dark:text-emerald-300"><Check className="h-4 w-4" />Aprovar roteiro</button><button type="button" onClick={assignMedia} disabled={!scenes.length || assigningMedia || loadingAssets} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground disabled:opacity-40"><Library className="h-4 w-4" />Sugerir mídias reais</button></div>
        {!scenes.length ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Gere a direção criativa para montar o storyboard.</div> : <div className="space-y-3">{scenes.map((scene, index) => (
          <div key={scene.id} className="grid gap-3 rounded-xl border border-border bg-background/40 p-3 lg:grid-cols-[64px_1fr_1fr] lg:items-start">
            <div className="rounded-lg bg-muted px-2 py-2 text-center"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cena</p><p className="text-lg font-bold text-foreground">{index + 1}</p><p className="text-[10px] text-muted-foreground">{scene.duracao}</p></div>
            <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fala</p><p className="mt-1 text-sm text-foreground">{scene.fala}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Direção visual</p><p className="mt-1 text-xs text-muted-foreground">{scene.visual}</p></div>
            <label className="space-y-1.5"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mídia aprovada</span><select value={scene.assetId} onChange={(event) => changeSceneAsset(scene.id, event.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"><option value="">Selecionar foto/vídeo real…</option>{visualAssets.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select>{scene.assetLabel && <p className="truncate text-[11px] text-emerald-600 dark:text-emerald-300">{scene.assetLabel}</p>}</label>
          </div>
        ))}</div>}
      </section>

      <ProfessionalAudioLibrary
        assets={audioAssets}
        musicAssetId={musicAssetId}
        effectAssetId={effectAssetId}
        jingleAssetId={jingleAssetId}
        voiceoverAssetId={voiceoverAssetId}
        onMusicChange={setMusicAssetId}
        onEffectChange={setEffectAssetId}
        onJingleChange={setJingleAssetId}
        onVoiceoverChange={setVoiceoverAssetId}
      />

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">4 · Preflight</p><h3 className="mt-1 font-semibold text-foreground">Controle de qualidade antes de gastar processamento</h3></div><div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold", preflight.ready ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300")}><Gauge className="h-4 w-4" />{preflight.score}/100</div></div>
        <div className="grid gap-2 md:grid-cols-2">{preflight.checks.map((check) => <div key={check.id} className="flex gap-3 rounded-xl border border-border bg-background/40 p-3">{check.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : check.status === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}<div><p className="text-xs font-semibold text-foreground">{check.label}</p><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{check.detail}</p></div></div>)}</div>
        {jingleAssetId && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs text-amber-700 dark:text-amber-300">O jingle fica registrado no projeto para finalização. O compositor automático atual mistura locução, música e SFX; o jingle deve ser conferido/aplicado na edição final.</div>}
        <button type="button" onClick={() => void startRender()} disabled={!preflight.ready || processing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{processing ? "Produzindo vídeo…" : "Renderizar versão profissional"}</button>
        {processing && <div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Montagem, áudio, transições e Brand Kit</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">5 · QA final</p><h3 className="mt-1 font-semibold text-foreground">O arquivo precisa passar pela checagem antes de publicar</h3></div>{finalQaReady && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />Aprovado tecnicamente</span>}</div>
        {resultUrl ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]"><div className="overflow-hidden rounded-2xl border border-border bg-black"><video src={resultUrl} controls className="max-h-[520px] w-full bg-black" /></div><div className="space-y-2">{qaLoading && <div className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo metadados do vídeo final…</div>}{finalQa.map((check) => <div key={check.id} className="flex gap-3 rounded-xl border border-border bg-background/40 p-3">{check.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : check.status === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : check.status === "pending" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}<div><p className="text-xs font-semibold text-foreground">{check.label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{check.detail}</p></div></div>)}<div className="flex flex-wrap gap-2 pt-2"><button type="button" onClick={() => resultAssetId && navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(resultAssetId)}`)} disabled={!resultAssetId} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Film className="h-4 w-4" />Abrir edição final</button><button type="button" onClick={resetProduction} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground">Gerar nova versão</button></div></div></div> : <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center"><Target className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">O QA será executado automaticamente quando o MP4 final ficar pronto.</p></div>}
      </section>

      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p><span className="font-semibold text-foreground">Princípio do novo modelo:</span> a IA dirige e organiza; a Biblioteca fornece a verdade visual; o roteiro é aprovado antes da produção; e o arquivo final passa por QA antes de publicação.</p></div></div>
    </section>
  );
}
