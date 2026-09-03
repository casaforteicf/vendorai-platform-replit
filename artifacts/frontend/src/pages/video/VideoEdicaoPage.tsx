import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Scissors, Music2, Library, ShieldCheck, ShieldAlert, Sparkles, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoGenPanel from "@/components/video/VideoGenPanel";
import AiMusicGenerator from "@/components/video/AiMusicGenerator";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberSetting(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mediaUrl(storageUrl: string): string {
  return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl;
}

type JobStatus = "idle" | "starting" | "processing" | "done" | "error";
type EditorTab = "edit" | "music";
type MusicSourceMode = "brand" | "upload" | "library" | "ai";

type MediaAsset = {
  id: string;
  type: string;
  storageUrl: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

interface LibraryTrack {
  id: string;
  original_filename?: string | null;
  created_at?: string | null;
  rights: {
    status: "pending" | "cleared" | "restricted";
    origin: string;
    commercialUse: boolean;
    paidAds: boolean;
    territories: string[];
    expiresAt: string | null;
  };
  usage: {
    expired: boolean;
    organicAllowed: boolean;
    paidAdsAllowed: boolean;
    reasons: string[];
  };
}

interface BrandKitPayload {
  brandKit?: {
    default_music_asset_id?: string | null;
    audio_config?: Record<string, unknown> | null;
  } | null;
}

const EDIT_OPTIONS = [
  { id: "removeSilence", label: "Remover silêncios", desc: "Remove pausas e silêncios acima de 0.4s" },
  { id: "normalize", label: "Normalizar volume", desc: "Equaliza o áudio para -14 LUFS" },
];

const SPEED_OPTIONS = [
  { id: "1.0", label: "Normal (1x)" },
  { id: "1.1", label: "Ligeiramente mais rápido (1.1x)" },
  { id: "1.25", label: "Rápido (1.25x)" },
];

function SliderField({ label, value, min, max, step, suffix, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-gray-300">{label}</span>
      <span className="text-xs tabular-nums text-purple-300">{value.toFixed(step < 1 ? 2 : 1)}{suffix ?? ""}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-purple-500" />
  </div>;
}

export default function VideoEdicaoPage() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const requestedMediaAssetId = new URLSearchParams(window.location.search).get("mediaAssetId") ?? "";

  const [activeTab, setActiveTab] = useState<EditorTab>("edit");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [sourceMediaAssetId, setSourceMediaAssetId] = useState("");
  const [libraryVideoLoading, setLibraryVideoLoading] = useState(false);
  const [libraryVideoError, setLibraryVideoError] = useState("");
  const videoRef = useRef<HTMLInputElement>(null);

  const [musicSourceMode, setMusicSourceMode] = useState<MusicSourceMode>("brand");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [brandKitLoading, setBrandKitLoading] = useState(false);
  const [brandKitError, setBrandKitError] = useState("");
  const [brandDefaultMusicAssetId, setBrandDefaultMusicAssetId] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.18);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [fadeIn, setFadeIn] = useState(1);
  const [fadeOut, setFadeOut] = useState(1.5);

  const [opts, setOpts] = useState<Record<string, boolean>>({ removeSilence: true, normalize: false });
  const [speed, setSpeed] = useState("1.0");
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [processingOperation, setProcessingOperation] = useState<EditorTab>("edit");

  const toggleOpt = (id: string) => setOpts((current) => ({ ...current, [id]: !current[id] }));
  const resetResult = () => { setJobStatus("idle"); setResultUrl(""); setErrorMsg(""); };

  const loadBrandKit = async () => {
    if (!tenantId) return;
    setBrandKitLoading(true); setBrandKitError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, { headers: authHeader() });
      const data = await response.json() as BrandKitPayload & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar Brand Video Kit");
      const kit = data.brandKit ?? null;
      const audioConfig = asRecord(kit?.audio_config);
      setBrandDefaultMusicAssetId(kit?.default_music_asset_id ?? "");
      setMusicVolume(numberSetting(audioConfig["musicVolume"], 0.18));
      setOriginalVolume(numberSetting(audioConfig["originalVolume"], 1));
      setFadeIn(numberSetting(audioConfig["fadeIn"], 1));
      setFadeOut(numberSetting(audioConfig["fadeOut"], 1.5));
    } catch (error) {
      setBrandKitError(error instanceof Error ? error.message : "Falha ao carregar Brand Video Kit");
      setBrandDefaultMusicAssetId("");
    } finally { setBrandKitLoading(false); }
  };

  const loadTracks = async () => {
    if (!tenantId) return;
    setTracksLoading(true); setTracksError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/tracks?limit=80`, { headers: authHeader() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar trilhas");
      setTracks(Array.isArray(data.tracks) ? data.tracks : []);
    } catch (error) {
      setTracksError(error instanceof Error ? error.message : "Falha ao carregar trilhas");
    } finally { setTracksLoading(false); }
  };

  useEffect(() => { void loadBrandKit(); }, [tenantId]);
  useEffect(() => {
    if (activeTab === "music" && (musicSourceMode === "library" || musicSourceMode === "brand")) void loadTracks();
  }, [activeTab, musicSourceMode, tenantId]);

  useEffect(() => {
    if (!tenantId || !requestedMediaAssetId) return;
    let cancelled = false;
    let objectUrl = "";

    const loadLibraryVideo = async () => {
      setLibraryVideoLoading(true); setLibraryVideoError("");
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=150`, { headers: authHeader() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Falha ao abrir vídeo da Biblioteca");
        const asset = (Array.isArray(data.assets) ? data.assets : []).find((item: MediaAsset) => item.id === requestedMediaAssetId) as MediaAsset | undefined;
        if (!asset || asset.type !== "video") throw new Error("Vídeo não encontrado na Biblioteca deste tenant");

        const fileResponse = await fetch(mediaUrl(asset.storageUrl), { headers: authHeader() });
        if (!fileResponse.ok) throw new Error("Não foi possível carregar o arquivo de vídeo");
        const blob = await fileResponse.blob();
        const file = new File([blob], asset.originalFilename || "video-biblioteca.mp4", { type: asset.mimeType || blob.type || "video/mp4" });
        objectUrl = URL.createObjectURL(file);
        if (cancelled) { URL.revokeObjectURL(objectUrl); return; }
        setVideoFile(file);
        setVideoPreview(objectUrl);
        setSourceMediaAssetId(asset.id);
        resetResult();
        toast({ title: "Vídeo carregado da Biblioteca", description: asset.originalFilename || "Pronto para editar." });
      } catch (error) {
        if (!cancelled) setLibraryVideoError(error instanceof Error ? error.message : "Falha ao carregar vídeo da Biblioteca");
      } finally {
        if (!cancelled) setLibraryVideoLoading(false);
      }
    };

    void loadLibraryVideo();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [tenantId, requestedMediaAssetId]);

  const pollJob = async (jobId: string) => {
    setJobStatus("processing");
    for (let i = 0; i < 180; i++) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: authHeader() });
      const data = await response.json();
      if (data.status === "done") { setResultUrl(data.videoUrl ?? ""); setJobStatus("done"); return; }
      if (data.status === "error") throw new Error(data.error ?? "Erro no processamento");
    }
    throw new Error("Timeout: processamento demorou mais de 12 min");
  };

  const handleAutomaticEdit = async () => {
    if (!videoFile || !tenantId) return;
    const form = new FormData();
    form.append("video", videoFile);
    if (sourceMediaAssetId) form.append("sourceMediaAssetId", sourceMediaAssetId);
    form.append("removeSilence", String(opts.removeSilence ?? false));
    form.append("normalize", String(opts.normalize ?? false));
    form.append("speed", speed);
    const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/edit`, { method: "POST", headers: authHeader(), body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Falha ao iniciar processamento");
    await pollJob(data.jobId);
  };

  const handleMusicCompose = async () => {
    if (!videoFile || !tenantId) return;
    if (musicSourceMode === "brand" && !brandDefaultMusicAssetId) return;
    if (musicSourceMode === "upload" && !musicFile) return;
    if (musicSourceMode === "library" && !selectedTrackId) return;
    if (musicSourceMode === "ai") return;
    const form = new FormData();
    form.append("video", videoFile);
    if (sourceMediaAssetId) form.append("sourceMediaAssetId", sourceMediaAssetId);
    if (musicSourceMode === "library") form.append("musicAssetId", selectedTrackId);
    else if (musicSourceMode === "upload" && musicFile) form.append("music", musicFile);
    form.append("musicVolume", String(musicVolume));
    form.append("originalVolume", String(originalVolume));
    form.append("fadeIn", String(fadeIn));
    form.append("fadeOut", String(fadeOut));
    const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/compose`, { method: "POST", headers: authHeader(), body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Falha ao iniciar composição da trilha");
    await pollJob(data.jobId);
  };

  const handleGenerate = async (tabId: string) => {
    const operation = tabId === "music" ? "music" : "edit";
    setProcessingOperation(operation); setErrorMsg(""); setResultUrl(""); setJobStatus("starting");
    try { if (operation === "music") await handleMusicCompose(); else await handleAutomaticEdit(); }
    catch (error) { setErrorMsg(error instanceof Error ? error.message : "Erro desconhecido"); setJobStatus("error"); }
  };

  const handleAiTrackGenerated = async (assetId: string) => {
    await loadTracks(); setSelectedTrackId(assetId); setMusicFile(null); setMusicSourceMode("library"); resetResult();
  };

  const isProcessing = jobStatus === "starting" || jobStatus === "processing";
  const hasMusicSelection = musicSourceMode === "brand" ? Boolean(brandDefaultMusicAssetId) : musicSourceMode === "library" ? Boolean(selectedTrackId) : musicSourceMode === "upload" ? Boolean(musicFile) : false;
  const generateDisabled = !videoFile || isProcessing || brandKitLoading || libraryVideoLoading || (activeTab === "music" && !hasMusicSelection);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;
  const brandDefaultTrack = tracks.find((track) => track.id === brandDefaultMusicAssetId) ?? null;

  const EditContent = <div className="space-y-5 h-full flex flex-col">
    <div className="space-y-2"><p className="text-xs text-gray-400 font-medium mb-2">Edições automáticas</p>{EDIT_OPTIONS.map((option) => <label key={option.id} className={cn("flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all", opts[option.id] ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 hover:border-white/20")}><input type="checkbox" checked={!!opts[option.id]} onChange={() => toggleOpt(option.id)} className="mt-0.5 accent-emerald-500" /><div><p className="text-sm text-gray-200 font-medium">{option.label}</p><p className="text-xs text-gray-500">{option.desc}</p></div></label>)}</div>
    <div className="space-y-2"><p className="text-xs text-gray-400 font-medium">Velocidade de fala</p><div className="flex flex-col gap-1.5">{SPEED_OPTIONS.map((option) => <label key={option.id} className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm", speed === option.id ? "border-emerald-500/40 bg-emerald-500/5 text-gray-200" : "border-white/10 text-gray-400 hover:border-white/20")}><input type="radio" name="speed" value={option.id} checked={speed === option.id} onChange={() => setSpeed(option.id)} className="accent-emerald-500" />{option.label}</label>)}</div></div>
  </div>;

  const MusicContent = <div className="space-y-4 h-full flex flex-col">
    <div>
      <p className="text-xs text-gray-400 font-medium mb-2">Origem da trilha</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <button type="button" onClick={() => { setMusicSourceMode("brand"); setMusicFile(null); setSelectedTrackId(""); resetResult(); void loadBrandKit(); }} className={cn("rounded-xl border px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5", musicSourceMode === "brand" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-gray-400")}><ShieldCheck className="h-3.5 w-3.5" /> Padrão da marca</button>
        <button type="button" onClick={() => { setMusicSourceMode("library"); setMusicFile(null); resetResult(); }} className={cn("rounded-xl border px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5", musicSourceMode === "library" ? "border-purple-500/40 bg-purple-500/10 text-purple-200" : "border-white/10 text-gray-400")}><Library className="h-3.5 w-3.5" /> Biblioteca</button>
        <button type="button" onClick={() => { setMusicSourceMode("upload"); setSelectedTrackId(""); resetResult(); }} className={cn("rounded-xl border px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5", musicSourceMode === "upload" ? "border-purple-500/40 bg-purple-500/10 text-purple-200" : "border-white/10 text-gray-400")}><Upload className="h-3.5 w-3.5" /> Enviar</button>
        <button type="button" onClick={() => { setMusicSourceMode("ai"); setMusicFile(null); setSelectedTrackId(""); resetResult(); }} className={cn("rounded-xl border px-2 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5", musicSourceMode === "ai" ? "border-purple-500/40 bg-purple-500/10 text-purple-200" : "border-white/10 text-gray-400")}><Sparkles className="h-3.5 w-3.5" /> Gerar IA</button>
      </div>

      {musicSourceMode === "brand" ? <div className="space-y-2">{brandKitLoading ? <div className="rounded-xl border border-white/10 p-4 flex items-center gap-2 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando padrão da marca…</div> : brandKitError ? <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{brandKitError}</div> : brandDefaultMusicAssetId ? <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3"><p className="text-xs font-semibold text-emerald-200">Brand Video Kit ativo</p><p className="text-xs text-gray-300 truncate mt-0.5">{brandDefaultTrack?.original_filename ?? "Trilha padrão configurada"}</p><p className="text-[10px] text-gray-500 mt-1">Logo, B-roll, intro/outro e parâmetros de áudio continuam aplicados pelo Media Engine.</p></div> : <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">Nenhuma trilha padrão configurada.</div>}</div>
      : musicSourceMode === "upload" ? <><button type="button" onClick={() => musicRef.current?.click()} className="w-full rounded-xl border border-dashed border-white/15 p-4 flex items-center gap-3 text-left"><Music2 className="h-4 w-4" /><div><p className="text-sm font-medium text-gray-300">{musicFile?.name ?? "Escolher música"}</p><p className="text-xs text-gray-600">MP3, WAV, M4A ou outro áudio compatível</p></div></button><input ref={musicRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setMusicFile(file); resetResult(); }} /><p className="mt-2 text-[11px] text-amber-300/70">Direitos serão validados antes da publicação/patrocínio.</p></>
      : musicSourceMode === "library" ? <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs text-gray-400 font-medium">Biblioteca de trilhas</p><button type="button" onClick={() => void loadTracks()} className="text-[11px] text-purple-300">Atualizar</button></div>{tracksLoading ? <div className="rounded-xl border border-white/10 p-4 text-xs text-gray-400">Carregando trilhas…</div> : tracksError ? <div className="rounded-xl border border-red-500/20 p-3 text-xs text-red-300">{tracksError}</div> : <div className="space-y-2 max-h-52 overflow-y-auto">{tracks.map((track) => { const allowed = track.usage.organicAllowed; const selected = selectedTrackId === track.id; return <button key={track.id} type="button" disabled={!allowed} onClick={() => { setSelectedTrackId(track.id); resetResult(); }} className={cn("w-full rounded-xl border p-3 text-left", selected ? "border-purple-500/50 bg-purple-500/10" : allowed ? "border-white/10" : "border-white/5 opacity-55")}><div className="flex items-start gap-2.5">{allowed ? <ShieldCheck className="h-4 w-4 text-emerald-300" /> : <ShieldAlert className="h-4 w-4 text-amber-300" />}<div className="min-w-0"><p className="text-xs font-medium text-gray-200 truncate">{track.original_filename ?? "Trilha sem nome"}</p><p className="text-[10px] text-gray-500">{allowed ? `Comercial liberado${track.usage.paidAdsAllowed ? " · Ads liberado" : ""}` : "Direitos pendentes/restritos"}</p></div></div></button>; })}</div>}{selectedTrack && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-200">Selecionada: {selectedTrack.original_filename ?? "Trilha"}</div>}</div>
      : <AiMusicGenerator tenantId={tenantId} onGenerated={handleAiTrackGenerated} />}
    </div>
    <SliderField label="Volume da música" value={musicVolume} min={0} max={1} step={0.01} onChange={setMusicVolume} />
    <SliderField label="Volume do áudio original" value={originalVolume} min={0} max={2} step={0.05} onChange={setOriginalVolume} />
    <div className="grid grid-cols-2 gap-2"><SliderField label="Entrada suave" value={fadeIn} min={0} max={10} step={0.5} suffix="s" onChange={setFadeIn} /><SliderField label="Saída suave" value={fadeOut} min={0} max={10} step={0.5} suffix="s" onChange={setFadeOut} /></div>
  </div>;

  const StatusBlock = <div className="space-y-2">
    {isProcessing && <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300"><Loader2 className="h-4 w-4 animate-spin" />{jobStatus === "starting" ? "Enviando vídeo…" : processingOperation === "music" ? "Compondo trilha…" : "Processando…"}</div>}
    {jobStatus === "done" && resultUrl && <div className="space-y-2"><div className="flex items-center gap-2 text-emerald-400 text-sm font-medium"><CheckCircle2 className="h-4 w-4" />{processingOperation === "music" ? "Vídeo com trilha pronto!" : "Vídeo editado pronto!"}</div><video src={resultUrl} controls className="w-full rounded-xl border border-white/10 max-h-40" /><div className="flex gap-2"><a href={resultUrl} download target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 text-gray-300">Baixar vídeo</a><button onClick={resetResult} className="px-3 py-1.5 rounded-lg text-xs text-gray-400">Fazer outra edição</button></div></div>}
    {jobStatus === "error" && <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20"><AlertCircle className="h-4 w-4 text-red-400" /><div><p className="text-sm text-red-300">{errorMsg}</p><button onClick={resetResult} className="text-xs text-gray-400">Tentar novamente</button></div></div>}
  </div>;

  const RightPanel = <div className="h-full flex flex-col gap-4">
    <div className="flex items-center justify-between gap-2"><p className="text-xs text-gray-400 font-medium">Vídeo para editar</p>{sourceMediaAssetId && <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200"><Library className="h-3 w-3" /> Biblioteca</span>}</div>
    {libraryVideoLoading ? <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 text-sm text-cyan-200"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando vídeo da Biblioteca…</div>
    : libraryVideoError ? <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">{libraryVideoError}</div>
    : videoPreview ? <div className="relative"><video src={videoPreview} controls className="w-full rounded-xl border border-white/10 max-h-48" /><button onClick={() => { if (videoPreview.startsWith("blob:")) URL.revokeObjectURL(videoPreview); setVideoFile(null); setVideoPreview(null); setSourceMediaAssetId(""); resetResult(); if (videoRef.current) videoRef.current.value = ""; }} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center" aria-label="Remover vídeo"><X className="h-3 w-3" /></button><p className="mt-1.5 text-xs text-gray-500">{videoFile?.name} · {((videoFile?.size ?? 0) / 1024 / 1024).toFixed(1)} MB</p></div>
    : <button onClick={() => videoRef.current?.click()} className="flex flex-col items-center justify-center flex-1 rounded-xl border-2 border-dashed border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all gap-2 text-gray-500 py-10"><Upload className="h-6 w-6" /><span className="text-sm font-medium">Clique para enviar vídeo</span><span className="text-xs text-gray-600">MP4, MOV, AVI · até 500 MB</span></button>}
    <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (videoPreview?.startsWith("blob:")) URL.revokeObjectURL(videoPreview); setVideoFile(file); setVideoPreview(URL.createObjectURL(file)); setSourceMediaAssetId(""); resetResult(); }} />
    {StatusBlock}
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5 mt-auto"><p className="text-xs text-gray-500 font-medium">Fluxo não destrutivo</p><div className="space-y-1 text-xs text-gray-600"><p>✂️ Edição automática preserva o original</p><p>🎵 A trilha gera uma nova versão do vídeo</p><p>📚 Resultados ficam registrados na Biblioteca Audiovisual</p>{sourceMediaAssetId && <p className="flex items-center gap-1 text-cyan-300"><Film className="h-3 w-3" /> Origem: asset oficial da Biblioteca</p>}</div></div>
  </div>;

  return <VideoGenPanel
    title="Editar vídeo"
    description="Faça ajustes automáticos e adicione trilha sonora sem alterar o arquivo original"
    icon={activeTab === "music" ? Music2 : Scissors}
    iconBg={activeTab === "music" ? "bg-purple-500/20 text-purple-300" : "bg-emerald-500/20 text-emerald-300"}
    tabs={[{ id: "edit", label: "Edição automática", content: EditContent }, { id: "music", label: "Trilha sonora", content: MusicContent }]}
    rightPanel={RightPanel}
    onGenerate={handleGenerate}
    onTabChange={(tabId) => setActiveTab(tabId === "music" ? "music" : "edit")}
    generating={isProcessing}
    generateLabel={activeTab === "music" ? musicSourceMode === "brand" ? "Aplicar padrão da marca" : "Adicionar trilha" : "Editar vídeo"}
    generateDisabled={generateDisabled}
  />;
}
