import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoGenPanel from "@/components/video/VideoGenPanel";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type JobStatus = "idle" | "starting" | "processing" | "done" | "error";

const EDIT_OPTIONS = [
  { id: "removeSilence", label: "Remover silêncios",      desc: "Remove pausas e silêncios acima de 0.4s" },
  { id: "normalize",     label: "Normalizar volume",      desc: "Equaliza o áudio para -14 LUFS" },
];

const SPEED_OPTIONS = [
  { id: "1.0", label: "Normal (1x)"     },
  { id: "1.1", label: "Ligeiramente mais rápido (1.1x)" },
  { id: "1.25", label: "Rápido (1.25x)" },
];

export default function VideoEdicaoPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const [opts, setOpts]     = useState<Record<string, boolean>>({ removeSilence: true, normalize: false });
  const [speed, setSpeed]   = useState("1.0");

  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [errorMsg,  setErrorMsg]  = useState("");

  const toggleOpt = (id: string) => setOpts((o) => ({ ...o, [id]: !o[id] }));

  const pollJob = async (jobId: string) => {
    setJobStatus("processing");
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const r = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: authHeader() });
      const d = await r.json();
      if (d.status === "done")  { setResultUrl(d.videoUrl ?? ""); setJobStatus("done"); return; }
      if (d.status === "error") throw new Error(d.error ?? "Erro no processamento");
    }
    throw new Error("Timeout: processamento demorou mais de 12 min");
  };

  const handleGenerate = async () => {
    if (!videoFile || !tenantId) return;
    setErrorMsg(""); setResultUrl(""); setJobStatus("starting");
    try {
      const form = new FormData();
      form.append("video", videoFile);
      form.append("removeSilence", String(opts.removeSilence ?? false));
      form.append("normalize",     String(opts.normalize    ?? false));
      form.append("speed",         speed);

      const r = await fetch(`/api/tenants/${tenantId}/content-studio/video/edit`, {
        method: "POST", headers: authHeader(), body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao iniciar processamento");
      await pollJob(d.jobId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setJobStatus("error");
    }
  };

  const isProcessing = jobStatus === "starting" || jobStatus === "processing";

  const LeftContent = (
    <div className="space-y-5 h-full flex flex-col">
      {/* Options */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium mb-2">Edições automáticas</p>
        {EDIT_OPTIONS.map((opt) => (
          <label key={opt.id} className={cn(
            "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
            opts[opt.id] ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 hover:border-white/20"
          )}>
            <input type="checkbox" checked={!!opts[opt.id]} onChange={() => toggleOpt(opt.id)} className="mt-0.5 accent-emerald-500" />
            <div>
              <p className="text-sm text-gray-200 font-medium">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Speed */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-medium">Velocidade de fala</p>
        <div className="flex flex-col gap-1.5">
          {SPEED_OPTIONS.map((s) => (
            <label key={s.id} className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all text-sm",
              speed === s.id ? "border-emerald-500/40 bg-emerald-500/5 text-gray-200" : "border-white/10 text-gray-400 hover:border-white/20"
            )}>
              <input type="radio" name="speed" value={s.id} checked={speed === s.id} onChange={() => setSpeed(s.id)} className="accent-emerald-500" />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      {/* Status / result */}
      <div className="mt-auto space-y-2">
        {isProcessing && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {jobStatus === "starting" ? "Enviando vídeo…" : "Processando com ffmpeg…"}
          </div>
        )}
        {jobStatus === "done" && resultUrl && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" /> Vídeo editado pronto!
            </div>
            <video src={resultUrl} controls className="w-full rounded-xl border border-white/10 max-h-40" />
            <div className="flex gap-2">
              <a href={resultUrl} download target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 text-gray-300 hover:border-emerald-500/50 transition-colors">
                Baixar vídeo
              </a>
              <button onClick={() => { setJobStatus("idle"); setResultUrl(""); }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors">
                Editar outro
              </button>
            </div>
          </div>
        )}
        {jobStatus === "error" && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-red-300">{errorMsg}</p>
              <button onClick={() => setJobStatus("idle")} className="text-xs text-gray-400 hover:text-gray-200 transition-colors">Tentar novamente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const RightPanel = (
    <div className="h-full flex flex-col gap-4">
      <p className="text-xs text-gray-400 font-medium">Vídeo para editar</p>
      {videoPreview ? (
        <div className="relative">
          <video src={videoPreview} controls className="w-full rounded-xl border border-white/10 max-h-48" />
          <button
            onClick={() => { setVideoFile(null); setVideoPreview(null); setJobStatus("idle"); setResultUrl(""); if (videoRef.current) videoRef.current.value = ""; }}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
            <X className="h-3 w-3" />
          </button>
          <p className="mt-1.5 text-xs text-gray-500">{videoFile?.name} · {((videoFile?.size ?? 0) / 1024 / 1024).toFixed(1)} MB</p>
        </div>
      ) : (
        <button onClick={() => videoRef.current?.click()}
          className="flex flex-col items-center justify-center flex-1 rounded-xl border-2 border-dashed border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all gap-2 text-gray-500 py-10">
          <Upload className="h-6 w-6" />
          <span className="text-sm font-medium">Clique para enviar vídeo</span>
          <span className="text-xs text-gray-600">MP4, MOV, AVI · até 500 MB</span>
        </button>
      )}
      <input ref={videoRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setVideoFile(f); setVideoPreview(URL.createObjectURL(f)); setJobStatus("idle"); setResultUrl(""); }} />

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5">
        <p className="text-xs text-gray-500 font-medium">Resultados típicos</p>
        <div className="space-y-1 text-xs text-gray-600">
          <p>✂️ Remove 20–40% do tempo de silêncios</p>
          <p>🎙 Normaliza volume para distribuição</p>
          <p>⚡ Processa em ~30s por minuto de vídeo</p>
        </div>
      </div>
    </div>
  );

  return (
    <VideoGenPanel
      title="Edição automática"
      description="Remova silêncios, normalize volume e acelere seu vídeo automaticamente"
      icon={Scissors}
      iconBg="bg-emerald-500/20 text-emerald-300"
      tabs={[{ id: "edit", label: "Configurações de edição", content: LeftContent }]}
      rightPanel={RightPanel}
      onGenerate={handleGenerate}
      generating={isProcessing}
      generateLabel="Editar vídeo"
      generateDisabled={!videoFile || isProcessing}
    />
  );
}
