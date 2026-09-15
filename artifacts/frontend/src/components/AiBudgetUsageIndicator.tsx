import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, ShoppingCart, Sparkles } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type Budget = {
  tenantId: string;
  planName: string | null;
  percentUsed: number;
  alertPercent: 0 | 50 | 75 | 90 | 100;
  blocked: boolean;
  baseCredits: number;
  extraCreditsRemaining: number;
  usedCredits: number;
  remainingCredits: number;
  totalCycleCredits: number;
  pack: { priceBrl: number; credits: number };
};

function tenantIdFromStorage() {
  try {
    const override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? "null") as { id?: string } | null;
    if (override?.id) return override.id;
  } catch {}
  try {
    const user = JSON.parse(localStorage.getItem(USER_CACHE_KEY) ?? "null") as { tenantId?: string } | null;
    return user?.tenantId ?? "";
  } catch {
    return "";
  }
}

function headers(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function formatCredits(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("pt-BR");
}

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function AiBudgetUsageIndicator() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tenantId, setTenantId] = useState(() => tenantIdFromStorage());

  const load = useCallback(async () => {
    const currentTenant = tenantIdFromStorage();
    if (currentTenant !== tenantId) setTenantId(currentTenant);
    if (!currentTenant || !localStorage.getItem("vendorai_token")) {
      setBudget(null);
      return;
    }
    try {
      const response = await fetch(`/api/tenants/${currentTenant}/ai-budget`, {
        headers: headers(),
        cache: "no-store",
      });
      if (!response.ok) return;
      const next = await response.json() as Budget;
      setBudget(next);

      if (next.alertPercent > 0) {
        const alertKey = `vendorai_ai_budget_alert:${currentTenant}:${monthKey()}:${next.alertPercent}`;
        if (!localStorage.getItem(alertKey)) {
          localStorage.setItem(alertKey, new Date().toISOString());
          setExpanded(true);
          setNotice(
            next.alertPercent >= 100
              ? "Limite de IA atingido. Novas chamadas com a chave compartilhada ficam bloqueadas até a renovação ou compra de créditos."
              : `Alerta: ${next.alertPercent}% da franquia de IA deste ciclo já foi utilizada.`,
          );
        }
      }
    } catch {
      // O indicador não pode interromper o restante do aplicativo.
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener("popstate", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const tone = useMemo(() => {
    const p = budget?.percentUsed ?? 0;
    if (p >= 100) return "border-red-300 bg-red-50 text-red-900";
    if (p >= 90) return "border-orange-300 bg-orange-50 text-orange-900";
    if (p >= 75) return "border-amber-300 bg-amber-50 text-amber-900";
    if (p >= 50) return "border-yellow-300 bg-yellow-50 text-yellow-900";
    return "border-border bg-background text-foreground";
  }, [budget?.percentUsed]);

  const buyCredits = async () => {
    if (!budget || purchaseBusy) return;
    setPurchaseBusy(true);
    setNotice("");
    const paymentWindow = window.open("", "_blank");
    try {
      const response = await fetch(`/api/tenants/${budget.tenantId}/ai-credit-pack-purchases`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({})) as { invoiceUrl?: string; error?: string };
      if (!response.ok || !payload.invoiceUrl) throw new Error(payload.error ?? "Não foi possível abrir a cobrança.");
      if (paymentWindow) {
        paymentWindow.opener = null;
        paymentWindow.location.href = payload.invoiceUrl;
      } else {
        setNotice("A cobrança foi criada. Permita pop-ups para abrir o pagamento.");
      }
    } catch (error) {
      paymentWindow?.close();
      setNotice(error instanceof Error ? error.message : "Não foi possível comprar créditos agora.");
    } finally {
      setPurchaseBusy(false);
    }
  };

  if (!budget) return null;

  const percent = Math.max(0, Math.min(100, budget.percentUsed));

  return (
    <div className={`fixed bottom-4 left-4 z-[125] w-[min(390px,calc(100vw-2rem))] rounded-xl border shadow-lg ${tone}`}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <span className="rounded-full bg-black/5 p-1.5"><Sparkles className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3 text-xs font-semibold">
            <span>Consumo de IA · {percent.toFixed(0)}%</span>
            <span className="text-[11px] font-medium opacity-75">{formatCredits(budget.remainingCredits)} restantes</span>
          </span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/10">
            <span className="block h-full rounded-full bg-current transition-[width]" style={{ width: `${percent}%` }} />
          </span>
        </span>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {expanded ? (
        <div className="border-t border-black/10 px-3 pb-3 pt-2 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <span className="opacity-70">Plano</span><span className="text-right font-medium">{budget.planName ?? "Sem plano"}</span>
            <span className="opacity-70">Franquia mensal</span><span className="text-right font-medium">{formatCredits(budget.baseCredits)} créditos</span>
            <span className="opacity-70">Créditos extras</span><span className="text-right font-medium">{formatCredits(budget.extraCreditsRemaining)}</span>
            <span className="opacity-70">Consumidos no ciclo</span><span className="text-right font-medium">{formatCredits(budget.usedCredits)}</span>
          </div>

          {budget.alertPercent >= 50 ? (
            <div className="mt-2 flex gap-2 rounded-lg bg-black/5 p-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {budget.blocked
                  ? "Franquia esgotada. O backend bloqueia novas chamadas compartilhadas antes de enviá-las ao provedor."
                  : `Alerta de consumo: ${budget.alertPercent}% utilizado.`}
              </p>
            </div>
          ) : null}

          {notice ? <p className="mt-2 rounded-lg bg-black/5 p-2">{notice}</p> : null}

          <button
            type="button"
            onClick={() => void buyCredits()}
            disabled={purchaseBusy}
            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {purchaseBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Comprar +{formatCredits(budget.pack.credits)} créditos · R$ {budget.pack.priceBrl.toFixed(2).replace(".", ",")}
          </button>
          <p className="mt-1.5 text-[10px] opacity-65">Alertas automáticos em 50%, 75%, 90% e 100% por tenant.</p>
        </div>
      ) : null}
    </div>
  );
}
