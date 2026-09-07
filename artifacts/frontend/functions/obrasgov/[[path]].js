const OBRASGOV_ORIGIN = "https://api-publica.obrasgov.gestao.gov.br";

export async function onRequest({ request, params }) {
  const incomingUrl = new URL(request.url);
  const pathParts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const target = new URL(`/obras/${pathParts.join("/")}`, OBRASGOV_ORIGIN);
  target.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");

  const upstream = await fetch(new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
  }));

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Cache-Control", "private, max-age=60");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
