import type { RequestHandler } from "express";
import { verifyToken } from "../lib/jwt.js";

const TENANT_PATH = /(?:^|\/)tenants\/([^/]+)(?:\/|$)/;

/**
 * Defense-in-depth guard for every authenticated route carrying a tenant id
 * in the URL. Route handlers must still filter database queries by tenant.
 */
export const enforceTenantPath: RequestHandler = (req, res, next) => {
  const match = req.path.match(TENANT_PATH);
  if (!match) return next();

  const requestedTenantId = decodeURIComponent(match[1] ?? "");
  const authHeader = req.headers.authorization;

  // Public callbacks/webhooks must not use /tenants/:tenantId URLs.
  if (!authHeader?.startsWith("Bearer ")) return next();

  try {
    const user = verifyToken(authHeader.slice(7));
    if (user.platformRole !== "super_admin" && user.tenantId !== requestedTenantId) {
      return res.status(403).json({ error: "Access denied to this tenant" });
    }
    return next();
  } catch {
    // Authentication middleware will return the canonical 401 response.
    return next();
  }
};
