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
  Siren,
  TriangleAlert,
} from "lucide-react";

type EngineeringAlert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  source: "railway" | "vercel" | "github" | "runtime" | "pull_request";
};

type SentinelWatchdog = {
  running: boolean;
  intervalMs: number;
  lastCheckedAt: string | null;
  lastHealthScore: number | null;
  lastCriticalCount: number;
  lastWarningCount: number;
  consecutiveCritical: number;
  lastTransitionAt: string | null;
  lastError: string | null;
};

type OperationalContext = {
  observedRevision: string | null;
  mainRevision: string | null;
  productionState: "aligned" | "stale" | "unknown";
  openDevPrs: Array<{ number: number; title: string; head: string; updatedAt: string }>;
  memoryCount: number;
  healthScore?: number;
  alerts?: EngineeringAlert[];
  checks?: Array<{ context: string; state: string; targetUrl: string | null }>;
  watchdog?: SentinelWatchdog;
  checkedAt: string;
};

type ProductionValidation = {
  success: boolean;
  state: "validated" | "stale" | "unknown_revision" | "github_unavailable" | "vercel_pending" | "frontend_unreachable";
  observedRevision: string | null;
  mainRevision: string | null;
  uptimeSeconds?: number;
  checkedAt: string;
};

type DevAgentReadiness = {
  state: "ready" | "degraded" | "blocked";
  checkedAt: string;
  reasons: string[];
  checks: {
    github: "ready" | "degraded" | "blocked";
    executor: "ready" | "degraded" | "blocked";
    memory: "ready" | "degraded" | "blocked";
    runtime: "ready" | "degraded" | "blocked";
    production: "ready" | "degraded" | "blocked";
  };
  executor: {
    available: boolean;
    mode: "primary" | "fallback" | "unavailable";
    activeModel: string | null;
    primaryModel: string;
    fallbackModel: string;
    primaryOk: boolean;
    fallbackOk: boolean;
    checkedAt: string;
    expiresAt: string;
  };
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

type ExecutionMemoryEntry = {
  requestId: string;
  route: string;
  recordedAt: string;
  status: string;
  summary: string;
  mergeSha?: string;
  failures: string[];
  evidence: string[];
};

type Props = {
  active: boolean;
  authHeaders: () => { "Content-Type": string; Authorization?: string };
};

const layers = [
  "Preflight de Prontidão",
  "Cérebro Executivo",
  "Investigador Técnico",
  "Memória Técnica",
  "Playbooks Aprendidos",
  "Grafo Vivo de Impacto",
  "Conselho de Especialistas",
  "Planner",
  "Simulador Pré-Mortem",
  "Revisor Adversarial",
  "Validador Pós-Deploy",
  "Sentinela de Produção",
  "Watchdog 24h",
  "Memória de Incidentes",
];

function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 9) : "indisponível";
}

function normalizeStatus(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, " ");
}

function isProvenPlaybook(entry: ExecutionMemoryEntry) {
  return /recover|validat|success|complete|conclu|deploy/.test(normalizeStatus(entry.status));
}

function productionLabel(state?: ProductionValidation["state"]) {
  if (state === "validated") return "Produção alinhada";
  if (state === "stale") return "Produção atrasada";
  if (state === "github_unavailable") return "GitHub indisponível";
  if (state === "vercel_pending") return "Vercel pendente";
  if (state === "frontend_unreachable") return "Frontend indisponível";
  return "Revisão não confirmada";
}

function scoreLabel(score: number) {
  if (score >= 90) return "Saudável";
  if (score >= 70) return "Atenção";
  return "Crítico";
}

function severityClass(severity: EngineeringAlert["severity"]) {
  if (severity === "critical") return "border-red-200 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function readinessLabel(state?: DevAgentReadiness["state"]) {
  if (state === "ready") return "Pronto";
  if (state === "degraded") return "Degradado";
  if (state === "blocked") return "Bloqueado";
  return "Verificando";
}

function readinessClass(state?: DevAgentReadiness["state"]) {
  if (state === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (state === "blocked") return "border-red-200 bg-red-50 text-red-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function checkLabel(value: "ready" | "degraded" | "blocked") {
  if (value === "ready") return "OK";
  if (value === "blocked") return "Bloqueado";
  return "Atenção";
}

function incidentStatus(entry: ExecutionMemoryEntry) {
  return entry.status === "production_recovered" ? "Recuperado" : "Incidente";
}

function incidentClass(entry: ExecutionMemoryEntry) {
  return entry.status === "production_recovered"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-red-200 bg-red-50 text-red-900";
}

export default function DevEngineeringCenterTab({ active, authHeaders }: Props) {
  const [context, setContext] = useState<OperationalContext | null>(null);
  const [validation, setValidation] = useState<ProductionValidation | null>(null);
  const [readiness, setReadiness] = useState<DevAgentReadiness | null>(null);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [playbooks, setPlaybooks] = useState<ExecutionMemoryEntry[]>([]);
  const [incidents, setIncidents] = useState<ExecutionMemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(options?: { silent?: boolean }) {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const headers = authHeaders();
      const [contextResponse, validationResponse, readinessResponse, memoryResponse] = await Promise.all([
        fetch("/api/support/dev/operational-context", { headers }),
        fetch("/api/support/dev/validate-production", {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        }),
        fetch("/api/support/dev/readiness", { headers }),
        fetch("/api/support/dev/memory", { headers }),
      ]);

      const contextData = await contextResponse.json().catch(() => ({}));
      const validationData = await validationResponse.json().catch(() => ({}));
      const readinessData = await readinessResponse.json().catch(() => ({}));
      const memoryData = await memoryResponse.json().catch(() => ({}));

      if (!contextResponse.ok) throw new Error(contextData?.error ?? "Falha ao carregar contexto operacional");
      if (!validationResponse.ok) throw new Error(validationData?.error ?? "Falha ao validar produção");
      if (!readinessResponse.ok) throw new Error(readinessData?.error ?? "Falha ao verificar prontidão do Dev IA");

      const executionMemory: ExecutionMemoryEntry[] = Array.isArray(memoryData?.executionMemory) ? memoryData.executionMemory : [];
      setContext(contextData?.context ?? null);
      setValidation(validationData ?? null);
      setReadiness(readinessData?.readiness ?? null);
      setMemory(Array.isArray(memoryData?.memory) ? memoryData.memory.slice().reverse().slice(0, 8) : []);
      setPlaybooks(executionMemory.filter(isProvenPlaybook).slice().reverse().slice(0, 8));
      setIncidents(
        executionMemory
          .filter((item) => item?.status === "production_incident" || item?.status === "production_recovered")
          .slice()
          .reverse()
          .slice(0, 8),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Centro de Engenharia");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = window.setInterval(() => void refresh({ silent: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const aligned = validation?.state === "validated";
  const alerts = context?.alerts ?? [];
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  const healthScore = context?.healthScore ?? (aligned ? 100 : 70);
  const watchdog = context?.watchdog;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Centro de Engenharia</h3>
          <p className="mt-1 text-xs text-slate-500">Estado técnico da plataforma, prontidão do Dev IA, Sentinela de Produção e camadas cognitivas.</p>
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

      <section className={`mb-4 rounded-2xl border p-4 shadow-sm ${readinessClass(readiness?.state)}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold">Preflight do Dev IA</h4>
              <p className="mt-1 text-[11px] opacity-75">Confirma se o agente consegue investigar e executar antes de aceitar uma mudança.</p>
            </div>
          </div>
          <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">{readinessLabel(readiness?.state)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
          {readiness ? Object.entries(readiness.checks).map(([name, value]) => (
            <span key={name} className="rounded-full bg-white/70 px-2.5 py-1">{name}: {checkLabel(value)}</span>
          )) : <span className="rounded-full bg-white/70 px-2.5 py-1">executando preflight...</span>}
        </div>
        {readiness?.executor && (
          <p className="mt-2 text-[11px] opacity-80">
            Executor: {readiness.executor.activeModel ?? "indisponível"} · modo {readiness.executor.mode}
            {readiness.executor.mode === "fallback" ? ` · principal ${readiness.executor.primaryModel} indisponível` : ""}
          </p>
        )}
        {readiness?.reasons?.length ? (
          <div className="mt-2 space-y-1 text-[11px] opacity-80">
            {readiness.reasons.slice(0, 3).map((reason) => <p key={reason}>• {reason}</p>)}
          </div>
        ) : null}
      </section>

      <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Siren className={`h-4 w-4 ${criticalCount ? "text-red-600" : warningCount ? "text-amber-600" : "text-emerald-600"}`} />
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Sentinela de Produção</h4>
              <p className="text-[11px] text-slate-500">
                {watchdog?.running ? "Watchdog server-side ativo 24h · ciclo de 5 minutos." : "Monitor server-side iniciando; painel revalida a cada 60 segundos."}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-slate-950">{healthScore}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{scoreLabel(healthScore)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">{criticalCount} críticos</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">{warningCount} avisos</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{alerts.length} sinais</span>
          <span className={`rounded-full px-2.5 py-1 font-semibold ${watchdog?.running ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {watchdog?.running ? "24h ativo" : "24h iniciando"}
          </span>
        </div>
        {watchdog?.lastCheckedAt && (
          <p className="mt-2 text-[10px] text-slate-400">
            Última checagem server-side: {new Date(watchdog.lastCheckedAt).toLocaleString("pt-BR")}
            {watchdog.consecutiveCritical > 0 ? ` · ${watchdog.consecutiveCritical} ciclos críticos consecutivos` : ""}
          </p>
        )}
        {watchdog?.lastError && <p className="mt-2 text-[10px] font-medium text-amber-700">Última falha do watchdog: {watchdog.lastError}</p>}
      </section>

      {alerts.length > 0 && (
        <section className="mb-4 space-y-2">
          {alerts.slice(0, 8).map((alert) => (
            <div key={alert.id} className={`rounded-2xl border p-3 text-xs ${severityClass(alert.severity)}`}>
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">{alert.title}</p>
                  <p className="mt-1 leading-relaxed opacity-80">{alert.detail}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase opacity-60">{alert.source}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
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
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4" /> Playbooks</div>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{playbooks.length}</p>
          <p className="text-[11px] text-slate-500">execuções comprovadas disponíveis</p>
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

      <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-950">Playbooks Aprendidos</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-emerald-800/80">Soluções anteriores com desfecho positivo confirmado. Servem como experiência reutilizável, nunca como autorização automática: código, runtime, risco e testes atuais continuam obrigatórios.</p>
            </div>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">{playbooks.length} comprovados</span>
        </div>
        <div className="mt-3 space-y-2">
          {playbooks.length === 0 ? (
            <p className="rounded-xl bg-white/70 p-3 text-xs text-emerald-900/70">Ainda não há execução histórica suficiente para promover um playbook comprovado.</p>
          ) : playbooks.map((item) => (
            <div key={`${item.requestId}-${item.status}-${item.recordedAt}`} className="rounded-xl border border-emerald-100 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">Comprovado</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.status}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-900">{item.summary}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">{new Date(item.recordedAt).toLocaleString("pt-BR")}</span>
              </div>
              <p className="mt-2 truncate text-[10px] text-slate-500">Rota: {item.route || "não informada"}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                {item.mergeSha ? <span className="rounded-full bg-slate-100 px-2 py-1">main {shortSha(item.mergeSha)}</span> : null}
                {item.evidence?.slice(0, 3).map((evidence) => <span key={evidence} className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">{evidence}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Siren className="h-4 w-4 text-slate-700" /><h4 className="text-sm font-semibold text-slate-900">Timeline de incidentes e lições</h4></div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{incidents.length} recentes</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Falhas e recuperações permanecem visíveis para evitar repetir decisões ruins e contextualizar playbooks originados de incidentes.</p>
        <div className="mt-3 space-y-2">
          {incidents.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum incidente confirmado foi registrado pela Sentinela.</p>
          ) : incidents.map((item) => (
            <div key={`${item.requestId}-${item.status}-${item.recordedAt}`} className={`rounded-xl border p-3 ${incidentClass(item)}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide">{incidentStatus(item)}</span>
                <span className="text-[10px] opacity-60">{new Date(item.recordedAt).toLocaleString("pt-BR")}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed">{item.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] opacity-70">
                {item.mergeSha ? <span>main {shortSha(item.mergeSha)}</span> : null}
                {item.failures?.slice(0, 3).map((failure) => <span key={failure}>· {failure}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

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
