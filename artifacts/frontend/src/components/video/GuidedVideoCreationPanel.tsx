import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Film,
  ImagePlus,
  Library,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
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
  rankAssetsForScene,
  scenesFromGeneration,
  scriptFromScenes,
  suggestAssetForScene,
  type ProfessionalMediaAsset,
  type ProfessionalScene,
} from "./professional-video";

type IntentId = "performance" | "product" | "institutional" | "educational" | "testimonial";
type Channel = "Instagram / Reels" | "TikTok" | "YouTube" | "Site / Landing Page" | "WhatsApp";
type Duration = 15 | 20 | 30;
type CheckStatus = "pass" | "warn" | "fail" | "pending";
type VideoSourceMode = "real_only" | "hybrid" | "ai_only";

type Intent = {
  id: IntentId;
  name: string;
  description: string;
  structure: string;
  direction: string;
  defaultDuration: Duration;
  preset: "social" | "clean" | "cinematic";
  intensity: "soft" | "medium";
};

type ProjectJob = {
  id: string;
  status: string;
  progress?: number | null;
  error?: string | null;
  output?: { videoUrl?: string; videoAssetId?: string; assetId?: string } | null;
  videoUrl?: string;
  assetId?: string;
};

type QualityCheck = {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
};

type VideoMetadata = { duration: number; width: number; height: number };

type MediaProjectSummary = {
  id: string;
  title: string;
  status: string;
  context?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type MediaVersion = {
  id: string;
  assetId?: string | null;
  operation?: string | null;
  label?: string | null;
  createdAt?: string | null;
};

type VersionEntry = {
  projectId: string;
  versionNumber: number;
  title: string;
  status: string;
  assetId: string;
  url: string;
  createdAt: string;
};

type SceneMatch = {
  sceneId: string;
  status: CheckStatus;
  label: string;
  detail: string;
  bestAssetId: string;
};

type Draft = {
  step: number;
  seriesId: string;
  intentId: IntentId;
  objective: string;
  product: string;
  audience: string;
  offer: string;
  proof: string;
  restrictions: string;
  channel: Channel;
  duration: Duration;
  sourceMode: VideoSourceMode;
  script: string;
  scriptApproved: boolean;
  scenes: ProfessionalScene[];
  voiceoverAssetId: string;
  musicAssetId: string;
  effectAssetId: string;
  jingleAssetId: string;
};

const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

const INTENTS: Intent[] = [
  {
    id: "performance",
    name: "Gerar leads",
    description: "Atrair atenção, mostrar valor e levar a pessoa para uma próxima ação.",
    structure: "Gancho → problema → prova → benefício → chamada para ação",
    direction: "ritmo objetivo, mensagem simples, prova visual real, CTA direto, sem promessas não comprovadas",
    defaultDuration: 20,
    preset: "social",
    intensity: "medium",
  },
  {
    id: "product",
    name: "Mostrar produto",
    description: "Apresentar aplicação, detalhes e benefícios reais do produto ou serviço.",
    structure: "Contexto → produto em uso → detalhes → benefício → chamada para ação",
    direction: "fotografia comercial realista, foco no produto, cortes limpos, preservar cores e características reais",
    defaultDuration: 30,
    preset: "clean",
    intensity: "soft",
  },
  {
    id: "institutional",
    name: "Apresentar a empresa",
    description: "Explicar quem é a empresa e reforçar confiança e posicionamento.",
    structure: "Abertura → capacidade → diferenciais → prova → assinatura",
    direction: "premium, sóbrio, consistente, linguagem humana, sem excesso de efeitos",
    defaultDuration: 30,
    preset: "cinematic",
    intensity: "soft",
  },
  {
    id: "educational",
    name: "Explicar um tema",
    description: "Ensinar algo útil de forma simples e reforçar autoridade.",
    structure: "Pergunta → explicação → exemplo → conclusão → próxima ação",
    direction: "didático, claro, ritmo confortável, exemplos concretos, texto fácil de acompanhar",
    defaultDuration: 30,
    preset: "clean",
    intensity: "soft",
  },
  {
    id: "testimonial",
    name: "Usar prova real",
    description: "Organizar depoimento, caso ou evidência sem inventar falas ou resultados.",
    structure: "Contexto → situação real → evidência → percepção → próxima ação",
    direction: "documental, natural, autêntico, usar somente material e afirmações reais fornecidas pelo tenant",
    defaultDuration: 30,
    preset: "clean",
    intensity: "soft",
  },
];

const CHANNELS: Channel[] = ["Instagram / Reels", "TikTok", "YouTube", "Site / Landing Page", "WhatsApp"];
const DURATIONS: Duration[] = [15, 20, 30];
const STEPS = ["Briefing", "Direção e roteiro", "Storyboard", "Produção", "Finalizar"];
const SOURCE_MODES: Array<{ id: VideoSourceMode; title: string; description: string }> = [
  { id: "real_only", title: "Somente mídias reais", description: "Usa apenas fotos e vídeos da Biblioteca. A IA organiza roteiro, seleção e edição, sem criar novos visuais." },
  { id: "hybrid", title: "Mídias reais + IA", description: "Prioriza a Biblioteca e gera somente as cenas que ficarem sem material adequado." },
  { id: "ai_only", title: "Gerar com IA", description: "O storyboard define a narrativa e o Media Engine cria os visuais necessários na produção." },
];

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function aspectRatioFor(channel: Channel): "portrait" | "landscape" {
  return channel === "YouTube" || channel === "Site / Landing Page" ? "landscape" : "portrait";
}

function generatorTypeFor(channel: Channel): "reels" | "youtube" | "tiktok" {
  if (channel === "YouTube") return "youtube";
  if (channel === "TikTok") return "tiktok";
  return "reels";
}

function imageContentTypeFor(channel: Channel): "stories" | "feed" {
  return aspectRatioFor(channel) === "portrait" ? "stories" : "feed";
}

function imageAspectFor(channel: Channel): "9:16" | "16:9" {
  return aspectRatioFor(channel) === "portrait" ? "9:16" : "16:9";
}

function buildDirection(input: {
  intent: Intent;
  objective: string;
  product: string;
  audience: string;
  offer: string;
  channel: Channel;
  duration: number;
  proof: string;
  restrictions: string;
}) {
  return [
    `OBJETIVO CRIATIVO: ${input.intent.name}`,
    `ESTRUTURA: ${input.intent.structure}`,
    `DIREÇÃO: ${input.intent.direction}`,
    input.objective ? `OBJETIVO DO NEGÓCIO: ${input.objective}` : "",
    input.product ? `PRODUTO/SERVIÇO: ${input.product}` : "",
    input.audience ? `PÚBLICO: ${input.audience}` : "",
    input.offer ? `PRÓXIMA AÇÃO/OFERTA: ${input.offer}` : "",
    input.proof ? `FATOS E PROVAS AUTORIZADOS: ${input.proof}` : "",
    input.restrictions ? `RESTRIÇÕES: ${input.restrictions}` : "",
    `CANAL: ${input.channel}`,
    `DURAÇÃO: ${input.duration}s`,
    "Crie um roteiro profissional cena a cena. Não invente preços, garantias, depoimentos, certificações, números, resultados ou características não informadas.",
    "Cada cena precisa ter fala e orientação visual coerentes. Priorize mídia real da empresa, do catálogo e continuidade visual.",
  ].filter(Boolean).join("\n");
}

function loadVideoMetadata(url: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timer = window.setTimeout(() => reject(new Error("Tempo excedido ao validar o vídeo final")), 15000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve({ duration: Number(video.duration || 0), width: video.videoWidth || 0, height: video.videoHeight || 0 });
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("O navegador não conseguiu abrir o vídeo final"));
    };
    video.src = url;
  });
}

function newSeriesId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `guided-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function generatedImageUrl(data: unknown): string {
  const root = asRecord(data);
  const result = asRecord(root.result);
  const variations = Array.isArray(result.variations) ? result.variations : [];
  for (const raw of variations) {
    const variation = asRecord(raw);
    if (typeof variation.imageUrl === "string" && variation.imageUrl.trim()) return variation.imageUrl.trim();
    if (Array.isArray(variation.imageUrls)) {
      const first = variation.imageUrls.find((url): url is string => typeof url === "string" && Boolean(url.trim()));
      if (first) return first.trim();
    }
    if (Array.isArray(variation.mediaUrls)) {
      const first = variation.mediaUrls.find((url): url is string => typeof url === "string" && Boolean(url.trim()));
      if (first) return first.trim();
    }
  }
  if (typeof root.imageUrl === "string" && root.imageUrl.trim()) return root.imageUrl.trim();
  if (Array.isArray(root.imageUrls)) {
    const first = root.imageUrls.find((url): url is string => typeof url === "string" && Boolean(url.trim()));
    if (first) return first.trim();
  }
  return "";
}

function selectedAssetFor(scene: ProfessionalScene, assets: ProfessionalMediaAsset[]): ProfessionalMediaAsset | null {
  return assets.find((asset) => asset.id === scene.assetId) ?? null;
}

export default function GuidedVideoCreationPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [step, setStep] = useState(1);
  const [seriesId, setSeriesId] = useState(() => newSeriesId());
  const [intentId, setIntentId] = useState<IntentId>("performance");
  const intent = useMemo(() => INTENTS.find((item) => item.id === intentId) ?? INTENTS[0]!, [intentId]);
  const [objective, setObjective] = useState("");
  const [product, setProduct] = useState("");
  const [audience, setAudience] = useState("");
  const [offer, setOffer] = useState("");
  const [proof, setProof] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [channel, setChannel] = useState<Channel>("Instagram / Reels");
  const [duration, setDuration] = useState<Duration>(20);
  const [sourceMode, setSourceMode] = useState<VideoSourceMode>("hybrid");
  const [showDetails, setShowDetails] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [script, setScript] = useState("");
  const [scriptApproved, setScriptApproved] = useState(false);
  const [scenes, setScenes] = useState<ProfessionalScene[]>([]);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [assigningMedia, setAssigningMedia] = useState(false);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState("");
  const [generatingVisualSceneId, setGeneratingVisualSceneId] = useState("");

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
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [versionHistory, setVersionHistory] = useState<VersionEntry[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const visualAssets = useMemo(() => assets.filter((asset) => asset.type === "image" || asset.type === "video"), [assets]);
  const audioAssets = useMemo(() => assets.filter((asset) => asset.type === "audio"), [assets]);
  const aspect = aspectRatioFor(channel);
  const draftKey = tenantId ? `vendorai_guided_video_draft_${tenantId}` : "";
  const mediaCoverage = scenes.length ? scenes.filter((scene) => scene.assetId).length : 0;
  const uniqueMedia = new Set(scenes.filter((scene) => scene.assetId).map((scene) => scene.assetId)).size;
  const projectTitle = product.trim() || objective.trim() || "Novo vídeo";
  const generatedVisualCount = scenes.filter((scene) => selectedAssetFor(scene, visualAssets)?.source === "generated").length;
  const manualAudioSelectionCount = [voiceoverAssetId, musicAssetId, effectAssetId, jingleAssetId].filter(Boolean).length;
  const automaticAudioMode = manualAudioSelectionCount === 0;

  const loadAssets = useCallback(async () => {
    if (!tenantId) return;
    setLoadingAssets(true);
    try {
      const [imagesRes, videosRes, audioRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=150`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=150`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=audio&limit=150`, { headers: authHeaders() }),
      ]);
      const [imagesData, videosData, audioData] = await Promise.all([
        imagesRes.json().catch(() => ({})),
        videosRes.json().catch(() => ({})),
        audioRes.json().catch(() => ({})),
      ]);
      const all = [imagesData, videosData, audioData].flatMap((data) => Array.isArray(data.assets) ? data.assets as ProfessionalMediaAsset[] : []);
      setAssets(Array.from(new Map(all.map((asset) => [asset.id, asset])).values()));
    } catch (error) {
      toast({ title: "Biblioteca indisponível", description: error instanceof Error ? error.message : "Não foi possível carregar as mídias", variant: "destructive" });
    } finally {
      setLoadingAssets(false);
    }
  }, [tenantId, toast]);

  const loadVersionHistory = useCallback(async () => {
    if (!tenantId || !seriesId) return;
    setLoadingVersions(true);
    try {
      const list = await apiJson<{ projects?: MediaProjectSummary[] }>(`/api/tenants/${tenantId}/media/projects?limit=100`);
      const matching = (list.projects ?? [])
        .filter((project) => String(asRecord(project.context).guidedVideoSeriesId ?? "") === seriesId)
        .slice(0, 12);
      const details = await Promise.all(matching.map(async (project) => {
        const body = await apiJson<{ project?: MediaProjectSummary; assets?: ProfessionalMediaAsset[]; versions?: MediaVersion[] }>(`/api/tenants/${tenantId}/media/projects/${project.id}`);
        const context = asRecord(body.project?.context ?? project.context);
        const versionNumber = Math.max(1, Number(context.guidedVideoVersion ?? 1) || 1);
        const output = (body.assets ?? []).find((asset) => asset.type === "video" && asset.role === "output") ?? null;
        const relatedVersion = (body.versions ?? []).find((version) => version.assetId === output?.id && version.operation === "video_generate");
        return {
          projectId: project.id,
          versionNumber,
          title: project.title,
          status: body.project?.status ?? project.status,
          assetId: output?.id ?? relatedVersion?.assetId ?? "",
          url: mediaUrl(output?.storageUrl ?? output?.storage_url ?? ""),
          createdAt: String(relatedVersion?.createdAt ?? body.project?.updatedAt ?? project.updatedAt ?? project.createdAt ?? ""),
        } satisfies VersionEntry;
      }));
      setVersionHistory(details.sort((a, b) => a.versionNumber - b.versionNumber));
    } catch {
      // Histórico é complementar e não deve bloquear o criador.
    } finally {
      setLoadingVersions(false);
    }
  }, [tenantId, seriesId]);

  useEffect(() => { void loadAssets(); }, [loadAssets]);

  useEffect(() => {
    if (!tenantId || draftLoaded) return;
    let restored = false;
    try {
      const rawDraft = localStorage.getItem(draftKey);
      if (rawDraft) {
        const draft = JSON.parse(rawDraft) as Partial<Draft>;
        if (draft.seriesId) setSeriesId(draft.seriesId);
        if (draft.intentId && INTENTS.some((item) => item.id === draft.intentId)) setIntentId(draft.intentId);
        if (draft.objective) setObjective(draft.objective);
        if (draft.product) setProduct(draft.product);
        if (draft.audience) setAudience(draft.audience);
        if (draft.offer) setOffer(draft.offer);
        if (draft.proof) setProof(draft.proof);
        if (draft.restrictions) setRestrictions(draft.restrictions);
        if (draft.channel && CHANNELS.includes(draft.channel)) setChannel(draft.channel);
        if (draft.duration && DURATIONS.includes(draft.duration)) setDuration(draft.duration);
        if (draft.sourceMode && SOURCE_MODES.some((item) => item.id === draft.sourceMode)) setSourceMode(draft.sourceMode);
        if (draft.script) setScript(draft.script);
        if (typeof draft.scriptApproved === "boolean") setScriptApproved(draft.scriptApproved);
        if (Array.isArray(draft.scenes)) setScenes(draft.scenes);
        if (draft.voiceoverAssetId) setVoiceoverAssetId(draft.voiceoverAssetId);
        if (draft.musicAssetId) setMusicAssetId(draft.musicAssetId);
        if (draft.effectAssetId) setEffectAssetId(draft.effectAssetId);
        if (draft.jingleAssetId) setJingleAssetId(draft.jingleAssetId);
        if (draft.step && draft.step >= 1 && draft.step <= 5) setStep(draft.step);
        restored = true;
      }
    } catch {}

    if (!restored) {
      try {
        const raw = sessionStorage.getItem(MEDIA_PLAN_EXECUTION_KEY);
        if (raw) {
          const execution = JSON.parse(raw) as {
            source?: string;
            tenantId?: string;
            campaign?: { objetivo?: string; produtoServico?: string; publico?: string; oferta?: string; mensagemCentral?: string };
            calendarItem?: { temaSugerido?: string; canal?: string };
          };
          if (execution.source === "media-calendar" && execution.tenantId === tenantId) {
            setObjective(execution.campaign?.objetivo || execution.calendarItem?.temaSugerido || "");
            setProduct(execution.campaign?.produtoServico || "");
            setAudience(execution.campaign?.publico || "");
            setOffer(execution.campaign?.oferta || "");
            setProof(execution.campaign?.mensagemCentral || "");
            if (execution.calendarItem?.canal && CHANNELS.includes(execution.calendarItem.canal as Channel)) setChannel(execution.calendarItem.canal as Channel);
          }
        }
      } catch {}
    }
    setDraftLoaded(true);
  }, [tenantId, draftKey, draftLoaded]);

  useEffect(() => {
    if (!draftLoaded || !draftKey) return;
    const draft: Draft = {
      step,
      seriesId,
      intentId,
      objective,
      product,
      audience,
      offer,
      proof,
      restrictions,
      channel,
      duration,
      sourceMode,
      script,
      scriptApproved,
      scenes,
      voiceoverAssetId,
      musicAssetId,
      effectAssetId,
      jingleAssetId,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draftLoaded, draftKey, step, seriesId, intentId, objective, product, audience, offer, proof, restrictions, channel, duration, sourceMode, script, scriptApproved, scenes, voiceoverAssetId, musicAssetId, effectAssetId, jingleAssetId]);

  useEffect(() => {
    if (!draftLoaded || !seriesId) return;
    void loadVersionHistory();
  }, [draftLoaded, seriesId, loadVersionHistory]);

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
          setResultUrl(mediaUrl(current.output?.videoUrl ?? current.videoUrl ?? ""));
          setResultAssetId(current.output?.videoAssetId ?? current.output?.assetId ?? current.assetId ?? "");
          void loadVersionHistory();
        }
        if (current.status === "error") {
          setProcessing(false);
          toast({ title: "A produção foi interrompida", description: current.error ?? "Falha ao gerar o vídeo", variant: "destructive" });
        }
      } catch {}
    };
    void load();
    if (job?.status === "done" || job?.status === "error") return () => { cancelled = true; };
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [tenantId, projectId, jobId, job?.status, toast, loadVersionHistory]);

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

  const retrievalContext = useMemo(() => ({
    channel,
    queryContext: [product, audience, objective].filter(Boolean).join(" "),
    allowGenerated: false,
    minimumQuality: 60,
  }), [channel, product, audience, objective]);

  const assignMediaToScenes = useCallback((sourceScenes: ProfessionalScene[]) => {
    const used = new Set<string>();
    return sourceScenes.map((scene) => {
      if (scene.assetId) {
        used.add(scene.assetId);
        return scene;
      }
      const asset = suggestAssetForScene(scene, visualAssets, used, retrievalContext);
      if (!asset) return scene;
      used.add(asset.id);
      return { ...scene, assetId: asset.id, assetType: asset.type as "image" | "video", assetLabel: assetLabel(asset) };
    });
  }, [visualAssets, retrievalContext]);

  const sceneMatches = useMemo<SceneMatch[]>(() => scenes.map((scene) => {
    if (!scene.assetId) {
      if (sourceMode === "real_only") {
        return { sceneId: scene.id, status: "fail", label: "Sem mídia real", detail: "Escolha uma foto ou vídeo da Biblioteca para esta cena.", bestAssetId: "" };
      }
      return {
        sceneId: scene.id,
        status: "warn",
        label: sourceMode === "hybrid" ? "IA completará esta cena" : "Cena será gerada por IA",
        detail: sourceMode === "hybrid"
          ? "Nenhuma mídia real foi aprovada para esta cena; o Media Engine poderá criar somente o visual que está faltando."
          : "O Media Engine criará o visual desta cena seguindo o storyboard aprovado.",
        bestAssetId: "",
      };
    }
    const rankings = rankAssetsForScene(scene, visualAssets, new Set<string>(), retrievalContext);
    const selected = rankings.find((item) => item.asset.id === scene.assetId);
    const selectedAsset = selectedAssetFor(scene, visualAssets);
    const bestAlternative = rankings.find((item) => item.asset.id !== scene.assetId)?.asset.id ?? "";
    if (selectedAsset?.source === "generated" && !selected?.ranking.diagnostics.hasIntelligenceIndex) {
      return {
        sceneId: scene.id,
        status: "warn",
        label: "Visual gerado — confira",
        detail: "A IA criou esta imagem para a cena. Confira visualmente antes de aprovar o storyboard.",
        bestAssetId: bestAlternative,
      };
    }
    if (!selected) {
      return { sceneId: scene.id, status: "warn", label: "Confira visualmente", detail: "A mídia selecionada não possui dados suficientes para uma comparação automática.", bestAssetId: bestAlternative };
    }
    const semantic = selected.ranking.subscores.semantic;
    const overall = selected.ranking.score;
    const indexed = selected.ranking.diagnostics.hasIntelligenceIndex;
    if (indexed && (semantic < 20 || overall < 40)) {
      return { sceneId: scene.id, status: "fail", label: "Não representa bem a cena", detail: "A análise encontrou pouca relação entre a mídia e a mensagem desta cena.", bestAssetId: bestAlternative };
    }
    if (!indexed || semantic < 45 || overall < 60 || selected.ranking.confidence === "low") {
      return { sceneId: scene.id, status: "warn", label: indexed ? "Pode melhorar" : "Confira visualmente", detail: indexed ? "Existe uma opção potencialmente mais alinhada ao roteiro." : "Esta mídia ainda não tem análise completa de conteúdo.", bestAssetId: bestAlternative };
    }
    return { sceneId: scene.id, status: "pass", label: "Bem alinhada", detail: selected.ranking.reasons.slice(0, 2).join(" · ") || "A mídia combina com a mensagem e o formato da cena.", bestAssetId: bestAlternative };
  }), [scenes, visualAssets, retrievalContext, sourceMode]);

  const generateScript = async () => {
    if (!tenantId || generatingScript) return;
    if (!objective.trim() || !product.trim() || !audience.trim()) {
      toast({ title: "Faltam informações", description: "Preencha objetivo, produto/serviço e público para a IA criar uma proposta coerente." });
      return;
    }
    setGeneratingScript(true);
    setScriptApproved(false);
    setResultUrl("");
    setResultAssetId("");
    try {
      const direction = buildDirection({ intent, objective, product, audience, offer, channel, duration, proof, restrictions });
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
      const generatedScenes = scenesFromGeneration(data);
      if (!generatedScenes.length) throw new Error("Não foi possível montar uma proposta de vídeo aproveitável");
      setScenes(assignMediaToScenes(generatedScenes));
      setScript(scriptFromScenes(generatedScenes));
      setStep(2);
      toast({ title: "Proposta pronta", description: "Revise o roteiro. As mídias reais compatíveis já foram pré-selecionadas quando disponíveis." });
    } catch (error) {
      toast({ title: "Não foi possível criar a proposta", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setGeneratingScript(false);
    }
  };

  const approveScript = () => {
    if (!script.trim()) return;
    setScriptApproved(true);
    setStep(3);
    toast({ title: "Roteiro aprovado", description: "Agora confira as cenas e as mídias escolhidas." });
  };

  const approveUpdatedScript = () => {
    if (!script.trim()) return;
    setScriptApproved(true);
    toast({ title: "Alterações aprovadas", description: "O roteiro atualizado está pronto para produção." });
  };

  const assignMedia = () => {
    if (!scenes.length || assigningMedia) return;
    setAssigningMedia(true);
    setScenes(assignMediaToScenes(scenes));
    setAssigningMedia(false);
    toast({ title: "Mídias atualizadas", description: "A VendorAI priorizou fotos e vídeos reais da Biblioteca." });
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

  const replaceSceneWithBest = (sceneId: string) => {
    const scene = scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    const used = new Set(scenes.filter((item) => item.id !== sceneId && item.assetId).map((item) => item.assetId));
    const suggestion = rankAssetsForScene(scene, visualAssets, used, retrievalContext)[0];
    if (!suggestion) {
      toast({ title: "Sem alternativa melhor", description: "Não encontrei outra mídia real compatível na Biblioteca." });
      return;
    }
    changeSceneAsset(sceneId, suggestion.asset.id);
    toast({ title: "Mídia substituída", description: "A cena recebeu a opção real mais alinhada encontrada pela Biblioteca." });
  };

  const regenerateScene = async (sceneId: string) => {
    if (!tenantId || regeneratingSceneId) return;
    const scene = scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    setRegeneratingSceneId(sceneId);
    try {
      const direction = buildDirection({ intent, objective, product, audience, offer, channel, duration, proof, restrictions });
      const data = await apiJson<Record<string, unknown>>(`/api/tenants/${tenantId}/content/generate`, {
        method: "POST",
        body: JSON.stringify({
          type: generatorTypeFor(channel),
          theme: [
            direction,
            "TAREFA ESPECÍFICA: melhore SOMENTE UMA CENA do storyboard.",
            `MENSAGEM ATUAL: ${scene.fala}`,
            `VISUAL ATUAL: ${scene.visual}`,
            "Preserve a intenção e os fatos confirmados, torne a cena mais clara e comercial e retorne apenas uma cena aproveitável.",
          ].join("\n").slice(0, 8000),
          variations: 1,
          imageCount: 1,
          postObjective: objective.trim(),
          desiredCta: offer.trim(),
          voiceTone: "natural, profissional, confiável, humano e específico",
        }),
      });
      const candidate = scenesFromGeneration(data)[0];
      if (!candidate) throw new Error("A IA não retornou uma cena aproveitável");
      const used = new Set(scenes.filter((item) => item.id !== sceneId && item.assetId).map((item) => item.assetId));
      const suggested = suggestAssetForScene(candidate, visualAssets, used, retrievalContext);
      const nextScenes = scenes.map((item) => item.id === sceneId ? {
        ...item,
        fala: candidate.fala || item.fala,
        visual: candidate.visual || item.visual,
        duracao: candidate.duracao || item.duracao,
        assetId: suggested?.id ?? "",
        assetType: suggested?.type === "video" ? "video" : suggested?.type === "image" ? "image" : "",
        assetLabel: suggested ? assetLabel(suggested) : "",
      } : item);
      setScenes(nextScenes);
      setScript(scriptFromScenes(nextScenes));
      setScriptApproved(false);
      toast({ title: "Cena refeita", description: "A mensagem foi atualizada. Aprove novamente o roteiro antes de produzir." });
    } catch (error) {
      toast({ title: "Não foi possível refazer a cena", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setRegeneratingSceneId("");
    }
  };

  const generateVisualForScene = async (sceneId: string) => {
    if (!tenantId || generatingVisualSceneId) return;
    const sceneIndex = scenes.findIndex((item) => item.id === sceneId);
    const scene = scenes[sceneIndex];
    if (!scene) return;
    setGeneratingVisualSceneId(sceneId);
    try {
      const prompt = [
        "GERE UMA IMAGEM DE B-ROLL PROFISSIONAL PARA UMA CENA DE VÍDEO.",
        `Produto/serviço: ${product}.`,
        `Público: ${audience}.`,
        `Objetivo do vídeo: ${objective}.`,
        `Mensagem da cena: ${scene.fala}.`,
        `O que deve aparecer: ${scene.visual}.`,
        proof ? `Fatos e diferenciais autorizados: ${proof}.` : "",
        restrictions ? `Restrições obrigatórias: ${restrictions}.` : "",
        `Formato: ${imageAspectFor(channel)} para ${channel}.`,
        "Fotografia publicitária realista, natural e coerente com o produto. Sem texto, sem tipografia, sem logotipo inventado, sem interface, sem moldura e sem marca d'água.",
        "Não invente preços, números, certificações, resultados, recursos ou características não fornecidas. Preserve características reais do produto quando descritas.",
      ].filter(Boolean).join("\n");

      const generated = await apiJson<Record<string, unknown>>(`/api/tenants/${tenantId}/content/generate`, {
        method: "POST",
        body: JSON.stringify({
          type: imageContentTypeFor(channel),
          theme: prompt.slice(0, 8000),
          variations: 1,
          imageCount: 1,
          aspectRatio: imageAspectFor(channel),
          postObjective: "B-roll visual para storyboard de vídeo",
          desiredCta: "",
          voiceTone: "visual comercial realista",
        }),
      });
      const imageUrl = generatedImageUrl(generated);
      if (!imageUrl) throw new Error("A geração terminou sem retornar uma imagem utilizável");

      const registered = await apiJson<{ asset?: ProfessionalMediaAsset }>(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          role: "broll",
          source: "generated",
          storageUrl: imageUrl,
          mimeType: imageUrl.toLowerCase().includes(".png") ? "image/png" : "image/jpeg",
          originalFilename: `video-${seriesId.slice(0, 8)}-cena-${sceneIndex + 1}-${Date.now()}.png`,
          metadata: {
            operation: "guided_video_scene_visual",
            aiRole: "guided_broll",
            guidedVideoSeriesId: seriesId,
            sceneId,
            sceneIndex,
            channel,
            targetFormat: imageAspectFor(channel),
            prompt,
          },
        }),
      });
      if (!registered.asset?.id) throw new Error("A imagem foi criada, mas não foi registrada na Biblioteca");
      const asset = registered.asset;
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      setScenes((current) => current.map((item) => item.id === sceneId ? {
        ...item,
        assetId: asset.id,
        assetType: "image",
        assetLabel: assetLabel(asset),
      } : item));
      toast({ title: "Visual criado para esta cena", description: "A imagem foi salva na Biblioteca e aplicada somente nesta cena. Confira antes de continuar." });
    } catch (error) {
      toast({ title: "Não foi possível gerar o visual", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setGeneratingVisualSceneId("");
    }
  };

  const qualityChecks = useMemo<QualityCheck[]>(() => {
    const allMediaReady = scenes.length > 0 && mediaCoverage === scenes.length;
    const mediaReadyForMode = sourceMode === "real_only" ? allMediaReady : scenes.length > 0;
    const enoughVariety = scenes.length <= 1 || uniqueMedia >= Math.min(2, scenes.length);
    const commercialNeedsCta = intentId === "performance" || intentId === "product";
    const relevanceFail = sceneMatches.some((item) => item.status === "fail");
    const relevanceWarn = sceneMatches.some((item) => item.status === "warn");
    return [
      {
        id: "brief",
        label: "Informações do vídeo",
        detail: objective && product && audience ? "Objetivo, produto e público estão definidos." : "Complete objetivo, produto/serviço e público.",
        status: objective && product && audience ? "pass" : "fail",
      },
      {
        id: "script",
        label: "Roteiro aprovado",
        detail: scriptApproved ? "O texto foi revisado e aprovado para produção." : "Aprove o roteiro antes de gerar o vídeo.",
        status: scriptApproved ? "pass" : "fail",
      },
      {
        id: "media",
        label: sourceMode === "real_only" ? "Todas as cenas têm mídia real" : "Cobertura visual do storyboard",
        detail: !scenes.length
          ? "O storyboard ainda não foi criado."
          : sourceMode === "real_only"
            ? `${mediaCoverage}/${scenes.length} cenas possuem foto ou vídeo real selecionado.`
            : mediaCoverage === scenes.length
              ? "Todas as cenas já possuem mídia aprovada; nenhuma geração visual adicional é necessária."
              : `${mediaCoverage}/${scenes.length} cenas usam mídia aprovada. As demais serão completadas pela IA conforme o storyboard.`,
        status: mediaReadyForMode ? (allMediaReady ? "pass" : "warn") : "fail",
      },
      {
        id: "relevance",
        label: "Mídias combinam com o roteiro",
        detail: relevanceFail ? "Há cena com mídia pouco relacionada ao conteúdo. Corrija antes de gerar." : relevanceWarn ? "Algumas cenas pedem conferência visual. Visuais gerados por IA também precisam dessa conferência." : "As mídias analisadas estão alinhadas às respectivas cenas.",
        status: relevanceFail ? "fail" : relevanceWarn ? "warn" : "pass",
      },
      {
        id: "variety",
        label: "Variedade visual",
        detail: enoughVariety ? "As cenas não dependem de uma única mídia repetida." : "Há repetição excessiva de mídia; substitua uma das cenas.",
        status: enoughVariety ? "pass" : "warn",
      },
      {
        id: "cta",
        label: "Próxima ação",
        detail: offer ? `CTA definido: ${offer}` : commercialNeedsCta ? "Defina o que a pessoa deve fazer depois do vídeo." : "CTA é opcional para este tipo de vídeo.",
        status: offer ? "pass" : commercialNeedsCta ? "warn" : "pass",
      },
      {
        id: "audio",
        label: "Direção de áudio",
        detail: automaticAudioMode
          ? "Áudio automático ativo. A VendorAI escolhe apenas trilhas, efeitos e assinaturas liberados na Biblioteca e faz a masterização; locução só entra quando você selecionar uma."
          : `${manualAudioSelectionCount} ajuste${manualAudioSelectionCount === 1 ? "" : "s"} manual${manualAudioSelectionCount === 1 ? "" : "is"}. O restante continua automático e os direitos são validados antes da masterização.`,
        status: "pass",
      },
    ];
  }, [objective, product, audience, scriptApproved, scenes.length, mediaCoverage, sceneMatches, uniqueMedia, intentId, offer, automaticAudioMode, manualAudioSelectionCount, sourceMode]);

  const readyToRender = qualityChecks.every((check) => check.status !== "fail");

  const finalChecks = useMemo<QualityCheck[]>(() => {
    if (!resultUrl) return [{ id: "result", label: "Vídeo final", detail: "Aguardando geração.", status: "pending" }];
    if (!videoMeta) return [{ id: "result", label: "Vídeo final", detail: "Arquivo gerado; conferindo qualidade técnica.", status: "pending" }];
    const expectedPortrait = aspect === "portrait";
    const actualPortrait = videoMeta.height >= videoMeta.width;
    const tolerance = Math.max(2, duration * 0.15);
    const shortSide = Math.min(videoMeta.width, videoMeta.height);
    return [
      { id: "playable", label: "Arquivo reproduzível", detail: `${videoMeta.width}×${videoMeta.height} · ${videoMeta.duration.toFixed(1)}s`, status: videoMeta.width > 0 && videoMeta.height > 0 && videoMeta.duration > 0 ? "pass" : "fail" },
      { id: "format", label: "Formato correto para o canal", detail: expectedPortrait ? "Formato vertical esperado." : "Formato horizontal esperado.", status: expectedPortrait === actualPortrait ? "pass" : "fail" },
      { id: "duration", label: "Duração adequada", detail: `Meta ${duration}s · arquivo ${videoMeta.duration.toFixed(1)}s.`, status: Math.abs(videoMeta.duration - duration) <= tolerance ? "pass" : "warn" },
      { id: "resolution", label: "Resolução", detail: `${videoMeta.width}×${videoMeta.height}.`, status: shortSide >= 720 ? "pass" : "warn" },
    ];
  }, [resultUrl, videoMeta, aspect, duration]);

  const finalReady = Boolean(resultUrl) && finalChecks.every((check) => check.status !== "fail" && check.status !== "pending");
  const nextVersionNumber = Math.max(0, ...versionHistory.map((item) => item.versionNumber)) + 1;

  const startRender = async () => {
    if (!tenantId || processing || !readyToRender) return;
    const mediaInputs: Array<Record<string, unknown>> = scenes.flatMap((scene, index) => scene.assetId ? [{
      assetId: scene.assetId,
      type: scene.assetType,
      role: index === 0 ? "opening" : index === scenes.length - 1 ? "closing" : "broll",
      importance: sourceMode === "real_only" ? "required" : "preferred",
      order: index,
      note: `${scene.visual} | ${scene.fala}`.slice(0, 480),
    }] : []);
    if (voiceoverAssetId) mediaInputs.push({ assetId: voiceoverAssetId, type: "audio", role: "voiceover", importance: "required", order: 100 });
    if (musicAssetId) mediaInputs.push({ assetId: musicAssetId, type: "audio", role: "music", importance: "preferred", order: 101 });
    if (effectAssetId) mediaInputs.push({ assetId: effectAssetId, type: "audio", role: "sfx", importance: "preferred", order: 102 });

    setProcessing(true);
    setJob(null);
    setJobId("");
    setResultUrl("");
    setResultAssetId("");
    setVideoMeta(null);
    try {
      const prompt = buildDirection({ intent, objective, product, audience, offer, channel, duration, proof, restrictions });
      const data = await apiJson<{ projectId: string; jobId: string }>(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        body: JSON.stringify({
          operation: "video_generate",
          title: `${projectTitle} · V${nextVersionNumber}`.slice(0, 120),
          context: {
            prompt: prompt.slice(0, 4000),
            style: intent.direction,
            aspectRatio: aspect,
            duration,
            sceneCount: scenes.length,
            generationMode: sourceMode === "real_only" ? "media_only" : sourceMode === "hybrid" ? "hybrid" : "ai_only",
            mediaInputs,
            guidedVideoSeriesId: seriesId,
            guidedVideoVersion: nextVersionNumber,
            guidedVideoTitle: projectTitle,
            effects: {
              preset: intent.preset,
              intensity: intent.intensity,
              transition: "smooth",
              motion: intent.id === "performance" ? "punch" : "drift",
              color: "natural",
              grain: false,
              vignette: false,
              sharpen: true,
              beatSync: Boolean(musicAssetId),
              bpm: 112,
              sfx: "none",
            },
            professionalCreation: {
              version: 5,
              guided: true,
              profileId: intent.id,
              sourceMode,
              scriptApproved: true,
              script,
              generatedSceneVisuals: generatedVisualCount,
              storyboard: scenes.map((scene, index) => ({ index, fala: scene.fala, visual: scene.visual, assetId: scene.assetId })),
              requestedJingleAssetId: jingleAssetId || null,
            },
          },
        }),
      });
      setProjectId(data.projectId);
      setJobId(data.jobId);
      setStep(5);
      toast({ title: `Produção V${nextVersionNumber} iniciada`, description: "A VendorAI está montando o vídeo com as cenas aprovadas e fará a checagem final automaticamente." });
      void loadVersionHistory();
    } catch (error) {
      setProcessing(false);
      toast({ title: "Não foi possível iniciar a produção", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
  };

  const selectVersion = (entry: VersionEntry) => {
    if (!entry.url) {
      toast({ title: `V${entry.versionNumber} ainda não está pronta`, description: "Esta versão continua em processamento ou não possui arquivo final." });
      return;
    }
    setProjectId(entry.projectId);
    setResultAssetId(entry.assetId);
    setResultUrl(entry.url);
    setStep(5);
  };

  const resetProduction = () => {
    setProcessing(false);
    setProjectId("");
    setJobId("");
    setJob(null);
    setResultUrl("");
    setResultAssetId("");
    setVideoMeta(null);
    setStep(3);
  };

  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey);
    setStep(1);
    setSeriesId(newSeriesId());
    setIntentId("performance");
    setObjective("");
    setProduct("");
    setAudience("");
    setOffer("");
    setProof("");
    setRestrictions("");
    setChannel("Instagram / Reels");
    setDuration(20);
    setSourceMode("hybrid");
    setScript("");
    setScriptApproved(false);
    setScenes([]);
    setVoiceoverAssetId("");
    setMusicAssetId("");
    setEffectAssetId("");
    setJingleAssetId("");
    setProjectId("");
    setJobId("");
    setJob(null);
    setResultUrl("");
    setResultAssetId("");
    setVideoMeta(null);
    setVersionHistory([]);
  };

  const progress = Math.max(0, Math.min(100, Number(job?.progress ?? (processing ? 2 : 0))));

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Projeto de vídeo</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{projectTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Rascunho automático · versões V1, V2, V3 ficam agrupadas neste projeto.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadAssets()} disabled={loadingAssets} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">{loadingAssets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar mídias</button>
            <button type="button" onClick={clearDraft} className="rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">Novo projeto</button>
          </div>
        </div>

        {versionHistory.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-3">
            <span className="text-xs font-semibold text-muted-foreground">Versões:</span>
            {versionHistory.map((entry) => (
              <button key={entry.projectId} type="button" onClick={() => selectVersion(entry)} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-semibold", entry.url ? "border-primary/25 bg-primary/[0.05] text-primary" : "border-border text-muted-foreground")}>
                V{entry.versionNumber}{entry.url ? "" : " · processando"}
              </button>
            ))}
            {loadingVersions && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-5">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const active = step === number;
            const complete = step > number;
            return (
              <button key={label} type="button" onClick={() => number <= step && setStep(number)} className={cn("rounded-xl border px-3 py-2.5 text-left transition", active ? "border-primary/40 bg-primary/[0.07]" : complete ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-border bg-background/30 opacity-70")}>
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold", complete ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{complete ? <Check className="h-3 w-3" /> : number}</span>
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {step === 1 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">1 · Briefing</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">O que você quer que este vídeo faça?</h3>
            <p className="mt-1 text-sm text-muted-foreground">Escolha a intenção e informe apenas o essencial. A IA monta o restante.</p>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {INTENTS.map((item) => (
              <button key={item.id} type="button" onClick={() => { setIntentId(item.id); setDuration(item.defaultDuration); }} className={cn("rounded-2xl border p-3 text-left transition", intentId === item.id ? "border-primary/45 bg-primary/[0.07]" : "border-border bg-background/40 hover:border-primary/25")}>
                <p className="text-sm font-semibold text-foreground">{item.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Como criar os visuais?</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Escolha a política de mídia deste projeto. Você poderá revisar cena por cena antes de gerar.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {SOURCE_MODES.map((item) => (
                <button key={item.id} type="button" onClick={() => setSourceMode(item.id)} className={cn("rounded-xl border p-3 text-left transition", sourceMode === item.id ? "border-primary/45 bg-primary/[0.07]" : "border-border bg-background/40 hover:border-primary/25")}>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Objetivo</span><input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Ex.: conseguir pedidos de orçamento" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Produto ou serviço</span><input value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Ex.: VendorAI para construtoras" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Para quem</span><input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ex.: donos e gestores de construtoras" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">O que a pessoa deve fazer depois?</span><input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="Ex.: solicitar uma demonstração" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label>
            <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Canal</span><select value={channel} onChange={(event) => setChannel(event.target.value as Channel)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></label>
            <div className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Duração</span><div className="flex flex-wrap gap-2">{DURATIONS.map((item) => <button key={item} type="button" onClick={() => setDuration(item)} className={cn("rounded-lg border px-3 py-2 text-xs font-medium", duration === item ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{item}s</button>)}</div></div>
          </div>

          <button type="button" onClick={() => setShowDetails((value) => !value)} className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">{showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}Informações opcionais</button>
          {showDetails && <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Fatos, diferenciais e provas autorizadas</span><textarea value={proof} onChange={(event) => setProof(event.target.value)} rows={3} placeholder="Use somente informações confirmadas." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label><label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">O que não pode acontecer no vídeo?</span><textarea value={restrictions} onChange={(event) => setRestrictions(event.target.value)} rows={3} placeholder="Ex.: não alterar o produto; não usar pessoas genéricas; não inventar números." className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" /></label></div>}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void generateScript()} disabled={generatingScript} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{generatingScript ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}Criar proposta de vídeo</button>
            <span className="text-xs text-muted-foreground">{sourceMode === "real_only" ? "A IA cria o roteiro e procura apenas mídias reais compatíveis." : sourceMode === "hybrid" ? "A IA cria o roteiro, prioriza a Biblioteca e completa somente o que faltar." : "A IA cria roteiro e storyboard; os visuais serão gerados na produção."}</span>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">2 · Direção e roteiro</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Revise a mensagem antes de produzir</h3>
            <p className="mt-1 text-sm text-muted-foreground">Estrutura escolhida: {intent.structure}</p>
          </div>
          <textarea value={script} onChange={(event) => { setScript(event.target.value); setScriptApproved(false); }} rows={10} className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-primary/50" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={approveScript} disabled={!script.trim()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Check className="h-4 w-4" />Aprovar e ver cenas</button>
            <button type="button" onClick={() => void generateScript()} disabled={generatingScript} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground disabled:opacity-40">Gerar outra proposta</button>
            <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground">Alterar briefing</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">3 · Storyboard</p><h3 className="mt-1 text-lg font-semibold text-foreground">Confira o que aparece em cada cena</h3><p className="mt-1 text-sm text-muted-foreground">{sourceMode === "real_only" ? "Somente mídias reais: todas as cenas precisam de foto ou vídeo da Biblioteca." : sourceMode === "hybrid" ? "A Biblioteca vem primeiro. Cenas sem material aprovado podem ser completadas pela IA na produção." : "Você pode deixar as cenas sem mídia; o Media Engine criará os visuais seguindo este storyboard."}</p></div>
            <button type="button" onClick={assignMedia} disabled={!scenes.length || assigningMedia || loadingAssets} className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground disabled:opacity-40"><Library className="h-4 w-4" />Preencher automaticamente</button>
          </div>

          {!scriptApproved && scenes.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-semibold text-amber-800 dark:text-amber-300">O roteiro mudou</p><p className="mt-0.5 text-xs text-muted-foreground">Alguma cena foi refeita ou o texto foi alterado. Aprove novamente antes de produzir.</p></div>
              <button type="button" onClick={approveUpdatedScript} className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Aprovar alterações</button>
            </div>
          )}

          {!scenes.length ? <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Volte ao roteiro e gere uma proposta.</div> : <div className="space-y-3">{scenes.map((scene, index) => {
            const match = sceneMatches.find((item) => item.sceneId === scene.id);
            const selected = selectedAssetFor(scene, visualAssets);
            const selectedUrl = mediaUrl(selected?.storageUrl ?? selected?.storage_url ?? "");
            return (
              <div key={scene.id} className="grid gap-3 rounded-xl border border-border bg-background/40 p-3 lg:grid-cols-[72px_minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start">
                <div className="rounded-lg bg-muted px-2 py-2 text-center"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cena</p><p className="text-lg font-bold text-foreground">{index + 1}</p><p className="text-[10px] text-muted-foreground">{scene.duracao}</p></div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mensagem</p><p className="mt-1 text-sm text-foreground">{scene.fala}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">O que deve aparecer</p><p className="mt-1 text-xs text-muted-foreground">{scene.visual}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void regenerateScene(scene.id)} disabled={Boolean(regeneratingSceneId) || Boolean(generatingVisualSceneId)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground disabled:opacity-40">{regeneratingSceneId === scene.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Refazer texto da cena</button>
                    <button type="button" onClick={() => void generateVisualForScene(scene.id)} disabled={Boolean(generatingVisualSceneId) || Boolean(regeneratingSceneId)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-primary disabled:opacity-40">{generatingVisualSceneId === scene.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}{selected ? "Gerar alternativa com IA" : "Gerar visual com IA"}</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {selectedUrl && (
                    <div className="overflow-hidden rounded-xl border border-border bg-black/5">
                      {selected?.type === "video" ? <video src={selectedUrl} controls muted className="h-36 w-full object-cover" /> : <img src={selectedUrl} alt="Prévia da cena" className="h-36 w-full object-cover" />}
                    </div>
                  )}
                  <label className="space-y-1.5"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Foto ou vídeo desta cena</span><select value={scene.assetId} onChange={(event) => changeSceneAsset(scene.id, event.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"><option value="">Selecionar mídia…</option>{visualAssets.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select>{scene.assetLabel && <p className="truncate text-[11px] text-muted-foreground">{scene.assetLabel}{selected?.source === "generated" ? " · gerada por IA" : ""}</p>}</label>
                  {match && <div className={cn("rounded-lg border px-2.5 py-2 text-[11px]", match.status === "pass" ? "border-emerald-500/25 bg-emerald-500/[0.05]" : match.status === "warn" ? "border-amber-500/25 bg-amber-500/[0.05]" : "border-red-500/25 bg-red-500/[0.05]")}><div className="flex items-center gap-1.5">{match.status === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className={cn("h-3.5 w-3.5", match.status === "warn" ? "text-amber-500" : "text-red-500")} />}<span className="font-semibold text-foreground">{match.label}</span></div><p className="mt-1 leading-relaxed text-muted-foreground">{match.detail}</p>{match.status !== "pass" && match.bestAssetId && selected?.source !== "generated" && <button type="button" onClick={() => replaceSceneWithBest(scene.id)} className="mt-2 text-[11px] font-semibold text-primary hover:underline">Usar melhor sugestão da Biblioteca</button>}</div>}
                </div>
              </div>
            );
          })}</div>}

          <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">{mediaCoverage}/{scenes.length || 0} cenas com mídia · {uniqueMedia} mídias diferentes · {generatedVisualCount} visuais gerados por IA</div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setStep(4)} disabled={!scenes.length || (sourceMode === "real_only" && mediaCoverage !== scenes.length) || !scriptApproved || sceneMatches.some((item) => item.status === "fail")} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">Aprovar storyboard e continuar</button><button type="button" onClick={() => setStep(2)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground">Voltar ao roteiro</button></div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">4 · Produção</p><h3 className="mt-1 text-lg font-semibold text-foreground">Como o vídeo será montado</h3><p className="mt-1 text-sm text-muted-foreground">A configuração técnica já está definida pelo canal. O áudio também é dirigido automaticamente; só altere se quiser escolher algo específico.</p></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4"><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Canal</p><p className="mt-1 text-sm font-semibold text-foreground">{channel}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Formato</p><p className="mt-1 text-sm font-semibold text-foreground">{aspect === "portrait" ? "Vertical" : "Horizontal"}</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Duração</p><p className="mt-1 text-sm font-semibold text-foreground">{duration}s</p></div><div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">Próxima versão</p><p className="mt-1 text-sm font-semibold text-foreground">V{nextVersionNumber}</p></div></div>
            <div className="mt-3 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">Uso previsto agora: 1 render · {scenes.length} cenas · {duration}s. {sourceMode === "real_only" ? "Somente as mídias reais aprovadas serão usadas." : mediaCoverage === scenes.length ? "Todas as cenas já têm mídia aprovada; a IA atua na montagem, ritmo e acabamento." : `${scenes.length - mediaCoverage} cena(s) sem mídia serão completadas pela IA durante a produção.`}</div>
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-foreground">Áudio automático</p><span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{automaticAudioMode ? "Ativo" : `${manualAudioSelectionCount} ajuste${manualAudioSelectionCount === 1 ? "" : "s"} manual${manualAudioSelectionCount === 1 ? "" : "is"}`}</span></div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{automaticAudioMode ? "A VendorAI procura trilha, efeitos e assinatura sonora liberados, faz ducking e masterização. Locução só entra quando você escolher uma." : "Suas escolhas manuais serão respeitadas; o restante continua automático e passa pela validação de direitos."}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowAudio((value) => !value)} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">{showAudio ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{showAudio ? "Fechar opções de áudio" : "Alterar áudio"}</button>
              </div>
            </div>
          </div>

          {showAudio && <ProfessionalAudioLibrary assets={audioAssets} musicAssetId={musicAssetId} effectAssetId={effectAssetId} jingleAssetId={jingleAssetId} voiceoverAssetId={voiceoverAssetId} onMusicChange={setMusicAssetId} onEffectChange={setEffectAssetId} onJingleChange={setJingleAssetId} onVoiceoverChange={setVoiceoverAssetId} />}

          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setStep(5)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Revisar antes de gerar</button><button type="button" onClick={() => setStep(3)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground">Voltar às cenas</button></div>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">5 · Finalizar</p><h3 className="mt-1 text-lg font-semibold text-foreground">Verificação antes de gerar</h3><p className="mt-1 text-sm text-muted-foreground">Você não precisa interpretar notas técnicas. O sistema mostra apenas o que está pronto e o que precisa de atenção.</p></div><div className={cn("inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-semibold", readyToRender ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300")}><ShieldCheck className="h-4 w-4" />{readyToRender ? "Pronto para gerar" : "Há itens para corrigir"}</div></div>
            <div className="grid gap-2 md:grid-cols-2">{qualityChecks.map((check) => <div key={check.id} className="flex gap-3 rounded-xl border border-border bg-background/40 p-3">{check.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", check.status === "warn" ? "text-amber-500" : "text-red-500")} />}<div><p className="text-xs font-semibold text-foreground">{check.label}</p><p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{check.detail}</p></div></div>)}</div>
            <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => void startRender()} disabled={!readyToRender || processing} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{processing ? `Produzindo V${nextVersionNumber}…` : `Gerar V${nextVersionNumber}`}</button><span className="text-xs text-muted-foreground">1 render · {scenes.length} cenas · {duration}s</span></div>
            {processing && <div className="space-y-2"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Montando cenas, áudio e identidade visual</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Resultado</p><h3 className="mt-1 text-lg font-semibold text-foreground">Vídeo final</h3></div>{finalReady && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />Pronto para revisar/publicar</span>}</div>

            {versionHistory.length > 0 && <div className="flex flex-wrap gap-2">{versionHistory.map((entry) => <button key={entry.projectId} type="button" onClick={() => selectVersion(entry)} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold", resultAssetId && resultAssetId === entry.assetId ? "border-primary bg-primary/10 text-primary" : entry.url ? "border-border text-foreground" : "border-border text-muted-foreground")}>V{entry.versionNumber}{entry.url ? "" : " · processando"}</button>)}</div>}

            {resultUrl ? <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]"><div className="overflow-hidden rounded-2xl border border-border bg-black"><video src={resultUrl} controls className="max-h-[520px] w-full bg-black" /></div><div className="space-y-2">{qaLoading && <div className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Conferindo o vídeo final…</div>}{finalChecks.map((check) => <div key={check.id} className="flex gap-3 rounded-xl border border-border bg-background/40 p-3">{check.status === "pass" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : check.status === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : check.status === "pending" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}<div><p className="text-xs font-semibold text-foreground">{check.label}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{check.detail}</p></div></div>)}<div className="flex flex-wrap gap-2 pt-2"><button type="button" onClick={() => resultAssetId && navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(resultAssetId)}`)} disabled={!resultAssetId} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"><Film className="h-4 w-4" />Abrir edição final</button><button type="button" onClick={resetProduction} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground">Criar próxima versão</button></div></div></div> : <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center"><Target className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Quando o vídeo ficar pronto, ele aparecerá aqui com a checagem automática.</p></div>}
          </div>
        </section>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p><span className="font-semibold text-foreground">Como a qualidade é protegida:</span> a IA usa fatos do briefing, prioriza a Biblioteca, compara a mídia com o conteúdo de cada cena, gera somente o visual que estiver faltando, valida os direitos das fontes de áudio, masteriza automaticamente e mantém as versões V1/V2/V3 agrupadas.</p></div></div>
    </section>
  );
}
