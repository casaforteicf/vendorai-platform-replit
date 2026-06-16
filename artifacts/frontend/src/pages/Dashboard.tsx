import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  TrendingUp,
  DollarSign,
  Percent,
  AlertTriangle,
  FileWarning,
  Clock,
  Trophy,
  FileText,
  BarChart3,
  ShoppingCart,
  FileSignature,
  Layers,
} from "lucide-react";
import {
  useGetTenantDashboard,
  getGetTenantDashboardQueryKey,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

const ETAPA_LABELS: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  proposta: "Proposta",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};

const ETAPA_COLORS: Record<string, string> = {
  novo: "#60A5FA",
  qualificado: "#818CF8",
  proposta: "#A78BFA",
  negociacao: "#F59E0B",
  ganho: "#10B981",
  perdido: "#EF4444",
};

const TIPO_LABELS: Record<string, string> = {
  pedido: "Pedido",
  contrato: "Contrato",
  pedido_e_contrato: "Pedido e Contrato",
};

const TIPO_COLORS: Record<string, string> = {
  pedido: "#60A5FA",
  contrato: "#A78BFA",
  pedido_e_contrato: "#F59E0B",
};

function formatCurrency(value: string | number | undefined | null): string {
  if (value === null || value === undefined || value === "") return "R$ 0,00";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || value === null) return "0%";
  return (value * 100).toFixed(1) + "%";
}

function churnBadge(risk: number | null | undefined) {
  if (risk === null || risk === undefined) return null;
  if (risk > 70)
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
        Alto {risk}%
      </Badge>
    );
  if (risk >= 30)
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
        Médio {risk}%
      </Badge>
    );
  return (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
      Baixo {risk}%
    </Badge>
  );
}

function StatCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <div className="h-3 bg-muted rounded w-24" />
      </CardHeader>
      <CardContent>
        <div className="h-7 bg-muted rounded w-16 mb-1" />
        <div className="h-2.5 bg-muted rounded w-20" />
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const { data: dashboard, isLoading } = useGetTenantDashboard(tenantId, {
    query: {
      enabled: !!tenantId,
      queryKey: getGetTenantDashboardQueryKey(tenantId),
    },
  });

  const etapaChartData = dashboard
    ? Object.entries(dashboard.deals.porEtapa)
        .filter(([key]) => key !== "perdido")
        .map(([etapa, count]) => ({
          etapa,
          label: ETAPA_LABELS[etapa] ?? etapa,
          count: count as number,
          color: ETAPA_COLORS[etapa] ?? "#94A3B8",
        }))
    : [];

  const tipoChartData = dashboard?.dealsPorTipoFechamento
    ? Object.entries(dashboard.dealsPorTipoFechamento)
        .filter(([, v]) => (v as number) > 0)
        .map(([tipo, count]) => ({
          name: TIPO_LABELS[tipo] ?? tipo,
          value: count as number,
          color: TIPO_COLORS[tipo] ?? "#94A3B8",
        }))
    : [];

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Visão Geral</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bem-vindo de volta, {user?.name}.
        </p>
      </div>

      {/* KPI Row 1 — Pipeline e conversão */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card data-testid="card-total-leads">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total de Leads
                </CardTitle>
                <div className="p-1.5 rounded-md bg-blue-500/10">
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{dashboard?.leads.total ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dashboard?.leads.novosUltimos30Dias ?? 0} novos nos últimos 30 dias
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-valor-negociacao">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Valor em Pipeline
                </CardTitle>
                <div className="p-1.5 rounded-md bg-emerald-500/10">
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatCurrency(dashboard?.deals.totalEmNegociacao)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dashboard?.deals.totalDeals ?? 0} negócios ativos
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-ganhos-mes">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Ganhos este mês
                </CardTitle>
                <div className="p-1.5 rounded-md bg-teal-500/10">
                  <Trophy className="h-4 w-4 text-teal-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-teal-600">
                  {formatCurrency(dashboard?.ganhosMes?.somaValor)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dashboard?.ganhosMes?.count ?? 0}{" "}
                  {(dashboard?.ganhosMes?.count ?? 0) === 1 ? "negócio fechado" : "negócios fechados"}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-taxa-conversao">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Taxa de Conversão
                </CardTitle>
                <div className="p-1.5 rounded-md bg-violet-500/10">
                  <Percent className="h-4 w-4 text-violet-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatPercent(dashboard?.deals.taxaConversao)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">ganhos / total de deals</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* KPI Row 2 — Operacional */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card data-testid="card-ticket-medio">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Ticket Médio
                </CardTitle>
                <div className="p-1.5 rounded-md bg-indigo-500/10">
                  <BarChart3 className="h-4 w-4 text-indigo-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {dashboard?.ticketMedio ? formatCurrency(dashboard.ticketMedio) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">média dos deals ganhos</p>
              </CardContent>
            </Card>

            <Card data-testid="card-propostas-ativas">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Propostas Ativas
                </CardTitle>
                <div className="p-1.5 rounded-md bg-orange-500/10">
                  <FileText className="h-4 w-4 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{dashboard?.propostas?.ativas?.count ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatCurrency(dashboard?.propostas?.ativas?.somaValor)} em aberto
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-atividades-atrasadas">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Atividades Atrasadas
                </CardTitle>
                <div className="p-1.5 rounded-md bg-red-500/10">
                  <Clock className="h-4 w-4 text-red-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-500">
                  {dashboard?.atividadesAtrasadas ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(dashboard?.atividadesAtrasadas ?? 0) === 1
                    ? "pendente vencida"
                    : "pendentes vencidas"}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="card-novos-leads">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Novos Leads (30d)
                </CardTitle>
                <div className="p-1.5 rounded-md bg-sky-500/10">
                  <TrendingUp className="h-4 w-4 text-sky-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {dashboard?.leads.novosUltimos30Dias ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">leads criados</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Funil + Modelo Comercial */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="card-funil">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Funil de Negócios</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-48 bg-muted animate-pulse rounded" />
            ) : etapaChartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                Nenhum negócio ativo no momento.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={etapaChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={96}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    formatter={(value: number) => [value, "Negócios"]}
                    contentStyle={{
                      fontSize: 12,
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      background: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {etapaChartData.map((entry) => (
                      <Cell key={entry.etapa} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Modelo Comercial */}
        <Card data-testid="card-modelo-comercial">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Modelo Comercial</CardTitle>
            <p className="text-xs text-muted-foreground">Distribuição por tipo de fechamento</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-40 bg-muted animate-pulse rounded" />
            ) : tipoChartData.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum deal com tipo de fechamento definido.
                </p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShoppingCart className="h-3.5 w-3.5 text-blue-500" /> Pedido
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileSignature className="h-3.5 w-3.5 text-violet-500" /> Contrato
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5 text-amber-500" /> Pedido e Contrato
                  </div>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={tipoChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {tipoChartData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{
                      fontSize: 12,
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      background: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Faturas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-faturas-pendentes">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold">Faturas Pendentes</CardTitle>
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <FileWarning className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 bg-muted animate-pulse rounded" />
            ) : (
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-3xl font-bold">
                    {dashboard?.faturas.pendente.count ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">faturas</p>
                </div>
                <div className="pb-0.5">
                  <p className="text-lg font-semibold text-amber-600">
                    {formatCurrency(dashboard?.faturas.pendente.somaValor)}
                  </p>
                  <p className="text-xs text-muted-foreground">valor total</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-faturas-atrasadas">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-semibold">Faturas Atrasadas</CardTitle>
            <div className="p-1.5 rounded-md bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 bg-muted animate-pulse rounded" />
            ) : (
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-3xl font-bold text-red-600">
                    {dashboard?.faturas.atrasada.count ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">faturas</p>
                </div>
                <div className="pb-0.5">
                  <p className="text-lg font-semibold text-red-600">
                    {formatCurrency(dashboard?.faturas.atrasada.somaValor)}
                  </p>
                  <p className="text-xs text-muted-foreground">valor total</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leads em Risco */}
      <Card data-testid="card-leads-risco">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Leads em Risco de Churn</CardTitle>
          <p className="text-xs text-muted-foreground">
            Top 5 leads com maior probabilidade de abandono
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !dashboard?.top5ChurnRisk?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum lead em risco no momento.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {dashboard.top5ChurnRisk.map((lead, idx) => (
                <div
                  key={lead.leadId}
                  className="flex items-center justify-between py-3 gap-4"
                  data-testid={`row-lead-risco-${lead.leadId}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-muted-foreground w-4 shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {lead.nome ?? "Lead sem nome"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.email ?? lead.telefone ?? lead.leadId}
                      </p>
                    </div>
                  </div>
                  {churnBadge(lead.churnRisk)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
