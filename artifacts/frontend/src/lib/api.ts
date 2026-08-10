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
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
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
