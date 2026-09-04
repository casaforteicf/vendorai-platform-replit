import { useEffect } from "react";

const ALLOWED_PROJECT_KINDS = new Set(["video", "reel", "story", "feed", "audio", "mixed"]);

/**
 * Compatibilidade da produção completa do Plano de Mídia com o Media Library
 * existente. O tipo funcional mais rico (site/ad/message) fica em context.executorKind,
 * enquanto o projeto é persistido como kind=mixed sem migration paralela.
 *
 * Também remove o botão legado de lote parcial (que só produzia formatos orgânicos)
 * para não coexistir com o novo fluxo "Produzir plano completo".
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

    const syncLegacyBatchButton = () => {
      const params = new URLSearchParams(window.location.search);
      const onPlanQueue = window.location.pathname === "/content" && params.get("mode") !== "avulso";
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        const label = (button.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        const isLegacyBatch = label.startsWith("produzir automaticamente") || /^\d+\/\d+$/.test(label);
        if (onPlanQueue && isLegacyBatch) {
          button.dataset.vendoraiLegacyBatchHidden = "true";
          button.style.display = "none";
        } else if (button.dataset.vendoraiLegacyBatchHidden === "true") {
          button.style.removeProperty("display");
          delete button.dataset.vendoraiLegacyBatchHidden;
        }
      });
    };

    syncLegacyBatchButton();
    const observer = new MutationObserver(syncLegacyBatchButton);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(syncLegacyBatchButton, 700);

    return () => {
      if (window.fetch === guardedFetch) window.fetch = previousFetch;
      observer.disconnect();
      window.clearInterval(timer);
      document.querySelectorAll<HTMLButtonElement>("button[data-vendorai-legacy-batch-hidden='true']").forEach((button) => {
        button.style.removeProperty("display");
        delete button.dataset.vendoraiLegacyBatchHidden;
      });
    };
  }, []);

  return null;
}
