import { useEffect } from "react";

// A Biblioteca de Mídia ainda aceita apenas os kinds históricos (video/reel/story/feed/audio/mixed),
// enquanto a Produção real do Plano usa context.executorKind para distinguir site, anúncio e mensagem.
// Este bridge mantém o contrato existente sem criar rotas paralelas: somente projetos vindos do Plano
// são persistidos como "mixed" quando o kind semântico ainda não faz parte da whitelist da API.
export function MediaPlanProjectKindCompatibilityBridge() {
  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const patchedFetch: typeof window.fetch = async (input, init = {}) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, window.location.origin);
      const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

      if (method === "POST" && /\/api\/tenants\/[^/]+\/media\/projects\/?$/.test(url.pathname) && typeof init.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
            ? body.context as Record<string, unknown>
            : {};
          if (context.source === "media-plan" && ["site", "ad", "message"].includes(String(body.kind ?? ""))) {
            body.kind = "mixed";
            return previousFetch(input, { ...init, body: JSON.stringify(body) });
          }
        } catch {
          // Payload não-JSON segue inalterado.
        }
      }
      return previousFetch(input, init);
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = previousFetch;
    };
  }, []);

  return null;
}
