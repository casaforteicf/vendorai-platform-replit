import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Gauge, Sparkles } from "lucide-react";
import "./marketing/MarketingResponsiveFocusBridge";
import "./marketing/MarketingResultsTrackingBridge";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type UsageQuota = {
  metricKey: string;
  name: string;
  unitSingular: string;
  unitPlural: string;
  monthlyQuantity: number | null;
  usedQuantity: number;
  remainingQuantity: number | null;
  percentUsed: number | null;
  overageAllowed: boolean;
  vendorCreditsUsed: number;
};

type CommercialUsage = {
  tenantId: string;
  commercialKey: string;
  vendorCreditsBalance: number;
  quotas: UsageQuota[];
  enforcementMode: "measure_only" | string;
};

type PopoverPosition = { left: number; bottom: number; width: number };

function tenantIdFromStorage() {
  let cachedUser: { tenantId?: string; platformRole?: string } | null = null;
  try {
    cachedUser = JSON.parse(localStorage.getItem(USER_CACHE_KEY) ?? "null") as { tenantId?: string; platformRole?: string } | null;
  } catch {
    cachedUser = null;
  }
  // O override de "visualizar como tenant" só vale pra super_admin (ver
  // AuthContext). Sem essa checagem, um override antigo preso no
  // localStorage fazia o widget pedir /commercial-usage com um tenantId
  // que não batia com o token de contas comuns — 403 silencioso.
  if (cachedUser?.platformRole === "super_admin") {
    try {
      const override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? "null") as { id?: string } | null;
      if (override?.id) return override.id;
    } catch {}
  }
  return cachedUser?.tenantId ?? "";
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatQuantity(value: number) {
  return Math.max(0, value).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function planLabel(key: string) {
  if (key === "vendor.growth") return "Growth";
  if (key === "vendor.crm.free") return "CRM Free";
  return key.replace(/^vendor\./, "").replaceAll("_", " ");
}

export function AiBudgetUsageIndicator() {
  const [usage, setUsage] = useState<CommercialUsage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    const tenantId = tenantIdFromStorage();
    if (!tenantId || !localStorage.getItem("vendorai_token")) {
      setUsage(null);
      return;
    }
    try {
      const response = await fetch(`/api/tenants/${tenantId}/commercial-usage`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!response.ok) return;
      setUsage(await response.json() as CommercialUsage);
    } catch {
      // Medição comercial nunca pode interromper a navegação principal.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("popstate", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("popstate", refresh);
    };
  }, [load]);

  // Mantém o acionador pequeno ao lado de Novidades, sem cobrir o botão Sair.
  useEffect(() => {
    let createdSlot: HTMLElement | null = null;
    let utilitiesContainer: HTMLElement | null = null;

    const attachBesideNovidades = () => {
      if (window.innerWidth < 768) {
        setSidebarSlot(null);
        return;
      }
      const desktopSidebar = document.querySelector(".hidden.md\\:flex.sticky.top-0.h-screen");
      const footer = desktopSidebar?.querySelector(".p-4.border-t") as HTMLElement | null;
      const utilities = footer?.querySelector(".mb-1.space-y-1") as HTMLElement | null;
      if (!utilities) return setSidebarSlot(null);

      const novidadesButton = Array.from(utilities.querySelectorAll("button")).find((button) =>
        /novidades/i.test(button.textContent ?? ""),
      ) as HTMLButtonElement | undefined;
      if (!novidadesButton) return setSidebarSlot(null);

      let slot = utilities.querySelector<HTMLElement>("[data-ai-budget-sidebar-slot]");
      if (!slot) {
        slot = document.createElement("div");
        slot.dataset.aiBudgetSidebarSlot = "true";
        slot.setAttribute("aria-label", "Consumo VendorAI");
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
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", attachBesideNovidades);
      if (createdSlot?.isConnected) createdSlot.remove();
      if (utilitiesContainer?.isConnected) utilitiesContainer.style.position = "";
    };
  }, []);

  useEffect(() => {
    if (!expanded || !sidebarSlot) return setPopoverPosition(null);
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(420, Math.max(300, window.innerWidth - 24));
      setPopoverPosition({
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        bottom: Math.max(12, window.innerHeight - rect.top + 8),
        width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [expanded, sidebarSlot]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setExpanded(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const maxPercent = useMemo(() => Math.max(0, ...((usage?.quotas ?? [])
    .map((q) => q.percentUsed ?? 0))), [usage?.quotas]);
  const visible = useMemo(() => (usage?.quotas ?? []).filter((q) => q.monthlyQuantity !== null), [usage?.quotas]);
  const tone = maxPercent >= 100
    ? "border-red-300 bg-red-50 text-red-900"
    : maxPercent >= 80
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-border bg-background text-foreground";

  const hideOnConceptMobile =
    typeof window !== "undefined" &&
    window.innerWidth < 768 &&
    window.location.pathname.startsWith("/arch/concept");

  if (hideOnConceptMobile) return null;
  if (!usage) return null;

  const panel = (
    <div className={`overflow-hidden rounded-xl border shadow-xl ${tone}`}>
      <button type="button" onClick={() => setExpanded(false)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
        <span className="rounded-full bg-black/5 p-1.5"><Gauge className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Consumo · {planLabel(usage.commercialKey)}</span>
          <span className="block text-[11px] opacity-70">Franquias por função, não por usuário</span>
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>

      <div className="max-h-[60vh] overflow-y-auto border-t border-black/10 px-3 py-3">
        {visible.length === 0 ? (
          <p className="rounded-lg bg-black/5 p-3 text-xs">Este produto não possui franquias mensais configuradas.</p>
        ) : (
          <div className="space-y-3">
            {visible.map((quota) => {
              const pct = Math.max(0, Math.min(100, quota.percentUsed ?? 0));
              return (
                <div key={quota.metricKey}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-medium">{quota.name}</span>
                    <span className="whitespace-nowrap opacity-75">{formatQuantity(quota.usedQuantity)} / {formatQuantity(quota.monthlyQuantity ?? 0)} {quota.unitPlural}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-current transition-[width]" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[10px] leading-4 opacity-65">Operações normais do CRM não consomem franquia. Falhas técnicas não descontam unidades. A nova medição está em modo de acompanhamento antes da ativação de bloqueios comerciais.</p>
      </div>
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
        aria-label="Abrir consumo do plano"
      >
        <Sparkles className="h-3 w-3" />
        <span className="text-[9px] font-semibold leading-none">Uso · {maxPercent.toFixed(0)}%</span>
        {expanded ? <ChevronDown className="h-3 w-3 opacity-70" /> : <ChevronUp className="h-3 w-3 opacity-70" />}
      </button>,
      sidebarSlot,
    );
    const popover = expanded && popoverPosition
      ? createPortal(<div className="fixed z-[1000] max-h-[calc(100vh-24px)] overflow-y-auto" style={popoverPosition}>{panel}</div>, document.body)
      : null;
    return <>{trigger}{popover}</>;
  }

  return (
    <div className={`fixed bottom-4 left-3 z-[125] ${expanded ? "right-3" : ""} sm:left-4 sm:right-auto sm:w-[min(420px,calc(100vw-2rem))]`}>
      {expanded ? panel : (
        <button type="button" onClick={() => setExpanded(true)} className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 shadow-lg ${tone}`}>
          <Sparkles className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold">Uso · {maxPercent.toFixed(0)}%</span><ChevronUp className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
