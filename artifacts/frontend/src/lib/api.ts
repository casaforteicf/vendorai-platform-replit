import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

export function setupApiClient() {
  const apiUrl = import.meta.env.VITE_API_URL;
  const isHostedProductionWeb =
    import.meta.env.PROD &&
    (window.location.protocol === "http:" || window.location.protocol === "https:");

  // Na web publicada, use o proxy /api do mesmo dominio. Isso evita CORS e
  // timeouts causados por chamadas do navegador diretamente ao Railway.
  // Apps nativos (Capacitor) continuam usando VITE_API_URL, pois nao possuem
  // um servidor de mesma origem que possa encaminhar essas requisicoes.
  if (apiUrl && !isHostedProductionWeb) {
    setBaseUrl(apiUrl);
  }

  setAuthTokenGetter(() => localStorage.getItem("vendorai_token"));

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const inputUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    let requestInit = init;

    try {
      const resolvedUrl = new URL(inputUrl, window.location.origin);
      const isSameOriginApi =
        resolvedUrl.origin === window.location.origin &&
        resolvedUrl.pathname.startsWith("/api/");

      if (isSameOriginApi) {
        // Vercel external rewrites can replace Host/X-Forwarded-Host with the
        // Railway hostname. Preserve the browser-facing CRM hostname explicitly
        // so the API never mistakes app.appvendorai.com for a tenant website.
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        headers.set("X-Original-Host", window.location.hostname);
        requestInit = { ...init, headers };
      }
    } catch {
      // If URL resolution fails, keep the original request untouched.
    }

    const response = await originalFetch(input, requestInit);
    if (
      response.status === 403 &&
      !window.location.pathname.startsWith("/onboarding")
    ) {
      try {
        const body = await response.clone().json();
        if (body?.error === "ONBOARDING_REQUIRED") {
          window.location.href = "/onboarding";
        }
      } catch {
        // ignore parse errors
      }
    }
    return response;
  };
}
