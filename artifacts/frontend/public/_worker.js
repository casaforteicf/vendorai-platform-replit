const RAILWAY_ORIGIN = "https://api.appvendorai.com";
const OBRASGOV_ORIGIN = "https://api-publica.obrasgov.gestao.gov.br";
// Production fallback marker: Cloudflare Pages/Railway deployer 2026-09-28 build-fix-v4.

function pathAfterPrefix(pathname, prefix) {
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
}

async function proxyRequest(request, targetUrl, { cacheControl, preserveForwardedHost = false, stripBrowserOrigin = false, redirect = "manual" } = {}) {
  const incomingUrl = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");

  if (preserveForwardedHost) {
    headers.set("x-forwarded-host", incomingUrl.host);
    headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));
  }

  if (stripBrowserOrigin) {
    headers.delete("origin");
    headers.delete("referer");
  }

  const init = {
    method: request.method,
    headers,
    redirect,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(new Request(targetUrl, init));
  const response = new Response(upstream.body, upstream);
  if (cacheControl) response.headers.set("Cache-Control", cacheControl);
  return response;
}

function perceptionText(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(perceptionText).filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (typeof value === "object") {
    const preferredKeys = [
      "summary",
      "resumo",
      "reason",
      "motivo",
      "signal",
      "sinal",
      "sinal_observado",
      "description",
      "descricao",
      "context",
      "contexto",
      "opportunity",
      "oportunidade",
    ];
    for (const key of preferredKeys) {
      const text = perceptionText(value[key]);
      if (text) return text;
    }
    const parts = Object.values(value).map(perceptionText).filter(Boolean);
    return parts.length ? parts.slice(0, 3).join(" · ") : null;
  }
  return null;
}

function normalizeScoutOpportunities(payload) {
  if (!Array.isArray(payload)) return payload;
  return payload.map((item) => {
    if (!item || typeof item !== "object" || item.percepcao == null || typeof item.percepcao === "string") return item;
    return {
      ...item,
      percepcaoEstruturada: item.percepcao,
      percepcao: perceptionText(item.percepcao) || "Sinal encontrado no histórico e contexto do cliente.",
    };
  });
}

async function normalizeScoutOpportunityResponse(response) {
  if (!response.ok) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;

  try {
    const payload = await response.clone().json();
    const normalized = normalizeScoutOpportunities(payload);
    if (normalized === payload) return response;

    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.delete("content-length");
    headers.set("Cache-Control", "private, no-store, max-age=0");
    return new Response(JSON.stringify(normalized), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}

function missingAssetResponse() {
  return new Response("Asset not found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function serveSpaAsset(request, env) {
  const url = new URL(request.url);
  let response = await env.ASSETS.fetch(request);
  const isAssetRequest = url.pathname.startsWith("/assets/");
  const upstreamContentType = (response.headers.get("content-type") || "").toLowerCase();

  // Em Pages/ASSETS, dependendo do fallback configurado, um asset inexistente
  // pode voltar como index.html com status 200. Para módulos ES isso produz o
  // erro de MIME text/html. Trate tanto 404 quanto HTML em /assets/* como miss.
  if (isAssetRequest && (!response.ok || upstreamContentType.includes("text/html"))) {
    return missingAssetResponse();
  }

  const acceptsHtml = request.method === "GET" && (request.headers.get("accept") || "").includes("text/html");
  if (response.status === 404 && acceptsHtml) {
    response = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
  }

  const result = new Response(response.body, response);
  const contentType = (result.headers.get("content-type") || "").toLowerCase();

  if (isAssetRequest) {
    result.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    result.headers.set("X-Content-Type-Options", "nosniff");
  } else if (contentType.includes("text/html") || url.pathname === "/" || !url.pathname.includes(".")) {
    result.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");

    // O guard do frontend usa esse parâmetro apenas quando detecta bundle
    // obsoleto. Nessa resposta pedimos ao Chrome para descartar também o cache
    // HTTP, que JavaScript não consegue limpar via Cache Storage.
    if (url.searchParams.has("__vendorai_refresh")) {
      result.headers.set("Clear-Site-Data", '"cache"');
    }
  }

  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const suffix = pathAfterPrefix(url.pathname, "/api/");
      const target = new URL(`/api/${suffix}`, RAILWAY_ORIGIN);
      target.search = url.search;
      const response = await proxyRequest(request, target.toString(), {
        cacheControl: "private, no-store, max-age=0",
        preserveForwardedHost: true,
        redirect: "manual",
      });

      if (
        request.method === "GET" &&
        /^\/api\/tenants\/[^/]+\/scout\/oportunidades\/?$/.test(url.pathname)
      ) {
        return normalizeScoutOpportunityResponse(response);
      }

      return response;
    }

    if (url.pathname.startsWith("/obrasgov/")) {
      const suffix = pathAfterPrefix(url.pathname, "/obrasgov/");
      const target = new URL(`/obras/${suffix}`, OBRASGOV_ORIGIN);
      target.search = url.search;
      return proxyRequest(request, target.toString(), {
        cacheControl: "private, max-age=60",
        stripBrowserOrigin: true,
        redirect: "follow",
      });
    }

    if (url.pathname === "/content-studio/video/avatar" && url.searchParams.get("capture") === "mobile") {
      return Response.redirect(new URL("/content-studio/video/avatar/captura", url.origin).toString(), 302);
    }

    return serveSpaAsset(request, env);
  },
};
