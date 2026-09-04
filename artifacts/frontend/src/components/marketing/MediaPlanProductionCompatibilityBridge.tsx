import { useEffect } from "react";

const ALLOWED_PROJECT_KINDS = new Set(["video", "reel", "story", "feed", "audio", "mixed"]);

/**
 * Compatibilidade da produção completa do Plano de Mídia com o Media Library
 * existente. O tipo funcional mais rico (site/ad/message) fica em context.executorKind,
 * enquanto o projeto é persistido como kind=mixed sem migration paralela.
 *
 * Também remove o lote legado parcial e impede que "Abrir executor" navegue
 * para uma tela vazia: no modo Plano ele abre o painel Produção real, que conhece
 * o rascunho/job efetivamente materializado e oferece o link correto.
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

    const isPlanQueue = () => {
      const params = new URLSearchParams(window.location.search);
      return window.location.pathname === "/content" && params.get("mode") !== "avulso";
    };

    const syncLegacyBatchButton = () => {
      const onPlanQueue = isPlanQueue();
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

    const redirectLegacyExecutor = (event: MouseEvent) => {
      if (!isPlanQueue()) return;
      const target = event.target instanceof Element ? event.target.closest("button") as HTMLButtonElement | null : null;
      if (!target) return;
      const label = (target.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (label !== "abrir executor") return;

      const productionButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase().startsWith("produção real"));
      if (!productionButton) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      productionButton.click();
    };

    syncLegacyBatchButton();
    const observer = new MutationObserver(syncLegacyBatchButton);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(syncLegacyBatchButton, 700);
    document.addEventListener("click", redirectLegacyExecutor, true);

    return () => {
      if (window.fetch === guardedFetch) window.fetch = previousFetch;
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("click", redirectLegacyExecutor, true);
      document.querySelectorAll<HTMLButtonElement>("button[data-vendorai-legacy-batch-hidden='true']").forEach((button) => {
        button.style.removeProperty("display");
        delete button.dataset.vendoraiLegacyBatchHidden;
      });
    };
  }, []);

  return null;
}
