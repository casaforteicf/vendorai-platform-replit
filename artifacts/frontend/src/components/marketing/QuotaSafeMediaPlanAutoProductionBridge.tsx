import { useEffect, useState } from "react";
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
type ContentUsage = { monthlyUsed?: number; monthlyLimit?: number };

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

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
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

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const evaluate = async () => {
      if (!isPlanQueueRoute()) {
        if (!cancelled) setAllowOriginalBridge(false);
        return;
      }

      const tenantId = currentTenantId();
      if (!tenantId) {
        if (!cancelled) setAllowOriginalBridge(false);
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
          if (!cancelled) setAllowOriginalBridge(false);
          return;
        }

        // Antes da aprovação, o bridge original pode permanecer montado porque ele não dispara produção.
        if (plan.conteudo?.statusPlanejamento !== "aprovado") {
          if (!cancelled) setAllowOriginalBridge(true);
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
          if (status === "failed" || status === "processing") continue;
          if (!["draft_ready", "ready", "review", "approved"].includes(status)) pending += 1;
        }

        const used = Math.max(0, Number(usage.monthlyUsed ?? 0));
        const limit = Math.max(0, Number(usage.monthlyLimit ?? 0));
        const available = Math.max(0, limit - used);

        // Regra de proteção: nunca montar o auto-produtor quando a fila completa excede a quota.
        // Isso evita iniciar 204 itens e transformar os excedentes em falhas quando só há, por exemplo, 66 gerações disponíveis.
        const safeToStart = pending === 0 || available >= pending;
        if (!cancelled) setAllowOriginalBridge(safeToStart);
      } catch {
        // Falha fechada: se não conseguimos confirmar quota, não iniciamos produção em massa.
        if (!cancelled) setAllowOriginalBridge(false);
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void evaluate(), 250);
    };

    void evaluate();
    window.addEventListener("popstate", schedule);
    timer = window.setInterval(() => void evaluate(), 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("popstate", schedule);
      window.clearTimeout(timer);
      window.clearInterval(timer);
    };
  }, []);

  return allowOriginalBridge ? <UnsafeMediaPlanAutoProductionBridge /> : null;
}
