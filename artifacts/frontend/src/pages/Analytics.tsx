import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
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
  Bot,
  MessageCircle,
  TrendingUp,
  AlertTriangle,
  BrainCircuit,
  Users,
  Clock,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  BarChart3,
  GitBranch,
  UserX,
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

// ─── Flow Metrics types & hook ────────────────────────────────────────────────

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

function formatSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  return `${(s / 3600).toFixed(1)}h`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null) return "0%";
  return (value * 100).toFixed(1) + "%";
}

function formatCurrency(value: string | number | undefined | null): string {
  if (value === null || value === undefined || value === "") return "R$ 0,00";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0";
  return value.toLocaleString("pt-BR");
}

function LoadingCard() {
  return (
    <Card className="min-h-[200px] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </Card>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [activeTab, setActiveTab] = useState("agents");

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

  const agents = agentsQuery.data;
  const channels = channelsQuery.data;
  const intel = intelQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Métricas de IA
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Relatórios de performance, conversão e inteligência de clientes
          </p>
        </div>
        <Badge variant="outline" className="text-xs">Período: últimos 30 dias</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 md:w-auto">
          <TabsTrigger value="agents" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Agentes</span>
          </TabsTrigger>
          <TabsTrigger value="channels" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Canais</span>
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4" />
            <span className="hidden sm:inline">Inteligência</span>
          </TabsTrigger>
          <TabsTrigger value="flow" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Fluxo</span>
          </TabsTrigger>
        </TabsList>

        {/* ─── AGENTS TAB ─── */}
        <TabsContent value="agents" className="space-y-4">
          {agentsQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : !agents ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Sem dados disponíveis</CardContent></Card>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total de Ações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatNumber(agents.agents.reduce((a, b) => a + b.actions.total, 0))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Agentes ativos</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Execução</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatPercent(
                        agents.agents.reduce((a, b) => a + b.actions.executed, 0) /
                        Math.max(agents.agents.reduce((a, b) => a + b.actions.total, 0), 1)
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Ações executadas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Mensagens Enviadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatNumber(agents.messagesByChannel.reduce((a, b) => a + b.total, 0))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Via todos os canais</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Conversões</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatNumber(agents.dealConversionsBySource.reduce((a, b) => a + b.total, 0))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Deals ganhos</p>
                  </CardContent>
                </Card>
              </div>

              {/* Agent Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      Performance por Agente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {agents.agents.map((agent) => {
                      const actionRate = agent.actions.total > 0
                        ? agent.actions.executed / agent.actions.total
                        : 0;
                      const taskRate = agent.tasks.total > 0
                        ? agent.tasks.completed / agent.tasks.total
                        : 0;
                      return (
                        <div key={agent.agentName} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{agent.agentName}</span>
                            <span className="text-muted-foreground">
                              {agent.actions.total} ações / {agent.tasks.total} tarefas
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Execução</span>
                              <span>{formatPercent(actionRate)}</span>
                            </div>
                            <Progress value={actionRate * 100} className="h-2" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Tarefas</span>
                              <span>{formatPercent(taskRate)}</span>
                            </div>
                            <Progress value={taskRate * 100} className="h-2" />
                          </div>
                        </div>
                      );
                    })}
                    {agents.agents.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum agente com ações no período</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Conversão por Canal
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={agents.dealConversionsBySource}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip
                            formatter={(value: number) => [formatNumber(value), "Deals"]}
                            contentStyle={{ fontSize: 12 }}
                          />
                          <Bar dataKey="total" fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Messages by Channel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Mensagens por Canal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={agents.messagesByChannel}
                          dataKey="total"
                          nameKey="canal"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
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
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── CHANNELS TAB ─── */}
        <TabsContent value="channels" className="space-y-4">
          {channelsQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : !channels ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Sem dados disponíveis</CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Leads Novos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatNumber(channels.leadsBySource.reduce((a, b) => a + b.novos, 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Deals Ganhos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatNumber(channels.dealsBySource.reduce((a, b) => a + b.total, 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {formatCurrency(channels.dealsBySource.reduce((a, b) => a + parseFloat(b.valor || "0"), 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio Resposta</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {(() => {
                        const times = channels.avgResponseTimeSeconds
                          .filter((t) => t.avgSeconds !== null)
                          .map((t) => t.avgSeconds ?? 0);
                        const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
                        return avg < 60 ? `${Math.round(avg)}s` : `${Math.round(avg / 60)}min`;
                      })()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Leads por Fonte
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={channels.leadsBySource}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                          <Bar dataKey="total" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="novos" fill="#818CF8" radius={[4, 4, 0, 0]} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Mensagens (Entrada vs Saída)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={channels.messagesByChannel}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="canal" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                          <Bar dataKey="entrada" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="saida" fill="#10B981" radius={[4, 4, 0, 0]} />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── INTELLIGENCE TAB ─── */}
        <TabsContent value="intelligence" className="space-y-4">
          {intelQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : !intel ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Sem dados disponíveis</CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Leads Analisados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatNumber(intel.totalAnalyzed)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Churn Alto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-500 flex items-center gap-1">
                      <AlertTriangle className="h-5 w-5" />
                      {formatNumber(intel.churnRisk.alto)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Score Médio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {intel.behaviorScore.avg?.toFixed(1) ?? "—"}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Journey Stages</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{intel.journeyStageDistribution.length}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Distribuição de Churn Risk
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
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
                            outerRadius={80}
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Journey Stage Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={intel.journeyStageDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                          <Bar dataKey="total" fill="#818CF8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Churn Risk */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Top 10 Leads em Risco de Churn
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {intel.topChurnRisk.map((lead) => (
                      <div key={lead.leadId} className="flex items-center gap-3">
                        <div className="w-10 text-sm font-bold text-red-500">{lead.churnRisk}%</div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{lead.nome}</div>
                          <div className="text-xs text-muted-foreground">{lead.journeyStage ?? "—"}</div>
                        </div>
                        <div className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {lead.nextBestAction ?? "—"}
                        </div>
                      </div>
                    ))}
                    {intel.topChurnRisk.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum lead em risco identificado</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Intent Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4" />
                    Top Intenções Detectadas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {intel.intentDistribution.map((intent) => (
                      <div key={intent.intent} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{intent.intent}</span>
                          <span className="text-muted-foreground">{intent.total}</span>
                        </div>
                        <Progress
                          value={
                            (intent.total / Math.max(...intel.intentDistribution.map((i) => i.total), 1)) * 100
                          }
                          className="h-2"
                        />
                      </div>
                    ))}
                    {intel.intentDistribution.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma intenção detectada</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
        {/* ─── FLOW TAB ─── */}
        <TabsContent value="flow" className="space-y-4">
          {flowQuery.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : flowQuery.isError ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Erro ao carregar métricas de fluxo</CardContent></Card>
          ) : !flowQuery.data ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground">Sem dados disponíveis</CardContent></Card>
          ) : (
            <>
              {/* KPI row — 4 cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-violet-500" />
                      Resposta IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatSeconds(flowQuery.data.firstResponseTime.ia)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Tempo médio 1ª resposta</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-blue-500" />
                      Resposta Humana
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatSeconds(flowQuery.data.firstResponseTime.human)}</div>
                    <p className="text-xs text-muted-foreground mt-1">Tempo médio 1ª resposta</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      Conv → Agendamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatPercent(flowQuery.data.conversationToAppointment.rate)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {flowQuery.data.conversationToAppointment.converted}/{flowQuery.data.conversationToAppointment.total} leads
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      Agendamento → Venda
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatPercent(flowQuery.data.appointmentToSale.rate)}</div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {flowQuery.data.appointmentToSale.converted}/{flowQuery.data.appointmentToSale.total} agendamentos
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Second row — no-show + escalations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserX className="h-4 w-4 text-red-500" />
                      No-show de Agendamentos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-end gap-3">
                      <div className="text-4xl font-bold">{formatPercent(flowQuery.data.noShowRate.rate)}</div>
                      <div className="text-sm text-muted-foreground pb-1">
                        {flowQuery.data.noShowRate.noShow} de {flowQuery.data.noShowRate.total} agendamentos
                      </div>
                    </div>
                    <Progress value={flowQuery.data.noShowRate.rate * 100} className="h-3" />
                    <p className="text-xs text-muted-foreground">
                      {flowQuery.data.noShowRate.total === 0
                        ? "Nenhum agendamento registrado"
                        : `${flowQuery.data.noShowRate.total - flowQuery.data.noShowRate.noShow} compareceram`}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Escalações por Razão
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {flowQuery.data.escalationsByReason.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma escalação registrada</p>
                    ) : (
                      flowQuery.data.escalationsByReason.map((esc) => {
                        const maxCount = Math.max(...flowQuery.data!.escalationsByReason.map((e) => e.count), 1);
                        return (
                          <div key={esc.reason} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium capitalize">{esc.reason.replace(/_/g, " ")}</span>
                              <span className="text-muted-foreground">{esc.count}</span>
                            </div>
                            <Progress value={(esc.count / maxCount) * 100} className="h-2" />
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
