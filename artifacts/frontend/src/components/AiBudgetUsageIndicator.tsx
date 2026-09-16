import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, ShoppingCart, Sparkles } from "lucide-react";
import "./marketing/MarketingResponsiveFocusBridge";
import "./marketing/MarketingResultsTrackingBridge";

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

type PopoverPosition = {
  left: number;
  bottom: number;
  width: number;
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
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    let createdSlot: HTMLElement | null = null;
    let utilitiesContainer: HTMLElement | null = null;

    const attachBesideNovidades = () => {
      if (window.innerWidth < 768) {
        setSidebarSlot(null);
        return;
      }

      const desktopSidebar = document.querySelector(".hidden.md\\:flex.sticky.top-0.h-screen");
      if (!desktopSidebar) {
        setSidebarSlot(null);
        return;
      }

      const footer = desktopSidebar.querySelector(".p-4.border-t") as HTMLElement | null;
      const utilities = footer?.querySelector(".mb-1.space-y-1") as HTMLElement | null;
      if (!utilities) {
        setSidebarSlot(null);
        return;
      }

      const novidadesButton = Array.from(utilities.querySelectorAll("button")).find((button) =>
        /novidades/i.test(button.textContent ?? ""),
      ) as HTMLButtonElement | undefined;
      if (!novidadesButton) {
        setSidebarSlot(null);
        return;
      }

      let slot = utilities.querySelector<HTMLElement>("[data-ai-budget-sidebar-slot]");
      if (!slot) {
        slot = document.createElement("div");
        slot.dataset.aiBudgetSidebarSlot = "true";
        slot.setAttribute("aria-label", "Consumo de IA");
        slot.style.position = "absolute";
        slot.style.right = "36px";
        slot.style.bottom = "4px";
        slot.style.zIndex = "4";
        utilities.style.position = "relative";
        utilities.appendChild(slot);
        createdSlot = slot;
        utilitiesContainer = utilities;
      }

      setSidebarSlot((current) => current === slot ? current : slot);
    };

    attachBesideNovidades();
    const timer = window.setInterval(attachBesideNovidades, 750);
    window.addEventListener("resize", attachBesideNovidades);
    window.addEventListener("popstate", attachBesideNovidades);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", attachBesideNovidades);
      window.removeEventListener("popstate", attachBesideNovidades);
      if (createdSlot?.isConnected) createdSlot.remove();
      if (utilitiesContainer?.isConnected) utilitiesContainer.style.position = "";
    };
  }, []);

  useEffect(() => {
    if (!expanded || !sidebarSlot) {
      setPopoverPosition(null);
      return;
    }

    const updatePopoverPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const width = Math.min(390, Math.max(280, viewportWidth - 24));
      const left = Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12));
      const bottom = Math.max(12, window.innerHeight - rect.top + 8);
      setPopoverPosition({ left, bottom, width });
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [expanded, sidebarSlot]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

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
    setNotice("Criando cobrança segura...");

    try {
      const response = await fetch(`/api/tenants/${budget.tenantId}/ai-credit-pack-purchases`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({})) as { invoiceUrl?: string; error?: string };
      if (!response.ok || !payload.invoiceUrl) {
        throw new Error(payload.error ?? "Não foi possível abrir a cobrança.");
      }

      let checkoutUrl: URL;
      try {
        checkoutUrl = new URL(payload.invoiceUrl, window.location.origin);
      } catch {
        throw new Error("A cobrança foi criada, mas o endereço de pagamento retornado é inválido.");
      }

      if (checkoutUrl.protocol !== "https:" && checkoutUrl.protocol !== "http:") {
        throw new Error("A cobrança foi criada, mas o endereço de pagamento retornado não é seguro.");
      }

      setNotice("Abrindo pagamento...");
      window.location.assign(checkoutUrl.href);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível comprar créditos agora.");
      setPurchaseBusy(false);
    }
  };

  if (!budget) return null;

  const percent = Math.max(0, Math.min(100, budget.percentUsed));

  const details = (
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
        className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-center font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {purchaseBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
        {purchaseBusy
          ? "Preparando pagamento..."
          : `Comprar +${formatCredits(budget.pack.credits)} créditos · R$ ${budget.pack.priceBrl.toFixed(2).replace(".", ",")}`}
      </button>
      <p className="mt-1.5 text-[10px] opacity-65">Alertas automáticos em 50%, 75%, 90% e 100% por tenant.</p>
    </div>
  );

  const expandedPanel = (
    <div className={`overflow-hidden rounded-xl border shadow-xl ${tone}`}>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        aria-expanded="true"
        aria-label="Fechar consumo de IA"
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
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {details}
    </div>
  );

  if (sidebarSlot) {
    const trigger = createPortal(
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex h-7 items-center gap-1 rounded-full border px-2 text-left shadow-sm ${tone}`}
        aria-expanded={expanded}
        aria-label={expanded ? "Fechar consumo de IA" : `Consumo de IA: ${percent.toFixed(0)}%`}
      >
        <Sparkles className="h-3 w-3 shrink-0" />
        <span className="text-[9px] font-semibold leading-none tracking-tight">IA · {percent.toFixed(0)}%</span>
        {expanded
          ? <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
          : <ChevronUp className="h-3 w-3 shrink-0 opacity-70" />
        }
      </button>,
      sidebarSlot,
    );

    const popover = expanded && popoverPosition
      ? createPortal(
          <div
            className="fixed z-[1000] max-h-[calc(100vh-24px)] overflow-y-auto"
            style={{
              left: popoverPosition.left,
              bottom: popoverPosition.bottom,
              width: popoverPosition.width,
            }}
          >
            {expandedPanel}
          </div>,
          document.body,
        )
      : null;

    return <>{trigger}{popover}</>;
  }

  const mobileContainer = expanded
    ? "left-3 right-3 w-auto rounded-xl sm:left-4 sm:right-auto sm:w-[min(390px,calc(100vw-2rem))]"
    : "left-3 w-auto rounded-full sm:left-4";

  return (
    <div className={`fixed bottom-4 z-[125] border shadow-lg ${mobileContainer} ${tone}`}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={expanded
          ? "flex w-full items-center gap-3 px-3 py-2 text-left"
          : "flex h-8 items-center gap-1.5 px-2.5 text-left"
        }
        aria-expanded={expanded}
        aria-label={expanded ? "Fechar consumo de IA" : `Consumo de IA: ${percent.toFixed(0)}%`}
      >
        <span className={expanded ? "rounded-full bg-black/5 p-1.5" : "rounded-full bg-black/5 p-1"}>
          <Sparkles className={expanded ? "h-4 w-4" : "h-3 w-3"} />
        </span>

        {expanded ? (
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span>Consumo de IA · {percent.toFixed(0)}%</span>
              <span className="text-[11px] font-medium opacity-75">{formatCredits(budget.remainingCredits)} restantes</span>
            </span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/10">
              <span className="block h-full rounded-full bg-current transition-[width]" style={{ width: `${percent}%` }} />
            </span>
          </span>
        ) : (
          <span className="text-[10px] font-semibold leading-none tracking-tight">IA · {percent.toFixed(0)}%</span>
        )}

        {expanded
          ? <ChevronDown className="h-4 w-4 shrink-0" />
          : <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-70" />
        }
      </button>

      {expanded ? details : null}
    </div>
  );
}
