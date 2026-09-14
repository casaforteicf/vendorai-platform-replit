import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

const REVIEW_FLAG = "vendorai_review_existing_media_plan_v1";
const HOST_ATTR = "data-vendorai-planning-review-actions";
const HIDDEN_ATTR = "data-vendorai-planning-review-hidden";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type MediaPlan = {
  id: string;
  conteudo?: {
    statusPlanejamento?: "gerado" | "em_revisao" | "aprovado";
    campanhas?: Array<Record<string, unknown>>;
    periodoDias?: number;
  };
};

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY);
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as { id?: string | null };
      if (override?.id) return override.id;
    }
  } catch {
    // Ignora cache inválido.
  }
  try {
    const userRaw = localStorage.getItem(USER_CACHE_KEY);
    if (!userRaw) return "";
    const user = JSON.parse(userRaw) as { tenantId?: string | null };
    return user?.tenantId ?? "";
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

function isPlanningRoute() {
  if (window.location.pathname !== "/content") return false;
  return (new URLSearchParams(window.location.search).get("tab") ?? "") === "planejamento";
}

function closestCard(node: HTMLElement | null) {
  let current = node;
  while (current && current !== document.body) {
    const className = typeof current.className === "string" ? current.className : "";
    if (className.includes("border") && (className.includes("rounded") || className.includes("shadow"))) return current;
    current = current.parentElement;
  }
  return null;
}

function navigateToCampaigns(planId: string) {
  const target = `/content?source=media-plan&tab=campanhas&mediaPlanId=${encodeURIComponent(planId)}`;
  window.history.pushState({}, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function PlanningReviewBridge() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState<"approve" | "generate" | null>(null);
  const [error, setError] = useState("");
  const tenantId = currentTenantId();

  const onPlanning = useMemo(() => {
    void location;
    return isPlanningRoute();
  }, [location]);

  useEffect(() => {
    const update = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 300);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const captureReviewIntent = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!target) return;
      if (normalizedText(target.textContent ?? "") !== "Revisar Planejamento") return;
      try {
        sessionStorage.setItem(REVIEW_FLAG, "1");
      } catch {
        // Navegação continua mesmo sem sessionStorage.
      }
    };
    document.addEventListener("click", captureReviewIntent, true);
    return () => document.removeEventListener("click", captureReviewIntent, true);
  }, []);

  useEffect(() => {
    if (!onPlanning) return;
    const timer = window.setInterval(() => {
      let shouldOpen = false;
      try {
        shouldOpen = sessionStorage.getItem(REVIEW_FLAG) === "1";
      } catch {
        shouldOpen = false;
      }
      if (!shouldOpen) return;
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((item) => normalizedText(item.textContent ?? "") === "Ver anterior" && item.offsetParent !== null);
      if (!button) return;
      try {
        sessionStorage.removeItem(REVIEW_FLAG);
      } catch {
        // Best effort.
      }
      button.click();
    }, 250);
    return () => window.clearInterval(timer);
  }, [onPlanning]);

  useEffect(() => {
    if (!onPlanning) {
      setHost(null);
      return;
    }

    const attach = () => {
      const previousLabel = Array.from(document.querySelectorAll<HTMLElement>("p,div"))
        .find((node) => normalizedText(node.textContent ?? "") === "Você está vendo o planejamento anterior.");
      if (!previousLabel) {
        setHost(null);
        return;
      }

      const infoTitle = Array.from(document.querySelectorAll<HTMLElement>("div,p"))
        .find((node) => normalizedText(node.textContent ?? "") === "1. Informações do planejamento");
      const infoCard = closestCard(infoTitle ?? null);
      if (infoCard && !infoCard.hasAttribute(HIDDEN_ATTR)) {
        infoCard.setAttribute(HIDDEN_ATTR, infoCard.style.display || "__empty__");
        infoCard.style.display = "none";
      }

      const backButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => normalizedText(button.textContent ?? "") === "Voltar ao preenchimento" && button.offsetParent !== null);
      const targetParent = backButton?.parentElement;
      if (!targetParent) return;

      let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
      if (!portalHost) {
        portalHost = document.createElement("div");
        portalHost.setAttribute(HOST_ATTR, "true");
        portalHost.className = "w-full";
      }
      if (portalHost.parentElement !== targetParent.parentElement) {
        targetParent.parentElement?.insertBefore(portalHost, targetParent);
      }
      setHost((current) => current === portalHost ? current : portalHost);
    };

    attach();
    const timer = window.setInterval(attach, 350);
    return () => {
      window.clearInterval(timer);
      document.querySelector<HTMLElement>(`[${HOST_ATTR}]`)?.remove();
      document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`).forEach((node) => {
        const previous = node.getAttribute(HIDDEN_ATTR);
        node.style.display = previous && previous !== "__empty__" ? previous : "";
        node.removeAttribute(HIDDEN_ATTR);
      });
    };
  }, [onPlanning]);

  const loadPlan = useCallback(async () => {
    if (!host || !tenantId) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar o planejamento.");
      const currentPlan = await response.json() as MediaPlan | null;
      setPlan(currentPlan);
      if (!currentPlan) return;
      const calendarResponse = await fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders() });
      if (calendarResponse.ok) {
        const items = await calendarResponse.json() as Array<{ mediaPlanId?: string | null }>;
        setGenerated(items.some((item) => item.mediaPlanId === currentPlan.id));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar planejamento.");
    }
  }, [host, tenantId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const approve = useCallback(async () => {
    if (!plan || !tenantId || busy) return;
    setBusy("approve");
    setError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-plan/${plan.id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ patch: { campanhas: plan.conteudo?.campanhas ?? [] }, aprovar: true }),
      });
      const data = await response.json().catch(() => ({})) as MediaPlan & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível aprovar o planejamento.");
      setPlan(data);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Não foi possível aprovar o planejamento.");
    } finally {
      setBusy(null);
    }
  }, [busy, plan, tenantId]);

  const generate = useCallback(async () => {
    if (!plan || !tenantId || busy) return;
    if (generated) {
      navigateToCampaigns(plan.id);
      return;
    }
    setBusy("generate");
    setError("");
    try {
      const weeks = Math.max(1, Math.ceil((plan.conteudo?.periodoDias ?? 30) / 7));
      const response = await fetch(`/api/tenants/${tenantId}/content-calendar/gerar`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ mediaPlanId: plan.id, semanas: weeks, substituirPlanejado: false }),
      });
      const payload = await response.json().catch(() => ({})) as Array<unknown> | { error?: string };
      if (!response.ok) {
        const message = Array.isArray(payload) ? "Não foi possível gerar as campanhas." : payload.error ?? "Não foi possível gerar as campanhas.";
        throw new Error(message);
      }
      setGenerated(true);
      navigateToCampaigns(plan.id);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Não foi possível gerar as campanhas.");
    } finally {
      setBusy(null);
    }
  }, [busy, generated, plan, tenantId]);

  if (!host || !plan) return null;
  const approved = plan.conteudo?.statusPlanejamento === "aprovado";

  return createPortal(
    <div className="mb-3 rounded-xl border border-primary/25 bg-primary/[0.03] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{approved ? "Planejamento aprovado" : "3. Aprovação"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {approved ? "A direção está aprovada. Agora você pode iniciar a execução das campanhas." : "Esta é a proposta existente. Aprove aqui sem precisar criar outro planejamento."}
          </p>
          {error ? <p className="mt-2 text-xs font-medium text-destructive">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!approved ? (
            <button type="button" onClick={() => void approve()} disabled={busy !== null} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60">
              {busy === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Aprovar planejamento
            </button>
          ) : (
            <button type="button" onClick={() => void generate()} disabled={busy !== null} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60">
              {busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              {generated ? "Abrir Campanhas" : "Gerar Campanhas e iniciar execução"}
            </button>
          )}
        </div>
      </div>
    </div>,
    host,
  );
}
