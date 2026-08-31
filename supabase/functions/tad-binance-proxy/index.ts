import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BINANCE_ORIGIN = "https://fapi.binance.com";
const ALLOWED_PREFIXES = ["/fapi/", "/futures/data/"];

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }
  const requestUrl = new URL(req.url);
  const upstream = requestUrl.searchParams.get("url") ?? "";
  if (!ALLOWED_PREFIXES.some((prefix) => upstream.startsWith(prefix))) {
    return new Response(JSON.stringify({ error: "UPSTREAM_NOT_ALLOWED" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  let target: URL;
  try { target = new URL(upstream, BINANCE_ORIGIN); }
  catch {
    return new Response(JSON.stringify({ error: "INVALID_UPSTREAM" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  if (target.origin !== BINANCE_ORIGIN) {
    return new Response(JSON.stringify({ error: "UPSTREAM_NOT_ALLOWED" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": "TAD-VendorAI/0.17" },
      redirect: "error",
    });
    const headers = new Headers();
    headers.set("content-type", response.headers.get("content-type") ?? "application/json");
    headers.set("cache-control", "no-store");
    headers.set("x-tad-proxy-region", Deno.env.get("SB_REGION") ?? "unknown");
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return new Response(JSON.stringify({
      error: "BINANCE_PROXY_UNAVAILABLE",
      detail: error instanceof Error ? error.message : "unknown"
    }), {
      status: 502,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-tad-proxy-region": Deno.env.get("SB_REGION") ?? "unknown"
      },
    });
  }
});
