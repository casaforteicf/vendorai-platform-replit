import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Clapperboard, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoGenPanel from "@/components/video/VideoGenPanel";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type JobStatus = "idle" | "starting" | "processing" | "done" | "error";

const DURATION_OPTIONS = [
  { id: "15",  label: "15 segundos", desc: "Stories / TikTok" },
  { id: "30",  label: "30 segundos", desc: "Reels curtos" },
  { id: "60",  label: "60 segundos", desc: "Reels padrão" },
  { id: "90",  label: "90 segundos", desc: "Vídeos médios" },
];

const MAX_CLIPS_OPTIONS = ["2", "3", "4", "6", "8"];

export default function VideoClipesPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const [clipDuration, setClipDuration] = useState("60");
  const [maxClips,     setMaxClips]     = useState("4");
  const [convert9x16,  setConvert9x16]  = useState(false);

  const [jobStatus,  setJobStatus]  = useState<JobStatus>("idle");
  const [clips,      setClips]      = useState<string[]>([]);
  const [progress,   setProgress]   = useState(0);
  const [total,      setTotal]      = useState(0);
  const [errorMsg,   setErrorMsg]   = useState("");

  const pollJob = async (jobId: string) => {
    setJobStatus("processing");
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: authHeader() });
      const d = await r.json();
      if (d.total) setTotal(d.total);
      if (d.progress != null) setProgress(d.progress);
      if (d.status === "done")  { setClips(d.clips ?? []); setJobStatus("done"); return; }
      if (d.status === "error") throw new Error(d.error ?? "Erro no processamento");
    }
    throw new Error("Timeout");
  };

  const handleGenerate = async () => {
    if (!videoFile || !tenantId) return;
    setErrorMsg(""); setClips([]); setProgress(0); setTotal(0); setJobStatus("starting");
    try {
      const form = new FormData();
      form.append("video",         videoFile);
      form.append("clipDuration",  clipDuration);
      form.append("maxClips",      maxClips);
      form.append("convertTo9x16", String(convert9x16));

      const r = await fetch(`/api/tenants/${tenantId}/content-studio/video/clips`, {
        method: "POST", headers: authHeader(), body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao iniciar");
      await pollJob(d.jobId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setJobStatus("error");
    }
  };

  const isProcessing = jobStatus === "starting" || jobStatus === "processing";

  const LeftContent = (
    <div className="space-y-4 h-full flex flex-col">
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">Duração de cada clipe</p>
        <div className="grid grid-cols-2 gap-2">
          {DURATION_OPTIONS.map((d) => (
            <button key={d.id} onClick={() => setClipDuration(d.id)}
              className={cn(
                "p-2.5 rounded-xl border text-left transition-all",
                clipDuration === d.id ? "border-rose-500/40 bg-rose-500/5" : "border-white/10 hover:border-white/20"
              )}>
              <p className="text-sm font-medium text-gray-200">{d.label}</p>
              <p className="text-xs text-gray-500">{d.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">Máx. de clipes</p>
        <div className="flex gap-2">
          {MAX_CLIPS_OPTIONS.map((n) => (
            <button key={n} onClick={() => setMaxClips(n)}
              className={cn(
                "flex-1 py-2 rounded-xl border text-sm font-semibold transition-all",
                maxClips === n ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-white/10 text-gray-400 hover:border-white/20"
              )}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className={cn(
        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
        convert9x16 ? "border-rose-500/40 bg-rose-500/5" : "border-white/10 hover:border-white/20"
      )}>
        <input type="checkbox" checked={convert9x16} onChange={(e) => setConvert9x16(e.target.checked)} className="mt-0.5 accent-rose-500" />
        <div>
          <p className="text-sm text-gray-200 font-medium">Converter para 9:16 (vertical)</p>
          <p className="text-xs text-gray-500">Ideal para Reels, Stories e TikTok</p>
        </div>
      </label>

      <div className="mt-auto space-y-2">
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {jobStatus === "starting" ? "Enviando…" : `Gerando clipe ${progress}/${total}…`}
            </div>
            {total > 0 && (
              <div className="flex gap-1">
                {Array.from({ length: total }).map((_, i) => (
                  <div key={i} className={cn("h-1 flex-1 rounded-full transition-all", i < progress ? "bg-rose-500" : "bg-white/10")} />
                ))}
              </div>
            )}
          </div>
        )}
        {jobStatus === "error" && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-red-300">{errorMsg}</p>
              <button onClick={() => setJobStatus("idle")} className="text-xs text-gray-400 hover:text-gray-200">Tentar novamente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const RightPanel = (
    <div className="h-full flex flex-col gap-4">
      <p className="text-xs text-gray-400 font-medium">Vídeo original</p>
      {videoPreview ? (
        <div className="relative">
          <video src={videoPreview} controls className="w-full rounded-xl border border-white/10 max-h-40" />
          <button onClick={() => { setVideoFile(null); setVideoPreview(null); setJobStatus("idle"); setClips([]); if (videoRef.current) videoRef.current.value = ""; }}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
            <X className="h-3 w-3" />
          </button>
          <p className="mt-1 text-xs text-gray-500">{videoFile?.name}</p>
        </div>
      ) : (
        <button onClick={() => videoRef.current?.click()}
          className="flex flex-col items-center justify-center flex-1 rounded-xl border-2 border-dashed border-white/10 hover:border-rose-500/40 hover:bg-rose-500/5 transition-all gap-2 text-gray-500 py-8">
          <Upload className="h-6 w-6" />
          <span className="text-sm font-medium">Clique para enviar vídeo</span>
          <span className="text-xs text-gray-600">MP4, MOV · até 500 MB</span>
        </button>
      )}
      <input ref={videoRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setVideoFile(f); setVideoPreview(URL.createObjectURL(f)); setJobStatus("idle"); setClips([]); }} />

      {jobStatus === "done" && clips.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-rose-300 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4" /> {clips.length} clipes prontos!
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {clips.map((url, i) => (
              <div key={url} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <video src={url} controls className="w-full max-h-28" />
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-xs text-gray-400">Clipe {i + 1}</span>
                  <a href={url} download target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
                    <Download className="h-3 w-3" /> Baixar
                  </a>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setJobStatus("idle"); setClips([]); }}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Gerar novos clipes
          </button>
        </div>
      )}
    </div>
  );

  return (
    <VideoGenPanel
      title="Clipes automáticos"
      description="Divida vídeos longos em clipes curtos otimizados para Reels e Stories"
      icon={Clapperboard}
      iconBg="bg-rose-500/20 text-rose-300"
      tabs={[{ id: "clips", label: "Configurações de clipe", content: LeftContent }]}
      rightPanel={RightPanel}
      onGenerate={handleGenerate}
      generating={isProcessing}
      generateLabel="Gerar clipes"
      generateDisabled={!videoFile || isProcessing}
    />
  );
}
