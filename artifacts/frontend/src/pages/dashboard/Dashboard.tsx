import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
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

// ── Skeleton placeholders ─────────────────────────────────────────────────────
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
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

  const alertas = data?.alertas.filter((_, i) => !dismissed.has(i)) ?? [];

  // ── Loading state ───────────────────────────────────────────────────────────
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
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
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
  const quotaBarColor = quotaColor(ia.quotaUsada);

  // Estimate monthly token quota from usage (monthly limit from agent_configs not exposed here)
  // Show quotaUsada% directly as the progress value
  const quotaPct = Math.min(ia.quotaUsada, 100);

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
      {alertas.length > 0 && (
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
                {isCritico ? (
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                ) : isAviso ? (
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <AlertTitle className="capitalize">
                    {isCritico ? "Crítico" : isAviso ? "Atenção" : "Info"}
                  </AlertTitle>
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

      {/* ════════════════════════════════════════
          CARDS — VENDAS (4 cols desktop, 2 mobile)
      ════════════════════════════════════════ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Vendas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* Card 1 — Total de Leads */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Leads
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {vendas.totalLeads.toLocaleString("pt-BR")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                +{vendas.leadsNovos} novos esta semana
              </p>
            </CardContent>
          </Card>

          {/* Card 2 — Taxa de Conversão */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Taxa de Conversão
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {vendas.taxaConversao.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Leads → Clientes
              </p>
            </CardContent>
          </Card>

          {/* Card 3 — Ticket Médio */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ticket Médio
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(vendas.ticketMedio)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Deals fechados no período
              </p>
            </CardContent>
          </Card>

          {/* Card 4 — Mensagens Hoje */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mensagens Hoje
              </CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {ia.mensagensHoje.toLocaleString("pt-BR")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {ia.agentesAtivos} agente{ia.agentesAtivos !== 1 ? "s" : ""} ativo{ia.agentesAtivos !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

        </div>
      </section>

      {/* ════════════════════════════════════════
          CARDS — IA (3 cols desktop, 1 mobile)
      ════════════════════════════════════════ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Inteligência Artificial
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Card 5 — Mensagens no Mês */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mensagens no Mês
              </CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {ia.mensagensMes.toLocaleString("pt-BR")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enviadas pelos agentes
              </p>
            </CardContent>
          </Card>

          {/* Card 6 — Quota de IA */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Quota de IA
              </CardTitle>
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

          {/* Card 7 — Agentes Ativos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Agentes Ativos
              </CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {ia.agentesAtivos}
                <span className="text-base font-normal text-muted-foreground"> / 8</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <Link
                  href="/agents/config"
                  className="text-primary hover:underline underline-offset-2"
                >
                  Configurar agentes →
                </Link>
              </p>
            </CardContent>
          </Card>

        </div>
      </section>
    </div>
  );
}
