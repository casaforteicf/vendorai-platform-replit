import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Captions } from "lucide-react";
import VideoGenPanel from "@/components/video/VideoGenPanel";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type JobStatus = "idle" | "starting" | "processing" | "done" | "error";

export default function VideoLegendaPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [errorMsg,  setErrorMsg]  = useState("");

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

      const r = await fetch(`/api/tenants/${tenantId}/content-studio/video/caption`, {
        method: "POST", headers: authHeader(), body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao iniciar processamento");
      await pollJob(d.jobId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setJobStatus("error");
      toast({ title: "Erro ao legendar", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  };

  const isProcessing = jobStatus === "starting" || jobStatus === "processing";

  const LeftContent = (
    <div className="space-y-5 h-full flex flex-col">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1.5">
        <p className="text-xs text-gray-500 font-medium">Como funciona</p>
        <div className="space-y-1 text-xs text-gray-600">
          <p>🎙 Transcreve a fala do vídeo automaticamente</p>
          <p>✍️ Quebra em blocos curtos, no ritmo de leitura de Reels</p>
          <p>🔥 Queima a legenda no vídeo — pronto pra postar</p>
        </div>
      </div>

      {/* Status / result */}
      <div className="mt-auto space-y-2">
        {isProcessing && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-300">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {jobStatus === "starting" ? "Enviando vídeo…" : "Transcrevendo e legendando…"}
          </div>
        )}
        {jobStatus === "done" && resultUrl && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" /> Vídeo legendado pronto!
            </div>
            <video src={resultUrl} controls className="w-full rounded-xl border border-white/10 max-h-40" />
            <div className="flex gap-2">
              <a href={resultUrl} download target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 text-gray-300 hover:border-emerald-500/50 transition-colors">
                Baixar vídeo
              </a>
              <button onClick={() => { setJobStatus("idle"); setResultUrl(""); }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors">
                Legendar outro
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
      <p className="text-xs text-gray-400 font-medium">Vídeo para legendar</p>
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
    </div>
  );

  return (
    <VideoGenPanel
      title="Legendagem automática"
      description="Suba um vídeo gravado e a IA transcreve e queima a legenda, no ritmo de leitura de Reels"
      icon={Captions}
      iconBg="bg-cyan-500/20 text-cyan-300"
      tabs={[{ id: "caption", label: "Vídeo", content: LeftContent }]}
      rightPanel={RightPanel}
      onGenerate={handleGenerate}
      generating={isProcessing}
      generateLabel="Legendar vídeo"
      generateDisabled={!videoFile || isProcessing}
    />
  );
}
