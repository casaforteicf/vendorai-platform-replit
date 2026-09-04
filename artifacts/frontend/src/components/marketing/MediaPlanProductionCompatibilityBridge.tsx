import { useEffect } from "react";

const ALLOWED_PROJECT_KINDS = new Set(["video", "reel", "story", "feed", "audio", "mixed"]);

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

  return null;
}
