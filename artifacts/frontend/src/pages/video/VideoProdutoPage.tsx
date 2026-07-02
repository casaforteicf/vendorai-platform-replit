import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Sparkles, ShoppingBag, Upload, X, Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function StoryboardResult({ text, format }: { text: string; format: string }) {
  const [copied, setCopied] = useState(false);
  const copyAll = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const sections = text
    .split(/\n(?=(?:TELA \d|GANCHO|PROBLEMA|SOLUÇÃO|PROVA|CTA|INTERESSE|OFERTA))/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const colors = [
    "from-purple-500/20 border-purple-500/30",
    "from-cyan-500/20 border-cyan-500/30",
    "from-pink-500/20 border-pink-500/30",
    "from-amber-500/20 border-amber-500/30",
    "from-emerald-500/20 border-emerald-500/30",
  ];
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

export default function VideoProdutoPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();

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

  const generate = async () => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        <button
          onClick={() => navigate("/content-studio/video")}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20">
            <ShoppingBag className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">Vídeo de Produto</h1>
            <p className="text-sm text-gray-400">Gere storyboard e roteiro para apresentar seu produto</p>
          </div>
        </div>

        {!prodResult ? (
          <section className="space-y-4">
            <p className="text-xs text-gray-500 font-semibold">INFORMAÇÕES DO PRODUTO</p>

            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1.5">
                Foto do produto <span className="text-gray-600">(opcional)</span>
              </label>
              {prodImagePreview ? (
                <div className="relative w-fit">
                  <img src={prodImagePreview} alt="produto" className="h-32 w-32 object-cover rounded-2xl border border-white/10" />
                  <button
                    onClick={() => { setProdImage(null); setProdImagePreview(null); if (prodImageRef.current) prodImageRef.current.value = ""; }}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => prodImageRef.current?.click()}
                  className="flex flex-col items-center justify-center w-full h-24 rounded-2xl border-2 border-dashed border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all gap-1.5 text-gray-500">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm">Foto do produto (JPG/PNG)</span>
                  <span className="text-xs text-gray-600">A IA usa a imagem para criar o conteúdo visual</span>
                </button>
              )}
              <input ref={prodImageRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setProdImage(f); setProdImagePreview(URL.createObjectURL(f)); }} />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">Nome do produto *</label>
                <input value={prodName} onChange={(e) => setProdName(e.target.value)}
                  placeholder="Ex: Creme Hidratante Corporal Premium"
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-amber-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">Descrição breve</label>
                <textarea value={prodDesc} onChange={(e) => setProdDesc(e.target.value)} rows={2}
                  placeholder="Ex: Hidratação profunda com manteiga de karité e vitamina E"
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-amber-500/50" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">Preço</label>
                  <input value={prodPrice} onChange={(e) => setProdPrice(e.target.value)}
                    placeholder="Ex: R$ 49,90"
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-amber-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-medium block mb-1">CTA final</label>
                  <input value={prodCta} onChange={(e) => setProdCta(e.target.value)}
                    placeholder="Ex: Compre agora"
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 focus:outline-none focus:border-amber-500/50" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1">Benefícios principais</label>
                <textarea value={prodBenefits} onChange={(e) => setProdBenefits(e.target.value)} rows={2}
                  placeholder="Ex: Absorção rápida, sem oleosidade, dura 24h, vegano"
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-sm text-[#e8e4f8] placeholder-gray-500 px-3 py-2.5 resize-none focus:outline-none focus:border-amber-500/50" />
              </div>
            </div>

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
                        ? "border-amber-500/60 bg-amber-500/15"
                        : "border-white/[0.08] hover:border-white/20")}>
                    <p className={cn("text-sm font-semibold", prodFormat === id ? "text-amber-300" : "text-gray-300")}>{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={generate}
              disabled={prodLoading || !prodName.trim()}
              className={cn(
                "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all",
                prodLoading || !prodName.trim()
                  ? "bg-amber-900/40 text-amber-400/50 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90"
              )}
            >
              {prodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {prodLoading ? "Gerando storyboard..." : `Gerar storyboard de ${prodFormat === "reel" ? "Reel" : "Stories"}`}
            </button>
          </section>
        ) : (
          <section className="space-y-4">
            <StoryboardResult text={prodResult} format={prodFormat} />
            <button onClick={() => setProdResult("")} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
              ← Editar informações
            </button>
          </section>
        )}

      </div>
    </div>
  );
}
