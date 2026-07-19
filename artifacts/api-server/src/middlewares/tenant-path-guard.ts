import type { Request, RequestHandler } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";

const TENANT_PATH = /(?:^|\/)tenants\/([^/]+)(?:\/|$)/;
const TENANT_KEYS = new Set(["tenantId", "tenant_id"]);
const MAX_NESTING_DEPTH = 5;

export interface TenantScopeReference {
  source: string;
  value: string;
}

function normalizeTenantValues(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeTenantValues);
  }

  return [];
}

function collectObjectTenantScopes(
  value: unknown,
  source: string,
  references: TenantScopeReference[],
  seen: WeakSet<object>,
  depth = 0,
): void {
  if (depth > MAX_NESTING_DEPTH || value === null || typeof value !== "object") {
    return;
  }

  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectObjectTenantScopes(item, `${source}[${index}]`, references, seen, depth + 1),
    );
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childSource = `${source}.${key}`;

    if (TENANT_KEYS.has(key)) {
      for (const tenantId of normalizeTenantValues(child)) {
        references.push({ source: childSource, value: tenantId });
      }
      continue;
    }

    collectObjectTenantScopes(child, childSource, references, seen, depth + 1);
  }
}

function decodePathTenant(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/**
 * Collects every explicit tenant scope supplied by the request.
 *
 * This includes URL paths, query/body tenant keys, the x-tenant-id header and
 * a tenant resolved from a subdomain/custom domain. Route handlers must still
 * filter every database query by the authenticated tenant.
 */
export function collectTenantScopes(req: Request): TenantScopeReference[] {
  const references: TenantScopeReference[] = [];
  const pathMatch = req.path.match(TENANT_PATH);

  if (pathMatch?.[1]) {
    const tenantId = decodePathTenant(pathMatch[1]);
    if (tenantId) references.push({ source: "path", value: tenantId });
  }

  collectObjectTenantScopes(req.params, "params", references, new WeakSet());
  collectObjectTenantScopes(req.query, "query", references, new WeakSet());
  collectObjectTenantScopes(req.body, "body", references, new WeakSet());

  const tenantHeader = req.headers["x-tenant-id"];
  for (const tenantId of normalizeTenantValues(tenantHeader)) {
    references.push({ source: "header.x-tenant-id", value: tenantId });
  }

  if (req.tenantId?.trim()) {
    references.push({ source: "resolved-domain", value: req.tenantId.trim() });
  }

  const unique = new Map<string, TenantScopeReference>();
  for (const reference of references) {
    unique.set(`${reference.source}:${reference.value}`, reference);
  }

  return [...unique.values()];
}

function resolveAuthenticatedUser(req: Request): JwtPayload | undefined {
  if (req.user) return req.user;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return undefined;

  try {
    return verifyToken(authHeader.slice(7));
  } catch {
    // The authentication middleware returns the canonical 401 response.
    return undefined;
  }
}

/**
 * Defense-in-depth guard for authenticated requests carrying tenant scope in
 * the path, query string, request body, header, subdomain or custom domain.
 */
export const enforceTenantPath: RequestHandler = (req, res, next) => {
  const requestedScopes = collectTenantScopes(req);
  if (requestedScopes.length === 0) return next();

  const user = resolveAuthenticatedUser(req);
  if (!user) return next();
  if (user.platformRole === "super_admin") return next();

  const authenticatedTenantId = user.tenantId?.trim();
  const hasMismatch =
    !authenticatedTenantId ||
    requestedScopes.some((scope) => scope.value !== authenticatedTenantId);

  if (hasMismatch) {
    return res.status(403).json({
      error: "Access denied to this tenant",
      code: "TENANT_SCOPE_MISMATCH",
    });
  }

  return next();
};
