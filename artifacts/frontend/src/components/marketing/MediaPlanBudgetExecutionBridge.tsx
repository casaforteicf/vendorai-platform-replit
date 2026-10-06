import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HOST_ATTR = "data-vendorai-media-plan-budget-execution";
const PERFORMANCE_HOST = "[data-vendorai-media-plan-performance-command-center]";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type MediaPlan = { id: string };
type BudgetDecision = {
  campaignId: string;
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
type RedistributionPlan = {
  planBudgetTotal: number;
  currentAllocatedTotal: number;
  unallocatedBudget: number;
  transferableBudget: number;
  targetAllocatedTotal: number;
  humanCeilingRespected: boolean;
  hasSufficientEvidence: boolean;
  decisions: BudgetDecision[];
};

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function session() {
  const override = readJson<{ id?: string }>(OVERRIDE_KEY);
  const user = readJson<{ tenantId?: string | null }>(USER_CACHE_KEY);
  return { tenantId: override?.id ?? user?.tenantId ?? "", token: localStorage.getItem(TOKEN_KEY) ?? "" };
}

function isPlanPath() {
  const path = window.location.pathname;
  if (["/marketing/plano-de-midia", "/marketing/media-plan", "/plano-de-midia"].includes(path)) return true;
  const params = new URLSearchParams(window.location.search);
  return path === "/content" && params.get("tab") === "planejamento" && params.get("advanced") === "1";
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MediaPlanBudgetExecutionBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [planId, setPlanId] = useState("");
  const [proposal, setProposal] = useState<RedistributionPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { tenantId, token } = session();

  useEffect(() => {
    const attach = () => {
      if (!isPlanPath()) {
        setHost(null);
        return;
      }
      const performance = document.querySelector<HTMLElement>(PERFORMANCE_HOST);
      if (!performance?.parentElement) return;
      let target = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
      if (!target) {
        target = document.createElement("div");
        target.setAttribute(HOST_ATTR, "true");
      }
      if (performance.nextElementSibling !== target) performance.insertAdjacentElement("afterend", target);
      setHost(target);
    };
    attach();
    const timer = window.setInterval(attach, 500);
    return () => window.clearInterval(timer);
  }, []);

  async function load() {
    if (!tenantId || !token) return;
    setLoading(true);
    setMessage("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const planResponse = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers, cache: "no-store" });
      if (!planResponse.ok) throw new Error("Não foi possível carregar o Plano de Mídia.");
      const plan = await planResponse.json() as MediaPlan | null;
      if (!plan?.id) throw new Error("Nenhum Plano de Mídia ativo encontrado.");
      setPlanId(plan.id);
      const response = await fetch(`/api/tenants/${tenantId}/marketing/media-plan/${plan.id}/budget-redistribution`, { headers, cache: "no-store" });
      const data = await response.json() as RedistributionPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Redistribuição indisponível.");
      setProposal(data);
    } catch (error) {
      setProposal(null);
      setMessage(error instanceof Error ? error.message : "Não foi possível calcular a redistribuição.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (host && tenantId && token) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, tenantId, token]);

  async function apply(decision: BudgetDecision) {
    if (!planId || decision.action === "hold") return;
    setApplying(decision.campaignId);
    setMessage("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/media-plan/${planId}/budget-redistribution/${decision.campaignId}/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ authorization: "human-approved" }),
      });
      const data = await response.json() as { applied?: boolean; error?: string; schedule?: { dailyBudget?: number } };
      if (!response.ok) throw new Error(data.error ?? "A plataforma recusou o ajuste.");
      setMessage(data.applied
        ? `Ajuste aplicado com sucesso. Novo orçamento diário: ${money(Number(data.schedule?.dailyBudget ?? 0))}.`
        : "A decisão foi recalculada e não exige alteração neste momento.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível aplicar o ajuste.");
    } finally {
      setApplying(null);
    }
  }

  if (!host) return null;
  const actionable = proposal?.decisions.filter((item) => item.action !== "hold" && item.delta !== 0) ?? [];

  return createPortal(
    <Card className="mt-3 border-primary/20">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Redistribuição segura de orçamento</p></div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">A IA recalcula usando gasto, leads, vendas e ROAS reais. Só movimenta saldo não consumido, nunca ultrapassa o teto humano e a aplicação abaixo exige seu clique.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}Recalcular
          </Button>
        </div>

        {proposal && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg border p-3"><p className="text-[10px] text-muted-foreground">Teto aprovado</p><p className="text-sm font-semibold">{money(proposal.planBudgetTotal)}</p></div>
            <div className="rounded-lg border p-3"><p className="text-[10px] text-muted-foreground">Alocado hoje</p><p className="text-sm font-semibold">{money(proposal.currentAllocatedTotal)}</p></div>
            <div className="rounded-lg border p-3"><p className="text-[10px] text-muted-foreground">Transferível nesta rodada</p><p className="text-sm font-semibold">{money(proposal.transferableBudget)}</p></div>
            <div className="rounded-lg border p-3"><p className="text-[10px] text-muted-foreground">Teto respeitado</p><p className="text-sm font-semibold">{proposal.humanCeilingRespected ? "Sim" : "Não"}</p></div>
          </div>
        )}

        {actionable.length > 0 ? (
          <div className="space-y-2">
            {actionable.map((decision) => (
              <div key={decision.campaignId} className="flex flex-col gap-3 rounded-xl border bg-background p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {decision.action === "increase" ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-amber-600" />}
                    <p className="text-sm font-medium">{decision.campaignId}</p>
                    <Badge variant="outline" className="text-[10px]">{decision.action === "increase" ? "aumentar" : "reduzir"} {money(Math.abs(decision.delta))}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{money(decision.currentAllocation)} → {money(decision.targetAllocation)} · gasto {money(decision.spend)} · {decision.sales} venda(s) · ROAS {decision.roas?.toFixed(2) ?? "—"}x</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{decision.reason}</p>
                </div>
                <Button type="button" size="sm" onClick={() => void apply(decision)} disabled={applying !== null || !proposal?.humanCeilingRespected}>
                  {applying === decision.campaignId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}Aprovar e aplicar
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">{loading ? "Calculando…" : "Nenhuma movimentação segura disponível nesta rodada. A verba permanece como está."}</p>
        )}

        {message && <p className="rounded-lg border p-3 text-xs leading-5">{message}</p>}
      </CardContent>
    </Card>,
    host,
  );
}
