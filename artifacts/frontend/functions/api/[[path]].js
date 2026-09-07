const RAILWAY_ORIGIN = "https://vendorai-platform-replit-production.up.railway.app";

export async function onRequest({ request, params }) {
  const incomingUrl = new URL(request.url);
  const pathParts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const target = new URL(`/api/${pathParts.join("/")}`, RAILWAY_ORIGIN);
  target.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));
  headers.delete("host");

  const upstream = await fetch(new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  }));

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Cache-Control", "private, no-store, max-age=0");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
