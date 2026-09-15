import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ShoppingCart, Sparkles } from "lucide-react";
import { MediaPlanAutoProductionBridge as UnsafeMediaPlanAutoProductionBridge } from "./MediaPlanAutoProductionBridge";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };
type MediaPlan = { id: string; conteudo?: { statusPlanejamento?: string } | null };
type CalendarItem = {
  id: string;
  mediaPlanId?: string | null;
  status: string;
  contentGenerationId?: string | null;
};
type MediaProject = { context?: Record<string, unknown> | null };
type ContentUsage = {
  monthlyUsed?: number;
  monthlyLimit?: number;
  baseRemaining?: number;
  extraRemaining?: number;
  availableGenerations?: number | null;
  generationUnlimited?: boolean;
  canPurchaseGenerations?: boolean;
  generationPackSize?: number;
  generationPackPrice?: number;
};
type QuotaState = {
  approved: boolean;
  pending: number;
  used: number;
  limit: number;
  available: number;
  unlimited: boolean;
  extraRemaining: number;
  packSize: number;
  packPrice: number;
};

function currentTenantId() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CachedOverride;
      if (parsed?.id) return parsed.id;
    }
  } catch {}

  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return "";
    return (JSON.parse(raw) as CachedUser)?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function asContext(project: MediaProject) {
  return project.context && typeof project.context === "object" && !Array.isArray(project.context)
    ? project.context
    : {};
}

function isPlanQueueRoute() {
  if (window.location.pathname !== "/content") return false;
  return new URLSearchParams(window.location.search).get("mode") !== "avulso";
}

export function MediaPlanAutoProductionBridge() {
  const [allowOriginalBridge, setAllowOriginalBridge] = useState(false);
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    let interval = 0;
    let scheduleTimer = 0;

    const evaluate = async () => {
      if (!isPlanQueueRoute()) {
        if (!cancelled) {
          setAllowOriginalBridge(false);
          setQuota(null);
        }
        return;
      }

      const tenantId = currentTenantId();
      if (!tenantId) {
        if (!cancelled) {
          setAllowOriginalBridge(false);
          setQuota(null);
        }
        return;
      }

      try {
        const [planResponse, calendarResponse, projectsResponse, usageResponse] = await Promise.all([
          fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders(), cache: "no-store" }),
          fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders(), cache: "no-store" }),
          fetch(`/api/tenants/${tenantId}/media/projects?limit=200`, { headers: authHeaders(), cache: "no-store" }),
          fetch(`/api/tenants/${tenantId}/content`, { headers: authHeaders(), cache: "no-store" }),
        ]);

        if (!planResponse.ok || !calendarResponse.ok || !projectsResponse.ok || !usageResponse.ok) {
          if (!cancelled) setAllowOriginalBridge(false);
          return;
        }

        const plan = await planResponse.json() as MediaPlan | null;
        const calendar = await calendarResponse.json() as CalendarItem[];
        const projectsBody = await projectsResponse.json() as { projects?: MediaProject[] };
        const usage = await usageResponse.json() as ContentUsage;

        if (!plan) {
          if (!cancelled) {
            setAllowOriginalBridge(false);
            setQuota(null);
          }
          return;
        }

        const approved = plan.conteudo?.statusPlanejamento === "aprovado";
        if (!approved) {
          if (!cancelled) {
            setAllowOriginalBridge(true);
            setQuota({ approved: false, pending: 0, used: 0, limit: 200, available: 0, unlimited: false, extraRemaining: 0, packSize: 200, packPrice: 99 });
          }
          return;
        }

        const projects = (projectsBody.projects ?? []).filter((project) => asContext(project).source === "media-plan");
        const projectByItem = new Map(
          projects.map((project) => [String(asContext(project).calendarItemId ?? ""), project]),
        );
        const relevant = Array.isArray(calendar)
          ? calendar.filter((item) => (!item.mediaPlanId || item.mediaPlanId === plan.id) && (item.status === "aprovado" || item.status === "gerado"))
          : [];

        let pending = 0;
        for (const item of relevant) {
          if (item.contentGenerationId) continue;
          const project = projectByItem.get(item.id);
          const status = String(project ? asContext(project).materializationStatus ?? "" : "");
          if (status === "processing") continue;
          if (!["draft_ready", "ready", "review", "approved"].includes(status)) pending += 1;
        }

        const used = Math.max(0, Number(usage.monthlyUsed ?? 0));
        const limit = Math.max(0, Number(usage.monthlyLimit ?? 200));
        const fallbackAvailable = Math.max(0, limit - used);
        const unlimited = usage.generationUnlimited === true;
        const available = unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, Number(usage.availableGenerations ?? fallbackAvailable));
        const nextQuota: QuotaState = {
          approved: true,
          pending,
          used,
          limit,
          available,
          unlimited,
          extraRemaining: Math.max(0, Number(usage.extraRemaining ?? 0)),
          packSize: Math.max(1, Number(usage.generationPackSize ?? 200)),
          packPrice: Math.max(0, Number(usage.generationPackPrice ?? 99)),
        };

        if (!cancelled) {
          setQuota(nextQuota);
          // Produz tudo que ainda couber. Quando zerar, desmonta o produtor e
          // mantém somente os itens excedentes pendentes, sem marcá-los como falha.
          setAllowOriginalBridge(pending === 0 || available > 0);
          if (available > 0) setPurchaseNotice("");
        }
      } catch {
        if (!cancelled) setAllowOriginalBridge(false);
      }
    };

    const schedule = () => {
      window.clearTimeout(scheduleTimer);
      scheduleTimer = window.setTimeout(() => void evaluate(), 250);
    };

    void evaluate();
    window.addEventListener("popstate", schedule);
    interval = window.setInterval(() => void evaluate(), 4000);

    return () => {
      cancelled = true;
      window.removeEventListener("popstate", schedule);
      window.clearTimeout(scheduleTimer);
      window.clearInterval(interval);
    };
  }, []);

  const buyGenerationPack = async () => {
    const tenantId = currentTenantId();
    if (!tenantId || purchaseBusy || !quota || quota.available > 0) return;
    setPurchaseBusy(true);
    setPurchaseNotice("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/generation-pack-purchases`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({})) as { invoiceUrl?: string; error?: string; reused?: boolean };
      if (!response.ok || !payload.invoiceUrl) {
        throw new Error(payload.error ?? "Não foi possível abrir a compra de gerações.");
      }
      const paymentWindow = window.open(payload.invoiceUrl, "_blank", "noopener,noreferrer");
      if (!paymentWindow) {
        setPurchaseNotice("O pagamento foi criado no Asaas. Permita pop-ups para abrir a cobrança.");
      } else {
        setPurchaseNotice("Pagamento aberto no Asaas. Após a confirmação, a produção pendente continua automaticamente.");
      }
    } catch (error) {
      setPurchaseNotice(error instanceof Error ? error.message : "Não foi possível iniciar a compra.");
    } finally {
      setPurchaseBusy(false);
    }
  };

  const showPurchase = Boolean(
    quota?.approved &&
    quota.pending > 0 &&
    !quota.unlimited &&
    quota.available === 0,
  );

  return (
    <>
      {allowOriginalBridge && <UnsafeMediaPlanAutoProductionBridge />}
      {showPurchase && createPortal(
        <div className="fixed bottom-4 right-4 z-[130] w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-amber-300 bg-background p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Franquia de gerações encerrada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                As {quota?.limit ?? 200} gerações do ciclo foram utilizadas. {quota?.pending ?? 0} material(is) continuam pendentes e não serão marcados como falha.
              </p>
              <button
                type="button"
                onClick={() => void buyGenerationPack()}
                disabled={purchaseBusy}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {purchaseBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Comprar +{quota?.packSize ?? 200} gerações · R$ {(quota?.packPrice ?? 99).toFixed(2).replace(".", ",")}
              </button>
              {purchaseNotice && <p className="mt-2 text-[11px] text-muted-foreground">{purchaseNotice}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
