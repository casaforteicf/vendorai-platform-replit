import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Gauge,
  Globe2,
  ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  Shuffle,
  Sparkles,
  Star,
  Video,
  Volume2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type VoiceProfile = {
  id: string;
  name: string;
  status: string;
  reference_asset_id?: string | null;
};

type ConsentScope = "face_use" | "voice_use" | "ai_generation" | "organic_publish" | "paid_ads";
type MarketCode = "BR" | "PY" | "AR" | "UY" | "BO";
type RatingKey = "voice" | "likeness" | "lipSync" | "expression" | "naturalness";

type StyleSelection = {
  market: MarketCode;
  scenario: string;
  outfit: string;
  framing: string;
  pose: string;
  lighting: string;
};

type CatalogItem = { id: string; label: string };
type MarketItem = {
  code: MarketCode;
  name: string;
  locale: string;
  language: "pt" | "es";
  currency: string;
  region: "MERCOSUL";
};

type StyleCatalog = {
  region: "MERCOSUL";
  market: MarketItem;
  markets: MarketItem[];
  scenarios: CatalogItem[];
  outfits: CatalogItem[];
  framings: CatalogItem[];
  poses: CatalogItem[];
  lighting: CatalogItem[];
  defaults: {
    antiRepeat: boolean;
    scenario: "auto";
    outfit: "auto";
    framing: "auto";
    pose: "auto";
    lighting: "auto";
  };
};

type StyledReference = {
  projectId: string;
  assetId: string;
  versionId: string;
  imageUrl: string;
  model: string;
  selection: StyleSelection;
  labels: Record<keyof StyleSelection, string>;
  market: MarketItem;
};

type VoiceSelectionInfo = {
  requestedVoiceProfileId: string;
  voiceProfileId: string;
  requestedLocale: string;
  selectedLocale: string | null;
  selectedMarket: string | null;
  match: string;
  warning: string | null;
};

type TalkingVideoResult = {
  provider: "vendorai";
  operation: "talking_video";
  requestedVoiceProfileId?: string;
  voiceProfileId?: string;
  voiceSelection?: VoiceSelectionInfo;
  style?: StyledReference | null;
  voice: {
    audioUrl: string;
    assetId: string;
    projectId: string;
    jobId: string;
    versionId: string;
    requestedVoiceProfileId?: string;
    voiceProfileId?: string;
    selection?: VoiceSelectionInfo;
  };
  video: {
    videoUrl: string;
    assetId: string;
    projectId: string;
    jobId: string;
    versionId: string;
  };
};

type TechnicalAudioAnalysis = {
  technicalScore: number;
  durationSeconds: number;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  silenceRatio: number;
  warnings: string[];
};

type TechnicalVideoAnalysis = {
  technicalScore: number;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitRate: number | null;
  codec: string | null;
  hasAudio: boolean;
  warnings: string[];
};

type IdentityQualityAnalysis = {
  technicalScore: number | null;
  readiness: "ready_for_duble_test" | "needs_reference_review" | string;
  faceReferenceReady: boolean;
  voice: TechnicalAudioAnalysis | null;
  video: TechnicalVideoAnalysis | null;
  deepFidelityStatus: "pending" | string;
  deepChecksPending: string[];
};

type Props = {
  tenantId: string;
  identityId: string;
  identityName: string;
  faceReferenceAssetId?: string | null;
  voices: VoiceProfile[];
  activeConsentScopes: Set<ConsentScope>;
  voiceEngineReady: boolean;
  lipSyncEngineReady: boolean;
};

const TEST_SCRIPTS: Record<MarketCode, string> = {
  BR: "Tenho uma novidade importante para compartilhar com você. Vamos analisar juntos a melhor opção para este momento.",
  PY: "Tengo una novedad importante para compartir contigo. Vamos a analizar juntos la mejor opción para este momento.",
  AR: "Tengo una novedad importante para compartir con vos. Veamos juntos cuál es la mejor opción para este momento.",
  UY: "Tengo una novedad importante para compartir con vos. Veamos juntos cuál es la mejor opción para este momento.",
  BO: "Tengo una novedad importante para compartir contigo. Revisemos juntos la mejor opción para este momento.",
};

const DEFAULT_SCRIPTS: Record<MarketCode, string> = {
  BR: "Olá! Este vídeo foi criado com minha identidade e voz autorizadas no VendorAI.",
  PY: "¡Hola! Este video fue creado con mi identidad y voz autorizadas en VendorAI.",
  AR: "¡Hola! Este video fue creado con mi identidad y voz autorizadas en VendorAI.",
  UY: "¡Hola! Este video fue creado con mi identidad y voz autorizadas en VendorAI.",
  BO: "¡Hola! Este video fue creado con mi identidad y voz autorizadas en VendorAI.",
};

const RATING_LABELS: Array<{ key: RatingKey; label: string; description: string }> = [
  { key: "voice", label: "Voz", description: "Timbre, ritmo e naturalidade da fala" },
  { key: "likeness", label: "Semelhança", description: "Quanto o resultado se parece com a pessoa" },
  { key: "lipSync", label: "Movimento labial", description: "Sincronização da boca com a voz" },
  { key: "expression", label: "Expressão", description: "Olhar e expressão facial percebidos" },
  { key: "naturalness", label: "Naturalidade", description: "Impressão geral do dublê em movimento" },
];

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    "Content-Type": "application/json",
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string })?.error ?? `Falha na solicitação (${response.status})`);
  return data as T;
}

function formatSeconds(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function scoreTone(score: number | null | undefined) {
  if (typeof score !== "number") return "border-white/10 bg-white/[0.02] text-gray-400";
  if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (score >= 60) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

function isExactVoiceMatch(selection: VoiceSelectionInfo | undefined): boolean {
  return selection?.match === "preferred_exact_locale" || selection?.match === "exact_locale";
}

function selectionPayload(input: {
  market: MarketCode;
  scenario: string;
  outfit: string;
  framing: string;
  pose: string;
  lighting: string;
  antiRepeat: boolean;
}) {
  return {
    market: input.market,
    scenario: input.scenario,
    outfit: input.outfit,
    framing: input.framing,
    pose: input.pose,
    lighting: input.lighting,
    antiRepeat: input.antiRepeat,
  };
}

function OptionSelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: CatalogItem[];
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-medium text-gray-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-white/10 bg-[#171126] px-2.5 py-2 text-xs outline-none focus:border-fuchsia-500/50"
      >
        <option value="auto">Automático · evitar repetição</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  );
}

export default function TalkingVideoPanel({
  tenantId,
  identityId,
  identityName,
  faceReferenceAssetId,
  voices,
  activeConsentScopes,
  voiceEngineReady,
  lipSyncEngineReady,
}: Props) {
  const { toast } = useToast();
  const readyVoices = useMemo(() => voices.filter((voice) => voice.status === "ready" && voice.reference_asset_id), [voices]);
  const [voiceProfileId, setVoiceProfileId] = useState(readyVoices[0]?.id ?? "");
  const [script, setScript] = useState(DEFAULT_SCRIPTS.BR);
  const [bboxShift, setBboxShift] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generationMode, setGenerationMode] = useState<"talking" | "duble_test" | null>(null);
  const [result, setResult] = useState<TalkingVideoResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<IdentityQualityAnalysis | null>(null);
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({ voice: 0, likeness: 0, lipSync: 0, expression: 0, naturalness: 0 });
  const [evaluationNotes, setEvaluationNotes] = useState("");
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [evaluationSaved, setEvaluationSaved] = useState(false);

  const [catalog, setCatalog] = useState<StyleCatalog | null>(null);
  const [styleLoading, setStyleLoading] = useState(true);
  const [market, setMarket] = useState<MarketCode>("BR");
  const [scenario, setScenario] = useState("auto");
  const [outfit, setOutfit] = useState("auto");
  const [framing, setFraming] = useState("auto");
  const [pose, setPose] = useState("auto");
  const [lighting, setLighting] = useState("auto");
  const [antiRepeat, setAntiRepeat] = useState(true);
  const [favorite, setFavorite] = useState<StyleSelection | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<StyledReference | null>(null);
  const [savingFavorite, setSavingFavorite] = useState(false);

  useEffect(() => {
    if (!readyVoices.some((voice) => voice.id === voiceProfileId)) setVoiceProfileId(readyVoices[0]?.id ?? "");
  }, [readyVoices, voiceProfileId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStyleLoading(true);
      try {
        const [catalogResponse, profileResponse] = await Promise.all([
          fetch(`/api/tenants/${tenantId}/media-engine/duble-style/catalog?market=BR`, { headers: authHeaders() }),
          fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/duble-style`, { headers: authHeaders() }),
        ]);
        const catalogData = await responseJson<StyleCatalog>(catalogResponse);
        const profileData = await responseJson<{ profile: { market?: MarketItem; favorite?: StyleSelection | null; antiRepeat?: boolean } }>(profileResponse);
        if (cancelled) return;
        setCatalog(catalogData);
        const profileMarket = profileData.profile?.market?.code;
        if (profileMarket && catalogData.markets.some((item) => item.code === profileMarket)) {
          setMarket(profileMarket);
          setScript(DEFAULT_SCRIPTS[profileMarket]);
        }
        setFavorite(profileData.profile?.favorite ?? null);
        setAntiRepeat(profileData.profile?.antiRepeat !== false);
      } catch (error) {
        if (!cancelled) toast({
          title: "Configuração regional indisponível",
          description: error instanceof Error ? error.message : "Não foi possível carregar o catálogo do Dublê.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setStyleLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [tenantId, identityId, toast]);

  const marketConfig = catalog?.markets.find((item) => item.code === market) ?? catalog?.market ?? {
    code: market,
    name: market === "BR" ? "Brasil" : market,
    locale: market === "BR" ? "pt-BR" : `es-${market}`,
    language: market === "BR" ? "pt" : "es",
    currency: "",
    region: "MERCOSUL" as const,
  };

  const requiredConsentsReady = activeConsentScopes.has("face_use")
    && activeConsentScopes.has("voice_use")
    && activeConsentScopes.has("ai_generation");
  const faceReady = Boolean(faceReferenceAssetId);
  const selectedVoiceId = readyVoices.some((voice) => voice.id === voiceProfileId) ? voiceProfileId : readyVoices[0]?.id ?? "";
  const baseGenerationReady = voiceEngineReady
    && lipSyncEngineReady
    && faceReady
    && requiredConsentsReady
    && Boolean(selectedVoiceId)
    && !generating;
  const canGenerate = baseGenerationReady && Boolean(script.trim());
  const canSaveEvaluation = Boolean(result?.video.assetId)
    && generationMode === "duble_test"
    && Object.values(ratings).every((value) => value >= 1 && value <= 5)
    && !savingEvaluation;

  const blockers = [
    !voiceEngineReady ? "motor de voz" : null,
    !lipSyncEngineReady ? "motor de lip-sync" : null,
    !faceReady ? "foto de referência" : null,
    readyVoices.length === 0 ? "voz pronta" : null,
    !activeConsentScopes.has("face_use") ? "autorização de rosto" : null,
    !activeConsentScopes.has("voice_use") ? "autorização de voz" : null,
    !activeConsentScopes.has("ai_generation") ? "autorização de geração IA" : null,
  ].filter(Boolean) as string[];

  const warnings = useMemo(() => [
    ...(analysis?.voice?.warnings ?? []).map((message) => `Voz: ${message}`),
    ...(analysis?.video?.warnings ?? []).map((message) => `Vídeo: ${message}`),
  ], [analysis]);

  const currentStyle = selectionPayload({ market, scenario, outfit, framing, pose, lighting, antiRepeat });

  const changeMarket = (nextMarket: MarketCode) => {
    setMarket(nextMarket);
    setPreview(null);
    setResult(null);
    if (script === DEFAULT_SCRIPTS[market] || !script.trim()) setScript(DEFAULT_SCRIPTS[nextMarket]);
  };

  const useFavorite = () => {
    if (!favorite) return;
    setMarket(favorite.market);
    setScenario(favorite.scenario);
    setOutfit(favorite.outfit);
    setFraming(favorite.framing);
    setPose(favorite.pose);
    setLighting(favorite.lighting);
    setPreview(null);
    setResult(null);
    toast({ title: "Estilo favorito aplicado", description: "As próximas gerações usarão esta combinação até você alterar algum item." });
  };

  const randomize = () => {
    setScenario("auto");
    setOutfit("auto");
    setFraming("auto");
    setPose("auto");
    setLighting("auto");
    setAntiRepeat(true);
    setPreview(null);
    setResult(null);
  };

  const previewStyle = async () => {
    if (!faceReady) return;
    setPreviewing(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/duble-style/preview`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ style: currentStyle, title: `Prévia do Dublê — ${identityName}` }),
      });
      const data = await responseJson<{ reference: StyledReference }>(response);
      setPreview(data.reference);
      setMarket(data.reference.selection.market);
      toast({ title: "Prévia do estilo gerada", description: `${data.reference.market.name}: cenário, roupa, pose, enquadramento e luz foram aplicados preservando a identidade de origem.` });
    } catch (error) {
      toast({ title: "Não foi possível gerar a prévia", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const saveFavorite = async () => {
    const selection = preview?.selection ?? (scenario !== "auto" && outfit !== "auto" && framing !== "auto" && pose !== "auto" && lighting !== "auto"
      ? { market, scenario, outfit, framing, pose, lighting }
      : null);
    if (!selection) {
      toast({ title: "Gere uma prévia primeiro", description: "Quando opções estão no Automático, a prévia resolve a combinação exata que pode ser salva como favorita." });
      return;
    }
    setSavingFavorite(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/duble-style/favorite`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ selection }),
      });
      await responseJson(response);
      setFavorite(selection);
      toast({ title: "Estilo favorito salvo", description: "Mercado e combinação visual foram gravados no perfil desta Identidade Audiovisual." });
    } catch (error) {
      toast({ title: "Não foi possível salvar o favorito", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSavingFavorite(false);
    }
  };

  const analyzeReferences = async () => {
    setAnalyzing(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/analyze-references`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      const data = await responseJson<{ analysis: IdentityQualityAnalysis }>(response);
      setAnalysis(data.analysis);
      toast({
        title: "Análise técnica concluída",
        description: "O VendorAI avaliou métricas reais do áudio e vídeo. A fidelidade semântica continua separada até o motor especializado processar a identidade.",
      });
    } catch (error) {
      toast({ title: "Não foi possível analisar as referências", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const generate = async (mode: "talking" | "duble_test") => {
    const text = mode === "duble_test" ? TEST_SCRIPTS[market] : script.trim();
    if (!baseGenerationReady || !selectedVoiceId || !text) return;
    setGenerating(true);
    setGenerationMode(mode);
    setResult(null);
    setEvaluationSaved(false);
    if (mode === "duble_test") {
      setRatings({ voice: 0, likeness: 0, lipSync: 0, expression: 0, naturalness: 0 });
      setEvaluationNotes("");
    }
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/talking-video`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          voiceProfileId: selectedVoiceId,
          text,
          language: marketConfig.locale.toLowerCase(),
          title: mode === "duble_test" ? `Teste do Dublê — ${identityName} — ${marketConfig.name}` : `Vídeo falado — ${identityName} — ${marketConfig.name}`,
          bboxShift,
          style: currentStyle,
        }),
      });
      const data = await responseJson<TalkingVideoResult>(response);
      setResult(data);
      if (data.style) setPreview(data.style);
      const voiceSelection = data.voiceSelection ?? data.voice.selection;
      toast({
        title: mode === "duble_test" ? "Teste do Dublê gerado" : "Vídeo falado gerado",
        description: voiceSelection?.warning
          ? voiceSelection.warning
          : mode === "duble_test"
            ? `Resultado gerado para ${marketConfig.name}. A voz local mais adequada foi selecionada automaticamente.`
            : `Referência visual regional, voz compatível e MP4 foram salvos na Biblioteca Audiovisual.`,
      });
    } catch (error) {
      toast({ title: mode === "duble_test" ? "Não foi possível testar o Dublê" : "Não foi possível gerar o vídeo", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const saveEvaluation = async () => {
    if (!canSaveEvaluation || !result) return;
    setSavingEvaluation(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/duble-evaluations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ testAssetId: result.video.assetId, ratings, notes: evaluationNotes.trim() || null }),
      });
      const data = await responseJson<{ evaluation: { average?: number } }>(response);
      setEvaluationSaved(true);
      const average = Number(data.evaluation?.average ?? 0);
      toast({
        title: "Avaliação do Dublê salva",
        description: average >= 4 ? "O teste foi aprovado pela avaliação humana e ficou registrado no perfil da identidade." : "A avaliação foi registrada para orientar os próximos ajustes da identidade.",
      });
    } catch (error) {
      toast({ title: "Não foi possível salvar a avaliação", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSavingEvaluation(false);
    }
  };

  const resultVoiceSelection = result?.voiceSelection ?? result?.voice.selection;

  return (
    <section className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-4 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Video className="h-4 w-4 text-purple-300" /><p className="text-sm font-semibold">Dublê Digital & Vídeo falado</p></div>
          <p className="text-[11px] text-gray-500 mt-1">Identidade autorizada → estilo regional → voz inteligente → lip-sync → teste humano → MP4 na Biblioteca.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={cn("rounded-full border px-2 py-1 text-[10px]", voiceEngineReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>Voz {voiceEngineReady ? "pronta" : "aguardando GPU"}</span>
          <span className={cn("rounded-full border px-2 py-1 text-[10px]", lipSyncEngineReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>Lip-sync {lipSyncEngineReady ? "pronto" : "aguardando GPU"}</span>
        </div>
      </div>

      <section className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Globe2 className="h-4 w-4 text-fuchsia-300" /><p className="text-sm font-semibold">Estilo do Dublê · Mercosul</p></div>
            <p className="text-[11px] text-gray-500 mt-1">A mesma identidade pode ser apresentada em contextos comerciais adequados a Brasil, Paraguai, Argentina, Uruguai e Bolívia, sem bandeiras ou estereótipos automáticos.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={randomize} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[11px] text-gray-300 hover:bg-white/5"><Shuffle className="h-3.5 w-3.5" /> Automático</button>
            {favorite && <button type="button" onClick={useFavorite} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200"><Star className="h-3.5 w-3.5" /> Usar favorito</button>}
          </div>
        </div>

        {styleLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando configuração regional...</div>
        ) : catalog ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-[11px] font-medium text-gray-300">Mercado</span>
                <select value={market} onChange={(event) => changeMarket(event.target.value as MarketCode)} className="w-full rounded-lg border border-fuchsia-500/25 bg-[#171126] px-2.5 py-2 text-xs outline-none focus:border-fuchsia-500/60">
                  {catalog.markets.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.locale} · {item.currency}</option>)}
                </select>
              </label>
              <OptionSelect label="Cenário" value={scenario} onChange={(value) => { setScenario(value); setPreview(null); setResult(null); }} items={catalog.scenarios} />
              <OptionSelect label="Vestimenta" value={outfit} onChange={(value) => { setOutfit(value); setPreview(null); setResult(null); }} items={catalog.outfits} />
              <OptionSelect label="Enquadramento" value={framing} onChange={(value) => { setFraming(value); setPreview(null); setResult(null); }} items={catalog.framings} />
              <OptionSelect label="Pose" value={pose} onChange={(value) => { setPose(value); setPreview(null); setResult(null); }} items={catalog.poses} />
              <OptionSelect label="Iluminação" value={lighting} onChange={(value) => { setLighting(value); setPreview(null); setResult(null); }} items={catalog.lighting} />
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/10 p-3 cursor-pointer">
              <input type="checkbox" checked={antiRepeat} onChange={(event) => setAntiRepeat(event.target.checked)} className="mt-0.5 accent-fuchsia-500" />
              <span><span className="block text-xs font-medium text-gray-200">Motor anti-repetição</span><span className="block text-[10px] text-gray-500 mt-0.5">Quando uma opção fica em Automático, evita reutilizar os itens mais recentes desta identidade e aumenta a variedade entre conteúdos.</span></span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button disabled={previewing || !faceReady} onClick={() => void previewStyle()} className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}{previewing ? "Gerando prévia..." : "Gerar prévia do estilo"}
              </button>
              <button disabled={savingFavorite} onClick={() => void saveFavorite()} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-40">
                {savingFavorite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{savingFavorite ? "Salvando..." : "Salvar como favorito"}
              </button>
            </div>

            {preview && (
              <div className="grid gap-3 lg:grid-cols-[220px_1fr] rounded-xl border border-fuchsia-500/20 bg-black/15 p-3">
                <img src={preview.imageUrl} alt={`Prévia do Dublê de ${identityName}`} className="w-full max-h-72 rounded-lg object-cover bg-black" />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-fuchsia-100">Prévia resolvida · {preview.market.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["scenario", "outfit", "framing", "pose", "lighting"] as const).map((key) => <span key={key} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-gray-300">{preview.labels[key]}</span>)}
                  </div>
                  <p className="text-[10px] text-gray-500">A referência é uma imagem intermediária do pipeline. O rosto original continua sendo a origem autorizada; cenário, roupa, pose, enquadramento e luz ficam registrados no ativo gerado.</p>
                </div>
              </div>
            )}
          </>
        ) : null}
      </section>

      <section className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold">Qualidade técnica das referências</p></div><p className="text-[11px] text-gray-500 mt-1">Mede arquivo, duração, volume, picos, silêncio, resolução e FPS. Não é uma nota inventada de semelhança facial.</p></div>
          <button disabled={analyzing} onClick={() => void analyzeReferences()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/15 disabled:opacity-40">
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{analyzing ? "Analisando..." : analysis ? "Analisar novamente" : "Analisar referências"}
          </button>
        </div>

        {analysis ? (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className={cn("rounded-lg border p-3", scoreTone(analysis.technicalScore))}><p className="text-[10px] uppercase tracking-wide opacity-70">Conjunto técnico</p><p className="text-2xl font-bold mt-1">{analysis.technicalScore ?? "—"}<span className="text-xs font-normal opacity-60">/100</span></p><p className="text-[10px] mt-1">{analysis.readiness === "ready_for_duble_test" ? "Pronto para teste do Dublê" : "Revisar referências"}</p></div>
              <div className={cn("rounded-lg border p-3", scoreTone(analysis.voice?.technicalScore))}><p className="text-[10px] uppercase tracking-wide opacity-70">Voz</p><p className="text-xl font-bold mt-1">{analysis.voice?.technicalScore ?? "—"}<span className="text-xs font-normal opacity-60">/100</span></p><p className="text-[10px] mt-1">{analysis.voice ? `${formatSeconds(analysis.voice.durationSeconds)} · ${analysis.voice.sampleRate ? `${Math.round(analysis.voice.sampleRate / 1000)} kHz` : "taxa —"}` : "Sem referência analisável"}</p></div>
              <div className={cn("rounded-lg border p-3", scoreTone(analysis.video?.technicalScore))}><p className="text-[10px] uppercase tracking-wide opacity-70">Vídeo</p><p className="text-xl font-bold mt-1">{analysis.video?.technicalScore ?? "—"}<span className="text-xs font-normal opacity-60">/100</span></p><p className="text-[10px] mt-1">{analysis.video ? `${analysis.video.width ?? "—"}×${analysis.video.height ?? "—"} · ${analysis.video.fps ?? "—"} fps` : "Sem referência analisável"}</p></div>
            </div>
            {analysis.voice && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px] text-gray-400"><div className="rounded-lg border border-white/10 p-2"><span className="block text-gray-600">Volume médio</span>{analysis.voice.meanVolumeDb !== null ? `${analysis.voice.meanVolumeDb} dB` : "—"}</div><div className="rounded-lg border border-white/10 p-2"><span className="block text-gray-600">Pico</span>{analysis.voice.maxVolumeDb !== null ? `${analysis.voice.maxVolumeDb} dB` : "—"}</div><div className="rounded-lg border border-white/10 p-2"><span className="block text-gray-600">Silêncio</span>{Math.round(analysis.voice.silenceRatio * 100)}%</div><div className="rounded-lg border border-white/10 p-2"><span className="block text-gray-600">Codec</span>{analysis.voice.codec ?? "—"}</div></div>}
            {warnings.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">{warnings.map((warning, index) => <p key={`${warning}-${index}`} className="text-[11px] text-amber-200">• {warning}</p>)}</div>}
            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-[11px] text-gray-400"><span className="font-semibold text-purple-200">Fidelidade profunda: pendente.</span> Semelhança facial, cobertura de expressões/olhar, movimento labial e similaridade de prosódia permanecem separados da nota técnica até o motor especializado processar esses sinais.</div>
          </div>
        ) : <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-gray-500">Execute a análise para verificar métricas técnicas reais das referências já salvas.</div>}
      </section>

      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
        <label className="space-y-1.5"><span className="text-xs font-medium text-gray-300">Voz preferida</span><select value={selectedVoiceId} onChange={(event) => { setVoiceProfileId(event.target.value); setResult(null); }} className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm outline-none focus:border-purple-500/50">{readyVoices.length === 0 && <option value="">Nenhuma voz pronta</option>}{readyVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select><span className="block text-[10px] text-gray-600">O Voice Engine pode substituir esta preferência por uma referência do locale exato do mercado.</span></label>
        <label className="space-y-1.5"><span className="text-xs font-medium text-gray-300">Ajuste facial</span><input type="number" min={-20} max={20} value={bboxShift} onChange={(event) => setBboxShift(Math.max(-20, Math.min(20, Number(event.target.value) || 0)))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-purple-500/50" /></label>
      </div>

      <section className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia-300" /><p className="text-sm font-semibold">Testar meu Dublê · {marketConfig.name}</p></div><p className="text-[11px] text-gray-500 mt-1">Gera uma frase inédita no idioma/localidade do mercado e usa o estilo visual configurado acima.</p></div>
          <button disabled={!baseGenerationReady} onClick={() => void generate("duble_test")} className="inline-flex items-center justify-center gap-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">{generating && generationMode === "duble_test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{generating && generationMode === "duble_test" ? "Gerando estilo, voz e vídeo..." : "Gerar teste do Dublê"}</button>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-gray-400">{marketConfig.locale}: “{TEST_SCRIPTS[market]}”</div>
      </section>

      <label className="space-y-1.5 block"><span className="text-xs font-medium text-gray-300">Roteiro livre para vídeo falado · {marketConfig.locale}</span><textarea value={script} onChange={(event) => setScript(event.target.value)} rows={4} maxLength={5000} placeholder="Digite o que a pessoa autorizada deve falar..." className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-purple-500/50" /><span className="block text-[10px] text-gray-600 text-right">{script.length}/5000</span></label>

      {blockers.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">Para gerar, falta: {blockers.join(", ")}.</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={!canGenerate} onClick={() => void generate("talking")} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">{generating && generationMode === "talking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}{generating && generationMode === "talking" ? "Gerando estilo, voz e vídeo..." : "Gerar vídeo falado"}</button>
        {generating && <span className="text-[11px] text-gray-500">O pipeline cria a referência visual regional, resolve a voz mais compatível e só então executa o lip-sync.</span>}
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_240px] rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <video controls src={result.video.videoUrl} className="w-full max-h-[460px] rounded-lg bg-black" />
            <div className="space-y-3">
              <div><p className="text-xs font-semibold text-emerald-200">{generationMode === "duble_test" ? "Teste do Dublê pronto" : "Vídeo pronto"}</p><p className="text-[11px] text-gray-500 mt-1">MP4, narração e referência visual foram versionados na Biblioteca Audiovisual.</p></div>
              {result.style && <div className="rounded-lg border border-white/10 p-2"><p className="text-[10px] text-gray-500">Estilo aplicado</p><p className="text-[11px] text-gray-300 mt-1">{result.style.market.name} · {result.style.labels.scenario} · {result.style.labels.outfit}</p></div>}
              {resultVoiceSelection && (
                <div className={cn("rounded-lg border p-2", isExactVoiceMatch(resultVoiceSelection) ? "border-emerald-500/25 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10")}>
                  <p className="text-[10px] text-gray-500">Voz resolvida automaticamente</p>
                  <p className={cn("text-[11px] font-medium mt-1", isExactVoiceMatch(resultVoiceSelection) ? "text-emerald-200" : "text-amber-200")}>
                    {resultVoiceSelection.selectedLocale ?? "locale não informado"} {isExactVoiceMatch(resultVoiceSelection) ? "· correspondência exata" : "· fallback compatível"}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">Solicitado: {resultVoiceSelection.requestedLocale}</p>
                  {resultVoiceSelection.warning && <p className="text-[10px] text-amber-200 mt-1.5">{resultVoiceSelection.warning}</p>}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-300"><Volume2 className="h-3.5 w-3.5 text-cyan-300" /> Narração gerada</div><audio controls src={result.voice.audioUrl} className="h-8 w-full" />
            </div>
          </div>

          {generationMode === "duble_test" && (
            <section className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-4">
              <div><div className="flex items-center gap-2"><Star className="h-4 w-4 text-amber-300" /><p className="text-sm font-semibold">Avaliação humana do Dublê</p></div><p className="text-[11px] text-gray-500 mt-1">Esta avaliação complementa as métricas técnicas. Assista ao vídeo antes de pontuar de 1 a 5.</p></div>
              <div className="space-y-3">{RATING_LABELS.map((item) => <div key={item.key} className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center"><div><p className="text-xs font-medium text-gray-200">{item.label}</p><p className="text-[10px] text-gray-600">{item.description}</p></div><div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => { setRatings((current) => ({ ...current, [item.key]: value })); setEvaluationSaved(false); }} className={cn("h-8 w-8 rounded-lg border text-xs font-semibold transition-colors", ratings[item.key] === value ? "border-amber-400/50 bg-amber-500/20 text-amber-200" : "border-white/10 bg-white/[0.02] text-gray-500 hover:bg-white/5")} aria-label={`${item.label}: ${value} de 5`}>{value}</button>)}</div></div>)}</div>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-gray-300">Observações opcionais</span><textarea value={evaluationNotes} onChange={(event) => { setEvaluationNotes(event.target.value.slice(0, 1000)); setEvaluationSaved(false); }} rows={2} placeholder="Ex.: voz muito próxima, mas movimento da boca ainda precisa de ajuste..." className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none focus:border-amber-500/40" /></label>
              <div className="flex flex-wrap items-center gap-3"><button disabled={!canSaveEvaluation} onClick={() => void saveEvaluation()} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">{savingEvaluation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : evaluationSaved ? <Check className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}{savingEvaluation ? "Salvando..." : evaluationSaved ? "Avaliação salva" : "Salvar avaliação do Dublê"}</button>{!Object.values(ratings).every((value) => value > 0) && <span className="text-[10px] text-gray-600">Avalie os cinco critérios para salvar.</span>}</div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
