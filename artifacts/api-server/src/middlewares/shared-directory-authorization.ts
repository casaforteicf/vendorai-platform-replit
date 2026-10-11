import type { RequestHandler } from "express";

/**
 * The VEP and ecosystem directories are shared platform records without tenant
 * ownership. Tenant sessions may browse them but must not mutate another
 * company's shared record. Tenant-owned partnerships use their scoped routes.
 *
 * Exception: a tenant's own social actions (e.g. POST .../:id/follow) do not
 * mutate the shared directory record, so they are allowed for authenticated
 * tenants. (Follow-origin ownership is a pre-existing concern handled in the
 * follow handler, not by this directory guard.)
 */
function isTenantSocialAction(req: { method: string; originalUrl?: string; url?: string }): boolean {
  if (req.method !== "POST") return false;
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
  return path.endsWith("/follow");
}

export const authorizeSharedDirectory: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" ||
      req.user.platformRole === "super_admin" || isTenantSocialAction(req)) {
    next();
    return;
  }
  res.status(403).json({ error: "Shared directory changes require Super Admin" });
};
