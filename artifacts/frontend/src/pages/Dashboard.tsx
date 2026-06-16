import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  TrendingUp,
  DollarSign,
  Percent,
  Clock,
  Trophy,
  FileText,
  BarChart3,
  ShoppingCart,
  FileSignature,
  Layers,
  MapPin,
  Target,
  Building2,
  Flame,
  Phone,
  Mail,
  Award,
  Package,
  Swords,
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

const ETAPA_BADGE: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  qualificado: "bg-indigo-100 text-indigo-700",
  proposta: "bg-violet-100 text-violet-700",
  negociacao: "bg-amber-100 text-amber-700",
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

const FAIXA_LABELS: Record<string, string> = {
  ate25: "Até 25",
  de26a35: "26–35",
  de36a45: "36–45",
  de46a55: "46–55",
  acima55: "55+",
  naoInformado: "N/I",
};

const FAIXA_COLORS = ["#60A5FA", "#818CF8", "#A78BFA", "#F59E0B", "#10B981", "#94A3B8"];

const DOW_LABELS: Record<string, string> = {
  "0": "Dom",
  "1": "Seg",
  "2": "Ter",
  "3": "Qua",
  "4": "Qui",
  "5": "Sex",
  "6": "Sáb",
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

function probColor(p: number) {
  if (p >= 70) return "bg-emerald-500";
  if (p >= 40) return "bg-amber-400";
  return "bg-blue-400";
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

  const faixaChartData = dashboard?.faixaEtaria
    ? Object.entries(dashboard.faixaEtaria)
        .filter(([key]) => key !== "naoInformado")
        .map(([key, count], i) => ({
          name: FAIXA_LABELS[key] ?? key,
          value: count as number,
          color: FAIXA_COLORS[i] ?? "#94A3B8",
        }))
        .filter((d) => d.value > 0)
    : [];

  const diasChartData = dashboard?.diasSemanaGanhos
    ? [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
        dia: DOW_LABELS[String(dow)],
        total: (dashboard.diasSemanaGanhos as Record<string, number>)[String(dow)] ?? 0,
      }))
    : [];

  const perfil = dashboard?.negocioPerfil;

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

      {/* Oportunidades Quentes */}
      <Card data-testid="card-oportunidades-quentes">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-500/10">
              <Flame className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Oportunidades Quentes</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Negócios com maior probabilidade de fechar
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 px-6 pb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !dashboard?.topOportunidades?.length ? (
            <p className="text-sm text-muted-foreground px-6 pb-6 text-center">
              Nenhum negócio aberto com probabilidade definida.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left text-xs font-medium text-muted-foreground px-6 py-2">#</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Lead</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Negócio</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2">Valor</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2">Prob.</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-6 py-2">Etapa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dashboard.topOportunidades.map((deal, idx) => {
                    const prob = deal.probabilidade ?? 0;
                    return (
                      <tr key={deal.dealId} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-3 text-xs text-muted-foreground w-8">{idx + 1}</td>
                        <td className="px-3 py-3 min-w-[120px]">
                          <p className="font-medium truncate max-w-[140px]">
                            {deal.leadNome ?? "—"}
                          </p>
                        </td>
                        <td className="px-3 py-3 min-w-[140px]">
                          <p className="text-muted-foreground truncate max-w-[180px]">{deal.titulo}</p>
                        </td>
                        <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                          {deal.valor ? formatCurrency(deal.valor) : "—"}
                        </td>
                        <td className="px-3 py-3 w-28">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${probColor(prob)}`}
                                style={{ width: `${prob}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium w-8 text-right">{prob}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ETAPA_BADGE[deal.etapa] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {ETAPA_LABELS[deal.etapa] ?? deal.etapa}
                          </span>
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
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Perfil dos Clientes */}
      <div>
        <h2 className="text-base font-semibold mb-3">Perfil dos Clientes</h2>
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Faixa Etária */}
          <Card data-testid="card-faixa-etaria">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Faixa Etária</CardTitle>
              <p className="text-xs text-muted-foreground">
                Distribuição de idade dos leads (via data de nascimento)
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-36 bg-muted animate-pulse rounded" />
              ) : faixaChartData.length === 0 ? (
                <div className="h-36 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground text-center">
                    Nenhum lead com data de nascimento informada.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart
                    data={faixaChartData}
                    margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      formatter={(value: number) => [value, "leads"]}
                      contentStyle={{
                        fontSize: 12,
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        background: "hsl(var(--card))",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {faixaChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {dashboard?.faixaEtaria?.naoInformado ? (
                <p className="text-xs text-muted-foreground text-center mt-1">
                  {dashboard.faixaEtaria.naoInformado} lead(s) sem data de nascimento informada
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Dias da semana com mais fechamentos */}
          <Card data-testid="card-dias-semana">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Dias com Mais Fechamentos</CardTitle>
              <p className="text-xs text-muted-foreground">
                Deals ganhos por dia da semana (últimos 6 meses)
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-36 bg-muted animate-pulse rounded" />
              ) : diasChartData.every((d) => d.total === 0) ? (
                <div className="h-36 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground text-center">
                    Nenhum deal fechado nos últimos 6 meses.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart
                    data={diasChartData}
                    margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
                  >
                    <XAxis
                      dataKey="dia"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      formatter={(value: number) => [value, "fechamentos"]}
                      contentStyle={{
                        fontSize: 12,
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 6,
                        background: "hsl(var(--card))",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40} fill="#818CF8" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sobre o Negócio */}
      {(isLoading || perfil) && (
        <Card data-testid="card-sobre-negocio">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                {isLoading ? (
                  <div className="h-5 bg-muted animate-pulse rounded w-40 mb-1" />
                ) : (
                  <CardTitle className="text-base font-semibold">
                    {perfil?.nomeFantasia ?? perfil?.razaoSocial ?? "Sobre o Negócio"}
                  </CardTitle>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  Perfil comercial do tenant
                </p>
              </div>
              {perfil?.vertical && (
                <Badge variant="secondary" className="text-xs shrink-0 mt-0.5">
                  {perfil.vertical}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-5 bg-muted animate-pulse rounded w-3/4" />
                ))}
              </div>
            ) : perfil ? (
              <>
                {/* Contato e localização */}
                {(perfil.telefone || perfil.email || perfil.endereco) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {perfil.telefone && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{perfil.telefone}</span>
                      </div>
                    )}
                    {perfil.email && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span>{perfil.email}</span>
                      </div>
                    )}
                    {perfil.endereco && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{perfil.endereco}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Público-alvo */}
                {perfil.publicoAlvo && (
                  <div className="flex gap-3">
                    <div className="mt-0.5 p-1.5 rounded-md bg-violet-500/10 h-fit shrink-0">
                      <Target className="h-3.5 w-3.5 text-violet-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                        Público-alvo
                      </p>
                      <p className="text-sm">{perfil.publicoAlvo}</p>
                    </div>
                  </div>
                )}

                {/* Diferenciais competitivos */}
                {perfil.diferenciais && (
                  <div className="flex gap-3">
                    <div className="mt-0.5 p-1.5 rounded-md bg-amber-500/10 h-fit shrink-0">
                      <Award className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                        Diferenciais Competitivos
                      </p>
                      <p className="text-sm text-muted-foreground">{perfil.diferenciais}</p>
                    </div>
                  </div>
                )}

                {/* Canais de venda + Concorrentes em linha */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {perfil.canaisVenda && perfil.canaisVenda.length > 0 && (
                    <div className="flex gap-3">
                      <div className="mt-0.5 p-1.5 rounded-md bg-emerald-500/10 h-fit shrink-0">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                          Canais de Venda
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {perfil.canaisVenda.map((canal) => (
                            <Badge key={canal} variant="secondary" className="text-xs capitalize">
                              {canal}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {perfil.concorrentes && perfil.concorrentes.length > 0 && (
                    <div className="flex gap-3">
                      <div className="mt-0.5 p-1.5 rounded-md bg-red-500/10 h-fit shrink-0">
                        <Swords className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                          Concorrentes
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {perfil.concorrentes.map((c) => (
                            <Badge key={c} variant="outline" className="text-xs">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Produtos / Serviços */}
                {perfil.produtos && perfil.produtos.length > 0 && (
                  <div className="flex gap-3">
                    <div className="mt-0.5 p-1.5 rounded-md bg-blue-500/10 h-fit shrink-0">
                      <Package className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Produtos / Serviços ({perfil.produtos.length})
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {perfil.produtos.map((p, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-border bg-muted/30 p-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-tight">{p.nome}</p>
                              {p.preco != null && (
                                <span className="text-xs font-semibold text-emerald-600 whitespace-nowrap">
                                  {p.preco.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </span>
                              )}
                            </div>
                            {p.descricao && (
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                {p.descricao}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

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
