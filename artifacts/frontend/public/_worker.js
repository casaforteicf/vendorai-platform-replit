const RAILWAY_ORIGIN = "https://vendorai-platform-replit-production.up.railway.app";
const OBRASGOV_ORIGIN = "https://api-publica.obrasgov.gestao.gov.br";

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

async function serveSpaAsset(request, env) {
  const url = new URL(request.url);
  let response = await env.ASSETS.fetch(request);

  const acceptsHtml = request.method === "GET" && (request.headers.get("accept") || "").includes("text/html");
  if (response.status === 404 && acceptsHtml) {
    response = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
  }

  const result = new Response(response.body, response);
  const contentType = result.headers.get("content-type") || "";

  if (url.pathname.startsWith("/assets/")) {
    result.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    result.headers.set("X-Content-Type-Options", "nosniff");
  } else if (contentType.includes("text/html") || url.pathname === "/" || !url.pathname.includes(".")) {
    result.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
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
      return proxyRequest(request, target.toString(), {
        cacheControl: "private, no-store, max-age=0",
        preserveForwardedHost: true,
        redirect: "manual",
      });
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
