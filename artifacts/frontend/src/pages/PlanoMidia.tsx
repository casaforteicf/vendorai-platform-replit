import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import PlanoMidiaCore from "@/pages/PlanoMidiaCore";

type BudgetType = "total" | "diario" | "semanal" | "mensal";

type PlanningConfig = {
  nomeCampanha: string;
  ofertaPrincipal: string;
  inicioEm: string;
  fimEm: string;
  semDataFinal: boolean;
  orcamentoValor: number;
  orcamentoTipo: BudgetType;
};

type StoredPlanningConfig = Partial<PlanningConfig> & {
  inicioEm?: string;
  fimEm?: string | null;
};

type PlanWithContext = {
  contextoUsado?: {
    configuracaoPlanejamento?: StoredPlanningConfig | null;
  } | null;
};

type AdsOverviewCampaign = {
  campaignId: string;
  label: string;
  plataforma: string;
  status: string;
  plannedBudget: number;
  dailyBudget: number;
  spend: number;
  leads: number;
  sales: number;
  revenue: number;
  roas: number | null;
  recommendation?: {
    title: string;
    reason: string;
    action: string;
    requiresApproval: boolean;
  } | null;
};

type AdsOverview = {
  totals: {
    plannedBudget: number;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    sales: number;
    revenue: number;
    activeCampaigns: number;
    unresolvedAlerts: number;
  };
  campaigns: AdsOverviewCampaign[];
  launchCommandCenter?: {
    metrics?: {
      costPerLead?: number | null;
      cac?: number | null;
      roas?: number | null;
      leadToSaleRate?: number | null;
    };
  };
};

function emptyConfig(): PlanningConfig {
  return {
    nomeCampanha: "",
    ofertaPrincipal: "",
    inicioEm: "",
    fimEm: "",
    semDataFinal: false,
    orcamentoValor: 0,
    orcamentoTipo: "total",
  };
}

function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeConfig(source: StoredPlanningConfig | null | undefined): PlanningConfig {
  const base = emptyConfig();
  if (!source) return base;
  const type = source.orcamentoTipo;
  return {
    nomeCampanha: typeof source.nomeCampanha === "string" ? source.nomeCampanha : "",
    ofertaPrincipal: typeof source.ofertaPrincipal === "string" ? source.ofertaPrincipal : "",
    inicioEm: toDatetimeLocal(source.inicioEm),
    fimEm: toDatetimeLocal(source.fimEm),
    semDataFinal: source.semDataFinal === true,
    orcamentoValor: typeof source.orcamentoValor === "number" && Number.isFinite(source.orcamentoValor)
      ? source.orcamentoValor
      : 0,
    orcamentoTipo: type === "diario" || type === "semanal" || type === "mensal" ? type : "total",
  };
}

function configForApi(config: PlanningConfig) {
  const inicio = config.inicioEm ? new Date(config.inicioEm) : null;
  const fim = !config.semDataFinal && config.fimEm ? new Date(config.fimEm) : null;
  return {
    ...config,
    inicioEm: inicio && !Number.isNaN(inicio.getTime()) ? inicio.toISOString() : "",
    fimEm: fim && !Number.isNaN(fim.getTime()) ? fim.toISOString() : "",
  };
}

function weeksForConfiguredWindow(config: PlanningConfig): number | null {
  if (config.semDataFinal) return 13;
  if (!config.inicioEm || !config.fimEm) return null;
  const start = new Date(config.inicioEm);
  const end = new Date(config.fimEm);
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const days = Math.max(1, Math.ceil(diff / 86_400_000));
  return Math.min(13, Math.max(1, Math.ceil(days / 7)));
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function fieldLabel(title: string, description?: string) {
  return (
    <div className="mb-1.5">
      <p className="text-xs font-medium text-foreground">{title}</p>
      {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(value) ? value : 0);
}

function metric(value: number | null | undefined, suffix = "") {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix}`;
}

export default function PlanoMidia() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [configOpen, setConfigOpen] = useState(true);
  const [config, setConfig] = useState<PlanningConfig>(() => emptyConfig());
  const [adsOverview, setAdsOverview] = useState<AdsOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState<Date | null>(null);
  const configRef = useRef(config);
  const hydratedTenantRef = useRef("");

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  async function loadAdsOverview() {
    if (!tenantId) return;
    setOverviewLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/ads/overview`, { headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json() as AdsOverview;
      setAdsOverview(data);
      setOverviewUpdatedAt(new Date());
    } catch {
      // O painel continua funcional mesmo se as plataformas de mídia ainda não estiverem conectadas.
    } finally {
      setOverviewLoading(false);
    }
  }

  useEffect(() => {
    if (!tenantId || hydratedTenantRef.current === tenantId) return;
    hydratedTenantRef.current = tenantId;
    let cancelled = false;

    fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() })
      .then(async (response) => response.ok ? response.json() as Promise<PlanWithContext | null> : null)
      .then((plan) => {
        if (cancelled || !plan?.contextoUsado?.configuracaoPlanejamento) return;
        const next = normalizeConfig(plan.contextoUsado.configuracaoPlanejamento);
        configRef.current = next;
        setConfig(next);
      })
      .catch(() => undefined);

    void loadAdsOverview();
    const timer = window.setInterval(() => void loadAdsOverview(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || typeof window === "undefined") return;
    const nativeFetch = window.fetch.bind(window);

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const rawUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isPlanGeneration = method === "POST" && rawUrl.includes(`/api/tenants/${tenantId}/media-plan/gerar`);
      const isCalendarGeneration = method === "POST" && rawUrl.includes(`/api/tenants/${tenantId}/content-calendar/gerar`);

      if (!isPlanGeneration && !isCalendarGeneration) return nativeFetch(input, init);

      let body: Record<string, unknown> = {};
      try {
        const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
        if (typeof rawBody === "string" && rawBody.trim()) body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        body = {};
      }

      if (isPlanGeneration) body["configuracao"] = configForApi(configRef.current);
      if (isCalendarGeneration) {
        const configuredWeeks = weeksForConfiguredWindow(configRef.current);
        if (configuredWeeks) body["semanas"] = configuredWeeks;
      }

      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

      const response = await nativeFetch(input, {
        ...init,
        method,
        headers,
        body: JSON.stringify(body),
      });
      if (isPlanGeneration && response.ok) window.setTimeout(() => void loadAdsOverview(), 500);
      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = nativeFetch;
    };
  }, [tenantId]);

  const configuredCount = useMemo(() => {
    return [
      config.nomeCampanha,
      config.ofertaPrincipal,
      config.inicioEm,
      config.semDataFinal ? "aberta" : config.fimEm,
      config.orcamentoValor > 0 ? "orcamento" : "",
    ].filter(Boolean).length;
  }, [config]);

  const periodSummary = useMemo(() => {
    if (!config.inicioEm) return "Defina início e fim livremente — inclusive campanhas de horas, dias, meses ou anos.";
    if (config.semDataFinal) return `A partir de ${new Date(config.inicioEm).toLocaleString("pt-BR")} · sem data final`;
    if (!config.fimEm) return "Defina quando a campanha termina.";
    const start = new Date(config.inicioEm);
    const end = new Date(config.fimEm);
    const diffHours = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
    if (!Number.isFinite(diffHours)) return "Período personalizado";
    if (diffHours < 48) return `${Math.round(diffHours * 10) / 10} hora(s)`;
    return `${Math.round((diffHours / 24) * 10) / 10} dia(s)`;
  }, [config.inicioEm, config.fimEm, config.semDataFinal]);

  const operationalBudget = config.orcamentoValor > 0 ? config.orcamentoValor : (adsOverview?.totals.plannedBudget ?? 0);
  const spend = adsOverview?.totals.spend ?? 0;
  const balance = operationalBudget > 0 ? Math.max(0, operationalBudget - spend) : null;
  const budgetUsePercent = operationalBudget > 0 ? Math.min(100, (spend / operationalBudget) * 100) : 0;
  const activeCampaigns = adsOverview?.campaigns.filter((campaign) => campaign.status === "ativo") ?? [];
  const visibleCampaigns = (activeCampaigns.length > 0 ? activeCampaigns : adsOverview?.campaigns ?? []).slice(0, 6);
  const totalVisibleSpend = visibleCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0);

  function resetConfig() {
    const next = emptyConfig();
    configRef.current = next;
    setConfig(next);
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Defina a campanha; a IA opera a mídia</p>
                {configuredCount > 0 && <Badge variant="outline" className="text-[10px]">{configuredCount}/5 definido(s)</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
                Você informa somente a intenção comercial, o período e o limite financeiro. A IA escolhe canais, públicos, formatos, frequência e distribuição do orçamento, podendo redistribuir a verba pelo desempenho sem ultrapassar o limite definido.
              </p>
              {!configOpen && configuredCount > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {config.nomeCampanha && <Badge variant="secondary" className="text-[10px]">{config.nomeCampanha}</Badge>}
                  {config.orcamentoValor > 0 && <Badge variant="secondary" className="text-[10px]">{money(config.orcamentoValor)} · {config.orcamentoTipo}</Badge>}
                  {config.inicioEm && <Badge variant="secondary" className="text-[10px]">{periodSummary}</Badge>}
                </div>
              )}
            </div>
            <Button type="button" size="sm" variant={configOpen ? "secondary" : "outline"} onClick={() => setConfigOpen((open) => !open)}>
              {configOpen ? <ChevronUp className="h-3.5 w-3.5 mr-1.5" /> : <ChevronDown className="h-3.5 w-3.5 mr-1.5" />}
              {configOpen ? "Fechar" : "Editar campanha"}
            </Button>
          </div>

          {configOpen && (
            <div className="border-t pt-4 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {fieldLabel("Título / tema da campanha", "Ex.: Semana da Piscina, Black Friday, Lançamento Linha X.")}
                  <Input
                    value={config.nomeCampanha}
                    onChange={(event) => setConfig((current) => ({ ...current, nomeCampanha: event.target.value }))}
                    placeholder="Nome ou tema da campanha"
                    maxLength={300}
                  />
                </div>
                <div>
                  {fieldLabel("Oferta ou promoção", "Pode ser uma promoção, condição especial ou simplesmente o CTA da campanha.")}
                  <Input
                    value={config.ofertaPrincipal}
                    onChange={(event) => setConfig((current) => ({ ...current, ofertaPrincipal: event.target.value }))}
                    placeholder="Ex.: 15% de desconto, orçamento grátis, demonstração"
                    maxLength={500}
                  />
                </div>
              </div>

              <div>
                {fieldLabel("Período da campanha", "Livre: pode durar 12 horas, 1 dia, 45 dias, 1 ano ou ficar sem data final.")}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Início</p>
                    <Input type="datetime-local" value={config.inicioEm} onChange={(event) => setConfig((current) => ({ ...current, inicioEm: event.target.value }))} />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">Fim</p>
                    <Input type="datetime-local" value={config.fimEm} disabled={config.semDataFinal} min={config.inicioEm || undefined} onChange={(event) => setConfig((current) => ({ ...current, fimEm: event.target.value }))} />
                  </div>
                  <label className="min-h-10 flex items-center gap-2 rounded-md border bg-background px-3 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.semDataFinal}
                      onChange={(event) => setConfig((current) => ({
                        ...current,
                        semDataFinal: event.target.checked,
                        orcamentoTipo: event.target.checked && current.orcamentoTipo === "total" ? "mensal" : current.orcamentoTipo,
                      }))}
                    />
                    Sem data final
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">{periodSummary}</p>
              </div>

              <div>
                {fieldLabel("Orçamento", "Este é o limite financeiro. A IA pode mover verba entre canais e anúncios, mas nunca ultrapassar esse limite.")}
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] gap-3 max-w-2xl">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input type="number" min={0} step="0.01" className="pl-10" value={config.orcamentoValor || ""} onChange={(event) => setConfig((current) => ({ ...current, orcamentoValor: Number(event.target.value) || 0 }))} placeholder="0,00" />
                  </div>
                  <select className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={config.orcamentoTipo} onChange={(event) => setConfig((current) => ({ ...current, orcamentoTipo: event.target.value as BudgetType }))}>
                    <option value="total">Total da campanha</option>
                    <option value="diario">Máximo por dia</option>
                    <option value="semanal">Máximo por semana</option>
                    <option value="mensal">Máximo por mês</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border bg-background/70 p-3">
                <div className="flex items-start gap-2">
                  <WalletCards className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">Gestão autônoma de mídia pela IA</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      Canais, públicos, formatos, horários, frequência, testes, remarketing e distribuição da verba são decisões da IA. O orçamento definido acima funciona como limite rígido; a distribuição exibida no plano é dinâmica e pode mudar conforme leads, oportunidades, vendas, receita e margem.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Ao Planejar/Replanejar, estas quatro decisões humanas orientam toda a estratégia da IA.
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={resetConfig} disabled={configuredCount === 0}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Limpar
                  </Button>
                  <Button type="button" size="sm" onClick={() => setConfigOpen(false)}>
                    <Check className="h-3.5 w-3.5 mr-1.5" />Usar esta campanha
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Comando de orçamento da IA</p>
                <Badge variant="outline" className="text-[10px]">dinâmico</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Leitura real de mídia + CRM. A IA deve privilegiar resultado comercial, não apenas clique ou CPL.
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => void loadAdsOverview()} disabled={overviewLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${overviewLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
            <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><WalletCards className="h-3.5 w-3.5" />Limite</div><p className="mt-1 text-lg font-semibold">{operationalBudget > 0 ? money(operationalBudget) : "—"}</p><p className="text-[10px] text-muted-foreground">{config.orcamentoTipo}</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><CircleDollarSign className="h-3.5 w-3.5" />Gasto</div><p className="mt-1 text-lg font-semibold">{money(spend)}</p><p className="text-[10px] text-muted-foreground">{budgetUsePercent.toFixed(1)}% do limite</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><Target className="h-3.5 w-3.5" />Saldo</div><p className="mt-1 text-lg font-semibold">{balance == null ? "—" : money(balance)}</p><p className="text-[10px] text-muted-foreground">protegido pelo teto</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" />Receita</div><p className="mt-1 text-lg font-semibold">{money(adsOverview?.totals.revenue ?? 0)}</p><p className="text-[10px] text-muted-foreground">vendas atribuídas</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><BarChart3 className="h-3.5 w-3.5" />ROAS</div><p className="mt-1 text-lg font-semibold">{metric(adsOverview?.launchCommandCenter?.metrics?.roas, "x")}</p><p className="text-[10px] text-muted-foreground">receita ÷ mídia</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground"><Sparkles className="h-3.5 w-3.5" />Vendas</div><p className="mt-1 text-lg font-semibold">{adsOverview?.totals.sales ?? 0}</p><p className="text-[10px] text-muted-foreground">{adsOverview?.totals.leads ?? 0} leads</p></div>
          </div>

          {operationalBudget > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>Consumo do orçamento</span><span>{budgetUsePercent.toFixed(1)}%</span></div>
              <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${budgetUsePercent}%` }} /></div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-3">
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/30"><p className="text-xs font-semibold">Distribuição atual e resultado por canal/campanha</p><p className="text-[10px] text-muted-foreground">Percentuais mudam conforme desempenho real.</p></div>
              {visibleCampaigns.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">Ainda não há campanhas publicadas com métricas de plataforma. O planejamento pode ser criado normalmente; este quadro passa a refletir gasto real assim que a mídia estiver ativa.</div>
              ) : (
                <div className="divide-y">
                  {visibleCampaigns.map((campaign) => {
                    const allocation = totalVisibleSpend > 0 ? (campaign.spend / totalVisibleSpend) * 100 : 0;
                    return (
                      <div key={campaign.campaignId} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p className="text-xs font-medium truncate">{campaign.label}</p><p className="text-[10px] uppercase text-muted-foreground">{campaign.plataforma} · {campaign.status}</p></div>
                          <div className="text-right shrink-0"><p className="text-xs font-semibold">{money(campaign.spend)}</p><p className="text-[10px] text-muted-foreground">{allocation.toFixed(1)}% do gasto atual</p></div>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-2 text-[10px]">
                          <div><span className="text-muted-foreground">Leads</span><p className="font-medium">{campaign.leads}</p></div>
                          <div><span className="text-muted-foreground">Vendas</span><p className="font-medium">{campaign.sales}</p></div>
                          <div><span className="text-muted-foreground">Receita</span><p className="font-medium">{money(campaign.revenue)}</p></div>
                          <div><span className="text-muted-foreground">ROAS</span><p className="font-medium">{metric(campaign.roas, "x")}</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div><p className="text-xs font-semibold">Próxima decisão da IA</p><p className="text-[10px] text-muted-foreground">Recomendação calculada com mídia + funil comercial.</p></div>
              {visibleCampaigns.find((campaign) => campaign.recommendation)?.recommendation ? (
                (() => {
                  const recommendation = visibleCampaigns.find((campaign) => campaign.recommendation)!.recommendation!;
                  return <div className="rounded-md bg-muted/40 p-3"><p className="text-xs font-medium">{recommendation.title}</p><p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{recommendation.reason}</p><Badge variant="outline" className="mt-2 text-[10px]">{recommendation.requiresApproval ? "requer aprovação" : "IA pode otimizar"}</Badge></div>;
                })()
              ) : (
                <div className="rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">Sem mudança recomendada neste momento. A IA continua coletando sinais de gasto, leads, vendas e receita.</div>
              )}
              <div className="border-t pt-3 text-[10px] text-muted-foreground">
                Última leitura: {overviewUpdatedAt ? overviewUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "aguardando dados"}. Atualização automática a cada 60 segundos enquanto esta tela estiver aberta.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <PlanoMidiaCore />
    </div>
  );
}
