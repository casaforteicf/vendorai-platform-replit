/** Validate homologation token response before using it in the Browser Agent. */
export function validateHomologExchange(value: unknown, tenantId: string): {
 token: string; userCache: Record<string, unknown>;
} {
 if (!value || typeof value !== "object" || Array.isArray(value)) {
  throw new Error("VENDI_HOMOLOG_AUTH_EXCHANGE_INVALID_RESPONSE");
 }
 const payload=value as Record<string, unknown>;
 const userCache=payload.userCache;
 if (typeof payload.token !== "string" || !payload.token.trim() || payload.token.length > 8192 ||
     !userCache || typeof userCache !== "object" || Array.isArray(userCache)) {
  throw new Error("VENDI_HOMOLOG_AUTH_EXCHANGE_INVALID_RESPONSE");
 }
 if (typeof tenantId !== "string" || !tenantId.trim() || payload.tenantId !== tenantId || (userCache as Record<string,unknown>).tenantId !== tenantId) {
  throw new Error("VENDI_HOMOLOG_AUTH_EXCHANGE_TENANT_MISMATCH");
 }
 return {token:payload.token,userCache:userCache as Record<string,unknown>};
}
