import { setAuthTokenGetter } from "@workspace/api-client-react";

export function setupApiClient() {
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
