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
  usageUnit?: "vendor_credits";
  vendorCreditsBalance: number;
  vendorCredits?: {
    includedMonthly: number;
    includedUsed: number;
    includedRemaining: number;
    purchasedBalance: number;
    totalAvailable: number;
  };
  quotas: UsageQuota[];
  enforcementMode: "measure_only" | "enforce" | string;
};

type VendorCreditPack = {
  key: string;
  credits: number;
  priceBrl: number;
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
  const [packs, setPacks] = useState<VendorCreditPack[]>([]);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
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

  const loadPacks = useCallback(async () => {
    try {
      const response = await fetch("/api/vendor-credit-packs", {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json() as { packs?: VendorCreditPack[] };
      setPacks(Array.isArray(data.packs) ? data.packs : []);
    } catch {
      // Compra de Credits não pode interromper o restante da navegação.
    }
  }, []);

  const buyPack = useCallback(async (pack: VendorCreditPack) => {
    const tenantId = tenantIdFromStorage();
    if (!tenantId || buyingPack) return;
    setBuyingPack(pack.key);
    setPurchaseError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/vendor-credit-purchases`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ packKey: pack.key }),
      });
      const data = await response.json() as {
        invoiceUrl?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a compra.");
      if (!data.invoiceUrl) throw new Error("A cobrança foi criada, mas o link de pagamento não foi retornado.");
      window.open(data.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : "Não foi possível iniciar a compra.");
    } finally {
      setBuyingPack(null);
    }
  }, [buyingPack]);

  useEffect(() => {
    void load();
    void loadPacks();
    const timer = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("popstate", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("popstate", refresh);
    };
  }, [load, loadPacks]);

  // O indicador passa a ocupar um slot declarativo no rodapé da sidebar.
  // Nunca usa position: fixed: se Conta e atalhos estiver recolhido, ele some
  // junto e não cobre conteúdo, campos ou botões da tela.
  useEffect(() => {
    const attachToSidebar = () => {
      const slots = Array.from(
        document.querySelectorAll<HTMLElement>("[data-ai-budget-sidebar-slot]"),
      );
      const visibleSlot = slots.find((slot) => slot.offsetParent !== null) ?? null;

      setSidebarSlot((current) => current === visibleSlot ? current : visibleSlot);
      if (!visibleSlot) setExpanded(false);
    };

    attachToSidebar();
    const timer = window.setInterval(attachToSidebar, 500);
    window.addEventListener("resize", attachToSidebar);
    window.addEventListener("popstate", attachToSidebar);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", attachToSidebar);
      window.removeEventListener("popstate", attachToSidebar);
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

  const credits = usage.vendorCredits ?? {
    includedMonthly: 0,
    includedUsed: 0,
    includedRemaining: 0,
    purchasedBalance: usage.vendorCreditsBalance ?? 0,
    totalAvailable: usage.vendorCreditsBalance ?? 0,
  };

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
        <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">Vendor Credits</p>
              <p className="text-[10px] opacity-65">Franquia mensal + saldo comprado</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">{formatQuantity(credits.totalAvailable)}</p>
              <p className="text-[10px] opacity-65">disponíveis</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-md bg-black/5 p-2">
              <span className="block opacity-60">Franquia restante</span>
              <strong>{formatQuantity(credits.includedRemaining)}</strong>
            </div>
            <div className="rounded-md bg-black/5 p-2">
              <span className="block opacity-60">Saldo comprado</span>
              <strong>{formatQuantity(credits.purchasedBalance)}</strong>
            </div>
          </div>

          {packs.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide opacity-65">Adicionar Credits</p>
              <div className="grid grid-cols-2 gap-2">
                {packs.map((pack) => (
                  <button
                    key={pack.key}
                    type="button"
                    disabled={buyingPack !== null}
                    onClick={() => void buyPack(pack)}
                    className="rounded-lg border border-black/10 bg-background px-2 py-2 text-left transition hover:bg-black/5 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="block text-xs font-semibold">{pack.credits.toLocaleString("pt-BR")} Credits</span>
                    <span className="block text-[10px] opacity-70">
                      {pack.priceBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    {buyingPack === pack.key && <span className="mt-1 block text-[9px]">Abrindo cobrança…</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {purchaseError && (
            <p className="mt-2 rounded-md bg-red-100 px-2 py-1.5 text-[10px] text-red-800">{purchaseError}</p>
          )}
        </div>

        <p className="mt-3 text-[10px] leading-4 opacity-65">
          Operações normais do CRM não consomem Credits. Falhas técnicas não descontam unidades.
          Os Credits adicionais podem ser comprados a qualquer momento, sem trocar de produto.
        </p>
      </div>
    </div>
  );

  if (sidebarSlot) {
    const trigger = createPortal(
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex h-6 items-center gap-1 rounded-full border px-1.5 text-left ${tone}`}
        aria-expanded={expanded}
        aria-label="Abrir consumo e Vendor Credits"
        title={`Vendor Credits disponíveis: ${formatQuantity(credits.totalAvailable)}`}
      >
        <Sparkles className="h-2.5 w-2.5" />
        <span className="text-[9px] font-semibold leading-none">{formatQuantity(credits.totalAvailable)} Credits</span>
        {expanded ? <ChevronDown className="h-2.5 w-2.5 opacity-60" /> : <ChevronUp className="h-2.5 w-2.5 opacity-60" />}
      </button>,
      sidebarSlot,
    );
    const popover = expanded && popoverPosition
      ? createPortal(<div className="fixed z-[1000] max-h-[calc(100vh-24px)] overflow-y-auto" style={popoverPosition}>{panel}</div>, document.body)
      : null;
    return <>{trigger}{popover}</>;
  }

  // Sem slot visível (sidebar/Conta e atalhos recolhidos), não cria
  // nenhum card flutuante sobre o conteúdo principal.
  return null;
}
