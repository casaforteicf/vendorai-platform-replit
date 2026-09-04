import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Camera,
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
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button onClick={() => navigate("/content-studio/video")} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-3">
              <ArrowLeft className="h-4 w-4" /> Voltar para Vídeo com IA
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-purple-500/20 text-purple-300"><UserRound className="h-6 w-6" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold">Pessoas & Vozes autorizadas</h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200"><Globe2 className="h-3 w-3" /> Mercosul</span>
                </div>
                <p className="text-sm text-gray-400">Crie a Identidade Audiovisual e o Dublê Digital com referências guiadas e idioma base por mercado.</p>
              </div>
            </div>
          </div>
          <button onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Nova pessoa/persona
          </button>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex gap-3 text-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-200">Identidade protegida por consentimento</p>
            <p className="text-xs text-gray-400 mt-0.5">Rosto, voz, geração por IA, publicação orgânica e anúncios são autorizações independentes. Revogar uma autorização bloqueia novos usos daquele escopo.</p>
          </div>
        </div>

        {showCreate && (
          <section className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-bold text-white">Cadastrar Identidade Audiovisual</h2>
                <p className="text-xs text-gray-400 mt-1">{marketConfig.name} · {marketConfig.locale} · Mercosul. Use apenas materiais próprios ou de pessoas que autorizaram explicitamente o uso.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-400">Alta fidelidade: foto + voz guiada + vídeo ~2 min</div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-gray-300">Nome da pessoa/persona</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Marcos — Comercial" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-purple-500/50" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-gray-300">Tipo</span>
                <select value={kind} onChange={(event) => setKind(event.target.value as "person" | "persona")} className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm outline-none focus:border-purple-500/50">
                  <option value="person">Pessoa real autorizada</option>
                  <option value="persona">Persona da marca</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-gray-300">Mercado / idioma base da gravação</span>
                <select value={captureMarket} disabled={voiceRecording || videoRecording} onChange={(event) => setCaptureMarket(event.target.value as MarketCode)} className="w-full rounded-xl border border-cyan-500/20 bg-[#171126] px-3 py-2.5 text-sm outline-none focus:border-cyan-500/50 disabled:opacity-50">
                  {Object.values(CAPTURE_MARKETS).map((market) => <option key={market.code} value={market.code}>{market.name} · {market.locale} · {market.currency}</option>)}
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 flex gap-3">
              <Globe2 className="h-4 w-4 text-cyan-300 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-cyan-100">Idioma base da identidade: {marketConfig.locale}</p>
                <p className="text-[11px] text-gray-400 mt-1">Esta escolha define o roteiro usado para capturar voz e vídeo e fica registrada nas referências. Ela não limita futuros conteúdos: no gerador do Dublê você ainda pode escolher outro mercado Mercosul.</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><ImagePlus className="h-5 w-5 text-purple-300 mb-2" /><p className="text-sm font-semibold">1. Foto de referência</p><p className="text-xs text-gray-500 mt-1">JPG, PNG ou WebP com rosto claro e bem iluminado.</p></div>
                  {faceFile && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
                </div>
                <button type="button" onClick={() => faceInput.current?.click()} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"><Upload className="h-3.5 w-3.5" /> Escolher foto</button>
                <p className="text-[11px] text-gray-500 truncate">{faceFile?.name ?? "Nenhuma foto selecionada"}</p>
                <input ref={faceInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setFaceFile(event.target.files?.[0] ?? null)} />
              </div>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><Mic2 className="h-5 w-5 text-cyan-300 mb-2" /><p className="text-sm font-semibold">2. Voz guiada · {marketConfig.locale}</p><p className="text-xs text-gray-500 mt-1">Capta timbre, ritmo, pausas, perguntas, ênfase e transições no idioma base.</p></div>
                  <span className={cn("rounded-full px-2 py-1 text-[10px]", voiceCaptureStatus.tone === "ready" ? "bg-emerald-500/15 text-emerald-300" : voiceCaptureStatus.tone === "warning" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-gray-500")}>{voiceCaptureStatus.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={videoRecording} onClick={() => voiceRecording ? stopVoiceRecording() : void startVoiceRecording()} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold", voiceRecording ? "bg-red-600 hover:bg-red-500 text-white" : "bg-cyan-600 hover:bg-cyan-500 text-white", videoRecording && "opacity-40")}>
                    {voiceRecording ? <CircleStop className="h-3.5 w-3.5" /> : <Mic2 className="h-3.5 w-3.5" />}{voiceRecording ? `Parar ${formatDuration(voiceElapsed)}` : "Gravar agora"}
                  </button>
                  <button type="button" disabled={voiceRecording} onClick={() => voiceInput.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"><Upload className="h-3.5 w-3.5" /> Enviar áudio</button>
                </div>
                <button type="button" onClick={() => setShowVoiceScript((value) => !value)} className="text-xs text-cyan-300 hover:text-cyan-200">{showVoiceScript ? "Ocultar roteiro" : "Ver roteiro guiado"}</button>
                <p className="text-[11px] text-gray-500 truncate">{voiceFile ? `${voiceFile.name} · ${formatDuration(voiceDuration)}` : "Recomendado: aproximadamente 1–2 minutos de fala útil"}</p>
                <input ref={voiceInput} type="file" accept="audio/*" className="hidden" onChange={(event) => void handleVoiceFile(event.target.files?.[0] ?? null)} />
              </div>

              <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><Camera className="h-5 w-5 text-fuchsia-300 mb-2" /><p className="text-sm font-semibold">3. Vídeo do Dublê · {marketConfig.locale}</p><p className="text-xs text-gray-500 mt-1">Referência facial, labial, olhar, expressões, cabeça e gestos.</p></div>
                  <span className={cn("rounded-full px-2 py-1 text-[10px]", videoCaptureStatus.tone === "ready" ? "bg-emerald-500/15 text-emerald-300" : videoCaptureStatus.tone === "warning" ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-gray-500")}>{videoCaptureStatus.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={voiceRecording} onClick={() => videoRecording ? stopVideoRecording() : void startVideoRecording()} className={cn("inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold", videoRecording ? "bg-red-600 hover:bg-red-500 text-white" : "bg-fuchsia-600 hover:bg-fuchsia-500 text-white", voiceRecording && "opacity-40")}>
                    {videoRecording ? <CircleStop className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}{videoRecording ? `Parar ${formatDuration(videoElapsed)}` : "Gravar vídeo"}
                  </button>
                  <button type="button" disabled={videoRecording} onClick={() => videoInput.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"><Upload className="h-3.5 w-3.5" /> Enviar vídeo</button>
                </div>
                <button type="button" onClick={() => setShowVideoScript((value) => !value)} className="text-xs text-fuchsia-300 hover:text-fuchsia-200">{showVideoScript ? "Ocultar roteiro" : "Abrir roteiro de 2 min"}</button>
                <p className="text-[11px] text-gray-500 truncate">{videoFile ? `${videoFile.name} · ${formatDuration(videoDuration)}` : "Meta: aproximadamente 2 minutos"}</p>
                <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={(event) => void handleVideoFile(event.target.files?.[0] ?? null)} />
              </div>
            </div>

            {videoRecording && (
              <div className="grid lg:grid-cols-[360px_1fr] gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <video ref={videoPreview} muted playsInline className="w-full aspect-video rounded-xl bg-black object-cover" />
                <div><p className="text-sm font-semibold text-white">Gravando referência do Dublê · {formatDuration(videoElapsed)}</p><p className="text-xs text-gray-400 mt-1">Mantenha a câmera na altura dos olhos, rosto iluminado e sem filtros. O roteiro abaixo orienta as transições.</p><div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-gray-300">Frente → esquerda leve → centro → direita leve → centro → sorriso natural → expressão neutra.</div></div>
              </div>
            )}

            {showVoiceScript && (
              <section className="rounded-xl border border-cyan-500/20 bg-black/20 p-4 space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold text-cyan-100">Teleprompter — Voz guiada · {marketConfig.name}</p><p className="text-xs text-gray-500">Leia no seu ritmo normal. Não tente imitar locutor e não force sotaque diferente do seu.</p></div>
                  <span className="text-[10px] text-gray-500">{marketConfig.voiceScriptVersion}</span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-3 pr-2">{marketConfig.voiceScript.map((paragraph, index) => <p key={index} className="text-sm leading-6 text-gray-200">{paragraph.replace("[NOME]", displayName.trim() || "[seu nome]")}</p>)}</div>
              </section>
            )}

            {showVideoScript && (
              <section className="rounded-xl border border-fuchsia-500/20 bg-black/20 p-4 space-y-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold text-fuchsia-100">Teleprompter — Vídeo guiado ~2 min · {marketConfig.name}</p><p className="text-xs text-gray-500">Naturalidade primeiro. Movimentos pequenos e reais são melhores que atuação exagerada.</p></div>
                  <span className="text-[10px] text-gray-500">{marketConfig.videoScriptVersion}</span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">{marketConfig.videoScript.map((item) => <div key={item.time} className="rounded-lg border border-white/10 bg-white/[0.02] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-fuchsia-200">{item.title}</p><span className="text-[10px] text-gray-500">{item.time}</span></div><p className="text-sm leading-5 text-gray-200 mt-2">{item.text.replace("[NOME]", displayName.trim() || "[seu nome]")}</p><p className="text-[11px] text-gray-500 mt-2">{item.cue}</p></div>)}</div>
              </section>
            )}

            <section className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-3">
              <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-300" /><p className="text-sm font-semibold">Pré-validação técnica das referências</p></div>
              <p className="text-xs text-gray-500">O VendorAI registra verificações objetivas disponíveis no navegador e depois usa o analisador técnico do Media Engine. Não exibimos nota artificial de semelhança facial.</p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 p-3"><p className="text-xs font-semibold">Voz · {marketConfig.locale}</p><div className="mt-2 space-y-1 text-[11px] text-gray-400"><p>{voiceFile ? "✓ Arquivo capturado" : "— Arquivo ainda não capturado"}</p><p>{voiceDuration !== null ? `${voiceDuration >= 45 && voiceDuration <= 150 ? "✓" : "!"} Duração: ${formatDuration(voiceDuration)}` : "— Duração ainda não disponível"}</p><p>◌ Ruído, pico, silêncio e demais métricas: analisador técnico após salvar</p></div></div>
                <div className="rounded-lg border border-white/10 p-3"><p className="text-xs font-semibold">Vídeo · {marketConfig.locale}</p><div className="mt-2 space-y-1 text-[11px] text-gray-400"><p>{videoFile ? "✓ Arquivo capturado" : "— Arquivo ainda não capturado"}</p><p>{videoDuration !== null ? `${videoDuration >= 90 && videoDuration <= 150 ? "✓" : "!"} Duração: ${formatDuration(videoDuration)}` : "— Duração ainda não disponível"}</p><p>◌ Resolução, FPS, áudio e demais métricas: analisador técnico após salvar</p></div></div>
              </div>
            </section>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Autorizações de uso</p>
              <div className="grid md:grid-cols-2 gap-2">
                {CONSENT_OPTIONS.map((option) => (
                  <label key={option.scope} className={cn("flex gap-3 rounded-xl border p-3 cursor-pointer", consents[option.scope] ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]")}>
                    <input type="checkbox" checked={consents[option.scope]} onChange={() => setConsents((current) => ({ ...current, [option.scope]: !current[option.scope] }))} className="mt-1 accent-emerald-500" />
                    <span><span className="block text-sm font-medium">{option.label}</span><span className="block text-xs text-gray-500 mt-0.5">{option.description}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <label className={cn("flex gap-3 rounded-xl border p-4 cursor-pointer", authorizationConfirmed ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/5")}>
              <input type="checkbox" checked={authorizationConfirmed} onChange={(event) => setAuthorizationConfirmed(event.target.checked)} className="mt-1 accent-emerald-500" />
              <span><span className="block text-sm font-semibold">Declaro que possuo autorização para os usos selecionados</span><span className="block text-xs text-gray-400 mt-1">Esta confirmação não substitui documentos legais necessários ao seu caso. Ela registra no VendorAI quem cadastrou, quais finalidades foram autorizadas e o mercado/idioma base da captura.</span></span>
            </label>

            <div className="flex justify-end gap-2">
              <button onClick={() => { resetCreate(); setShowCreate(false); }} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-300">Cancelar</button>
              <button disabled={saving || !displayName.trim() || voiceRecording || videoRecording} onClick={() => void createIdentity()} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Salvar identidade autorizada
              </button>
            </div>
          </section>
        )}

        <div className="grid lg:grid-cols-[320px_1fr] gap-4">
          <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2 min-h-[420px]">
            <div className="flex items-center justify-between px-2 py-1"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Identidades</p><button onClick={() => void loadAll(true)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400" aria-label="Atualizar"><RefreshCw className="h-3.5 w-3.5" /></button></div>
            {loading ? (
              <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-purple-400" /></div>
            ) : identities.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-gray-500">Nenhuma pessoa/persona cadastrada ainda.</div>
            ) : identities.map((identity) => {
              const identityMarket = marketFromMetadata(identity.metadata);
              return (
                <button key={identity.id} onClick={() => void loadIdentity(identity.id)} className={cn("w-full rounded-xl border p-3 text-left transition-colors", selectedId === identity.id ? "border-purple-500/40 bg-purple-500/10" : "border-white/5 bg-black/10 hover:border-white/15")}>
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold truncate">{identity.display_name}</p><span className={cn("text-[10px] rounded-full px-2 py-0.5", identity.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-500/15 text-gray-300")}>{identity.status === "active" ? "Ativa" : identity.status}</span></div>
                  <p className="text-[11px] text-gray-500 mt-1">{identity.kind === "person" ? "Pessoa real" : "Persona"} · {identityMarket.code} / {identityMarket.locale} · {Number(identity.voice_profile_count ?? 0)} voz(es) · {Number(identity.active_consent_count ?? 0)} autorizações</p>
                </button>
              );
            })}
          </aside>

          <main className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 min-h-[420px]">
            {!detail ? (
              <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center"><UserRound className="h-9 w-9 text-gray-600 mb-3" /><p className="text-sm font-semibold text-gray-300">Selecione ou cadastre uma identidade</p><p className="text-xs text-gray-500 mt-1 max-w-sm">Aqui ficam foto, voz, vídeo de referência, idioma base e permissões usadas para criação audiovisual.</p></div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{detail.identity.display_name}</h2><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200">{detailMarket.name} · {detailMarket.locale}</span></div>
                    <p className="text-xs text-gray-500 mt-1">{detail.identity.kind === "person" ? "Pessoa real autorizada" : "Persona da marca"} · VendorAI · Mercosul</p>
                  </div>
                  <div className={cn("rounded-lg border px-3 py-2 text-xs", voiceEngineReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200")}>{voiceEngineReady ? "Motor de voz conectado" : "Motor de voz aguardando GPU/configuração"}</div>
                </div>

                <section className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                  <div><p className="text-sm font-semibold">Prontidão da Identidade Audiovisual</p><p className="text-[11px] text-gray-500 mt-1">As referências ficam versionadas na Biblioteca Audiovisual com mercado e locale de captura. A análise profunda não recebe nota até processamento real.</p></div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs font-semibold">Rosto</p><p className={cn("text-[11px] mt-1", detail.identity.face_reference_asset_id ? "text-emerald-300" : "text-gray-500")}>{detail.identity.face_reference_asset_id ? "✓ Referência salva" : "— Não cadastrado"}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs font-semibold">Voz · {detailMarket.locale}</p><p className={cn("text-[11px] mt-1", detailVoiceReference ? "text-emerald-300" : "text-gray-500")}>{detailVoiceReference ? "✓ Referência salva" : "— Não cadastrada"}</p></div>
                    <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs font-semibold">Vídeo ~2 min</p><p className={cn("text-[11px] mt-1", detailVideoReferenceId ? "text-emerald-300" : "text-gray-500")}>{detailVideoReferenceId ? "✓ Referência salva" : "— Não cadastrado"}</p></div>
                  </div>
                  {(detailCapture?.voice?.analysisStatus === "pending" || detailCapture?.video?.analysisStatus === "pending") && <p className="text-[11px] text-amber-300">◌ Análise profunda de fidelidade pendente: ruído/eco/clipping, prosódia, expressões, olhar, estabilidade e sincronismo labial.</p>}
                </section>

                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Autorizações ativas</p>
                  <div className="flex flex-wrap gap-2">{CONSENT_OPTIONS.map((option) => <span key={option.scope} className={cn("rounded-full border px-2.5 py-1 text-[11px]", activeConsentScopes.has(option.scope) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.02] text-gray-500")}>{activeConsentScopes.has(option.scope) ? "✓ " : "— "}{option.label}</span>)}</div>
                </section>

                <section className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-3">
                  <div className="flex items-center gap-2"><FileAudio className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold">Perfis de voz</p></div>
                  {detail.voices.length === 0 ? <p className="text-xs text-gray-500">Nenhum áudio de referência foi cadastrado para esta identidade.</p> : detail.voices.map((voice) => <div key={voice.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"><div><p className="text-sm">{voice.name}</p><p className="text-[11px] text-gray-500">{voice.reference_asset_id ? `Áudio de referência salvo na Biblioteca · ${detailMarket.locale}` : "Sem referência de áudio"}</p></div><span className={cn("text-[10px] rounded-full px-2 py-0.5", voice.status === "ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-500/15 text-gray-300")}>{voice.status === "ready" ? "Pronta" : voice.status}</span></div>)}
                </section>

                {detailVideoReferenceId && <section className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4"><div className="flex items-center gap-2"><FileVideo className="h-4 w-4 text-fuchsia-300" /><p className="text-sm font-semibold">Referência corporal/facial do Dublê</p></div><p className="text-xs text-gray-500 mt-1">Vídeo guiado registrado na Identidade Audiovisual em {detailMarket.locale}. Ele permanece vinculado ao pipeline de análise e geração do Dublê.</p></section>}

                <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold">Testar voz autorizada · {detailMarket.locale}</p></div><p className="text-[11px] text-gray-500 mt-1">Exige perfil de voz pronto + autorizações de voz e geração IA. O locale é enviado automaticamente ao Voice Engine.</p></div>{!voiceEngineReady && <span className="text-[10px] text-amber-300">Disponível após conectar GPU</span>}</div>
                  <textarea value={testText} onChange={(event) => setTestText(event.target.value)} rows={3} maxLength={5000} className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-cyan-500/40" />
                  <div className="flex flex-wrap items-center gap-3"><button disabled={!voiceEngineReady || testingVoice || !detail.voices.some((voice) => voice.status === "ready") || !activeConsentScopes.has("voice_use") || !activeConsentScopes.has("ai_generation")} onClick={() => void testVoice()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">{testingVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar amostra</button>{testAudioUrl && <audio controls src={testAudioUrl} className="h-8 max-w-full" />}</div>
                </section>

                <TalkingVideoPanel tenantId={tenantId} identityId={detail.identity.id} identityName={detail.identity.display_name} faceReferenceAssetId={detail.identity.face_reference_asset_id} voices={detail.voices} activeConsentScopes={activeConsentScopes} voiceEngineReady={voiceEngineReady} lipSyncEngineReady={lipSyncEngineReady} />
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
