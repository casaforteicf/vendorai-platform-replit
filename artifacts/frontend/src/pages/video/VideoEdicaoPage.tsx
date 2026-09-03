import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Scissors, Music2, Library, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoGenPanel from "@/components/video/VideoGenPanel";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type JobStatus = "idle" | "starting" | "processing" | "done" | "error";
type EditorTab = "edit" | "music";
type MusicSourceMode = "upload" | "library";

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

const EDIT_OPTIONS = [
  { id: "removeSilence", label: "Remover silêncios", desc: "Remove pausas e silêncios acima de 0.4s" },
  { id: "normalize", label: "Normalizar volume", desc: "Equaliza o áudio para -14 LUFS" },
];

const SPEED_OPTIONS = [
  { id: "1.0", label: "Normal (1x)" },
  { id: "1.1", label: "Ligeiramente mais rápido (1.1x)" },
  { id: "1.25", label: "Rápido (1.25x)" },
];

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-gray-300">{label}</span>
        <span className="text-xs tabular-nums text-purple-300">
          {value.toFixed(step < 1 ? 2 : 1)}{suffix ?? ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-purple-500"
      />
    </div>
  );
}

export default function VideoEdicaoPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  useToast();

  const [activeTab, setActiveTab] = useState<EditorTab>("edit");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const [musicSourceMode, setMusicSourceMode] = useState<MusicSourceMode>("upload");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const musicRef = useRef<HTMLInputElement>(null);
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
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

  const resetResult = () => {
    setJobStatus("idle");
    setResultUrl("");
    setErrorMsg("");
  };

  const loadTracks = async () => {
    if (!tenantId) return;
    setTracksLoading(true);
    setTracksError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/tracks?limit=80`, { headers: authHeader() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar trilhas");
      setTracks(Array.isArray(data.tracks) ? data.tracks : []);
    } catch (error) {
      setTracksError(error instanceof Error ? error.message : "Falha ao carregar trilhas");
    } finally {
      setTracksLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "music" && musicSourceMode === "library") void loadTracks();
  }, [activeTab, musicSourceMode, tenantId]);

  const pollJob = async (jobId: string) => {
    setJobStatus("processing");
    for (let i = 0; i < 180; i++) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: authHeader() });
      const data = await response.json();
      if (data.status === "done") {
        setResultUrl(data.videoUrl ?? "");
        setJobStatus("done");
        return;
      }
      if (data.status === "error") throw new Error(data.error ?? "Erro no processamento");
    }
    throw new Error("Timeout: processamento demorou mais de 12 min");
  };

  const handleAutomaticEdit = async () => {
    if (!videoFile || !tenantId) return;
    const form = new FormData();
    form.append("video", videoFile);
    form.append("removeSilence", String(opts.removeSilence ?? false));
    form.append("normalize", String(opts.normalize ?? false));
    form.append("speed", speed);

    const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/edit`, {
      method: "POST",
      headers: authHeader(),
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Falha ao iniciar processamento");
    await pollJob(data.jobId);
  };

  const handleMusicCompose = async () => {
    if (!videoFile || !tenantId) return;
    if (musicSourceMode === "upload" && !musicFile) return;
    if (musicSourceMode === "library" && !selectedTrackId) return;

    const form = new FormData();
    form.append("video", videoFile);
    if (musicSourceMode === "library") form.append("musicAssetId", selectedTrackId);
    else if (musicFile) form.append("music", musicFile);
    form.append("musicVolume", String(musicVolume));
    form.append("originalVolume", String(originalVolume));
    form.append("fadeIn", String(fadeIn));
    form.append("fadeOut", String(fadeOut));

    const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/compose`, {
      method: "POST",
      headers: authHeader(),
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Falha ao iniciar composição da trilha");
    await pollJob(data.jobId);
  };

  const handleGenerate = async (tabId: string) => {
    const operation = tabId === "music" ? "music" : "edit";
    setProcessingOperation(operation);
    setErrorMsg("");
    setResultUrl("");
    setJobStatus("starting");
    try {
      if (operation === "music") await handleMusicCompose();
      else await handleAutomaticEdit();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro desconhecido");
      setJobStatus("error");
    }
  };

  const isProcessing = jobStatus === "starting" || jobStatus === "processing";
  const hasMusicSelection = musicSourceMode === "library" ? Boolean(selectedTrackId) : Boolean(musicFile);
  const generateDisabled = !videoFile || isProcessing || (activeTab === "music" && !hasMusicSelection);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;

  const EditContent = (
    <div className="space-y-5 h-full flex flex-col">
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium mb-2">Edições automáticas</p>
        {EDIT_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={cn(
              "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
              opts[option.id] ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 hover:border-white/20",
            )}
          >
            <input
              type="checkbox"
              checked={!!opts[option.id]}
              onChange={() => toggleOpt(option.id)}
              className="mt-0.5 accent-emerald-500"
            />
            <div>
              <p className="text-sm text-gray-200 font-medium">{option.label}</p>
              <p className="text-xs text-gray-500">{option.desc}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium">Velocidade de fala</p>
        <div className="flex flex-col gap-1.5">
          {SPEED_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm",
                speed === option.id
                  ? "border-emerald-500/40 bg-emerald-500/5 text-gray-200"
                  : "border-white/10 text-gray-400 hover:border-white/20",
              )}
            >
              <input
                type="radio"
                name="speed"
                value={option.id}
                checked={speed === option.id}
                onChange={() => setSpeed(option.id)}
                className="accent-emerald-500"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const MusicContent = (
    <div className="space-y-4 h-full flex flex-col">
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">Origem da trilha</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => {
              setMusicSourceMode("upload");
              setSelectedTrackId("");
              resetResult();
            }}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-xs font-medium flex items-center justify-center gap-2 transition-all",
              musicSourceMode === "upload"
                ? "border-purple-500/40 bg-purple-500/10 text-purple-200"
                : "border-white/10 text-gray-400 hover:border-white/20",
            )}
          >
            <Upload className="h-3.5 w-3.5" />
            Enviar arquivo
          </button>
          <button
            type="button"
            onClick={() => {
              setMusicSourceMode("library");
              setMusicFile(null);
              resetResult();
            }}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-xs font-medium flex items-center justify-center gap-2 transition-all",
              musicSourceMode === "library"
                ? "border-purple-500/40 bg-purple-500/10 text-purple-200"
                : "border-white/10 text-gray-400 hover:border-white/20",
            )}
          >
            <Library className="h-3.5 w-3.5" />
            Biblioteca
          </button>
        </div>

        {musicSourceMode === "upload" ? (
          <>
            {musicFile ? (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-purple-500/15 text-purple-300 flex items-center justify-center shrink-0">
                    <Music2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-200 truncate">{musicFile.name}</p>
                    <p className="text-xs text-gray-500">{(musicFile.size / 1024 / 1024).toFixed(1)} MB · arquivo local</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMusicFile(null);
                      resetResult();
                      if (musicRef.current) musicRef.current.value = "";
                    }}
                    className="h-7 w-7 rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center"
                    aria-label="Remover trilha"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => musicRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-white/15 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all p-4 flex items-center gap-3 text-left"
              >
                <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center text-gray-500">
                  <Music2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-300">Escolher música</p>
                  <p className="text-xs text-gray-600">MP3, WAV, M4A ou outro áudio compatível</p>
                </div>
              </button>
            )}
            <input
              ref={musicRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setMusicFile(file);
                resetResult();
              }}
            />
            <p className="mt-2 text-[11px] text-amber-300/70">
              Arquivo local pode ser usado para rascunho. Os direitos serão validados antes de publicação/patrocínio.
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 font-medium">Biblioteca de trilhas</p>
              <button type="button" onClick={() => void loadTracks()} className="text-[11px] text-purple-300 hover:text-purple-200">
                Atualizar
              </button>
            </div>
            {tracksLoading ? (
              <div className="rounded-xl border border-white/10 p-4 flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando trilhas…
              </div>
            ) : tracksError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{tracksError}</div>
            ) : tracks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-gray-500">
                Nenhuma trilha cadastrada ainda. Cadastre músicas na Biblioteca Audiovisual com função “music” e seus direitos de uso.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {tracks.map((track) => {
                  const allowed = track.usage.organicAllowed;
                  const selected = selectedTrackId === track.id;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      disabled={!allowed}
                      onClick={() => {
                        setSelectedTrackId(track.id);
                        resetResult();
                      }}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-all",
                        selected
                          ? "border-purple-500/50 bg-purple-500/10"
                          : allowed
                            ? "border-white/10 hover:border-purple-500/30 hover:bg-white/[0.03]"
                            : "border-white/5 bg-white/[0.015] opacity-55 cursor-not-allowed",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={cn(
                          "mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                          allowed ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300",
                        )}>
                          {allowed ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-200 truncate">{track.original_filename ?? "Trilha sem nome"}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                            <span className={allowed ? "text-emerald-300" : "text-amber-300"}>
                              {allowed ? "Comercial liberado" : track.usage.expired ? "Licença expirada" : "Direitos pendentes/restritos"}
                            </span>
                            {allowed && (
                              <span className={track.usage.paidAdsAllowed ? "text-blue-300" : "text-gray-500"}>
                                · {track.usage.paidAdsAllowed ? "Ads liberado" : "Ads não liberado"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedTrack && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-200">
                Selecionada: {selectedTrack.original_filename ?? "Trilha"} · uso comercial liberado
                {selectedTrack.usage.paidAdsAllowed ? " · mídia paga liberada" : " · mídia paga ainda não liberada"}
              </div>
            )}
          </div>
        )}
      </div>

      <SliderField label="Volume da música" value={musicVolume} min={0} max={1} step={0.01} onChange={setMusicVolume} />
      <SliderField label="Volume do áudio original" value={originalVolume} min={0} max={2} step={0.05} onChange={setOriginalVolume} />

      <div className="grid grid-cols-2 gap-2">
        <SliderField label="Entrada suave" value={fadeIn} min={0} max={10} step={0.5} suffix="s" onChange={setFadeIn} />
        <SliderField label="Saída suave" value={fadeOut} min={0} max={10} step={0.5} suffix="s" onChange={setFadeOut} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs text-gray-500 space-y-1">
        <p>A trilha é repetida automaticamente até o fim do vídeo.</p>
        <p>O áudio original é preservado; a música abaixa automaticamente durante a fala.</p>
        <p>Trilhas da Biblioteca exibem a situação de uso comercial e mídia paga.</p>
      </div>
    </div>
  );

  const StatusBlock = (
    <div className="space-y-2">
      {isProcessing && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {jobStatus === "starting"
            ? processingOperation === "music" ? "Enviando vídeo e preparando trilha…" : "Enviando vídeo…"
            : processingOperation === "music" ? "Compondo trilha com ffmpeg…" : "Processando com ffmpeg…"}
        </div>
      )}
      {jobStatus === "done" && resultUrl && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {processingOperation === "music" ? "Vídeo com trilha pronto!" : "Vídeo editado pronto!"}
          </div>
          <video src={resultUrl} controls className="w-full rounded-xl border border-white/10 max-h-40" />
          <div className="flex gap-2">
            <a
              href={resultUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 text-gray-300 hover:border-emerald-500/50 transition-colors"
            >
              Baixar vídeo
            </a>
            <button
              onClick={resetResult}
              className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Fazer outra edição
            </button>
          </div>
        </div>
      )}
      {jobStatus === "error" && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-red-300">{errorMsg}</p>
            <button onClick={resetResult} className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const RightPanel = (
    <div className="h-full flex flex-col gap-4">
      <p className="text-xs text-gray-400 font-medium">Vídeo para editar</p>
      {videoPreview ? (
        <div className="relative">
          <video src={videoPreview} controls className="w-full rounded-xl border border-white/10 max-h-48" />
          <button
            onClick={() => {
              setVideoFile(null);
              setVideoPreview(null);
              resetResult();
              if (videoRef.current) videoRef.current.value = "";
            }}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
            aria-label="Remover vídeo"
          >
            <X className="h-3 w-3" />
          </button>
          <p className="mt-1.5 text-xs text-gray-500">
            {videoFile?.name} · {((videoFile?.size ?? 0) / 1024 / 1024).toFixed(1)} MB
          </p>
        </div>
      ) : (
        <button
          onClick={() => videoRef.current?.click()}
          className="flex flex-col items-center justify-center flex-1 rounded-xl border-2 border-dashed border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all gap-2 text-gray-500 py-10"
        >
          <Upload className="h-6 w-6" />
          <span className="text-sm font-medium">Clique para enviar vídeo</span>
          <span className="text-xs text-gray-600">MP4, MOV, AVI · até 500 MB</span>
        </button>
      )}
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setVideoFile(file);
          setVideoPreview(URL.createObjectURL(file));
          resetResult();
        }}
      />

      {StatusBlock}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5 mt-auto">
        <p className="text-xs text-gray-500 font-medium">Fluxo não destrutivo</p>
        <div className="space-y-1 text-xs text-gray-600">
          <p>✂️ Edição automática preserva o original</p>
          <p>🎵 A trilha gera uma nova versão do vídeo</p>
          <p>📚 Resultados ficam registrados na Biblioteca Audiovisual</p>
        </div>
      </div>
    </div>
  );

  return (
    <VideoGenPanel
      title="Editar vídeo"
      description="Faça ajustes automáticos e adicione trilha sonora sem alterar o arquivo original"
      icon={activeTab === "music" ? Music2 : Scissors}
      iconBg={activeTab === "music" ? "bg-purple-500/20 text-purple-300" : "bg-emerald-500/20 text-emerald-300"}
      tabs={[
        { id: "edit", label: "Edição automática", content: EditContent },
        { id: "music", label: "Trilha sonora", content: MusicContent },
      ]}
      rightPanel={RightPanel}
      onGenerate={handleGenerate}
      onTabChange={(tabId) => setActiveTab(tabId === "music" ? "music" : "edit")}
      generating={isProcessing}
      generateLabel={activeTab === "music" ? "Adicionar trilha" : "Editar vídeo"}
      generateDisabled={generateDisabled}
    />
  );
}
