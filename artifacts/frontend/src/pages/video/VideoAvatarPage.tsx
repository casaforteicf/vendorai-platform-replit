import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Mic2 } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoGenPanel, { type VoiceOption } from "@/components/video/VideoGenPanel";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type FlowStatus = "idle" | "uploading" | "creating" | "generating" | "polling" | "done" | "error";

const STATUS_LABEL: Record<FlowStatus, string> = {
  idle: "", uploading: "Enviando arquivo…", creating: "Preparando avatar…",
  generating: "Iniciando geração…", polling: "Aguardando vídeo…", done: "", error: "",
};
const STEPS: FlowStatus[] = ["uploading", "creating", "generating", "polling"];

export default function VideoAvatarPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  // Voices
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voice, setVoice] = useState("pt-BR-FranciscaNeural");
  const [quality, setQuality] = useState<"720p" | "1080p">("720p");

  // Script tab
  const [topic, setTopic]     = useState("");
  const [script, setScript]   = useState("");
  const [genScript, setGenScript] = useState(false);

  // Photo tab
  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // Video tab (existing avatar video)
  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  // Shared flow state
  const [activeTab, setActiveTabState] = useState<"roteiro" | "foto">("roteiro");
  const [status, setStatus] = useState<FlowStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [avatarId, setAvatarId] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/tenants/${tenantId}/content-studio/heygen/voices`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d) => { if (d.voices) setVoices(d.voices); })
      .catch(() => {});
  }, [tenantId]);

  const generateScript = async () => {
    if (!topic.trim() || !tenantId) return;
    setGenScript(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-studio/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ tab: "script", input: topic.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar");
      setScript(data.result ?? "");
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao gerar script", variant: "destructive" });
    } finally {
      setGenScript(false);
    }
  };

  const pollVideo = async (videoId: string) => {
    setStatus("polling");
    let n = 0;
    return new Promise<void>((resolve, reject) => {
      const id = setInterval(async () => {
        if (++n > 90) { clearInterval(id); reject(new Error("Timeout: vídeo demorou mais de 7 min")); return; }
        try {
          const r = await fetch(`/api/tenants/${tenantId}/content-studio/heygen/video-status/${videoId}`, { headers: authHeader() });
          const d = await r.json();
          if (d.status === "completed") { clearInterval(id); setResultUrl(d.videoUrl ?? ""); setStatus("done"); resolve(); }
          else if (d.status === "failed") { clearInterval(id); reject(new Error(d.error ?? "Geração falhou")); }
        } catch (e) { clearInterval(id); reject(e); }
      }, 5000);
    });
  };

  const runFromScript = async () => {
    if (!script.trim() || !tenantId) return;
    setErrorMsg(""); setResultUrl(""); setStatus("uploading");
    const base = `/api/tenants/${tenantId}/content-studio/heygen`;
    try {
      let avId = avatarId;
      if (!avId) {
        if (!videoFile) { toast({ title: "Selecione um vídeo", description: "Vá para a aba Foto ou adicione um vídeo de avatar.", variant: "destructive" }); setStatus("idle"); return; }
        const form = new FormData();
        form.append("video", videoFile);
        const upRes = await fetch(`${base}/upload-video`, { method: "POST", headers: authHeader(), body: form });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error ?? "Falha no upload");

        setStatus("creating");
        const avRes = await fetch(`${base}/create-avatar`, {
          method: "POST", headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ assetUrl: upData.assetUrl }),
        });
        const avData = await avRes.json();
        if (!avRes.ok) throw new Error(avData.error ?? "Falha ao criar avatar");
        avId = avData.avatarId;
        setAvatarId(avId);
      }

      setStatus("generating");
      const vidRes = await fetch(`${base}/generate-video-v2`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ avatarId: avId, script: script.trim(), voiceId: voice, quality }),
      });
      const vidData = await vidRes.json();
      if (!vidRes.ok) throw new Error(vidData.error ?? "Falha ao gerar vídeo");
      await pollVideo(vidData.videoId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setStatus("error");
    }
  };

  const runFromPhoto = async () => {
    if (!script.trim() || !tenantId) return;
    if (!photoFile) { toast({ title: "Selecione uma foto", description: "Adicione uma foto no painel à direita.", variant: "destructive" }); return; }
    setErrorMsg(""); setResultUrl(""); setStatus("uploading");
    const base = `/api/tenants/${tenantId}/content-studio/heygen`;
    try {
      const form = new FormData();
      form.append("photo", photoFile);
      const upRes = await fetch(`${base}/upload-photo`, { method: "POST", headers: authHeader(), body: form });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error ?? "Falha no upload da foto");

      setStatus("creating");
      const tpRes = await fetch(`${base}/create-talking-photo`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ photoUrl: upData.assetUrl }),
      });
      const tpData = await tpRes.json();
      if (!tpRes.ok) throw new Error(tpData.error ?? "Falha ao criar talking photo");

      setStatus("generating");
      const vidRes = await fetch(`${base}/generate-from-photo`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ talkingPhotoId: tpData.talkingPhotoId, script: script.trim(), voiceId: voice, quality }),
      });
      const vidData = await vidRes.json();
      if (!vidRes.ok) throw new Error(vidData.error ?? "Falha ao gerar vídeo");
      await pollVideo(vidData.videoId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setStatus("error");
    }
  };

  const isProcessing = ["uploading", "creating", "generating", "polling"].includes(status);

  // ── Tab contents ─────────────────────────────────────────────────────────────

  const ScriptTabContent = (
    <div className="space-y-3 h-full flex flex-col">
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 font-medium">Tema ou produto</label>
        <div className="flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Ex: lançamento de produto, depoimento de cliente…"
            className="flex-1 rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2 focus:outline-none focus:border-purple-500/50"
          />
          <button
            onClick={generateScript}
            disabled={genScript || !topic.trim()}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0",
              genScript || !topic.trim()
                ? "bg-purple-900/30 text-purple-400/50 cursor-not-allowed"
                : "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30"
            )}
          >
            {genScript ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Gerar
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <label className="text-xs text-gray-400 font-medium mb-1.5">Roteiro do vídeo</label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="O roteiro gerado aparece aqui. Você pode editá-lo antes de gerar o vídeo."
          className="flex-1 min-h-[160px] rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-purple-500/50"
        />
        <p className="text-xs text-gray-600 mt-1">{script.length}/1500 caracteres</p>
      </div>

      {/* Status / result inline */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {STATUS_LABEL[status]}
          </div>
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className={cn("h-1 flex-1 rounded-full transition-all", STEPS.indexOf(status) >= i ? "bg-purple-500" : "bg-white/10")} />
            ))}
          </div>
        </div>
      )}
      {status === "done" && resultUrl && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" /> Vídeo pronto!
          </div>
          <video src={resultUrl} controls className="w-full rounded-xl border border-white/10 max-h-48" />
          <div className="flex gap-2">
            <a href={resultUrl} download target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 text-gray-300 hover:border-purple-500/50 transition-colors">
              Baixar
            </a>
            <button onClick={() => { setStatus("idle"); setResultUrl(""); }}
              className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors">
              Gerar outro
            </button>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="text-sm text-red-300">{errorMsg}</p>
            <button onClick={() => setStatus("idle")} className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const PhotoTabContent = (
    <div className="space-y-3 h-full flex flex-col">
      <p className="text-xs text-gray-500 leading-relaxed">
        Escreva ou gere o roteiro na aba <strong className="text-gray-300">Roteiro para vídeo</strong>, depois adicione sua foto aqui. A IA vai animar seu rosto para narrar o conteúdo.
      </p>
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-xs text-gray-400 font-medium mb-1.5">Seu roteiro</p>
        <div className={cn(
          "rounded-xl border px-3 py-2.5 text-sm min-h-[80px]",
          script ? "border-emerald-500/30 bg-emerald-500/5 text-gray-300" : "border-white/10 bg-white/5 text-gray-600 italic"
        )}>
          {script || "Sem roteiro ainda — preencha na aba Roteiro para vídeo."}
        </div>
      </div>
      <p className="text-xs text-gray-500">A foto deve mostrar o rosto claramente, mín. 720×720px, fundo simples.</p>
    </div>
  );

  // Right panel depends on active tab
  const RightPanel = (
    <div className="h-full flex flex-col gap-4">
      {activeTab === "roteiro" ? (
        <>
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Vídeo do avatar <span className="text-gray-600">(3–10 seg falando para a câmera)</span></p>
            {videoPreview ? (
              <div className="relative w-fit">
                <video src={videoPreview} className="h-36 w-56 object-cover rounded-xl border border-white/10" muted playsInline />
                <button
                  onClick={() => { setVideoFile(null); setVideoPreview(null); setAvatarId(""); if (videoRef.current) videoRef.current.value = ""; }}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
                {avatarId && <p className="mt-1.5 text-xs text-emerald-400">✓ Avatar criado — será reutilizado</p>}
              </div>
            ) : (
              <button onClick={() => videoRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all gap-2 text-gray-500">
                <Upload className="h-5 w-5" />
                <span className="text-sm">Clique para enviar vídeo (MP4/MOV)</span>
                <span className="text-xs text-gray-600">Até 100 MB</span>
              </button>
            )}
            <input ref={videoRef} type="file" accept="video/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setVideoFile(f); setVideoPreview(URL.createObjectURL(f)); setAvatarId(""); }} />
          </div>

          <div className="mt-2">
            <p className="text-xs text-gray-500 font-medium mb-2">Amostras de resultado</p>
            <div className="grid grid-cols-2 gap-2">
              {["🧑‍💼 Vendas B2B", "🛍 E-commerce", "📱 Redes Sociais", "🎯 Cold Outreach"].map((label) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-gray-400 text-center">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Foto do avatar <span className="text-gray-600">(JPG/PNG, rosto visível)</span></p>
            {photoPreview ? (
              <div className="relative w-fit">
                <img src={photoPreview} alt="avatar" className="h-40 w-40 object-cover rounded-xl border border-white/10" />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); if (photoRef.current) photoRef.current.value = ""; }}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button onClick={() => photoRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-40 rounded-xl border-2 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all gap-2 text-gray-500">
                <Upload className="h-5 w-5" />
                <span className="text-sm">Clique para enviar foto</span>
                <span className="text-xs text-gray-600">JPG, PNG · mín. 720×720px</span>
              </button>
            )}
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }} />
          </div>

          {/* Status for photo flow */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                {STATUS_LABEL[status]}
              </div>
              <div className="flex gap-1">
                {STEPS.map((s, i) => (
                  <div key={s} className={cn("h-1 flex-1 rounded-full transition-all", STEPS.indexOf(status) >= i ? "bg-purple-500" : "bg-white/10")} />
                ))}
              </div>
            </div>
          )}
          {status === "done" && resultUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Vídeo pronto!
              </div>
              <video src={resultUrl} controls className="w-full rounded-xl border border-white/10" />
              <div className="flex gap-2">
                <a href={resultUrl} download target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/15 text-gray-300 hover:border-purple-500/50 transition-colors">
                  Baixar
                </a>
                <button onClick={() => { setStatus("idle"); setResultUrl(""); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  Gerar outro
                </button>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm text-red-300">{errorMsg}</p>
                <button onClick={() => setStatus("idle")} className="text-xs text-gray-400 hover:text-gray-200 transition-colors">
                  Tentar novamente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <VideoGenPanel
      title="Avatar falando"
      description="Gere um vídeo com avatar narrando seu conteúdo a partir de roteiro ou foto"
      icon={Mic2}
      iconBg="bg-purple-500/20 text-purple-300"
      tabs={[
        { id: "roteiro", label: "Roteiro para vídeo", content: ScriptTabContent },
        { id: "foto",    label: "Foto para vídeo",    content: PhotoTabContent  },
      ]}
      rightPanel={RightPanel}
      voices={voices}
      voice={voice}
      onVoiceChange={setVoice}
      quality={quality}
      onQualityChange={setQuality}
      onTabChange={(id) => setActiveTabState(id as "roteiro" | "foto")}
      onGenerate={(tabId) => {
        if (tabId === "roteiro") runFromScript();
        else runFromPhoto();
      }}
      generating={isProcessing}
      generateLabel="Gerar vídeo"
      generateDisabled={!script.trim() || (activeTab === "roteiro" && !videoFile && !avatarId) || (activeTab === "foto" && !photoFile)}
    />
  );
}
