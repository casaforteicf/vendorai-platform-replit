import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, CheckCircle2, AlertCircle, LayoutGrid, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoGenPanel, { type VoiceOption } from "@/components/video/VideoGenPanel";
import { useEffect } from "react";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type JobStatus = "idle" | "starting" | "running" | "done" | "error";
type ItemStatus = "pending" | "generating" | "done" | "error";

interface BatchItem { name: string; topic: string }
interface BatchResult { name: string; status: ItemStatus; videoUrl?: string; error?: string }

export default function VideoLotePage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voice,  setVoice]  = useState("pt-BR-FranciscaNeural");
  const [quality, setQuality] = useState<"720p" | "1080p">("720p");

  const [avatarId,   setAvatarId]   = useState("");
  const [autoScript, setAutoScript] = useState(true);

  const [items, setItems] = useState<BatchItem[]>([
    { name: "", topic: "" },
    { name: "", topic: "" },
    { name: "", topic: "" },
  ]);

  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [results,   setResults]   = useState<BatchResult[]>([]);
  const [progress,  setProgress]  = useState(0);
  const [total,     setTotal]     = useState(0);
  const [errorMsg,  setErrorMsg]  = useState("");

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/tenants/${tenantId}/content-studio/heygen/voices`, { headers: authHeader() })
      .then((r) => r.json()).then((d) => { if (d.voices) setVoices(d.voices); }).catch(() => {});
  }, [tenantId]);

  const validItems = items.filter((it) => it.name.trim() && it.topic.trim());

  const pollJob = async (jobId: string) => {
    setJobStatus("running");
    for (let i = 0; i < 360; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const r = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: authHeader() });
      const d = await r.json();
      if (d.total)     setTotal(d.total);
      if (d.progress != null) setProgress(d.progress);
      if (d.results)   setResults(d.results as BatchResult[]);
      if (d.status === "done" || d.status === "error") {
        setJobStatus(d.status);
        if (d.status === "error" && !d.results?.some((r: BatchResult) => r.status === "done")) {
          setErrorMsg(d.error ?? "Erro no lote");
        }
        return;
      }
    }
    throw new Error("Timeout");
  };

  const handleGenerate = async () => {
    if (!validItems.length || !avatarId.trim() || !tenantId) return;
    setErrorMsg(""); setResults([]); setProgress(0); setTotal(0); setJobStatus("starting");
    try {
      const r = await fetch(`/api/tenants/${tenantId}/content-studio/video/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ items: validItems, avatarId: avatarId.trim(), voiceId: voice, quality, autoScript }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao iniciar lote");
      await pollJob(d.jobId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setJobStatus("error");
    }
  };

  const isProcessing = jobStatus === "starting" || jobStatus === "running";

  const updateItem = (i: number, field: keyof BatchItem, value: string) => {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems((prev) => [...prev, { name: "", topic: "" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const ITEM_STATUS_ICON: Record<ItemStatus, string> = {
    pending: "⏳", generating: "🔄", done: "✅", error: "❌",
  };

  const LeftContent = (
    <div className="space-y-4 h-full flex flex-col">
      {/* Avatar ID */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 font-medium">ID do avatar HeyGen</label>
        <input
          value={avatarId}
          onChange={(e) => setAvatarId(e.target.value)}
          placeholder="Ex: Anna_public_3_20240108 ou seu avatar customizado"
          className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-600 px-3 py-2.5 focus:outline-none focus:border-blue-500/50"
        />
        <p className="text-xs text-gray-600">Encontre em <strong>heygen.com → Avatar Library</strong> ou use um avatar criado com "Avatar falando"</p>
      </div>

      {/* Auto-script toggle */}
      <label className={cn(
        "flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all",
        autoScript ? "border-blue-500/40 bg-blue-500/5" : "border-white/10 hover:border-white/20"
      )}>
        <input type="checkbox" checked={autoScript} onChange={(e) => setAutoScript(e.target.checked)} className="mt-0.5 accent-blue-500" />
        <div>
          <p className="text-sm text-gray-200 font-medium">Gerar roteiro automático com IA</p>
          <p className="text-xs text-gray-500">Cria um script personalizado de 30s para cada lead a partir do tópico informado</p>
        </div>
      </label>

      {/* Status / results */}
      <div className="mt-auto space-y-2">
        {isProcessing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {jobStatus === "starting" ? "Iniciando lote…" : `Gerando vídeo ${progress}/${total}…`}
            </div>
            {total > 0 && (
              <div className="flex gap-1">
                {Array.from({ length: total }).map((_, i) => (
                  <div key={i} className={cn("h-1 flex-1 rounded-full transition-all", i < progress ? "bg-blue-500" : "bg-white/10")} />
                ))}
              </div>
            )}
          </div>
        )}
        {(jobStatus === "done" || (jobStatus === "error" && results.length > 0)) && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">
              <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400 mr-1" />
              {results.filter((r) => r.status === "done").length} de {results.length} vídeos gerados
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1.5">
              {results.map((r) => (
                <div key={r.name} className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-xl border text-xs",
                  r.status === "done"  ? "border-emerald-500/20 bg-emerald-500/5" :
                  r.status === "error" ? "border-red-500/20 bg-red-500/5" :
                  "border-white/10 bg-white/5"
                )}>
                  <span className="text-gray-300 font-medium">{ITEM_STATUS_ICON[r.status]} {r.name}</span>
                  {r.status === "done" && r.videoUrl && (
                    <a href={r.videoUrl} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors">Ver vídeo</a>
                  )}
                  {r.status === "error" && <span className="text-red-400 truncate max-w-[120px]">{r.error}</span>}
                </div>
              ))}
            </div>
            <button onClick={() => { setJobStatus("idle"); setResults([]); }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              Novo lote
            </button>
          </div>
        )}
        {jobStatus === "error" && !results.length && (
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
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">Lista de leads ({validItems.length} válidos)</p>
        <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-80">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1.5">
              <input
                value={it.name}
                onChange={(e) => updateItem(i, "name", e.target.value)}
                placeholder={`Nome do lead ${i + 1}`}
                className="w-full rounded-lg bg-white/5 border border-white/10 text-xs text-[#e8e4f8] placeholder-gray-600 px-2.5 py-2 focus:outline-none focus:border-blue-500/50"
              />
              <input
                value={it.topic}
                onChange={(e) => updateItem(i, "topic", e.target.value)}
                placeholder={autoScript ? "Tópico / produto (IA gera o roteiro)" : "Roteiro completo"}
                className="w-full rounded-lg bg-white/5 border border-white/10 text-xs text-[#e8e4f8] placeholder-gray-600 px-2.5 py-2 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <button onClick={() => removeItem(i)} disabled={items.length <= 1}
              className="mt-2 text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
        <p className="text-xs text-gray-500 font-medium">Limites</p>
        <p className="text-xs text-gray-600">⚡ Máx. 20 vídeos por lote</p>
        <p className="text-xs text-gray-600">⏱ ~3–5 min por vídeo (HeyGen)</p>
        <p className="text-xs text-gray-600">🔑 Requer HEYGEN_API_KEY configurada</p>
      </div>
    </div>
  );

  return (
    <VideoGenPanel
      title="Vídeo em lote"
      description="Gere vídeos personalizados para múltiplos leads de uma só vez"
      icon={LayoutGrid}
      iconBg="bg-blue-500/20 text-blue-300"
      tabs={[{ id: "batch", label: "Configurações do lote", content: LeftContent }]}
      rightPanel={RightPanel}
      voices={voices}
      voice={voice}
      onVoiceChange={setVoice}
      quality={quality}
      onQualityChange={setQuality}
      onGenerate={handleGenerate}
      generating={isProcessing}
      generateLabel={`Gerar ${validItems.length} vídeo${validItems.length !== 1 ? "s" : ""}`}
      generateDisabled={!validItems.length || !avatarId.trim() || isProcessing}
    />
  );
}
