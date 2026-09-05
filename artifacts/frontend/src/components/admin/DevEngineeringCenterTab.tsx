import { useEffect, useState } from "react";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  History,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

type OperationalContext = {
  observedRevision: string | null;
  mainRevision: string | null;
  productionState: "aligned" | "stale" | "unknown";
  openDevPrs: Array<{ number: number; title: string; head: string; updatedAt: string }>;
  memoryCount: number;
  checkedAt: string;
};

type ProductionValidation = {
  success: boolean;
  state: "validated" | "stale" | "unknown_revision" | "github_unavailable";
  observedRevision: string | null;
  mainRevision: string | null;
  uptimeSeconds: number;
  checkedAt: string;
};

type MemoryEntry = {
  requestId: string;
  route: string;
  recordedAt: string;
  primary: string;
  consulted: string[];
  consensus: string;
  confidence: number;
};

type Props = {
  active: boolean;
  authHeaders: () => { "Content-Type": string; Authorization?: string };
};

const layers = [
  "Cérebro Executivo",
  "Investigador Técnico",
  "Memória Técnica",
  "Grafo Vivo de Impacto",
  "Conselho de Especialistas",
  "Planner",
  "Simulador Pré-Mortem",
  "Revisor Adversarial",
  "Validador Pós-Deploy",
];

function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 9) : "indisponível";
}

function productionLabel(state?: ProductionValidation["state"]) {
  if (state === "validated") return "Produção alinhada";
  if (state === "stale") return "Produção atrasada";
  if (state === "github_unavailable") return "GitHub indisponível";
  return "Revisão não confirmada";
}

export default function DevEngineeringCenterTab({ active, authHeaders }: Props) {
  const [context, setContext] = useState<OperationalContext | null>(null);
  const [validation, setValidation] = useState<ProductionValidation | null>(null);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const headers = authHeaders();
      const [contextResponse, validationResponse, memoryResponse] = await Promise.all([
        fetch("/api/support/dev/operational-context", { headers }),
        fetch("/api/support/dev/validate-production", {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }),
        fetch("/api/support/dev/memory", { headers }),
      ]);

      const contextData = await contextResponse.json().catch(() => ({}));
      const validationData = await validationResponse.json().catch(() => ({}));
      const memoryData = await memoryResponse.json().catch(() => ({}));

      if (!contextResponse.ok) throw new Error(contextData?.error ?? "Falha ao carregar contexto operacional");
      if (!validationResponse.ok) throw new Error(validationData?.error ?? "Falha ao validar produção");

      setContext(contextData?.context ?? null);
      setValidation(validationData ?? null);
      setMemory(Array.isArray(memoryData?.memory) ? memoryData.memory.slice().reverse().slice(0, 8) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Centro de Engenharia");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (active) void refresh();
  }, [active]);

  if (!active) return null;

  const aligned = validation?.state === "validated";

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Centro de Engenharia</h3>
          <p className="mt-1 text-xs text-slate-500">Estado técnico da plataforma e das camadas cognitivas do Dev IA.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Server className="h-4 w-4" /> Produção</div>
          <p className={`mt-2 text-sm font-semibold ${aligned ? "text-emerald-700" : "text-amber-700"}`}>{productionLabel(validation?.state)}</p>
          <p className="mt-2 text-[11px] text-slate-500">Runtime {shortSha(validation?.observedRevision)}</p>
          <p className="text-[11px] text-slate-500">Main {shortSha(validation?.mainRevision)}</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><GitPullRequest className="h-4 w-4" /> Trabalho em andamento</div>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{context?.openDevPrs?.length ?? 0}</p>
          <p className="text-[11px] text-slate-500">PRs Dev IA abertos</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><History className="h-4 w-4" /> Memória técnica</div>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{context?.memoryCount ?? memory.length}</p>
          <p className="text-[11px] text-slate-500">decisões recentes disponíveis</p>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Activity className="h-4 w-4" /> Estado operacional</div>
          <p className="mt-2 text-sm font-semibold text-slate-950">{context?.productionState ?? "unknown"}</p>
          <p className="mt-1 text-[11px] text-slate-500">checado {context?.checkedAt ? new Date(context.checkedAt).toLocaleTimeString("pt-BR") : "—"}</p>
        </div>
      </div>

      <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-indigo-600" /><h4 className="text-sm font-semibold text-slate-900">Pipeline cognitivo</h4></div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {layers.map((layer) => (
            <div key={layer} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> {layer}
            </div>
          ))}
        </div>
      </section>

      {context?.openDevPrs?.length ? (
        <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900">PRs do Dev IA</h4>
          <div className="mt-3 space-y-2">
            {context.openDevPrs.map((pr) => (
              <div key={pr.number} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-800">#{pr.number} · {pr.title}</p>
                <p className="mt-1 truncate text-[11px] text-slate-500">{pr.head}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><h4 className="text-sm font-semibold text-slate-900">Memória recente</h4></div>
        <div className="mt-3 space-y-2">
          {memory.length === 0 ? <p className="text-xs text-slate-500">Nenhuma memória estruturada disponível ainda.</p> : memory.map((item) => (
            <div key={`${item.requestId}-${item.recordedAt}`} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase text-indigo-600">{item.primary}</span><span className="text-[10px] text-slate-400">{Math.round(item.confidence * 100)}%</span></div>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-700">{item.consensus}</p>
              <p className="mt-1 truncate text-[10px] text-slate-400">{item.route}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-900">Áreas relacionadas</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["Suporte", "/admin/suporte"],
            ["Relatos Técnicos", "/admin/relatos-tecnicos"],
            ["Novidades", "/admin/changelog"],
          ].map(([label, href]) => (
            <a key={href} href={href} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {label} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
