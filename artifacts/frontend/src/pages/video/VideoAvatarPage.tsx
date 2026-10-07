import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Camera,
  Copy,
  CheckCircle2,
  CircleStop,
  Clock3,
  FileAudio,
  FileVideo,
  Globe2,
  ImagePlus,
  Loader2,
  Mic2,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Upload,
  UserRound,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import TalkingVideoPanel from "@/components/video/TalkingVideoPanel";

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

type ConsentScope = "face_use" | "voice_use" | "ai_generation" | "organic_publish" | "paid_ads";
type CaptureMethod = "recorded" | "upload" | null;
type MediaKind = "image" | "audio" | "video";
type MarketCode = "BR" | "PY" | "AR" | "UY" | "BO";

type VideoScriptBlock = {
  time: string;
  title: string;
  text: string;
  cue: string;
};

type CaptureMarket = {
  code: MarketCode;
  name: string;
  locale: string;
  currency: string;
  language: "pt" | "es";
  voiceScriptVersion: string;
  videoScriptVersion: string;
  voiceScript: string[];
  videoScript: VideoScriptBlock[];
  testText: string;
};

type CaptureReferenceMetadata = {
  status?: string;
  method?: CaptureMethod;
  durationSeconds?: number | null;
  scriptVersion?: string;
  analysisStatus?: string;
  referenceAssetId?: string | null;
  market?: MarketCode;
  locale?: string;
};

type IdentityMetadata = {
  authorizationDeclaredInUi?: boolean;
  country?: MarketCode | string;
  market?: MarketCode;
  locale?: string;
  region?: "MERCOSUL" | string;
  currency?: string;
  captureProfile?: {
    version?: number;
    market?: MarketCode;
    locale?: string;
    face?: CaptureReferenceMetadata;
    voice?: CaptureReferenceMetadata;
    video?: CaptureReferenceMetadata;
  };
};

type MediaIdentity = {
  id: string;
  display_name: string;
  kind: "person" | "persona";
  status: string;
  face_reference_asset_id?: string | null;
  voice_profile_count?: number;
  active_consent_count?: number;
  metadata?: IdentityMetadata | null;
};

type VoiceProfile = {
  id: string;
  name: string;
  status: string;
  reference_asset_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type Consent = {
  id: string;
  scope: ConsentScope;
  status: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type IdentityDetail = {
  identity: MediaIdentity;
  voices: VoiceProfile[];
  consents: Consent[];
};

type Capabilities = {
  provider: "vendorai";
  capabilities: Record<string, "ready" | "building">;
};

const CONSENT_OPTIONS: Array<{ scope: ConsentScope; label: string; description: string }> = [
  { scope: "face_use", label: "Uso de rosto/imagem", description: "Autoriza usar a referência visual desta pessoa." },
  { scope: "voice_use", label: "Uso de voz", description: "Autoriza usar o áudio de referência para síntese de voz." },
  { scope: "ai_generation", label: "Geração com IA", description: "Autoriza criar novos materiais sintéticos com esta identidade." },
  { scope: "organic_publish", label: "Publicação orgânica", description: "Autoriza publicação em canais conectados sem mídia paga." },
  { scope: "paid_ads", label: "Anúncios pagos", description: "Autoriza uso desta identidade em conteúdo patrocinado." },
];

const VOICE_PT_BR = [
  "Olá, meu nome é [NOME]. Estou fazendo esta gravação para criar minha identidade audiovisual.",
  "Normalmente eu gosto de explicar as coisas de maneira simples, clara e objetiva.",
  "Quando surge uma dúvida, eu procuro entender primeiro o que a pessoa realmente precisa. Você já imaginou como seria ter uma solução que facilitasse todo esse processo?",
  "Em algumas situações precisamos falar com mais energia. Essa é uma oportunidade muito interessante e pode trazer excelentes resultados!",
  "Em outras situações, o mais importante é transmitir segurança e tranquilidade. Podemos analisar cada detalhe com calma e encontrar a melhor alternativa.",
  "Por exemplo: o investimento pode ser de dois mil quatrocentos e noventa reais, com pagamento no dia quinze de setembro.",
  "Podemos falar hoje, amanhã pela manhã ou sexta-feira à tarde.",
  "Ótimo. Entendi perfeitamente.",
  "Agora vou fazer uma pequena pausa.",
  "E continuar falando de forma natural.",
  "Algumas palavras precisam receber mais ênfase. Resultado. Qualidade. Segurança. Confiança. Tecnologia.",
  "E às vezes fazemos perguntas mais curtas: Tudo certo? Podemos continuar? Ficou claro?",
  "Perfeito. Esta gravação representa minha maneira natural de falar e me comunicar.",
];

const VOICE_ES_VOSEO = [
  "Hola, mi nombre es [NOME]. Estoy haciendo esta grabación para crear mi identidad audiovisual.",
  "Normalmente me gusta explicar las cosas de manera simple, clara y directa.",
  "Cuando aparece una duda, primero trato de entender qué necesita realmente la persona. ¿Alguna vez imaginaste cómo sería contar con una solución que facilite todo este proceso?",
  "En algunas situaciones necesitamos hablar con más energía. ¡Esta es una oportunidad muy interesante y puede generar excelentes resultados!",
  "En otros momentos, lo más importante es transmitir seguridad y tranquilidad. Podemos revisar cada detalle con calma y encontrar la mejor alternativa.",
  "Por ejemplo: la inversión puede ser de dos millones cuatrocientos noventa mil, con pago el día quince de septiembre.",
  "Podemos hablar hoy, mañana por la mañana o el viernes por la tarde.",
  "Perfecto. Entendí muy bien.",
  "Ahora voy a hacer una pequeña pausa.",
  "Y voy a continuar hablando de manera natural.",
  "Algunas palabras necesitan un poco más de énfasis. Resultado. Calidad. Seguridad. Confianza. Tecnología.",
  "Y a veces hacemos preguntas más cortas: ¿Todo bien? ¿Podemos seguir? ¿Quedó claro?",
  "Perfecto. Esta grabación representa mi manera natural de hablar y comunicarme.",
];

const VOICE_ES_NEUTRAL = [
  "Hola, mi nombre es [NOME]. Estoy haciendo esta grabación para crear mi identidad audiovisual.",
  "Normalmente me gusta explicar las cosas de manera simple, clara y objetiva.",
  "Cuando surge una duda, primero intento entender qué necesita realmente la persona. ¿Ha imaginado cómo sería contar con una solución que facilite todo este proceso?",
  "En algunas situaciones necesitamos hablar con más energía. ¡Esta es una oportunidad muy interesante y puede generar excelentes resultados!",
  "En otros momentos, lo más importante es transmitir seguridad y tranquilidad. Podemos revisar cada detalle con calma y encontrar la mejor alternativa.",
  "Por ejemplo: la inversión puede ser de dos mil cuatrocientos noventa, con pago el día quince de septiembre.",
  "Podemos hablar hoy, mañana por la mañana o el viernes por la tarde.",
  "Perfecto. Entendí muy bien.",
  "Ahora voy a hacer una pequeña pausa.",
  "Y voy a continuar hablando de manera natural.",
  "Algunas palabras necesitan un poco más de énfasis. Resultado. Calidad. Seguridad. Confianza. Tecnología.",
  "Y a veces hacemos preguntas más cortas: ¿Todo bien? ¿Podemos continuar? ¿Quedó claro?",
  "Perfecto. Esta grabación representa mi manera natural de hablar y comunicarme.",
];

const VIDEO_PT_BR: VideoScriptBlock[] = [
  { time: "0:00–0:20", title: "Expressão natural", text: "Olá, meu nome é [NOME]. Estou gravando este vídeo para criar minha identidade digital. Vou falar normalmente, da mesma maneira que converso no dia a dia.", cue: "Olhe diretamente para a câmera e fale de forma natural." },
  { time: "0:20–0:40", title: "Explicação", text: "Quando explicamos alguma coisa, é importante apresentar as informações com clareza, mostrar os detalhes e ajudar a pessoa a entender exatamente o que está acontecendo.", cue: "Use seus movimentos normais de boca, sobrancelhas e cabeça." },
  { time: "0:40–1:00", title: "Pergunta e curiosidade", text: "Mas e se existisse uma maneira diferente de fazer isso? Como você faria? Qual alternativa faria mais sentido para você?", cue: "Faça as perguntas com sua expressão interrogativa habitual." },
  { time: "1:00–1:20", title: "Entusiasmo", text: "Essa é justamente a parte mais interessante! Quando tecnologia e conhecimento trabalham juntos, conseguimos resultados muito melhores.", cue: "Aumente levemente a energia e sorria de forma natural." },
  { time: "1:20–1:40", title: "Confiança e seriedade", text: "Também existem momentos em que precisamos falar com calma, transmitir segurança e analisar cuidadosamente cada decisão.", cue: "Reduza o sorriso e transmita calma e segurança." },
  { time: "1:40–2:00", title: "Movimentos e finalização", text: "Agora vou olhar brevemente para um lado, depois para o outro e voltar para a câmera. Vou sorrir naturalmente e continuar falando. Perfeito. Esta é minha forma habitual de falar e me comunicar.", cue: "Frente → esquerda leve → centro → direita leve → centro → sorriso natural → expressão neutra." },
];

const VIDEO_ES_VOSEO: VideoScriptBlock[] = [
  { time: "0:00–0:20", title: "Expresión natural", text: "Hola, mi nombre es [NOME]. Estoy grabando este video para crear mi identidad digital. Voy a hablar normalmente, de la misma manera en que converso todos los días.", cue: "Mirá directamente a la cámara y hablá de forma natural." },
  { time: "0:20–0:40", title: "Explicación", text: "Cuando explicamos algo, es importante presentar la información con claridad, mostrar los detalles y ayudar a la otra persona a entender exactamente qué está pasando.", cue: "Usá tus movimientos normales de boca, cejas y cabeza." },
  { time: "0:40–1:00", title: "Pregunta y curiosidad", text: "¿Y si existiera una manera diferente de hacer esto? ¿Cómo lo harías? ¿Qué alternativa tendría más sentido para vos?", cue: "Hacé las preguntas con tu expresión habitual de curiosidad." },
  { time: "1:00–1:20", title: "Entusiasmo", text: "¡Esta es justamente la parte más interesante! Cuando la tecnología y el conocimiento trabajan juntos, podemos conseguir resultados mucho mejores.", cue: "Subí un poco la energía y sonreí naturalmente." },
  { time: "1:20–1:40", title: "Confianza y seriedad", text: "También hay momentos en los que necesitamos hablar con calma, transmitir seguridad y analizar cuidadosamente cada decisión.", cue: "Reducí la sonrisa y transmití calma y seguridad." },
  { time: "1:40–2:00", title: "Movimientos y cierre", text: "Ahora voy a mirar brevemente hacia un lado, después hacia el otro y volver a la cámara. Voy a sonreír naturalmente y continuar hablando. Perfecto. Esta es mi forma habitual de hablar y comunicarme.", cue: "Frente → izquierda leve → centro → derecha leve → centro → sonrisa natural → expresión neutra." },
];

const VIDEO_ES_NEUTRAL: VideoScriptBlock[] = [
  { time: "0:00–0:20", title: "Expresión natural", text: "Hola, mi nombre es [NOME]. Estoy grabando este video para crear mi identidad digital. Voy a hablar normalmente, de la misma manera en que converso todos los días.", cue: "Mire directamente a la cámara y hable de forma natural." },
  { time: "0:20–0:40", title: "Explicación", text: "Cuando explicamos algo, es importante presentar la información con claridad, mostrar los detalles y ayudar a la otra persona a entender exactamente qué está pasando.", cue: "Use sus movimientos normales de boca, cejas y cabeza." },
  { time: "0:40–1:00", title: "Pregunta y curiosidad", text: "¿Y si existiera una manera diferente de hacer esto? ¿Cómo lo haría? ¿Qué alternativa tendría más sentido para usted?", cue: "Haga las preguntas con su expresión habitual de curiosidad." },
  { time: "1:00–1:20", title: "Entusiasmo", text: "¡Esta es justamente la parte más interesante! Cuando la tecnología y el conocimiento trabajan juntos, podemos conseguir resultados mucho mejores.", cue: "Aumente un poco la energía y sonría naturalmente." },
  { time: "1:20–1:40", title: "Confianza y seriedad", text: "También hay momentos en los que necesitamos hablar con calma, transmitir seguridad y analizar cuidadosamente cada decisión.", cue: "Reduzca la sonrisa y transmita calma y seguridad." },
  { time: "1:40–2:00", title: "Movimientos y cierre", text: "Ahora voy a mirar brevemente hacia un lado, después hacia el otro y volver a la cámara. Voy a sonreír naturalmente y continuar hablando. Perfecto. Esta es mi forma habitual de hablar y comunicarme.", cue: "Frente → izquierda leve → centro → derecha leve → centro → sonrisa natural → expresión neutra." },
];

const CAPTURE_MARKETS: Record<MarketCode, CaptureMarket> = {
  BR: { code: "BR", name: "Brasil", locale: "pt-BR", currency: "BRL", language: "pt", voiceScriptVersion: "pt-BR-voice-v2", videoScriptVersion: "pt-BR-video-v2", voiceScript: VOICE_PT_BR, videoScript: VIDEO_PT_BR, testText: "Olá! Esta é uma amostra da minha voz autorizada no VendorAI." },
  PY: { code: "PY", name: "Paraguai", locale: "es-PY", currency: "PYG", language: "es", voiceScriptVersion: "es-PY-voice-v2", videoScriptVersion: "es-PY-video-v2", voiceScript: VOICE_ES_VOSEO, videoScript: VIDEO_ES_VOSEO, testText: "¡Hola! Esta es una muestra de mi voz autorizada en VendorAI." },
  AR: { code: "AR", name: "Argentina", locale: "es-AR", currency: "ARS", language: "es", voiceScriptVersion: "es-AR-voice-v2", videoScriptVersion: "es-AR-video-v2", voiceScript: VOICE_ES_VOSEO, videoScript: VIDEO_ES_VOSEO, testText: "¡Hola! Esta es una muestra de mi voz autorizada en VendorAI." },
  UY: { code: "UY", name: "Uruguai", locale: "es-UY", currency: "UYU", language: "es", voiceScriptVersion: "es-UY-voice-v2", videoScriptVersion: "es-UY-video-v2", voiceScript: VOICE_ES_VOSEO, videoScript: VIDEO_ES_VOSEO, testText: "¡Hola! Esta es una muestra de mi voz autorizada en VendorAI." },
  BO: { code: "BO", name: "Bolívia", locale: "es-BO", currency: "BOB", language: "es", voiceScriptVersion: "es-BO-voice-v2", videoScriptVersion: "es-BO-video-v2", voiceScript: VOICE_ES_NEUTRAL, videoScript: VIDEO_ES_NEUTRAL, testText: "¡Hola! Esta es una muestra de mi voz autorizada en VendorAI." },
};

function isMarketCode(value: unknown): value is MarketCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CAPTURE_MARKETS, value);
}

function detectInitialMarket(): MarketCode {
  if (typeof navigator === "undefined") return "BR";
  const locale = navigator.language?.toUpperCase() ?? "";
  if (locale.includes("-PY")) return "PY";
  if (locale.includes("-AR")) return "AR";
  if (locale.includes("-UY")) return "UY";
  if (locale.includes("-BO")) return "BO";
  return "BR";
}

function marketFromMetadata(metadata?: IdentityMetadata | null): CaptureMarket {
  if (isMarketCode(metadata?.market)) return CAPTURE_MARKETS[metadata.market];
  if (isMarketCode(metadata?.country)) return CAPTURE_MARKETS[metadata.country];
  const locale = metadata?.locale?.toLowerCase() ?? "";
  const match = Object.values(CAPTURE_MARKETS).find((market) => market.locale.toLowerCase() === locale);
  return match ?? CAPTURE_MARKETS.BR;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(Boolean(init?.body && !(init.body instanceof FormData))), ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `Falha na solicitação (${response.status})`);
  return data as T;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "duração não identificada";
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

async function readMediaDuration(file: File, kind: "audio" | "video"): Promise<number | null> {
  return await new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(kind);
    element.preload = "metadata";
    const finish = (duration: number | null) => {
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    element.onloadedmetadata = () => finish(Number.isFinite(element.duration) ? element.duration : null);
    element.onerror = () => finish(null);
    element.src = url;
  });
}

function captureStatusLabel(file: File | null, duration: number | null, min: number, max: number) {
  if (!file) return { label: "Não enviado", tone: "neutral" as const };
  if (duration === null) return { label: "Arquivo pronto", tone: "ready" as const };
  if (duration >= min && duration <= max) return { label: "Duração recomendada", tone: "ready" as const };
  return { label: "Revisar duração", tone: "warning" as const };
}

export default function VideoAvatarPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  const faceInput = useRef<HTMLInputElement>(null);
  const voiceInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const videoPreview = useRef<HTMLVideoElement>(null);
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const videoRecorder = useRef<MediaRecorder | null>(null);
  const voiceStream = useRef<MediaStream | null>(null);
  const videoStream = useRef<MediaStream | null>(null);
  const voiceChunks = useRef<BlobPart[]>([]);
  const videoChunks = useRef<BlobPart[]>([]);
  const voiceStartedAt = useRef<number>(0);
  const videoStartedAt = useRef<number>(0);
  const voiceTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [identities, setIdentities] = useState<MediaIdentity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IdentityDetail | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(() => new URLSearchParams(window.location.search).get("capture") === "mobile");
  const [showMobileQr, setShowMobileQr] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [dubleSearch, setDubleSearch] = useState("");
  const [dubleFilter, setDubleFilter] = useState<"all" | "ready" | "capture" | "review">("all");

  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<"person" | "persona">("person");
  const [captureMarket, setCaptureMarket] = useState<MarketCode>(() => detectInitialMarket());
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [voiceCaptureMethod, setVoiceCaptureMethod] = useState<CaptureMethod>(null);
  const [videoCaptureMethod, setVideoCaptureMethod] = useState<CaptureMethod>(null);
  const [voiceDuration, setVoiceDuration] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [videoElapsed, setVideoElapsed] = useState(0);
  const [showVoiceScript, setShowVoiceScript] = useState(false);
  const [showVideoScript, setShowVideoScript] = useState(false);
  const [consents, setConsents] = useState<Record<ConsentScope, boolean>>({ face_use: true, voice_use: true, ai_generation: true, organic_publish: false, paid_ads: false });
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [testText, setTestText] = useState(CAPTURE_MARKETS.BR.testText);
  const [testingVoice, setTestingVoice] = useState(false);
  const [testAudioUrl, setTestAudioUrl] = useState("");

  const activeConsentScopes = useMemo(() => {
    const now = Date.now();
    return new Set(
      (detail?.consents ?? [])
        .filter((item) => item.status === "active" && !item.revoked_at && (!item.expires_at || new Date(item.expires_at).getTime() > now))
        .map((item) => item.scope),
    );
  }, [detail]);

  const marketConfig = CAPTURE_MARKETS[captureMarket];
  const mobileCaptureUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("capture", "mobile");
    return url.toString();
  }, []);
  const mobileQrUrl = `https://quickchart.io/qr?size=280&margin=2&text=${encodeURIComponent(mobileCaptureUrl)}`;

  const copyMobileLink = async () => {
    await navigator.clipboard.writeText(mobileCaptureUrl);
    toast({ title: "Link copiado", description: "Abra o link no celular para fotografar e gravar com os roteiros guiados." });
  };

  const shareMobileLink = async () => {
    if (navigator.share) {
      await navigator.share({ title: "Captura do Dublê Digital", text: "Abra no celular para fazer foto, áudio e vídeo guiados.", url: mobileCaptureUrl });
      return;
    }
    await copyMobileLink();
  };
  const detailMarket = useMemo(() => marketFromMetadata(detail?.identity.metadata), [detail?.identity.metadata]);
  const voiceEngineReady = capabilities?.capabilities?.voice_synthesize === "ready";
  const lipSyncEngineReady = capabilities?.capabilities?.avatar_lipsync === "ready";
  const voiceCaptureStatus = captureStatusLabel(voiceFile, voiceDuration, 45, 150);
  const videoCaptureStatus = captureStatusLabel(videoFile, videoDuration, 90, 150);

  const stopStream = (streamRef: { current: MediaStream | null }) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearTimer = (timerRef: { current: ReturnType<typeof setInterval> | null }) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearTimer(voiceTimer);
      clearTimer(videoTimer);
      stopStream(voiceStream);
      stopStream(videoStream);
    };
  }, []);

  useEffect(() => {
    if (!detail) return;
    setTestText(detailMarket.testText);
    setTestAudioUrl("");
  }, [detail?.identity.id, detailMarket.code]);

  const loadIdentity = async (identityId: string) => {
    if (!tenantId) return;
    const data = await apiJson<IdentityDetail>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`);
    setDetail(data);
    setSelectedId(identityId);
  };

  const loadAll = async (keepSelection = true) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [identityData, capabilityData] = await Promise.all([
        apiJson<{ identities: MediaIdentity[] }>(`/api/tenants/${tenantId}/media-engine/identities`),
        apiJson<Capabilities>(`/api/tenants/${tenantId}/media-engine/capabilities`),
      ]);
      setIdentities(identityData.identities ?? []);
      setCapabilities(capabilityData);
      const nextId = keepSelection && selectedId ? selectedId : identityData.identities?.[0]?.id ?? null;
      if (nextId) await loadIdentity(nextId);
      else {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (error) {
      toast({ title: "Não foi possível carregar Pessoas & Vozes", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const uploadReference = async (file: File, type: MediaKind, role: "reference" | "voice", usage: string, market: CaptureMarket) => {
    const defaultContentType = type === "audio" ? "audio/webm" : type === "video" ? "video/webm" : "image/jpeg";
    const request = await apiJson<{ uploadURL: string; objectPath: string }>(`/api/tenants/${tenantId}/media/assets/request-upload`, {
      method: "POST",
      body: JSON.stringify({ name: file.name, contentType: file.type || defaultContentType, type, size: file.size }),
    });

    const upload = await fetch(request.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!upload.ok) throw new Error("Falha ao enviar arquivo para a Biblioteca Audiovisual");

    const registered = await apiJson<{ asset: { id: string } }>(`/api/tenants/${tenantId}/media/assets`, {
      method: "POST",
      body: JSON.stringify({
        type,
        role,
        source: "upload",
        storageUrl: request.objectPath,
        originalFilename: file.name,
        mimeType: file.type || null,
        fileSize: file.size,
        metadata: { usage, country: market.code, market: market.code, region: "MERCOSUL", locale: market.locale, currency: market.currency },
      }),
    });
    return registered.asset.id;
  };

  const handleVoiceFile = async (file: File | null) => {
    setVoiceFile(file);
    setVoiceCaptureMethod(file ? "upload" : null);
    setVoiceDuration(file ? await readMediaDuration(file, "audio") : null);
  };

  const handleVideoFile = async (file: File | null) => {
    setVideoFile(file);
    setVideoCaptureMethod(file ? "upload" : null);
    setVideoDuration(file ? await readMediaDuration(file, "video") : null);
  };

  const startVoiceRecording = async () => {
    if (videoRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Gravação não suportada", description: "Use um navegador com acesso ao microfone ou envie um arquivo de áudio.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      voiceStream.current = stream;
      voiceChunks.current = [];
      const recorder = new MediaRecorder(stream);
      voiceRecorder.current = recorder;
      voiceStartedAt.current = Date.now();
      setVoiceElapsed(0);
      setVoiceRecording(true);
      setShowVoiceScript(true);
      voiceTimer.current = setInterval(() => setVoiceElapsed(Math.floor((Date.now() - voiceStartedAt.current) / 1000)), 500);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const elapsed = Math.max(1, Math.round((Date.now() - voiceStartedAt.current) / 1000));
        const mimeType = recorder.mimeType || "audio/webm";
        const file = new File(voiceChunks.current, `voz-guiada-${captureMarket.toLowerCase()}-${Date.now()}.webm`, { type: mimeType });
        setVoiceFile(file);
        setVoiceCaptureMethod("recorded");
        setVoiceDuration(elapsed);
        setVoiceElapsed(elapsed);
        setVoiceRecording(false);
        clearTimer(voiceTimer);
        stopStream(voiceStream);
      };
      recorder.start(500);
    } catch (error) {
      stopStream(voiceStream);
      toast({ title: "Não foi possível acessar o microfone", description: error instanceof Error ? error.message : "Verifique a permissão do navegador.", variant: "destructive" });
    }
  };

  const stopVoiceRecording = () => {
    if (voiceRecorder.current?.state === "recording") voiceRecorder.current.stop();
  };

  const startVideoRecording = async () => {
    if (voiceRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Gravação não suportada", description: "Use um navegador com câmera e microfone ou envie um vídeo existente.", variant: "destructive" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true },
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      videoStream.current = stream;
      videoChunks.current = [];
      if (videoPreview.current) {
        videoPreview.current.srcObject = stream;
        await videoPreview.current.play().catch(() => undefined);
      }
      const recorder = new MediaRecorder(stream);
      videoRecorder.current = recorder;
      videoStartedAt.current = Date.now();
      setVideoElapsed(0);
      setVideoRecording(true);
      setShowVideoScript(true);
      videoTimer.current = setInterval(() => setVideoElapsed(Math.floor((Date.now() - videoStartedAt.current) / 1000)), 500);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) videoChunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const elapsed = Math.max(1, Math.round((Date.now() - videoStartedAt.current) / 1000));
        const mimeType = recorder.mimeType || "video/webm";
        const file = new File(videoChunks.current, `video-duble-${captureMarket.toLowerCase()}-${Date.now()}.webm`, { type: mimeType });
        setVideoFile(file);
        setVideoCaptureMethod("recorded");
        setVideoDuration(elapsed);
        setVideoElapsed(elapsed);
        setVideoRecording(false);
        clearTimer(videoTimer);
        stopStream(videoStream);
        if (videoPreview.current) videoPreview.current.srcObject = null;
      };
      recorder.start(500);
    } catch (error) {
      stopStream(videoStream);
      if (videoPreview.current) videoPreview.current.srcObject = null;
      toast({ title: "Não foi possível acessar câmera/microfone", description: error instanceof Error ? error.message : "Verifique as permissões do navegador.", variant: "destructive" });
    }
  };

  const stopVideoRecording = () => {
    if (videoRecorder.current?.state === "recording") videoRecorder.current.stop();
  };

  const resetCreate = () => {
    if (voiceRecorder.current?.state === "recording") voiceRecorder.current.stop();
    if (videoRecorder.current?.state === "recording") videoRecorder.current.stop();
    clearTimer(voiceTimer);
    clearTimer(videoTimer);
    stopStream(voiceStream);
    stopStream(videoStream);
    if (videoPreview.current) videoPreview.current.srcObject = null;
    setDisplayName("");
    setKind("person");
    setCaptureMarket(detectInitialMarket());
    setFaceFile(null);
    setVoiceFile(null);
    setVideoFile(null);
    setVoiceCaptureMethod(null);
    setVideoCaptureMethod(null);
    setVoiceDuration(null);
    setVideoDuration(null);
    setVoiceElapsed(0);
    setVideoElapsed(0);
    setVoiceRecording(false);
    setVideoRecording(false);
    setShowVoiceScript(false);
    setShowVideoScript(false);
    setAuthorizationConfirmed(false);
    setCreateStep(1);
    setConsents({ face_use: true, voice_use: true, ai_generation: true, organic_publish: false, paid_ads: false });
    if (faceInput.current) faceInput.current.value = "";
    if (voiceInput.current) voiceInput.current.value = "";
    if (videoInput.current) videoInput.current.value = "";
  };

  const createIdentity = async () => {
    if (!tenantId || !displayName.trim()) return;
    if (!authorizationConfirmed) {
      toast({ title: "Confirme a autorização", description: "O VendorAI só cadastra pessoa/voz quando você declara possuir autorização para os usos selecionados.", variant: "destructive" });
      return;
    }
    if (kind === "person" && !faceFile && !voiceFile && !videoFile) {
      toast({ title: "Adicione uma referência", description: "Envie ou grave ao menos uma referência autorizada. Para alta fidelidade, recomendamos foto + voz + vídeo.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const market = CAPTURE_MARKETS[captureMarket];
      const baseMetadata: IdentityMetadata = {
        authorizationDeclaredInUi: true,
        country: market.code,
        market: market.code,
        locale: market.locale,
        region: "MERCOSUL",
        currency: market.currency,
        captureProfile: { version: 2, market: market.code, locale: market.locale },
      };
      const created = await apiJson<{ identity: MediaIdentity }>(`/api/tenants/${tenantId}/media-engine/identities`, {
        method: "POST",
        body: JSON.stringify({ displayName: displayName.trim(), kind, metadata: baseMetadata }),
      });
      const identityId = created.identity.id;

      let faceAssetId: string | null = null;
      let voiceAssetId: string | null = null;
      let videoAssetId: string | null = null;

      if (faceFile) faceAssetId = await uploadReference(faceFile, "image", "reference", "authorized_face_reference", market);

      if (voiceFile) {
        voiceAssetId = await uploadReference(voiceFile, "audio", "voice", "authorized_voice_reference", market);
        const voice = await apiJson<{ voiceProfile: VoiceProfile }>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices`, {
          method: "POST",
          body: JSON.stringify({
            name: `${displayName.trim()} — voz principal (${market.locale})`,
            referenceAssetId: voiceAssetId,
            metadata: {
              authorizedReference: true,
              country: market.code,
              market: market.code,
              region: "MERCOSUL",
              locale: market.locale,
              currency: market.currency,
              captureMethod: voiceCaptureMethod,
              durationSeconds: voiceDuration,
              scriptVersion: market.voiceScriptVersion,
              qualityAnalysisStatus: "pending",
            },
          }),
        });
        await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices/${voice.voiceProfile.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "ready" }),
        });
      }

      if (videoFile) videoAssetId = await uploadReference(videoFile, "video", "reference", "authorized_avatar_training_reference", market);

      const captureProfile: NonNullable<IdentityMetadata["captureProfile"]> = {
        version: 2,
        market: market.code,
        locale: market.locale,
        face: { status: faceAssetId ? "reference_uploaded" : "missing", analysisStatus: faceAssetId ? "pending" : "not_applicable", referenceAssetId: faceAssetId, market: market.code, locale: market.locale },
        voice: { status: voiceAssetId ? "reference_uploaded" : "missing", method: voiceCaptureMethod, durationSeconds: voiceDuration, scriptVersion: market.voiceScriptVersion, analysisStatus: voiceAssetId ? "pending" : "not_applicable", referenceAssetId: voiceAssetId, market: market.code, locale: market.locale },
        video: { status: videoAssetId ? "reference_uploaded" : "missing", method: videoCaptureMethod, durationSeconds: videoDuration, scriptVersion: market.videoScriptVersion, analysisStatus: videoAssetId ? "pending" : "not_applicable", referenceAssetId: videoAssetId, market: market.code, locale: market.locale },
      };

      await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, {
        method: "PATCH",
        body: JSON.stringify({ faceReferenceAssetId: faceAssetId, metadata: { ...baseMetadata, captureProfile } }),
      });

      for (const option of CONSENT_OPTIONS) {
        if (!consents[option.scope]) continue;
        await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/consents`, {
          method: "POST",
          body: JSON.stringify({ scope: option.scope, consentVersion: "1", metadata: { source: "content_studio", declaredByAuthenticatedUser: true, market: market.code, locale: market.locale, region: "MERCOSUL" } }),
        });
      }

      await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active", metadata: { ...baseMetadata, captureProfile } }),
      });

      const completed = [Boolean(faceAssetId), Boolean(voiceAssetId), Boolean(videoAssetId)].filter(Boolean).length;
      toast({
        title: "Identidade audiovisual cadastrada",
        description: completed === 3
          ? `${market.name} · ${market.locale}: foto, voz e vídeo foram salvos. A análise de fidelidade seguirá o pipeline técnico já existente.`
          : `${market.name} · ${market.locale}: referências e autorizações foram salvas. Complete foto, voz e vídeo para aumentar a fidelidade do dublê.`,
      });
      resetCreate();
      setShowCreate(false);
      setSelectedId(identityId);
      await loadAll(true);
      await loadIdentity(identityId);
    } catch (error) {
      toast({ title: "Não foi possível concluir o cadastro", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const testVoice = async () => {
    const voice = detail?.voices.find((item) => item.status === "ready");
    if (!detail || !voice || !testText.trim()) return;
    setTestingVoice(true);
    setTestAudioUrl("");
    try {
      const data = await apiJson<{ audioUrl: string }>(
        `/api/tenants/${tenantId}/media-engine/identities/${detail.identity.id}/voices/${voice.id}/synthesize`,
        { method: "POST", body: JSON.stringify({ text: testText.trim(), language: detailMarket.locale.toLowerCase(), title: `Teste de voz — ${detail.identity.display_name}` }) },
      );
      setTestAudioUrl(data.audioUrl);
      toast({ title: "Amostra de voz gerada", description: `Idioma base: ${detailMarket.locale}. O áudio foi salvo também na Biblioteca Audiovisual.` });
    } catch (error) {
      toast({ title: "Não foi possível gerar a amostra", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setTestingVoice(false);
    }
  };

  const detailCapture = detail?.identity.metadata?.captureProfile;
  const detailVideoReferenceId = detailCapture?.video?.referenceAssetId ?? null;
  const detailVoiceReference = detail?.voices.some((voice) => Boolean(voice.reference_asset_id));

  const filteredIdentities = useMemo(() => {
    const term = dubleSearch.trim().toLowerCase();
    return identities.filter((identity) => {
      const capture = identity.metadata?.captureProfile;
      const references = [Boolean(identity.face_reference_asset_id), Boolean(capture?.voice?.referenceAssetId), Boolean(capture?.video?.referenceAssetId)].filter(Boolean).length;
      const isReady = identity.status === "active" && references === 3;
      const needsCapture = references < 3;
      const needsReview = capture?.voice?.analysisStatus === "pending" || capture?.video?.analysisStatus === "pending";
      const matchesFilter =
        dubleFilter === "all" ||
        (dubleFilter === "ready" && isReady) ||
        (dubleFilter === "capture" && needsCapture) ||
        (dubleFilter === "review" && needsReview);
      const matchesSearch = !term || identity.display_name.toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [identities, dubleFilter, dubleSearch]);

  const wizardSteps = ["Pessoa", "Captura", "Autorização", "Verificação", "Concluir"] as const;
  const canContinueStep1 = Boolean(displayName.trim());
  const hasAnyReference = Boolean(faceFile || voiceFile || videoFile);
  const canContinueStep2 = kind === "persona" || hasAnyReference;
  const canContinueStep3 = authorizationConfirmed;
  const captureCount = [Boolean(faceFile), Boolean(voiceFile), Boolean(videoFile)].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button onClick={() => navigate("/content-studio/video")} className="mb-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Voltar para Vídeo com IA
            </button>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-3 text-purple-600"><UserRound className="h-6 w-6" /></div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Dublês Digitais</h1>
                <p className="text-sm text-muted-foreground">Cadastre uma vez sua identidade audiovisual e reutilize nos vídeos.</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => { resetCreate(); setShowCreate(true); setCreateStep(1); }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
          >
            <Plus className="h-4 w-4" /> Criar Dublê Digital
          </button>
        </div>

        {!showCreate && (
          <>
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {([
                    ["all", `Todos (${identities.length})`],
                    ["ready", `Prontos (${identities.filter((identity) => {
                      const capture = identity.metadata?.captureProfile;
                      return identity.status === "active" && Boolean(identity.face_reference_asset_id) && Boolean(capture?.voice?.referenceAssetId) && Boolean(capture?.video?.referenceAssetId);
                    }).length})`],
                    ["capture", `Em captura (${identities.filter((identity) => {
                      const capture = identity.metadata?.captureProfile;
                      return [Boolean(identity.face_reference_asset_id), Boolean(capture?.voice?.referenceAssetId), Boolean(capture?.video?.referenceAssetId)].filter(Boolean).length < 3;
                    }).length})`],
                    ["review", `Precisa revisar (${identities.filter((identity) => {
                      const capture = identity.metadata?.captureProfile;
                      return capture?.voice?.analysisStatus === "pending" || capture?.video?.analysisStatus === "pending";
                    }).length})`],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDubleFilter(value)}
                      className={cn(
                        "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                        dubleFilter === value ? "bg-foreground text-background" : "border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={dubleSearch}
                    onChange={(event) => setDubleSearch(event.target.value)}
                    placeholder="Buscar dublê pelo nome"
                    className="w-full min-w-[220px] rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                  <button onClick={() => void loadAll(true)} className="rounded-xl border p-2 text-muted-foreground hover:bg-muted" aria-label="Atualizar">
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>

            {loading ? (
              <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-purple-500" /></div>
            ) : filteredIdentities.length === 0 ? (
              <section className="rounded-2xl border border-dashed bg-card px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600">
                  <UserRound className="h-7 w-7" />
                </div>
                <h2 className="text-lg font-semibold">{identities.length === 0 ? "Seu primeiro Dublê Digital" : "Nenhum dublê encontrado"}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {identities.length === 0
                    ? "Faça uma captura guiada de foto, voz e vídeo. Depois disso, o dublê fica disponível para reutilizar sempre que criar um vídeo."
                    : "Tente outro filtro ou termo de busca."}
                </p>
                {identities.length === 0 && (
                  <button
                    type="button"
                    onClick={() => { resetCreate(); setShowCreate(true); setCreateStep(1); }}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
                  >
                    <Plus className="h-4 w-4" /> Criar Dublê Digital
                  </button>
                )}
              </section>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredIdentities.map((identity) => {
                  const identityMarket = marketFromMetadata(identity.metadata);
                  const capture = identity.metadata?.captureProfile;
                  const references = [Boolean(identity.face_reference_asset_id), Boolean(capture?.voice?.referenceAssetId), Boolean(capture?.video?.referenceAssetId)].filter(Boolean).length;
                  const ready = identity.status === "active" && references === 3;
                  return (
                    <article key={identity.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600"><UserRound className="h-5 w-5" /></div>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">{identity.display_name}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">{identityMarket.name} · {identityMarket.locale}</p>
                          </div>
                        </div>
                        <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", ready ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>
                          {ready ? "Pronto" : `${references}/3 capturas`}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div className="rounded-lg border p-2"><div className={identity.face_reference_asset_id ? "text-emerald-600" : "text-muted-foreground"}>{identity.face_reference_asset_id ? "✓" : "—"}</div><div className="mt-1 text-muted-foreground">Foto</div></div>
                        <div className="rounded-lg border p-2"><div className={capture?.voice?.referenceAssetId ? "text-emerald-600" : "text-muted-foreground"}>{capture?.voice?.referenceAssetId ? "✓" : "—"}</div><div className="mt-1 text-muted-foreground">Voz</div></div>
                        <div className="rounded-lg border p-2"><div className={capture?.video?.referenceAssetId ? "text-emerald-600" : "text-muted-foreground"}>{capture?.video?.referenceAssetId ? "✓" : "—"}</div><div className="mt-1 text-muted-foreground">Vídeo</div></div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button type="button" onClick={() => void loadIdentity(identity.id)} className="flex-1 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background hover:opacity-90">
                          {ready ? "Abrir dublê" : "Continuar captura"}
                        </button>
                        <button type="button" onClick={() => void loadIdentity(identity.id)} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Editar</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {detail && (
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{detail.identity.display_name}</h2>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{detailMarket.name} · {detailMarket.locale}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Identidade audiovisual reutilizável para geração de vídeos.</p>
                  </div>
                  <button type="button" onClick={() => setDetail(null)} className="rounded-lg border px-3 py-2 text-xs hover:bg-muted">Fechar</button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border p-3"><p className="text-xs font-semibold">Foto</p><p className={cn("mt-1 text-xs", detail.identity.face_reference_asset_id ? "text-emerald-600" : "text-muted-foreground")}>{detail.identity.face_reference_asset_id ? "✓ Referência salva" : "— Não cadastrada"}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs font-semibold">Voz</p><p className={cn("mt-1 text-xs", detailVoiceReference ? "text-emerald-600" : "text-muted-foreground")}>{detailVoiceReference ? "✓ Referência salva" : "— Não cadastrada"}</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs font-semibold">Vídeo</p><p className={cn("mt-1 text-xs", detailVideoReferenceId ? "text-emerald-600" : "text-muted-foreground")}>{detailVideoReferenceId ? "✓ Referência salva" : "— Não cadastrado"}</p></div>
                </div>

                <details className="mt-4 rounded-xl border">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Configurações e testes avançados</summary>
                  <div className="space-y-4 border-t p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Autorizações ativas</p>
                      <div className="mt-2 flex flex-wrap gap-2">{CONSENT_OPTIONS.map((option) => <span key={option.scope} className={cn("rounded-full border px-2.5 py-1 text-[11px]", activeConsentScopes.has(option.scope) ? "bg-emerald-500/10 text-emerald-700" : "text-muted-foreground")}>{activeConsentScopes.has(option.scope) ? "✓ " : "— "}{option.label}</span>)}</div>
                    </div>

                    <section className="rounded-xl border p-4">
                      <div className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-cyan-600" /><p className="text-sm font-semibold">Testar voz · {detailMarket.locale}</p></div>
                      <textarea value={testText} onChange={(event) => setTestText(event.target.value)} rows={3} maxLength={5000} className="mt-3 w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none" />
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button disabled={!voiceEngineReady || testingVoice || !detail.voices.some((voice) => voice.status === "ready") || !activeConsentScopes.has("voice_use") || !activeConsentScopes.has("ai_generation")} onClick={() => void testVoice()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                          {testingVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar amostra
                        </button>
                        {testAudioUrl && <audio controls src={testAudioUrl} className="h-8 max-w-full" />}
                      </div>
                    </section>

                    <TalkingVideoPanel tenantId={tenantId} identityId={detail.identity.id} identityName={detail.identity.display_name} faceReferenceAssetId={detail.identity.face_reference_asset_id} voices={detail.voices} activeConsentScopes={activeConsentScopes} voiceEngineReady={voiceEngineReady} lipSyncEngineReady={lipSyncEngineReady} />
                  </div>
                </details>
              </section>
            )}
          </>
        )}

        {showCreate && (
          <section className="rounded-2xl border bg-card shadow-sm">
            <div className="border-b px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Criar Dublê Digital</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Uma captura guiada, feita uma vez. Você poderá reutilizar o dublê em novos vídeos.</p>
                </div>
                <button type="button" onClick={() => { resetCreate(); setShowCreate(false); }} className="rounded-lg border px-3 py-2 text-xs hover:bg-muted">Cancelar</button>
              </div>
              <div className="mt-5 grid grid-cols-5 gap-2">
                {wizardSteps.map((label, index) => {
                  const step = (index + 1) as 1 | 2 | 3 | 4 | 5;
                  const active = createStep === step;
                  const done = createStep > step;
                  return (
                    <div key={label} className="min-w-0">
                      <div className={cn("h-1.5 rounded-full", done ? "bg-emerald-500" : active ? "bg-orange-500" : "bg-muted")} />
                      <p className={cn("mt-1 truncate text-[11px]", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{step}. {label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5">
              {createStep === 1 && (
                <div className="mx-auto max-w-2xl space-y-5">
                  <div>
                    <h3 className="text-base font-semibold">Quem será o Dublê Digital?</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Defina somente os dados básicos. A captura vem na próxima etapa.</p>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Nome</span>
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Marcos — Comercial" className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500/20" />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Tipo</span>
                      <select value={kind} onChange={(event) => setKind(event.target.value as "person" | "persona")} className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none">
                        <option value="person">Pessoa real autorizada</option>
                        <option value="persona">Persona da marca</option>
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium">Idioma base</span>
                      <select value={captureMarket} onChange={(event) => setCaptureMarket(event.target.value as MarketCode)} className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none">
                        {Object.values(CAPTURE_MARKETS).map((market) => <option key={market.code} value={market.code}>{market.name} · {market.locale}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              {createStep === 2 && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold">Capture foto, voz e vídeo</h3>
                      <p className="mt-1 text-sm text-muted-foreground">O ideal é concluir os três itens para máxima fidelidade.</p>
                    </div>
                    <button type="button" onClick={() => setShowMobileQr((value) => !value)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-muted">
                      <QrCode className="h-4 w-4" /> Fazer pelo celular
                    </button>
                  </div>

                  {showMobileQr && (
                    <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[150px_1fr] sm:items-center">
                      <div className="rounded-xl bg-white p-2"><img src={mobileQrUrl} alt="QR Code para captura no celular" className="aspect-square w-full" /></div>
                      <div>
                        <p className="font-medium">Continue a captura no celular</p>
                        <p className="mt-1 text-sm text-muted-foreground">Escaneie o QR Code e entre na mesma conta.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void copyMobileLink()} className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs"><Copy className="h-3.5 w-3.5" /> Copiar link</button>
                          <button type="button" onClick={() => void shareMobileLink()} className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs"><Smartphone className="h-3.5 w-3.5" /> Compartilhar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><ImagePlus className="mb-2 h-5 w-5 text-purple-600" /><p className="font-semibold">Foto</p><p className="mt-1 text-xs text-muted-foreground">Rosto claro e bem iluminado.</p></div>
                        {faceFile && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                      </div>
                      <button type="button" onClick={() => faceInput.current?.click()} className="mt-4 w-full rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"><Upload className="mr-2 inline h-3.5 w-3.5" />Escolher foto</button>
                      <p className="mt-2 truncate text-[11px] text-muted-foreground">{faceFile?.name ?? "Não enviada"}</p>
                      <input ref={faceInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setFaceFile(event.target.files?.[0] ?? null)} />
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><Mic2 className="mb-2 h-5 w-5 text-cyan-600" /><p className="font-semibold">Voz guiada</p><p className="mt-1 text-xs text-muted-foreground">1–2 min de fala natural.</p></div>
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px]">{voiceCaptureStatus.label}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button type="button" disabled={videoRecording} onClick={() => voiceRecording ? stopVoiceRecording() : void startVoiceRecording()} className={cn("rounded-lg px-3 py-2 text-xs font-semibold text-white", voiceRecording ? "bg-red-600" : "bg-cyan-600", videoRecording && "opacity-40")}>
                          {voiceRecording ? `Parar ${formatDuration(voiceElapsed)}` : "Gravar"}
                        </button>
                        <button type="button" disabled={voiceRecording} onClick={() => voiceInput.current?.click()} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40">Enviar áudio</button>
                      </div>
                      <button type="button" onClick={() => setShowVoiceScript((value) => !value)} className="mt-3 text-xs font-medium text-cyan-700">{showVoiceScript ? "Ocultar roteiro" : "Ver roteiro"}</button>
                      <input ref={voiceInput} type="file" accept="audio/*" className="hidden" onChange={(event) => void handleVoiceFile(event.target.files?.[0] ?? null)} />
                    </div>

                    <div className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div><Camera className="mb-2 h-5 w-5 text-fuchsia-600" /><p className="font-semibold">Vídeo do Dublê</p><p className="mt-1 text-xs text-muted-foreground">~2 min para rosto, olhar e gestos.</p></div>
                        <span className="rounded-full bg-muted px-2 py-1 text-[10px]">{videoCaptureStatus.label}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button type="button" disabled={voiceRecording} onClick={() => videoRecording ? stopVideoRecording() : void startVideoRecording()} className={cn("rounded-lg px-3 py-2 text-xs font-semibold text-white", videoRecording ? "bg-red-600" : "bg-fuchsia-600", voiceRecording && "opacity-40")}>
                          {videoRecording ? `Parar ${formatDuration(videoElapsed)}` : "Gravar"}
                        </button>
                        <button type="button" disabled={videoRecording} onClick={() => videoInput.current?.click()} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40">Enviar vídeo</button>
                      </div>
                      <button type="button" onClick={() => setShowVideoScript((value) => !value)} className="mt-3 text-xs font-medium text-fuchsia-700">{showVideoScript ? "Ocultar roteiro" : "Ver roteiro"}</button>
                      <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={(event) => void handleVideoFile(event.target.files?.[0] ?? null)} />
                    </div>
                  </div>

                  {videoRecording && (
                    <div className="grid gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 lg:grid-cols-[360px_1fr]">
                      <video ref={videoPreview} muted playsInline className="aspect-video w-full rounded-xl bg-black object-cover" />
                      <div><p className="text-sm font-semibold">Gravando referência · {formatDuration(videoElapsed)}</p><p className="mt-1 text-xs text-muted-foreground">Mantenha a câmera na altura dos olhos, com luz frontal e sem filtros.</p></div>
                    </div>
                  )}

                  {showVoiceScript && (
                    <section className="rounded-xl border p-4">
                      <p className="font-semibold">Roteiro de voz · {marketConfig.name}</p>
                      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-2">{marketConfig.voiceScript.map((paragraph, index) => <p key={index} className="text-sm leading-6 text-muted-foreground">{paragraph.replace("[NOME]", displayName.trim() || "[seu nome]")}</p>)}</div>
                    </section>
                  )}

                  {showVideoScript && (
                    <section className="rounded-xl border p-4">
                      <p className="font-semibold">Roteiro de vídeo · {marketConfig.name}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">{marketConfig.videoScript.map((item) => <div key={item.time} className="rounded-lg border p-3"><div className="flex justify-between gap-2"><p className="text-xs font-semibold">{item.title}</p><span className="text-[10px] text-muted-foreground">{item.time}</span></div><p className="mt-2 text-sm text-muted-foreground">{item.text.replace("[NOME]", displayName.trim() || "[seu nome]")}</p><p className="mt-2 text-[11px] text-muted-foreground">{item.cue}</p></div>)}</div>
                    </section>
                  )}
                </div>
              )}

              {createStep === 3 && (
                <div className="mx-auto max-w-3xl space-y-5">
                  <div>
                    <h3 className="text-base font-semibold">Autorizações de uso</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Defina o que este Dublê Digital pode fazer. Essas autorizações continuam independentes e revogáveis.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {CONSENT_OPTIONS.map((option) => (
                      <label key={option.scope} className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", consents[option.scope] && "border-emerald-500/40 bg-emerald-500/5")}>
                        <input type="checkbox" checked={consents[option.scope]} onChange={() => setConsents((current) => ({ ...current, [option.scope]: !current[option.scope] }))} className="mt-1 accent-emerald-600" />
                        <span><span className="block text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs text-muted-foreground">{option.description}</span></span>
                      </label>
                    ))}
                  </div>
                  <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", authorizationConfirmed ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5")}>
                    <input type="checkbox" checked={authorizationConfirmed} onChange={(event) => setAuthorizationConfirmed(event.target.checked)} className="mt-1 accent-emerald-600" />
                    <span><span className="block text-sm font-semibold">Declaro que possuo autorização para os usos selecionados</span><span className="mt-1 block text-xs text-muted-foreground">O VendorAI registra quem cadastrou, as finalidades autorizadas e o idioma base da captura.</span></span>
                  </label>
                </div>
              )}

              {createStep === 4 && (
                <div className="mx-auto max-w-3xl space-y-5">
                  <div>
                    <h3 className="text-base font-semibold">Verificação</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Confira o material antes de concluir. A análise técnica profunda ocorre após salvar.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border p-4"><p className="text-sm font-semibold">Foto</p><p className={cn("mt-2 text-xs", faceFile ? "text-emerald-600" : "text-muted-foreground")}>{faceFile ? "✓ Pronta" : "— Não enviada"}</p></div>
                    <div className="rounded-xl border p-4"><p className="text-sm font-semibold">Voz</p><p className={cn("mt-2 text-xs", voiceFile ? "text-emerald-600" : "text-muted-foreground")}>{voiceFile ? `✓ ${formatDuration(voiceDuration)}` : "— Não enviada"}</p></div>
                    <div className="rounded-xl border p-4"><p className="text-sm font-semibold">Vídeo</p><p className={cn("mt-2 text-xs", videoFile ? "text-emerald-600" : "text-muted-foreground")}>{videoFile ? `✓ ${formatDuration(videoDuration)}` : "— Não enviado"}</p></div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Dublê</span><strong>{displayName}</strong></div>
                    <div className="mt-2 flex items-center justify-between"><span className="text-muted-foreground">Idioma base</span><strong>{marketConfig.locale}</strong></div>
                    <div className="mt-2 flex items-center justify-between"><span className="text-muted-foreground">Capturas prontas</span><strong>{captureCount}/3</strong></div>
                  </div>
                </div>
              )}

              {createStep === 5 && (
                <div className="mx-auto max-w-2xl py-6 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600"><ShieldCheck className="h-8 w-8" /></div>
                  <h3 className="mt-4 text-xl font-bold">Tudo pronto para criar o Dublê Digital</h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Ao concluir, foto, voz, vídeo e autorizações serão salvos na mesma Identidade Audiovisual. Não será criado um cadastro paralelo.</p>
                  <button disabled={saving || !displayName.trim() || voiceRecording || videoRecording || !authorizationConfirmed} onClick={() => void createIdentity()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Finalizar captura do Dublê
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t px-5 py-4">
              <button
                type="button"
                disabled={createStep === 1 || saving}
                onClick={() => setCreateStep((Math.max(1, createStep - 1)) as 1 | 2 | 3 | 4 | 5)}
                className="rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-40"
              >
                Voltar
              </button>
              {createStep < 5 && (
                <button
                  type="button"
                  disabled={
                    saving ||
                    (createStep === 1 && !canContinueStep1) ||
                    (createStep === 2 && !canContinueStep2) ||
                    (createStep === 3 && !canContinueStep3)
                  }
                  onClick={() => setCreateStep((Math.min(5, createStep + 1)) as 1 | 2 | 3 | 4 | 5)}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-40"
                >
                  Continuar
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
