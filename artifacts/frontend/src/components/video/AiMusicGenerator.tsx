import { useEffect, useState } from "react";
import { Loader2, Sparkles, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";

function authHeader(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    "Content-Type": "application/json",
  };
}

type CapabilityStatus = "ready" | "building";

interface AiMusicGeneratorProps {
  tenantId: string;
  onGenerated: (assetId: string) => Promise<void> | void;
}

const DURATION_OPTIONS = [15, 30, 45, 60];

export default function AiMusicGenerator({ tenantId, onGenerated }: AiMusicGeneratorProps) {
  const [capability, setCapability] = useState<CapabilityStatus>("building");
  const [checking, setChecking] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [style, setStyle] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const loadCapability = async () => {
    if (!tenantId) return;
    setChecking(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/capabilities`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
      });
      const data = await response.json();
      setCapability(data?.capabilities?.music_generate === "ready" ? "ready" : "building");
    } catch {
      setCapability("building");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void loadCapability();
  }, [tenantId]);

  const handleGenerate = async () => {
    if (!tenantId || capability !== "ready" || !prompt.trim() || generating) return;
    setGenerating(true);
    setError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/tracks/generate`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({
          prompt: prompt.trim(),
          durationSeconds,
          style: style.trim() || null,
          mood: mood.trim() || null,
          energy: energy.trim() || null,
          instrumental: true,
          title: prompt.trim().slice(0, 100),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao gerar trilha");
      if (!data.assetId) throw new Error("A trilha foi gerada sem assetId");
      await onGenerated(String(data.assetId));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Falha ao gerar trilha");
    } finally {
      setGenerating(false);
    }
  };

  if (checking) {
    return (
      <div className="rounded-xl border border-white/10 p-4 flex items-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando motor de música…
      </div>
    );
  }

  if (capability !== "ready") {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
        <div className="flex items-start gap-2.5">
          <WandSparkles className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-200">Motor de música aguardando GPU</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              O recurso está instalado no VendorAI, mas só será liberado quando o worker GPU confirmar modelo e CUDA prontos.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadCapability()}
          className="text-[11px] text-amber-300 hover:text-amber-200"
        >
          Verificar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-purple-500/20 bg-purple-500/[0.04] p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-purple-500/15 text-purple-300 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-200">Criar trilha instrumental</p>
          <p className="text-[11px] text-gray-500">Descreva clima, ritmo, instrumentos e finalidade do vídeo.</p>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value.slice(0, 1500))}
        rows={3}
        placeholder="Ex.: trilha elegante e tecnológica, ritmo crescente, piano leve e synth, para anúncio premium de 30 segundos"
        className="w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-gray-200 outline-none placeholder:text-gray-600 focus:border-purple-500/40"
      />

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-gray-500">Duração</p>
        <div className="grid grid-cols-4 gap-1.5">
          {DURATION_OPTIONS.map((duration) => (
            <button
              key={duration}
              type="button"
              onClick={() => setDurationSeconds(duration)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-[11px] transition-all",
                durationSeconds === duration
                  ? "border-purple-500/40 bg-purple-500/10 text-purple-200"
                  : "border-white/10 text-gray-500 hover:border-white/20",
              )}
            >
              {duration}s
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input
          value={style}
          onChange={(event) => setStyle(event.target.value.slice(0, 200))}
          placeholder="Estilo"
          className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-gray-200 outline-none placeholder:text-gray-600 focus:border-purple-500/40"
        />
        <input
          value={mood}
          onChange={(event) => setMood(event.target.value.slice(0, 120))}
          placeholder="Clima"
          className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-gray-200 outline-none placeholder:text-gray-600 focus:border-purple-500/40"
        />
        <input
          value={energy}
          onChange={(event) => setEnergy(event.target.value.slice(0, 120))}
          placeholder="Energia"
          className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-gray-200 outline-none placeholder:text-gray-600 focus:border-purple-500/40"
        />
      </div>

      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-300">{error}</div>}

      <button
        type="button"
        disabled={!prompt.trim() || generating}
        onClick={() => void handleGenerate()}
        className="w-full rounded-xl bg-purple-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {generating ? "Gerando trilha…" : "Gerar com IA"}
      </button>

      <p className="text-[10px] leading-relaxed text-gray-600">
        A trilha gerada é salva automaticamente na Biblioteca com o registro de origem e direitos do Media Engine.
      </p>
    </div>
  );
}
