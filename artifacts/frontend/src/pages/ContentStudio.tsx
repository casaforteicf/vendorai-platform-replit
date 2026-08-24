import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Copy, CheckCheck, Sparkles, TrendingUp, Anchor, Clapperboard,
  RefreshCw, Upload, X, Video, ShoppingBag, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCRIPT_TABS = [
  { id: "workflow", label: "Fluxo",      ph: "Ex: vendas B2B, nutrição, moda..." },
  { id: "trends",  label: "Tendências", ph: "Ex: fitness, finanças pessoais..." },
  { id: "hooks",   label: "Ganchos",    ph: "Ex: marketing digital, emagrecimento..." },
  { id: "script",  label: "Script",     ph: "Ex: Como dobrar suas vendas em 30 dias" },
] as const;
type ScriptTabId = (typeof SCRIPT_TABS)[number]["id"];

type MainTab = "script" | "produto";

type VStatus =
  | "idle" | "uploading" | "creating_avatar" | "waiting_avatar"
  | "generating" | "polling" | "done" | "error";

const V_STATUS_LABEL: Record<VStatus, string> = {
  idle: "", uploading: "Enviando vídeo...", creating_avatar: "Criando avatar...",
  waiting_avatar: "Processando avatar (pode levar alguns minutos)...",
  generating: "Iniciando geração do vídeo...", polling: "Aguardando vídeo finalizar...",
  done: "", error: "",
};

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

// ─── Storyboard renderer ──────────────────────────────────────────────────────

function StoryboardResult({ text, format }: { text: string; format: string }) {
  const [copied, setCopied] = useState(false);
  const copyAll = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse telas (Story) ou seções (Reel)
  const sections = text
    .split(/\n(?=(?:TELA \d|GANCHO|PROBLEMA|SOLUÇÃO|PROVA|CTA|INTERESSE|OFERTA))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-semibold">
          STORYBOARD — {format === "story" ? "STORIES" : "REEL"}
        </span>
        <button onClick={copyAll} className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors">
          {copied ? <><CheckCheck className="h-3 w-3 text-green-400" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar tudo</>}
        </button>
      </div>

      {sections.length > 1 ? (
        <div className="space-y-2">
          {sections.map((section, i) => {
            const lines = section.split("\n").filter(Boolean);
            const title = lines[0] ?? "";
            const body = lines.slice(1).join("\n");
            const colors = [
              "from-purple-500/20 border-purple-500/30",
              "from-cyan-500/20 border-cyan-500/30",
              "from-pink-500/20 border-pink-500/30",
              "from-amber-500/20 border-amber-500/30",
              "from-emerald-500/20 border-emerald-500/30",
            ];
            return (
              <div key={i} className={cn("rounded-xl bg-gradient-to-br p-3.5 border", colors[i % colors.length], "to-transparent")}>
                <p className="text-xs font-bold text-white/90 mb-1.5">{title}</p>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed font-sans">{body}</pre>
              </div>
            );
          })}
        </div>
      ) : (
        <pre className="text-sm text-[#d4cff0] whitespace-pre-wrap leading-relaxed font-sans rounded-xl bg-white/5 border border-white/10 p-4">
          {text}
        </pre>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContentStudio() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

  const [, navigate] = useLocation();
  const [mainTab, setMainTab] = useState<MainTab>("script");

  // Script state
  const [scriptTab, setScriptTab]   = useState<ScriptTabId>("script");
  const [scriptInput, setScriptInput] = useState("");
  const [scriptResult, setScriptResult] = useState("");
  const [scriptLoading, setScriptLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // HeyGen avatar video state
  const [videoFile, setVideoFile]       = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [showHeyGen, setShowHeyGen]     = useState(false);
  const [vScript, setVScript]           = useState("");
  const [vStatus, setVStatus]           = useState<VStatus>("idle");
  const [vUrl, setVUrl]                 = useState("");
  const [vError, setVError]             = useState("");
  const [avatarId, setAvatarId]         = useState("");
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Product tab state
  const [prodImage, setProdImage]         = useState<File | null>(null);
  const [prodImagePreview, setProdImagePreview] = useState<string | null>(null);
  const [prodName, setProdName]           = useState("");
  const [prodDesc, setProdDesc]           = useState("");
  const [prodPrice, setProdPrice]         = useState("");
  const [prodBenefits, setProdBenefits]   = useState("");
  const [prodCta, setProdCta]             = useState("Compre agora");
  const [prodFormat, setProdFormat]       = useState<"story" | "reel">("reel");
  const [prodLoading, setProdLoading]     = useState(false);
  const [prodResult, setProdResult]       = useState("");
  const prodImageRef = useRef<HTMLInputElement>(null);

  const currentScriptTab = SCRIPT_TABS.find((t) => t.id === scriptTab)!;

  // ── Criadores de referência (até 3, inspiração pro Fluxo/Tendências/Ganchos) ─
  interface ReferenceCreator {
    id: string;
    instagramUsername: string;
    padroesDetectados: { tomDeVoz: string; estiloDeHook: string; cadenciaPostagem: string; observacoes: string; baseadoEmPosts: number } | null;
    ultimoErro: string | null;
  }
  const [refCreators, setRefCreators] = useState<ReferenceCreator[]>([]);
  const [refCreatorsOpen, setRefCreatorsOpen] = useState(false);
  const [refCreatorsLoaded, setRefCreatorsLoaded] = useState(false);
  const [newRefUsername, setNewRefUsername] = useState("");
  const [refAdding, setRefAdding] = useState(false);
  const [refUpdatingId, setRefUpdatingId] = useState<string | null>(null);

  async function loadRefCreators() {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-reference-creators`, { headers: authHeader() });
      if (res.ok) setRefCreators(await res.json());
    } catch { /* ignore */ }
    setRefCreatorsLoaded(true);
  }

  function toggleRefCreators() {
    setRefCreatorsOpen((v) => !v);
    if (!refCreatorsLoaded) loadRefCreators();
  }

  async function addRefCreator() {
    if (!newRefUsername.trim() || !tenantId) return;
    setRefAdding(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-reference-creators`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ instagramUsername: newRefUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar");
      setRefCreators((prev) => [...prev, data]);
      setNewRefUsername("");
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao adicionar", variant: "destructive" });
    } finally {
      setRefAdding(false);
    }
  }

  async function removeRefCreator(id: string) {
    if (!tenantId) return;
    setRefCreators((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/tenants/${tenantId}/content-reference-creators/${id}`, { method: "DELETE", headers: authHeader() }).catch(() => {});
  }

  async function refreshRefCreator(id: string) {
    if (!tenantId) return;
    setRefUpdatingId(id);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-reference-creators/${id}/atualizar`, { method: "POST", headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar");
      setRefCreators((prev) => prev.map((c) => (c.id === id ? data : c)));
    } catch (err) {
      toast({ title: "Não foi possível analisar essa conta", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      loadRefCreators(); // recarrega pra pegar o ultimoErro salvo no backend
    } finally {
      setRefUpdatingId(null);
    }
  }

  // ── Aprendizados de desempenho — métricas dos posts publicados ──────────────
  interface PerformanceInsight {
    aprendizados: { temasQueFuncionam: string[]; temasQueNaoFuncionam: string[]; formatoQueMaisEngaja: string; observacoes: string } | null;
    baseadoEmPosts: number;
    atualizadoEm: string | null;
  }
  const [perfInsight, setPerfInsight] = useState<PerformanceInsight | null>(null);
  const [perfOpen, setPerfOpen] = useState(false);
  const [perfLoaded, setPerfLoaded] = useState(false);
  const [perfMetricsUpdating, setPerfMetricsUpdating] = useState(false);
  const [perfInsightsUpdating, setPerfInsightsUpdating] = useState(false);

  async function loadPerfInsight() {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-performance/insights`, { headers: authHeader() });
      if (res.ok) setPerfInsight(await res.json());
    } catch { /* ignore */ }
    setPerfLoaded(true);
  }

  function togglePerf() {
    setPerfOpen((v) => !v);
    if (!perfLoaded) loadPerfInsight();
  }

  async function updatePerfMetrics() {
    if (!tenantId) return;
    setPerfMetricsUpdating(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-performance/posts/atualizar-metricas`, { method: "POST", headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar métricas");
      toast({ title: `${data.atualizados} post(s) com métricas atualizadas${data.erros ? `, ${data.erros} com erro` : ""}.` });
    } catch (err) {
      toast({ title: "Erro ao atualizar métricas", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setPerfMetricsUpdating(false);
    }
  }

  async function updatePerfInsights() {
    if (!tenantId) return;
    setPerfInsightsUpdating(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-performance/insights/atualizar`, { method: "POST", headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar aprendizados");
      setPerfInsight(data);
    } catch (err) {
      toast({ title: "Ainda não dá pra gerar aprendizados", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setPerfInsightsUpdating(false);
    }
  }

  // ── Script generate ──────────────────────────────────────────────────────
  const generateScript = async () => {
    if (!scriptInput.trim() || !tenantId) return;
    setScriptLoading(true);
    setScriptResult("");
    try {
      const res = await fetch(`/api/tenants/${tenantId}/content-studio/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ tab: scriptTab, input: scriptInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na geração");
      const text = data.result ?? "";
      setScriptResult(text);
      setVScript(text.substring(0, 1500));
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao gerar", variant: "destructive" });
    } finally {
      setScriptLoading(false);
    }
  };

  // ── Product video generate ────────────────────────────────────────────────
  const generateProductVideo = async () => {
    if (!prodName.trim() || !tenantId) return;
    setProdLoading(true);
    setProdResult("");
    try {
      const form = new FormData();
      if (prodImage) form.append("image", prodImage);
      form.append("name", prodName.trim());
      form.append("description", prodDesc.trim());
      form.append("price", prodPrice.trim());
      form.append("benefits", prodBenefits.trim());
      form.append("cta", prodCta.trim() || "Compre agora");
      form.append("format", prodFormat);

      const res = await fetch(`/api/tenants/${tenantId}/content-studio/product-video`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar storyboard");
      setProdResult(data.result ?? "");
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro ao gerar", variant: "destructive" });
    } finally {
      setProdLoading(false);
    }
  };

  // ── HeyGen video flow ─────────────────────────────────────────────────────
  const genHeyGenVideo = async () => {
    if (!videoFile || !vScript || !tenantId) return;
    setVError(""); setVUrl("");
    const base = `/api/tenants/${tenantId}/content-studio/heygen`;
    const headers = authHeader();

    try {
      setVStatus("uploading");
      const formData = new FormData();
      formData.append("video", videoFile);
      const upRes = await fetch(`${base}/upload-video`, { method: "POST", headers, body: formData });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error ?? "Falha no upload do vídeo");

      let avId = avatarId;
      if (!avId) {
        setVStatus("creating_avatar");
        const avRes = await fetch(`${base}/create-avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ assetUrl: upData.assetUrl }),
        });
        const avData = await avRes.json();
        if (!avRes.ok) throw new Error(avData.error ?? "Falha ao criar avatar");
        avId = avData.avatarId;
        setAvatarId(avId);
      }

      setVStatus("waiting_avatar");
      await new Promise<void>((resolve, reject) => {
        let n = 0;
        const id = setInterval(async () => {
          if (++n > 72) { clearInterval(id); reject(new Error("Timeout no avatar")); return; }
          const r = await fetch(`${base}/avatar-status/${avId}`, { headers });
          const d = await r.json();
          if (d.status === "completed") { clearInterval(id); resolve(); }
          else if (d.status === "failed") { clearInterval(id); reject(new Error("Avatar falhou")); }
        }, 5000);
      });

      setVStatus("generating");
      const vidRes = await fetch(`${base}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ avatarId: avId, script: vScript }),
      });
      const vidData = await vidRes.json();
      if (!vidRes.ok) throw new Error(vidData.error ?? "Falha ao gerar vídeo");

      setVStatus("polling");
      await new Promise<void>((resolve, reject) => {
        let n = 0;
        const id = setInterval(async () => {
          if (++n > 72) { clearInterval(id); reject(new Error("Timeout no vídeo")); return; }
          const r = await fetch(`${base}/video-status/${vidData.videoId}`, { headers });
          const d = await r.json();
          if (d.status === "completed") { clearInterval(id); setVUrl(d.videoUrl ?? ""); setVStatus("done"); resolve(); }
          else if (d.status === "failed") { clearInterval(id); reject(new Error(d.error ?? "Geração falhou")); }
        }, 5000);
      });
    } catch (err) {
      setVError(err instanceof Error ? err.message : "Erro desconhecido");
      setVStatus("error");
    }
  };

  const isProcessing = ["uploading","creating_avatar","waiting_avatar","generating","polling"].includes(vStatus);
  const V_STEPS: VStatus[] = ["uploading","creating_avatar","waiting_avatar","generating","polling"];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-[#A78BFA] to-[#22D3EE] bg-clip-text text-transparent mb-1">
            Content Studio
          </h1>
          <p className="text-sm text-gray-400">Gere scripts, stories e reels com IA para Instagram</p>
        </div>

        {/* Main tab switcher */}
        <div className="flex gap-2 p-1 rounded-2xl bg-white/5 border border-white/10">
          {([
            { id: "script",  label: "Script com IA",    Icon: FileText    },
            { id: "produto", label: "Vídeo de Produto", Icon: ShoppingBag },
          ] as { id: MainTab; label: string; Icon: typeof FileText }[]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                mainTab === id
                  ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow"
                  : "text-gray-400 hover:text-gray-200"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <button
            onClick={() => navigate("/content-studio/video")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all text-gray-400 hover:text-gray-200 hover:bg-white/5"
          >
            <Video className="h-4 w-4" />
            Vídeo com IA
          </button>
        </div>

        {/* ══════════════ TAB: Script ══════════════ */}
        {mainTab === "script" && (
          <>
            {/* Criadores de referência — até 3, alimenta Tendências/Ganchos/Fluxo */}
            <section className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <button
                onClick={toggleRefCreators}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-400" />
                  Criadores de referência {refCreators.length > 0 && `(${refCreators.length}/3)`}
                </span>
                <span className="text-xs text-gray-500">{refCreatorsOpen ? "ocultar" : "configurar"}</span>
              </button>
              {refCreatorsOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-xs text-gray-500">
                    Aponte até 3 contas públicas do Instagram (Business/Creator) como referência de tom e formato. Nunca copia — só inspira o Fluxo, Tendências e Ganchos acima.
                  </p>
                  {refCreators.map((c) => (
                    <div key={c.id} className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-[#e8e4f8]">@{c.instagramUsername}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => refreshRefCreator(c.id)}
                            disabled={refUpdatingId === c.id}
                            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                          >
                            {refUpdatingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            {c.padroesDetectados ? "Atualizar" : "Analisar"}
                          </button>
                          <button onClick={() => removeRefCreator(c.id)} className="text-gray-500 hover:text-red-400">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {c.padroesDetectados ? (
                        <p className="text-xs text-gray-400">
                          Tom: <span className="text-gray-300">{c.padroesDetectados.tomDeVoz}</span> · Hook: <span className="text-gray-300">{c.padroesDetectados.estiloDeHook}</span> · Cadência: <span className="text-gray-300">{c.padroesDetectados.cadenciaPostagem}</span>
                          <br />{c.padroesDetectados.observacoes}
                        </p>
                      ) : c.ultimoErro ? (
                        <p className="text-xs text-red-400">{c.ultimoErro}</p>
                      ) : (
                        <p className="text-xs text-gray-500">Ainda não analisado — clique em "Analisar".</p>
                      )}
                    </div>
                  ))}
                  {refCreators.length < 3 && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="@usuario"
                        value={newRefUsername}
                        onChange={(e) => setNewRefUsername(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addRefCreator(); }}
                        className="flex-1 rounded-lg bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2 focus:outline-none focus:border-purple-500/50"
                      />
                      <button
                        onClick={addRefCreator}
                        disabled={refAdding || !newRefUsername.trim()}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"
                      >
                        {refAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Adicionar"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Aprendizados de desempenho — loop com métricas dos posts publicados */}
            <section className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <button onClick={togglePerf} className="w-full flex items-center justify-between px-4 py-3 text-left">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  Aprendizados dos seus posts {perfInsight?.baseadoEmPosts ? `(${perfInsight.baseadoEmPosts} posts)` : ""}
                </span>
                <span className="text-xs text-gray-500">{perfOpen ? "ocultar" : "ver"}</span>
              </button>
              {perfOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-xs text-gray-500">
                    Compara o desempenho dos seus posts publicados no Instagram e alimenta o Fluxo, Tendências, Ganchos e Script acima com o que realmente funciona pra sua audiência.
                  </p>

                  {perfInsight?.aprendizados ? (
                    <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-1.5 text-xs">
                      <p className="text-gray-400">Funciona bem: <span className="text-emerald-300">{perfInsight.aprendizados.temasQueFuncionam.join(", ")}</span></p>
                      {perfInsight.aprendizados.temasQueNaoFuncionam.length > 0 && (
                        <p className="text-gray-400">Engaja menos: <span className="text-red-300">{perfInsight.aprendizados.temasQueNaoFuncionam.join(", ")}</span></p>
                      )}
                      <p className="text-gray-400">Formato campeão: <span className="text-gray-200">{perfInsight.aprendizados.formatoQueMaisEngaja}</span></p>
                      <p className="text-gray-400">{perfInsight.aprendizados.observacoes}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Ainda sem aprendizados gerados. Publique conteúdo, atualize as métricas (depois de ~24h) e gere os aprendizados.</p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={updatePerfMetrics}
                      disabled={perfMetricsUpdating}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-gray-300 hover:border-white/20 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {perfMetricsUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Atualizar métricas
                    </button>
                    <button
                      onClick={updatePerfInsights}
                      disabled={perfInsightsUpdating}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {perfInsightsUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Atualizar aprendizados
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section>
              <p className="text-xs text-gray-500 font-semibold mb-3">① TIPO DE CONTEÚDO</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {SCRIPT_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setScriptTab(t.id); setScriptResult(""); setScriptInput(""); }}
                    className={cn(
                      "px-3 py-2.5 rounded-xl text-xs border text-left transition-colors",
                      scriptTab === t.id
                        ? "border-purple-500/60 bg-purple-500/15 text-purple-300 font-semibold"
                        : "border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-300"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <textarea
                placeholder={currentScriptTab.ph}
                value={scriptInput}
                onChange={(e) => setScriptInput(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generateScript(); }}
                rows={3}
                className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-4 py-3 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30 mb-3"
              />

              <button
                onClick={generateScript}
                disabled={scriptLoading || !scriptInput.trim()}
                className={cn(
                  "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                  scriptLoading || !scriptInput.trim()
                    ? "bg-purple-900/40 text-purple-400/50 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90"
                )}
              >
                {scriptLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {scriptLoading ? "Gerando..." : "Gerar Script"}
              </button>
            </section>

            {scriptResult && (
              <section className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-semibold">RESULTADO</span>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => { await navigator.clipboard.writeText(scriptResult); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors"
                    >
                      {copied ? <><CheckCheck className="h-3.5 w-3.5 text-green-400" /> Copiado</> : <><Copy className="h-3.5 w-3.5" /> Copiar</>}
                    </button>
                    <button onClick={generateScript} disabled={scriptLoading} className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 transition-colors">
                      <RefreshCw className={cn("h-3.5 w-3.5", scriptLoading && "animate-spin")} /> Regerar
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-[#d4cff0]">{scriptResult}</pre>
              </section>
            )}

            {/* HeyGen avatar section */}
            <section>
              <p className="text-xs text-gray-500 font-semibold mb-1">② VÍDEO PARA O AVATAR</p>
              <p className="text-xs text-gray-600 mb-3">Grave 3–10 segundos falando para a câmera. O HeyGen usará seu rosto para gerar o vídeo.</p>
              {videoPreview ? (
                <div className="relative w-fit mb-3">
                  <video src={videoPreview} className="h-32 w-56 object-cover rounded-2xl border border-white/10" muted playsInline />
                  <button onClick={() => { setVideoFile(null); setVideoPreview(null); setAvatarId(""); if (videoFileRef.current) videoFileRef.current.value = ""; }}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                    <X className="h-3 w-3" />
                  </button>
                  {avatarId && <span className="mt-1.5 block text-xs text-emerald-400">✓ Avatar criado — será reutilizado</span>}
                </div>
              ) : (
                <button type="button" onClick={() => videoFileRef.current?.click()}
                  className="flex flex-col items-center justify-center w-full h-24 rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all gap-1.5 text-gray-500 mb-3">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm">Clique para enviar vídeo (MP4/MOV)</span>
                </button>
              )}
              <input ref={videoFileRef} type="file" accept="video/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setVideoFile(f); setVideoPreview(URL.createObjectURL(f)); setAvatarId(""); setVStatus("idle"); setVUrl(""); }} />

              <button onClick={() => setShowHeyGen((v) => !v)} className="flex items-center justify-between w-full text-left mb-3">
                <p className="text-xs text-gray-500 font-semibold">③ GERAR VÍDEO COM HEYGEN</p>
                <span className="text-xs text-purple-400">{showHeyGen ? "▲" : "▼"}</span>
              </button>

              {showHeyGen && (
                <div className="space-y-4 rounded-2xl bg-white/5 border border-white/10 p-4">
                  <textarea value={vScript} onChange={(e) => setVScript(e.target.value)} placeholder="Script gerado aparece aqui automaticamente..." rows={4}
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-purple-500/50" />

                  {vStatus === "idle" && (
                    <button onClick={genHeyGenVideo} disabled={!videoFile || !vScript}
                      className={cn("w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                        !videoFile || !vScript ? "bg-purple-900/30 text-purple-400/40 cursor-not-allowed" : "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90")}>
                      <Video className="h-4 w-4" /> Gerar vídeo com HeyGen
                    </button>
                  )}

                  {isProcessing && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-sm text-purple-300">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        <span>{V_STATUS_LABEL[vStatus]}</span>
                      </div>
                      <div className="flex gap-1">
                        {V_STEPS.map((s, i) => (
                          <div key={s} className={cn("h-1 flex-1 rounded-full transition-all",
                            V_STEPS.indexOf(vStatus) >= i ? "bg-purple-500" : "bg-white/10")} />
                        ))}
                      </div>
                    </div>
                  )}

                  {vStatus === "done" && vUrl && (
                    <div className="space-y-3">
                      <video src={vUrl} controls className="w-full rounded-xl border border-white/10" />
                      <div className="flex gap-2">
                        <a href={vUrl} download target="_blank" rel="noopener noreferrer"
                          className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-gray-300 hover:border-purple-500/50 transition-colors">Baixar</a>
                        <button onClick={() => { setVStatus("idle"); setVUrl(""); }}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors">Gerar outro</button>
                      </div>
                    </div>
                  )}

                  {vStatus === "error" && (
                    <div className="space-y-2">
                      <p className="text-sm text-red-400">{vError}</p>
                      <button onClick={() => setVStatus("idle")}
                        className="px-4 py-2 rounded-xl text-xs font-semibold border border-white/15 text-gray-300 hover:border-red-500/50 transition-colors">Tentar novamente</button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* ══════════════ TAB: Produto ══════════════ */}
        {mainTab === "produto" && (
          <>
            <section className="space-y-4">
              <p className="text-xs text-gray-500 font-semibold">INFORMAÇÕES DO PRODUTO</p>

              {/* Imagem */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Foto do produto <span className="text-gray-600">(opcional)</span></label>
                {prodImagePreview ? (
                  <div className="relative w-fit">
                    <img src={prodImagePreview} alt="produto" className="h-32 w-32 object-cover rounded-2xl border border-white/10" />
                    <button
                      onClick={() => { setProdImage(null); setProdImagePreview(null); if (prodImageRef.current) prodImageRef.current.value = ""; }}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => prodImageRef.current?.click()}
                    className="flex flex-col items-center justify-center w-full h-24 rounded-2xl border-2 border-dashed border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all gap-1.5 text-gray-500">
                    <Upload className="h-4 w-4" />
                    <span className="text-sm">Foto do produto (JPG/PNG)</span>
                    <span className="text-xs text-gray-600">A IA usa a imagem para criar o conteúdo visual</span>
                  </button>
                )}
                <input ref={prodImageRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setProdImage(f); setProdImagePreview(URL.createObjectURL(f)); }} />
              </div>

              {/* Campos */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">Nome do produto *</label>
                  <input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="Ex: Creme Hidratante Corporal Premium"
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">Descrição breve</label>
                  <textarea value={prodDesc} onChange={(e) => setProdDesc(e.target.value)} rows={2} placeholder="Ex: Hidratação profunda com manteiga de karité e vitamina E"
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-purple-500/50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 font-medium block mb-1">Preço</label>
                    <input value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} placeholder="Ex: R$ 49,90"
                      className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-purple-500/50" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-medium block mb-1">CTA final</label>
                    <input value={prodCta} onChange={(e) => setProdCta(e.target.value)} placeholder="Ex: Compre agora"
                      className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-purple-500/50" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">Benefícios principais</label>
                  <textarea value={prodBenefits} onChange={(e) => setProdBenefits(e.target.value)} rows={2} placeholder="Ex: Absorção rápida, sem oleosidade, dura 24h, vegano"
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-purple-500/50" />
                </div>
              </div>

              {/* Formato */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">Formato</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: "reel",  label: "🎬 Reels",  sub: "15–30 segundos" },
                    { id: "story", label: "📱 Stories", sub: "5 telas sequenciais" },
                  ] as { id: "reel" | "story"; label: string; sub: string }[]).map(({ id, label, sub }) => (
                    <button key={id} onClick={() => setProdFormat(id)}
                      className={cn("p-3 rounded-xl border text-left transition-colors",
                        prodFormat === id
                          ? "border-purple-500/60 bg-purple-500/15"
                          : "border-white/[0.08] hover:border-white/20")}>
                      <p className={cn("text-sm font-semibold", prodFormat === id ? "text-purple-300" : "text-gray-300")}>{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={generateProductVideo}
                disabled={prodLoading || !prodName.trim()}
                className={cn(
                  "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                  prodLoading || !prodName.trim()
                    ? "bg-purple-900/40 text-purple-400/50 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-cyan-500 text-white hover:opacity-90"
                )}
              >
                {prodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {prodLoading ? "Gerando storyboard..." : `Gerar storyboard de ${prodFormat === "reel" ? "Reel" : "Stories"}`}
              </button>
            </section>

            {prodResult && (
              <section>
                <StoryboardResult text={prodResult} format={prodFormat} />
                <button onClick={() => setProdResult("")} className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                  ← Editar informações
                </button>
              </section>
            )}
          </>
        )}

      </div>
    </div>
  );
}
