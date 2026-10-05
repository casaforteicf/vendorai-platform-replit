import { useMemo, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Megaphone,
  Percent,
  RefreshCw,
  Sparkles,
  Target,
  Users,
  WalletCards,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ExecutiveSnapshot, OfficialMetrics } from "@/components/dashboard/OfficialCommandCenter";

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function percentRatio(value: number | null | undefined) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function compact(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function shortDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR");
}

function periodLabel(period?: OfficialMetrics["period"]) {
  const start = shortDate(period?.start);
  const end = shortDate(period?.end);
  return start && end ? `${start} a ${end}` : "período atual";
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  href?: string;
  accent?: boolean;
}) {
  const card = (
    <Card className={`group h-full overflow-hidden rounded-2xl border-border/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${accent ? "border-primary/20 bg-primary/[0.025]" : ""}`}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl border border-primary/10 bg-primary/[0.07] p-2.5">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {href ? <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /> : null}
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">{value}</p>
        <p className="mt-1.5 min-h-8 text-xs leading-4 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
  return href ? <a href={href} className="block h-full">{card}</a> : card;
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-[230px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">{text}</div>;
}

function SectionTitle({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  href?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-lg bg-primary/[0.07] p-2 text-primary"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {href ? <a href={href} className="shrink-0 text-xs font-medium text-primary hover:underline">Ver tudo <ArrowRight className="ml-1 inline h-3 w-3" /></a> : null}
    </div>
  );
}

export default function ExecutiveDashboardModern({
  data,
  executive,
  loading,
  userName,
  onRefresh,
  goalsAction,
}: {
  data: OfficialMetrics | null;
  executive: ExecutiveSnapshot | null;
  loading: boolean;
  userName: string;
  onRefresh: () => void;
  goalsAction?: ReactNode;
}) {
  const commercial = data?.commercial;
  const operation = data?.operation;
  const intelligence = data?.intelligence;
  const ai = data?.ai;
  const aiUsage = executive?.ia;
  const recentActivity = executive?.atividade?.ultimas20 ?? [];
  const risks = executive?.riscoPerda ?? [];
  const alerts = executive?.alertas ?? [];
  const stages = data?.stages ?? [];
  const goals = data?.goals ?? [];

  const activeStageData = useMemo(
    () => stages
      .filter((item) => item.activeWithRealEntry > 0 || item.completedSamples > 0)
      .slice(0, 8)
      .map((item) => ({
        name: item.label,
        ativos: item.activeWithRealEntry,
        concluidos: item.completedSamples,
        sla: item.slaBreaches,
      })),
    [stages],
  );

  const funnelData = useMemo(
    () => [...activeStageData]
      .sort((a, b) => b.ativos - a.ativos)
      .slice(0, 5),
    [activeStageData],
  );

  const agentUsage = useMemo(
    () => (aiUsage?.usosPorAgente ?? [])
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 7)
      .map((item) => ({ name: item.nome || item.agentKey, value: item.count })),
    [aiUsage?.usosPorAgente],
  );

  const actionItems = useMemo(() => {
    const items: Array<{ title: string; detail: string; href: string; level: "critical" | "warning" | "normal" }> = [];
    const overdue = operation?.overdueTasks ?? 0;
    const unassigned = commercial?.unassignedLeads ?? 0;
    if (overdue > 0) items.push({ title: `${overdue} tarefa${overdue === 1 ? "" : "s"} vencida${overdue === 1 ? "" : "s"}`, detail: "Priorizar pendências operacionais", href: "/trabalho?attention=vencidos", level: "critical" });
    if (unassigned > 0) items.push({ title: `${unassigned} lead${unassigned === 1 ? "" : "s"} sem responsável`, detail: "Distribuir para a equipe comercial", href: "/leads", level: "warning" });
    for (const risk of risks.slice(0, 2)) {
      items.push({ title: `Risco de perda: ${risk.nome}`, detail: risk.motivo || (risk.churnRisk != null ? `Risco estimado em ${risk.churnRisk}%` : "Cliente exige atenção"), href: `/leads/${risk.leadId}`, level: "warning" });
    }
    for (const alert of alerts.slice(0, 2)) {
      items.push({ title: alert.mensagem, detail: "Alerta automático da operação", href: alert.tipo.includes("quota") ? "/metricas-ia" : "/configuracoes", level: alert.severidade === "critico" ? "critical" : "warning" });
    }
    if (!items.length) items.push({ title: "Operação sem alertas críticos", detail: "Nenhuma prioridade urgente identificada agora", href: "/trabalho", level: "normal" });
    return items.slice(0, 5);
  }, [alerts, commercial?.unassignedLeads, operation?.overdueTasks, risks]);

  if (loading && !data && !executive) {
    return (
      <div className="mx-auto max-w-[1680px] space-y-4 pb-10">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="h-80 animate-pulse rounded-2xl bg-muted xl:col-span-2" />
          <div className="h-80 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl py-16">
        <Card className="rounded-2xl border-destructive/30">
          <CardContent className="flex items-start gap-4 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Dashboard executivo temporariamente indisponível</p>
              <p className="mt-1 text-sm text-muted-foreground">Os números não são estimados quando a fonte oficial não responde.</p>
            </div>
            <button onClick={onRefresh} className="rounded-xl border px-3 py-2 text-xs font-medium hover:bg-muted">Tentar novamente</button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const period = periodLabel(data.period);
  const conversionWon = commercial?.conversionNumerator ?? 0;
  const conversionCreated = commercial?.conversionDenominator ?? 0;
  const attentionCount = (operation?.overdueTasks ?? 0) + (commercial?.unassignedLeads ?? 0) + risks.length + alerts.length;
  const firstName = userName.trim().split(/\s+/)[0] || "";
  const quotaUsed = Math.max(0, Math.min(100, aiUsage?.quotaUsada ?? 0));
  const marketingVisible = !!(data.marketing?.metaAdsConnected || data.marketing?.googleAdsConnected || data.marketing?.cpl != null || data.marketing?.roas != null);

  return (
    <div className="mx-auto max-w-[1680px] space-y-5 pb-12">
      <header className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-primary/[0.04] px-5 py-5 shadow-sm md:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/15 bg-primary/[0.05] text-primary"><Activity className="mr-1.5 h-3 w-3" /> Executivo</Badge>
              <Badge variant="secondary">Dados reais</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-[30px]">Dashboard{firstName ? ` · ${firstName}` : ""}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Visão completa do negócio em tempo real · {period}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {goalsAction}
            <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-2.5 text-sm font-medium shadow-sm transition hover:bg-muted">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto border-t border-border/50 pt-4 text-sm">
          {[
            ["Executivo", "#dashboard-executivo"],
            ["Comercial", "#dashboard-comercial"],
            ["Marketing", "#dashboard-marketing"],
            ["Operacional", "#dashboard-operacional"],
            ["IA & Automações", "#dashboard-ia"],
          ].map(([label, href], index) => (
            <a key={label} href={href} className={`whitespace-nowrap rounded-lg px-3 py-2 font-medium transition-colors ${index === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{label}</a>
          ))}
        </nav>
      </header>

      <section id="dashboard-executivo" className="scroll-mt-24">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard label="Novos leads" value={String(commercial?.newLeads ?? 0)} detail={`Criados em ${period}`} icon={Users} href="/leads" />
          <MetricCard label="Oportunidades" value={String(commercial?.activeOpportunities ?? 0)} detail="Negócios ativos no pipeline" icon={BriefcaseBusiness} href="/negocios" />
          <MetricCard label="Pipeline" value={money(executive?.negociacao?.dealsAbertosValor)} detail={`${executive?.negociacao?.dealsAbertos ?? commercial?.activeOpportunities ?? 0} negócios abertos`} icon={WalletCards} href="/negocios" accent />
          <MetricCard label="Conversão" value={percentRatio(commercial?.commercialConversion)} detail={`${conversionWon} ganhos de ${conversionCreated} oportunidades`} icon={Percent} href="/negocios" />
          <MetricCard label="Receita" value={money(commercial?.soldRevenue)} detail={`${commercial?.confirmedSales ?? 0} vendas confirmadas`} icon={Target} href="/negocios" accent />
          <MetricCard label="Atenção" value={String(attentionCount)} detail={`${operation?.overdueTasks ?? 0} vencidas · ${commercial?.unassignedLeads ?? 0} sem responsável`} icon={AlertTriangle} href="#ia-recomenda" />
        </div>
      </section>

      <section id="dashboard-comercial" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5 md:p-6">
            <SectionTitle icon={BarChart3} title="Pipeline por etapa" description="Comparação entre registros ativos e concluídos com base no histórico real das etapas." href="/negocios" />
            {activeStageData.length ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activeStageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={activeStageData.length > 5 ? -18 : 0} textAnchor={activeStageData.length > 5 ? "end" : "middle"} height={activeStageData.length > 5 ? 55 : 30} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="ativos" name="Ativos" stroke="hsl(var(--primary))" fill="url(#dashActive)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="concluidos" name="Concluídos" stroke="hsl(var(--muted-foreground))" fillOpacity={0} strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyChart text="Sem histórico suficiente para desenhar a evolução do pipeline." />}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5 md:p-6">
            <SectionTitle icon={Gauge} title="Funil comercial" description="Etapas com maior volume ativo no período." />
            <div className="space-y-3">
              {funnelData.length ? funnelData.map((item, index) => {
                const max = Math.max(...funnelData.map((row) => row.ativos), 1);
                const width = Math.max(28, (item.ativos / max) * 100);
                return (
                  <a href="/negocios" key={item.name} className="block rounded-xl border border-border/60 p-3 transition hover:bg-muted/30">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{item.name}</span>
                      <span className="text-xs font-semibold">{item.ativos}</span>
                    </div>
                    <div className="h-7 overflow-hidden rounded-lg bg-muted">
                      <div className="flex h-full items-center rounded-lg bg-primary/15 px-2 text-[11px] font-semibold text-primary transition-all" style={{ width: `${width}%` }}>
                        {index === 0 ? "Maior volume" : `${item.sla} SLA`}
                      </div>
                    </div>
                  </a>
                );
              }) : <EmptyChart text="Sem etapas ativas disponíveis." />}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5">
            <SectionTitle icon={Target} title="Metas" description="Progresso real das metas configuradas." />
            <div className="space-y-4">
              {goals.length ? goals.slice(0, 5).map((goal) => {
                const value = goal.progress == null ? 0 : Math.max(0, Math.min(100, goal.progress * 100));
                return (
                  <div key={goal.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{goal.label}</span>
                      <strong>{goal.progress == null ? "—" : `${value.toFixed(0)}%`}</strong>
                    </div>
                    <Progress value={value} className="h-2" />
                  </div>
                );
              }) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhuma meta ativa configurada.</p>}
            </div>
          </CardContent>
        </Card>

        <Card id="dashboard-marketing" className="scroll-mt-24 rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5">
            <SectionTitle icon={Megaphone} title="Marketing & aquisição" description="Métricas exibidas somente quando há integração e atribuição confirmadas." />
            {marketingVisible ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">CPL</p><p className="mt-1 text-xl font-bold">{money(data.marketing?.cpl)}</p></div>
                <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">ROAS</p><p className="mt-1 text-xl font-bold">{data.marketing?.roas == null ? "—" : `${data.marketing.roas.toFixed(2)}x`}</p></div>
                <div className="col-span-2 rounded-xl border border-border/60 p-3 text-xs leading-5 text-muted-foreground">{data.marketing?.note ?? "Integrações de mídia ativas."}</div>
              </div>
            ) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Conecte fontes de mídia para liberar CPL, ROAS e comparativos de aquisição sem números simulados.</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5">
            <SectionTitle icon={Database} title="Qualidade dos dados" description="Base usada por CRM, BI e agentes." />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted/50 p-3"><span className="text-xs text-muted-foreground">Score</span><p className="mt-1 text-xl font-bold">{data.dataQuality?.score == null ? "—" : `${data.dataQuality.score}%`}</p></div>
              <div className="rounded-xl bg-muted/50 p-3"><span className="text-xs text-muted-foreground">Leads</span><p className="mt-1 text-xl font-bold">{data.dataQuality?.validLeads ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-3"><span className="text-xs text-muted-foreground">Sem contato</span><p className="mt-1 text-xl font-bold">{data.dataQuality?.missingContact ?? 0}</p></div>
              <div className="rounded-xl bg-muted/50 p-3"><span className="text-xs text-muted-foreground">Sem origem</span><p className="mt-1 text-xl font-bold">{data.dataQuality?.missingOrigin ?? 0}</p></div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="dashboard-operacional" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5 md:p-6">
            <SectionTitle icon={Clock3} title="Atividade recente" description="Movimentações reais mais recentes da operação." href="/trabalho" />
            <div className="space-y-1">
              {recentActivity.slice(0, 7).map((item) => (
                <div key={`${item.entidade}-${item.entidadeId}-${item.createdAt}`} className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/40">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.descricao}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                  </div>
                </div>
              ))}
              {!recentActivity.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Sem movimentações recentes disponíveis.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card id="ia-recomenda" className="scroll-mt-24 rounded-2xl border-primary/15 bg-gradient-to-br from-card to-primary/[0.025] shadow-sm">
          <CardContent className="p-5 md:p-6">
            <SectionTitle icon={WandSparkles} title="IA recomenda agora" description="Prioridades transformadas em ações que levam direto ao registro de origem." />
            <div className="space-y-2">
              {actionItems.map((item, index) => (
                <a key={`${item.title}-${index}`} href={item.href} className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/80 p-3.5 transition hover:border-primary/20 hover:bg-background">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.level === "critical" ? "bg-destructive" : item.level === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="dashboard-ia" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5 md:p-6">
            <SectionTitle icon={Bot} title="Agentes de IA" description="Distribuição real de uso por agente." href="/agentes" />
            {agentUsage.length ? (
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agentUsage} layout="vertical" margin={{ left: 15, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" name="Ações" fill="hsl(var(--primary))" radius={[0, 7, 7, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center gap-3">
                  <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Agentes ativos</p><p className="mt-1 text-2xl font-bold">{aiUsage?.agentesAtivos ?? 0}</p></div>
                  <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Mensagens hoje</p><p className="mt-1 text-2xl font-bold">{compact(aiUsage?.mensagensHoje)}</p></div>
                  <div className="rounded-xl bg-muted/50 p-4"><p className="text-xs text-muted-foreground">Mensagens no mês</p><p className="mt-1 text-2xl font-bold">{compact(aiUsage?.mensagensMes)}</p></div>
                </div>
              </div>
            ) : <EmptyChart text="Ainda não há uso suficiente por agente para desenhar o gráfico." />}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardContent className="p-5 md:p-6">
            <SectionTitle icon={Sparkles} title="Automação & inteligência" description="Uso, ações e próximas melhores ações." href="/metricas-ia" />
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">Quota utilizada</span><strong>{quotaUsed.toFixed(1)}%</strong></div>
                <Progress value={quotaUsed} className="h-2.5" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Executadas</p><p className="mt-1 text-lg font-bold">{ai?.actionsExecuted ?? 0}</p></div>
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Pendentes</p><p className="mt-1 text-lg font-bold">{ai?.actionsPending ?? 0}</p></div>
                <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Rejeitadas</p><p className="mt-1 text-lg font-bold">{ai?.actionsRejected ?? 0}</p></div>
              </div>
              <a href="/leads?filtro=churn" className="flex items-center justify-between rounded-xl border p-3 text-sm hover:bg-muted/40"><span>Clientes em risco</span><strong>{intelligence?.customersAtRisk ?? 0}</strong></a>
              <div className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>Com próxima melhor ação</span><strong>{intelligence?.withNextBestAction ?? 0}</strong></div>
              <div className="flex items-center justify-between rounded-xl border p-3 text-sm"><span>Perfis analisados</span><strong>{intelligence?.profiles ?? 0}</strong></div>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Todos os números exibidos vêm de fontes transacionais oficiais.</span>
        <span>Sem métricas simuladas · valores indisponíveis permanecem nulos.</span>
      </footer>
    </div>
  );
}

function BarChart3Icon(props: React.ComponentProps<typeof Gauge>) {
  return <Gauge {...props} />;
}
