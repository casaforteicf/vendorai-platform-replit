import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, ExternalLink, Gauge, Loader2, RefreshCw, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-media-plan-performance-command-center";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type MediaPlan = {
  id: string;
  conteudo?: {
    orcamento?: {
      valor?: number;
      tipo?: "total" | "diario" | "semanal" | "mensal";
      moeda?: "BRL";
      limiteRigido?: boolean;
    };
  };
};

type AdsRecommendation = {
  title: string;
  reason: string;
  action: string;
  requiresApproval: boolean;
};

type AdsCampaign = {
  campaignId: string;
  label?: string;
  plataforma?: string;
  status?: string;
  plannedBudget?: number;
  spend?: number;
  leads?: number;
  sales?: number;
  revenue?: number;
  costPerLead?: number | null;
  costPerSale?: number | null;
  roas?: number | null;
  recommendation?: AdsRecommendation | null;
};

type AdsOverview = {
  totals?: {
    plannedBudget?: number;
    spend?: number;
    leads?: number;
    sales?: number;
    revenue?: number;
    activeCampaigns?: number;
    unresolvedAlerts?: number;
  };
  campaigns?: AdsCampaign[];
};

function readJsonStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function readSession() {
  const tenantOverride = readJsonStorage<{ id?: string }>(OVERRIDE_KEY);
  const user = readJsonStorage<{ tenantId?: string | null }>(USER_CACHE_KEY);
  return {
    token: window.localStorage.getItem(TOKEN_KEY) ?? "",
    tenantId: tenantOverride?.id ?? user?.tenantId ?? "",
  };
}

function isPlanPath(location: string) {
  const [path, query = ""] = location.split("?");
  if (["/marketing/plano-de-midia", "/marketing/media-plan", "/plano-de-midia"].includes(path)) return true;
  if (path !== "/content") return false;
  return (new URLSearchParams(query).get("tab") ?? "") === "planejamento";
}

function money(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function number(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR");
}

function ratio(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}x`;
}

function summaryHost() {
  const grids = Array.from(document.querySelectorAll<HTMLElement>("div.grid"));
  const summary = grids.find((node) => {
    const text = node.textContent ?? "";
    return text.includes("Ações no calendário") && text.includes("Campanhas") && text.includes("Canais") && text.includes("Materiais previstos");
  });
  return summary ?? null;
}

export function MediaPlanPerformanceCommandCenter() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [overview, setOverview] = useState<AdsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { tenantId, token } = readSession();
  const visible = isPlanPath(location);

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 350);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setHost(null);
      return;
    }
    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) {
      portalHost = document.createElement("div");
      portalHost.setAttribute(HOST_ATTR, "true");
    }
    const attach = () => {
      const anchor = summaryHost();
      if (!anchor?.parentElement || !portalHost) return;
      if (portalHost.parentElement !== anchor.parentElement || anchor.nextElementSibling !== portalHost) {
        anchor.insertAdjacentElement("afterend", portalHost);
      }
      setHost((current) => current === portalHost ? current : portalHost);
    };
    attach();
    const timer = window.setInterval(attach, 500);
    return () => {
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, [visible]);

  async function load() {
    if (!visible || !tenantId || !token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [planResponse, overviewResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers, cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/ads/overview`, { headers, cache: "no-store" }),
      ]);
      setPlan(planResponse.ok ? await planResponse.json() as MediaPlan | null : null);
      setOverview(overviewResponse.ok ? await overviewResponse.json() as AdsOverview : null);
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible || !tenantId || !token) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tenantId, token]);

  const derived = useMemo(() => {
    const totals = overview?.totals ?? {};
    const spend = Number(totals.spend ?? 0);
    const leads = Number(totals.leads ?? 0);
    const sales = Number(totals.sales ?? 0);
    const revenue = Number(totals.revenue ?? 0);
    const planBudget = plan?.conteudo?.orcamento?.tipo === "total" ? Number(plan.conteudo.orcamento.valor ?? 0) : null;
    const cpl = spend > 0 && leads > 0 ? spend / leads : null;
    const cac = spend > 0 && sales > 0 ? spend / sales : null;
    const roas = spend > 0 && revenue > 0 ? revenue / spend : null;
    const planRemaining = planBudget !== null ? Math.max(0, planBudget - spend) : null;
    const campaignRecommendations = (overview?.campaigns ?? [])
      .filter((campaign) => campaign.recommendation)
      .sort((a, b) => Number(Boolean(b.recommendation?.requiresApproval)) - Number(Boolean(a.recommendation?.requiresApproval)));
    const recommendation = campaignRecommendations[0]?.recommendation ?? null;
    const winner = (overview?.campaigns ?? [])
      .filter((campaign) => (campaign.sales ?? 0) >= 2 && typeof campaign.roas === "number" && campaign.roas >= 3)
      .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
    const weak = (overview?.campaigns ?? [])
      .filter((campaign) => (campaign.spend ?? 0) > 0 && (((campaign.leads ?? 0) === 0) || ((campaign.leads ?? 0) >= 5 && (campaign.sales ?? 0) === 0)))
      .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))[0];
    return { spend, leads, sales, revenue, planBudget, planRemaining, cpl, cac, roas, recommendation, winner, weak };
  }, [overview, plan]);

  if (!visible || !host) return null;

  const metrics = [
    { label: "Orçamento do plano", value: derived.planBudget !== null ? money(derived.planBudget) : "Não definido", icon: CircleDollarSign },
    { label: "Investimento sincronizado", value: money(derived.spend), icon: TrendingUp },
    { label: "Saldo vs. teto do plano", value: derived.planRemaining !== null ? money(derived.planRemaining) : "—", icon: ShieldCheck },
    { label: "Leads atribuídos em Ads", value: number(derived.leads), icon: Target },
    { label: "Vendas atribuídas em Ads", value: number(derived.sales), icon: BarChart3 },
    { label: "Receita atribuída em Ads", value: money(derived.revenue), icon: CircleDollarSign },
    { label: "CPL", value: money(derived.cpl), icon: Gauge },
    { label: "CAC", value: money(derived.cac), icon: Gauge },
    { label: "ROAS", value: ratio(derived.roas), icon: TrendingUp },
  ];

  return createPortal(
    <Card className="mt-3 border-primary/20 bg-primary/[0.02]">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Comando executivo de performance</p>
              <Badge variant="outline" className="text-[10px]">dados reais sincronizados</Badge>
              {(overview?.totals?.unresolvedAlerts ?? 0) > 0 && <Badge variant="destructive" className="text-[10px]">{overview?.totals?.unresolvedAlerts} alerta(s)</Badge>}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              O teto vem do Plano de Mídia. Investimento, leads, vendas e receita abaixo vêm do Ads Intelligence e só aparecem quando há dados atribuídos/sincronizados; ausência de evidência fica como “—”, não como resultado inventado.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {updatedAt && <span className="text-[10px] text-muted-foreground">Atualizado {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-9">
          {metrics.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border bg-background p-3 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span></div>
              <p className="mt-1 text-sm font-semibold break-words">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border bg-background p-3">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Recomendação da IA</p></div>
            {derived.recommendation ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium">{derived.recommendation.title}</p>
                <p className="text-xs leading-5 text-muted-foreground">{derived.recommendation.reason}</p>
                <Badge variant={derived.recommendation.requiresApproval ? "secondary" : "outline"} className="mt-1 text-[10px]">
                  {derived.recommendation.requiresApproval ? "exige aprovação humana" : "ajuste recomendado"}
                </Badge>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Ainda não há evidência suficiente para recomendar mudança. O sistema mantém coleta e evita escalar campanha somente por clique ou CTR.</p>
            )}
          </div>

          <div className="rounded-xl border bg-background p-3">
            <div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Sinal de realocação de verba</p></div>
            {derived.winner && derived.weak ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium">Há candidato vencedor e campanha doadora.</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Priorizar revisão de verba de <strong>{derived.weak.label || derived.weak.campaignId}</strong> para <strong>{derived.winner.label || derived.winner.campaignId}</strong>. O aumento só deve usar saldo ainda não consumido e continuar abaixo do teto aprovado pelo humano.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[10px]">vencedora: ROAS {ratio(derived.winner.roas)}</Badge>
                  <Badge variant="outline" className="text-[10px]">doadora: {number(derived.weak.leads)} leads · {number(derived.weak.sales)} vendas</Badge>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Sem par vencedor/doadora com evidência comercial suficiente. Nenhuma redistribuição é sugerida nesta rodada.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Governança: CPL/ROAS/CAC dependem de investimento sincronizado e atribuição comercial. Este painel não aumenta orçamento e não ultrapassa o teto do plano.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => { window.location.href = "/ads"; }}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir Ads e otimização
          </Button>
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
