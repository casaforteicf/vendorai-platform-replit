import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Database,
  GitBranch,
  ListChecks,
  Loader2,
  MessageCircle,
  RotateCcw,
  Wrench,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  UserX,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import {
  useGetTenantAnalyticsAgents,
  getGetTenantAnalyticsAgentsQueryKey,
  useGetTenantAnalyticsChannels,
  getGetTenantAnalyticsChannelsQueryKey,
  useGetTenantAnalyticsIntelligence,
  getGetTenantAnalyticsIntelligenceQueryKey,
} from "@workspace/api-client-react";

const COLORS = ["#60A5FA", "#818CF8", "#A78BFA", "#F59E0B", "#10B981", "#EF4444", "#94A3B8"];

interface FlowMetricsData {
  firstResponseTime: { ia: number | null; human: number | null };
  conversationToAppointment: { total: number; converted: number; rate: number };
  appointmentToSale: { total: number; converted: number; rate: number };
  noShowRate: { total: number; noShow: number; rate: number };
  escalationsByReason: Array<{ reason: string; count: number }>;
}

function useFlowMetrics(tenantId: string, enabled: boolean) {
  return useQuery<FlowMetricsData>({
    queryKey: ["flow-metrics", tenantId],
    enabled: enabled && !!tenantId,
    queryFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/tenants/${tenantId}/analytics/flow-metrics`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("flow-metrics fetch failed");
      return res.json() as Promise<FlowMetricsData>;
    },
    staleTime: 5 * 60 * 1000,
  });
}


interface OperationalAction {
  id: string;
  agentName: string;
  actionType: string;
  status: string;
  reason: string | null;
  payload: Record<string, any> | null;
  createdAt: string;
}

interface OperationalActionsData {
  periodo: string;
  items: OperationalAction[];
}

function useOperationalActions(tenantId: string, enabled: boolean) {
  return useQuery<OperationalActionsData>({
    queryKey: ["agent-operational-actions", tenantId],
    enabled: enabled && !!tenantId,
    queryFn: async () => {
      const token = localStorage.getItem("vendorai_token");
      const res = await fetch(`/api/tenants/${tenantId}/analytics/agent-actions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("agent operational actions fetch failed");
      return res.json() as Promise<OperationalActionsData>;
    },
    staleTime: 30 * 1000,
  });
}

function agentDisplayName(agentName: string): string {
  if (agentName === "browser" || agentName === "browser_mcp") return "Vendi — Navegação Web";
  return agentName.replaceAll("_", " ");
}

function operationalReason(action: OperationalAction): string {
  if (action.reason) return action.reason;
  if (action.status === "pending") return "Aguardando execução, aprovação ou continuidade.";
  return "A execução foi rejeitada sem motivo detalhado registrado.";
}

function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}min`;
  return `${(value / 3600).toFixed(1)}h`;
}

function formatPercent(value: number | null | undefined, emptyWhenUnavailable = false): string {
  if (value === undefined || value === null) return emptyWhenUnavailable ? "—" : "0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: string | number | undefined | null): string {
  if (value === null || value === undefined || value === "") return "R$ 0,00";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (Number.isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0";
  return value.toLocaleString("pt-BR");
}

function LoadingCard({ className = "" }: { className?: string }) {
  return (
    <Card className={`min-h-[140px] flex items-center justify-center ${className}`}>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  compact = false,
  actionLabel,
  onAction,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  compact?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-5" : "py-10"}`}>
      <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" className="mt-3 h-8" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Bot;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-muted-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  }[tone];

  return (
    <Card className="shadow-sm">
      <CardHeader className="px-5 pb-1.5 pt-4">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
          <span>{title}</span>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <p className="mt-1 min-h-[32px] text-xs leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
  tone = "default",
}: {
  icon: typeof Bot;
  title: string;
  description?: string;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass = {
    default: "text-muted-foreground",
    success: "text-emerald-600",
    danger: "text-red-600",
  }[tone];

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${toneClass}`} />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const tenantId = user?.tenantId ?? "";
  const [activeTab, setActiveTab] = useState("agents");
  const [retryingActionId, setRetryingActionId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  const agentsQuery = useGetTenantAnalyticsAgents(tenantId, {
    query: { enabled: !!tenantId && activeTab === "agents", queryKey: getGetTenantAnalyticsAgentsQueryKey(tenantId) },
  });
  const channelsQuery = useGetTenantAnalyticsChannels(tenantId, {
    query: { enabled: !!tenantId && activeTab === "channels", queryKey: getGetTenantAnalyticsChannelsQueryKey(tenantId) },
  });
  const intelQuery = useGetTenantAnalyticsIntelligence(tenantId, {
    query: { enabled: !!tenantId && activeTab === "intelligence", queryKey: getGetTenantAnalyticsIntelligenceQueryKey(tenantId) },
  });
  const flowQuery = useFlowMetrics(tenantId, activeTab === "flow");
  const operationalQuery = useOperationalActions(tenantId, activeTab === "agents");

  const agents = agentsQuery.data;
  const channels = channelsQuery.data;
  const intel = intelQuery.data;

  const periodLabel = {
    agents: "Atividade: últimos 30 dias",
    channels: "Atividade: últimos 30 dias",
    intelligence: "Inteligência: estado atual",
    flow: "Fluxo: histórico consolidado",
  }[activeTab] ?? "Dados operacionais";

  const totalActions = agents?.agents.reduce((sum, item) => sum + item.actions.total, 0) ?? 0;
  const executedActions = agents?.agents.reduce((sum, item) => sum + item.actions.executed, 0) ?? 0;
  const rejectedActions = agents?.agents.reduce((sum, item) => sum + item.actions.rejected, 0) ?? 0;
  const pendingActions = agents?.agents.reduce((sum, item) => sum + item.actions.pending, 0) ?? 0;
  const totalTasks = agents?.agents.reduce((sum, item) => sum + item.tasks.total, 0) ?? 0;
  const completedTasks = agents?.agents.reduce((sum, item) => sum + item.tasks.completed, 0) ?? 0;
  const failedTasks = agents?.agents.reduce((sum, item) => sum + item.tasks.failed, 0) ?? 0;
  const pendingTasks = agents?.agents.reduce((sum, item) => sum + item.tasks.pending, 0) ?? 0;
  const totalMessages = agents?.messagesByChannel.reduce((sum, item) => sum + item.total, 0) ?? 0;
  const totalConversions = agents?.dealConversionsBySource.reduce((sum, item) => sum + item.total, 0) ?? 0;
  const totalConversionRevenue = agents?.dealConversionsBySource.reduce(
    (sum, item) => sum + (Number.parseFloat(String(item.valor ?? "0")) || 0),
    0,
  ) ?? 0;
  const actionRate = totalActions > 0 ? executedActions / totalActions : null;
  const taskRate = totalTasks > 0 ? completedTasks / totalTasks : null;
  const operationalAlerts = rejectedActions + failedTasks + pendingActions + pendingTasks;
  const hasOperationalAlerts = operationalAlerts > 0;
  const operationalItems = operationalQuery.data?.items ?? [];
  const rejectedItems = useMemo(() => operationalItems.filter((item) => item.status === "rejected"), [operationalItems]);
  const pendingItems = useMemo(() => operationalItems.filter((item) => item.status === "pending"), [operationalItems]);

  const retryOperationalAction = async (action: OperationalAction) => {
    const payload = action.payload ?? {};
    const goal = String(payload.goal ?? "").trim();
    const startUrl = typeof payload.startUrl === "string" ? payload.startUrl : undefined;
    const connectionId = typeof payload.connectionId === "string" ? payload.connectionId : undefined;

    if (!goal || (!startUrl && !connectionId)) {
      setActionFeedback((current) => ({ ...current, [action.id]: "Não há dados suficientes para repetir automaticamente. Abra o agente para resolver." }));
      return;
    }

    setRetryingActionId(action.id);
    setActionFeedback((current) => ({ ...current, [action.id]: "" }));
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch("/api/browser-agent/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          goal,
          ...(startUrl ? { startUrl } : {}),
          ...(connectionId ? { connectionId } : {}),
          agentName: "browser",
          mode: "autonomo",
          allowWrite: true,
          maxSteps: 20,
          strategy: "browser",
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error ?? body?.reason ?? "A nova tentativa não concluiu.");
      }

      setActionFeedback((current) => ({ ...current, [action.id]: "Nova tentativa executada. Métricas atualizadas." }));
      await Promise.all([agentsQuery.refetch(), operationalQuery.refetch()]);
    } catch (error: any) {
      setActionFeedback((current) => ({ ...current, [action.id]: error?.message ?? "Não foi possível repetir a ação." }));
    } finally {
      setRetryingActionId(null);
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="h-6 w-6 text-primary" />
            Métricas de IA
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe execução dos agentes, canais, inteligência de clientes e gargalos do fluxo.
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1 text-xs font-medium">
          {periodLabel}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 rounded-xl p-1">
          <TabsTrigger value="agents" className="flex items-center gap-2 rounded-lg">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Agentes</span>
          </TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-2 rounded-lg">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Canais</span>
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="flex items-center gap-2 rounded-lg">
            <BrainCircuit className="h-4 w-4" />
            <span className="hidden sm:inline">Inteligência</span>
          </TabsTrigger>
          <TabsTrigger value="flow" className="flex items-center gap-2 rounded-lg">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Fluxo</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-3">
          {agentsQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : !agents ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Database}
                  title="Métricas indisponíveis"
                  description="A API de analytics não retornou dados para este tenant. Verifique a conexão e tente novamente."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Agentes com atividade"
                  value={formatNumber(agents.agents.length)}
                  description="Agentes com ações ou tarefas registradas no período"
                  icon={Bot}
                />
                <MetricCard
                  title="Taxa de execução"
                  value={formatPercent(actionRate, true)}
                  description={totalActions > 0 ? `${formatNumber(executedActions)} de ${formatNumber(totalActions)} ações executadas` : "Sem ações registradas no período"}
                  icon={CheckCircle2}
                  tone="success"
                />
                <MetricCard
                  title="Mensagens enviadas"
                  value={formatNumber(totalMessages)}
                  description="Saídas registradas em todos os canais"
                  icon={MessageCircle}
                />
                <MetricCard
                  title="Vendas ganhas"
                  value={formatNumber(totalConversions)}
                  description={`Valor associado: ${formatCurrency(totalConversionRevenue)}`}
                  icon={TrendingUp}
                  tone="success"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Ações executadas"
                  value={formatNumber(executedActions)}
                  description={`${formatNumber(totalActions)} ações registradas no total`}
                  icon={Zap}
                />
                <MetricCard
                  title="Tarefas concluídas"
                  value={formatNumber(completedTasks)}
                  description={totalTasks > 0 ? `${formatPercent(taskRate, true)} de conclusão` : "Sem tarefas registradas"}
                  icon={ListChecks}
                  tone="success"
                />
                <MetricCard
                  title="Falhas e rejeições"
                  value={formatNumber(failedTasks + rejectedActions)}
                  description="Tarefas com erro/rejeição e ações rejeitadas"
                  icon={ShieldAlert}
                  tone={failedTasks + rejectedActions > 0 ? "danger" : "default"}
                />
                <MetricCard
                  title="Pendências operacionais"
                  value={formatNumber(pendingActions + pendingTasks)}
                  description="Ações e tarefas ainda aguardando conclusão"
                  icon={Clock}
                  tone={pendingActions + pendingTasks > 0 ? "warning" : "default"}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1fr]">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2.5">
                    <SectionTitle
                      icon={Bot}
                      title="Performance por agente"
                      description="Execução real de ações e tarefas, sem estimativas ou dados simulados."
                    />
                  </CardHeader>
                  <CardContent>
                    {agents.agents.length === 0 ? (
                      <EmptyState
                        icon={Bot}
                        title="Ainda não há atividade de agentes"
                        description="Quando os agentes executarem ações ou tarefas, o desempenho individual aparecerá aqui."
                        actionLabel="Ver agentes"
                        onAction={() => setLocation("/agentes")}
                        compact
                      />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                              <th className="pb-3 pr-4 font-medium">Agente</th>
                              <th className="pb-3 pr-4 text-right font-medium">Ações</th>
                              <th className="pb-3 pr-4 text-right font-medium">Execução</th>
                              <th className="pb-3 pr-4 text-right font-medium">Tarefas</th>
                              <th className="pb-3 pr-4 text-right font-medium">Conclusão</th>
                              <th className="pb-3 pr-4 text-right font-medium">Falhas</th>
                              <th className="pb-3 text-right font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {agents.agents.map((agent) => {
                              const agentActionRate = agent.actions.total > 0 ? agent.actions.executed / agent.actions.total : null;
                              const agentTaskRate = agent.tasks.total > 0 ? agent.tasks.completed / agent.tasks.total : null;
                              const agentFailures = agent.tasks.failed + agent.actions.rejected;
                              const agentPending = agent.tasks.pending + agent.actions.pending;
                              const health = agentFailures > 0
                                ? { label: "Crítico", className: "border-red-200 bg-red-50 text-red-700" }
                                : agentPending > 0
                                  ? { label: "Atenção", className: "border-amber-200 bg-amber-50 text-amber-700" }
                                  : { label: "Saudável", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
                              return (
                                <tr key={agent.agentName} className="border-b last:border-0">
                                  <td className="py-3 pr-4">
                                    <div className="font-medium">{agentDisplayName(agent.agentName)}</div>
                                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{agent.agentName}</div>
                                  </td>
                                  <td className="py-3 pr-4 text-right">{formatNumber(agent.actions.total)}</td>
                                  <td className="py-3 pr-4 text-right">{formatPercent(agentActionRate, true)}</td>
                                  <td className="py-3 pr-4 text-right">{formatNumber(agent.tasks.total)}</td>
                                  <td className="py-3 pr-4 text-right">{formatPercent(agentTaskRate, true)}</td>
                                  <td className="py-3 pr-4 text-right">
                                    <span className={agentFailures > 0 ? "font-medium text-red-600" : "text-muted-foreground"}>
                                      {formatNumber(agentFailures)}
                                    </span>
                                  </td>
                                  <td className="py-3 text-right">
                                    <Badge variant="outline" className={health.className}>{health.label}</Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className={`shadow-sm ${hasOperationalAlerts ? "border-red-200" : ""}`}>
                  <CardHeader className="pb-2.5">
                    <SectionTitle
                      icon={hasOperationalAlerts ? AlertTriangle : CheckCircle2}
                      title={hasOperationalAlerts ? "Atenção necessária" : "Operação saudável"}
                      description={hasOperationalAlerts ? "Veja a causa e resolva diretamente daqui." : "Nenhuma falha, rejeição ou pendência operacional registrada."}
                      tone={hasOperationalAlerts ? "danger" : "success"}
                    />
                  </CardHeader>
                  <CardContent>
                    {operationalAlerts === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-center">
                        <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
                        <p className="mt-2 text-sm font-medium">Sem alertas operacionais</p>
                        <p className="mt-1 text-xs text-muted-foreground">Não há falhas, rejeições ou pendências registradas neste período.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg border p-3">
                            <p className="text-[11px] text-muted-foreground">Tarefas com falha</p>
                            <p className="mt-1 text-xl font-semibold">{formatNumber(failedTasks)}</p>
                          </div>
                          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                            <p className="text-[11px] text-red-700">Ações rejeitadas</p>
                            <p className="mt-1 text-xl font-semibold text-red-700">{formatNumber(rejectedActions)}</p>
                          </div>
                          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                            <p className="text-[11px] text-amber-700">Pendências</p>
                            <p className="mt-1 text-xl font-semibold text-amber-700">{formatNumber(pendingActions + pendingTasks)}</p>
                          </div>
                        </div>

                        {operationalQuery.isLoading ? (
                          <div className="flex items-center justify-center rounded-lg border border-dashed p-5">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : operationalItems.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                            Os totais existem, mas ainda não há detalhe operacional disponível para estes registros.
                          </div>
                        ) : (
                          <div className="max-h-[330px] space-y-2 overflow-y-auto pr-1">
                            {[...rejectedItems, ...pendingItems].slice(0, 12).map((action) => (
                              <div key={action.id} className="rounded-lg border p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-medium">{agentDisplayName(action.agentName)}</p>
                                      <Badge variant={action.status === "rejected" ? "destructive" : "outline"}>
                                        {action.status === "rejected" ? "Rejeitada" : "Pendente"}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                                      {action.agentName} · {action.actionType}
                                    </p>
                                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                                      {operationalReason(action)}
                                    </p>
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      {new Date(action.createdAt).toLocaleString("pt-BR")}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  {action.status === "rejected" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1.5"
                                      disabled={retryingActionId === action.id}
                                      onClick={() => retryOperationalAction(action)}
                                    >
                                      {retryingActionId === action.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                      Tentar novamente
                                    </Button>
                                  ) : null}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 gap-1.5"
                                    onClick={() => setLocation("/agents/config")}
                                  >
                                    <Wrench className="h-3.5 w-3.5" />
                                    Resolver
                                  </Button>
                                </div>
                                {actionFeedback[action.id] ? (
                                  <p className="mt-2 text-xs text-muted-foreground">{actionFeedback[action.id]}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2.5">
                    <SectionTitle icon={TrendingUp} title="Vendas ganhas por origem" description="Mostra de onde vieram os leads associados às vendas registradas." />
                  </CardHeader>
                  <CardContent>
                    {agents.dealConversionsBySource.length === 0 ? (
                      <EmptyState
                        icon={Target}
                        title="Nenhuma venda registrada"
                        description="Quando houver vendas ganhas com origem identificada, a distribuição aparecerá aqui."
                        actionLabel="Ver pipeline"
                        onAction={() => setLocation("/deals")}
                        compact
                      />
                    ) : (
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={agents.dealConversionsBySource}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip formatter={(value: number) => [formatNumber(value), "Vendas"]} contentStyle={{ fontSize: 12 }} />
                            <Bar dataKey="total" fill="#10B981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-2.5">
                    <SectionTitle icon={MessageCircle} title="Mensagens por canal" description="Distribuição das mensagens de saída registradas no período." />
                  </CardHeader>
                  <CardContent>
                    {agents.messagesByChannel.length === 0 ? (
                      <EmptyState
                        icon={MessageCircle}
                        title="Nenhuma mensagem de saída registrada"
                        description="Assim que os canais começarem a registrar atendimentos, a distribuição aparecerá aqui."
                        actionLabel="Configurar canais"
                        onAction={() => setLocation("/configuracoes")}
                        compact
                      />
                    ) : (
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={agents.messagesByChannel}
                              dataKey="total"
                              nameKey="canal"
                              cx="50%"
                              cy="50%"
                              outerRadius={82}
                              label={({ canal, total }) => `${canal}: ${total}`}
                            >
                              {agents.messagesByChannel.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Legend />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="channels" className="space-y-4">
          {channelsQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : !channels ? (
            <Card><CardContent><EmptyState icon={Database} title="Métricas de canais indisponíveis" description="A API de analytics não retornou dados de canais para este tenant." /></CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Leads novos"
                  value={formatNumber(channels.leadsBySource.reduce((sum, item) => sum + item.novos, 0))}
                  description="Leads criados na janela de atividade"
                  icon={Users}
                />
                <MetricCard
                  title="Vendas ganhas"
                  value={formatNumber(channels.dealsBySource.reduce((sum, item) => sum + item.total, 0))}
                  description="Base consolidada de vendas por origem"
                  icon={TrendingUp}
                  tone="success"
                />
                <MetricCard
                  title="Faturamento"
                  value={formatCurrency(channels.dealsBySource.reduce((sum, item) => sum + (Number.parseFloat(item.valor || "0") || 0), 0))}
                  description="Valor consolidado das vendas ganhas"
                  icon={WalletCards}
                  tone="success"
                />
                <MetricCard
                  title="Tempo médio de resposta"
                  value={(() => {
                    const times = channels.avgResponseTimeSeconds.filter((item) => item.avgSeconds !== null).map((item) => item.avgSeconds ?? 0);
                    if (times.length === 0) return "—";
                    return formatSeconds(times.reduce((sum, value) => sum + value, 0) / times.length);
                  })()}
                  description="Considera canais com tempo de resposta disponível"
                  icon={Clock}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={Users} title="Leads por origem" description="Base total e novos leads por fonte de aquisição." /></CardHeader>
                  <CardContent>
                    {channels.leadsBySource.length === 0 ? (
                      <EmptyState icon={Users} title="Nenhum lead por origem" description="Cadastre ou importe leads com origem identificada para acompanhar este indicador." compact />
                    ) : (
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channels.leadsBySource}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Bar dataKey="total" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="novos" fill="#818CF8" radius={[4, 4, 0, 0]} />
                            <Legend />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={MessageCircle} title="Mensagens por canal" description="Compare entrada e saída para identificar canais com maior demanda." /></CardHeader>
                  <CardContent>
                    {channels.messagesByChannel.length === 0 ? (
                      <EmptyState icon={MessageCircle} title="Nenhuma mensagem registrada" description="Conecte e utilize os canais para acompanhar o volume de entrada e saída." compact />
                    ) : (
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channels.messagesByChannel}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="canal" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Bar dataKey="entrada" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="saida" fill="#10B981" radius={[4, 4, 0, 0]} />
                            <Legend />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="shadow-sm">
                <CardHeader className="pb-3"><SectionTitle icon={Clock} title="Resposta por canal" description="Tempo médio disponível para cada canal com dados suficientes." /></CardHeader>
                <CardContent>
                  {channels.avgResponseTimeSeconds.length === 0 ? (
                    <EmptyState icon={Clock} title="Sem tempo de resposta calculável" description="É necessário histórico de mensagens de saída para calcular este indicador." compact />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {channels.avgResponseTimeSeconds.map((item) => (
                        <div key={item.canal} className="rounded-lg border p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.canal}</p>
                          <p className="mt-1 text-xl font-semibold">{formatSeconds(item.avgSeconds)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="intelligence" className="space-y-4">
          {intelQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : !intel ? (
            <Card><CardContent><EmptyState icon={Database} title="Inteligência indisponível" description="A API não retornou os dados de inteligência de clientes para este tenant." /></CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Leads analisados" value={formatNumber(intel.totalAnalyzed)} description="Perfis com inteligência registrada" icon={BrainCircuit} />
                <MetricCard title="Risco alto de churn" value={formatNumber(intel.churnRisk.alto)} description="Clientes que exigem atenção prioritária" icon={AlertTriangle} tone={intel.churnRisk.alto > 0 ? "danger" : "default"} />
                <MetricCard title="Score médio" value={intel.behaviorScore.avg?.toFixed(1) ?? "—"} description="Média do behavior score disponível" icon={Activity} />
                <MetricCard title="Etapas da jornada" value={formatNumber(intel.journeyStageDistribution.length)} description="Estágios distintos identificados" icon={GitBranch} />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={AlertTriangle} title="Distribuição de risco de churn" description="Visão da carteira analisada por faixa de risco." /></CardHeader>
                  <CardContent>
                    {intel.churnRisk.baixo + intel.churnRisk.medio + intel.churnRisk.alto === 0 ? (
                      <EmptyState icon={AlertTriangle} title="Nenhum risco calculado" description="A distribuição aparecerá quando houver churn risk registrado na inteligência dos clientes." compact />
                    ) : (
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Baixo", value: intel.churnRisk.baixo },
                                { name: "Médio", value: intel.churnRisk.medio },
                                { name: "Alto", value: intel.churnRisk.alto },
                              ]}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={82}
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              <Cell fill="#10B981" />
                              <Cell fill="#F59E0B" />
                              <Cell fill="#EF4444" />
                            </Pie>
                            <Legend />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={Sparkles} title="Jornada do cliente" description="Distribuição dos clientes pelos estágios detectados." /></CardHeader>
                  <CardContent>
                    {intel.journeyStageDistribution.length === 0 ? (
                      <EmptyState icon={GitBranch} title="Nenhuma etapa detectada" description="A jornada aparecerá quando customer intelligence registrar os estágios dos clientes." compact />
                    ) : (
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={intel.journeyStageDistribution}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ fontSize: 12 }} />
                            <Bar dataKey="total" fill="#818CF8" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={AlertTriangle} title="Clientes que exigem atenção" description="Priorize os maiores riscos e use a próxima melhor ação já registrada pela inteligência." /></CardHeader>
                  <CardContent>
                    {intel.topChurnRisk.length === 0 ? (
                      <EmptyState icon={CheckCircle2} title="Nenhum cliente em risco identificado" description="Não há leads com churn risk disponível para destacar agora." compact />
                    ) : (
                      <div className="space-y-2">
                        {intel.topChurnRisk.map((lead) => (
                          <div key={lead.leadId} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[72px_1fr_1.2fr] sm:items-center">
                            <div className="text-lg font-bold text-red-600">{lead.churnRisk}%</div>
                            <div>
                              <p className="text-sm font-medium">{lead.nome}</p>
                              <p className="text-xs text-muted-foreground">{lead.journeyStage ?? "Etapa não informada"}</p>
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">{lead.nextBestAction ?? "Próxima ação ainda não definida"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={BrainCircuit} title="Intenções detectadas" description="Assuntos e intenções mais frequentes registrados pela inteligência." /></CardHeader>
                  <CardContent>
                    {intel.intentDistribution.length === 0 ? (
                      <EmptyState icon={BrainCircuit} title="Nenhuma intenção detectada" description="As intenções aparecerão quando houver dados de intent analysis nos clientes." compact />
                    ) : (
                      <div className="space-y-4">
                        {intel.intentDistribution.map((intent) => (
                          <div key={String(intent.intent)} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="truncate font-medium">{String(intent.intent)}</span>
                              <span className="text-muted-foreground">{formatNumber(intent.total)}</span>
                            </div>
                            <Progress value={(intent.total / Math.max(...intel.intentDistribution.map((item) => item.total), 1)) * 100} className="h-2" />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="flow" className="space-y-4">
          {flowQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : flowQuery.isError ? (
            <Card><CardContent><EmptyState icon={AlertTriangle} title="Erro ao carregar o fluxo" description="Não foi possível consultar as métricas do fluxo agora. Tente novamente em alguns instantes." /></CardContent></Card>
          ) : !flowQuery.data ? (
            <Card><CardContent><EmptyState icon={Database} title="Fluxo sem dados" description="Ainda não há métricas consolidadas disponíveis para este tenant." /></CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="1ª resposta da IA" value={formatSeconds(flowQuery.data.firstResponseTime.ia)} description="Tempo médio disponível para a primeira resposta" icon={Bot} />
                <MetricCard title="1ª resposta humana" value={formatSeconds(flowQuery.data.firstResponseTime.human)} description="Tempo médio disponível para a primeira resposta" icon={Users} />
                <MetricCard title="Conversa → agendamento" value={flowQuery.data.conversationToAppointment.total > 0 ? formatPercent(flowQuery.data.conversationToAppointment.rate, true) : "—"} description={`${flowQuery.data.conversationToAppointment.converted} de ${flowQuery.data.conversationToAppointment.total} leads`} icon={Target} tone="success" />
                <MetricCard title="Agendamento → venda" value={flowQuery.data.appointmentToSale.total > 0 ? formatPercent(flowQuery.data.appointmentToSale.rate, true) : "—"} description={`${flowQuery.data.appointmentToSale.converted} de ${flowQuery.data.appointmentToSale.total} agendamentos`} icon={TrendingUp} tone="success" />
              </div>

              <Card className="shadow-sm">
                <CardHeader className="pb-3"><SectionTitle icon={GitBranch} title="Funil operacional" description="Leitura direta das etapas já mensuradas pelo backend, sem fabricar estágios intermediários." /></CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conversas com lead</p>
                      <p className="mt-2 text-2xl font-bold">{formatNumber(flowQuery.data.conversationToAppointment.total)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Base para conversão em agendamento</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agendados</p>
                      <p className="mt-2 text-2xl font-bold">{formatNumber(flowQuery.data.conversationToAppointment.converted)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{flowQuery.data.conversationToAppointment.total > 0 ? formatPercent(flowQuery.data.conversationToAppointment.rate, true) : "Taxa indisponível"}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendas após agendamento</p>
                      <p className="mt-2 text-2xl font-bold">{formatNumber(flowQuery.data.appointmentToSale.converted)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{flowQuery.data.appointmentToSale.total > 0 ? formatPercent(flowQuery.data.appointmentToSale.rate, true) : "Taxa indisponível"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={UserX} title="No-show de agendamentos" description="Compare faltas com a quantidade total de agendamentos registrada." /></CardHeader>
                  <CardContent className="space-y-4">
                    {flowQuery.data.noShowRate.total === 0 ? (
                      <EmptyState icon={UserX} title="Nenhum agendamento registrado" description="O indicador de no-show ficará disponível quando houver agendamentos na base." compact />
                    ) : (
                      <>
                        <div className="flex items-end gap-3">
                          <div className="text-4xl font-bold">{formatPercent(flowQuery.data.noShowRate.rate)}</div>
                          <div className="pb-1 text-sm text-muted-foreground">{flowQuery.data.noShowRate.noShow} de {flowQuery.data.noShowRate.total}</div>
                        </div>
                        <Progress value={flowQuery.data.noShowRate.rate * 100} className="h-3" />
                        <p className="text-xs text-muted-foreground">{flowQuery.data.noShowRate.total - flowQuery.data.noShowRate.noShow} compareceram</p>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-3"><SectionTitle icon={AlertTriangle} title="Escalações para humano" description="Razões registradas quando o atendimento precisou sair da automação." /></CardHeader>
                  <CardContent className="space-y-3">
                    {flowQuery.data.escalationsByReason.length === 0 ? (
                      <EmptyState icon={CheckCircle2} title="Nenhuma escalação registrada" description="Não há handoffs para humano classificados nesta base." compact />
                    ) : (
                      flowQuery.data.escalationsByReason.map((item) => {
                        const maxCount = Math.max(...flowQuery.data!.escalationsByReason.map((entry) => entry.count), 1);
                        return (
                          <div key={item.reason} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium capitalize">{item.reason.replace(/_/g, " ")}</span>
                              <span className="text-muted-foreground">{formatNumber(item.count)}</span>
                            </div>
                            <Progress value={(item.count / maxCount) * 100} className="h-2" />
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
