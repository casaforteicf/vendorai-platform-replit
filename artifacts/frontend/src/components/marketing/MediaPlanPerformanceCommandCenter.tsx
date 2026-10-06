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
  conteudo?: { orcamento?: { valor?: number; tipo?: "total" | "diario" | "semanal" | "mensal"; moeda?: "BRL"; limiteRigido?: boolean } };
};

type BudgetDecision = {
  campaignId: string;
  status?: string | null;
  currentAllocation: number;
  spend: number;
  leads: number;
  sales: number;
  revenue: number;
  roas: number | null;
  remainingAllocation: number;
  targetAllocation: number;
  delta: number;
  action: "increase" | "decrease" | "hold";
  reason: string;
};

type PlanPerformance = {
  planBudgetTotal: number;
  currentAllocatedTotal: number;
  unallocatedBudget: number;
  transferableBudget: number;
  targetAllocatedTotal: number;
  humanCeilingRespected: boolean;
  hasSufficientEvidence: boolean;
  decisions: BudgetDecision[];
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
  return { token: window.localStorage.getItem(TOKEN_KEY) ?? "", tenantId: tenantOverride?.id ?? user?.tenantId ?? "" };
}

function isPlanPath(location: string) {
  const [path, query = ""] = location.split("?");
  if (["/marketing/plano-de-midia", "/marketing/media-plan", "/plano-de-midia"].includes(path)) return true;
  const params = new URLSearchParams(query);
  return path === "/content" && (params.get("tab") ?? "") === "planejamento" && params.get("advanced") === "1";
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
  return grids.find((node) => {
    const text = node.textContent ?? "";
    return text.includes("Ações no calendário") && text.includes("Campanhas") && text.includes("Canais") && text.includes("Materiais previstos");
  }) ?? null;
}

export function MediaPlanPerformanceCommandCenter() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [performance, setPerformance] = useState<PlanPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { tenantId, token } = readSession();
  const visible = isPlanPath(location);

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 350);
    return () => { window.removeEventListener("popstate", update); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!visible) { setHost(null); return; }
    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) { portalHost = document.createElement("div"); portalHost.setAttribute(HOST_ATTR, "true"); }
    const attach = () => {
      const anchor = summaryHost();
      if (!anchor?.parentElement || !portalHost) return;
      if (portalHost.parentElement !== anchor.parentElement || anchor.nextElementSibling !== portalHost) anchor.insertAdjacentElement("afterend", portalHost);
      setHost((current) => current === portalHost ? current : portalHost);
    };
    attach();
    const timer = window.setInterval(attach, 500);
    return () => { window.clearInterval(timer); portalHost?.remove(); };
  }, [visible]);

  async function load() {
    if (!visible || !tenantId || !token) return;
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const planResponse = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers, cache: "no-store" });
      const nextPlan = planResponse.ok ? await planResponse.json() as MediaPlan | null : null;
      setPlan(nextPlan);
      if (!nextPlan?.id) { setPerformance(null); setError("Plano de Mídia ativo não encontrado."); return; }

      const performanceResponse = await fetch(`/api/tenants/${tenantId}/marketing/media-plan/${nextPlan.id}/budget-redistribution`, { headers, cache: "no-store" });
      if (!performanceResponse.ok) {
        const body = await performanceResponse.json().catch(() => null);
        setPerformance(null);
        setError(body?.error ?? "Performance do plano ainda não disponível.");
        return;
      }
      setPerformance(await performanceResponse.json() as PlanPerformance);
      setUpdatedAt(new Date());
    } catch (err) {
      setPerformance(null);
      setError(err instanceof Error ? err.message : "Falha ao carregar performance do plano.");
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
    const rows = performance?.decisions ?? [];
    const spend = rows.reduce((sum, row) => sum + Number(row.spend || 0), 0);
    const leads = rows.reduce((sum, row) => sum + Number(row.leads || 0), 0);
    const sales = rows.reduce((sum, row) => sum + Number(row.sales || 0), 0);
    const revenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const planBudget = performance?.planBudgetTotal ?? (plan?.conteudo?.orcamento?.tipo === "total" ? Number(plan.conteudo.orcamento.valor ?? 0) : null);
    const cpl = spend > 0 && leads > 0 ? spend / leads : null;
    const cac = spend > 0 && sales > 0 ? spend / sales : null;
    const roas = spend > 0 && revenue > 0 ? revenue / spend : null;
    const planRemaining = typeof planBudget === "number" ? Math.max(0, planBudget - spend) : null;
    const winner = rows.filter((row) => row.sales >= 2 && typeof row.roas === "number" && row.roas >= 3).sort((a, b) => Number(b.roas ?? 0) - Number(a.roas ?? 0))[0];
    const weak = rows.filter((row) => row.spend > 0 && (row.leads === 0 || (row.leads >= 5 && row.sales === 0))).sort((a, b) => b.spend - a.spend)[0];
    const actionable = rows.filter((row) => row.action !== "hold").sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    return { spend, leads, sales, revenue, planBudget, planRemaining, cpl, cac, roas, winner, weak, actionable };
  }, [performance, plan]);

  if (!visible || !host) return null;

  const metrics = [
    { label: "Orçamento do plano", value: derived.planBudget !== null ? money(derived.planBudget) : "Não definido", icon: CircleDollarSign },
    { label: "Investimento do plano", value: money(derived.spend), icon: TrendingUp },
    { label: "Saldo vs. teto", value: derived.planRemaining !== null ? money(derived.planRemaining) : "—", icon: ShieldCheck },
    { label: "Leads do plano", value: number(derived.leads), icon: Target },
    { label: "Vendas do plano", value: number(derived.sales), icon: BarChart3 },
    { label: "Receita do plano", value: money(derived.revenue), icon: CircleDollarSign },
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
              <Badge variant="outline" className="text-[10px]">escopo: este Plano de Mídia</Badge>
              {performance?.humanCeilingRespected && <Badge variant="secondary" className="text-[10px]">teto humano respeitado</Badge>}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Investimento, leads, vendas, receita e ROAS agora são somados somente das campanhas Meta/Google ligadas a este plano pelo mediaPlanId. Campanhas de outros planos do tenant não entram neste painel.
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
            <div key={label} className="min-w-0 rounded-xl border bg-background p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span></div>
              <p className="mt-1 break-words text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {error && <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{error}</div>}

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border bg-background p-3">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Recomendação deste plano</p></div>
            {derived.actionable ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium">{derived.actionable.action === "increase" ? "Aumentar dentro do teto aprovado" : "Reduzir saldo ainda não consumido"}</p>
                <p className="text-xs leading-5 text-muted-foreground">{derived.actionable.reason}</p>
                <Badge variant="secondary" className="mt-1 text-[10px]">campanha {derived.actionable.campaignId} · {money(Math.abs(derived.actionable.delta))}</Badge>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Ainda não há evidência suficiente neste plano para mover orçamento. O sistema mantém a coleta sem usar dados de campanhas externas ao plano.</p>
            )}
          </div>

          <div className="rounded-xl border bg-background p-3">
            <div className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Sinal de realocação de verba</p></div>
            {derived.winner && derived.weak ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium">Há vencedor e doadora dentro do mesmo plano.</p>
                <p className="text-xs leading-5 text-muted-foreground">Revisar verba de <strong>{derived.weak.campaignId}</strong> para <strong>{derived.winner.campaignId}</strong>, usando somente saldo ainda não consumido e sem ultrapassar o teto humano.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[10px]">vencedora: ROAS {ratio(derived.winner.roas)}</Badge>
                  <Badge variant="outline" className="text-[10px]">doadora: {number(derived.weak.leads)} leads · {number(derived.weak.sales)} vendas</Badge>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Sem par vencedor/doadora com evidência comercial suficiente neste plano.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Governança: o painel usa o mesmo filtro plan-specific do otimizador de verba e não mistura métricas de outros planos.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => { window.location.href = "/ads"; }}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir Ads e otimização</Button>
        </div>
      </CardContent>
    </Card>,
    host,
  );
}
