import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, SlidersHorizontal, Sparkles, WandSparkles } from "lucide-react";

type Suggestion = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: "high" | "medium" | "low";
  recommendedIntensity: number;
  prompt: string;
};

type Analysis = {
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: Suggestion[];
  technicalPreset: { brightness: number; saturation: number; sharpen: number; quality: number };
  recommendedPrompt: string;
};

type Props = {
  tenantId: string;
  assetId: string;
  filename?: string | null;
  canGenerateAi: boolean;
  onUpdated?: () => Promise<void> | void;
};

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

const GOALS = [
  ["professional", "Melhoria profissional"],
  ["product", "Produto / catálogo"],
  ["architecture", "Arquitetura / ambiente"],
  ["social", "Redes sociais"],
  ["ads", "Anúncio / campanha"],
] as const;

export default function ImageAdvisorPanel({ tenantId, assetId, filename, canGenerateAi, onUpdated }: Props) {
  const [goal, setGoal] = useState("professional");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [intensity, setIntensity] = useState(60);
  const [brightness, setBrightness] = useState(1.04);
  const [saturation, setSaturation] = useState(1.05);
  const [sharpen, setSharpen] = useState(0.8);
  const [quality, setQuality] = useState(92);
  const [customInstruction, setCustomInstruction] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState<"technical" | "ai" | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setAnalysis(null);
    setSelected([]);
    setError("");
    setCustomInstruction("");
  }, [assetId]);

  const selectedSuggestions = useMemo(
    () => analysis?.suggestions.filter((item) => selected.includes(item.id)) ?? [],
    [analysis, selected],
  );

  async function analyze() {
    if (!tenantId || !assetId) return;
    setAnalyzing(true);
    setError("");
    try {
      const goalText: Record<string, string> = {
        professional: "uso profissional geral, mantendo aspecto natural e fiel ao original",
        product: "catálogo e ecommerce, valorizando o produto sem alterar características reais",
        architecture: "arquitetura e interiores, preservando materiais, proporções e projeto",
        social: "redes sociais, com impacto visual sem descaracterizar o conteúdo",
        ads: "anúncios de alta conversão, mantendo representação verdadeira do produto/serviço",
      };
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/images/${assetId}/analyze`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ goal: goalText[goal] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao analisar imagem");
      const next = body.analysis as Analysis;
      setAnalysis(next);
      const highPriority = next.suggestions.filter((item) => item.priority === "high").map((item) => item.id);
      setSelected(highPriority.length ? highPriority : next.suggestions.slice(0, 3).map((item) => item.id));
      setBrightness(next.technicalPreset.brightness);
      setSaturation(next.technicalPreset.saturation);
      setSharpen(next.technicalPreset.sharpen);
      setQuality(next.technicalPreset.quality);
      const average = next.suggestions.length
        ? Math.round(next.suggestions.reduce((sum, item) => sum + item.recommendedIntensity, 0) / next.suggestions.length)
        : 60;
      setIntensity(average);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao analisar imagem");
    } finally {
      setAnalyzing(false);
    }
  }

  async function applyTechnical() {
    setApplying("technical");
    setError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/image-tools`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          assetId,
          operation: "image_enhance",
          title: `${filename || "Imagem"} — melhoria orientada`,
          options: { brightness, saturation, sharpen, quality },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao aplicar ajuste técnico");
      await onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aplicar ajuste técnico");
    } finally {
      setApplying(null);
    }
  }

  async function applyAi() {
    if (!analysis || !canGenerateAi) return;
    setApplying("ai");
    setError("");
    try {
      const chosen = selectedSuggestions.length ? selectedSuggestions : analysis.suggestions.slice(0, 3);
      const promptParts = chosen.map((item) => `${item.title}: ${item.prompt} Apply at approximately ${intensity}% strength.`);
      if (customInstruction.trim()) promptParts.push(`User instruction: ${customInstruction.trim()}`);
      promptParts.push("Preserve all real product/architecture geometry, materials, proportions, logos and identifying details. Do not invent text, objects or features that are not present in the original.");
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          operation: "image_variations",
          title: `${filename || "Imagem"} — melhoria IA`,
          context: { assetId, count: 1, prompt: promptParts.join(" "), size: "1536x1024" },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao iniciar melhoria com IA");
      window.setTimeout(() => void onUpdated?.(), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao aplicar melhoria com IA");
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.035]">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold"><WandSparkles className="h-4 w-4 text-violet-600" /> Assistente de melhoria</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && <div className="space-y-4 border-t p-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select value={goal} onChange={(event) => setGoal(event.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">
            {GOALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button disabled={analyzing} onClick={() => void analyze()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white disabled:opacity-50">
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {analysis ? "Analisar novamente" : "Analisar imagem"}
          </button>
        </div>

        {analysis && <>
          <div className="rounded-lg bg-background p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Diagnóstico:</strong> {analysis.summary}</div>

          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold">Melhorias sugeridas</p><span className="text-[10px] text-muted-foreground">Escolha o que aplicar</span></div>
            <div className="space-y-2">
              {analysis.suggestions.map((item) => {
                const checked = selected.includes(item.id);
                return <button key={item.id} type="button" onClick={() => setSelected((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])} className={`w-full rounded-lg border p-2.5 text-left transition ${checked ? "border-violet-400 bg-violet-500/8" : "bg-background hover:bg-muted/40"}`}>
                  <div className="flex gap-2"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-violet-600 bg-violet-600 text-white" : "border-muted-foreground/30"}`}>{checked && <Check className="h-3 w-3" />}</span><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-xs font-medium">{item.title}</p><span className={`rounded-full px-1.5 py-0.5 text-[9px] ${item.priority === "high" ? "bg-red-100 text-red-700" : item.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{item.priority === "high" ? "Prioritária" : item.priority === "medium" ? "Recomendada" : "Opcional"}</span></div><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p></div></div>
                </button>;
              })}
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <div className="mb-3 flex items-center gap-2"><SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" /><p className="text-xs font-semibold">Ajustar intensidade</p></div>
            <label className="block text-[10px] text-muted-foreground">Intensidade da IA · {intensity}%<input className="mt-1 w-full accent-violet-600" type="range" min={10} max={100} step={5} value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} /></label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] text-muted-foreground">Brilho · {brightness.toFixed(2)}<input className="mt-1 w-full accent-violet-600" type="range" min={0.7} max={1.4} step={0.01} value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} /></label>
              <label className="text-[10px] text-muted-foreground">Saturação · {saturation.toFixed(2)}<input className="mt-1 w-full accent-violet-600" type="range" min={0.5} max={1.7} step={0.01} value={saturation} onChange={(event) => setSaturation(Number(event.target.value))} /></label>
              <label className="text-[10px] text-muted-foreground">Nitidez · {sharpen.toFixed(2)}<input className="mt-1 w-full accent-violet-600" type="range" min={0.3} max={3} step={0.1} value={sharpen} onChange={(event) => setSharpen(Number(event.target.value))} /></label>
              <label className="text-[10px] text-muted-foreground">Qualidade · {quality}%<input className="mt-1 w-full accent-violet-600" type="range" min={60} max={100} step={1} value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>
            </div>
            <textarea value={customInstruction} onChange={(event) => setCustomInstruction(event.target.value)} rows={2} placeholder="Algo específico? Ex.: clarear a fachada sem alterar as pedras, manter céu natural..." className="mt-3 w-full resize-none rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-violet-500/20" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button disabled={applying !== null} onClick={() => void applyTechnical()} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50">{applying === "technical" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SlidersHorizontal className="h-3.5 w-3.5" />} Aplicar técnico</button>
            <button disabled={!canGenerateAi || applying !== null} onClick={() => void applyAi()} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2 text-xs font-semibold text-white disabled:opacity-50">{applying === "ai" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Aplicar com IA</button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">O original nunca é alterado. Cada aplicação cria uma nova versão/ativo na Biblioteca.</p>
        </>}

        {!analysis && !analyzing && <p className="text-[11px] leading-relaxed text-muted-foreground">A IA avalia iluminação, cor, nitidez, composição, fundo, perspectiva e adequação ao uso. Depois você escolhe e regula cada melhoria antes de aplicar.</p>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div>}
      </div>}
    </div>
  );
}
