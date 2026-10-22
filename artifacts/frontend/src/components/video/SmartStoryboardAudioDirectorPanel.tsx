import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioLines, CheckCircle2, Gauge, Library, Loader2, Mic2, Music2, RefreshCw, Sparkles, Volume2, WandSparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DESIGN_PLAN_KEY, SMART_STORYBOARD_MANIFEST_KEY } from "./smart-storyboard";
import { assetLabel, assetUrl, audioKind, mediaUrl, type ProfessionalMediaAsset } from "./professional-video";

const AUDIO_DIRECTION_KEY = "vendorai_storyboard_audio_direction_v1";

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
  workers?: { voice?: { ready?: boolean; configured?: boolean } };
  capabilities?: Record<string, string>;
};

type MasterManifest = {
  tenantId: string;
  directionName?: string;
  designScore?: number;
  targetFormat?: string;
  scenes?: Array<{ headline?: string }>;
  master?: {
    assetId: string;
    projectId: string;
    url: string;
    durationSeconds: number;
    transition?: string;
    transitionDuration?: number;
    renderedAt?: string;
  };
  audioMaster?: {
    assetId: string;
    url: string;
    renderedAt: string;
    musicAssetId?: string | null;
    extraAssetId?: string | null;
    voiceAssetId?: string | null;
    direction?: string;
    loudnessTarget?: number;
  };
  [key: string]: unknown;
};

type StoredDesign = {
  tenantId?: string;
  brief?: {
    product?: string;
    headline?: string;
    supportingText?: string;
    cta?: string;
    channel?: string;
    directionId?: string;
  };
  plan?: {
    directionName?: string;
    scenes?: Array<Record<string, unknown>>;
  };
};

type AudioDirection = {
  direction: string;
  energy: "low" | "medium" | "high";
  script: string;
  musicAssetId: string;
  extraAssetId: string;
  musicScore: number;
  extraScore: number;
  originalVolume: number;
  voiceVolume: number;
  musicVolume: number;
  extraVolume: number;
  ducking: boolean;
  moodKeywords: string[];
  generatedAt: string;
};

type JobPayload = { status?: string; videoUrl?: string; error?: string };

type FinalResult = { assetId: string; url: string };

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function assetMetadata(asset: ProfessionalMediaAsset): Record<string, unknown> {
  return asRecord(asset.metadata);
}

function assetHaystack(asset: ProfessionalMediaAsset): string {
  const meta = assetMetadata(asset);
  return normalize([
    assetLabel(asset),
    meta.category,
    meta.tags,
    meta.mood,
    meta.genre,
    meta.style,
    meta.energy,
    meta.description,
    meta.title,
    meta.brandUse,
    meta.musicBrandUse,
  ].filter(Boolean).join(" "));
}

function directionProfile(direction: string) {
  const key = normalize(direction);
  if (key.includes("impact") || key.includes("performance") || key.includes("bold")) {
    return { energy: "high" as const, music: 24, extra: 46, original: 32, keywords: ["energetic", "energy", "upbeat", "impact", "punch", "dynamic", "fast", "modern", "promo", "beat"] };
  }
  if (key.includes("premium") || key.includes("editorial") || key.includes("luxury") || key.includes("arquitet")) {
    return { energy: "low" as const, music: 16, extra: 26, original: 38, keywords: ["premium", "luxury", "elegant", "cinematic", "ambient", "minimal", "soft", "refined", "architecture", "editorial"] };
  }
  if (key.includes("tech") || key.includes("modern")) {
    return { energy: "medium" as const, music: 20, extra: 38, original: 34, keywords: ["tech", "electronic", "future", "modern", "digital", "pulse", "clean", "innovation", "corporate"] };
  }
  if (key.includes("authority") || key.includes("minimal")) {
    return { energy: "low" as const, music: 15, extra: 24, original: 42, keywords: ["corporate", "inspiring", "minimal", "clean", "calm", "trust", "authority", "soft", "ambient"] };
  }
  if (key.includes("product") || key.includes("clean")) {
    return { energy: "medium" as const, music: 19, extra: 34, original: 36, keywords: ["product", "clean", "modern", "corporate", "light", "positive", "demo", "fresh", "minimal"] };
  }
  return { energy: "medium" as const, music: 20, extra: 34, original: 36, keywords: ["modern", "clean", "professional", "positive", "corporate", "ambient"] };
}

function scoreAsset(asset: ProfessionalMediaAsset, keywords: string[], kindBoost: string[]) {
  const haystack = assetHaystack(asset);
  let score = 20;
  for (const word of keywords) if (haystack.includes(normalize(word))) score += 9;
  const kind = audioKind(asset);
  if (kindBoost.includes(kind)) score += 28;
  const meta = assetMetadata(asset);
  const rights = asRecord(meta.rights);
  if (rights.status === "approved" || rights.commercialUse === true || rights.commercial_use === true) score += 8;
  if (asset.source === "upload" || asset.source === "imported") score += 4;
  return Math.max(0, Math.min(100, score));
}

function bestAsset(assets: ProfessionalMediaAsset[], keywords: string[], allowedKinds: string[]) {
  return assets
    .filter((asset) => asset.type === "audio" && allowedKinds.includes(audioKind(asset)))
    .map((asset) => ({ asset, score: scoreAsset(asset, keywords, allowedKinds) }))
    .sort((a, b) => b.score - a.score || assetLabel(a.asset).localeCompare(assetLabel(b.asset)))[0] ?? null;
}

function buildScript(design: StoredDesign | null, manifest: MasterManifest | null) {
  const sceneRows = Array.isArray(design?.plan?.scenes) ? design!.plan!.scenes! : [];
  const chunks = sceneRows.flatMap((scene) => {
    const row = asRecord(scene);
    return [row.headline, row.supportingText ?? row.supporting ?? row.body, row.cta]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
  });
  if (!chunks.length) {
    chunks.push(...(manifest?.scenes ?? []).map((scene) => String(scene.headline ?? "").trim()).filter(Boolean));
  }
  const cta = String(design?.brief?.cta ?? "").trim();
  if (cta && !chunks.includes(cta)) chunks.push(cta);
  return Array.from(new Set(chunks)).join(". ").replace(/\.\s*\./g, ".").trim();
}

function storagePath(raw: string) {
  if (!raw) return "";
  try {
    const pathname = new URL(raw, window.location.origin).pathname;
    return pathname.startsWith("/api/storage") ? pathname.slice("/api/storage".length) : pathname;
  } catch {
    return raw.replace(/^\/api\/storage/, "");
  }
}

function supportedMimeType() {
  const values = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return values.find((value) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(value)) ?? "video/webm";
}

async function waitVideo(video: HTMLVideoElement) {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return;
  await new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Não foi possível abrir o Master para a finalização sonora.")); };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("loadedmetadata", ok);
    video.addEventListener("error", fail);
    video.load();
  });
}

export default function SmartStoryboardAudioDirectorPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [manifest, setManifest] = useState<MasterManifest | null>(null);
  const [design, setDesign] = useState<StoredDesign | null>(null);
  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [identityId, setIdentityId] = useState("");
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("Direção sonora pronta");
  const [result, setResult] = useState<FinalResult | null>(null);

  const refreshStored = useCallback(() => {
    if (!tenantId) return;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(SMART_STORYBOARD_MANIFEST_KEY) ?? "null") as MasterManifest | null;
      setManifest(parsed?.tenantId === tenantId ? parsed : null);
    } catch { setManifest(null); }
    try {
      const parsed = JSON.parse(sessionStorage.getItem(DESIGN_PLAN_KEY) ?? "null") as StoredDesign | null;
      setDesign(parsed?.tenantId === tenantId ? parsed : null);
    } catch { setDesign(null); }
  }, [tenantId]);

  useEffect(() => {
    refreshStored();
    const timer = window.setInterval(refreshStored, 1200);
    return () => window.clearInterval(timer);
  }, [refreshStored]);

  const master = manifest?.master ?? null;

  const load = useCallback(async () => {
    if (!tenantId || !master?.assetId) return;
    setLoading(true);
    try {
      const [audioRes, capRes, identitiesRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=audio&limit=500`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media-engine/capabilities`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media-engine/identities`, { headers: authHeaders() }),
      ]);
      const [audioData, capData, identitiesData] = await Promise.all([
        audioRes.json().catch(() => ({})), capRes.json().catch(() => ({})), identitiesRes.json().catch(() => ({})),
      ]);
      if (audioRes.ok) setAssets(Array.isArray(audioData.assets) ? audioData.assets as ProfessionalMediaAsset[] : []);
      if (capRes.ok) setCapabilities(capData as Capabilities);
      const rows = identitiesRes.ok && Array.isArray(identitiesData.identities) ? identitiesData.identities as Identity[] : [];
      setIdentities(rows);
      const preferred = rows.find((item) => item.status === "active") ?? rows[0];
      if (preferred) setIdentityId((current) => current || preferred.id);
    } catch (error) {
      toast({ title: "Audio Director indisponível", description: error instanceof Error ? error.message : "Falha ao preparar áudio", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [master?.assetId, tenantId, toast]);

  useEffect(() => { void load(); }, [load]);

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
        if (!response.ok || cancelled) return;
        const ready = (Array.isArray(data.voices) ? data.voices : []).filter((voice: VoiceProfile) => voice.status === "ready") as VoiceProfile[];
        setVoices(ready);
        setVoiceProfileId((current) => ready.some((voice) => voice.id === current) ? current : (ready[0]?.id ?? ""));
      } catch {
        if (!cancelled) { setVoices([]); setVoiceProfileId(""); }
      }
    })();
    return () => { cancelled = true; };
  }, [identityId, tenantId]);

  const direction = useMemo<AudioDirection | null>(() => {
    if (!master) return null;
    const directionName = String(design?.plan?.directionName ?? manifest?.directionName ?? design?.brief?.directionId ?? "Professional");
    const profile = directionProfile(directionName);
    const music = bestAsset(assets, profile.keywords, ["music"]);
    const extras = profile.energy === "high"
      ? ["sound_effect", "jingle", "sonic_identity"]
      : ["jingle", "sonic_identity", "sound_effect"];
    const extra = bestAsset(assets, [...profile.keywords, profile.energy === "high" ? "whoosh hit impact" : "logo brand sonic"], extras);
    return {
      direction: directionName,
      energy: profile.energy,
      script: buildScript(design, manifest),
      musicAssetId: music?.asset.id ?? "",
      extraAssetId: extra?.asset.id ?? "",
      musicScore: music?.score ?? 0,
      extraScore: extra?.score ?? 0,
      originalVolume: profile.original,
      voiceVolume: 100,
      musicVolume: profile.music,
      extraVolume: profile.extra,
      ducking: true,
      moodKeywords: profile.keywords,
      generatedAt: new Date().toISOString(),
    };
  }, [assets, design, manifest, master]);

  useEffect(() => {
    if (!tenantId || !direction || !master) return;
    sessionStorage.setItem(AUDIO_DIRECTION_KEY, JSON.stringify({ version: 1, tenantId, masterAssetId: master.assetId, ...direction }));
  }, [direction, master, tenantId]);

  const selectedMusic = useMemo(() => assets.find((asset) => asset.id === direction?.musicAssetId) ?? null, [assets, direction?.musicAssetId]);
  const selectedExtra = useMemo(() => assets.find((asset) => asset.id === direction?.extraAssetId) ?? null, [assets, direction?.extraAssetId]);
  const voiceReady = capabilities?.workers?.voice?.ready === true
    || capabilities?.capabilities?.voice_synthesize === "ready"
    || capabilities?.capabilities?.voice_clone === "ready";

  const fetchAudioBuffer = async (ctx: AudioContext, url: string) => {
    const response = await fetch(url, { headers: url.startsWith("/api/") ? authHeaders() : undefined });
    if (!response.ok) throw new Error("Não foi possível carregar uma das trilhas selecionadas.");
    return await ctx.decodeAudioData(await response.arrayBuffer());
  };

  const pollFinalJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({})) as JobPayload;
      if (data.status === "done" && data.videoUrl) return mediaUrl(data.videoUrl);
      if (data.status === "error") throw new Error(data.error ?? "Falha ao converter o Master final.");
      setStage("Normalizando loudness e salvando MP4…");
      setProgress((current) => Math.max(current, 92));
    }
    throw new Error("A finalização excedeu o tempo esperado.");
  };

  const findAssetId = async (url: string) => {
    const response = await fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=500`, { headers: authHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return "";
    const expected = storagePath(url);
    const found = (Array.isArray(data.assets) ? data.assets : []).find((asset: ProfessionalMediaAsset) => storagePath(asset.storageUrl ?? asset.storage_url ?? "") === expected) as ProfessionalMediaAsset | undefined;
    return found?.id ?? "";
  };

  const synthesizeVoice = async () => {
    if (!voiceReady || !identityId || !voiceProfileId || !direction?.script.trim()) return null;
    setStage("Gerando locução com voz autorizada…");
    const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}/voices/${voiceProfileId}/synthesize`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ text: direction.script, language: "pt-br", title: `Locução automática · ${direction.direction}` }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.code === "VOICE_CONSENT_REQUIRED") throw new Error("A voz escolhida precisa de consentimento antes da geração por IA.");
      throw new Error(data.error ?? "Não foi possível gerar a locução automática.");
    }
    const assetId = String(data.assetId ?? "");
    const url = mediaUrl(String(data.audioUrl ?? ""));
    return assetId && url ? { assetId, url } : null;
  };

  const finalizeAutomatically = async () => {
    if (!tenantId || !master || !direction || processing) return;
    if (!direction.musicAssetId && !direction.extraAssetId && !voiceReady) {
      toast({ title: "Biblioteca sonora insuficiente", description: "Adicione uma trilha, jingle/SFX ou habilite Voz IA antes de produzir automaticamente." });
      return;
    }

    setProcessing(true);
    setResult(null);
    setProgress(2);
    let audioContext: AudioContext | null = null;
    let canvasStream: MediaStream | null = null;
    let voiceSource: AudioBufferSourceNode | null = null;
    let musicSource: AudioBufferSourceNode | null = null;
    let extraSource: AudioBufferSourceNode | null = null;
    let sourceObjectUrl = "";
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("Este navegador não suporta a finalização audiovisual local.");
      setStage("Preparando Master e direção sonora…");
      const masterUrl = mediaUrl(master.url);
      const masterResponse = await fetch(masterUrl, { headers: masterUrl.startsWith("/api/") ? authHeaders() : undefined });
      if (!masterResponse.ok) throw new Error("Não foi possível carregar o Master do storyboard.");
      sourceObjectUrl = URL.createObjectURL(await masterResponse.blob());

      const video = document.createElement("video");
      video.src = sourceObjectUrl;
      video.preload = "auto";
      video.playsInline = true;
      await waitVideo(video);
      const duration = Number(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("O Master não possui duração válida.");

      const naturalWidth = Math.max(2, video.videoWidth || 720);
      const naturalHeight = Math.max(2, video.videoHeight || 1280);
      const scale = Math.min(1, 1280 / Math.max(naturalWidth, naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, Math.round(naturalWidth * scale));
      canvas.height = Math.max(2, Math.round(naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("O navegador não liberou o compositor visual.");
      canvasStream = canvas.captureStream(30);

      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("O navegador não liberou o motor de áudio.");
      audioContext = new AudioContextCtor();
      const destination = audioContext.createMediaStreamDestination();
      const videoSource = audioContext.createMediaElementSource(video);
      const originalGain = audioContext.createGain();
      originalGain.gain.value = direction.originalVolume / 100;
      videoSource.connect(originalGain).connect(destination);

      const generatedVoice = await synthesizeVoice();
      let voiceAnalyser: AnalyserNode | null = null;
      let voiceSamples: Float32Array<ArrayBuffer> | null = null;
      if (generatedVoice?.url) {
        const voiceBuffer = await fetchAudioBuffer(audioContext, generatedVoice.url);
        voiceSource = audioContext.createBufferSource();
        voiceSource.buffer = voiceBuffer;
        const voiceGain = audioContext.createGain();
        voiceGain.gain.value = direction.voiceVolume / 100;
        voiceAnalyser = audioContext.createAnalyser();
        voiceAnalyser.fftSize = 512;
        voiceSamples = new Float32Array(voiceAnalyser.fftSize);
        voiceSource.connect(voiceGain).connect(voiceAnalyser).connect(destination);
      }

      let musicGain: GainNode | null = null;
      if (selectedMusic) {
        const musicBuffer = await fetchAudioBuffer(audioContext, assetUrl(selectedMusic));
        musicSource = audioContext.createBufferSource();
        musicSource.buffer = musicBuffer;
        musicSource.loop = true;
        musicGain = audioContext.createGain();
        musicGain.gain.value = direction.musicVolume / 100;
        musicSource.connect(musicGain).connect(destination);
      }

      if (selectedExtra) {
        const extraBuffer = await fetchAudioBuffer(audioContext, assetUrl(selectedExtra));
        extraSource = audioContext.createBufferSource();
        extraSource.buffer = extraBuffer;
        const extraGain = audioContext.createGain();
        extraGain.gain.value = direction.extraVolume / 100;
        extraSource.connect(extraGain).connect(destination);
      }

      const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(outputStream, { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Falha durante a mixagem automática."));
      });

      const drawFrame = () => ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      await audioContext.resume();
      recorder.start(600);
      const now = audioContext.currentTime;
      voiceSource?.start(now);
      musicSource?.start(now);
      if (musicSource) musicSource.stop(now + duration);
      extraSource?.start(now);
      drawFrame();
      await video.play();
      setStage("Mixando locução, trilha, SFX e áudio original…");
      setProgress(12);

      await new Promise<void>((resolve, reject) => {
        const started = performance.now();
        const loop = () => {
          drawFrame();
          if (musicGain && direction.ducking && voiceAnalyser && voiceSamples) {
            voiceAnalyser.getFloatTimeDomainData(voiceSamples);
            let sum = 0;
            for (const sample of voiceSamples) sum += sample * sample;
            const rms = Math.sqrt(sum / Math.max(1, voiceSamples.length));
            const base = direction.musicVolume / 100;
            musicGain.gain.setTargetAtTime(rms > 0.02 ? base * 0.28 : base, audioContext!.currentTime, rms > 0.02 ? 0.04 : 0.22);
          }
          const pct = Math.min(88, 12 + Math.round((video.currentTime / duration) * 76));
          setProgress(pct);
          if (video.ended || video.currentTime >= duration - 0.03) { resolve(); return; }
          if (performance.now() - started > (duration + 20) * 1000) { reject(new Error("A mixagem demorou mais do que o esperado.")); return; }
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      const webm = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      if (!webm.size) throw new Error("A mixagem terminou sem gerar arquivo.");

      setStage("Normalizando loudness em -14 LUFS…");
      setProgress(90);
      const form = new FormData();
      form.append("video", new File([webm], `storyboard-master-audio-${Date.now()}.webm`, { type: webm.type || "video/webm" }));
      form.append("removeSilence", "false");
      form.append("normalize", "true");
      form.append("loudnessTarget", "-14");
      form.append("speed", "1.0");
      const editRes = await fetch(`/api/tenants/${tenantId}/content-studio/video/edit`, { method: "POST", headers: authHeaders(), body: form });
      const editData = await editRes.json().catch(() => ({}));
      if (!editRes.ok || !editData.jobId) throw new Error(editData.error ?? "Não foi possível salvar o Master com áudio.");
      const finalUrl = await pollFinalJob(String(editData.jobId));
      const finalAssetId = await findAssetId(finalUrl);
      const nextManifest: MasterManifest = {
        ...manifest!,
        audioMaster: {
          assetId: finalAssetId,
          url: finalUrl,
          renderedAt: new Date().toISOString(),
          musicAssetId: direction.musicAssetId || null,
          extraAssetId: direction.extraAssetId || null,
          voiceAssetId: generatedVoice?.assetId ?? null,
          direction: direction.direction,
          loudnessTarget: -14,
        },
      };
      sessionStorage.setItem(SMART_STORYBOARD_MANIFEST_KEY, JSON.stringify(nextManifest));
      setManifest(nextManifest);
      setResult({ assetId: finalAssetId, url: finalUrl });
      setProgress(100);
      setStage("Master audiovisual final pronto");

      if (master.projectId) {
        const projectRes = await fetch(`/api/tenants/${tenantId}/media/projects/${master.projectId}`, { headers: authHeaders(), cache: "no-store" });
        const projectData = await projectRes.json().catch(() => ({}));
        const currentContext = asRecord(projectData?.project?.context);
        await fetch(`/api/tenants/${tenantId}/media/projects/${master.projectId}`, {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ context: { ...currentContext, audioDirection: direction, audioMaster: nextManifest.audioMaster } }),
        }).catch(() => undefined);
      }
      toast({ title: "Master audiovisual pronto", description: "Locução, trilha, efeito, ducking e loudness foram finalizados automaticamente, sem alterar as cenas originais." });
    } catch (error) {
      setStage("Finalização automática não concluída");
      toast({ title: "Não foi possível finalizar automaticamente", description: error instanceof Error ? error.message : "Falha desconhecida", variant: "destructive" });
    } finally {
      try { voiceSource?.stop(); } catch {}
      try { musicSource?.stop(); } catch {}
      try { extraSource?.stop(); } catch {}
      canvasStream?.getTracks().forEach((track) => track.stop());
      await audioContext?.close().catch(() => undefined);
      if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
      setProcessing(false);
    }
  };

  if (!tenantId || !master) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/20 bg-card shadow-sm" data-testid="smart-storyboard-audio-director">
      <div className="border-b border-border bg-gradient-to-r from-violet-500/[0.09] via-card to-card px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><AudioLines className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Audio Director</h2><span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">mix inteligente</span></div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Lê a direção de arte e o roteiro do storyboard, escolhe automaticamente a trilha e o jingle/SFX mais adequados da Biblioteca, define intensidade, volumes, ducking e gera locução com uma voz autorizada quando o tenant possui Voz IA pronta.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} disabled={loading || processing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-40">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Reanalisar áudio</button>
            <button type="button" onClick={() => void finalizeAutomatically()} disabled={!direction || processing || loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40">{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}{processing ? `${stage} ${progress}%` : "Finalizar áudio automaticamente"}</button>
          </div>
        </div>
      </div>

      {direction && (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4 sm:p-5">
          <div className="rounded-2xl border border-border bg-background/55 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Gauge className="h-4 w-4 text-violet-500" />Direção sonora</div>
            <p className="mt-2 text-sm font-semibold text-foreground">{direction.direction}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Energia {direction.energy === "high" ? "alta" : direction.energy === "low" ? "baixa/refinada" : "média"}</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/55 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Music2 className="h-4 w-4 text-violet-500" />Trilha escolhida</div>
            <p className="mt-2 truncate text-sm font-semibold text-foreground">{selectedMusic ? assetLabel(selectedMusic) : "Sem trilha compatível"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Match {direction.musicScore}/100 · volume {direction.musicVolume}%</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/55 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-4 w-4 text-violet-500" />Jingle / SFX</div>
            <p className="mt-2 truncate text-sm font-semibold text-foreground">{selectedExtra ? assetLabel(selectedExtra) : "Sem efeito compatível"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Match {direction.extraScore}/100 · volume {direction.extraVolume}%</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/55 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Mic2 className="h-4 w-4 text-violet-500" />Locução e mix</div>
            <p className="mt-2 text-sm font-semibold text-foreground">{voiceReady && identityId && voiceProfileId ? "Voz autorizada pronta" : "Locução automática indisponível"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Ducking {direction.ducking ? "ativo" : "inativo"} · áudio original {direction.originalVolume}%</p>
          </div>
        </div>
      )}

      {direction?.script && (
        <div className="mx-4 mb-4 rounded-2xl border border-border bg-muted/20 p-3 sm:mx-5 sm:mb-5">
          <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Roteiro de locução</span><span className="text-[10px] text-muted-foreground">{direction.script.length} caracteres</span></div>
          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-foreground/85">{direction.script}</p>
        </div>
      )}

      {processing && (
        <div className="mx-4 mb-4 sm:mx-5 sm:mb-5">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>{stage}</span><span>{progress}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      {(result || manifest?.audioMaster) && (
        <div className="mx-4 mb-4 flex flex-col gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:mx-5 sm:mb-5 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Master audiovisual final pronto</div><p className="mt-1 text-xs text-muted-foreground">Versão final normalizada em -14 LUFS e salva na Biblioteca. As pranchetas e o Master visual permanecem editáveis.</p></div>
          <div className="flex flex-wrap gap-2">
            {(result?.assetId || manifest?.audioMaster?.assetId) && <button type="button" onClick={() => navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(result?.assetId || manifest?.audioMaster?.assetId || "")}`)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted"><Volume2 className="h-3.5 w-3.5" />Abrir versão final</button>}
            <button type="button" onClick={() => navigate("/midias")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted"><Library className="h-3.5 w-3.5" />Biblioteca</button>
          </div>
        </div>
      )}

      <div className={cn("border-t border-border px-4 py-3 text-[11px] text-muted-foreground sm:px-5", voiceReady ? "bg-emerald-500/[0.03]" : "bg-amber-500/[0.03]")}>{voiceReady ? "Voz IA disponível: o Audio Director usa o perfil ativo e uma voz pronta do tenant, respeitando consentimentos." : "Se Voz IA estiver indisponível, o Audio Director ainda finaliza trilha, SFX/jingle, áudio original, ducking disponível e loudness; a locução pode ser adicionada manualmente no estúdio abaixo."}</div>
    </section>
  );
}
