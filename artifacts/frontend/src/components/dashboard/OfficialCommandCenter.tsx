import { useMemo } from "react";
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

function MetricCard({ title, value, detail, icon: Icon, href, emphasis = false }: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  href?: string;
  emphasis?: boolean;
}) {
  const content = (
    <Card className={`h-full transition-all ${href ? "hover:-translate-y-0.5 hover:shadow-md" : ""} ${emphasis ? "border-primary/30 bg-primary/[0.03]" : ""}`}>
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="rounded-xl border bg-background p-2.5 shadow-sm">
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

export default function OfficialCommandCenter({ data, executive, loading, userName, onRefresh }: {
  data: OfficialMetrics | null;
  executive: ExecutiveSnapshot | null;
  loading: boolean;
  userName: string;
  onRefresh: () => void;
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
    const unassigned = operation?.unassignedActive ?? 0;
    if (overdue > 0) items.push({ label: `${overdue} tarefa${overdue === 1 ? "" : "s"} vencida${overdue === 1 ? "" : "s"}`, detail: "Exigem ação imediata", severity: "critical", href: "/agenda" });
    if (unassigned > 0) items.push({ label: `${unassigned} operação${unassigned === 1 ? "" : "ões"} sem responsável`, detail: "Distribua a responsabilidade operacional", severity: "warning", href: "/pipeline-operacional/execucao" });
    for (const alert of alerts.slice(0, 3)) {
      items.push({ label: alert.mensagem, detail: "Alerta do sistema", severity: alert.severidade === "critico" ? "critical" : "warning", href: "/configuracoes" });
    }
    for (const risk of risks.slice(0, Math.max(0, 5 - items.length))) {
      items.push({ label: risk.nome, detail: risk.churnRisk != null ? `Risco de perda ${risk.churnRisk}%` : "Sem contato recente", severity: risk.churnRisk != null && risk.churnRisk >= 70 ? "critical" : "warning", href: `/leads/${risk.leadId}` });
    }
    return items.slice(0, 5);
  }, [alerts, operation?.overdueTasks, operation?.unassignedActive, risks]);

  if (loading && !data && !executive) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-muted" />)}
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

  return (
    <div className="space-y-5 pb-10">
      <header className="rounded-2xl border bg-card px-5 py-5 shadow-sm md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5"><Activity className="h-3 w-3" /> Central Executiva</Badge>
              <Badge variant="secondary">Dados reais</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
            <p className="mt-1 text-sm capitalize text-muted-foreground">{dateLabel()}</p>
          </div>
          <button onClick={onRefresh} className="inline-flex w-fit items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-muted">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </header>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Visão executiva</h2><span className="text-xs text-muted-foreground">Estado atual + período oficial</span></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <MetricCard title="Leads novos" value={String(commercial?.newLeads ?? 0)} detail="Criados no período oficial" icon={Users} href="/leads" />
          <MetricCard title="Oportunidades ativas" value={String(commercial?.activeOpportunities ?? 0)} detail="Negócios comerciais em aberto" icon={BriefcaseBusiness} href="/negocios" emphasis />
          <MetricCard title="Receita vendida" value={money(commercial?.soldRevenue)} detail={`${commercial?.confirmedSales ?? 0} vendas confirmadas`} icon={CircleDollarSign} href="/relatorios/ganhos-mes" emphasis />
          <MetricCard title="Conversão" value={percentRatio(commercial?.commercialConversion)} detail="Coorte comercial oficial" icon={Percent} href="/negocios" />
          <MetricCard title="Ticket médio" value={(commercial?.confirmedSales ?? 0) > 0 ? money(commercial?.averageTicket) : "—"} detail="Vendas confirmadas no período" icon={TrendingUp} />
          <MetricCard title="Execução ativa" value={String(operation?.executionActive ?? 0)} detail={`${operation?.unassignedActive ?? 0} sem responsável`} icon={Wrench} href="/pipeline-operacional/execucao" />
          <MetricCard title="Suporte ativo" value={String(operation?.supportActive ?? 0)} detail="Assistências em andamento" icon={Headphones} href="/pipeline-operacional/suporte" />
          <MetricCard title="Conversas hoje" value={String(aiUsage?.mensagensHoje ?? 0)} detail={`${aiUsage?.mensagensMes ?? 0} mensagens no mês`} icon={MessageSquareText} href="/conversas" />
          <MetricCard title="Ações de IA" value={String(data.ai?.actionsExecuted ?? 0)} detail={`${data.ai?.actionsPending ?? 0} pendentes`} icon={Bot} href="/metricas-ia" />
          <MetricCard title="Minha atenção" value={String(attentionItems.length)} detail="Prioridades que exigem decisão" icon={AlertTriangle} href="#atencao-hoje" emphasis />
        </div>
      </section>

      <section id="atencao-hoje" className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={AlertTriangle} title="Atenção hoje" description="O que merece sua decisão antes de qualquer outra coisa." />
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={CalendarDays} title="Agenda e próximos passos" description="Pendências e movimento recente do negócio." href="/agenda" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Tarefas vencidas</p><p className="mt-1 text-2xl font-bold">{operation?.overdueTasks ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Sem responsável</p><p className="mt-1 text-2xl font-bold">{operation?.unassignedActive ?? 0}</p></div>
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

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={BriefcaseBusiness} title="Comercial" description="Resultado e força do pipeline sem ocupar a tela com kanban." href="/negocios" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Oportunidades ativas</span><strong>{commercial?.activeOpportunities ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Valor no pipeline</span><strong>{money(executive?.negociacao?.dealsAbertosValor)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vendas confirmadas</span><strong>{commercial?.confirmedSales ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Receita vendida</span><strong>{money(commercial?.soldRevenue)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conversão</span><strong>{percentRatio(commercial?.commercialConversion)}</strong></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={Wrench} title="Execução" description="Capacidade e exceções operacionais." href="/pipeline-operacional/execucao" />
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
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent className="p-5 md:p-6">
            <SectionHeader icon={Target} title="Meta x realizado" description="Metas oficiais configuradas para o período." />
            <div className="space-y-4">
              {(data.goals ?? []).length ? data.goals!.slice(0, 6).map((goal) => {
                const progress = goal.progress == null ? null : Math.max(0, Math.min(100, goal.progress * 100));
                const actual = goal.unit === "currency" ? money(goal.actual) : goal.actual == null ? "—" : String(goal.actual);
                const target = goal.unit === "currency" ? money(goal.target) : String(goal.target);
                return (
                  <div key={goal.id}>
                    <div className="mb-2 flex items-end justify-between gap-4"><div><p className="text-sm font-medium">{goal.label}</p><p className="text-xs text-muted-foreground">{actual} de {target}</p></div><span className="text-sm font-bold">{progress == null ? "—" : `${progress.toFixed(0)}%`}</span></div>
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
            <SectionHeader icon={MessageSquareText} title="Conversas" description="Volume real de comunicação e agentes." href="/conversas" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Hoje</p><p className="mt-1 text-2xl font-bold">{aiUsage?.mensagensHoje ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">No mês</p><p className="mt-1 text-2xl font-bold">{aiUsage?.mensagensMes ?? 0}</p></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{aiUsage?.agentesAtivos ?? 0} agentes ativos agora.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={Bot} title="IA" description="Automação e utilização da quota." href="/metricas-ia" />
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Ações executadas</span><strong>{data.ai?.actionsExecuted ?? 0}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ações pendentes</span><strong>{data.ai?.actionsPending ?? 0}</strong></div>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Clientes em risco</span><strong>{data.intelligence?.customersAtRisk ?? 0}</strong></div>
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
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Qualidade</p><p className="mt-1 text-xl font-bold">{quality?.score == null ? "—" : `${quality.score}%`}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Leads válidos</p><p className="mt-1 text-xl font-bold">{quality?.validLeads ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Sem contato</p><p className="mt-1 text-xl font-bold">{quality?.missingContact ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Sem origem</p><p className="mt-1 text-xl font-bold">{quality?.missingOrigin ?? 0}</p></div>
            </div>
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
