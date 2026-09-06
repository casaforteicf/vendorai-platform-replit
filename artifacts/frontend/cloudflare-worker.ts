export interface Env {
  ASSETS: Fetcher;
  API_ORIGIN: string;
}

const OBRAS_ORIGIN = "https://api-publica.obrasgov.gestao.gov.br";

function copyRequest(request: Request, target: URL): Request {
  const headers = new Headers(request.headers);
  headers.set("X-Original-Host", new URL(request.url).host);
  headers.delete("host");

  return new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "vendorai-cloudflare-frontend" });
    }

    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname + url.search, env.API_ORIGIN.replace(/\/$/, "") + "/");
      return fetch(copyRequest(request, target));
    }

    if (url.pathname.startsWith("/obrasgov/")) {
      const suffix = url.pathname.slice("/obrasgov".length);
      const target = new URL(`/obras${suffix}${url.search}`, OBRAS_ORIGIN);
      return fetch(copyRequest(request, target));
    }

    return env.ASSETS.fetch(request);
  },
};
