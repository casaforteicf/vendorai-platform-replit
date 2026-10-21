import type { JwtPayload } from "../lib/jwt.js";

/** Pilot policy — deny all non-human, delegated or non-admin actors. */
export function canUseVendiStudio(user: JwtPayload | undefined, enabled: boolean): boolean {
  if (!user || !enabled || !user.tenantId || !user.sub) return false;
  if (user.accessScope && user.accessScope !== "tenant") return false;
  if (user.actorType && user.actorType !== "human") return false;
  return user.platformRole === "super_admin" || user.platformRole === "tenant_admin";
}
