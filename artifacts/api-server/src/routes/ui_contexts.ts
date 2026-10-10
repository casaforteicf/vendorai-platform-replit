import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, tenantsTable, usersTable } from "@workspace/db";

/**
 * UI-01.4 — Read-only session-bound contexts.
 * Mounted AFTER authenticate + enforceAccessScope in routes/index.ts.
 * No tenantId or userId is accepted from query, body or route parameters.
 * The endpoint deliberately offers zero feature entitlements until the
 * backend's commercial licenses and permissions are mapped to experiences.
 */
const router: IRouter = Router();

router.get("/ui/contexts", async (req, res) => {
  const identity = req.user;
  if (!identity || identity.accessScope === "preprojeto" || identity.accessScope === "obra" ||
      identity.actorType === "ai" || identity.actorType === "system") {
    res.status(403).json({ error: "UI_CONTEXT_SCOPE_DENIED" });
    return;
  }
  if (!identity.sub || !identity.tenantId) {
    res.status(401).json({ error: "INVALID_SESSION_CONTEXT" });
    return;
  }

  try {
    const [member] = await db.select({
      userId: usersTable.id,
      tenantId: usersTable.tenantId,
      role: usersTable.role,
      platformRole: usersTable.platformRole,
      userFunction: usersTable.userFunction,
      active: usersTable.active,
      tenantName: tenantsTable.name,
    }).from(usersTable)
      .innerJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
      .where(and(eq(usersTable.id, identity.sub), eq(usersTable.tenantId, identity.tenantId)))
      .limit(1);

    if (!member?.active) {
      res.status(403).json({ error: "INACTIVE_OR_UNKNOWN_MEMBERSHIP" });
      return;
    }

    // This response is informational, not a grant. In particular a superadmin
    // override cannot become a second organization membership through this API.
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      currentContextId: `organization:${member.tenantId}`,
      contexts: [{
        id: `organization:${member.tenantId}`,
        kind: "organization",
        label: member.tenantName,
        tenantId: member.tenantId,
        roles: [member.platformRole === "tenant_admin" ? "tenant_admin" : member.userFunction === "vendedor" ? "sales" : "member"],
        enabledExperiences: [],
      }],
      capabilitiesStatus: "pending_backend_entitlement_mapping",
    });
  } catch {
    res.status(500).json({ error: "CONTEXT_LOOKUP_FAILED" });
  }
});

export default router;
