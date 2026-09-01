import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BarChart3, BrainCircuit, CircleDollarSign, Filter, MousePointerClick, RefreshCcw, Target, Users } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type FunnelStage = { stage: string; value: number };
type IntentTier = "baixo" | "medio" | "alto" | "muito_alto";
type Period = "7d" | "30d" | "90d" | "all";

type CommandCenterResponse = {
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
  filterOptions: {
    periods: Array<{ value: Period; label: string }>;
    platforms: string[];
    verticals: string[];
    campaigns: Array<{ id: string; label: string; platform: string; vertical: string; landingPageId: string | null }>;
    landingPages: Array<{ id: string; label: string }>;
    intentTiers: Array<{ value: IntentTier; label: string }>;
  };
  appliedFilters: {
    period: Period;
    platform: string | null;
    campaignId: string | null;
    landingPageId: string | null;
    vertical: string | null;
    intentTier: IntentTier | null;
  };
  period: { label: string; from: string | null; to: string };
  intentCohortNote: string | null;
};

type FilterState = {
  period: Period;
  platform: string;
  campaignId: string;
  landingPageId: string;
  vertical: string;
  intentTier: string;
};

const EMPTY_FILTERS: FilterState = {
  period: "30d",
  platform: "all",
  campaignId: "all",
  landingPageId: "all",
  vertical: "all",
  intentTier: "all",
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

function FilterSelect({ value, onChange, placeholder, children }: { value: string; onChange: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 min-w-[140px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export function LaunchCommandCenter() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const { data, isLoading, isFetching } = useQuery<CommandCenterResponse>({
    queryKey: ["launch-command-center", tenantId, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ period: filters.period });
      if (filters.platform !== "all") params.set("platform", filters.platform);
      if (filters.campaignId !== "all") params.set("campaignId", filters.campaignId);
      if (filters.landingPageId !== "all") params.set("landingPageId", filters.landingPageId);
      if (filters.vertical !== "all") params.set("vertical", filters.vertical);
      if (filters.intentTier !== "all") params.set("intentTier", filters.intentTier);
      const response = await fetch(`/api/tenants/${tenantId}/marketing/launch-command-center?${params.toString()}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar o Command Center");
      return response.json();
    },
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-sm text-muted-foreground">Carregando visão do lançamento...</CardContent></Card>;
  }
  if (!data) return null;

  const { metrics, diagnosis, funnel, totals, filterOptions } = data;
  const maxFunnel = Math.max(1, ...funnel.map((item) => item.value));
  const activeFilterCount = [filters.platform, filters.campaignId, filters.landingPageId, filters.vertical, filters.intentTier].filter((value) => value !== "all").length + (filters.period !== "30d" ? 1 : 0);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value } as FilterState;
      if (["platform", "vertical", "landingPageId"].includes(key)) next.campaignId = "all";
      return next;
    });
  };

  return (
    <Card className="border-primary/20 overflow-hidden" data-testid="launch-command-center">
      <CardHeader className="pb-3 bg-primary/[0.03] border-b">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5 text-primary" />Launch Command Center</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Do investimento à receita. Os filtros recalculam o funil na fonte, inclusive período, comportamento e vendas.</p>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && <RefreshCcw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <Badge variant="outline">{totals.activeCampaigns} campanha(s) ativa(s)</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold"><Filter className="h-3.5 w-3.5" />Filtros de análise</div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{data.period.label}</span>
              {activeFilterCount > 0 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterSelect value={filters.period} onChange={(value) => updateFilter("period", value)} placeholder="Período">
              {filterOptions.periods.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={filters.platform} onChange={(value) => updateFilter("platform", value)} placeholder="Plataforma">
              <SelectItem value="all">Todas as plataformas</SelectItem>
              {filterOptions.platforms.map((platform) => <SelectItem key={platform} value={platform}>{platform === "google" ? "Google Ads" : platform === "meta" ? "Meta Ads" : platform}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={filters.vertical} onChange={(value) => updateFilter("vertical", value)} placeholder="Vertical">
              <SelectItem value="all">Todas as verticais</SelectItem>
              {filterOptions.verticals.map((vertical) => <SelectItem key={vertical} value={vertical}>{vertical}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={filters.landingPageId} onChange={(value) => updateFilter("landingPageId", value)} placeholder="Landing page">
              <SelectItem value="all">Todas as LPs</SelectItem>
              {filterOptions.landingPages.map((lp) => <SelectItem key={lp.id} value={lp.id}>{lp.label}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={filters.campaignId} onChange={(value) => updateFilter("campaignId", value)} placeholder="Campanha">
              <SelectItem value="all">Todas as campanhas</SelectItem>
              {filterOptions.campaigns
                .filter((campaign) => filters.platform === "all" || campaign.platform === filters.platform)
                .filter((campaign) => filters.vertical === "all" || campaign.vertical === filters.vertical)
                .filter((campaign) => filters.landingPageId === "all" || campaign.landingPageId === filters.landingPageId)
                .map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.label}</SelectItem>)}
            </FilterSelect>
            <FilterSelect value={filters.intentTier} onChange={(value) => updateFilter("intentTier", value)} placeholder="Intenção">
              <SelectItem value="all">Todas as intenções</SelectItem>
              {filterOptions.intentTiers.map((tier) => <SelectItem key={tier.value} value={tier.value}>{tier.label}</SelectItem>)}
            </FilterSelect>
          </div>
          {data.intentCohortNote && <p className="mt-2 text-[11px] text-muted-foreground">{data.intentCohortNote}</p>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <Metric label="Investimento" value={money(totals.spend)} icon={CircleDollarSign} />
          <Metric label="Visitantes" value={metrics.visitors.toLocaleString("pt-BR")} icon={Users} />
          <Metric label="Leads" value={totals.leads.toLocaleString("pt-BR")} hint={`CPL ${money(metrics.costPerLead)}`} icon={Target} />
          <Metric label="Intent médio" value={metrics.avgBehaviorIntent == null ? "—" : `${metrics.avgBehaviorIntent}/100`} hint={`${metrics.measuredIntentLeads} medido(s)`} icon={BrainCircuit} />
          <Metric label="Trials" value={totals.trials.toLocaleString("pt-BR")} hint={`${pct(metrics.leadToTrialRate)} dos leads`} icon={MousePointerClick} />
          <Metric label="Ativados" value={totals.activatedTrials.toLocaleString("pt-BR")} hint={`${pct(metrics.trialActivationRate)} dos trials`} icon={Target} />
          <Metric label="Vendas" value={totals.sales.toLocaleString("pt-BR")} hint={`CAC ${money(metrics.cac)}`} icon={CircleDollarSign} />
          <Metric label="ROAS" value={metrics.roas == null ? "—" : `${metrics.roas.toFixed(2)}x`} hint={money(totals.revenue)} icon={BarChart3} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Funil do lançamento</h3>
              <span className="text-xs text-muted-foreground">Lead → venda {pct(metrics.leadToSaleRate)}</span>
            </div>
            <div className="space-y-3">
              {funnel.map((item) => (
                <div key={item.stage} className="grid grid-cols-[105px_1fr_48px] items-center gap-2">
                  <span className="text-xs text-muted-foreground">{item.stage}</span>
                  <Progress value={(item.value / maxFunnel) * 100} className="h-2" />
                  <span className="text-xs font-medium text-right">{item.value}</span>
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
          <span className="ml-auto">Esfriando {totals.coolingLeads} · Recuperados {totals.recoveredLeads}</span>
        </div>
      </CardContent>
    </Card>
  );
}
