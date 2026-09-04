import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Clock3,
  Eye,
  HelpCircle,
  Loader2,
  Lock,
  Mic2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type MarketCode = "BR" | "PY" | "AR" | "UY" | "BO";
type ConsentScope = "face_use" | "voice_use" | "ai_generation" | "organic_publish" | "paid_ads";
type MediaKind = "image" | "audio" | "video";
type AssetRole = "reference" | "voice";

type VideoScriptBlock = {
  title: string;
  text: string;
  cue: string;
};

type CaptureMarket = {
  code: MarketCode;
  name: string;
  locale: string;
  currency: string;
  voiceScriptVersion: string;
  videoScriptVersion: string;
  voiceScript: string[];
  videoScript: VideoScriptBlock[];
};

type FrameQuality = {
  brightness: number;
  sharpness: number;
  lightOk: boolean;
  sharpOk: boolean;
  faceDetected: boolean | null;
  centered: boolean | null;
};

type PhotoCapture = {
  file: File;
  url: string;
  quality: FrameQuality;
  pose: string;
};

type VoiceProfile = {
  id: string;
};

type NativeFaceDetector = {
  detect(source: CanvasImageSource): Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

type NativeFaceDetectorCtor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeFaceDetector;

const PHOTO_POSES = [
  { key: "front", short: "Frente", title: "Olhe diretamente para a câmera", helper: "Expressão neutra e natural." },
  { key: "smile", short: "Sorriso", title: "Sorria naturalmente", helper: "Um sorriso leve, como em uma conversa." },
  { key: "left45", short: "45° Esq.", title: "Vire levemente para a esquerda", helper: "Mantenha o celular na altura dos olhos." },
  { key: "leftProfile", short: "Perfil Esq.", title: "Vire até mostrar o perfil esquerdo", helper: "Não incline o celular; mova apenas a cabeça." },
  { key: "right45", short: "45° Dir.", title: "Vire levemente para a direita", helper: "Mantenha os ombros relaxados." },
  { key: "rightProfile", short: "Perfil Dir.", title: "Vire até mostrar o perfil direito", helper: "Mantenha todo o rosto dentro da marcação." },
  { key: "chinUp", short: "Queixo cima", title: "Levante levemente o queixo", helper: "Movimento pequeno, sem perder o enquadramento." },
  { key: "chinDown", short: "Queixo baixo", title: "Abaixe levemente o queixo", helper: "Olhe com naturalidade e permaneça centralizado." },
] as const;

const VOICE_PT_BR = [
  "Olá, meu nome é [NOME]. Estou fazendo esta gravação para criar minha identidade audiovisual.",
  "Normalmente eu gosto de explicar as coisas de maneira simples, clara e objetiva.",
  "Quando surge uma dúvida, eu procuro entender primeiro o que a pessoa realmente precisa. Você já imaginou como seria ter uma solução que facilitasse todo esse processo?",
  "Em algumas situações precisamos falar com mais energia. Essa é uma oportunidade muito interessante e pode trazer excelentes resultados!",
  "Em outras situações, o mais importante é transmitir segurança e tranquilidade. Podemos analisar cada detalhe com calma e encontrar a melhor alternativa.",
  "Por exemplo: o investimento pode ser de dois mil quatrocentos e noventa reais, com pagamento no dia quinze de setembro.",
  "Podemos falar hoje, amanhã pela manhã ou sexta-feira à tarde.",
  "Ótimo. Entendi perfeitamente.",
  "Agora vou fazer uma pequena pausa. E continuar falando de forma natural.",
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
  "Podemos hablar hoy, mañana por la mañana o el viernes por la tarde.",
  "Perfecto. Entendí muy bien. Ahora voy a hacer una pequeña pausa y continuar hablando de manera natural.",
  "Algunas palabras necesitan un poco más de énfasis. Resultado. Calidad. Seguridad. Confianza. Tecnología.",
  "¿Todo bien? ¿Podemos seguir? ¿Quedó claro?",
  "Perfecto. Esta grabación representa mi manera natural de hablar y comunicarme.",
];

const VOICE_ES_NEUTRAL = VOICE_ES_VOSEO.map((line) =>
  line
    .replaceAll("vos", "usted")
    .replaceAll("podés", "puede")
    .replaceAll("Mirá", "Mire")
    .replaceAll("hablá", "hable"),
);

const VIDEO_PT_BR: VideoScriptBlock[] = [
  { title: "Expressão natural", text: "Olá, meu nome é [NOME]. Estou gravando este vídeo para criar minha identidade digital. Vou falar normalmente, da mesma maneira que converso no dia a dia.", cue: "Olhar: centro · Expressão: natural" },
  { title: "Explicação", text: "Quando explicamos alguma coisa, é importante apresentar as informações com clareza, mostrar os detalhes e ajudar a pessoa a entender exatamente o que está acontecendo.", cue: "Use seus movimentos normais de boca, sobrancelhas e cabeça." },
  { title: "Pergunta e curiosidade", text: "Mas e se existisse uma maneira diferente de fazer isso? Como você faria? Qual alternativa faria mais sentido para você?", cue: "Faça as perguntas com sua expressão interrogativa habitual." },
  { title: "Entusiasmo", text: "Essa é justamente a parte mais interessante! Quando tecnologia e conhecimento trabalham juntos, conseguimos resultados muito melhores.", cue: "Olhar: centro · Expressão: entusiasmo e sorriso natural" },
  { title: "Confiança e seriedade", text: "Também existem momentos em que precisamos falar com calma, transmitir segurança e analisar cuidadosamente cada decisão.", cue: "Reduza o sorriso e transmita calma e segurança." },
  { title: "Movimentos e finalização", text: "Agora vou olhar brevemente para um lado, depois para o outro e voltar para a câmera. Vou sorrir naturalmente e continuar falando. Perfeito. Esta é minha forma habitual de falar e me comunicar.", cue: "Frente → esquerda leve → centro → direita leve → centro → sorriso → neutro" },
];

const VIDEO_ES: VideoScriptBlock[] = [
  { title: "Expresión natural", text: "Hola, mi nombre es [NOME]. Estoy grabando este video para crear mi identidad digital. Voy a hablar normalmente, de la misma manera en que converso todos los días.", cue: "Mirada: centro · Expresión: natural" },
  { title: "Explicación", text: "Cuando explicamos algo, es importante presentar la información con claridad, mostrar los detalles y ayudar a la otra persona a entender exactamente qué está pasando.", cue: "Use sus movimientos normales de boca, cejas y cabeza." },
  { title: "Pregunta y curiosidad", text: "¿Y si existiera una manera diferente de hacer esto? ¿Cómo lo haría? ¿Qué alternativa tendría más sentido?", cue: "Haga las preguntas con su expresión habitual de curiosidad." },
  { title: "Entusiasmo", text: "¡Esta es justamente la parte más interesante! Cuando la tecnología y el conocimiento trabajan juntos, podemos conseguir resultados mucho mejores.", cue: "Mirada: centro · Expresión: entusiasmo y sonrisa natural" },
  { title: "Confianza y seriedad", text: "También hay momentos en los que necesitamos hablar con calma, transmitir seguridad y analizar cuidadosamente cada decisión.", cue: "Reduzca la sonrisa y transmita calma y seguridad." },
  { title: "Movimientos y cierre", text: "Ahora voy a mirar brevemente hacia un lado, después hacia el otro y volver a la cámara. Voy a sonreír naturalmente y continuar hablando. Perfecto. Esta es mi forma habitual de comunicarme.", cue: "Frente → izquierda leve → centro → derecha leve → centro → sonrisa → neutro" },
];

const MARKETS: Record<MarketCode, CaptureMarket> = {
  BR: { code: "BR", name: "Brasil", locale: "pt-BR", currency: "BRL", voiceScriptVersion: "pt-BR-voice-v3", videoScriptVersion: "pt-BR-video-v3", voiceScript: VOICE_PT_BR, videoScript: VIDEO_PT_BR },
  PY: { code: "PY", name: "Paraguai", locale: "es-PY", currency: "PYG", voiceScriptVersion: "es-PY-voice-v3", videoScriptVersion: "es-PY-video-v3", voiceScript: VOICE_ES_VOSEO, videoScript: VIDEO_ES },
  AR: { code: "AR", name: "Argentina", locale: "es-AR", currency: "ARS", voiceScriptVersion: "es-AR-voice-v3", videoScriptVersion: "es-AR-video-v3", voiceScript: VOICE_ES_VOSEO, videoScript: VIDEO_ES },
  UY: { code: "UY", name: "Uruguai", locale: "es-UY", currency: "UYU", voiceScriptVersion: "es-UY-voice-v3", videoScriptVersion: "es-UY-video-v3", voiceScript: VOICE_ES_VOSEO, videoScript: VIDEO_ES },
  BO: { code: "BO", name: "Bolívia", locale: "es-BO", currency: "BOB", voiceScriptVersion: "es-BO-voice-v3", videoScriptVersion: "es-BO-video-v3", voiceScript: VOICE_ES_NEUTRAL, videoScript: VIDEO_ES },
};

const STEPS = ["Preparação", "Fotos guiadas", "Voz", "Vídeo", "Validação", "Finalizar"];
const EMPTY_QUALITY: FrameQuality = { brightness: 0, sharpness: 0, lightOk: false, sharpOk: false, faceDetected: null, centered: null };

function detectInitialMarket(): MarketCode {
  const locale = typeof navigator !== "undefined" ? navigator.language?.toUpperCase() ?? "" : "";
  if (locale.includes("-PY")) return "PY";
  if (locale.includes("-AR")) return "AR";
  if (locale.includes("-UY")) return "UY";
  if (locale.includes("-BO")) return "BO";
  return "BR";
}

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
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

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function mediaMime(kind: "audio" | "video") {
  const preferred = kind === "audio"
    ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return preferred.find((mime) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime));
}

function replaceName(text: string, name: string) {
  return text.replaceAll("[NOME]", name.trim() || "[seu nome]");
}

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `capture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function scoreTone(ok: boolean | null) {
  if (ok === true) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (ok === false) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-500";
}

export default function VideoAvatarCapturePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";

  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState("");
  const [kind, setKind] = useState<"person" | "persona">("person");
  const [marketCode, setMarketCode] = useState<MarketCode>(() => detectInitialMarket());
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [consents, setConsents] = useState<Record<ConsentScope, boolean>>({ face_use: true, voice_use: true, ai_generation: true, organic_publish: false, paid_ads: false });
  const [sessionId] = useState(() => createSessionId());

  const photoVideoRef = useRef<HTMLVideoElement>(null);
  const photoStreamRef = useRef<MediaStream | null>(null);
  const [photoCameraReady, setPhotoCameraReady] = useState(false);
  const [photoCameraError, setPhotoCameraError] = useState("");
  const [photoQuality, setPhotoQuality] = useState<FrameQuality>(EMPTY_QUALITY);
  const [photos, setPhotos] = useState<Array<PhotoCapture | null>>(() => Array.from({ length: PHOTO_POSES.length }, () => null));
  const [currentPose, setCurrentPose] = useState(0);
  const [photoSequenceActive, setPhotoSequenceActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const stableFramesRef = useRef(0);
  const faceDetectorRef = useRef<NativeFaceDetector | null>(null);
  const qualityBusyRef = useRef(false);

  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnimationRef = useRef<number | null>(null);
  const [audioRecording, setAudioRecording] = useState(false);
  const [audioPaused, setAudioPaused] = useState(false);
  const [audioElapsed, setAudioElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<BlobPart[]>([]);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [videoCameraReady, setVideoCameraReady] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [videoElapsed, setVideoElapsed] = useState(0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const videoFinishRequestedRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [finishedIdentityId, setFinishedIdentityId] = useState<string | null>(null);

  const market = MARKETS[marketCode];
  const pose = PHOTO_POSES[Math.min(currentPose, PHOTO_POSES.length - 1)];
  const completedPhotos = photos.filter(Boolean).length;
  const allPhotosReady = completedPhotos === PHOTO_POSES.length;
  const currentVideoBlock = market.videoScript[Math.min(market.videoScript.length - 1, Math.floor(videoElapsed / 20))];
  const currentVideoBlockIndex = Math.min(market.videoScript.length - 1, Math.floor(videoElapsed / 20));

  const validation = useMemo(() => {
    const qualityRows = photos.filter((item): item is PhotoCapture => Boolean(item)).map((item) => item.quality);
    const brightness = qualityRows.length ? Math.round(qualityRows.reduce((sum, item) => sum + item.brightness, 0) / qualityRows.length) : 0;
    const sharpness = qualityRows.length ? Math.round(qualityRows.reduce((sum, item) => sum + item.sharpness, 0) / qualityRows.length) : 0;
    return {
      photos: completedPhotos,
      brightness,
      sharpness,
      lightOk: qualityRows.length === PHOTO_POSES.length && qualityRows.every((item) => item.lightOk),
      sharpOk: qualityRows.length === PHOTO_POSES.length && qualityRows.every((item) => item.sharpOk),
      audioOk: Boolean(audioFile) && audioElapsed >= 45 && audioElapsed <= 150,
      videoOk: Boolean(videoFile) && videoElapsed >= 90 && videoElapsed <= 150,
    };
  }, [photos, completedPhotos, audioFile, audioElapsed, videoFile, videoElapsed]);

  const stopStream = (streamRef: { current: MediaStream | null }) => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopAudioAnalysis = () => {
    if (audioAnimationRef.current !== null) cancelAnimationFrame(audioAnimationRef.current);
    audioAnimationRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    setAudioLevel(0);
  };

  const clearTimer = (timerRef: { current: ReturnType<typeof setInterval> | null }) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startPhotoCamera = async () => {
    if (photoStreamRef.current) return;
    setPhotoCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false,
      });
      photoStreamRef.current = stream;
      if (photoVideoRef.current) {
        photoVideoRef.current.srcObject = stream;
        await photoVideoRef.current.play();
      }
      const ctor = (window as unknown as { FaceDetector?: NativeFaceDetectorCtor }).FaceDetector;
      faceDetectorRef.current = ctor ? new ctor({ fastMode: true, maxDetectedFaces: 1 }) : null;
      setPhotoCameraReady(true);
    } catch (error) {
      setPhotoCameraReady(false);
      setPhotoCameraError(error instanceof Error ? error.message : "Não foi possível acessar a câmera.");
    }
  };

  const samplePhotoQuality = async () => {
    if (qualityBusyRef.current) return;
    const video = photoVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    qualityBusyRef.current = true;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 200;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let total = 0;
      let edges = 0;
      let previous = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const gray = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
        total += gray;
        if (index > 0) edges += Math.abs(gray - previous);
        previous = gray;
      }
      const count = pixels.length / 4;
      const brightness = total / count;
      const sharpness = edges / Math.max(1, count - 1);
      let faceDetected: boolean | null = null;
      let centered: boolean | null = null;
      if (faceDetectorRef.current) {
        try {
          const detections = await faceDetectorRef.current.detect(canvas);
          faceDetected = detections.length === 1;
          if (detections[0]) {
            const box = detections[0].boundingBox;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            centered = Math.abs(centerX - canvas.width / 2) < canvas.width * 0.2 && Math.abs(centerY - canvas.height / 2) < canvas.height * 0.22;
          }
        } catch {
          faceDetectorRef.current = null;
        }
      }
      const next: FrameQuality = {
        brightness: Math.round(brightness),
        sharpness: Math.round(sharpness),
        lightOk: brightness >= 48 && brightness <= 218,
        sharpOk: sharpness >= 7,
        faceDetected,
        centered,
      };
      setPhotoQuality(next);
      const ready = next.lightOk && next.sharpOk && next.faceDetected !== false && next.centered !== false;
      if (ready) stableFramesRef.current += 1;
      else {
        stableFramesRef.current = 0;
        setCountdown(null);
      }
    } finally {
      qualityBusyRef.current = false;
    }
  };

  const captureCurrentPose = async () => {
    const video = photoVideoRef.current;
    if (!video || !video.videoWidth || currentPose >= PHOTO_POSES.length) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;
    const current = PHOTO_POSES[currentPose];
    const file = new File([blob], `duble-${current.key}-${Date.now()}.jpg`, { type: "image/jpeg" });
    const url = URL.createObjectURL(file);
    setPhotos((previous) => {
      const next = [...previous];
      if (next[currentPose]) URL.revokeObjectURL(next[currentPose]!.url);
      next[currentPose] = { file, url, quality: photoQuality, pose: current.key };
      return next;
    });
    stableFramesRef.current = 0;
    setCountdown(null);
    if (currentPose < PHOTO_POSES.length - 1) {
      setCurrentPose((value) => value + 1);
    } else {
      setPhotoSequenceActive(false);
      toast({ title: "Fotos concluídas", description: "As 8 referências faciais foram capturadas. Revise as miniaturas ou continue para a voz." });
    }
  };

  useEffect(() => {
    if (step !== 2) {
      setPhotoSequenceActive(false);
      setCountdown(null);
      setPhotoCameraReady(false);
      stopStream(photoStreamRef);
      if (photoVideoRef.current) photoVideoRef.current.srcObject = null;
      return;
    }
    void startPhotoCamera();
  }, [step]);

  useEffect(() => {
    if (step !== 2 || !photoCameraReady) return;
    const timer = setInterval(() => void samplePhotoQuality(), 700);
    return () => clearInterval(timer);
  }, [step, photoCameraReady]);

  useEffect(() => {
    if (!photoSequenceActive || step !== 2 || currentPose >= PHOTO_POSES.length) return;
    const ready = photoQuality.lightOk && photoQuality.sharpOk && photoQuality.faceDetected !== false && photoQuality.centered !== false;
    if (ready && stableFramesRef.current >= 2 && countdown === null) setCountdown(3);
  }, [photoSequenceActive, step, currentPose, photoQuality, countdown]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown > 1) setCountdown((value) => (value === null ? null : value - 1));
      else void captureCurrentPose();
    }, 850);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const startAudioAnalysis = (stream: MediaStream) => {
    try {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      audioContextRef.current = context;
      const update = () => {
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        setAudioLevel(Math.min(100, Math.round((average / 128) * 100)));
        audioAnimationRef.current = requestAnimationFrame(update);
      };
      update();
    } catch {
      setAudioLevel(35);
    }
  };

  const startAudioRecording = async () => {
    if (audioRecording) return;
    try {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioFile(null);
      setAudioUrl("");
      setAudioElapsed(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const mimeType = mediaMime("audio");
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const file = new File(audioChunksRef.current, `voz-guiada-${marketCode.toLowerCase()}-${Date.now()}.webm`, { type });
        const url = URL.createObjectURL(file);
        setAudioFile(file);
        setAudioUrl(url);
        setAudioRecording(false);
        setAudioPaused(false);
        clearTimer(audioTimerRef);
        stopAudioAnalysis();
        stopStream(audioStreamRef);
      };
      recorder.start(500);
      setAudioRecording(true);
      setAudioPaused(false);
      startAudioAnalysis(stream);
      audioTimerRef.current = setInterval(() => setAudioElapsed((value) => value + 1), 1000);
    } catch (error) {
      toast({ title: "Não foi possível acessar o microfone", description: error instanceof Error ? error.message : "Verifique a permissão do navegador.", variant: "destructive" });
    }
  };

  const toggleAudioPause = () => {
    const recorder = audioRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      clearTimer(audioTimerRef);
      setAudioPaused(true);
    } else if (recorder.state === "paused") {
      recorder.resume();
      audioTimerRef.current = setInterval(() => setAudioElapsed((value) => value + 1), 1000);
      setAudioPaused(false);
    }
  };

  const finishAudio = () => {
    if (audioRecorderRef.current?.state === "recording" || audioRecorderRef.current?.state === "paused") {
      audioRecorderRef.current.stop();
    }
  };

  const redoAudio = () => {
    if (audioRecorderRef.current && audioRecorderRef.current.state !== "inactive") audioRecorderRef.current.stop();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(null);
    setAudioUrl("");
    setAudioElapsed(0);
    setTimeout(() => void startAudioRecording(), 250);
  };

  const prepareVideoCamera = async () => {
    if (videoStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      videoStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        await videoPreviewRef.current.play();
      }
      setVideoCameraReady(true);
    } catch (error) {
      setVideoCameraReady(false);
      toast({ title: "Não foi possível acessar câmera e microfone", description: error instanceof Error ? error.message : "Verifique as permissões do navegador.", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (step === 4) void prepareVideoCamera();
    else if (!videoRecording) {
      setVideoCameraReady(false);
      stopStream(videoStreamRef);
      if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    }
  }, [step]);

  const startVideoRecording = async () => {
    if (videoRecording) return;
    if (!videoStreamRef.current) await prepareVideoCamera();
    const stream = videoStreamRef.current;
    if (!stream) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl("");
    setVideoElapsed(0);
    videoChunksRef.current = [];
    const mimeType = mediaMime("video");
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    videoRecorderRef.current = recorder;
    videoFinishRequestedRef.current = false;
    recorder.ondataavailable = (event) => { if (event.data.size) videoChunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || "video/webm";
      const file = new File(videoChunksRef.current, `video-duble-${marketCode.toLowerCase()}-${Date.now()}.webm`, { type });
      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setVideoRecording(false);
      setVideoPaused(false);
      clearTimer(videoTimerRef);
      if (videoFinishRequestedRef.current) setStep(5);
    };
    recorder.start(500);
    setVideoRecording(true);
    setVideoPaused(false);
    videoTimerRef.current = setInterval(() => setVideoElapsed((value) => value + 1), 1000);
  };

  const toggleVideoPause = () => {
    const recorder = videoRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      clearTimer(videoTimerRef);
      setVideoPaused(true);
    } else if (recorder.state === "paused") {
      recorder.resume();
      videoTimerRef.current = setInterval(() => setVideoElapsed((value) => value + 1), 1000);
      setVideoPaused(false);
    }
  };

  const finishVideo = () => {
    const recorder = videoRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      videoFinishRequestedRef.current = true;
      recorder.stop();
    } else if (videoFile) {
      setStep(5);
    }
  };

  const redoVideo = () => {
    const recorder = videoRecorderRef.current;
    videoFinishRequestedRef.current = false;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl("");
    setVideoElapsed(0);
    setTimeout(() => void startVideoRecording(), 300);
  };

  const uploadReference = async (file: File, type: MediaKind, role: AssetRole, usage: string, metadata: Record<string, unknown>) => {
    const request = await apiJson<{ uploadURL: string; objectPath: string }>(`/api/tenants/${tenantId}/media/assets/request-upload`, {
      method: "POST",
      body: JSON.stringify({ name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
    });
    const upload = await fetch(request.uploadURL, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!upload.ok) throw new Error(`Falha ao enviar ${file.name}`);
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
        metadata: { ...metadata, captureSessionId: sessionId, country: market.code, market: market.code, locale: market.locale, region: "MERCOSUL", currency: market.currency },
      }),
    });
    return registered.asset.id;
  };

  const finalizeIdentity = async () => {
    if (!tenantId || !displayName.trim() || !authorizationConfirmed || !allPhotosReady || !audioFile || !videoFile) {
      toast({ title: "Capture incompleta", description: "Conclua fotos, voz e vídeo e confirme a autorização antes de finalizar.", variant: "destructive" });
      return;
    }
    setSaving(true);
    setStep(6);
    setSaveProgress(4);
    try {
      const baseMetadata = {
        authorizationDeclaredInUi: true,
        country: market.code,
        market: market.code,
        locale: market.locale,
        region: "MERCOSUL",
        currency: market.currency,
        captureSessionId: sessionId,
        captureProfile: { version: 3, market: market.code, locale: market.locale, mode: "guided_mobile" },
      };
      const created = await apiJson<{ identity: { id: string } }>(`/api/tenants/${tenantId}/media-engine/identities`, {
        method: "POST",
        body: JSON.stringify({ displayName: displayName.trim(), kind, metadata: baseMetadata }),
      });
      const identityId = created.identity.id;
      setSaveProgress(10);

      const faceAssetIds: string[] = [];
      for (let index = 0; index < photos.length; index += 1) {
        const item = photos[index];
        if (!item) continue;
        const assetId = await uploadReference(item.file, "image", "reference", "authorized_face_reference", {
          pose: PHOTO_POSES[index].key,
          poseLabel: PHOTO_POSES[index].short,
          sequenceIndex: index + 1,
          quality: item.quality,
        });
        faceAssetIds.push(assetId);
        setSaveProgress(10 + Math.round(((index + 1) / PHOTO_POSES.length) * 42));
      }

      const voiceAssetId = await uploadReference(audioFile, "audio", "voice", "authorized_voice_reference", {
        captureMethod: "guided_mobile",
        durationSeconds: audioElapsed,
        scriptVersion: market.voiceScriptVersion,
      });
      setSaveProgress(62);

      const voice = await apiJson<{ voiceProfile: VoiceProfile }>(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices`, {
        method: "POST",
        body: JSON.stringify({
          name: `${displayName.trim()} — voz principal (${market.locale})`,
          referenceAssetId: voiceAssetId,
          metadata: {
            authorizedReference: true,
            country: market.code,
            market: market.code,
            locale: market.locale,
            region: "MERCOSUL",
            captureMethod: "guided_mobile",
            durationSeconds: audioElapsed,
            scriptVersion: market.voiceScriptVersion,
            qualityAnalysisStatus: "pending",
            captureSessionId: sessionId,
          },
        }),
      });
      await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices/${voice.voiceProfile.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ready" }),
      });
      setSaveProgress(72);

      const videoAssetId = await uploadReference(videoFile, "video", "reference", "authorized_avatar_training_reference", {
        captureMethod: "guided_mobile",
        durationSeconds: videoElapsed,
        scriptVersion: market.videoScriptVersion,
      });
      setSaveProgress(83);

      const captureProfile = {
        version: 3,
        mode: "guided_mobile",
        market: market.code,
        locale: market.locale,
        captureSessionId: sessionId,
        face: {
          status: "reference_uploaded",
          analysisStatus: "pending",
          referenceAssetId: faceAssetIds[0] ?? null,
          galleryAssetIds: faceAssetIds,
          poseCount: faceAssetIds.length,
          poses: PHOTO_POSES.map((item) => item.key),
          averageBrightness: validation.brightness,
          averageSharpness: validation.sharpness,
        },
        voice: {
          status: "reference_uploaded",
          method: "recorded",
          durationSeconds: audioElapsed,
          scriptVersion: market.voiceScriptVersion,
          analysisStatus: "pending",
          referenceAssetId: voiceAssetId,
        },
        video: {
          status: "reference_uploaded",
          method: "recorded",
          durationSeconds: videoElapsed,
          scriptVersion: market.videoScriptVersion,
          analysisStatus: "pending",
          referenceAssetId: videoAssetId,
        },
      };

      await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, {
        method: "PATCH",
        body: JSON.stringify({ faceReferenceAssetId: faceAssetIds[0] ?? null, metadata: { ...baseMetadata, captureProfile } }),
      });
      setSaveProgress(90);

      const enabledConsents = Object.entries(consents).filter(([, enabled]) => enabled) as Array<[ConsentScope, boolean]>;
      for (const [scope] of enabledConsents) {
        await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/consents`, {
          method: "POST",
          body: JSON.stringify({ scope, consentVersion: "1", metadata: { source: "guided_mobile_capture", declaredByAuthenticatedUser: true, market: market.code, locale: market.locale, region: "MERCOSUL", captureSessionId: sessionId } }),
        });
      }

      await apiJson(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active", metadata: { ...baseMetadata, captureProfile } }),
      });
      setSaveProgress(100);
      setFinishedIdentityId(identityId);
      toast({ title: "Dublê Digital capturado", description: "Fotos, voz e vídeo foram salvos na identidade audiovisual e seguirão para análise de fidelidade." });
    } catch (error) {
      toast({ title: "Não foi possível finalizar a captura", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
      setStep(5);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      stopStream(photoStreamRef);
      stopStream(audioStreamRef);
      stopStream(videoStreamRef);
      clearTimer(audioTimerRef);
      clearTimer(videoTimerRef);
      stopAudioAnalysis();
      photos.forEach((item) => { if (item) URL.revokeObjectURL(item.url); });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, []);

  const goBack = () => {
    if (step <= 1) {
      window.location.assign("/content-studio/video/avatar");
      return;
    }
    if (saving) return;
    setStep((value) => Math.max(1, value - 1));
  };

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto w-full max-w-[980px] px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
          <button type="button" onClick={goBack} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#ff4b12] text-lg font-black text-white shadow-sm">V</span>
            <span className="text-lg font-bold tracking-tight">Vendor<span className="text-[#ff4b12]">.ai</span></span>
          </div>
          <button type="button" onClick={() => toast({ title: "Captura guiada", description: "Siga as instruções de cada etapa. Você pode refazer fotos, áudio ou vídeo antes de finalizar." })} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm" aria-label="Ajuda">
            <HelpCircle className="h-5 w-5" />
          </button>
        </header>

        <section className="py-6">
          <div className="flex items-start gap-3">
            <div className="mt-1 hidden rounded-2xl bg-orange-50 p-3 text-[#ff4b12] sm:block"><Sparkles className="h-6 w-6" /></div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Assistente de Captura</h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">Etapa {step} de 6 · {STEPS[step - 1]} · {market.locale}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-6 gap-1 sm:gap-2">
            {STEPS.map((label, index) => {
              const number = index + 1;
              const active = number === step;
              const done = number < step;
              return (
                <div key={label} className="relative flex min-w-0 flex-col items-center text-center">
                  {index > 0 && <span className={cn("absolute right-1/2 top-5 h-px w-full", done || active ? "bg-[#ff4b12]" : "bg-slate-200")} />}
                  <span className={cn("relative z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold", active ? "border-[#ff4b12] bg-[#ff4b12] text-white shadow-md shadow-orange-100" : done ? "border-[#ff4b12] bg-white text-[#ff4b12]" : "border-slate-200 bg-white text-slate-500")}>{done ? <Check className="h-4 w-4" /> : number}</span>
                  <span className={cn("mt-2 hidden text-[11px] font-medium sm:block", active ? "text-[#ff4b12]" : "text-slate-500")}>{label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {step === 1 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-5 shadow-sm sm:p-7">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-3 text-[#ff4b12] shadow-sm"><UserRound className="h-6 w-6" /></div>
                <div><h2 className="text-xl font-bold">Preparação do Dublê Digital</h2><p className="mt-1 text-sm text-slate-600">Vamos capturar 8 fotos guiadas, sua voz natural e um vídeo de aproximadamente 2 minutos.</p></div>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <label className="space-y-1.5 sm:col-span-1"><span className="text-xs font-semibold text-slate-600">Nome da pessoa/persona</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Marcos — Comercial" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100" /></label>
                <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Tipo</span><select value={kind} onChange={(event) => setKind(event.target.value as "person" | "persona")} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none"><option value="person">Pessoa real autorizada</option><option value="persona">Persona da marca</option></select></label>
                <label className="space-y-1.5"><span className="text-xs font-semibold text-slate-600">Mercado / idioma base</span><select value={marketCode} onChange={(event) => setMarketCode(event.target.value as MarketCode)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none">{Object.values(MARKETS).map((item) => <option key={item.code} value={item.code}>{item.name} · {item.locale} · {item.currency}</option>)}</select></label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[{ icon: Camera, title: "8 fotos guiadas", text: "Frente, sorriso, ângulos, perfis e queixo." }, { icon: Mic2, title: "Voz natural", text: "Teleprompter de 1–2 minutos no seu idioma." }, { icon: Video, title: "Vídeo guiado", text: "Expressões, olhar e movimentos por ~2 minutos." }].map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-[#ff4b12]" /><p className="mt-3 text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>)}
            </div>

            <label className={cn("flex cursor-pointer gap-3 rounded-2xl border p-4", authorizationConfirmed ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50")}>
              <input type="checkbox" checked={authorizationConfirmed} onChange={(event) => setAuthorizationConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-[#ff4b12]" />
              <span><span className="block text-sm font-bold">Declaro que possuo autorização para criar e usar esta identidade audiovisual</span><span className="mt-1 block text-xs leading-5 text-slate-500">Rosto, voz e geração com IA ficam registrados como autorizações independentes. Publicação e anúncios continuam opcionais.</span></span>
            </label>

            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              {(["organic_publish", "paid_ads"] as ConsentScope[]).map((scope) => <label key={scope} className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={consents[scope]} onChange={(event) => setConsents((previous) => ({ ...previous, [scope]: event.target.checked }))} className="accent-[#ff4b12]" />{scope === "organic_publish" ? "Autorizar publicação orgânica" : "Autorizar uso em anúncios pagos"}</label>)}
            </div>

            <button type="button" disabled={!displayName.trim() || !authorizationConfirmed} onClick={() => setStep(2)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] px-5 py-3.5 text-base font-bold text-white shadow-md shadow-orange-100 disabled:cursor-not-allowed disabled:opacity-40">Começar captura guiada <ChevronRight className="h-5 w-5" /></button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <div className="relative overflow-hidden rounded-[28px] bg-slate-950 shadow-xl">
              <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-xs font-medium text-white backdrop-blur"><span className="inline-flex items-center gap-2"><Eye className="h-4 w-4" /> Posicione o rosto dentro da marcação</span></div>
              <video ref={photoVideoRef} muted playsInline className="aspect-[4/5] w-full scale-x-[-1] object-cover" />
              <div className="pointer-events-none absolute left-1/2 top-[49%] h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
              <div className="absolute inset-x-3 bottom-3 z-20 flex flex-wrap justify-center gap-2">
                <span className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold", scoreTone(photoQuality.faceDetected))}>{photoQuality.faceDetected === false ? "Ajuste o rosto" : photoQuality.faceDetected === null ? "Rosto no enquadramento" : "✓ Rosto detectado"}</span>
                <span className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold", scoreTone(photoQuality.lightOk))}>{photoQuality.lightOk ? "✓ Iluminação boa" : "Melhore a iluminação"}</span>
                <span className={cn("rounded-full border px-3 py-1.5 text-[11px] font-semibold", scoreTone(photoQuality.centered))}>{photoQuality.centered === false ? "Centralize o rosto" : "✓ Centralizado"}</span>
              </div>
              {!photoCameraReady && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center text-white"><Camera className="h-10 w-10" /><p className="mt-3 font-bold">Abrindo a câmera…</p>{photoCameraError && <><p className="mt-2 text-sm text-red-200">{photoCameraError}</p><button onClick={() => void startPhotoCamera()} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900">Tentar novamente</button></>}</div>}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[#ff4b12]"><RefreshCw className="h-6 w-6" /></div><div><p className="text-sm font-bold text-[#ff4b12]">Foto {Math.min(currentPose + 1, 8)} de 8</p><h2 className="mt-1 text-xl font-bold">{pose.title}</h2><p className="mt-1 text-sm text-slate-500">{pose.helper}</p></div></div>
              <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {PHOTO_POSES.map((item, index) => {
                  const captured = photos[index];
                  return <button key={item.key} type="button" onClick={() => { setCurrentPose(index); setPhotoSequenceActive(false); setCountdown(null); }} className={cn("relative overflow-hidden rounded-xl border p-1 text-center", index === currentPose ? "border-[#ff4b12] bg-orange-50" : captured ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white")}><div className="aspect-square overflow-hidden rounded-lg bg-slate-100">{captured ? <img src={captured.url} alt={item.short} className="h-full w-full scale-x-[-1] object-cover" /> : <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">{index + 1}</div>}</div><span className="mt-1 block truncate text-[10px] font-medium text-slate-600">{item.short}</span>{captured && <CheckCircle2 className="absolute right-1 top-1 h-4 w-4 fill-white text-emerald-500" />}</button>;
                })}
              </div>

              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-bold">{countdown !== null ? `Captura automática em ${countdown}…` : photoSequenceActive ? "Aguardando enquadramento estável…" : allPhotosReady ? "8 fotos concluídas" : "Sequência automática pronta"}</p><p className="mt-1 text-xs text-slate-500">A captura só dispara quando iluminação e nitidez estão adequadas. Se a detecção facial nativa estiver disponível, o enquadramento também é validado.</p></div>
                <div className="flex shrink-0 gap-2"><button type="button" disabled={!photoCameraReady} onClick={() => void captureCurrentPose()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-40">Tirar manualmente</button><button type="button" disabled={!photoCameraReady || allPhotosReady} onClick={() => { stableFramesRef.current = 0; setPhotoSequenceActive((value) => !value); setCountdown(null); }} className="rounded-xl bg-[#ff4b12] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{photoSequenceActive ? "Pausar sequência" : "Iniciar sequência"}</button></div>
              </div>
            </div>

            <div className="flex gap-3"><button type="button" onClick={goBack} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" /> Voltar</button><button type="button" disabled={!allPhotosReady} onClick={() => setStep(3)} className="inline-flex min-h-12 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] px-4 font-bold text-white disabled:opacity-40">Continuar para voz <ChevronRight className="h-4 w-4" /></button></div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-orange-100 bg-orange-50/70 p-5"><h2 className="text-lg font-bold">Dicas para uma ótima gravação</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{[{ title: "Fale naturalmente", text: "Use seu jeito normal de falar." }, { title: "Ambiente silencioso", text: "Escolha um local sem ruídos." }, { title: "Não imite locutor", text: "Fale como falaria com um cliente." }].map((item) => <div key={item.title} className="rounded-2xl bg-white p-4"><Mic2 className="h-5 w-5 text-[#ff4b12]" /><p className="mt-2 text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.text}</p></div>)}</div></div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2"><div className="rounded-xl bg-orange-50 p-2 text-[#ff4b12]"><Sparkles className="h-5 w-5" /></div><div><h2 className="text-lg font-bold">Roteiro sugerido</h2><p className="text-xs text-slate-500">Leia em voz alta, no seu ritmo natural. Você pode pausar quando quiser.</p></div></div><div className="mt-4 max-h-[420px] space-y-5 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-5 sm:p-7">{market.voiceScript.map((line, index) => <p key={index} className="text-xl font-medium leading-8 tracking-tight text-slate-900 sm:text-2xl sm:leading-9">{replaceName(line, displayName)}</p>)}</div></div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={cn("h-3 w-3 rounded-full", audioRecording && !audioPaused ? "animate-pulse bg-[#ff4b12]" : "bg-slate-300")} /><span className="font-bold">{audioRecording ? audioPaused ? "Gravação pausada" : "Gravando agora" : audioFile ? "Áudio gravado" : "Pronto para gravar"}</span></div><span className="font-mono text-lg text-slate-600">{formatDuration(audioElapsed)}</span></div>
              <div className="mt-5 flex h-20 items-end gap-1 rounded-2xl bg-orange-50/60 px-4 py-3">{Array.from({ length: 32 }, (_, index) => { const threshold = Math.max(6, Math.round((audioLevel / 100) * 32)); const active = index < threshold; const height = 20 + ((index * 17) % 48); return <span key={index} className={cn("w-full rounded-full transition-all", active ? "bg-[#ff4b12]" : "bg-orange-100")} style={{ height: `${height}%` }} />; })}</div>
              <div className="mt-3 flex items-center gap-3"><Mic2 className="h-5 w-5 text-[#ff4b12]" /><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(5, audioLevel)}%` }} /></div><span className="text-xs font-semibold text-slate-500">Nível: {audioLevel > 65 ? "alto" : audioLevel > 18 ? "bom" : "baixo"}</span></div>
              {audioUrl && !audioRecording && <audio controls src={audioUrl} className="mt-4 w-full" />}
              <div className="mt-5 grid grid-cols-3 gap-2"><button type="button" disabled={!audioRecording} onClick={toggleAudioPause} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold disabled:opacity-40">{audioPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{audioPaused ? "Continuar" : "Pausar"}</button><button type="button" onClick={redoAudio} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Refazer</button>{audioRecording ? <button type="button" onClick={finishAudio} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ff4b12] text-sm font-bold text-white"><CircleStop className="h-4 w-4" /> Concluir</button> : audioFile ? <button type="button" onClick={() => setStep(4)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ff4b12] text-sm font-bold text-white">Continuar <ChevronRight className="h-4 w-4" /></button> : <button type="button" onClick={() => void startAudioRecording()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#ff4b12] text-sm font-bold text-white"><Mic2 className="h-4 w-4" /> Gravar</button>}</div>
              <p className="mt-4 text-center text-xs text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" /> Duração recomendada: 1–2 minutos</p>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4">
            <div className="relative overflow-hidden rounded-[28px] bg-slate-950 shadow-xl">
              <video ref={videoPreviewRef} muted playsInline className="aspect-[4/5] w-full scale-x-[-1] object-cover sm:aspect-video" />
              <div className="absolute left-3 top-3 max-w-[70%] rounded-2xl bg-black/55 px-4 py-3 text-sm font-medium text-white backdrop-blur"><span className="inline-flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /> Agora: {currentVideoBlock?.cue ?? "fale naturalmente"}</span></div>
              <div className="absolute right-3 top-3 rounded-2xl bg-black/60 px-4 py-3 text-right text-white backdrop-blur"><p className="flex items-center justify-end gap-2 text-sm font-bold"><span className={cn("h-2.5 w-2.5 rounded-full", videoRecording && !videoPaused ? "animate-pulse bg-red-500" : "bg-slate-400")} /> {videoRecording ? videoPaused ? "Pausado" : "Gravando" : "Pronto"}</p><p className="mt-1 font-mono text-sm">{formatDuration(videoElapsed)} / 2:00</p></div>
              <div className="absolute inset-x-4 bottom-4 rounded-3xl bg-black/70 p-5 text-white backdrop-blur sm:inset-x-12"><p className="text-center text-xl font-medium leading-7 sm:text-3xl sm:leading-10">{replaceName(currentVideoBlock?.text ?? market.videoScript[0].text, displayName)}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-[#ff4b12]" style={{ width: `${Math.min(100, (videoElapsed / 120) * 100)}%` }} /></div><p className="mt-2 text-right text-xs text-white/70">{currentVideoBlockIndex + 1} de 6</p></div>
              {!videoCameraReady && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 text-white"><Video className="h-10 w-10" /><p className="mt-3 font-bold">Preparando câmera e microfone…</p></div>}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold">Trecho do roteiro atual</h2><span className="text-sm font-bold text-[#ff4b12]">{currentVideoBlockIndex + 1} de 6</span></div><p className="mt-3 text-lg font-medium leading-7">{replaceName(currentVideoBlock?.text ?? "", displayName)}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700"><Eye className="mr-1 inline h-3.5 w-3.5" /> {currentVideoBlock?.title}</span><span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">{currentVideoBlock?.cue}</span></div><p className="mt-4 text-xs text-slate-500">A legenda é apenas guia e não será gravada no vídeo.</p></div>

            <div className="grid grid-cols-3 gap-2"><button type="button" disabled={!videoRecording} onClick={toggleVideoPause} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold disabled:opacity-40">{videoPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{videoPaused ? "Continuar" : "Pausar"}</button><button type="button" onClick={redoVideo} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Refazer</button>{videoRecording ? <button type="button" onClick={finishVideo} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4" /> Concluir</button> : videoFile ? <button type="button" onClick={() => setStep(5)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] text-sm font-bold text-white">Validar <ChevronRight className="h-4 w-4" /></button> : <button type="button" disabled={!videoCameraReady} onClick={() => void startVideoRecording()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] text-sm font-bold text-white disabled:opacity-40"><Camera className="h-4 w-4" /> Gravar</button>}</div>
          </section>
        )}

        {step === 5 && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><ShieldCheck className="h-6 w-6" /></div><div><h2 className="text-xl font-bold">Validação antes de finalizar</h2><p className="mt-1 text-sm text-slate-500">Confira as referências. A análise profunda e o Fidelity Score são calculados depois do envio ao Media Engine.</p></div></div>
              <div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-slate-200 p-4"><Camera className="h-5 w-5 text-blue-600" /><p className="mt-2 text-sm font-bold">Fotos</p><p className="mt-1 text-2xl font-bold">{completedPhotos}/8</p><p className="text-xs text-slate-500">ângulos capturados</p></div><div className="rounded-2xl border border-slate-200 p-4"><Mic2 className="h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm font-bold">Áudio</p><p className="mt-1 text-2xl font-bold">{formatDuration(audioElapsed)}</p><p className={cn("text-xs", validation.audioOk ? "text-emerald-600" : "text-amber-600")}>{validation.audioOk ? "duração recomendada" : "fora da faixa recomendada"}</p></div><div className="rounded-2xl border border-slate-200 p-4"><Video className="h-5 w-5 text-fuchsia-600" /><p className="mt-2 text-sm font-bold">Vídeo</p><p className="mt-1 text-2xl font-bold">{formatDuration(videoElapsed)}</p><p className={cn("text-xs", validation.videoOk ? "text-emerald-600" : "text-amber-600")}>{validation.videoOk ? "duração recomendada" : "fora da faixa recomendada"}</p></div><div className="rounded-2xl border border-slate-200 p-4"><Sparkles className="h-5 w-5 text-orange-600" /><p className="mt-2 text-sm font-bold">Fidelity Score</p><p className="mt-1 text-2xl font-bold">—</p><p className="text-xs text-slate-500">após análise real</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className={cn("rounded-2xl border p-4", validation.lightOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}><p className="text-sm font-bold">Iluminação média · {validation.brightness || "—"}</p><p className="mt-1 text-xs text-slate-500">{validation.lightOk ? "As 8 fotos ficaram dentro da faixa técnica recomendada." : "Uma ou mais fotos podem se beneficiar de nova captura."}</p></div><div className={cn("rounded-2xl border p-4", validation.sharpOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}><p className="text-sm font-bold">Nitidez média · {validation.sharpness || "—"}</p><p className="mt-1 text-xs text-slate-500">{validation.sharpOk ? "A sequência tem nitidez adequada para processamento." : "Revise as fotos marcadas se quiser elevar a qualidade."}</p></div></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => setStep(2)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">Refazer fotos</button><button type="button" onClick={() => setStep(3)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">Refazer áudio</button><button type="button" onClick={() => setStep(4)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">Refazer vídeo</button></div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><Lock className="mt-0.5 h-4 w-4 shrink-0" /> Seus dados são privados, ficam vinculados ao tenant autenticado e são usados apenas para a identidade audiovisual e os escopos de consentimento selecionados.</p></div>
            <button type="button" onClick={() => void finalizeIdentity()} disabled={!allPhotosReady || !audioFile || !videoFile || !authorizationConfirmed || saving} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] px-5 text-base font-bold text-white shadow-md shadow-orange-100 disabled:opacity-40"><ShieldCheck className="h-5 w-5" /> Finalizar captura do Dublê</button>
          </section>
        )}

        {step === 6 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
            {finishedIdentityId ? <><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-8 w-8" /></div><h2 className="mt-5 text-2xl font-bold">Dublê Digital capturado</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">As 8 fotos, a voz e o vídeo foram salvos na identidade audiovisual. O Media Engine agora pode executar a análise técnica e calcular a fidelidade real.</p><div className="mx-auto mt-6 max-w-md rounded-2xl bg-slate-50 p-4 text-left text-xs text-slate-500"><p><strong className="text-slate-700">Mercado:</strong> {market.name} · {market.locale}</p><p className="mt-1"><strong className="text-slate-700">Sessão:</strong> {sessionId}</p><p className="mt-1"><strong className="text-slate-700">Identidade:</strong> {finishedIdentityId}</p></div><button type="button" onClick={() => window.location.assign("/content-studio/video/avatar")} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ff4b12] px-6 font-bold text-white">Voltar para Pessoas & Vozes <ChevronRight className="h-4 w-4" /></button></> : <><Loader2 className="mx-auto h-10 w-10 animate-spin text-[#ff4b12]" /><h2 className="mt-5 text-xl font-bold">Salvando sua identidade audiovisual…</h2><p className="mt-2 text-sm text-slate-500">Não feche esta página enquanto fotos, voz e vídeo são enviados.</p><div className="mx-auto mt-6 h-2 max-w-md overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#ff4b12] transition-all" style={{ width: `${saveProgress}%` }} /></div><p className="mt-2 text-xs font-semibold text-slate-500">{saveProgress}%</p></>}
          </section>
        )}

        <footer className="mt-7 flex items-center justify-center gap-2 text-center text-xs text-slate-400"><Lock className="h-3.5 w-3.5" /> Captura segura e vinculada à conta autenticada.</footer>
      </div>
    </div>
  );
}
