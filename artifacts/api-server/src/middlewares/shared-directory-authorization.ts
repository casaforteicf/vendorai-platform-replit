import type { RequestHandler } from "express";

/**
 * The VPN and ecosystem directories are shared platform records without tenant
 * ownership. Tenant sessions may browse them but must not mutate another
 * company's shared record. Tenant-owned partnerships use their scoped routes.
 */
export const authorizeSharedDirectory: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS" ||
      req.user.platformRole === "super_admin") {
    next();
    return;
  }
  res.status(403).json({ error: "Shared directory changes require Super Admin" });
};
