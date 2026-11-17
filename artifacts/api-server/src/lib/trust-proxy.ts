/**
 * Resolve o `trust proxy` do Express.
 *
 * `app.set("trust proxy", true)` faz o Express confiar em QUALQUER
 * X-Forwarded-For — o express-rate-limit bloqueia isso corretamente
 * (ERR_ERL_PERMISSIVE_TRUST_PROXY), porque qualquer cliente pode forjar o IP
 * e furar o rate limit por IP. Também era a origem do ValidationError no boot.
 *
 * Default: 1 hop (o proxy da plataforma: Railway/Cloudflare). Nunca
 * retornamos o boolean true.
 */
export type TrustProxySetting = boolean | number | string;

export function resolveTrustProxy(raw: string | undefined = process.env["TRUST_PROXY"]): TrustProxySetting {
  const value = String(raw ?? "").trim();
  if (!value) return 1;

  const normalized = value.toLowerCase();
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  // Mesmo que alguém configure "true", não devolvemos boolean true: um número
  // explícito de hops mantém o rate limit por IP seguro.
  if (["1", "true", "on", "yes"].includes(normalized)) return 1;

  const hops = Number(value);
  if (Number.isInteger(hops) && hops >= 0) return hops;

  // Lista de IPs/subnets aceita nativamente pelo Express (ex:
  // "loopback, linklocal, uniquelocal").
  return value;
}
