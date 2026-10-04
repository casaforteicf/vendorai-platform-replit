import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Database,
  Gauge,
  Headphones,
  Megaphone,
  MessageSquareText,
  PackageCheck,
  Percent,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type OfficialMetrics = {
  period?: { start?: string; end?: string };
  commercial?: {
    newLeads?: number;
    activeOpportunities?: number;
    confirmedSales?: number;
    soldRevenue?: number;
    averageTicket?: number;
    commercialConversion?: number | null;
    conversionDenominator?: number;
    conversionNumerator?: number;
    unassignedLeads?: number;
  };
  operation?: {
    executionActive?: number;
    supportActive?: number;
    unassignedActive?: number;
    overdueTasks?: number;
    overdueTaskItems?: Array<{
      id: string;
      leadId?: string | null;
      dealId?: string | null;
      title: string;
      dueAt?: string | null;
    }>;
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
    periodType?: string;
    startsAt?: string;
    endsAt?: string;
    scope?: string;
    responsibleName?: string | null;
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

export type ExecutiveSnapshot = {
  negociacao?: {
    leadsEmNegociacao?: number;
    dealsAbertos?: number;
    dealsAbertosValor?: number;
    dealsGanhosMes?: number;
    dealsGanhosMesValor?: number;
  };
  riscoPerda?: Array<{
    leadId: string;
    nome: string;
    statusLabel?: string;
    churnRisk?: number | null;
    motivo?: string;
  }>;
  ia?: {
    mensagensHoje?: number;
    mensagensMes?: number;
    agentesAtivos?: number;
    tokensMes?: number;
    quotaUsada?: number;
    usosPorAgente?: Array<{ agentKey: string; nome: string; count: number }>;
  };
  atividade?: {
    ultimas20?: Array<{
      tipo: string;
      descricao: string;
      entidade: string;
      entidadeId: string;
      createdAt: string;
    }>;
  };
  alertas?: Array<{
    tipo: string;
    mensagem: string;
    severidade: "info" | "aviso" | "critico";
  }>;
};

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percentRatio(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "sem histórico";
  const hours = seconds / 3600;
  if (hours < 24) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function dateLabel(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function shortDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function periodLabel(period?: OfficialMetrics["period"]): string {
  const start = shortDate(period?.start);
  const end = shortDate(period?.end);
  if (!start || !end) return "período não informado";
  return `${start} a ${end}`;
}

function goalValue(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  if (unit === "currency") return money(value);
  if (unit === "percent") return `${value.toFixed(1)}%`;
  return value.toLocaleString("pt-BR");
}

function alertHref(type: string): string {
  if (type === "sem_agente" || type === "whatsapp_desconectado") return "/agentes";
  if (type === "quota_critica" || type === "quota_alta") return "/metricas-ia";
  return "/configuracoes";
}

function MetricCard({ title, value, detail, icon: Icon, href, emphasis = false, explanation }: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  href?: string;
  emphasis?: boolean;
  explanation?: string;
}) {
  const content = (
    <Card
      title={explanation}
      className={`h-full rounded-2xl border-border/60 bg-card shadow-sm transition-all ${href ? "hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md" : ""} ${emphasis ? "border-primary/20 bg-primary/[0.025]" : ""}`}
    >
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="rounded-xl border border-primary/10 bg-primary/[0.07] p-2.5">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {href ? <ArrowUpRight className="h-4 w-4 text-muted-foreground" /> : null}
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
        <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );

  return href ? <a href={href} className="block h-full">{content}</a> : content;
}

function SectionHeader({ icon: Icon, title, description, href }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {href ? <a href={href} className="text-xs font-medium text-primary hover:underline">Abrir <ArrowUpRight className="ml-1 inline h-3 w-3" /></a> : null}
    </div>
  );
}

export default function OfficialCommandCenter({ data, executive, loading, userName, onRefresh, goalsAction }: {
  data: OfficialMetrics | null;
  executive: ExecutiveSnapshot | null;
  loading: boolean;
  userName: string;
  onRefresh: () => void;
  goalsAction?: ReactNode;
}) {
  const firstName = userName.trim().split(/\s+/)[0] || "";
  const commercial = data?.commercial;
  const operation = data?.operation;
  const quality = data?.dataQuality;
  const alerts = executive?.alertas ?? [];
  const risks = executive?.riscoPerda ?? [];
  const recentActivity = executive?.atividade?.ultimas20 ?? [];
  const aiUsage = executive?.ia;

  const bottlenecks = useMemo(
    () => [...(data?.stages ?? [])]
      .filter((item) => item.historical || item.activeWithRealEntry > 0)
      .sort((a, b) => (b.slaBreaches - a.slaBreaches) || ((b.avgDurationSeconds ?? 0) - (a.avgDurationSeconds ?? 0)))
      .slice(0, 5),
    [data],
  );

  const attentionItems = useMemo(() => {
    const items: Array<{ label: string; detail: string; severity: "normal" | "warning" | "critical"; href: string }> = [];
    const overdue = operation?.overdueTasks ?? 0;
    const unassigned = commercial?.unassignedLeads ?? 0;
    if (overdue > 0) {
      const firstOverdue = operation?.overdueTaskItems?.[0];
      const href = overdue === 1 && firstOverdue?.leadId
        ? `/leads/${firstOverdue.leadId}?activityId=${firstOverdue.id}&from=dashboard-overdue`
        : "/trabalho?attention=vencidos";
      items.push({
        label: `${overdue} tarefa${overdue === 1 ? "" : "s"} vencida${overdue === 1 ? "" : "s"}`,
        detail: overdue === 1 && firstOverdue?.title ? firstOverdue.title : "Exigem ação imediata",
        severity: "critical",
        href,
      });
    }
    if (unassigned > 0) items.push({ label: `${unassigned} lead${unassigned === 1 ? "" : "s"} sem responsável`, detail: "Defina um responsável comercial", severity: "warning", href: "/leads" });
    for (const alert of alerts) {
      items.push({ label: alert.mensagem, detail: "Alerta do sistema", severity: alert.severidade === "critico" ? "critical" : "warning", href: alertHref(alert.tipo) });
    }
    for (const risk of risks) {
      items.push({ label: risk.nome, detail: risk.churnRisk != null ? `Risco de perda ${risk.churnRisk}%` : "Sem contato recente", severity: "warning", href: `/leads/${risk.leadId}` });
    }
    return items.slice(0, 5);
  }, [alerts, commercial?.unassignedLeads, operation?.overdueTaskItems, operation?.overdueTasks, risks]);

  const attentionCount = useMemo(() => {
    const overdue = operation?.overdueTasks ?? 0;
    const unassigned = commercial?.unassignedLeads ?? 0;
    return overdue + unassigned + alerts.length + risks.length;
  }, [alerts.length, commercial?.unassignedLeads, operation?.overdueTasks, risks.length]);

  if (loading && !data && !executive) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-2"><div className="h-72 animate-pulse rounded-2xl bg-muted" /><div className="h-72 animate-pulse rounded-2xl bg-muted" /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl py-16">
        <Card className="border-destructive/30">
          <CardContent className="flex items-start gap-4 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Central Executiva temporariamente indisponível</p>
              <p className="mt-1 text-sm text-muted-foreground">Não exibimos métricas alternativas ou estimadas quando a fonte oficial não responde.</p>
            </div>
            <button onClick={onRefresh} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"><RefreshCw className="mr-1.5 inline h-3.5 w-3.5" />Tentar novamente</button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const marketingVisible = !!(data.marketing?.metaAdsConnected || data.marketing?.googleAdsConnected || data.marketing?.cpl != null || data.marketing?.roas != null);
  const quotaUsed = aiUsage?.quotaUsada ?? 0;
  const officialPeriod = periodLabel(data.period);
  const goalsCount = data.goals?.length ?? 0;
  const conversionWon = commercial?.conversionNumerator ?? 0;
  const conversionCreated = commercial?.conversionDenominator ?? 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
      <header className="px-1 pt-1">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5 border-primary/15 bg-primary/[0.04] text-primary"><Activity className="h-3 w-3" /> Command Center</Badge>
              <Badge variant="secondary" className="bg-muted/70">Dados reais</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-[32px]">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">Acompanhe resultados, prioridades e atuação da operação em uma visão executiva mais simples.</p>
            <p className="mt-1 text-xs capitalize text-muted-foreground/80">{dateLabel()} · período {officialPeriod}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {goalsAction}
            <button onClick={onRefresh} className="inline-flex w-fit items-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>
        </div>
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Visão executiva</h2>
          {goalsCount > 0 ? <span className="text-xs text-muted-foreground">{goalsCount} meta{goalsCount === 1 ? "" : "s"} ativa{goalsCount === 1 ? "" : "s"}</span> : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Leads ativos" value={String(commercial?.newLeads ?? 0)} detail={`Novos no período ${officialPeriod}`} icon={Users} href="/leads" explanation="Leads válidos criados dentro do período oficial." />
          <MetricCard title="Negócios" value={String(commercial?.activeOpportunities ?? 0)} detail={`${money(executive?.negociacao?.dealsAbertosValor)} em pipeline`} icon={BriefcaseBusiness} href="/negocios" emphasis explanation="Deals que ainda não estão marcados como ganhos ou perdidos." />
          <MetricCard title="Conversão" value={percentRatio(commercial?.commercialConversion)} detail={`${conversionWon} ganhos de ${conversionCreated} oportunidades`} icon={Percent} href="/negocios" explanation="Deals ganhos criados no período divididos pelas oportunidades criadas no mesmo período." />
          <MetricCard title="Tarefas e atenção" value={String(attentionCount)} detail={`${operation?.overdueTasks ?? 0} vencidas · ${commercial?.unassignedLeads ?? 0} leads sem responsável`} icon={AlertTriangle} href="#atencao-hoje" emphasis explanation="Soma tarefas vencidas, itens sem responsável, alertas do sistema e clientes em risco." />
        </div>
      </section>

      <section id="atencao-hoje" className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={AlertTriangle} title="Atenção hoje" description="As primeiras prioridades; cada item abre o local onde a ação pode ser resolvida." />
            <div className="space-y-2">
              {attentionItems.length ? attentionItems.map((item, index) => (
                <a key={`${item.label}-${index}`} href={item.href} className="flex items-center justify-between gap-4 rounded-xl border p-3.5 transition-colors hover:bg-muted/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === "critical" ? "bg-destructive" : item.severity === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.detail}</p></div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              )) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Nenhuma prioridade crítica identificada agora.</div>
              )}
            </div>
            {attentionCount > attentionItems.length ? <p className="mt-3 text-xs text-muted-foreground">Exibindo as 5 primeiras de {attentionCount} ocorrências que exigem atenção.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={CalendarDays} title="Agenda e próximos passos" description="Pendências programadas e movimento recente do negócio." href="/agenda" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Tarefas vencidas</p><p className="mt-1 text-2xl font-bold">{operation?.overdueTasks ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Leads sem responsável</p><p className="mt-1 text-2xl font-bold">{commercial?.unassignedLeads ?? 0}</p></div>
            </div>
            <div className="mt-4 space-y-2">
              {recentActivity.slice(0, 4).map((item) => (
                <div key={`${item.entidade}-${item.entidadeId}-${item.createdAt}`} className="flex items-start gap-3 rounded-lg py-1.5">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div><p className="text-xs font-medium leading-5">{item.descricao}</p><p className="text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")}</p></div>
                </div>
              ))}
              {!recentActivity.length ? <p className="py-3 text-xs text-muted-foreground">Sem movimentações recentes disponíveis.</p> : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Operação</h2>
          <span className="text-xs text-muted-foreground">Indicadores complementares, sem competir com as prioridades da primeira dobra</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={BriefcaseBusiness} title="Comercial" description="Resultado e força do pipeline sem ocupar a tela com kanban." href="/negocios" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Oportunidades ativas</span><strong>{commercial?.activeOpportunities ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor no pipeline</span><strong>{money(executive?.negociacao?.dealsAbertosValor)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vendas confirmadas</span><strong>{commercial?.confirmedSales ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Receita vendida</span><strong>{money(commercial?.soldRevenue)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conversão</span><strong>{percentRatio(commercial?.commercialConversion)}</strong></div>
              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Conversão = ganhos criados no período ÷ oportunidades criadas no período ({conversionWon}/{conversionCreated}).</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={Wrench} title="Execução" description="Cards operacionais ainda não concluídos ou cancelados." href="/pipeline-operacional/execucao" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Execuções ativas</span><strong>{operation?.executionActive ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sem responsável</span><strong>{operation?.unassignedActive ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tarefas vencidas</span><strong>{operation?.overdueTasks ?? 0}</strong></div>
              <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">SLA e gargalos são calculados apenas com histórico real de transição.</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={Headphones} title="Suporte" description="Assistências, SLA e satisfação." href="/pipeline-operacional/suporte" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Suportes ativos</span><strong>{operation?.supportActive ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">CSAT</span><strong>{data.feedback?.csat == null ? "—" : data.feedback.csat.toFixed(1)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Respostas CSAT</span><strong>{data.feedback?.csatResponses ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">NPS</span><strong>{data.feedback?.nps == null ? "—" : data.feedback.nps.toFixed(1)}</strong></div>
            </div>
          </CardContent>
        </Card>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={Target} title="Meta x realizado" description={`Metas oficiais que cruzam o período ${officialPeriod}.`} />
            <div className="space-y-4">
              {(data.goals ?? []).length ? data.goals!.slice(0, 6).map((goal) => {
                const progress = goal.progress == null ? null : Math.max(0, Math.min(100, goal.progress * 100));
                const actual = goalValue(goal.actual, goal.unit);
                const target = goalValue(goal.target, goal.unit);
                return (
                  <div key={goal.id}>
                    <div className="mb-2 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{goal.label}</p>
                        <p className="text-xs text-muted-foreground">{actual} de {target}</p>
                      </div>
                      <span className="text-sm font-bold">{progress == null ? "—" : `${progress.toFixed(0)}%`}</span>
                    </div>
                    <Progress value={progress ?? 0} className="h-2" />
                  </div>
                );
              }) : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Nenhuma meta ativa configurada para o período.</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={Gauge} title="Gargalos e SLA" description="Etapas que mais exigem intervenção." />
            <div className="space-y-2">
              {bottlenecks.length ? bottlenecks.map((item) => (
                <div key={`${item.pipeline}-${item.stageKey}`} className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.pipeline} · média {formatDuration(item.avgDurationSeconds)} · {item.activeWithRealEntry} ativos</p></div>
                  <Badge variant={item.slaBreaches > 0 ? "destructive" : "secondary"}>{item.slaBreaches} violações</Badge>
                </div>
              )) : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Sem histórico medido suficiente para apontar gargalos.</div>}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={MessageSquareText} title="Conversas" description="Mensagens reais enviadas pela IA e agentes habilitados." href="/conversas" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Hoje</p><p className="mt-1 text-2xl font-bold">{aiUsage?.mensagensHoje ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">No mês</p><p className="mt-1 text-2xl font-bold">{aiUsage?.mensagensMes ?? 0}</p></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{aiUsage?.agentesAtivos ?? 0} agentes de IA habilitados.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={Bot} title="IA" description="Automação e utilização da quota." href="/metricas-ia" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Ações executadas</span><strong>{data.ai?.actionsExecuted ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ações pendentes</span><strong>{data.ai?.actionsPending ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ações rejeitadas</span><strong>{data.ai?.actionsRejected ?? 0}</strong></div>
              <div className="rounded-xl bg-muted/50 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Quota utilizada</span>
                  <strong className="text-base">{quotaUsed.toFixed(1)}%</strong>
                </div>
                <Progress value={Math.min(100, quotaUsed)} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={Sparkles} title="Inteligência" description="Risco e próximas melhores ações." />
            <div className="space-y-3 text-sm">
              <a href="/leads?filtro=churn" className="flex justify-between rounded-md hover:text-primary"><span className="text-muted-foreground">Clientes em risco</span><strong>{data.intelligence?.customersAtRisk ?? 0}</strong></a>
              <div className="flex justify-between"><span className="text-muted-foreground">Com próxima melhor ação</span><strong>{data.intelligence?.withNextBestAction ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Perfis analisados</span><strong>{data.intelligence?.profiles ?? 0}</strong></div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className={`grid gap-4 ${marketingVisible ? "xl:grid-cols-2" : ""}`}>
        <Card>
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={Database} title="Qualidade dos dados" description="Confiabilidade da base usada pelas decisões." />
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Qualidade</p><p className="mt-1 text-xl font-bold">{quality?.score == null ? "—" : `${quality.score}%`}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Leads avaliados</p><p className="mt-1 text-xl font-bold">{quality?.validLeads ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Sem nome</p><p className="mt-1 text-xl font-bold">{quality?.missingName ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Sem contato</p><p className="mt-1 text-xl font-bold">{quality?.missingContact ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Sem origem</p><p className="mt-1 text-xl font-bold">{quality?.missingOrigin ?? 0}</p></div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">O score mede a completude de nome, contato e origem dos leads avaliados. Quanto mais campos essenciais ausentes, menor a confiabilidade para decisões e IA.</p>
          </CardContent>
        </Card>

        {marketingVisible ? (
          <Card>
            <CardContent className="p-5 md:p-6">
              <SectionHeader icon={Megaphone} title="Marketing" description="Somente dados confirmados pelas integrações." />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">CPL</p><p className="mt-1 text-xl font-bold">{data.marketing?.cpl == null ? "—" : money(data.marketing.cpl)}</p></div>
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">ROAS</p><p className="mt-1 text-xl font-bold">{data.marketing?.roas == null ? "—" : `${data.marketing.roas.toFixed(2)}x`}</p></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{data.marketing?.note ?? "Métricas exibidas apenas quando houver fonte e atribuição confirmadas."}</p>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><PackageCheck className="h-3.5 w-3.5" /> Fonte transacional oficial · sem números simulados</span>
        <span className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5" /> Valores indisponíveis permanecem nulos</span>
      </div>
    </div>
  );
}
