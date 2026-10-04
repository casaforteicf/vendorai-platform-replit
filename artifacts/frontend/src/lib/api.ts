import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

const OBRAS_GOV_ORIGIN = "https://api-publica.obrasgov.gestao.gov.br";
const OBRAS_GOV_PREFIX = "/obras/";
const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";

type BootstrapClaims = {
  sub?: unknown;
  tenantId?: unknown;
  platformRole?: unknown;
  email?: unknown;
  name?: unknown;
  exp?: unknown;
};

function decodeBootstrapClaims(token: string): BootstrapClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as BootstrapClaims;
  } catch {
    return null;
  }
}

/**
 * Reconstrói somente a identidade mínima a partir das claims do JWT antes do
 * primeiro render do React. Isso impede a rota protegida de ficar presa no
 * spinner quando existe um token válido, mas o cache local do usuário foi
 * perdido/invalidado durante uma publicação. A API continua sendo a autoridade:
 * /auth/me substitui esses dados assim que responder e um 401 encerra a sessão.
 */
function bootstrapAuthenticatedUserCache() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const claims = decodeBootstrapClaims(token);
    if (!claims) return;

    const { sub, tenantId, platformRole, email, name, exp } = claims;
    if (
      typeof sub !== "string" ||
      typeof tenantId !== "string" ||
      typeof platformRole !== "string" ||
      typeof email !== "string"
    ) {
      return;
    }

    if (typeof exp === "number" && exp * 1000 <= Date.now()) return;

    try {
      const currentRaw = localStorage.getItem(USER_CACHE_KEY);
      const current = currentRaw ? JSON.parse(currentRaw) : null;
      if (
        current?.id === sub &&
        current?.tenantId === tenantId &&
        current?.platformRole === platformRole &&
        current?.email === email
      ) {
        return;
      }
    } catch {
      // Cache quebrado será substituído pelas claims do token já assinado.
    }

    localStorage.setItem(
      USER_CACHE_KEY,
      JSON.stringify({
        id: sub,
        tenantId,
        platformRole,
        email,
        name: typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0],
      }),
    );
  } catch {
    // Recuperação de sessão é best-effort e nunca pode impedir o app de abrir.
  }
}

export function setupApiClient() {
  bootstrapAuthenticatedUserCache();

  const apiUrl = import.meta.env.VITE_API_URL;
  const isHomologationWeb =
    window.location.hostname === "homolog.appvendorai.com" ||
    /^vendorai-homolog-[a-z0-9-]+\.up\.railway\.app$/i.test(window.location.hostname);
  const isHostedProductionWeb =
    import.meta.env.PROD &&
    !isHomologationWeb &&
    (window.location.protocol === "http:" || window.location.protocol === "https:");

  // Produção web continua usando /api no mesmo domínio via Cloudflare.
  // Homologação usa VITE_API_URL para falar com a API isolada da Railway,
  // mantendo banco e backend completamente separados da produção.
  if (apiUrl && (!isHostedProductionWeb || isHomologationWeb)) {
    setBaseUrl(apiUrl);
  }

  setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));

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
      // origem que o Cloudflare Pages Worker encaminha server-side. Isso preserva
      // o Radar de Obras sem expor credenciais nem criar um módulo paralelo.
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
        // O Cloudflare Pages Worker encaminha /api para o Railway. Preserve o
        // hostname visto pelo navegador para a API nunca confundir o domínio
        // oficial app.appvendorai.com com um site de tenant.
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
      } catch {
        // ignore parse errors
      }
    }
    return response;
  };
}
