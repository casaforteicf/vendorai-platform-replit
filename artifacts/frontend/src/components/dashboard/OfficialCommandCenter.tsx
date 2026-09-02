import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  Headphones,
  PackageCheck,
  Percent,
  Target,
  Users,
} from "lucide-react";

type OfficialMetrics = {
  commercial?: {
    newLeads?: number;
    activeOpportunities?: number;
    confirmedSales?: number;
    soldRevenue?: number;
    averageTicket?: number;
    commercialConversion?: number | null;
  };
  operation?: {
    executionActive?: number;
    supportActive?: number;
    unassignedActive?: number;
    overdueTasks?: number;
  };
  intelligence?: {
    customersAtRisk?: number;
    withNextBestAction?: number;
    profiles?: number;
  };
  ai?: {
    actionsExecuted?: number;
    actionsPending?: number;
    actionsRejected?: number;
  };
  stages?: Array<{
    pipeline: string;
    stageKey: string;
    label: string;
    slaMinutes: number | null;
    completedSamples: number;
    avgDurationSeconds: number | null;
    medianDurationSeconds: number | null;
    slaBreaches: number;
    activeWithRealEntry: number;
    historical: boolean;
  }>;
  goals?: Array<{
    id: string;
    metricKey: string;
    label: string;
    unit: string;
    target: number;
    actual: number | null;
    progress: number | null;
  }>;
  feedback?: {
    csat?: number | null;
    csatResponses?: number;
    nps?: number | null;
    npsResponses?: number;
  };
  marketing?: {
    metaAdsConnected?: boolean;
    googleAdsConnected?: boolean;
    roas?: number | null;
    cpl?: number | null;
    status?: string;
    note?: string;
  };
  dataQuality?: {
    validLeads?: number;
    missingName?: number;
    missingContact?: number;
    missingOrigin?: number;
    score?: number | null;
  };
};

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "sem histórico";
  const hours = seconds / 3600;
  if (hours < 24) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-[clamp(1.1rem,5vw,1.5rem)] font-bold">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function OfficialCommandCenter({
  data,
  loading,
}: {
  data: OfficialMetrics | null;
  loading: boolean;
}) {
  const topBottlenecks = useMemo(
    () => [...(data?.stages ?? [])]
      .filter((item) => item.historical || item.activeWithRealEntry > 0)
      .sort((a, b) => (b.slaBreaches - a.slaBreaches) || ((b.avgDurationSeconds ?? 0) - (a.avgDurationSeconds ?? 0)))
      .slice(0, 3),
    [data],
  );

  const mainGoal = data?.goals?.find((goal) => goal.metricKey === "sold_revenue") ?? data?.goals?.[0] ?? null;
  const commercial = data?.commercial;
  const operation = data?.operation;
  const quality = data?.dataQuality;

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Carregando métricas oficiais">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="mb-3 h-3 w-24 rounded bg-muted" />
              <div className="mb-2 h-7 w-20 rounded bg-muted" />
              <div className="h-3 w-32 rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex items-center gap-3 py-5 text-sm">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">Métricas oficiais temporariamente indisponíveis</p>
            <p className="text-muted-foreground">O dashboard complementar continua disponível abaixo.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const confirmedSales = commercial?.confirmedSales ?? 0;
  const conversion = commercial?.commercialConversion;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" /> Centro de Métricas Oficiais
          </p>
          <p className="text-xs text-muted-foreground">
            Fonte transacional oficial da migration 206. Ausência de dado permanece nula, nunca estimada.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">Fonte oficial · tempo real</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Leads novos"
          value={String(commercial?.newLeads ?? 0)}
          detail="criados no período oficial"
          icon={Users}
        />
        <MetricCard
          title="Oportunidades ativas"
          value={String(commercial?.activeOpportunities ?? 0)}
          detail="negócios comerciais não encerrados"
          icon={BriefcaseBusiness}
        />
        <MetricCard
          title="Receita vendida"
          value={money(commercial?.soldRevenue)}
          detail={`${confirmedSales} vendas confirmadas no período`}
          icon={PackageCheck}
        />
        <MetricCard
          title="Conversão comercial"
          value={conversion == null ? "—" : `${(conversion * 100).toFixed(1)}%`}
          detail="ganhos da coorte ÷ oportunidades criadas"
          icon={Percent}
        />
        <MetricCard
          title="Ticket médio"
          value={confirmedSales > 0 ? money(commercial?.averageTicket) : "—"}
          detail="vendas confirmadas no período"
          icon={CircleDollarSign}
        />
        <MetricCard
          title="Execução ativa"
          value={String(operation?.executionActive ?? 0)}
          detail={`${operation?.unassignedActive ?? 0} operações sem responsável`}
          icon={BarChart3}
        />
        <MetricCard
          title="Suporte ativo"
          value={String(operation?.supportActive ?? 0)}
          detail="assistências em andamento"
          icon={Headphones}
        />
        <MetricCard
          title="Minha atenção"
          value={String(operation?.overdueTasks ?? 0)}
          detail="tarefas pendentes ou planejadas vencidas"
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4" /> Meta x realizado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {mainGoal ? (
              <>
                <p className="font-semibold">{mainGoal.label}</p>
                <p className="mt-1 text-muted-foreground">
                  {mainGoal.unit === "currency" ? money(mainGoal.actual) : (mainGoal.actual ?? "—")} de {mainGoal.unit === "currency" ? money(mainGoal.target) : mainGoal.target}
                </p>
                <p className="mt-2 text-lg font-bold">
                  {mainGoal.progress == null ? "—" : `${(mainGoal.progress * 100).toFixed(1)}%`}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma meta ativa configurada para o período.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Gargalos / SLA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {topBottlenecks.length > 0 ? topBottlenecks.map((item) => (
              <div key={`${item.pipeline}-${item.stageKey}`} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.pipeline} · média {formatDuration(item.avgDurationSeconds)}</p>
                </div>
                <Badge variant={item.slaBreaches > 0 ? "destructive" : "secondary"}>{item.slaBreaches} violações</Badge>
              </div>
            )) : (
              <p className="text-muted-foreground">Sem histórico medido suficiente para apontar gargalos.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualidade e fontes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-semibold">{quality?.score == null ? "—" : `${quality.score}%`}</span>{" "}
              <span className="text-muted-foreground">de completude da base válida</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {data.ai?.actionsExecuted ?? 0} ações de IA executadas no período · {data.intelligence?.customersAtRisk ?? 0} clientes em risco.
            </p>
            <p className="text-xs text-muted-foreground">
              CSAT: {data.feedback?.csat == null ? "sem respostas" : data.feedback.csat.toFixed(1)} · NPS: {data.feedback?.nps == null ? "sem respostas" : data.feedback.nps.toFixed(1)}
            </p>
            <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              Marketing: {data.marketing?.note ?? "métricas dependem de integração e atribuição confirmadas."}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
