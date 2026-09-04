import { useEffect } from "react";

const ALLOWED_PROJECT_KINDS = new Set(["video", "reel", "story", "feed", "audio", "mixed"]);
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

function currentTenantId(): string {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string | null };
      if (parsed?.id) return parsed.id;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return "";
    return (JSON.parse(raw) as { tenantId?: string | null })?.tenantId ?? "";
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

/**
 * O Media Library possui um conjunto histórico e fechado de kinds de projeto.
 * A produção do Plano de Mídia usa nomes de executor mais ricos no context
 * (site/ad/message), mas persiste esses registros como kind=mixed para manter
 * compatibilidade sem migration. O tipo real continua em context.executorKind.
 */
export function MediaPlanProductionCompatibilityBridge() {
  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const guardedFetch: typeof window.fetch = async (input, init = {}) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, window.location.origin);
      const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

      if (typeof init.body === "string" && /\/api\/tenants\/[^/]+\/media\/projects\/?$/.test(url.pathname) && method === "POST") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const kind = typeof body.kind === "string" ? body.kind : "";
          if (kind && !ALLOWED_PROJECT_KINDS.has(kind)) body.kind = "mixed";
          return previousFetch(input, { ...init, body: JSON.stringify(body) });
        } catch {
          return previousFetch(input, init);
        }
      }

      if (typeof init.body === "string" && /\/api\/tenants\/[^/]+\/media\/projects\/[^/]+\/?$/.test(url.pathname) && method === "PATCH") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
            ? body.context as Record<string, unknown>
            : null;
          if (context?.materializationStatus === "processing") body.status = "processing";
          return previousFetch(input, { ...init, body: JSON.stringify(body) });
        } catch {
          return previousFetch(input, init);
        }
      }

      return previousFetch(input, init);
    };

    window.fetch = guardedFetch;
    return () => {
      if (window.fetch === guardedFetch) window.fetch = previousFetch;
    };
  }, []);

  // Se um executor falhou depois de criar uma copy de apoio, o calendário pode
  // ter ficado como "gerado" com contentGenerationId e, sem esta recuperação,
  // parecer finalizado. Voltamos somente o item com evidência explícita de falha
  // para "aprovado"; o Plano permanece aprovado e o botão Produzir plano completo
  // consegue refazer apenas essa peça, sem regenerar o restante.
  useEffect(() => {
    const tenantId = currentTenantId();
    const onPlanQueue = window.location.pathname === "/content" && new URLSearchParams(window.location.search).get("mode") !== "avulso";
    if (!tenantId || !onPlanQueue) return;

    let cancelled = false;
    const recover = async () => {
      try {
        const [projectsResponse, calendarResponse] = await Promise.all([
          fetch(`/api/tenants/${tenantId}/media/projects?limit=100`, { headers: authHeaders(), cache: "no-store" }),
          fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders(), cache: "no-store" }),
        ]);
        if (!projectsResponse.ok || !calendarResponse.ok || cancelled) return;
        const projectsPayload = await projectsResponse.json().catch(() => ({})) as { projects?: Array<{ context?: Record<string, unknown> | null }> };
        const calendar = await calendarResponse.json().catch(() => []) as Array<{ id: string; status: string; contentGenerationId?: string | null }>;
        const failedItemIds = new Set((projectsPayload.projects ?? []).flatMap((project) => {
          const context = project.context ?? {};
          return context["materializationStatus"] === "failed" && typeof context["calendarItemId"] === "string"
            ? [context["calendarItemId"] as string]
            : [];
        }));

        for (const item of calendar) {
          if (cancelled || !failedItemIds.has(item.id) || item.status !== "gerado") continue;
          await fetch(`/api/content-calendar/${item.id}`, {
            method: "PATCH",
            headers: authHeaders(true),
            body: JSON.stringify({ status: "aprovado", contentGenerationId: null, variationIdx: null }),
          }).catch(() => null);
        }
      } catch {
        // Best-effort: uma falha aqui não deve interferir na fila principal.
      }
    };

    void recover();
    const timer = window.setInterval(() => { void recover(); }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
