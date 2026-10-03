import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

// Private administrator integration, not tenant login. Never send the administrator
// credential to the OAuth client. A deployment invalidates pending grants/refreshes.
const SCOPE = "vendorai:admin";
type Grant = { client: string; redirect: string; challenge: string; resource: string; scope: string; family: string; exp: number };
const codes = new Map<string, Grant>();
const refreshes = new Map<string, Grant>();
const usedRefreshes = new Map<string, Grant>();
const revokedFamilies = new Map<string, { exp: number }>();
const forms = new Map<string, { grant: Grant; state: string; exp: number }>();
const attempts = new Map<string, { count: number; exp: number }>();
const handoffs = new Map<string, { redirect: string; exp: number }>();
const now = () => Math.floor(Date.now() / 1000);
const nonce = () => randomBytes(32).toString("base64url");
// Stable across deploys/replicas as long as MCP_ACCESS_TOKEN is unchanged.
// Access tokens must not be invalidated just because the process restarted.
const instance = () => hash(`instance:${key()}`);
export const issuer = () => (process.env.MCP_PUBLIC_URL || "https://cloudflare-mcp-v2-production.up.railway.app").replace(/\/$/, "");
const resource = () => `${issuer()}/mcp`;
const key = () => process.env.MCP_ACCESS_TOKEN?.trim() || "";
const oauthKey = () => process.env.OAUTH_SIGNING_SECRET?.trim() || key();
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
const equal = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const sanePublicClientId = (value: string) => value.length >= 8 && value.length <= 12000 && /^[A-Za-z0-9._~-]+$/.test(value);
function chatGptMetadataClientId(value: string): boolean {
  try {
    const u = new URL(value);
    return u.origin === "https://chatgpt.com" && !u.username && !u.password && !u.hash && !u.search &&
      (u.pathname === "/oauth/client.json" || /^\/oauth\/[a-zA-Z0-9_-]+\/client\.json$/.test(u.pathname));
  } catch { return false; }
}
function chatGptMetadataRedirectAllowed(client: string, redirect: string): boolean {
  try {
    const c = new URL(client);
    const r = new URL(redirect);
    if (c.pathname === "/oauth/client.json") return r.pathname === "/connector_platform_oauth_redirect";
    const callbackId = c.pathname.match(/^\/oauth\/([a-zA-Z0-9_-]+)\/client\.json$/)?.[1];
    return Boolean(callbackId && r.pathname === `/connector/oauth/${callbackId}`);
  } catch { return false; }
}
function clientKind(client: string): "registered" | "chatgpt_cimd" | "legacy_public" | "invalid" {
  if (read(client)?.type === "client") return "registered";
  if (chatGptMetadataClientId(client)) return "chatgpt_cimd";
  if (sanePublicClientId(client)) return "legacy_public";
  return "invalid";
}
function sign(value: object): string {
  if (!oauthKey()) throw new Error("OAUTH_SIGNING_SECRET missing");
  const data = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${data}.${createHmac("sha256", oauthKey()).update(data).digest("base64url")}`;
}
function read(token: string): any {
  if (!oauthKey() || token.length > 12000) return null;
  const [data, signature, extra] = token.split(".");
  if (extra || !data || !signature || !equal(signature, createHmac("sha256", oauthKey()).update(data).digest("base64url"))) return null;
  try { return JSON.parse(Buffer.from(data, "base64url").toString()); } catch { return null; }
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Pragma": "no-cache" });
  res.end(JSON.stringify(value));
}
const htmlEscape = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const fail = (res: ServerResponse, error = "invalid_request", status = 400) => json(res, status, { error });
function prune() {
  for (const map of [codes, refreshes, usedRefreshes, revokedFamilies, forms, attempts, handoffs]) for (const [id, value] of map) if (value.exp < now()) map.delete(id);
}
function allowedRedirect(value: string): boolean {
  try {
    const u = new URL(value);
    return u.origin === "https://chatgpt.com" && !u.username && !u.password && !u.hash && !u.search &&
      (u.pathname === "/connector_platform_oauth_redirect" || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(u.pathname));
  } catch { return false; }
}
async function body(req: IncomingMessage): Promise<string> {
  let result = "";
  for await (const chunk of req) {
    result += chunk.toString();
    if (Buffer.byteLength(result) > 16000) throw new Error("body too large");
  }
  return result;
}
function issue(res: ServerResponse, grant: Grant) {
  // Self-contained signed refresh token survives deploys/restarts and avoids forcing
  // ChatGPT to reconnect when Railway replaces the process. Access remains short-lived.
  const refreshExp = now() + 365 * 86400;
  const refresh = sign({ type: "refresh", iss: issuer(), aud: grant.resource, scope: grant.scope, client: grant.client, family: grant.family, instance: instance(), exp: refreshExp, jti: nonce() });
  refreshes.set(hash(refresh), { ...grant, exp: refreshExp });
  json(res, 200, {
    access_token: sign({ type: "access", iss: issuer(), aud: grant.resource, scope: grant.scope, sub: "administrator", family: grant.family, instance: instance(), exp: now() + 3600, jti: nonce() }),
    token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope: grant.scope,
  });
}
export function authorized(req: IncomingMessage): boolean {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token || !key()) return false;
  if (equal(token, key())) return true; // Existing private integrations remain valid.
  const claims = read(token);
  return claims?.type === "access" && claims.iss === issuer() && claims.aud === resource() && claims.scope === SCOPE && claims.instance === instance() && claims.exp > now() && !revokedFamilies.has(claims.family);
}
export function challenge(): string {
  return `Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`;
}
export async function handleOAuth(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const path = url.pathname;
  if (!path.startsWith("/oauth/") && !path.startsWith("/.well-known/")) return false;
  prune();
  try {
    if (req.method === "GET" && ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"].includes(path)) {
      json(res, 200, { resource: resource(), authorization_servers: [issuer()], scopes_supported: [SCOPE], bearer_methods_supported: ["header"] });
    } else if (req.method === "GET" && path === "/.well-known/oauth-authorization-server") {
      json(res, 200, { issuer: issuer(), authorization_endpoint: `${issuer()}/oauth/authorize`, token_endpoint: `${issuer()}/oauth/token`, registration_endpoint: `${issuer()}/oauth/register`, revocation_endpoint: `${issuer()}/oauth/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], scopes_supported: [SCOPE], authorization_response_iss_parameter_supported: true, client_id_metadata_document_supported: true });
    } else if (req.method === "POST" && path === "/oauth/register") {
      if (!req.headers["content-type"]?.startsWith("application/json")) { fail(res); return true; }
      const input = JSON.parse(await body(req));
      const redirects = input.redirect_uris;
      if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 5 || !redirects.every(x => typeof x === "string" && allowedRedirect(x)) ||
          (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none")) { fail(res, "invalid_client_metadata"); return true; }
      const client = sign({ type: "client", redirects, id: nonce() });
      json(res, 201, { client_id: client, client_id_issued_at: now(), redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
    } else if (req.method === "GET" && path === "/oauth/authorize") {
      const p = url.searchParams;
      const client = p.get("client_id") || "";
      const metadata = read(client);
      const kind = clientKind(client);
      const legacyPublicClient = kind === "legacy_public";
      const cimdClient = kind === "chatgpt_cimd";
      const redirect = p.get("redirect_uri") || "";
      const aud = p.get("resource");
      const scope = p.get("scope") || SCOPE;
      const invalidReason =
        kind === "invalid" ? "invalid_client" :
        (kind === "registered" && !metadata.redirects?.includes(redirect)) ? "redirect_not_registered" :
        (cimdClient && !chatGptMetadataRedirectAllowed(client, redirect)) ? "redirect_not_registered" :
        !allowedRedirect(redirect) ? "redirect_not_allowed" :
        p.get("response_type") !== "code" ? "unsupported_response_type" :
        p.get("code_challenge_method") !== "S256" ? "pkce_method_required" :
        !/^[A-Za-z0-9_-]{43}$/.test(p.get("code_challenge") || "") ? "invalid_code_challenge" :
        (aud && aud !== resource()) ? "invalid_resource" :
        scope !== SCOPE ? "invalid_scope" :
        null;
      if (invalidReason) {
        console.warn("[oauth] authorize rejected", { reason: invalidReason, hasClient: Boolean(client), hasRedirect: Boolean(redirect), hasResource: Boolean(aud), scope });
        json(res, 400, { error: "invalid_request", error_description: "A autorização não pôde ser iniciada. Reabra a conexão no ChatGPT.", reason: invalidReason });
        return true;
      }
      if (forms.size >= 1000) { fail(res, "temporarily_unavailable", 503); return true; }
      const callbackPath = (() => { try { return new URL(redirect).pathname; } catch { return "invalid"; } })();
      console.info("[oauth] authorize accepted", { callbackPath, callbackKind: callbackPath === "/connector_platform_oauth_redirect" ? "stable" : callbackPath.startsWith("/connector/oauth/") ? "specific" : "other", clientKind: kind });
      const pending = { grant: { client, redirect, challenge: p.get("code_challenge")!, resource: resource(), scope, family: nonce(), exp: now() + 600 }, state: p.get("state") || "", exp: now() + 600 };
      // Signed self-contained consent survives process restarts and multiple replicas.
      const csrf = sign({ type: "consent", pending });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; form-action 'self' https://chatgpt.com; frame-ancestors 'none'; base-uri 'none'" });
      res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Autorizar Vendor.ai</title><body><h1>Conectar Vendor.ai ao ChatGPT</h1><p>Esta integração administrativa permite consultar e alterar Cloudflare e executar missões no navegador do Vendor.ai. Autorize somente na sua conta.</p><form method="post" action="/oauth/approve"><input type="hidden" name="csrf" value="${csrf}"><label>Chave privada MCP do administrador <input type="password" name="credential" autocomplete="off" required></label><p>Use o valor de MCP_ACCESS_TOKEN do serviço cloudflare-mcp-v2 no Railway. A chave fica neste servidor e não é enviada ao ChatGPT.</p><button name="decision" value="approve">Autorizar acesso administrativo</button><button name="decision" value="deny" formnovalidate>Cancelar</button></form></body></html>`);
    } else if (req.method === "GET" && path === "/oauth/complete") {
      const id = url.searchParams.get("h") || "";
      const handoff = handoffs.get(id);
      if (!handoff || handoff.exp < now()) { fail(res, "invalid_request", 400); return true; }
      const target = htmlEscape(handoff.redirect);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      });
      res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Retornar ao ChatGPT</title><style>body{font-family:system-ui,sans-serif;padding:32px;line-height:1.45}a{display:inline-block;padding:12px 16px;border:1px solid #111;border-radius:8px;text-decoration:none;color:#111}</style></head><body><h1>Autorização concluída</h1><p>Se o ChatGPT não abrir automaticamente, toque no botão abaixo.</p><p><a href="${target}">Continuar no ChatGPT</a></p></body></html>`);
    } else if (req.method === "POST" && path === "/oauth/approve") {
      if (req.headers.origin !== issuer()) { json(res, 400, { error: "invalid_request", error_description: "Origem inválida. Abra uma nova autorização pelo ChatGPT.", reason: "invalid_origin" }); return true; }
      if (!req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")) { fail(res); return true; }
      const p = new URLSearchParams(await body(req));
      const csrf = p.get("csrf") || "";
      const consent = read(csrf);
      const pending = consent?.type === "consent" ? consent.pending as { grant: Grant; state: string; exp: number } : undefined;
      if (!pending || pending.exp < now()) { json(res, 400, { error: "invalid_request", error_description: "Autorização expirada. Abra uma nova autorização pelo ChatGPT.", reason: "expired_consent" }); return true; }
      const redirect = new URL(pending.grant.redirect);
      redirect.searchParams.set("state", pending.state);
      redirect.searchParams.set("iss", issuer());
      if (p.get("decision") === "deny") redirect.searchParams.set("error", "access_denied");
      else {
        // Count by direct network peer, never by an untrusted forwarded header.
        const ip = req.socket.remoteAddress || "unknown";
        const attempt = attempts.get(ip) || { count: 0, exp: now() + 900 };
        attempt.count++; attempts.set(ip, attempt);
        if (attempt.count > 10 || !key() || !equal(p.get("credential") || "", key()) || p.get("decision") !== "approve") { fail(res, "access_denied", 403); return true; }
        if (codes.size >= 1000 || refreshes.size >= 1000) { fail(res, "temporarily_unavailable", 503); return true; }
        const code = nonce();
        codes.set(hash(code), { ...pending.grant, exp: now() + 600 });
        redirect.searchParams.set("code", code);
      }
      console.info("[oauth] approve redirect", { callbackPath: redirect.pathname, callbackKind: redirect.pathname === "/connector_platform_oauth_redirect" ? "stable" : redirect.pathname.startsWith("/connector/oauth/") ? "specific" : "other", hasCode: redirect.searchParams.has("code"), hasState: redirect.searchParams.has("state"), hasIss: redirect.searchParams.has("iss") });
      const handoffId = nonce();
      handoffs.set(handoffId, { redirect: redirect.toString(), exp: now() + 120 });
      const complete = new URL(`${issuer()}/oauth/complete`);
      complete.searchParams.set("h", handoffId);
      for (const [name, value] of redirect.searchParams) complete.searchParams.set(name, value);
      res.writeHead(303, { Location: complete.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }); res.end();

    } else if (req.method === "POST" && path === "/oauth/token") {
      console.info("[oauth] token endpoint reached");
      if (!req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")) { fail(res); return true; }
      const p = new URLSearchParams(await body(req));
      const client = p.get("client_id") || "";
      const tokenClientKind = clientKind(client);
      if (tokenClientKind === "invalid") {
        console.warn("[oauth] token rejected", { reason: "invalid_client", hasClient: Boolean(client) });
        fail(res, "invalid_client", 401); return true;
      }
      const kind = p.get("grant_type");
      if (kind !== "authorization_code" && kind !== "refresh_token") { fail(res, "unsupported_grant_type"); return true; }
      const raw = p.get(kind === "authorization_code" ? "code" : "refresh_token") || "";
      let grant: Grant | undefined;
      if (kind === "authorization_code") {
        const id = hash(raw);
        grant = codes.get(id);
        const verifier = p.get("code_verifier") || "";
        const rejectReason =
          !grant ? "code_not_found" :
          grant.exp < now() ? "code_expired" :
          grant.client !== client ? "client_mismatch" :
          (p.get("resource") && p.get("resource") !== grant.resource) ? "resource_mismatch" :
          (p.get("scope") && p.get("scope") !== grant.scope) ? "scope_mismatch" :
          p.get("redirect_uri") !== grant.redirect ? "redirect_mismatch" :
          !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ? "invalid_verifier_format" :
          !equal(hash(verifier), grant.challenge) ? "pkce_mismatch" :
          null;
        if (rejectReason) {
          console.warn("[oauth] token rejected", { reason: rejectReason, clientKind: tokenClientKind, grantType: kind });
          fail(res, "invalid_grant"); return true;
        }
        codes.delete(id);
      } else {
        const id = hash(raw);
        const reused = usedRefreshes.get(id);
        if (reused) {
          revokedFamilies.set(reused.family, { exp: now() + 365 * 86400 });
          fail(res, "invalid_grant"); return true;
        }
        const claims = read(raw);
        if (claims?.type !== "refresh" || claims.iss !== issuer() || claims.instance !== instance() || claims.client !== client || claims.exp <= now() ||
            revokedFamilies.has(claims.family) || (p.get("resource") && p.get("resource") !== claims.aud) || (p.get("scope") && p.get("scope") !== claims.scope)) { fail(res, "invalid_grant"); return true; }
        grant = { client: claims.client, redirect: "", challenge: "", resource: claims.aud, scope: claims.scope, family: claims.family, exp: claims.exp };
        usedRefreshes.set(id, grant);
        refreshes.delete(id);
      }
      if (!grant) { fail(res, "invalid_grant"); return true; }
      issue(res, grant);
    } else if (req.method === "POST" && path === "/oauth/revoke") {
      const p = new URLSearchParams(await body(req));
      const raw = p.get("token") || "";
      const id = hash(raw);
      const grant = refreshes.get(id);
      const claims = read(raw);
      const family = grant?.client === p.get("client_id") ? grant.family :
        (claims?.type === "refresh" && claims.client === p.get("client_id") ? claims.family : undefined);
      if (family) {
        revokedFamilies.set(family, { exp: now() + 365 * 86400 });
        refreshes.delete(id);
      }
      json(res, 200, {});
    } else fail(res, "not_found", 404);
  } catch { if (!res.headersSent) fail(res); else res.end(); }
  return true;
}
