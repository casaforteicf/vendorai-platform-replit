const RAILWAY_ORIGIN = "https://vendorai-platform-replit-production.up.railway.app";

async function proxyApi(request) {
  const incomingUrl = new URL(request.url);
  const target = new URL(incomingUrl.pathname + incomingUrl.search, RAILWAY_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(new Request(target.toString(), init));
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function serveWebsite(request, env) {
  const url = new URL(request.url);
  let response = await env.ASSETS.fetch(request);
  const acceptsHtml = request.method === "GET" && (request.headers.get("accept") || "").includes("text/html");

  if (response.status === 404 && acceptsHtml) {
    response = await env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
  }

  const result = new Response(response.body, response);
  const contentType = (result.headers.get("content-type") || "").toLowerCase();

  if (url.pathname.startsWith("/assets/")) {
    result.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (contentType.includes("text/html") || url.pathname === "/" || !url.pathname.includes(".")) {
    result.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  }

  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyApi(request);
    }

    return serveWebsite(request, env);
  },
};
