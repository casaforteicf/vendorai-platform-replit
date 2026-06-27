import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Copy, CheckCheck, Sparkles, TrendingUp, Anchor, Clapperboard,
  RefreshCw, Upload, X, Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "workflow", label: "Fluxo",      ph: "Ex: vendas B2B, nutrição, moda..." },
  { id: "trends",  label: "Tendências", ph: "Ex: fitness, finanças pessoais..." },
  { id: "hooks",   label: "Ganchos",    ph: "Ex: marketing digital, emagrecimento..." },
  { id: "script",  label: "Script",     ph: "Ex: Como dobrar suas vendas em 30 dias" },
] as const;
type TabId = (typeof TABS)[number]["id"];

type VStatus =
  | "idle"
  | "uploading"       // 1. enviando vídeo → HeyGen
  | "creating_avatar" // 2. criando avatar
  | "waiting_avatar"  // 3. aguardando processamento do avatar
  | "generating"      // 4. gerando vídeo
  | "polling"         // 5. aguardando vídeo ficar pronto
  | "done"
  | "error";

const STATUS_LABEL: Record<VStatus, string> = {
  idle:           "",
  uploading:      "Enviando vídeo...",
  creating_avatar:"Criando avatar com sua imagem...",
  waiting_avatar: "Processando avatar (pode levar alguns minutos)...",
  generating:     "Iniciando geração do vídeo...",
  polling:        "Aguardando vídeo finalizar...",
  done:           "",
  error:          "",
};

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

export default function ContentStudio() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  // Script IA
  const [tab, setTab]       = useState<TabId>("script");
  const [input, setInput]   = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);

  // Vídeo HeyGen
  const [videoFile, setVideoFile]     = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [showVideo, setShowVideo]     = useState(false);
  const [vScript, setVScript]         = useState("");
  const [vStatus, setVStatus]         = useState<VStatus>("idle");
  const [vUrl, setVUrl]               = useState("");
  const [vError, setVError]           = useState("");
  const [avatarId, setAvatarId]       = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const currentTab = TABS.find((t) => t.id === tab)!;

  // ── Script generation ──────────────────────────────────────────────────────
  const generate = async () => {
    if (!input.trim() || !tenantId) return;
    setLoading(true);
    setResult("");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-studio/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ tab, input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na geração");
      const text = data.result ?? "Sem resposta";
      setResult(text);
      setVScript(text.substring(0, 1500));
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao conectar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
  };

  // ── Vídeo upload preview ───────────────────────────────────────────────────
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setVideoFile(f);
    setVideoPreview(URL.createObjectURL(f));
    setAvatarId("");
    setVStatus("idle");
    setVUrl("");
    setVError("");
  };

  const removeVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
    setAvatarId("");
    setVStatus("idle");
    setVUrl("");
    setVError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── HeyGen video generation (4 steps via backend) ─────────────────────────
  const genVideo = async () => {
    if (!videoFile || !vScript || !tenantId) return;
    setVError("");
    setVUrl("");

    const base = `/api/tenants/${tenantId}/content-studio/heygen`;
    const headers = authHeader();

    try {
      // STEP 1 — upload vídeo
      setVStatus("uploading");
      const formData = new FormData();
      formData.append("video", videoFile);
      const upRes = await fetch(`${base}/upload-video`, { method: "POST", headers, body: formData });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error ?? "Falha no upload do vídeo");
      const assetUrl: string = upData.assetUrl;

      // STEP 2 — criar avatar (reutiliza se já existe)
      let avId = avatarId;
      if (!avId) {
        setVStatus("creating_avatar");
        const avRes = await fetch(`${base}/create-avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ assetUrl }),
        });
        const avData = await avRes.json();
        if (!avRes.ok) throw new Error(avData.error ?? "Falha ao criar avatar");
        avId = avData.avatarId;
        setAvatarId(avId);
      }

      // STEP 3 — aguardar avatar ficar pronto
      setVStatus("waiting_avatar");
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const MAX = 72; // 6 min (5s x 72)
        const poll = setInterval(async () => {
          attempts++;
          if (attempts > MAX) { clearInterval(poll); reject(new Error("Tempo limite excedido no processamento do avatar")); return; }
          try {
            const stRes = await fetch(`${base}/avatar-status/${avId}`, { headers });
            const stData = await stRes.json();
            if (stData.status === "completed") { clearInterval(poll); resolve(); }
            else if (stData.status === "failed") { clearInterval(poll); reject(new Error("Processamento do avatar falhou")); }
          } catch { /* ignora e tenta novamente */ }
        }, 5000);
      });

      // STEP 4 — gerar vídeo
      setVStatus("generating");
      const vidRes = await fetch(`${base}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ avatarId: avId, script: vScript }),
      });
      const vidData = await vidRes.json();
      if (!vidRes.ok) throw new Error(vidData.error ?? "Falha ao iniciar geração");
      const videoId: string = vidData.videoId;

      // STEP 5 — aguardar vídeo
      setVStatus("polling");
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const MAX = 72;
        const poll = setInterval(async () => {
          attempts++;
          if (attempts > MAX) { clearInterval(poll); reject(new Error("Tempo limite excedido aguardando o vídeo")); return; }
          try {
            const stRes = await fetch(`${base}/video-status/${videoId}`, { headers });
            const stData = await stRes.json();
            if (stData.status === "completed") {
              clearInterval(poll);
              setVUrl(stData.videoUrl ?? "");
              setVStatus("done");
              resolve();
            } else if (stData.status === "failed") {
              clearInterval(poll);
              reject(new Error(stData.error ?? "Geração do vídeo falhou"));
            }
          } catch { /* ignora */ }
        }, 5000);
      });

    } catch (err) {
      setVError(err instanceof Error ? err.message : "Erro desconhecido");
      setVStatus("error");
    }
  };

  const isProcessing = ["uploading","creating_avatar","waiting_avatar","generating","polling"].includes(vStatus);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-[#A78BFA] to-[#22D3EE] bg-clip-text text-transparent mb-1">
            Content Studio
          </h1>
          <p className="text-sm text-gray-400">Gere scripts com IA e transforme em vídeos com sua imagem</p>
        </div>

        {/* ① Script com IA */}
        <section>
          <p className="text-xs text-gray-500 font-semibold mb-3">① SCRIPT COM IA</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setResult(""); setInput(""); }}
                className={cn(
                  "px-3 py-2.5 rounded-xl text-xs border text-left transition-colors",
                  tab === t.id
                    ? "border-purple-500/60 bg-purple-500/15 text-purple-300 font-semibold"
                    : "border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-300"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <textarea
            placeholder={currentTab.ph}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-4 py-3 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 mb-3"
          />

          <button
            onClick={generate}
            disabled={loading || !input.trim()}
            className={cn(
              "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
              loading || !input.trim()
                ? "bg-purple-900/40 text-purple-400/50 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90"
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Gerando..." : "Gerar Script"}
          </button>
        </section>

        {/* Resultado */}
        {result && (
          <section className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-semibold">RESULTADO</span>
              <div className="flex gap-3">
                <button onClick={copyResult} className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors">
                  {copied ? <><CheckCheck className="h-3.5 w-3.5 text-green-400" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
                </button>
                <button onClick={generate} disabled={loading} className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 transition-colors">
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Regerar
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-[#d4cff0]">{result}</pre>
          </section>
        )}

        {/* ② Vídeo para o Avatar */}
        <section>
          <p className="text-xs text-gray-500 font-semibold mb-1">② VÍDEO PARA O AVATAR</p>
          <p className="text-xs text-gray-600 mb-3">
            Grave um vídeo curto falando diretamente para a câmera (3–10 segundos). O HeyGen vai usar seu rosto e voz para criar o avatar.
          </p>
          {videoPreview ? (
            <div className="relative w-fit">
              <video src={videoPreview} className="h-32 w-56 object-cover rounded-2xl border border-white/10" muted playsInline />
              <button
                onClick={removeVideo}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
              <p className="mt-1.5 text-xs text-gray-500 truncate max-w-[224px]">{videoFile?.name}</p>
              {avatarId && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Avatar criado — pronto para reusar
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-28 rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all gap-2 text-gray-500"
            >
              <Upload className="h-5 w-5" />
              <span className="text-sm">Clique para enviar um vídeo</span>
              <span className="text-xs">MP4, MOV ou WEBM · máx. 100 MB</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
        </section>

        {/* ③ Gerar Vídeo com HeyGen */}
        <section>
          <button
            onClick={() => setShowVideo((v) => !v)}
            className="flex items-center justify-between w-full text-left mb-3"
          >
            <p className="text-xs text-gray-500 font-semibold">③ GERAR VÍDEO COM IA — HEYGEN</p>
            <span className="text-xs text-purple-400">{showVideo ? "Ocultar ▲" : "Expandir ▼"}</span>
          </button>

          {showVideo && (
            <div className="space-y-4 rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-medium">Script do vídeo</label>
                <textarea
                  value={vScript}
                  onChange={(e) => setVScript(e.target.value)}
                  placeholder="Será preenchido automaticamente ao gerar o script acima..."
                  rows={4}
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-purple-500/50"
                />
              </div>

              {vStatus === "idle" && (
                <button
                  onClick={genVideo}
                  disabled={!videoFile || !vScript}
                  className={cn(
                    "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                    !videoFile || !vScript
                      ? "bg-purple-900/30 text-purple-400/40 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90"
                  )}
                >
                  <Video className="h-4 w-4" />
                  Gerar vídeo com HeyGen
                </button>
              )}

              {/* Barra de progresso por etapas */}
              {isProcessing && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>{STATUS_LABEL[vStatus]}</span>
                  </div>
                  <div className="flex gap-1">
                    {(["uploading","creating_avatar","waiting_avatar","generating","polling"] as VStatus[]).map((s, i) => (
                      <div
                        key={s}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-all",
                          ["uploading","creating_avatar","waiting_avatar","generating","polling"].indexOf(vStatus) >= i
                            ? "bg-purple-500"
                            : "bg-white/10"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}

              {vStatus === "done" && vUrl && (
                <div className="space-y-3">
                  <video src={vUrl} controls className="w-full rounded-xl border border-white/10" />
                  <div className="flex gap-2">
                    <a
                      href={vUrl} download target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-gray-300 hover:border-purple-500/50 hover:text-purple-300 transition-colors"
                    >
                      Baixar vídeo
                    </a>
                    <button
                      onClick={() => { setVStatus("idle"); setVUrl(""); }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      Gerar outro
                    </button>
                  </div>
                </div>
              )}

              {vStatus === "error" && (
                <div className="space-y-2">
                  <p className="text-sm text-red-400">{vError}</p>
                  <button
                    onClick={() => setVStatus("idle")}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-gray-300 hover:border-red-500/50 transition-colors"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
