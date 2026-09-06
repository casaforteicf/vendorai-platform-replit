export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = (env.API_ORIGIN || "https://vendorai-platform-replit-production.up.railway.app").replace(/\/$/, "");
  const target = new URL(`${origin}${url.pathname}${url.search}`);

  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(new Request(target.toString(), init));
}
