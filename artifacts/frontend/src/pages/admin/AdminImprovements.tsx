import { type ChangeEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  History,
  Plus,
  Paperclip,
  X,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  TestTube2,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Improvement = {
  id: string;
  title: string;
  description: string;
  module: string;
  priority: "baixa" | "media" | "alta" | "urgente";
  status: string;
  branch: string | null;
  prNumber: number | null;
  prUrl: string | null;
  homologUrl: string | null;
  productionUrl: string | null;
  packageKey: string | null;
  testStatus: "pending" | "running" | "passed" | "failed";
  testSummary: string | null;
  sourceType?: "super_admin" | "support" | "vendi" | "system" | "audit" | "user_request" | "bug" | "security" | "integration" | "infrastructure" | "hotfix";
  sourceRefId?: string | null;
  sourceTenantId?: string | null;
  changeScope?: "tenant" | "vertical" | "global_opcional" | "global" | "bug" | null;
  scopeReason?: string | null;
  tenantContextSnapshot?: Record<string, unknown> | null;
  ownerAgent?: string | null;
  agentStatus?: string | null;
  agentSummary?: string | null;
  requestedAt?: string | null;
  dueAt?: string | null;
  acceptanceCriteria?: string | null;
  riskSummary?: string | null;
  dependencies?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImprovementAttachment = {
  name: string;
  mimeType: string;
  content: string;
};

type ImpactFile = {
  path: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
};

type ReleaseImpact = {
  clean: boolean;
  checkedAt: string;
  expectedFiles: string[];
  actualFiles: ImpactFile[];
  unexpectedFiles: ImpactFile[];
  missingExpectedFiles: string[];
  notReady: Array<{ id: string; title: string; reason?: string }>;
  base?: { branch: string; sha: string };
  head?: { branch: string; sha: string };
};

type Release = {
  id: string;
  version: string;
  name: string;
  summary: string;
  status: string;
  improvementIds: string[];
  testUrl: string | null;
  testStatus: string;
  testSummary: string | null;
  impact: ReleaseImpact | null;
  approvedBy: string | null;
  approvedAt: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  publishedAt: string | null;
  durationMs: number | null;
  releasePrNumber: number | null;
  releasePrUrl: string | null;
  publishedSha: string | null;
  rollbackVersion: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReleaseMetrics = {
  scheduled: number;
  running: number;
  blocked: number;
  avg_duration_ms: number | string | null;
};

const RELEASE_LABELS: Record<string, string> = {
  draft: "Montando",
  ready: "Pronta",
  approved: "Aprovada",
  scheduled: "Agendada",
  publishing: "Publicando",
  monitoring: "Monitorando",
  published: "Publicada",
  blocked: "Bloqueada",
  cancelled: "Cancelada",
  rolled_back: "Rollback realizado",
};

const PRIORITY_LABELS: Record<string, string> = {
  baixa: "Baixa",
  media: "Normal",
  alta: "Alta",
  urgente: "Crítica",
};

const SCOPE_LABELS: Record<string, string> = {
  tenant: "Somente tenant",
  vertical: "Vertical",
  global_opcional: "Global opcional",
  global: "Global",
  bug: "Bug / investigar alcance",
};

const SOURCE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  support: "Suporte",
  vendi: "Vendi",
  system: "Sistema",
  audit: "Auditoria",
  user_request: "Solicitação",
  bug: "Bug",
  security: "Segurança",
  integration: "Integração",
  infrastructure: "Infraestrutura",
  hotfix: "Hotfix",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(value?: number | string | null) {
  const ms = Number(value ?? 0);
  if (!ms || !Number.isFinite(ms)) return "—";
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return String(min) + "m " + String(sec).padStart(2, "0") + "s";
}

const ACTIVE_STALE_MS = 30 * 60 * 1000;

function isStaleActive(item: Improvement) {
  const active =
    item.status === "em_desenvolvimento" ||
    item.status === "testando" ||
    item.status === "em_homologacao" ||
    item.agentStatus === "executando" ||
    (!!item.branch &&
      item.agentStatus !== "aguardando_checks" &&
      item.agentStatus !== "pr_legado_encadeado" &&
      item.status !== "homologado" &&
      item.status !== "aguardando_producao");
  if (!active) return false;
  const updatedAt = new Date(item.updatedAt).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > ACTIVE_STALE_MS;
}

function improvementSimpleStatus(item: Improvement) {
  if (item.status === "producao_validada") return "Concluído";
  if (item.agentStatus === "substituido_historico" || item.status === "cancelada") return "Histórico";
  if (item.agentStatus === "pr_legado_encadeado") return "Histórico";
  if (item.status === "mergeado_main") return "Publicando";
  if (item.status === "homologado" || item.status === "aguardando_producao") return "Aguardando sua aprovação";
  if (item.status === "bloqueada" || item.testStatus === "failed") return "Precisa de atenção";
  if (isStaleActive(item)) return "Precisa de atenção";
  return "Em andamento";
}

function operationalProgress(item: Improvement) {
  if (item.status === "producao_validada") return 100;
  if (item.status === "mergeado_main") return 95;
  if (item.agentStatus === "substituido_historico" || item.status === "cancelada") return 100;
  if (item.agentStatus === "pr_legado_encadeado") return 25;
  if (item.agentStatus === "aguardando_checks" && item.testStatus !== "failed") return 55;
  if (item.status === "bloqueada" || item.testStatus === "failed") return 55;
  if (item.status === "aguardando_producao" || item.status === "homologado") return 90;
  if (item.status === "em_homologacao") return 80;
  if (item.testStatus === "passed" && item.prNumber) return 75;
  if (item.testStatus === "running" || item.status === "testando") return 65;
  if (item.prNumber) return 55;
  if (item.branch || item.status === "em_desenvolvimento") return 35;
  if (item.agentStatus && item.agentStatus !== "aguardando") return 20;
  return 5;
}

function nextOperationalAction(item: Improvement) {
  const status = improvementSimpleStatus(item);
  if (status === "Concluído") return "Nenhuma ação necessária";
  if (status === "Publicando") return "O sistema publica, valida e troca de rota automaticamente se necessário";
  if (status === "Aguardando sua aprovação") return "Aprovar produção ou pedir alteração";
  if (status === "Histórico") return "Item legado ou substituído; não faz parte da fila ativa";
  if (status === "Precisa de atenção") return "Vendi está recuperando a execução; se depender de decisão humana, a aprovação será solicitada";
  if (item.agentStatus === "aguardando_checks") return "Aguardando evidência real dos checks do GitHub";
  if (item.testStatus === "running" || item.status === "testando") return "Checks em execução; Vendi acompanha e avança assim que concluírem";
  if (item.testStatus === "passed" && item.prNumber) return "Checks aprovados; Vendi prepara a próxima etapa de homologação";
  if (item.branch || item.status === "em_desenvolvimento") return "Desenvolvimento ativo; Vendi deve registrar a próxima ação concreta";
  return "Vendi prepara a próxima ação técnica";
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (["Concluído", "published"].includes(status)) return "default";
  if (status === "Precisa de atenção" || status === "blocked") return "destructive";
  if (status === "Histórico") return "outline";
  if (["Em andamento", "Aguardando sua aprovação", "Publicando", "scheduled", "monitoring", "publishing"].includes(status)) return "secondary";
  return "outline";
}

export default function AdminImprovements() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"improvements" | "releases">("improvements");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Improvement | null>(null);
  const [releaseDetail, setReleaseDetail] = useState<Release | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState<Release | null>(null);
  const [adjustOpen, setAdjustOpen] = useState<Improvement | null>(null);
  const [busy, setBusy] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [attachments, setAttachments] = useState<ImprovementAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    module: "Plataforma",
    priority: "media",
    sourceType: "user_request",
    packageKey: "",
    acceptanceCriteria: "",
    riskSummary: "",
    dependencies: "",
  });
  const [releaseForm, setReleaseForm] = useState({
    name: "",
    summary: "",
  });

  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterProgress, setFilterProgress] = useState("all");
  const [filterDue, setFilterDue] = useState("all");
  const [filterActivity, setFilterActivity] = useState("all");
  const [filterPr, setFilterPr] = useState("all");

  const headers = useMemo(() => ({
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  }), [token]);

  const improvementsQuery = useQuery<{ items: Improvement[] }>({
    queryKey: ["admin", "improvements"],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch("/api/admin/improvements", { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "HTTP " + response.status);
      return body;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const releasesQuery = useQuery<{ items: Release[] }>({
    queryKey: ["admin", "releases"],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch("/api/admin/releases", { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "HTTP " + response.status);
      return body;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const executionControl = useQuery<{ mode: "running" | "paused" | "draining"; reason: string | null }>({
    queryKey: ["admin", "release-execution-control"],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch("/api/admin/releases/execution-control", { headers });
      if (!response.ok) throw new Error("Controle de execução indisponível; aplique a migração antes de ativar.");
      return response.json();
    },
    retry: false,
    refetchInterval: 15000,
  });

  const metricsQuery = useQuery<ReleaseMetrics>({
    queryKey: ["admin", "releases-metrics"],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch("/api/admin/releases-metrics", { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "HTTP " + response.status);
      return body;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  });

  const github = useQuery<{ ready: boolean; repository?: string; reason?: string; private?: boolean }>({
    queryKey: ["admin", "improvements", "github-readiness"],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch("/api/admin/improvements/github-readiness", { headers });
      return response.json();
    },
    staleTime: 60000,
  });

  useQuery({
    queryKey: ["admin", "improvements", "github-auto-reconcile"],
    enabled: !!token && github.data?.ready === true,
    queryFn: async () => {
      const response = await fetch("/api/admin/improvements/github-reconcile", { method: "POST", headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Falha ao sincronizar GitHub");
      if ((body.created ?? 0) > 0 || (body.updated ?? 0) > 0) {
        void qc.invalidateQueries({ queryKey: ["admin", "improvements"] });
      }
      return body;
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    retry: false,
  });

  const items = improvementsQuery.data?.items ?? [];
  const releases = releasesQuery.data?.items ?? [];
  const selectedItems = items.filter((item) => selected.has(item.id));
  const readySelected = selectedItems.filter((item) => item.testStatus === "passed" && !!item.prNumber);

  const canonicalItems = useMemo(() => {
    const byKey = new Map<string, Improvement>();
    for (const item of items) {
      const key = item.prNumber ? `pr:${item.prNumber}` : `id:${item.id}`;
      const current = byKey.get(key);
      if (!current || new Date(item.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
        byKey.set(key, item);
      }
    }
    return [...byKey.values()];
  }, [items]);

  const filteredItems = useMemo(() => {
    const search = filterSearch.trim().toLowerCase();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
    const weekEnd = todayStart + 7 * 24 * 60 * 60 * 1000;

    return items.filter((item) => {
      const simple = improvementSimpleStatus(item);
      const progress = operationalProgress(item);
      const updatedAt = new Date(item.updatedAt).getTime();
      const dueAt = item.dueAt ? new Date(item.dueAt).getTime() : null;
      const agent = (item.ownerAgent || "Vendi").toLowerCase();

      if (search) {
        const haystack = [
          item.title,
          item.description,
          item.module,
          item.prNumber ? "PR #" + item.prNumber : "",
          item.ownerAgent || "Vendi",
          item.agentStatus || "",
          item.agentSummary || "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      if (filterStatus !== "all" && simple !== filterStatus) return false;
      if (filterSource !== "all" && (item.sourceType ?? "super_admin") !== filterSource) return false;
      if (filterAgent !== "all" && agent !== filterAgent) return false;
      if (filterPriority !== "all" && item.priority !== filterPriority) return false;

      if (filterProgress === "0-25" && !(progress >= 0 && progress <= 25)) return false;
      if (filterProgress === "26-50" && !(progress >= 26 && progress <= 50)) return false;
      if (filterProgress === "51-75" && !(progress >= 51 && progress <= 75)) return false;
      if (filterProgress === "76-99" && !(progress >= 76 && progress <= 99)) return false;
      if (filterProgress === "100" && progress !== 100) return false;

      if (filterDue === "overdue" && !(dueAt !== null && dueAt < todayStart && simple !== "Concluído")) return false;
      if (filterDue === "today" && !(dueAt !== null && dueAt >= todayStart && dueAt < tomorrowStart)) return false;
      if (filterDue === "week" && !(dueAt !== null && dueAt >= todayStart && dueAt < weekEnd)) return false;
      if (filterDue === "none" && dueAt !== null) return false;

      if (filterActivity === "today" && !(updatedAt >= todayStart)) return false;
      if (filterActivity === "7d" && !(updatedAt >= todayStart - 7 * 24 * 60 * 60 * 1000)) return false;
      if (filterActivity === "stale" && !isStaleActive(item)) return false;

      if (filterPr === "with" && !item.prNumber) return false;
      if (filterPr === "without" && !!item.prNumber) return false;
      if (filterPr === "failed" && item.testStatus !== "failed") return false;
      if (filterPr === "merged" && item.status !== "mergeado_main" && item.status !== "producao_validada") return false;

      return true;
    });
  }, [
    items,
    filterSearch,
    filterStatus,
    filterSource,
    filterAgent,
    filterPriority,
    filterProgress,
    filterDue,
    filterActivity,
    filterPr,
  ]);

  const agentOptions = useMemo(
    () => [...new Set(items.map((item) => (item.ownerAgent || "Vendi").toLowerCase()))].sort(),
    [items],
  );

  const activeFilterCount = [
    filterSearch.trim() ? "search" : "",
    filterStatus !== "all" ? filterStatus : "",
    filterSource !== "all" ? filterSource : "",
    filterAgent !== "all" ? filterAgent : "",
    filterPriority !== "all" ? filterPriority : "",
    filterProgress !== "all" ? filterProgress : "",
    filterDue !== "all" ? filterDue : "",
    filterActivity !== "all" ? filterActivity : "",
    filterPr !== "all" ? filterPr : "",
  ].filter(Boolean).length;

  function clearFilters() {
    setFilterSearch("");
    setFilterStatus("all");
    setFilterSource("all");
    setFilterAgent("all");
    setFilterPriority("all");
    setFilterProgress("all");
    setFilterDue("all");
    setFilterActivity("all");
    setFilterPr("all");
  }

  function filterBySummaryStatus(status: string) {
    setView("improvements");
    setFilterStatus((current) => current === status ? "all" : status);
  }

  const totalHistoryCount = items.length;
  const uniqueImprovementCount = canonicalItems.length;
  const duplicateCount = Math.max(0, totalHistoryCount - uniqueImprovementCount);
  const inProgressCount = canonicalItems.filter((item) => improvementSimpleStatus(item) === "Em andamento").length;
  const awaitingApprovalCount = canonicalItems.filter((item) => improvementSimpleStatus(item) === "Aguardando sua aprovação").length;
  const publishingCount = canonicalItems.filter((item) => improvementSimpleStatus(item) === "Publicando").length;
  const completedCount = canonicalItems.filter((item) => improvementSimpleStatus(item) === "Concluído").length;
  const attentionCount = canonicalItems.filter((item) => improvementSimpleStatus(item) === "Precisa de atenção").length;

  async function post(path: string, payload?: unknown, successMessage?: string) {
    setBusy(path);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "HTTP " + response.status);
      if (successMessage) toast({ title: successMessage });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "improvements"] }),
        qc.invalidateQueries({ queryKey: ["admin", "releases"] }),
        qc.invalidateQueries({ queryKey: ["admin", "releases-metrics"] }),
      ]);
      return body;
    } catch (error) {
      toast({
        title: "Não foi possível concluir",
        description: error instanceof Error ? error.message : "Falha inesperada",
        variant: "destructive",
      });
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function reconcileGithub() {
    if (!github.data?.ready) {
      toast({
        title: "GitHub não está disponível",
        description: github.data?.reason || "Verifique a configuração do GitHub na homologação.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await post("/api/admin/improvements/github-reconcile");
      toast({
        title: "GitHub reconciliado",
        description: `${result.updated ?? 0} atualizada(s), ${result.created ?? 0} criada(s), ${result.inconsistent ?? 0} inconsistência(s), ${result.closedWithoutMerge ?? 0} fechado(s) sem merge e ${result.conflicted ?? 0} conflito(s).`,
      });
      await github.refetch();
    } catch {
      // O helper post já apresenta o erro ao usuário.
    }
  }

  async function handleImprovementAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploadingAttachment || attachments.length >= 5) return;
    setUploadingAttachment(true);
    try {
      const payload = new FormData();
      payload.append("file", file);
      const response = await fetch("/api/support/file/interpret", {
        method: "POST",
        headers: token ? { Authorization: "Bearer " + token } : undefined,
        body: payload,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível interpretar o anexo.");
      setAttachments((current) => [...current, {
        name: String(body?.name ?? file.name),
        mimeType: String(body?.mimeType ?? file.type ?? "application/octet-stream"),
        content: String(body?.content ?? "").slice(0, 20000),
      }]);
    } catch (error) {
      toast({
        title: "Falha ao adicionar anexo",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function createImprovement() {
    setBusy("create");
    try {
      const response = await fetch("/api/admin/improvements", {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          module: form.module,
          priority: form.priority,
          sourceType: form.sourceType,
          packageKey: form.packageKey || null,
          acceptanceCriteria: form.acceptanceCriteria,
          riskSummary: form.riskSummary,
          dependencies: form.dependencies,
          attachments,
          homologUrl: "https://homolog.appvendorai.com",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "HTTP " + response.status);
      toast({ title: "Melhoria criada", description: "O Vendi já pode assumir o desenvolvimento." });
      setCreateOpen(false);
      setAttachments([]);
      setForm({
        title: "",
        description: "",
        module: "Plataforma",
        priority: "media",
        sourceType: "user_request",
        packageKey: "",
        acceptanceCriteria: "",
        riskSummary: "",
        dependencies: "",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "improvements"] });
      if (body?.id) {
        void post("/api/admin/improvements/" + body.id + "/start-agent", undefined, "Vendi iniciou o desenvolvimento");
      }
    } catch (error) {
      toast({
        title: "Falha ao criar melhoria",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setBusy("");
    }
  }

  async function createRelease() {
    if (!readySelected.length) return;
    const body = await post("/api/admin/releases", {
      name: releaseForm.name,
      summary: releaseForm.summary,
      ids: readySelected.map((item) => item.id),
    }, "Publicação criada");
    setReleaseOpen(false);
    setReleaseForm({ name: "", summary: "" });
    setSelected(new Set());
    setView("releases");
    if (body?.id) {
      const fresh = await qc.fetchQuery<{ items: Release[] }>({
        queryKey: ["admin", "releases"],
        queryFn: async () => {
          const response = await fetch("/api/admin/releases", { headers });
          if (!response.ok) throw new Error("Falha ao atualizar publicações");
          return response.json();
        },
      });
      setReleaseDetail(fresh.items.find((item) => item.id === body.id) ?? null);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function defaultReleaseName() {
    const modules = [...new Set(readySelected.map((item) => item.module))];
    if (!modules.length) return "Melhorias da plataforma";
    if (modules.length <= 2) return "Melhorias de " + modules.join(" e ");
    return "Melhorias da plataforma";
  }

  function openReleaseDialog() {
    setReleaseForm({
      name: defaultReleaseName(),
      summary: readySelected.map((item) => item.title).join(" • "),
    });
    setReleaseOpen(true);
  }

  async function confirmSchedule() {
    if (!scheduleOpen || !scheduleAt) return;
    const iso = new Date(scheduleAt).toISOString();
    await post("/api/admin/releases/" + scheduleOpen.id + "/schedule", { scheduledAt: iso }, "Publicação agendada");
    setScheduleOpen(null);
    setScheduleAt("");
  }

  async function confirmAdjustment() {
    if (!adjustOpen || adjustment.trim().length < 2) return;
    await post("/api/admin/improvements/" + adjustOpen.id + "/adjustments", { message: adjustment }, "Ajuste enviado ao Vendi");
    setAdjustOpen(null);
    setAdjustment("");
  }

  const allReadySelected = readySelected.length === selectedItems.length && selectedItems.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-5 overflow-x-hidden px-3 pb-24 pt-4 sm:px-4 md:p-6 md:pb-24">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Superadmin</Badge>
            <Badge
              variant={github.data?.ready ? "default" : "outline"}
              title={github.data?.ready ? github.data?.repository : github.data?.reason}
            >
              GitHub {github.data?.ready ? "conectado" : "não conectado"}
            </Badge>
            <Badge variant="outline">Produção protegida</Badge>
            <Badge variant="secondary">Acompanhamento automático • 15s</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Melhorias & Publicações</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Acompanhe andamento, homologação, aprovação, publicação e validação real. A autonomia só executa operações habilitadas e comprovadas pelos controles de release.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button className="w-full sm:w-auto"
            variant="outline"
            onClick={() => void reconcileGithub()}
            disabled={!github.data?.ready || busy === "/api/admin/improvements/github-reconcile"}
          >
            <RefreshCw className={"mr-2 h-4 w-4 " + (busy === "/api/admin/improvements/github-reconcile" ? "animate-spin" : "")} />
            Reconciliar GitHub
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => {
              improvementsQuery.refetch();
              releasesQuery.refetch();
              metricsQuery.refetch();
            }}
            disabled={improvementsQuery.isFetching || releasesQuery.isFetching}
          >
            <RefreshCw className={"mr-2 h-4 w-4 " + ((improvementsQuery.isFetching || releasesQuery.isFetching) ? "animate-spin" : "")} />
            Atualizar
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova melhoria
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Execução automática de releases</p>
          <p className="text-xs text-muted-foreground">Estado: {executionControl.isError ? "indisponível" : executionControl.data?.mode === "running" ? "Em execução" : executionControl.data?.mode === "draining" ? "Pausa segura" : executionControl.data?.mode === "paused" ? "Pausada" : "Consultando..."}. Acompanhamento pós-publicação continua ativo na pausa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!executionControl.data || executionControl.data.mode === "running" || !!busy} onClick={() => void post("/api/admin/releases/execution-control", { mode: "running", reason: "Retomada pelo Superadmin" }, "Fila retomada").then(() => executionControl.refetch()).catch(() => undefined)}>Retomar</Button>
          <Button variant="outline" disabled={!executionControl.data || executionControl.data.mode !== "running" || !!busy} onClick={() => void post("/api/admin/releases/execution-control", { mode: "draining", reason: "Pausa segura pelo Superadmin" }, "Pausa segura solicitada").then(() => executionControl.refetch()).catch(() => undefined)}>Pausa segura</Button>
          <Button variant="outline" disabled={!executionControl.data || executionControl.data.mode === "paused" || !!busy} onClick={() => void post("/api/admin/releases/execution-control", { mode: "paused", reason: "Pausa pelo Superadmin" }, "Novos releases pausados").then(() => executionControl.refetch()).catch(() => undefined)}>Pausar</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Em andamento", inProgressCount],
          ["Aguardando sua aprovação", awaitingApprovalCount],
          ["Publicando", publishingCount],
          ["Concluído", completedCount],
          ["Precisa de atenção", attentionCount],
        ].map(([status, count]) => (
          <button
            key={String(status)}
            type="button"
            onClick={() => filterBySummaryStatus(String(status))}
            className={"min-w-0 rounded-2xl border bg-card p-3 text-left transition hover:border-primary/40 hover:shadow-sm sm:p-4 " +
              (filterStatus === status ? "border-primary ring-1 ring-primary/20" : "")}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {status === "Aguardando sua aprovação" ? "Sua aprovação" : status === "Concluído" ? "Concluídas" : String(status)}
            </p>
            <p className="mt-1 text-2xl font-semibold">{Number(count)}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-2 border-b">
        <button
          className={"border-b-2 px-3 py-2 text-sm font-medium " + (view === "improvements" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
          onClick={() => setView("improvements")}
        >
          Melhorias
        </button>
        <button
          className={"border-b-2 px-3 py-2 text-sm font-medium " + (view === "releases" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}
          onClick={() => setView("releases")}
        >
          Publicações
        </button>
      </div>

      {view === "improvements" && (
        <>
          <div className="rounded-2xl border bg-card p-3 sm:p-4">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <div className="xl:col-span-2">
                <Input
                  value={filterSearch}
                  onChange={(event) => setFilterSearch(event.target.value)}
                  placeholder="Buscar melhoria, módulo, PR ou texto..."
                  className="h-9"
                />
              </div>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
                <option value="all">Todos os status</option>
                <option value="Em andamento">Em andamento</option>
                <option value="Aguardando sua aprovação">Aguardando aprovação</option>
                <option value="Publicando">Publicando</option>
                <option value="Precisa de atenção">Precisa de atenção</option>
                <option value="Concluído">Concluído</option>
                <option value="Histórico">Histórico</option>
              </select>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterSource} onChange={(event) => setFilterSource(event.target.value)}>
                <option value="all">Todas as origens</option>
                {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterAgent} onChange={(event) => setFilterAgent(event.target.value)}>
                <option value="all">Todos os agentes</option>
                {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
              </select>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)}>
                <option value="all">Todas as prioridades</option>
                <option value="urgente">Crítica</option>
                <option value="alta">Alta</option>
                <option value="media">Normal</option>
                <option value="baixa">Baixa</option>
              </select>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterProgress} onChange={(event) => setFilterProgress(event.target.value)}>
                <option value="all">Qualquer progresso</option>
                <option value="0-25">0–25%</option>
                <option value="26-50">26–50%</option>
                <option value="51-75">51–75%</option>
                <option value="76-99">76–99%</option>
                <option value="100">100%</option>
              </select>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterDue} onChange={(event) => setFilterDue(event.target.value)}>
                <option value="all">Qualquer prazo</option>
                <option value="overdue">Atrasadas</option>
                <option value="today">Prazo hoje</option>
                <option value="week">Prazo em 7 dias</option>
                <option value="none">Sem prazo</option>
              </select>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterActivity} onChange={(event) => setFilterActivity(event.target.value)}>
                <option value="all">Qualquer atividade</option>
                <option value="today">Atualizadas hoje</option>
                <option value="7d">Atualizadas em 7 dias</option>
                <option value="stale">Sem atividade recente</option>
              </select>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={filterPr} onChange={(event) => setFilterPr(event.target.value)}>
                <option value="all">Qualquer PR</option>
                <option value="with">Com PR</option>
                <option value="without">Sem PR</option>
                <option value="failed">Teste falhou</option>
                <option value="merged">Mergeado / produção</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Exibindo <span className="font-semibold text-foreground">{filteredItems.length}</span> de {items.length} melhoria(s)
                {activeFilterCount > 0 ? " • " + activeFilterCount + " filtro(s) ativo(s)" : ""}
              </p>
              {activeFilterCount > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-4 w-4" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium">{selected.size} melhoria(s) selecionada(s)</p>
                {!allReadySelected && (
                  <p className="text-xs text-muted-foreground">
                    Apenas melhorias com testes aprovados e PR podem entrar em uma publicação.
                  </p>
                )}
              </div>
              <Button size="sm" onClick={openReleaseDialog} disabled={!allReadySelected}>
                <Rocket className="mr-2 h-4 w-4" />
                Criar publicação
              </Button>
            </div>
          )}

          <div className="grid min-w-0 gap-3 lg:hidden">
            {filteredItems.map((item) => {
              const simple = improvementSimpleStatus(item);
              const progress = operationalProgress(item);
              return (
                <article key={item.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggle(item.id)}
                      aria-label={"Selecionar " + item.title}
                    />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(item)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(simple)}>{simple}</Badge>
                        {item.prNumber && <span className="text-xs font-medium text-muted-foreground">PR #{item.prNumber}</span>}
                      </div>
                      <h2 className="mt-2 line-clamp-2 text-base font-semibold leading-snug">{item.title}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.module} • {PRIORITY_LABELS[item.priority] ?? item.priority}
                      </p>
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">Progresso</span>
                      <span className="font-semibold">{progress}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: progress + "%" }} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-xl bg-muted/25 p-3 text-xs">
                    {isStaleActive(item) && (
                      <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-2 text-amber-800">
                        Sem atividade recente. A execução não é considerada ativa neste momento, mas isso não significa falha.
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground">Agora</p>
                      <p className="mt-1 font-medium">
                        {nextOperationalAction(item)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Próximo passo</p>
                      <p className="mt-1 font-medium">{nextOperationalAction(item)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-muted-foreground">Última atividade</p>
                        <p className="mt-1 font-medium">{formatDate(item.updatedAt)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Responsável</p>
                        <p className="mt-1 font-medium">{item.ownerAgent || "Vendi"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Ambiente</p>
                        <p className="mt-1 font-medium">
                          {item.status === "producao_validada" || item.status === "mergeado_main" ? "Produção" : item.status === "em_homologacao" || item.status === "homologado" || item.status === "pronto_staging" ? "Homologação" : "Desenvolvimento"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Release</p>
                        <p className="mt-1 font-medium">{item.packageKey || (item.status === "aguardando_producao" ? "Aguardando publicação" : "Ainda não criada")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11" onClick={() => setDetail(item)}>
                      Ver detalhes
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => {
                        setAdjustOpen(item);
                        setAdjustment("");
                      }}
                      disabled={simple === "Concluído"}
                    >
                      <WandSparkles className="mr-2 h-4 w-4" />
                      {simple === "Concluído" ? "Concluído" : "Pedir alteração"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border bg-card lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-3"></th>
                    <th className="px-3 py-3">Melhoria</th>
                    <th className="px-3 py-3">Origem</th>
                    <th className="px-3 py-3">Vendi</th>
                    <th className="px-3 py-3">Execução</th>
                    <th className="px-3 py-3">Próxima ação</th>
                    <th className="px-3 py-3">Última atividade</th>
                    <th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const simple = improvementSimpleStatus(item);
                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} />
                        </td>
                        <td className="max-w-[380px] px-3 py-3">
                          <button type="button" className="text-left font-medium hover:underline" onClick={() => setDetail(item)}>
                            {item.title}
                          </button>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{item.module}</span>
                            <span>• {PRIORITY_LABELS[item.priority] ?? item.priority}</span>
                            {item.prNumber && <span>• PR #{item.prNumber}</span>}
                            {item.changeScope && <span>• {SCOPE_LABELS[item.changeScope] ?? item.changeScope}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline">
                            {SOURCE_LABELS[item.sourceType ?? "super_admin"] ?? item.sourceType ?? "Super Admin"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs font-medium">{item.ownerAgent || "Vendi"}</p>
                              <p className="text-xs text-muted-foreground">{item.agentStatus || "aguardando"}</p>
                              {item.agentSummary && (
                                <p className="mt-1 max-w-[260px] line-clamp-2 text-xs text-muted-foreground" title={item.agentSummary}>
                                  {item.agentSummary}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="min-w-[190px] px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant={statusVariant(simple)}>{simple}</Badge>
                            <span className="text-xs font-medium">{operationalProgress(item)}%</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: operationalProgress(item) + "%" }} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {item.testStatus === "failed" ? "Teste falhou" : item.testStatus === "running" ? "Testes em andamento" : item.testStatus === "passed" ? "Testes aprovados" : "Aguardando evidências"}
                          </p>
                        </td>
                        <td className="max-w-[260px] px-3 py-3 text-xs">
                          <p className="font-medium">{nextOperationalAction(item)}</p>
                          {item.prNumber && <p className="mt-1 text-muted-foreground">PR #{item.prNumber}</p>}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <p>{formatDate(item.updatedAt)}</p>
                          <p className="mt-1 text-muted-foreground">{item.dueAt ? "Prazo: " + formatDate(item.dueAt) : "SLA: até 24h"}</p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setDetail(item)}>
                              Abrir
                            </Button>
                            {simple !== "Publicado" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!!busy}
                                onClick={() => post("/api/admin/improvements/" + item.id + "/start-agent", undefined, "Vendi assumiu/reiniciou esta melhoria")}
                              >
                                <WandSparkles className="mr-1 h-3.5 w-3.5" />
                                {simple === "Bloqueado" ? "Corrigir" : "Reexecutar"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!improvementsQuery.isLoading && filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-14 text-center text-muted-foreground">
                        {items.length === 0 ? "Nenhuma melhoria cadastrada." : "Nenhuma melhoria encontrada com os filtros atuais."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === "releases" && (
        <div className="space-y-3">
          {releases.map((release) => {
            const impact = release.impact;
            return (
              <div key={release.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{release.version}</Badge>
                      <Badge variant={statusVariant(release.status)}>
                        {RELEASE_LABELS[release.status] ?? release.status}
                      </Badge>
                      {impact && (
                        <Badge variant={impact.clean ? "default" : "destructive"}>
                          {impact.clean ? "Impacto conferido" : "Revisar impacto"}
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold">{release.name}</h3>
                    <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{release.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{release.improvementIds.length} melhoria(s)</span>
                      <span>Teste: {release.testStatus === "passed" ? "confirmado" : "pendente"}</span>
                      {release.scheduledAt && <span>Agendada: {formatDate(release.scheduledAt)}</span>}
                      {release.publishedAt && <span>Publicada: {formatDate(release.publishedAt)}</span>}
                      {release.durationMs && <span>Duração: {formatDuration(release.durationMs)}</span>}
                    </div>
                    {release.lastError && (
                      <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        <AlertTriangle className="mr-2 inline h-4 w-4" />
                        {release.lastError}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setReleaseDetail(release)}>
                      <History className="mr-1 h-3.5 w-3.5" />
                      Detalhes
                    </Button>
                    {release.testUrl && !["published", "rolled_back", "cancelled"].includes(release.status) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!busy || release.testStatus === "running"}
                          onClick={() => post("/api/admin/releases/" + release.id + "/vendi-test", undefined, "Vendi concluiu a validação da homologação")}
                        >
                          <Bot className="mr-1 h-3.5 w-3.5" />
                          {release.testStatus === "running" ? "Vendi testando..." : "Vendi testar"}
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={release.testUrl} target="_blank" rel="noreferrer">
                            <TestTube2 className="mr-1 h-3.5 w-3.5" />
                            Testar manualmente
                          </a>
                        </Button>
                      </>
                    )}
                    {!["published", "rolled_back", "cancelled", "publishing", "monitoring"].includes(release.status) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => post("/api/admin/releases/" + release.id + "/impact", undefined, "Impacto atualizado")}
                      >
                        <SearchCheck className="mr-1 h-3.5 w-3.5" />
                        Conferir impacto
                      </Button>
                    )}
                    {release.testStatus !== "passed" && release.status === "ready" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => post("/api/admin/releases/" + release.id + "/tested", undefined, "Teste manual confirmado")}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Confirmar teste manual
                      </Button>
                    )}
                    {release.status === "ready" && release.testStatus === "passed" && (
                      <Button
                        size="sm"
                        disabled={!!busy}
                        onClick={() => post("/api/admin/releases/" + release.id + "/approve", undefined, "Aprovado — publicação iniciada automaticamente")}
                      >
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        Aprovar e publicar
                      </Button>
                    )}
                    {release.status === "published" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => {
                          if (window.confirm("Confirmar rollback desta publicação?")) {
                            void post("/api/admin/releases/" + release.id + "/rollback", undefined, "Rollback iniciado");
                          }
                        }}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Rollback
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!releasesQuery.isLoading && releases.length === 0 && (
            <div className="rounded-2xl border bg-card px-6 py-14 text-center text-muted-foreground">
              Nenhuma publicação criada ainda.
            </div>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova melhoria</DialogTitle>
            <DialogDescription>
              Descreva a mudança em linguagem normal. O Vendi cuida da análise técnica, desenvolvimento, branch, PR e testes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Input placeholder="Nome da mudança" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea
              placeholder="O que precisa mudar? Como espera que funcione?"
              rows={6}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Anexos <span className="font-normal text-muted-foreground">(opcional)</span></p>
                  <p className="text-xs text-muted-foreground">Adicione prints, imagens, PDFs ou documentos. O Vendi usa o conteúdo como contexto da melhoria.</p>
                </div>
                <label className={"inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted " + (uploadingAttachment || attachments.length >= 5 ? "pointer-events-none opacity-50" : "")}>
                  {uploadingAttachment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                  {uploadingAttachment ? "Analisando..." : "Adicionar"}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.txt,.csv,.doc,.docx"
                    onChange={(event) => void handleImprovementAttachment(event)}
                    disabled={uploadingAttachment || attachments.length >= 5}
                  />
                </label>
              </div>
              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((attachment, index) => (
                    <div key={attachment.name + index} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{attachment.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{attachment.mimeType}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        aria-label={"Remover " + attachment.name}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Módulo / tela" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} />
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="media">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Crítica</option>
                <option value="baixa">Baixa</option>
              </select>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={form.sourceType}
                onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
              >
                <option value="user_request">Solicitação</option>
                <option value="audit">Auditoria</option>
                <option value="support">Suporte</option>
                <option value="bug">Bug</option>
                <option value="security">Segurança</option>
                <option value="integration">Integração</option>
                <option value="infrastructure">Infraestrutura</option>
                <option value="hotfix">Hotfix</option>
                <option value="vendi">Vendi</option>
                <option value="system">Sistema</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <Input placeholder="Pacote / onda (opcional)" value={form.packageKey} onChange={(e) => setForm({ ...form, packageKey: e.target.value })} />
            </div>
            <Textarea
              placeholder="Critérios de aceite: como saberemos que a melhoria ficou correta?"
              rows={3}
              value={form.acceptanceCriteria}
              onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea
                placeholder="Riscos / cuidados (opcional)"
                rows={3}
                value={form.riskSummary}
                onChange={(e) => setForm({ ...form, riskSummary: e.target.value })}
              />
              <Textarea
                placeholder="Dependências (opcional)"
                rows={3}
                value={form.dependencies}
                onChange={(e) => setForm({ ...form, dependencies: e.target.value })}
              />
            </div>
            <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
              Este registro passa a ser o histórico oficial da mudança. Desenvolvimento, testes, homologação, publicação e validação ficam vinculados à mesma melhoria.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createImprovement} disabled={busy === "create" || uploadingAttachment || form.title.trim().length < 3}>
              Criar e iniciar Vendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Criar publicação</DialogTitle>
            <DialogDescription>
              A versão será gerada automaticamente e ficará pronta para teste antes de qualquer alteração em produção.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Input
              placeholder="Nome da publicação"
              value={releaseForm.name}
              onChange={(e) => setReleaseForm({ ...releaseForm, name: e.target.value })}
            />
            <Textarea
              rows={4}
              placeholder="Resumo da publicação"
              value={releaseForm.summary}
              onChange={(e) => setReleaseForm({ ...releaseForm, summary: e.target.value })}
            />
            <div className="rounded-xl border p-3 text-sm">
              <p className="font-medium">{readySelected.length} melhoria(s) serão incluídas:</p>
              <div className="mt-2 space-y-1 text-muted-foreground">
                {readySelected.map((item) => <p key={item.id}>• {item.title}</p>)}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseOpen(false)}>Cancelar</Button>
            <Button onClick={createRelease} disabled={releaseForm.name.trim().length < 3 || !!busy}>
              Criar versão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scheduleOpen} onOpenChange={(open) => !open && setScheduleOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar publicação</DialogTitle>
            <DialogDescription>
              Opção técnica de agendamento. No fluxo normal, aprovar já inicia a publicação automaticamente.
            </DialogDescription>
          </DialogHeader>
          <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(null)}>Cancelar</Button>
            <Button onClick={confirmSchedule} disabled={!scheduleAt || !!busy}>Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustOpen} onOpenChange={(open) => !open && setAdjustOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar ajuste</DialogTitle>
            <DialogDescription>
              O ajuste fica no histórico da mesma melhoria. Se ela já estiver em uma publicação aprovada, a aprovação será invalidada.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={5} placeholder="Descreva o ajuste..." value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(null)}>Cancelar</Button>
            <Button onClick={confirmAdjustment} disabled={adjustment.trim().length < 2 || !!busy}>Enviar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.module} • {improvementSimpleStatus(detail)} • criada em {formatDate(detail.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="rounded-xl border bg-muted/20 p-4 text-sm whitespace-pre-wrap">
                  {detail.description || "Sem descrição."}
                </div>

                {isStaleActive(detail) && (
                  <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-800">
                    Esta melhoria está sem atividade recente. Ela não conta como execução ativa neste momento, mas permanece no estágio atual até haver evidência real de falha ou avanço.
                  </div>
                )}

                <div className="rounded-xl border p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Linha do tempo</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["Em andamento", 5],
                      ["Sua aprovação", 90],
                      ["Publicando", 95],
                      ["Concluído", 100],
                    ].map(([label, threshold]) => (
                      <Badge key={String(label)} variant={operationalProgress(detail) >= Number(threshold) ? "default" : "outline"}>
                        {String(label)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Origem</p>
                    <p className="mt-1 font-medium">{SOURCE_LABELS[detail.sourceType ?? "super_admin"] ?? detail.sourceType ?? "Super Admin"}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Escopo sugerido</p>
                    <p className="mt-1 font-medium">{detail.changeScope ? (SCOPE_LABELS[detail.changeScope] ?? detail.changeScope) : "Ainda não classificado"}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Responsável</p>
                    <p className="mt-1 font-medium">{detail.ownerAgent || "Vendi"}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Prazo do ciclo</p>
                    <p className="mt-1 font-medium">{detail.dueAt ? formatDate(detail.dueAt) : "Até 24h"}</p>
                  </div>
                </div>

                {(detail.scopeReason || detail.sourceTenantId || detail.tenantContextSnapshot) && (
                  <div className="rounded-xl border bg-muted/10 p-4 text-sm">
                    <p className="font-medium">Contexto da solicitação</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <p><span className="text-muted-foreground">Tenant:</span> {String(detail.tenantContextSnapshot?.tenantName ?? detail.sourceTenantId ?? "Não identificado")}</p>
                      <p><span className="text-muted-foreground">Vertical:</span> {String(detail.tenantContextSnapshot?.vertical ?? "Não definida")}</p>
                    </div>
                    {detail.scopeReason && <p className="mt-2 text-muted-foreground">{detail.scopeReason}</p>}
                  </div>
                )}

                {(detail.acceptanceCriteria || detail.riskSummary || detail.dependencies) && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Critérios de aceite</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{detail.acceptanceCriteria || "Não informado."}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Riscos</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{detail.riskSummary || "Não informado."}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Dependências</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{detail.dependencies || "Nenhuma informada."}</p>
                    </div>
                  </div>
                )}

                {detail.agentSummary && (
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Resumo do Vendi / Dev IA</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{detail.agentSummary}</p>
                  </div>
                )}

                {detail.testSummary && (
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Testes</p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{detail.testSummary}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAdjustOpen(detail);
                      setAdjustment("");
                    }}
                  >
                    <WandSparkles className="mr-2 h-4 w-4" />
                    Pedir alteração
                  </Button>
                  {(detail.status === "homologado" || detail.status === "aguardando_producao") && (
                    <Button
                      disabled={!!busy || detail.status === "aguardando_producao"}
                      onClick={() => post("/api/admin/improvements/approve-production", { ids: [detail.id] }, "Produção aprovada")}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {detail.status === "aguardando_producao" ? "Produção aprovada" : "Aprovar produção"}
                    </Button>
                  )}
                </div>

                <details className="rounded-xl border bg-muted/10 p-4">
                  <summary className="cursor-pointer text-sm font-medium">Detalhes e ações técnicas</summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => post("/api/admin/improvements/" + detail.id + "/start-agent", undefined, "Vendi iniciou o trabalho")}
                      disabled={!!busy}
                    >
                      <Bot className="mr-2 h-4 w-4" />
                      Reexecutar Vendi
                    </Button>
                    {detail.prNumber && (
                      <Button
                        variant="outline"
                        onClick={() => post("/api/admin/improvements/" + detail.id + "/check-tests", undefined, "Testes verificados")}
                        disabled={!!busy}
                      >
                        <SearchCheck className="mr-2 h-4 w-4" />
                        Verificar testes
                      </Button>
                    )}
                    {detail.testStatus === "passed" && detail.status !== "em_homologacao" && detail.status !== "producao_validada" && (
                      <Button
                        variant="outline"
                        onClick={() => post("/api/admin/improvements/" + detail.id + "/prepare-test", undefined, "Versão enviada para ambiente de teste")}
                        disabled={!!busy}
                      >
                        <TestTube2 className="mr-2 h-4 w-4" />
                        Preparar homologação
                      </Button>
                    )}
                    {detail.prUrl && (
                      <Button variant="ghost" asChild>
                        <a href={detail.prUrl} target="_blank" rel="noreferrer">
                          Abrir PR
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {detail.homologUrl && (
                      <Button variant="ghost" asChild>
                        <a href={detail.homologUrl} target="_blank" rel="noreferrer">
                          Abrir homologação
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </details>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!releaseDetail} onOpenChange={(open) => !open && setReleaseDetail(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {releaseDetail && (
            <>
              <DialogHeader>
                <DialogTitle>{releaseDetail.version} — {releaseDetail.name}</DialogTitle>
                <DialogDescription>
                  {RELEASE_LABELS[releaseDetail.status] ?? releaseDetail.status} • criada em {formatDate(releaseDetail.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Melhorias</p>
                    <p className="mt-1 text-lg font-semibold">{releaseDetail.improvementIds.length}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Teste</p>
                    <p className="mt-1 font-medium">{releaseDetail.testStatus === "passed" ? "Confirmado" : "Pendente"}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Aprovação</p>
                    <p className="mt-1 font-medium">{releaseDetail.approvedAt ? formatDate(releaseDetail.approvedAt) : "—"}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-muted-foreground">Publicação</p>
                    <p className="mt-1 font-medium">{releaseDetail.scheduledAt ? formatDate(releaseDetail.scheduledAt) : releaseDetail.publishedAt ? formatDate(releaseDetail.publishedAt) : "—"}</p>
                  </div>
                </div>

                {releaseDetail.impact && (
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">Comparação do que foi solicitado x o que mudou</p>
                        <p className="text-xs text-muted-foreground">Qualquer alteração não esperada bloqueia a publicação.</p>
                      </div>
                      <Badge variant={releaseDetail.impact.clean ? "default" : "destructive"}>
                        {releaseDetail.impact.clean ? "Sem mudança extra" : "Revisão necessária"}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg bg-muted/30 p-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Esperado</p>
                        <p className="mt-1 text-2xl font-semibold">{releaseDetail.impact.expectedFiles.length}</p>
                        <p className="text-xs text-muted-foreground">arquivos vinculados às melhorias</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Alterado</p>
                        <p className="mt-1 text-2xl font-semibold">{releaseDetail.impact.actualFiles.length}</p>
                        <p className="text-xs text-muted-foreground">arquivos na versão de teste</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Não esperado</p>
                        <p className="mt-1 text-2xl font-semibold">{releaseDetail.impact.unexpectedFiles.length}</p>
                        <p className="text-xs text-muted-foreground">bloqueia aprovação</p>
                      </div>
                    </div>

                    {releaseDetail.impact.unexpectedFiles.length > 0 && (
                      <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-sm font-medium text-destructive">Alterações fora do escopo</p>
                        <div className="mt-2 space-y-1 text-xs">
                          {releaseDetail.impact.unexpectedFiles.map((file) => (
                            <p key={file.path} className="font-mono">{file.path}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {releaseDetail.impact.missingExpectedFiles.length > 0 && (
                      <div className="mt-4 rounded-lg border p-3">
                        <p className="text-sm font-medium">Mudanças esperadas ainda não chegaram à versão de teste</p>
                        <div className="mt-2 space-y-1 text-xs">
                          {releaseDetail.impact.missingExpectedFiles.map((file) => (
                            <p key={file} className="font-mono">{file}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-xl border p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Resumo da publicação</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{releaseDetail.summary || "Sem resumo."}</p>
                </div>

                {releaseDetail.releasePrUrl && (
                  <Button variant="outline" asChild className="w-fit">
                    <a href={releaseDetail.releasePrUrl} target="_blank" rel="noreferrer">
                      Abrir PR da publicação
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
