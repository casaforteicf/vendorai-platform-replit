import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Copy, CheckCheck, Sparkles, TrendingUp, Anchor, Clapperboard,
  RefreshCw, Upload, X, Video, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "workflow",  label: "Fluxo",       icon: RefreshCw,    ph: "Ex: vendas B2B, nutrição, moda..." },
  { id: "trends",   label: "Tendências",   icon: TrendingUp,   ph: "Ex: fitness, finanças pessoais..." },
  { id: "hooks",    label: "Ganchos",      icon: Anchor,       ph: "Ex: marketing digital, emagrecimento..." },
  { id: "script",   label: "Script",       icon: Clapperboard, ph: "Ex: Como dobrar suas vendas em 30 dias" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ContentStudio() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  const [tab, setTab]         = useState<TabId>("script");
  const [input, setInput]     = useState("");
  const [result, setResult]   = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);

  const [photo, setPhoto]     = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef               = useRef<HTMLInputElement>(null);

  const [apiKey, setApiKey]         = useState("");
  const [showVideo, setShowVideo]   = useState(false);
  const [vScript, setVScript]       = useState("");
  const [vStatus, setVStatus]       = useState<"idle" | "uploading" | "generating" | "polling" | "done" | "error">("idle");
  const [vUrl, setVUrl]             = useState("");
  const [vError, setVError]         = useState("");

  const currentTab = TABS.find((t) => t.id === tab)!;

  const generate = async () => {
    if (!input.trim() || !tenantId) return;
    setLoading(true);
    setResult("");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-studio/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
        },
        body: JSON.stringify({ tab, input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na geração");
      const text = data.result ?? "Sem resposta";
      setResult(text);
      setVScript(text.substring(0, 800));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao conectar.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const removePhoto = () => {
    setPhoto(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const genVideo = async () => {
    if (!apiKey || !photo || !vScript) return;
    setVStatus("uploading");
    setVError("");
    setVUrl("");
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(photo!);
      });

      const up = await fetch("https://upload.heygen.com/v1/asset", {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "image/jpeg" },
        body: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      });
      const upData = await up.json();
      if (!upData.data?.url) throw new Error("Falha no upload da imagem");

      setVStatus("generating");

      const av = await fetch("https://api.heygen.com/v2/photo_avatar", {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: upData.data.url, name: "Avatar" }),
      });
      const avData = await av.json();
      if (!avData.data?.photo_avatar_id) throw new Error("Falha ao criar avatar");
      const avatarId: string = avData.data.photo_avatar_id;

      const vid = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          video_inputs: [
            {
              character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
              voice: { type: "text", input_text: vScript, voice_id: "en-US-JennyNeural" },
            },
          ],
          dimension: { width: 1280, height: 720 },
        }),
      });
      const vidData = await vid.json();
      if (!vidData.data?.video_id) throw new Error("Falha ao iniciar geração do vídeo");
      const videoId: string = vidData.data.video_id;

      setVStatus("polling");

      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const MAX = 60;
        const poll = setInterval(async () => {
          attempts++;
          if (attempts > MAX) {
            clearInterval(poll);
            reject(new Error("Tempo limite excedido aguardando o vídeo"));
            return;
          }
          try {
            const st = await fetch(
              `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
              { headers: { "X-Api-Key": apiKey } },
            );
            const stData = await st.json();
            const status = stData.data?.status as string | undefined;
            if (status === "completed") {
              clearInterval(poll);
              setVUrl(stData.data.video_url ?? "");
              setVStatus("done");
              resolve();
            } else if (status === "failed") {
              clearInterval(poll);
              reject(new Error(stData.data?.error ?? "Geração do vídeo falhou"));
            }
          } catch {
            // continua tentando
          }
        }, 5000);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setVError(msg);
      setVStatus("error");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-[#A78BFA] to-[#22D3EE] bg-clip-text text-transparent mb-1">
            Content Studio
          </h1>
          <p className="text-sm text-gray-400">Gere scripts com IA e transforme em vídeos com sua foto</p>
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
              <div className="flex gap-2">
                <button
                  onClick={copyResult}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors"
                >
                  {copied
                    ? <><CheckCheck className="h-3.5 w-3.5 text-green-400" /> Copiado</>
                    : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
                </button>
                <button
                  onClick={generate}
                  disabled={loading}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 transition-colors"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                  Regerar
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-[#d4cff0]">
              {result}
            </pre>
          </section>
        )}

        {/* ② Foto para o Avatar */}
        <section>
          <p className="text-xs text-gray-500 font-semibold mb-3">② FOTO PARA O AVATAR</p>
          {preview ? (
            <div className="relative w-fit">
              <img src={preview} alt="Preview" className="h-32 w-32 object-cover rounded-2xl border border-white/10" />
              <button
                onClick={removePhoto}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
              <p className="mt-1.5 text-xs text-gray-500 truncate max-w-[128px]">{photo?.name}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-28 rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all gap-2 text-gray-500"
            >
              <Upload className="h-5 w-5" />
              <span className="text-sm">Clique para enviar uma foto sua</span>
              <span className="text-xs">PNG, JPG ou WEBP</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        </section>

        {/* ③ Vídeo com HeyGen */}
        <section>
          <button
            onClick={() => setShowVideo((v) => !v)}
            className="flex items-center justify-between w-full text-left mb-3"
          >
            <p className="text-xs text-gray-500 font-semibold">③ VÍDEO COM IA — HEYGEN</p>
            <span className="text-xs text-purple-400">{showVideo ? "Ocultar ▲" : "Expandir ▼"}</span>
          </button>

          {showVideo && (
            <div className="space-y-4 rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-medium">API Key do HeyGen</label>
                <input
                  type="password"
                  placeholder="Cole sua chave aqui"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-purple-500/50"
                />
                <p className="text-xs text-gray-600">
                  Obtenha em{" "}
                  <a href="https://app.heygen.com/settings?nav=API" target="_blank" rel="noopener noreferrer" className="text-cyan-500 underline">
                    app.heygen.com/settings
                  </a>
                  . Não salva no servidor.
                </p>
              </div>

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
                  disabled={!apiKey || !photo || !vScript}
                  className={cn(
                    "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                    !apiKey || !photo || !vScript
                      ? "bg-purple-900/30 text-purple-400/40 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90"
                  )}
                >
                  <Video className="h-4 w-4" />
                  Gerar vídeo com HeyGen
                </button>
              )}

              {(vStatus === "uploading" || vStatus === "generating" || vStatus === "polling") && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>
                    {vStatus === "uploading"  && "Enviando imagem..."}
                    {vStatus === "generating" && "Criando avatar e iniciando vídeo..."}
                    {vStatus === "polling"    && "Aguardando geração (pode levar alguns minutos)..."}
                  </span>
                </div>
              )}

              {vStatus === "done" && vUrl && (
                <div className="space-y-3">
                  <video src={vUrl} controls className="w-full rounded-xl border border-white/10" />
                  <div className="flex gap-2">
                    <a
                      href={vUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
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
