export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const prefix = "/obrasgov";
  const suffix = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
  const target = new URL(`https://api-publica.obrasgov.gestao.gov.br/obras${suffix}${url.search}`);

  const init = {
    method: request.method,
    headers: request.headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(new Request(target.toString(), init));
}
