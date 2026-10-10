/** Request policy for credential-bearing homologation verification. */
export function homologUpstreamRequest(token: string): RequestInit {
  if (typeof token !== "string" || !token.trim()) throw new Error("UPSTREAM_TOKEN_MISSING");
  return {
    headers: { authorization: `Bearer ${token}` },
    redirect: "manual",
    signal: AbortSignal.timeout(8_000),
  };
}
