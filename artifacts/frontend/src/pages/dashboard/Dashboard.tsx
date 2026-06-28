import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  TrendingUp,
  DollarSign,
  MessageSquare,
  Bot,
  Zap,
  Cpu,
  AlertTriangle,
  X,
  Info,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardAlerta {
  tipo: string;
  mensagem: string;
  severidade: "info" | "aviso" | "critico";
}

interface DashboardData {
  vendas: {
    totalLeads: number;
    leadsNovos: number;
    taxaConversao: number;
    ticketMedio: number;
    leadsPorStatus: Record<string, number>;
    evolucaoLeads: { data: string; count: number }[];
  };
  ia: {
    mensagensHoje: number;
    mensagensMes: number;
    agentesAtivos: number;
    tokensMes: number;
    quotaUsada: number;
    usosPorAgente: { agentKey: string; nome: string; count: number }[];
  };
  atividade: {
    ultimas20: {
      tipo: string;
      descricao: string;
      entidade: string;
      entidadeId: string;
      createdAt: string;
    }[];
  };
  alertas: DashboardAlerta[];
  periodo: { inicio: string; fim: string };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  novo:        "#8B85A8",
  qualificado: "#A78BFA",
  proposta:    "#38BDF8",
  negociando:  "#F59E0B",
  fechado:     "#10B981",
  perdido:     "#EF4444",
};

const STATUS_LABELS: Record<string, string> = {
  novo:        "Novo",
  qualificado: "Qualificado",
  proposta:    "Proposta",
  negociando:  "Negociando",
  fechado:     "Fechado",
  perdido:     "Perdido",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function quotaColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-green-500";
}

function fmtAxisDate(iso: string): string {
  const [, mm, dd] = iso.split("-");
  return `${dd}/${mm}`;
}

function fmtFullDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-36" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded-md" style={{ height }} />
      </CardContent>
    </Card>
  );
}

// ── Custom Tooltip (LineChart) ────────────────────────────────────────────────
function LeadTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{label ? fmtFullDate(label) : ""}</p>
      <p className="text-muted-foreground">{payload[0].value} leads</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${getBase()}/api/dashboard`, {
          headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function dismiss(idx: number) {
    setDismissed(prev => new Set(prev).add(idx));
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
        <ChartSkeleton height={240} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartSkeleton height={220} />
          <ChartSkeleton height={220} />
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar dashboard</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) return null;

  const { vendas, ia } = data;
  const quotaBarColor  = quotaColor(ia.quotaUsada);
  const quotaPct       = Math.min(ia.quotaUsada, 100);

  // Derived data for charts
  const pieData = Object.entries(vendas.leadsPorStatus)
    .filter(([, v]) => v > 0)
    .map(([status, count]) => ({
      status,
      name:  STATUS_LABELS[status] ?? status,
      count,
      fill:  STATUS_COLORS[status] ?? "#94A3B8",
    }));

  const barData = ia.usosPorAgente.slice(0, 8);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Últimos 30 dias — {new Date(data.periodo.fim).toLocaleDateString("pt-BR")}
        </p>
      </div>

      {/* ── Alertas ── */}
      {data.alertas.some((_, i) => !dismissed.has(i)) && (
        <div className="space-y-2">
          {data.alertas.map((alerta, idx) => {
            if (dismissed.has(idx)) return null;
            const isCritico = alerta.severidade === "critico";
            const isAviso   = alerta.severidade === "aviso";
            const alertClass = isCritico
              ? ""
              : isAviso
              ? "border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-500/40 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
              : "";
            return (
              <Alert
                key={alerta.tipo + idx}
                variant={isCritico ? "destructive" : "default"}
                className={`flex items-start gap-3 pr-3 ${alertClass}`}
              >
                {isAviso || isCritico
                  ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  : <Info className="h-4 w-4 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <AlertTitle>{isCritico ? "Crítico" : isAviso ? "Atenção" : "Info"}</AlertTitle>
                  <AlertDescription>{alerta.mensagem}</AlertDescription>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(idx)}
                  className="shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  aria-label="Dispensar"
                >
                  <X className="h-4 w-4 opacity-60" />
                </button>
              </Alert>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════
          CARDS — VENDAS (4 cols / 2 mobile)
      ════════════════════════════════════ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vendas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vendas.totalLeads.toLocaleString("pt-BR")}</div>
              <p className="text-xs text-muted-foreground mt-1">+{vendas.leadsNovos} novos esta semana</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Conversão</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vendas.taxaConversao.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">Leads → Clientes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Médio</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(vendas.ticketMedio)}</div>
              <p className="text-xs text-muted-foreground mt-1">Deals fechados no período</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Mensagens Hoje</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ia.mensagensHoje.toLocaleString("pt-BR")}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {ia.agentesAtivos} agente{ia.agentesAtivos !== 1 ? "s" : ""} ativo{ia.agentesAtivos !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

        </div>
      </section>

      {/* ════════════════════════════════════
          CARDS — IA (3 cols / 1 mobile)
      ════════════════════════════════════ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Inteligência Artificial</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Mensagens no Mês</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ia.mensagensMes.toLocaleString("pt-BR")}</div>
              <p className="text-xs text-muted-foreground mt-1">Enviadas pelos agentes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Quota de IA</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-bold">{quotaPct}%</div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
                <div
                  className={`h-full rounded-full transition-all ${quotaBarColor}`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {ia.tokensMes.toLocaleString("pt-BR")} tokens utilizados este mês
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Agentes Ativos</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {ia.agentesAtivos}
                <span className="text-base font-normal text-muted-foreground"> / 8</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <Link href="/agents/config" className="text-primary hover:underline underline-offset-2">
                  Configurar agentes →
                </Link>
              </p>
            </CardContent>
          </Card>

        </div>
      </section>

      {/* ════════════════════════════════════
          GRÁFICO 1 — Evolução de leads (full width)
      ════════════════════════════════════ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Evolução</h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Leads nos últimos 30 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={vendas.evolucaoLeads} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-leads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#A78BFA" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#A78BFA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="data"
                  tickFormatter={fmtAxisDate}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<LeadTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#A78BFA"
                  strokeWidth={2}
                  fill="url(#grad-leads)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: "#A78BFA" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      {/* ════════════════════════════════════
          GRÁFICOS 2 e 3 — grid 2 cols / 1 mobile
      ════════════════════════════════════ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Detalhes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Gráfico 2 — Distribuição por status (Donut) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Distribuição por status</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                  Nenhum lead no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="count"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.status} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [value, name]}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--background))",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 3 — Uso por agente (Horizontal Bar) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Mensagens por agente</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                  Nenhum dado de uso no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    layout="vertical"
                    data={barData}
                    margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="grad-agents" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%"   stopColor="#818CF8" />
                        <stop offset="100%" stopColor="#22D3EE" />
                      </linearGradient>
                    </defs>
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={90}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) => [value, "mensagens"]}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--background))",
                      }}
                    />
                    <Bar dataKey="count" fill="url(#grad-agents)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

        </div>
      </section>

    </div>
  );
}
