import { useCallback, useEffect, useState } from "react";
import { Activity, Gauge, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Confidence = "insufficient" | "provisional" | "validated";

type FidelitySummary = {
  score: number | null;
  completeness: number;
  confidence: Confidence;
  components: {
    technical: number | null;
    visual: number | null;
    human: number | null;
  };
  pendingChecks: string[];
};

type DeepFidelity = {
  status?: string;
  sampledFrames?: number;
  scores?: {
    faceConsistency?: number;
    expressionCoverage?: number;
    gazeCoverage?: number;
    lipMotionCoverage?: number;
    gestureCoverage?: number;
    postureStability?: number;
    naturalness?: number;
    visualScore?: number;
  };
  observations?: string[];
  recommendations?: string[];
};

type BehaviorDNA = {
  gestureIntensity?: "low" | "medium" | "high";
  expressionIntensity?: "low" | "medium" | "high";
  smileFrequency?: "low" | "medium" | "high";
  gazeVariation?: "low" | "medium" | "high";
  movementEnergy?: "low" | "medium" | "high";
  postureStyle?: "upright" | "relaxed" | "mixed";
  presentationStyle?: "calm" | "balanced" | "energetic";
  notes?: string[];
};

type QualityAnalysis = {
  fidelityScore?: number | null;
  fidelityCompleteness?: number;
  fidelityConfidence?: Confidence;
  fidelity?: FidelitySummary;
  deepFidelityStatus?: string;
  deepFidelity?: DeepFidelity | null;
  deepFidelityError?: string | null;
  technicalScore?: number | null;
};

type IdentityMetadata = {
  qualityAnalysis?: QualityAnalysis;
  behaviorDNA?: BehaviorDNA;
};

type Props = {
  tenantId: string;
  identityId: string;
};

const PENDING_LABELS: Record<string, string> = {
  technical_capture: "qualidade técnica das referências",
  deep_visual_fidelity: "fidelidade visual profunda",
  human_duble_test: "avaliação humana do teste",
  prosody_similarity: "similaridade automática de prosódia",
  voice_identity_similarity: "similaridade automática de voz",
};

const LEVEL_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  upright: "Erguida",
  relaxed: "Relaxada",
  mixed: "Mista",
  calm: "Calmo",
  balanced: "Equilibrado",
  energetic: "Energético",
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function scoreTone(score: number | null | undefined) {
  if (typeof score !== "number") return "border-white/10 bg-white/[0.02] text-gray-400";
  if (score >= 80) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (score >= 60) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

function confidenceLabel(value: Confidence | undefined) {
  if (value === "validated") return "Validado";
  if (value === "provisional") return "Provisório";
  return "Incompleto";
}

function confidenceTone(value: Confidence | undefined) {
  if (value === "validated") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (value === "provisional") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-white/10 bg-white/[0.03] text-gray-400";
}

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    faceConsistency: "Consistência visual",
    expressionCoverage: "Expressões",
    gazeCoverage: "Olhar",
    lipMotionCoverage: "Movimento labial",
    gestureCoverage: "Gestos",
    postureStability: "Postura",
    naturalness: "Naturalidade",
  };
  return labels[key] ?? key;
}

export default function FidelityScorePanel({ tenantId, identityId }: Props) {
  const [metadata, setMetadata] = useState<IdentityMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/identities/${identityId}`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? `Falha ao carregar Fidelity Score (${response.status})`);
      const raw = data?.identity?.metadata;
      setMetadata(raw && typeof raw === "object" && !Array.isArray(raw) ? raw as IdentityMetadata : {});
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o Fidelity Score");
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [tenantId, identityId]);

  useEffect(() => {
    setLoading(true);
    void load(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

  const quality = metadata?.qualityAnalysis;
  const fidelity = quality?.fidelity;
  const score = fidelity?.score ?? quality?.fidelityScore ?? null;
  const completeness = fidelity?.completeness ?? quality?.fidelityCompleteness ?? 0;
  const confidence = fidelity?.confidence ?? quality?.fidelityConfidence;
  const components = fidelity?.components ?? {
    technical: quality?.technicalScore ?? null,
    visual: quality?.deepFidelity?.scores?.visualScore ?? null,
    human: null,
  };
  const pendingChecks = fidelity?.pendingChecks ?? [];
  const deep = quality?.deepFidelity;
  const dna = metadata?.behaviorDNA;

  if (loading) {
    return <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4"><div className="flex items-center gap-2 text-xs text-cyan-100"><Loader2 className="h-4 w-4 animate-spin" /> Carregando Fidelity Score...</div></section>;
  }

  return (
    <section className="rounded-xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-purple-500/5 to-transparent p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-cyan-300" /><p className="text-sm font-semibold">Fidelity Score · Dublê Digital</p></div>
          <p className="mt-1 text-[11px] text-gray-500">Combina qualidade técnica, fidelidade visual profunda e avaliação humana. É um indicador de qualidade de reprodução, não autenticação biométrica.</p>
        </div>
        <button type="button" onClick={() => void load(false)} disabled={refreshing} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-2 text-[11px] font-medium text-cyan-100 disabled:opacity-40">
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar score
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-200">{error}</div>}

      {typeof score === "number" ? (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.1fr_2fr]">
            <div className={cn("rounded-xl border p-4", scoreTone(score))}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] uppercase tracking-[0.16em] opacity-70">Fidelity Score</p><p className="mt-1 text-4xl font-bold">{score}<span className="text-sm font-normal opacity-60">/100</span></p></div>
                <span className={cn("rounded-full border px-2 py-1 text-[10px]", confidenceTone(confidence))}>{confidenceLabel(confidence)}</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-current transition-all" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div>
              <div className="mt-3 flex items-center justify-between text-[10px] opacity-70"><span>Completude do cálculo</span><span>{Math.round(completeness)}%</span></div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className={cn("rounded-xl border p-3", scoreTone(components.technical))}><p className="text-[10px] uppercase tracking-wide opacity-70">Técnico</p><p className="mt-1 text-2xl font-bold">{components.technical ?? "—"}<span className="text-xs font-normal opacity-60">/100</span></p><p className="mt-1 text-[10px] opacity-70">arquivo, áudio, resolução e FPS</p></div>
              <div className={cn("rounded-xl border p-3", scoreTone(components.visual))}><p className="text-[10px] uppercase tracking-wide opacity-70">Visual profundo</p><p className="mt-1 text-2xl font-bold">{components.visual ?? "—"}<span className="text-xs font-normal opacity-60">/100</span></p><p className="mt-1 text-[10px] opacity-70">rosto, expressão, olhar e movimento</p></div>
              <div className={cn("rounded-xl border p-3", scoreTone(components.human))}><p className="text-[10px] uppercase tracking-wide opacity-70">Teste humano</p><p className="mt-1 text-2xl font-bold">{components.human ?? "—"}<span className="text-xs font-normal opacity-60">/100</span></p><p className="mt-1 text-[10px] opacity-70">voz, semelhança, lip-sync e naturalidade</p></div>
            </div>
          </div>

          {deep?.status === "complete" && deep.scores && (
            <div className="rounded-xl border border-white/10 bg-black/10 p-3 space-y-3">
              <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-purple-300" /><p className="text-xs font-semibold text-gray-200">Leitura visual profunda</p>{typeof deep.sampledFrames === "number" && <span className="text-[10px] text-gray-600">· {deep.sampledFrames} quadros analisados</span>}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(deep.scores).filter(([key]) => key !== "visualScore").map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-gray-500">{metricLabel(key)}</span><span className="text-xs font-semibold text-gray-200">{typeof value === "number" ? `${value}/100` : "—"}</span></div>{typeof value === "number" && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>}</div>
                ))}
              </div>
            </div>
          )}

          {dna && (
            <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 space-y-3">
              <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-fuchsia-300" /><p className="text-xs font-semibold text-fuchsia-100">DNA audiovisual observável</p></div>
              <div className="flex flex-wrap gap-1.5">
                {dna.gestureIntensity && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">Gestos · {LEVEL_LABELS[dna.gestureIntensity]}</span>}
                {dna.expressionIntensity && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">Expressão · {LEVEL_LABELS[dna.expressionIntensity]}</span>}
                {dna.smileFrequency && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">Sorriso · {LEVEL_LABELS[dna.smileFrequency]}</span>}
                {dna.gazeVariation && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">Olhar · {LEVEL_LABELS[dna.gazeVariation]}</span>}
                {dna.movementEnergy && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">Energia · {LEVEL_LABELS[dna.movementEnergy]}</span>}
                {dna.postureStyle && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">Postura · {LEVEL_LABELS[dna.postureStyle]}</span>}
                {dna.presentationStyle && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">Apresentação · {LEVEL_LABELS[dna.presentationStyle]}</span>}
              </div>
              {dna.notes?.length ? <div className="space-y-1">{dna.notes.slice(0, 4).map((note, index) => <p key={`${note}-${index}`} className="text-[10px] text-gray-500">• {note}</p>)}</div> : null}
            </div>
          )}

          {deep?.recommendations?.length ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200">Como melhorar a fidelidade</p><div className="mt-2 space-y-1">{deep.recommendations.slice(0, 4).map((item, index) => <p key={`${item}-${index}`} className="text-[11px] text-amber-100/80">• {item}</p>)}</div></div> : null}

          {pendingChecks.length > 0 && <div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-[11px] text-gray-500"><span className="font-medium text-gray-300">Ainda pendente:</span> {pendingChecks.map((item) => PENDING_LABELS[item] ?? item).join(", ")}.</div>}

          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" /><p className="text-[10px] text-gray-500">A leitura profunda só utiliza referências autorizadas e sinais visíveis de apresentação. O VendorAI não usa este score para autenticar identidade civil nem para inferir atributos sensíveis.</p></div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-center">
          <p className="text-xs font-medium text-gray-300">Fidelity Score ainda não calculado</p>
          <p className="mx-auto mt-1 max-w-xl text-[11px] text-gray-600">Use “Analisar referências” no painel do Dublê. O VendorAI fará primeiro a análise técnica e, com os consentimentos necessários, executará também a leitura visual profunda.</p>
          {quality?.deepFidelityStatus === "consent_required" && <p className="mt-2 text-[10px] text-amber-300">A análise profunda aguarda autorização de rosto e geração por IA.</p>}
          {quality?.deepFidelityStatus === "unavailable" && <p className="mt-2 text-[10px] text-amber-300">A análise profunda está temporariamente indisponível{quality.deepFidelityError ? `: ${quality.deepFidelityError}` : "."}</p>}
        </div>
      )}
    </section>
  );
}
