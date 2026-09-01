import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ArrowRight, BarChart3, BrainCircuit, CircleDollarSign, MousePointerClick, Target, Users } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type FunnelStage = { stage: string; value: number };

type CommandCenter = {
  metrics: {
    visitors: number;
    pageViews: number;
    ctaClicks: number;
    formStarts: number;
    formSubmits: number;
    avgBehaviorIntent: number | null;
    measuredIntentLeads: number;
    intentDistribution: { baixo: number; medio: number; alto: number; muito_alto: number };
    visitorToLeadRate: number | null;
    leadToTrialRate: number | null;
    trialActivationRate: number | null;
    activatedTrialToSaleRate: number | null;
    leadToSaleRate: number | null;
    costPerLead: number | null;
    costPerActivatedTrial: number | null;
    cac: number | null;
    revenuePerLead: number | null;
    roas: number | null;
  };
  diagnosis: {
    stage: string;
    title: string;
    evidence: string;
    impact: string;
    action: string;
  };
  funnel: FunnelStage[];
};

type AdsOverview = {
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    trials: number;
    activatedTrials: number;
    coolingLeads: number;
    recoveredLeads: number;
    sales: number;
    revenue: number;
    activeCampaigns: number;
  };
  launchCommandCenter?: CommandCenter;
};

const money = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(1)}%`;

function Metric({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Users }) {
  return (
    <div className="rounded-lg border bg-background p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-xl font-semibold truncate">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function LaunchCommandCenter() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const { data, isLoading } = useQuery<AdsOverview>({
    queryKey: ["ads-overview", tenantId],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/ads/overview`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar o Command Center");
      return response.json();
    },
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-sm text-muted-foreground">Carregando visão do lançamento...</CardContent></Card>;
  }

  const center = data?.launchCommandCenter;
  if (!center || !data) return null;
  const { metrics, diagnosis, funnel } = center;
  const maxFunnel = Math.max(1, ...funnel.map((item) => item.value));

  return (
    <Card className="border-primary/20 overflow-hidden" data-testid="launch-command-center">
      <CardHeader className="pb-3 bg-primary/[0.03] border-b">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5 text-primary" />Launch Command Center</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Do investimento à receita. A IA procura o gargalo do funil, não apenas CTR ou CPL.</p>
          </div>
          <Badge variant="outline">{data.totals.activeCampaigns} campanha(s) ativa(s)</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <Metric label="Investimento" value={money(data.totals.spend)} icon={CircleDollarSign} />
          <Metric label="Visitantes" value={metrics.visitors.toLocaleString("pt-BR")} icon={Users} />
          <Metric label="Leads" value={data.totals.leads.toLocaleString("pt-BR")} hint={`CPL ${money(metrics.costPerLead)}`} icon={Target} />
          <Metric label="Intent médio" value={metrics.avgBehaviorIntent == null ? "—" : `${metrics.avgBehaviorIntent}/100`} hint={`${metrics.measuredIntentLeads} medido(s)`} icon={BrainCircuit} />
          <Metric label="Trials" value={data.totals.trials.toLocaleString("pt-BR")} hint={`${pct(metrics.leadToTrialRate)} dos leads`} icon={MousePointerClick} />
          <Metric label="Ativados" value={data.totals.activatedTrials.toLocaleString("pt-BR")} hint={`${pct(metrics.trialActivationRate)} dos trials`} icon={Target} />
          <Metric label="Vendas" value={data.totals.sales.toLocaleString("pt-BR")} hint={`CAC ${money(metrics.cac)}`} icon={CircleDollarSign} />
          <Metric label="ROAS" value={metrics.roas == null ? "—" : `${metrics.roas.toFixed(2)}x`} hint={money(data.totals.revenue)} icon={BarChart3} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Funil do lançamento</h3>
              <span className="text-xs text-muted-foreground">Lead → venda {pct(metrics.leadToSaleRate)}</span>
            </div>
            <div className="space-y-3">
              {funnel.map((item, index) => (
                <div key={item.stage} className="grid grid-cols-[105px_1fr_48px] items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.stage}</span>
                  <Progress value={(item.value / maxFunnel) * 100} className="h-2" />
                  <span className="text-xs font-medium text-right">{item.value}</span>
                  {index < funnel.length - 1 && <ArrowRight className="hidden" />}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-amber-50/50 dark:bg-amber-950/10">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Diagnóstico da IA</span>
            </div>
            <h3 className="font-semibold">{diagnosis.title}</h3>
            <p className="mt-2 text-xs text-muted-foreground"><strong>Evidência:</strong> {diagnosis.evidence}</p>
            <p className="mt-1 text-xs text-muted-foreground"><strong>Impacto:</strong> {diagnosis.impact}</p>
            <div className="mt-3 rounded-md border bg-background p-3 text-sm"><strong>Próxima ação:</strong> {diagnosis.action}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Intent:</span>
          <Badge variant="secondary">Baixo {metrics.intentDistribution.baixo}</Badge>
          <Badge variant="secondary">Médio {metrics.intentDistribution.medio}</Badge>
          <Badge variant="secondary">Alto {metrics.intentDistribution.alto}</Badge>
          <Badge variant="secondary">Muito alto {metrics.intentDistribution.muito_alto}</Badge>
          <span className="ml-auto">Esfriando {data.totals.coolingLeads} · Recuperados {data.totals.recoveredLeads}</span>
        </div>
      </CardContent>
    </Card>
  );
}
