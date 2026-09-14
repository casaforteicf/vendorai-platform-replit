import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

const OBRAS_GOV_ORIGIN = "https://api-publica.obrasgov.gestao.gov.br";
const OBRAS_GOV_PREFIX = "/obras/";

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

    let requestInput: RequestInfo | URL = input;
    let requestInit = init;

    try {
      let resolvedUrl = new URL(inputUrl, window.location.origin);

      // ObrasGov não libera CORS para app.appvendorai.com. Na web publicada,
      // convertemos chamadas diretas ao domínio oficial em um caminho de mesma
      // origem que o Vercel encaminha server-side. Isso preserva o fluxo atual
      // do Radar de Obras sem expor credenciais nem criar um módulo paralelo.
      const isObrasGovRequest =
        isHostedProductionWeb &&
        resolvedUrl.origin === OBRAS_GOV_ORIGIN &&
        resolvedUrl.pathname.startsWith(OBRAS_GOV_PREFIX);

      if (isObrasGovRequest) {
        const relativePath = resolvedUrl.pathname.slice("/obras".length);
        const proxiedUrl = new URL(`/obrasgov${relativePath}`, window.location.origin);
        proxiedUrl.search = resolvedUrl.search;
        requestInput = input instanceof Request
          ? new Request(proxiedUrl.toString(), input)
          : proxiedUrl.toString();
        resolvedUrl = proxiedUrl;
      }

      const isSameOriginApi =
        resolvedUrl.origin === window.location.origin &&
        resolvedUrl.pathname.startsWith("/api/");

      if (isSameOriginApi) {
        // Vercel external rewrites can replace Host/X-Forwarded-Host with the
        // Railway hostname. Preserve the browser-facing CRM hostname explicitly
        // so the API never mistakes app.appvendorai.com for a tenant website.
        const headers = new Headers(requestInput instanceof Request ? requestInput.headers : undefined);
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        headers.set("X-Original-Host", window.location.hostname);
        requestInit = { ...init, headers };
      }
    } catch {
      // If URL resolution fails, keep the original request untouched.
    }

    const response = await originalFetch(requestInput, requestInit);
    if (
      response.status === 403 &&
      !window.location.pathname.startsWith("/onboarding") &&
      window.location.pathname !== "/trocar-senha"
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
