import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AudioLines,
  Captions,
  CheckCircle2,
  Film,
  Library,
  Loader2,
  Mic2,
  Music2,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Type,
  Volume2,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type MediaAsset = {
  id: string;
  type: string;
  role?: string | null;
  storageUrl?: string | null;
  storage_url?: string | null;
  accessUrl?: string | null;
  access_url?: string | null;
  originalFilename?: string | null;
  original_filename?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

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
};

type Capabilities = {
  workers?: {
    voice?: { ready?: boolean; configured?: boolean };
    music?: { ready?: boolean; configured?: boolean };
  };
};

type GeneratedVoice = {
  assetId: string;
  url: string;
};

type JobPayload = {
  status?: string;
  videoUrl?: string;
  error?: string;
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function assetUrl(asset: MediaAsset): string {
  return asset.accessUrl ?? asset.access_url ?? mediaUrl(asset.storageUrl ?? asset.storage_url ?? "");
}

function mediaUrl(raw: string): string {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  return raw;
}

function assetName(asset: MediaAsset): string {
  return asset.originalFilename ?? asset.original_filename ?? "Áudio sem nome";
}

function metadata(asset: MediaAsset): Record<string, unknown> {
  return asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
    ? asset.metadata
    : {};
}

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function audioKind(asset: MediaAsset): string {
  return normalized(metadata(asset).audioKind || asset.role || "");
}

function isVoiceAsset(asset: MediaAsset): boolean {
  const kind = audioKind(asset);
  const meta = metadata(asset);
  const name = normalized(assetName(asset));
  return kind === "voiceover"
    || kind === "voice"
    || Boolean(meta.identityId)
    || /^voice[-_]/.test(name)
    || name.includes("locucao")
    || name.includes("locução");
}

function isMusicAsset(asset: MediaAsset): boolean {
  return audioKind(asset) === "music" || normalized(asset.role) === "music";
}

function storagePath(raw: string): string {
  if (!raw) return "";
  try {
    const pathname = new URL(raw, window.location.origin).pathname;
    return pathname.startsWith("/api/storage") ? pathname.slice("/api/storage".length) : pathname;
  } catch {
    return raw.replace(/^\/api\/storage/, "");
  }
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = words[0] ?? "";
  for (let index = 1; index < words.length; index += 1) {
    const next = `${line} ${words[index]}`;
    if (ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = words[index] ?? "";
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines.slice(0, 4);
}

async function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return;
  await new Promise<void>((resolve, reject) => {
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("Não foi possível abrir o vídeo para finalização.")); };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", failed);
    };
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("error", failed);
    video.load();
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function RangeField({ label, value, onChange, max = 120 }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{value}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
}

export default function VideoAudioStudioPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const requestedAssetId = useRef(new URLSearchParams(window.location.search).get("mediaAssetId")?.trim() ?? "");

  const [sourceAsset, setSourceAsset] = useState<MediaAsset | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [audioAssets, setAudioAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  const [script, setScript] = useState("");
  const [overlayText, setOverlayText] = useState("");
  const [burnOverlay, setBurnOverlay] = useState(false);
  const [selectedVoiceAssetId, setSelectedVoiceAssetId] = useState("");
  const [selectedMusicAssetId, setSelectedMusicAssetId] = useState("");
  const [selectedExtraAssetId, setSelectedExtraAssetId] = useState("");
  const [originalVolume, setOriginalVolume] = useState(100);
  const [voiceVolume, setVoiceVolume] = useState(100);
  const [musicVolume, setMusicVolume] = useState(20);
  const [extraVolume, setExtraVolume] = useState(55);
  const [ducking, setDucking] = useState(true);

  const [identities, setIdentities] = useState<Identity[]>([]);
  const [identityId, setIdentityId] = useState("");
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [generatedVoice, setGeneratedVoice] = useState<GeneratedVoice | null>(null);

  const [rendering, setRendering] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultAssetId, setResultAssetId] = useState("");
  const [renderError, setRenderError] = useState("");

  const voiceAssets = useMemo(
    () => audioAssets.filter((asset) => asset.type === "audio" && isVoiceAsset(asset)),
    [audioAssets],
  );
  const musicAssets = useMemo(
    () => audioAssets.filter((asset) => asset.type === "audio" && isMusicAsset(asset)),
    [audioAssets],
  );
  const extraAssets = useMemo(
    () => audioAssets.filter((asset) => asset.type === "audio" && !isVoiceAsset(asset) && !isMusicAsset(asset)),
    [audioAssets],
  );
  const voiceWorkerReady = capabilities?.workers?.voice?.ready === true;

  const loadAudioAssets = useCallback(async () => {
    if (!tenantId) return;
    const response = await fetch(`/api/tenants/${tenantId}/media/assets?type=audio&limit=500`, { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Falha ao carregar áudios da Biblioteca");
    setAudioAssets(Array.isArray(data.assets) ? data.assets : []);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !requestedAssetId.current) return;
    let cancelled = false;
    let objectUrl = "";
    void (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [videosResponse, capabilitiesResponse, identitiesResponse] = await Promise.all([
          fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=500`, { headers: authHeaders() }),
          fetch(`/api/tenants/${tenantId}/media-engine/capabilities`, { headers: authHeaders() }),
          fetch(`/api/tenants/${tenantId}/media-engine/identities`, { headers: authHeaders() }),
        ]);
        const videosData = await videosResponse.json().catch(() => ({}));
        const capabilitiesData = await capabilitiesResponse.json().catch(() => ({}));
        const identitiesData = await identitiesResponse.json().catch(() => ({}));
        if (!videosResponse.ok) throw new Error(videosData.error ?? "Vídeo não encontrado na Biblioteca");
        const asset = (Array.isArray(videosData.assets) ? videosData.assets : []).find(
          (item: MediaAsset) => item.id === requestedAssetId.current,
        ) as MediaAsset | undefined;
        if (!asset) throw new Error("Vídeo não encontrado na Biblioteca deste tenant");

        const fileUrl = assetUrl(asset);
        const fileResponse = await fetch(fileUrl, { headers: fileUrl.startsWith("/api/") ? authHeaders() : undefined });
        if (!fileResponse.ok) throw new Error("Não foi possível carregar o arquivo de vídeo");
        const blob = await fileResponse.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setSourceAsset(asset);
        setSourcePreview(objectUrl);
        if (capabilitiesResponse.ok) setCapabilities(capabilitiesData as Capabilities);
        const identityRows = identitiesResponse.ok && Array.isArray(identitiesData.identities) ? identitiesData.identities as Identity[] : [];
        setIdentities(identityRows);
        const preferredIdentity = identityRows.find((item) => item.status === "active") ?? identityRows[0];
        if (preferredIdentity) setIdentityId(preferredIdentity.id);
        await loadAudioAssets();
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Falha ao preparar finalização audiovisual");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [loadAudioAssets, tenantId]);

  useEffect(() => {
    if (!tenantId || !identityId) {
      setVoices([]);
      setVoiceProfileId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, { headers: authHeaders() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const readyVoices = (Array.isArray(data.voices) ? data.voices : []).filter((voice: VoiceProfile) => voice.status === "ready") as VoiceProfile[];
        if (cancelled) return;
        setVoices(readyVoices);
        setVoiceProfileId((current) => readyVoices.some((voice) => voice.id === current) ? current : (readyVoices[0]?.id ?? ""));
      } catch {
        if (!cancelled) {
          setVoices([]);
          setVoiceProfileId("");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [identityId, tenantId]);

  const generateVoice = async () => {
    if (!tenantId || !identityId || !voiceProfileId || !script.trim() || voiceGenerating) return;
    setVoiceGenerating(true);
    setVoiceError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices/${voiceProfileId}/synthesize`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: script.trim(),
          language: "pt-br",
          title: sourceAsset ? `Locução — ${assetName(sourceAsset)}` : "Locução de vídeo",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "VOICE_CONSENT_REQUIRED") {
          throw new Error("Esta voz ainda precisa dos consentimentos de uso e geração por IA. Autorize a identidade audiovisual e tente novamente.");
        }
        throw new Error(data.error ?? "Não foi possível gerar a locução");
      }
      const assetId = String(data.assetId ?? "");
      const url = mediaUrl(String(data.audioUrl ?? ""));
      if (!assetId || !url) throw new Error("A locução foi processada, mas o arquivo final não foi retornado");
      setGeneratedVoice({ assetId, url });
      setSelectedVoiceAssetId(assetId);
      await loadAudioAssets().catch(() => undefined);
      toast({ title: "Locução pronta", description: "A voz foi salva na Biblioteca e já está selecionada para este vídeo." });
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Falha ao gerar locução");
    } finally {
      setVoiceGenerating(false);
    }
  };

  const resolveAudioUrl = useCallback((assetId: string): string => {
    if (!assetId) return "";
    if (generatedVoice?.assetId === assetId) return generatedVoice.url;
    const asset = audioAssets.find((item) => item.id === assetId);
    return asset ? assetUrl(asset) : "";
  }, [audioAssets, generatedVoice]);

  const fetchAudioBuffer = async (audioContext: AudioContext, url: string): Promise<AudioBuffer> => {
    const response = await fetch(url, { headers: url.startsWith("/api/") ? authHeaders() : undefined });
    if (!response.ok) throw new Error("Não foi possível carregar um dos áudios selecionados");
    return await audioContext.decodeAudioData(await response.arrayBuffer());
  };

  const pollFinalJob = async (jobId: string): Promise<string> => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({})) as JobPayload;
      if (data.status === "done" && data.videoUrl) return mediaUrl(data.videoUrl);
      if (data.status === "error") throw new Error(data.error ?? "Falha ao converter o vídeo final");
      setProgressText("Convertendo para MP4 e salvando na Biblioteca…");
    }
    throw new Error("A finalização excedeu o tempo esperado");
  };

  const findResultAssetId = async (videoUrl: string): Promise<string> => {
    const response = await fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=500`, { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return "";
    const expected = storagePath(videoUrl);
    const found = (Array.isArray(data.assets) ? data.assets : []).find((asset: MediaAsset) => storagePath(asset.storageUrl ?? asset.storage_url ?? "") === expected) as MediaAsset | undefined;
    return found?.id ?? "";
  };

  const finalizeVideo = async () => {
    if (!tenantId || !sourcePreview || rendering) return;
    if (!selectedVoiceAssetId && !selectedMusicAssetId && !selectedExtraAssetId && !(burnOverlay && overlayText.trim())) {
      toast({ title: "Nada para aplicar", description: "Selecione locução, música/áudio ou um texto na tela antes de finalizar." });
      return;
    }
    setRendering(true);
    setRenderError("");
    setResultUrl("");
    setResultAssetId("");
    setProgressText("Preparando vídeo, locução e trilhas…");

    let audioContext: AudioContext | null = null;
    let canvasStream: MediaStream | null = null;
    let voiceSource: AudioBufferSourceNode | null = null;
    let musicSource: AudioBufferSourceNode | null = null;
    let extraSource: AudioBufferSourceNode | null = null;
    let objectUrl = "";

    try {
      if (typeof MediaRecorder === "undefined") throw new Error("Este navegador não suporta a finalização audiovisual local.");
      const video = document.createElement("video");
      video.src = sourcePreview;
      video.preload = "auto";
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      await waitForVideoMetadata(video);
      const duration = Number(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Não foi possível identificar a duração do vídeo");

      const naturalWidth = Math.max(2, video.videoWidth || 720);
      const naturalHeight = Math.max(2, video.videoHeight || 1280);
      const scale = Math.min(1, 1280 / Math.max(naturalWidth, naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, Math.round(naturalWidth * scale));
      canvas.height = Math.max(2, Math.round(naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("O navegador não liberou o motor gráfico do vídeo");
      canvasStream = canvas.captureStream(30);

      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("O navegador não liberou o motor de áudio");
      audioContext = new AudioContextCtor();
      const destination = audioContext.createMediaStreamDestination();
      const videoSource = audioContext.createMediaElementSource(video);
      const originalGain = audioContext.createGain();
      originalGain.gain.value = originalVolume / 100;
      videoSource.connect(originalGain).connect(destination);

      let voiceAnalyser: AnalyserNode | null = null;
      let voiceSamples: Float32Array | null = null;
      const voiceUrl = resolveAudioUrl(selectedVoiceAssetId);
      if (voiceUrl) {
        const voiceBuffer = await fetchAudioBuffer(audioContext, voiceUrl);
        voiceSource = audioContext.createBufferSource();
        voiceSource.buffer = voiceBuffer;
        const voiceGain = audioContext.createGain();
        voiceGain.gain.value = voiceVolume / 100;
        voiceAnalyser = audioContext.createAnalyser();
        voiceAnalyser.fftSize = 512;
        voiceSamples = new Float32Array(voiceAnalyser.fftSize);
        voiceSource.connect(voiceGain).connect(voiceAnalyser).connect(destination);
      }

      let musicGain: GainNode | null = null;
      const musicUrl = resolveAudioUrl(selectedMusicAssetId);
      if (musicUrl) {
        const musicBuffer = await fetchAudioBuffer(audioContext, musicUrl);
        musicSource = audioContext.createBufferSource();
        musicSource.buffer = musicBuffer;
        musicSource.loop = true;
        musicGain = audioContext.createGain();
        musicGain.gain.value = musicVolume / 100;
        musicSource.connect(musicGain).connect(destination);
      }

      const extraUrl = resolveAudioUrl(selectedExtraAssetId);
      if (extraUrl) {
        const extraBuffer = await fetchAudioBuffer(audioContext, extraUrl);
        extraSource = audioContext.createBufferSource();
        extraSource.buffer = extraBuffer;
        const extraGain = audioContext.createGain();
        extraGain.gain.value = extraVolume / 100;
        extraSource.connect(extraGain).connect(destination);
      }

      const outputStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const preferredTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = preferredTypes.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
      const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Falha durante a renderização audiovisual"));
      });

      const drawFrame = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (burnOverlay && overlayText.trim()) {
          const fontSize = Math.max(22, Math.round(canvas.width * 0.045));
          const padding = Math.round(fontSize * 0.65);
          ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
          ctx.textBaseline = "top";
          ctx.textAlign = "center";
          const lines = wrapCanvasText(ctx, overlayText.trim(), canvas.width * 0.82);
          const lineHeight = fontSize * 1.18;
          const blockHeight = lines.length * lineHeight + padding * 2;
          const y = canvas.height - blockHeight - Math.round(canvas.height * 0.075);
          ctx.fillStyle = "rgba(0,0,0,0.66)";
          ctx.fillRect(canvas.width * 0.06, y, canvas.width * 0.88, blockHeight);
          ctx.fillStyle = "#ffffff";
          lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, y + padding + index * lineHeight, canvas.width * 0.82));
        }
      };

      await audioContext.resume();
      recorder.start(600);
      const audioNow = audioContext.currentTime;
      voiceSource?.start(audioNow);
      musicSource?.start(audioNow);
      if (musicSource) musicSource.stop(audioNow + duration);
      extraSource?.start(audioNow);
      drawFrame();
      await video.play();
      setProgressText("Renderizando vídeo com som…");

      await new Promise<void>((resolve, reject) => {
        const started = performance.now();
        const loop = () => {
          drawFrame();
          if (musicGain && ducking && voiceAnalyser && voiceSamples) {
            voiceAnalyser.getFloatTimeDomainData(voiceSamples);
            let sum = 0;
            for (const sample of voiceSamples) sum += sample * sample;
            const rms = Math.sqrt(sum / Math.max(1, voiceSamples.length));
            const base = musicVolume / 100;
            const target = rms > 0.02 ? base * 0.28 : base;
            musicGain.gain.setTargetAtTime(target, audioContext!.currentTime, rms > 0.02 ? 0.04 : 0.22);
          }
          const percent = Math.min(99, Math.round((video.currentTime / duration) * 100));
          setProgressText(`Renderizando vídeo com som… ${percent}%`);
          if (video.ended || video.currentTime >= duration - 0.03) {
            resolve();
            return;
          }
          if (performance.now() - started > (duration + 20) * 1000) {
            reject(new Error("A renderização audiovisual demorou mais do que o esperado"));
            return;
          }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      const webm = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      if (!webm.size) throw new Error("A finalização não gerou arquivo");
      objectUrl = URL.createObjectURL(webm);

      setProgressText("Convertendo para MP4 e salvando na Biblioteca…");
      const form = new FormData();
      form.append("video", new File([webm], `final-${sourceAsset ? assetName(sourceAsset).replace(/\.[^.]+$/, "") : "video"}.webm`, { type: webm.type || "video/webm" }));
      form.append("removeSilence", "false");
      form.append("normalize", "true");
      form.append("loudnessTarget", "-14");
      form.append("speed", "1.0");
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/edit`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar a versão final");
      const finalUrl = await pollFinalJob(String(data.jobId));
      setResultUrl(finalUrl);
      setProgressText("Vídeo final com áudio salvo na Biblioteca.");
      const finalAsset = await findResultAssetId(finalUrl).catch(() => "");
      setResultAssetId(finalAsset);
      toast({ title: "Vídeo finalizado com som", description: "A nova versão foi salva sem alterar o vídeo original." });
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : "Falha ao finalizar vídeo");
      setProgressText("");
    } finally {
      try { voiceSource?.stop(); } catch { /* já encerrado */ }
      try { musicSource?.stop(); } catch { /* já encerrado */ }
      try { extraSource?.stop(); } catch { /* já encerrado */ }
      canvasStream?.getTracks().forEach((track) => track.stop());
      await audioContext?.close().catch(() => undefined);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setRendering(false);
    }
  };

  if (!requestedAssetId.current) return null;

  return (
    <section className="border-b bg-background px-4 py-5 md:px-6">
      <div className="mx-auto max-w-[1500px] rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              <WandSparkles className="h-4 w-4" /> Finalização audiovisual
            </div>
            <h2 className="mt-1 text-xl font-semibold">Roteiro, locução, música e mixagem</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              O vídeo original é preservado. Esta etapa cria uma nova versão com áudio e, se quiser, texto na tela.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {["1 · Roteiro", "2 · Locução", "3 · Música/áudio", "4 · Mix", "5 · Finalizar"].map((label) => (
              <span key={label} className="rounded-full border bg-muted/40 px-2.5 py-1 font-medium">{label}</span>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparando vídeo e Biblioteca de Mídias…</div>
        ) : loadError ? (
          <div className="p-5 text-sm text-destructive">{loadError}</div>
        ) : sourceAsset && sourcePreview ? (
          <div className="grid gap-5 p-5 xl:grid-cols-[330px_minmax(0,1fr)]">
            <div className="space-y-3">
              <video controls src={resultUrl || sourcePreview} className="w-full max-h-[520px] rounded-xl bg-black object-contain" />
              <div className="rounded-xl border bg-muted/25 p-3">
                <div className="flex items-center gap-2 text-sm font-medium"><Film className="h-4 w-4" /> {assetName(sourceAsset)}</div>
                <p className="mt-1 text-xs text-muted-foreground">{resultUrl ? "Prévia da nova versão final." : "Vídeo original da Biblioteca."}</p>
              </div>
              {resultUrl && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Vídeo com áudio pronto</div>
                  <p className="mt-1 text-xs text-muted-foreground">A versão final já foi salva na Biblioteca de Mídias.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {resultAssetId && (
                      <button onClick={() => navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(resultAssetId)}`)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
                        <Captions className="h-3.5 w-3.5" /> Abrir versão final no editor
                      </button>
                    )}
                    <button onClick={() => navigate("/midias")} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
                      <Library className="h-3.5 w-3.5" /> Ir para Biblioteca
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="flex items-center gap-2"><Type className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">1. Roteiro e texto</h3></div>
                  <p className="mt-1 text-xs text-muted-foreground">Escreva a fala da locução. Para títulos e cards avançados, use também a aba Texto do editor abaixo.</p>
                  <textarea
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    rows={5}
                    placeholder="Ex.: Sua equipe perde tempo procurando informações? O VendorAI reúne vendas, atendimento e inteligência em um só lugar…"
                    className="mt-3 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <label className="mt-3 flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={burnOverlay} onChange={(event) => setBurnOverlay(event.target.checked)} />
                    Adicionar texto na tela nesta finalização
                  </label>
                  {burnOverlay && (
                    <textarea
                      value={overlayText}
                      onChange={(event) => setOverlayText(event.target.value)}
                      rows={2}
                      placeholder="Texto curto para aparecer na parte inferior do vídeo"
                      className="mt-2 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                </div>

                <div className="rounded-xl border p-4">
                  <div className="flex items-center gap-2"><Mic2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">2. Locução</h3></div>
                  <p className="mt-1 text-xs text-muted-foreground">Use uma locução existente da Biblioteca ou gere uma nova com uma voz autorizada.</p>
                  <select value={selectedVoiceAssetId} onChange={(event) => setSelectedVoiceAssetId(event.target.value)} className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm">
                    <option value="">Sem locução</option>
                    {voiceAssets.map((asset) => <option key={asset.id} value={asset.id}>{assetName(asset)}</option>)}
                    {generatedVoice && !voiceAssets.some((asset) => asset.id === generatedVoice.assetId) && <option value={generatedVoice.assetId}>Locução IA recém-gerada</option>}
                  </select>

                  <div className="mt-3 rounded-lg bg-muted/35 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">Gerar locução IA</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px]", voiceWorkerReady ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
                        {voiceWorkerReady ? "Voz IA disponível" : "Worker de voz indisponível"}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <select value={identityId} onChange={(event) => setIdentityId(event.target.value)} className="rounded-lg border bg-background px-2 py-2 text-xs">
                        <option value="">Identidade</option>
                        {identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.display_name ?? identity.displayName ?? "Identidade"}</option>)}
                      </select>
                      <select value={voiceProfileId} onChange={(event) => setVoiceProfileId(event.target.value)} className="rounded-lg border bg-background px-2 py-2 text-xs">
                        <option value="">Perfil de voz</option>
                        {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name ?? "Voz"}</option>)}
                      </select>
                    </div>
                    <button
                      onClick={() => void generateVoice()}
                      disabled={!voiceWorkerReady || !script.trim() || !identityId || !voiceProfileId || voiceGenerating}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-45"
                    >
                      {voiceGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {voiceGenerating ? "Gerando locução…" : "Gerar locução a partir do roteiro"}
                    </button>
                    {!voiceWorkerReady && <p className="mt-2 text-[11px] text-muted-foreground">Enquanto a Voz IA não estiver pronta, selecione uma locução já salva na Biblioteca. A finalização continua funcionando normalmente.</p>}
                    {voiceError && <p className="mt-2 text-xs text-destructive">{voiceError}</p>}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="flex items-center gap-2"><Music2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">3. Música e áudio</h3></div>
                  <div className="mt-3 space-y-3">
                    <label className="block text-xs font-medium">Trilha musical
                      <select value={selectedMusicAssetId} onChange={(event) => setSelectedMusicAssetId(event.target.value)} className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm">
                        <option value="">Sem música</option>
                        {musicAssets.map((asset) => <option key={asset.id} value={asset.id}>{assetName(asset)}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-medium">Áudio extra / jingle / efeito
                      <select value={selectedExtraAssetId} onChange={(event) => setSelectedExtraAssetId(event.target.value)} className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm">
                        <option value="">Sem áudio extra</option>
                        {extraAssets.map((asset) => <option key={asset.id} value={asset.id}>{assetName(asset)}</option>)}
                      </select>
                    </label>
                    <div className="rounded-lg bg-muted/35 p-2.5 text-[11px] text-muted-foreground">
                      <AudioLines className="mr-1 inline h-3.5 w-3.5" /> A Biblioteca é a fonte oficial: músicas, locuções, jingles e efeitos podem ser reutilizados sem duplicar o arquivo.
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">4. Mixagem</h3></div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <RangeField label="Áudio original" value={originalVolume} onChange={setOriginalVolume} />
                    <RangeField label="Locução" value={voiceVolume} onChange={setVoiceVolume} />
                    <RangeField label="Música" value={musicVolume} onChange={setMusicVolume} />
                    <RangeField label="Áudio extra" value={extraVolume} onChange={setExtraVolume} />
                  </div>
                  <label className="mt-3 flex items-center gap-2 rounded-lg bg-muted/35 p-2.5 text-xs font-medium">
                    <input type="checkbox" checked={ducking} onChange={(event) => setDucking(event.target.checked)} />
                    Ducking automático: abaixar a música enquanto houver locução
                  </label>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold"><Volume2 className="h-4 w-4 text-primary" /> 5. Gerar versão final com som</div>
                    <p className="mt-1 text-xs text-muted-foreground">O original continua intacto. A nova versão será convertida para MP4 e registrada automaticamente na Biblioteca.</p>
                  </div>
                  <button
                    onClick={() => void finalizeVideo()}
                    disabled={rendering}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {rendering ? "Finalizando…" : "Finalizar vídeo com áudio"}
                  </button>
                </div>
                {progressText && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">{rendering && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}{progressText}</p>}
                {renderError && <p className="mt-3 text-xs text-destructive">{renderError}</p>}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
