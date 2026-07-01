/**
 * Cloudflare Worker — Subdomain Proxy para VendorAI
 *
 * Rota: *.appvendorai.com  →  vendorai.replit.app
 *
 * Como fazer deploy:
 *  1. Acesse https://dash.cloudflare.com → Workers & Pages → Create application → Worker
 *  2. Cole este código no editor
 *  3. Em Settings → Triggers → Custom Domains, adicione: *.appvendorai.com
 *  4. Certifique-se que appvendorai.com usa Cloudflare como nameserver (proxy ativo)
 *  5. Deploy
 */

const UPSTREAM = "https://vendorai.replit.app";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname; // ex: wolmann-design.appvendorai.com

    // Extrai o subdomínio: "wolmann-design.appvendorai.com" → "wolmann-design"
    const ROOT = "appvendorai.com";
    let subdomain = "";
    if (hostname.endsWith("." + ROOT)) {
      subdomain = hostname.slice(0, hostname.length - ROOT.length - 1);
    }

    // Monta a URL de destino mantendo path + query originais
    const targetUrl = UPSTREAM + url.pathname + url.search;

    // Clona os headers da requisição original
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", hostname);
    headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");

    if (subdomain) {
      headers.set("X-Tenant-Subdomain", subdomain);
    }

    // Remove o header Host para não conflitar com o upstream
    headers.delete("host");

    const upstreamRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(upstreamRequest);

      // Clona a resposta e ajusta headers de CORS se necessário
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("X-Proxied-By", "vendorai-cf-worker");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy error", detail: String(err) }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
