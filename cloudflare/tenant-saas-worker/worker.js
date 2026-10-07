const RAILWAY_ORIGIN = "https://api.appvendorai.com";

function upstreamRequest(request, env) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, RAILWAY_ORIGIN);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.set("x-tenant-custom-host", incoming.hostname.toLowerCase());
  headers.set("x-forwarded-host", incoming.hostname.toLowerCase());
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  headers.set("x-vendorai-edge-secret", env.TENANT_EDGE_PROXY_SECRET || "");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return new Request(target.toString(), init);
}

export default {
  async fetch(request, env) {
    if (!env.TENANT_EDGE_PROXY_SECRET) {
      return new Response("Tenant edge is not configured", { status: 503 });
    }

    const upstream = await fetch(upstreamRequest(request, env));
    const response = new Response(upstream.body, upstream);
    response.headers.set("x-vendorai-edge", "tenant-saas");
    return response;
  },
};
